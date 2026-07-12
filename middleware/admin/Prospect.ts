import validator from "validator";
import { db, admin } from "../../database/firebase.ts";
import type { FirestoreRecord } from "../Music.ts";
import {
  prospectTransporter,
  mailOptions,
  PROSPECT_FROM,
} from "../../services/mailer.ts";
import { ProspectTemplates, type TemplateKey } from "./ProspectTemplates.ts";

// Étapes de la séquence de relance (jours après l'envoi initial J0).
// step = prochaine étape à envoyer pour un contact actif.
// Le sujet et le corps de chaque email sont éditables depuis l'admin
// (voir ProspectTemplates).
const SEQUENCE_STEPS: ReadonlyArray<{ step: number; afterDays: number; template: TemplateKey; label: string }> = [
  { step: 2, afterDays: 10, template: "relance-1", label: "1er rappel (J+10)" },
  { step: 3, afterDays: 30, template: "relance-2", label: "2e rappel (J+30)" },
  { step: 4, afterDays: 60, template: "relance-3", label: "3e rappel (J+60)" },
];

const CLOSE_AFTER_DAYS = 90;

export interface ProspectInput {
  nom?: string;
  prenom?: string;
  email?: string;
  societe?: string;
  id_song?: string;
  lien_musique?: string;
  titre_chanson?: string;
  notes?: string;
}

export class Prospect {
  private prospectRef = db.collection("contacts");
  private templates = new ProspectTemplates();

  async listProspects(): Promise<FirestoreRecord[]> {
    const snapshot = await this.prospectRef.orderBy("createdAt", "desc").get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }

  async createProspect(data: ProspectInput): Promise<FirestoreRecord> {
    if (!data.email || !validator.isEmail(String(data.email))) throw new Error("INVALID_EMAIL");
    if (!data.nom && !data.prenom) throw new Error("INVALID_NAME");

    const docRef = this.prospectRef.doc();
    await docRef.set({
      nom: data.nom ?? "",
      prenom: data.prenom ?? "",
      email: data.email,
      societe: data.societe ?? "",
      id_song: data.id_song ?? "",
      lien_musique: data.lien_musique ?? "",
      titre_chanson: data.titre_chanson ?? "",
      notes: data.notes ?? "",
      sequenceStatus: "draft",
      currentStep: 0,
      presentationSentAt: null,
      history: [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    const snapshot = await docRef.get();
    return { id: snapshot.id, ...snapshot.data() };
  }

  async updateProspect(data: ProspectInput & { id?: string }): Promise<void> {
    if (!data.id) throw new Error("INVALID_PARAMS");
    if (data.email && !validator.isEmail(String(data.email))) throw new Error("INVALID_EMAIL");
    const { id, ...fields } = data;
    await this.prospectRef.doc(id).update({
      ...fields,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  async deleteProspect(id: string): Promise<void> {
    await this.prospectRef.doc(id).delete();
  }

  // J0 : envoi de l'email de présentation, démarre la séquence de relances.
  async sendPresentation(id: string): Promise<void> {
    const snapshot = await this.prospectRef.doc(id).get();
    if (!snapshot.exists) throw new Error("NOT_FOUND");
    const prospect = { id: snapshot.id, ...snapshot.data() } as FirestoreRecord;

    if (prospect.sequenceStatus !== "draft") throw new Error("ALREADY_SENT");

    await this.sendProspectEmail(prospect, "presentation");

    await this.prospectRef.doc(id).update({
      sequenceStatus: "active",
      currentStep: 1,
      presentationSentAt: admin.firestore.FieldValue.serverTimestamp(),
      history: admin.firestore.FieldValue.arrayUnion({
        step: 1,
        label: "Envoi initial (J0)",
        sentAt: admin.firestore.Timestamp.now(),
        ok: true,
      }),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  // L'éditeur a répondu : la séquence s'arrête.
  async markReplied(id: string): Promise<void> {
    const snapshot = await this.prospectRef.doc(id).get();
    if (!snapshot.exists) throw new Error("NOT_FOUND");
    await this.prospectRef.doc(id).update({
      sequenceStatus: "replied",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  // Job quotidien (et endpoint manuel) : envoie les relances dues.
  // Idempotent par construction : une relance n'est envoyée que si le seuil de
  // jours est atteint ET que currentStep correspond à l'étape précédente.
  async runSequence(): Promise<{ processed: number; sent: number; closed: number; errors: number }> {
    const snapshot = await this.prospectRef.where("sequenceStatus", "==", "active").get();
    const result = { processed: 0, sent: 0, closed: 0, errors: 0 };

    for (const doc of snapshot.docs) {
      const prospect = { id: doc.id, ...doc.data() } as FirestoreRecord;
      result.processed++;

      const sentAt = prospect.presentationSentAt as admin.firestore.Timestamp | null;
      if (!sentAt) continue;
      const daysSince = Math.floor((Date.now() - sentAt.toMillis()) / (24 * 60 * 60 * 1000));
      const currentStep = Number(prospect.currentStep ?? 0);

      try {
        // Clôture J+90 : dossier « en attente », aucun email.
        if (daysSince >= CLOSE_AFTER_DAYS && currentStep === 4) {
          await this.prospectRef.doc(doc.id).update({
            sequenceStatus: "closed",
            history: admin.firestore.FieldValue.arrayUnion({
              step: 5,
              label: "Clôture (J+90) — dossier en attente",
              sentAt: admin.firestore.Timestamp.now(),
              ok: true,
            }),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          result.closed++;
          continue;
        }

        const nextStep = SEQUENCE_STEPS.find(
          (s) => daysSince >= s.afterDays && currentStep === s.step - 1,
        );
        if (!nextStep) continue;

        await this.sendProspectEmail(prospect, nextStep.template);

        await this.prospectRef.doc(doc.id).update({
          currentStep: nextStep.step,
          history: admin.firestore.FieldValue.arrayUnion({
            step: nextStep.step,
            label: nextStep.label,
            sentAt: admin.firestore.Timestamp.now(),
            ok: true,
          }),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        result.sent++;
      } catch (error) {
        // Un échec sur un contact ne bloque pas le reste du lot.
        const message = error instanceof Error ? error.message : String(error);
        console.error(`runSequence: échec pour le contact ${doc.id}:`, message);
        result.errors++;
        await this.prospectRef.doc(doc.id).update({
          history: admin.firestore.FieldValue.arrayUnion({
            step: currentStep + 1,
            label: "Échec d'envoi",
            sentAt: admin.firestore.Timestamp.now(),
            ok: false,
            error: message,
          }),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }).catch(() => { /* l'erreur d'historisation ne doit pas masquer l'erreur d'envoi */ });
      }
    }

    return result;
  }

  private async sendProspectEmail(prospect: FirestoreRecord, templateKey: TemplateKey): Promise<void> {
    const template = await this.templates.getTemplate(templateKey);
    const values = {
      prenom: String(prospect.prenom ?? ""),
      nom: String(prospect.nom ?? ""),
      societe: String(prospect.societe ?? ""),
      titre: String(prospect.titre_chanson ?? ""),
      lien: String(prospect.lien_musique ?? ""),
    };
    const subject = this.templates.renderSubject(template.subject, values);
    const emailHtml = await this.templates.renderBody(template.body, values);
    await prospectTransporter.sendMail(
      mailOptions(String(prospect.email), subject, emailHtml, undefined, PROSPECT_FROM),
    );
  }
}
