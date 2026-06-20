import nodemailer from "nodemailer";
import fs from "node:fs";
import ejs from "ejs";

const transporter = nodemailer.createTransport({
  host: "mail.creatoke.net",
  port: 465,
  secure: true,
  auth: {
    user: process.env.user,
    pass: process.env.password,
  },
});

function mailOptions(sender: string, subject: string, emailHtml: string) {
  return {
    from: process.env.user,
    to: sender,
    subject,
    html: emailHtml,
  };
}

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
    const image = await fs.promises.readFile("templates/logo.png");
    data.image = `data:image/jpeg;base64,${image.toString("base64")}`;
    const emailHtml = await this.renderEmailTemplate("templates/contact.ejs", data);

    await transporter.sendMail(
      mailOptions(data.email, "CREATOKE : ✉️ Nouveau message", emailHtml),
    );
    return "Merci, votre candidature à été envoyée";
  }

  async renderEmailTemplate(templatePath: string, data: ejs.Data): Promise<string> {
    const template = await fs.promises.readFile(templatePath, "utf8");
    return ejs.render(template, data);
  }
}
