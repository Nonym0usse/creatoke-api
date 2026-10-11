import { insertRow, newId, pick, selectOne, selectRows, type DbRecord } from "../../database/mysql.ts";
import {
  nextInvoiceNumber,
  generateInvoicePdf,
  storeInvoice,
  updateInvoiceEmailStatus,
  type InvoiceData,
} from "../../services/invoice.ts";
import {
  transporter,
  mailOptions,
  renderEmailTemplate,
  logoBase64,
} from "../../services/mailer.ts";

const SELLING_COLUMNS = [
  "date", "month", "year", "email_client", "nom_client", "id_song",
  "titre_chanson", "licence_name", "price", "songUrlDownload",
] as const;

export class Payment {
  async createPayment(data: Record<string, unknown>): Promise<DbRecord> {
    const id = newId();
    await insertRow("selling", { ...pick(data, SELLING_COLUMNS), id });
    const created = await selectOne("SELECT * FROM selling WHERE id = ?", [id]);
    if (created) return created;
    throw new Error("Failed to retrieve newly created payment.");
  }

  async getPaymentFromCurrentYear(): Promise<DbRecord[]> {
    const currentYear = new Date().getFullYear();
    return selectRows("SELECT * FROM selling WHERE year = ?", [currentYear]);
  }

  // Post-traitement d'une vente : facture PDF + email de livraison à l'acheteur.
  // Appelé en fire-and-forget après la réponse HTTP : un échec ici ne doit
  // jamais faire échouer l'achat ni bloquer le téléchargement.
  async processPostPayment(selling: DbRecord): Promise<void> {
    const email_client = String(selling.email_client ?? "");
    if (!email_client) {
      console.error(`processPostPayment: vente ${selling.id} sans email_client, facture ignorée.`);
      return;
    }

    const invoiceData: InvoiceData = {
      invoiceNumber: await nextInvoiceNumber(),
      date: String(selling.date ?? new Date().toLocaleDateString("fr-FR")),
      nom_client: String(selling.nom_client ?? ""),
      email_client,
      titre_chanson: String(selling.titre_chanson ?? ""),
      licence_name: String(selling.licence_name ?? ""),
      price: Number(selling.price ?? 0),
    };

    const pdf = await generateInvoicePdf(invoiceData);
    await storeInvoice(pdf, invoiceData, selling.id, {
      id_song: selling.id_song ?? "",
      year: selling.year ?? null,
      month: selling.month ?? null,
      emailStatus: "pending",
    });

    try {
      const emailHtml = await renderEmailTemplate("templates/delivery.ejs", {
        image: await logoBase64(),
        nom_client: invoiceData.nom_client,
        titre_chanson: invoiceData.titre_chanson,
        songUrlDownload: String(selling.songUrlDownload ?? ""),
        invoiceNumber: invoiceData.invoiceNumber,
      });

      await transporter.sendMail(
        mailOptions(email_client, "CREATOKE : 🎵 Votre musique et votre facture", emailHtml, [
          {
            filename: `${invoiceData.invoiceNumber}.pdf`,
            content: pdf,
            contentType: "application/pdf",
          },
        ]),
      );
      await updateInvoiceEmailStatus(invoiceData.invoiceNumber, "sent");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`processPostPayment: échec envoi email facture ${invoiceData.invoiceNumber}:`, message);
      await updateInvoiceEmailStatus(invoiceData.invoiceNumber, "failed", message);
    }
  }
}
