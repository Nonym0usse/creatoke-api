import PDFDocument from "pdfkit";
import { db, admin } from "../database/firebase.ts";
import { seller, VAT_NOTICE } from "../config/seller.ts";

export interface InvoiceData {
  invoiceNumber: string;
  date: string;
  nom_client: string;
  email_client: string;
  titre_chanson: string;
  licence_name: string;
  price: number;
}

const LICENCE_LABELS: Record<string, string> = {
  price_base: "Licence MP3",
  price_premium: "Licence WAV",
  price_base_creatoke: "Licence MP3 — version Créatoké",
  price_premium_creatoke: "Licence WAV — version Créatoké",
};

export function licenceLabel(licence_name: string | undefined): string {
  return LICENCE_LABELS[licence_name ?? ""] ?? "Licence d'utilisation";
}

// Numéro séquentiel par année (CREA-2026-0001), compteur incrémenté en transaction
// Firestore pour éviter tout doublon en cas d'achats simultanés.
export async function nextInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const counterRef = db.collection("counters").doc(`invoice-${year}`);
  const seq = await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(counterRef);
    const current = snapshot.exists ? (snapshot.data()?.seq as number) : 0;
    const next = current + 1;
    tx.set(counterRef, { seq: next });
    return next;
  });
  return `CREA-${year}-${String(seq).padStart(4, "0")}`;
}

export function generateInvoicePdf(data: InvoiceData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const price = Number(data.price).toFixed(2);

    // En-tête vendeur
    doc.fontSize(20).font("Helvetica-Bold").text(seller.name);
    doc.moveDown(0.3);
    doc.fontSize(10).font("Helvetica").text(seller.address);
    if (seller.siret) doc.text(`SIRET : ${seller.siret}`);
    doc.text(`Email : ${seller.email}`);

    // Titre + références facture
    doc.moveDown(2);
    doc.fontSize(16).font("Helvetica-Bold").text("FACTURE", { align: "right" });
    doc.fontSize(10).font("Helvetica")
      .text(`N° ${data.invoiceNumber}`, { align: "right" })
      .text(`Date : ${data.date}`, { align: "right" });

    // Client
    doc.moveDown(2);
    doc.fontSize(11).font("Helvetica-Bold").text("Facturé à :");
    doc.fontSize(10).font("Helvetica");
    if (data.nom_client) doc.text(data.nom_client);
    doc.text(data.email_client);

    // Tableau : une ligne article
    doc.moveDown(2);
    const tableTop = doc.y;
    const colDesc = 50;
    const colPrice = 445;

    doc.font("Helvetica-Bold").fontSize(10);
    doc.text("Description", colDesc, tableTop);
    doc.text("Prix", colPrice, tableTop, { width: 100, align: "right" });
    doc.moveTo(colDesc, tableTop + 15).lineTo(545, tableTop + 15).stroke();

    const rowY = tableTop + 25;
    doc.font("Helvetica").fontSize(10);
    doc.text(
      `${data.titre_chanson} — ${licenceLabel(data.licence_name)} (fichier numérique)`,
      colDesc,
      rowY,
      { width: 380 },
    );
    doc.text(`${price} €`, colPrice, rowY, { width: 100, align: "right" });

    const totalY = doc.y + 20;
    doc.moveTo(colDesc, totalY).lineTo(545, totalY).stroke();
    doc.font("Helvetica-Bold").fontSize(11);
    doc.text("Total à payer", colDesc, totalY + 10);
    doc.text(`${price} €`, colPrice, totalY + 10, { width: 100, align: "right" });

    // Mentions légales
    doc.moveDown(3);
    doc.font("Helvetica").fontSize(9);
    doc.text(VAT_NOTICE, colDesc);
    doc.moveDown(0.5);
    doc.text("Facture acquittée — paiement reçu via PayPal.", colDesc);

    doc.end();
  });
}

export interface StoredInvoice {
  invoiceNumber: string;
  storagePath: string;
}

// Sauvegarde le PDF dans Firebase Storage et les métadonnées dans la collection `invoices`.
export async function storeInvoice(
  pdf: Buffer,
  data: InvoiceData,
  sellingId: string,
  extra: Record<string, unknown>,
): Promise<StoredInvoice> {
  const storagePath = `invoices/${data.invoiceNumber}.pdf`;
  await admin.storage().bucket().file(storagePath).save(pdf, {
    contentType: "application/pdf",
  });

  await db.collection("invoices").doc(data.invoiceNumber).set({
    invoiceNumber: data.invoiceNumber,
    sellingId,
    nom_client: data.nom_client ?? "",
    email_client: data.email_client,
    titre_chanson: data.titre_chanson,
    licence_name: data.licence_name ?? "",
    price: Number(data.price),
    date: data.date,
    storagePath,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    ...extra,
  });

  return { invoiceNumber: data.invoiceNumber, storagePath };
}

export async function updateInvoiceEmailStatus(
  invoiceNumber: string,
  emailStatus: "sent" | "failed",
  emailError?: string,
): Promise<void> {
  await db.collection("invoices").doc(invoiceNumber).update({
    emailStatus,
    ...(emailError ? { emailError } : {}),
  });
}
