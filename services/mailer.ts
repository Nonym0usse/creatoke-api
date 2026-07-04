import nodemailer from "nodemailer";
import fs from "node:fs";
import ejs from "ejs";

// Transporter principal (boîte historique @creatoke.net) : contact, livraison des achats.
export const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? "mail.creatoke.net",
  port: Number(process.env.SMTP_PORT ?? 465),
  secure: (process.env.SMTP_PORT ?? "465") === "465",
  // Pas d'AUTH si aucun identifiant (ex. serveur SMTP de test local).
  ...(process.env.user
    ? { auth: { user: process.env.user, pass: process.env.password } }
    : {}),
});

// Transporter dédié aux relances éditeurs, envoyées depuis contact@creatoke.com.
export const prospectTransporter = nodemailer.createTransport({
  host: process.env.PROSPECT_SMTP_HOST ?? "mail.creatoke.net",
  port: Number(process.env.PROSPECT_SMTP_PORT ?? 465),
  secure: (process.env.PROSPECT_SMTP_PORT ?? "465") === "465",
  ...(process.env.PROSPECT_SMTP_USER
    ? { auth: { user: process.env.PROSPECT_SMTP_USER, pass: process.env.PROSPECT_SMTP_PASSWORD } }
    : {}),
});

export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export function mailOptions(
  to: string,
  subject: string,
  emailHtml: string,
  attachments?: MailAttachment[],
  from?: string,
) {
  return {
    from: from ?? process.env.user,
    to,
    subject,
    html: emailHtml,
    ...(attachments?.length ? { attachments } : {}),
  };
}

export const PROSPECT_FROM = `Creatoke <${process.env.PROSPECT_SMTP_USER || "contact@creatoke.com"}>`;

export async function renderEmailTemplate(templatePath: string, data: ejs.Data): Promise<string> {
  const template = await fs.promises.readFile(templatePath, "utf8");
  return ejs.render(template, data);
}

// Logo inline base64, même mécanique que l'email de contact historique.
export async function logoBase64(): Promise<string> {
  const image = await fs.promises.readFile("templates/logo.png");
  return `data:image/jpeg;base64,${image.toString("base64")}`;
}
