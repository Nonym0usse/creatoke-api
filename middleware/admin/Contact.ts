import validator from "validator";
import { seller } from "../../config/seller.ts";
import {
  transporter,
  mailOptions,
  renderEmailTemplate,
  logoBase64,
} from "../../services/mailer.ts";

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

    const emailHtml = await renderEmailTemplate("templates/contact.ejs", {
      image: await logoBase64(),
      name: String(data.name),
      email: String(data.email),
      tel: String(data.tel),
      message: String(data.message),
    });

    // Envoyé à l'équipe ; « Répondre » écrit directement au visiteur.
    await transporter.sendMail({
      ...mailOptions(CONTACT_TO, `CREATOKE : ✉️ Nouveau message de ${String(data.name)}`, emailHtml),
      replyTo: String(data.email),
    });
    return "Merci, votre message a été envoyé";
  }
}
