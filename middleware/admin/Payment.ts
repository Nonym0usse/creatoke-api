import { db } from "../../database/firebase.ts";
import type { FirestoreRecord } from "../Music.ts";
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

export class Payment {
  private paymentRef = db.collection("selling");

  async createPayment(data: Record<string, unknown>): Promise<FirestoreRecord> {
    const docRef = this.paymentRef.doc();
    await docRef.set(data);
    const docSnapshot = await docRef.get();
    if (docSnapshot.exists) {
      return { id: docSnapshot.id, ...docSnapshot.data() };
    }
    throw new Error("Failed to retrieve newly created payment.");
  }

  async getPaymentFromCurrentYear(): Promise<FirestoreRecord[]> {
    const currentYear = new Date().getFullYear();
    const snapshot = await this.paymentRef.where("year", "==", currentYear).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }

  // Post-traitement d'une vente : facture PDF + email de livraison à l'acheteur.
  // Appelé en fire-and-forget après la réponse HTTP : un échec ici ne doit
  // jamais faire échouer l'achat ni bloquer le téléchargement.
  async processPostPayment(selling: FirestoreRecord): Promise<void> {
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
