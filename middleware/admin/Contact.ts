import validator from "validator";
import { seller } from "../../config/seller.ts";
import {
  transporter,
  mailOptions,
  renderEmailTemplate,
  logoBase64,
} from "../../services/mailer.ts";
import { purgeOldContactMessages, saveContactMessage, setEmailStatus } from "../../services/contactMessages.ts";

export interface ContactData {
  email?: string;
  name?: string;
  message?: string;
  tel?: string;
  image?: string;
  [key: string]: unknown;
}

// Destinataire des messages du formulaire de contact (l'équipe Créatoké).
const CONTACT_TO = process.env.CONTACT_EMAIL || seller.email;

export class Contact {
  async sendEmail(data: ContactData): Promise<string> {
    if (!data.email || !data.name || !data.message || !data.tel) {
      throw new Error("INVALID_PARAMS");
    }
    if (!validator.isEmail(String(data.email))) throw new Error("INVALID_EMAIL");

    // Enregistré pour l'assistant IA ; un problème de base de données ne bloque jamais l'e-mail.
    const savedId = await saveContactMessage({
      name: String(data.name),
      email: String(data.email),
      tel: String(data.tel),
      message: String(data.message),
    }).catch((error) => {
      console.error("[contact] enregistrement du message :", error instanceof Error ? error.message : error);
      return null;
    });
    void purgeOldContactMessages().catch(() => undefined);
    const markEmail = (status: "sent" | "failed") =>
      savedId ? setEmailStatus(savedId, status).catch(() => undefined) : Promise.resolve();

    const emailHtml = await renderEmailTemplate("templates/contact.ejs", {
      image: await logoBase64(),
      name: String(data.name),
      email: String(data.email),
      tel: String(data.tel),
      message: String(data.message),
    });

    // Envoyé à l'équipe ; « Répondre » écrit directement au visiteur.
    try {
      await transporter.sendMail({
        ...mailOptions(CONTACT_TO, `CREATOKE : ✉️ Nouveau message de ${String(data.name)}`, emailHtml),
        replyTo: String(data.email),
      });
    } catch (error) {
      await markEmail("failed");
      throw error;
    }
    await markEmail("sent");
    return "Merci, votre message a été envoyé";
  }
}
