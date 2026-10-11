import validator from "validator";
import { execute, insertRow, newId, pick, selectOne, selectRows, updateRow, type DbRecord } from "../../database/mysql.ts";
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

const PROSPECT_COLUMNS = [
  "nom", "prenom", "email", "societe", "id_song", "lien_musique", "titre_chanson", "notes",
] as const;

interface HistoryEntry {
  step: number;
  label: string;
  ok: boolean;
  error?: string;
}

type HistoryRow = { prospect_id: string; step: number; label: string; sentAt: Date; ok: number; error: string | null };

export class Prospect {
  private templates = new ProspectTemplates();

  async listProspects(): Promise<DbRecord[]> {
    const prospects = await selectRows("SELECT * FROM prospects ORDER BY createdAt DESC");
    const history = await selectRows<HistoryRow>("SELECT * FROM prospect_history ORDER BY id");
    const byProspect = new Map<string, Array<Record<string, unknown>>>();
    for (const row of history) {
      const entries = byProspect.get(row.prospect_id) ?? [];
      entries.push({
        step: row.step,
        label: row.label,
        sentAt: row.sentAt,
        ok: Boolean(row.ok),
        ...(row.error ? { error: row.error } : {}),
      });
      byProspect.set(row.prospect_id, entries);
    }
    return prospects.map((prospect) => ({ ...prospect, history: byProspect.get(prospect.id) ?? [] }));
  }

  async createProspect(data: ProspectInput): Promise<DbRecord> {
    if (!data.email || !validator.isEmail(String(data.email))) throw new Error("INVALID_EMAIL");
    if (!data.nom && !data.prenom) throw new Error("INVALID_NAME");

    const id = newId();
    await insertRow("prospects", {
      id,
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
    });
    const created = await selectOne("SELECT * FROM prospects WHERE id = ?", [id]);
    return { ...created!, history: [] };
  }

  async updateProspect(data: ProspectInput & { id?: string }): Promise<void> {
    if (!data.id) throw new Error("INVALID_PARAMS");
    if (data.email && !validator.isEmail(String(data.email))) throw new Error("INVALID_EMAIL");
    await updateRow("prospects", data.id, pick({ ...data }, PROSPECT_COLUMNS));
  }

  async deleteProspect(id: string): Promise<void> {
    // L'historique est supprimé en cascade (clé étrangère).
    await execute("DELETE FROM prospects WHERE id = ?", [id]);
  }

  // J0 : envoi de l'email de présentation, démarre la séquence de relances.
  async sendPresentation(id: string): Promise<void> {
    const prospect = await selectOne("SELECT * FROM prospects WHERE id = ?", [id]);
    if (!prospect) throw new Error("NOT_FOUND");

    if (prospect.sequenceStatus !== "draft") throw new Error("ALREADY_SENT");

    await this.sendProspectEmail(prospect, "presentation");

    await execute(
      "UPDATE prospects SET sequenceStatus = 'active', currentStep = 1, presentationSentAt = NOW() WHERE id = ?",
      [id],
    );
    await this.addHistory(id, { step: 1, label: "Envoi initial (J0)", ok: true });
  }

  // L'éditeur a répondu : la séquence s'arrête.
  async markReplied(id: string): Promise<void> {
    const result = await execute("UPDATE prospects SET sequenceStatus = 'replied' WHERE id = ?", [id]);
    if (result.affectedRows === 0) throw new Error("NOT_FOUND");
  }

  // Job quotidien (et endpoint manuel) : envoie les relances dues.
  // Idempotent par construction : une relance n'est envoyée que si le seuil de
  // jours est atteint ET que currentStep correspond à l'étape précédente.
  async runSequence(): Promise<{ processed: number; sent: number; closed: number; errors: number }> {
    const prospects = await selectRows("SELECT * FROM prospects WHERE sequenceStatus = 'active'");
    const result = { processed: 0, sent: 0, closed: 0, errors: 0 };

    for (const prospect of prospects) {
      result.processed++;

      const sentAt = prospect.presentationSentAt as Date | null;
      if (!sentAt) continue;
      const daysSince = Math.floor((Date.now() - sentAt.getTime()) / (24 * 60 * 60 * 1000));
      const currentStep = Number(prospect.currentStep ?? 0);

      try {
        // Clôture J+90 : dossier « en attente », aucun email.
        if (daysSince >= CLOSE_AFTER_DAYS && currentStep === 4) {
          await execute("UPDATE prospects SET sequenceStatus = 'closed' WHERE id = ?", [prospect.id]);
          await this.addHistory(prospect.id, { step: 5, label: "Clôture (J+90) — dossier en attente", ok: true });
          result.closed++;
          continue;
        }

        const nextStep = SEQUENCE_STEPS.find(
          (s) => daysSince >= s.afterDays && currentStep === s.step - 1,
        );
        if (!nextStep) continue;

        await this.sendProspectEmail(prospect, nextStep.template);

        await execute("UPDATE prospects SET currentStep = ? WHERE id = ?", [nextStep.step, prospect.id]);
        await this.addHistory(prospect.id, { step: nextStep.step, label: nextStep.label, ok: true });
        result.sent++;
      } catch (error) {
        // Un échec sur un contact ne bloque pas le reste du lot.
        const message = error instanceof Error ? error.message : String(error);
        console.error(`runSequence: échec pour le contact ${prospect.id}:`, message);
        result.errors++;
        await this.addHistory(prospect.id, {
          step: currentStep + 1,
          label: "Échec d'envoi",
          ok: false,
          error: message,
        }).catch(() => { /* l'erreur d'historisation ne doit pas masquer l'erreur d'envoi */ });
      }
    }

    return result;
  }

  // Ajoute une entrée d'historique et met à jour updatedAt du contact.
  private async addHistory(prospectId: string, entry: HistoryEntry): Promise<void> {
    await insertRow("prospect_history", {
      prospect_id: prospectId,
      step: entry.step,
      label: entry.label,
      ok: entry.ok ? 1 : 0,
      error: entry.error ?? null,
    });
    await execute("UPDATE prospects SET updatedAt = NOW() WHERE id = ?", [prospectId]);
  }

  private async sendProspectEmail(prospect: DbRecord, templateKey: TemplateKey): Promise<void> {
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
