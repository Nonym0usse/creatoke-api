import { db, admin } from "../../database/firebase.ts";
import { renderEmailTemplate, logoBase64 } from "../../services/mailer.ts";

// Emails de la séquence éditeurs dont le contenu est éditable depuis l'admin.
// Le texte est stocké en Firestore (collection prospectTemplates) ; en
// l'absence de personnalisation, les valeurs par défaut ci-dessous s'appliquent.
export const TEMPLATE_KEYS = ["presentation", "relance-1", "relance-2", "relance-3"] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

// Variables utilisables dans le sujet et le corps : remplacées à l'envoi
// par les informations du contact.
export const TEMPLATE_PLACEHOLDERS = ["{prenom}", "{nom}", "{societe}", "{titre}", "{lien}"] as const;

export interface EmailTemplate {
  subject: string;
  body: string;
}

const DEFAULT_TEMPLATES: Record<TemplateKey, EmailTemplate & { label: string }> = {
  "presentation": {
    label: "Envoi initial (J0)",
    subject: "Créatoké — une musique à découvrir : « {titre} »",
    body: `Bonjour {prenom},

Je me permets de vous contacter pour vous présenter Créatoké, un catalogue de musiques originales (chansons à chanter, instrumentaux, musiques de contenus) disponibles à l'écoute et à la licence.

Je serais heureux de vous faire découvrir l'une de nos œuvres, qui pourrait retenir votre attention : « {titre} ».

Vous pouvez l'écouter ici : {lien}

N'hésitez pas à revenir vers moi pour toute question, ou si vous souhaitez en savoir plus sur nos conditions de licence.

Bien cordialement,

Créatoké
contact@creatoke.com`,
  },
  "relance-1": {
    label: "1er rappel (J+10)",
    subject: "Avez-vous pu écouter « {titre} » ?",
    body: `Bonjour {prenom},

Je me permets un petit message pour savoir si vous avez pu écouter « {titre} » : {lien}

Je reste bien entendu à votre écoute.

Bien cordialement,

Créatoké
contact@creatoke.com`,
  },
  "relance-2": {
    label: "2e rappel (J+30)",
    subject: "Créatoké — « {titre} », toujours disponible pour vous",
    body: `Bonjour {prenom},

Il y a quelques semaines, je vous avais fait parvenir « {titre} », une œuvre de notre catalogue Créatoké : {lien}

Notre catalogue continue de s'enrichir régulièrement de nouvelles créations : n'hésitez pas à y jeter une oreille si vous êtes à la recherche de nouveaux titres.

Je serais ravi d'échanger avec vous si l'œuvre — ou d'autres de nos musiques — peut correspondre à vos recherches actuelles.

Bien cordialement,

Créatoké
contact@creatoke.com`,
  },
  "relance-3": {
    label: "3e rappel (J+60)",
    subject: "Créatoké — je reste à votre disposition",
    body: `Bonjour {prenom},

Je ne souhaite pas encombrer votre boîte mail : ce message sera donc mon dernier au sujet de « {titre} » ({lien}).

Sachez simplement que je reste entièrement disponible si vous souhaitez échanger, maintenant ou plus tard — notre catalogue reste à votre disposition.

Je vous souhaite une excellente continuation.

Bien cordialement,

Créatoké
contact@creatoke.com`,
  },
};

export interface TemplateValues {
  prenom: string;
  nom: string;
  societe: string;
  titre: string;
  lien: string;
}

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const isTemplateKey = (key: string): key is TemplateKey =>
  (TEMPLATE_KEYS as readonly string[]).includes(key);

export class ProspectTemplates {
  private templateRef = db.collection("prospectTemplates");

  // Liste les 4 emails de la séquence, personnalisation Firestore fusionnée
  // avec les valeurs par défaut.
  async listTemplates(): Promise<Array<EmailTemplate & { key: TemplateKey; label: string; custom: boolean }>> {
    const snapshot = await this.templateRef.get();
    const overrides = new Map(snapshot.docs.map((doc) => [doc.id, doc.data()]));
    return TEMPLATE_KEYS.map((key) => {
      const override = overrides.get(key);
      return {
        key,
        label: DEFAULT_TEMPLATES[key].label,
        subject: String(override?.subject ?? DEFAULT_TEMPLATES[key].subject),
        body: String(override?.body ?? DEFAULT_TEMPLATES[key].body),
        custom: Boolean(override),
      };
    });
  }

  async getTemplate(key: TemplateKey): Promise<EmailTemplate> {
    const snapshot = await this.templateRef.doc(key).get();
    if (!snapshot.exists) return DEFAULT_TEMPLATES[key];
    const data = snapshot.data() ?? {};
    return {
      subject: String(data.subject ?? DEFAULT_TEMPLATES[key].subject),
      body: String(data.body ?? DEFAULT_TEMPLATES[key].body),
    };
  }

  async updateTemplate(key: string, subject: unknown, body: unknown): Promise<void> {
    if (!isTemplateKey(key)) throw new Error("INVALID_TEMPLATE_KEY");
    if (typeof subject !== "string" || !subject.trim()) throw new Error("INVALID_SUBJECT");
    if (typeof body !== "string" || !body.trim()) throw new Error("INVALID_BODY");
    await this.templateRef.doc(key).set({
      subject: subject.trim(),
      body: body.trim(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  // Supprime la personnalisation : l'email revient au texte par défaut.
  async resetTemplate(key: string): Promise<EmailTemplate & { label: string }> {
    if (!isTemplateKey(key)) throw new Error("INVALID_TEMPLATE_KEY");
    await this.templateRef.doc(key).delete();
    return DEFAULT_TEMPLATES[key];
  }

  // Sujet : simple substitution des variables, en texte brut.
  renderSubject(subject: string, values: TemplateValues): string {
    return this.substitute(subject, values, (v) => v, values.lien);
  }

  // Corps : le texte saisi par l'admin est échappé (texte uniquement, aucun
  // HTML interprété) puis mis en page dans le gabarit graphique commun ;
  // {lien} devient un lien cliquable vers la musique.
  async renderBody(body: string, values: TemplateValues): Promise<string> {
    const lienHtml = values.lien
      ? `<a href="${escapeHtml(values.lien)}">${escapeHtml(values.lien)}</a>`
      : "";
    const withValues = this.substitute(escapeHtml(body), values, escapeHtml, lienHtml);
    const contenu = withValues
      .split(/\n{2,}/)
      .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br>")}</p>`)
      .join("\n");
    return renderEmailTemplate("templates/prospect/layout.ejs", {
      image: await logoBase64(),
      contenu,
    });
  }

  private substitute(
    text: string,
    values: TemplateValues,
    transform: (value: string) => string,
    lien: string,
  ): string {
    return text
      .replace(/\{prenom\}/g, transform(values.prenom))
      .replace(/\{nom\}/g, transform(values.nom))
      .replace(/\{societe\}/g, transform(values.societe))
      .replace(/\{titre\}/g, transform(values.titre))
      .replace(/\{lien\}/g, lien);
  }
}
