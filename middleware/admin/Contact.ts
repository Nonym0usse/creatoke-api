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

export class Contact {
  async sendEmail(data: ContactData): Promise<string> {
    if (!data.email || !data.name || !data.message || !data.tel) {
      throw new Error("INVALID_PARAMS");
    }
    data.image = await logoBase64();
    const emailHtml = await renderEmailTemplate("templates/contact.ejs", data);

    await transporter.sendMail(
      mailOptions(data.email, "CREATOKE : ✉️ Nouveau message", emailHtml),
    );
    return "Merci, votre candidature à été envoyée";
  }
}
