import PDFDocument from "pdfkit";
import type { RowDataPacket } from "mysql2/promise";
import { execute, insertRow, pick, pool } from "../database/mysql.ts";
import { savePrivateFile } from "./storage.ts";
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

// Numéro séquentiel par année (CREA-2026-0001). L'incrément se fait en une seule
// requête atomique (LAST_INSERT_ID) : aucun doublon en cas d'achats simultanés.
export async function nextInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const connection = await pool.getConnection();
  try {
    await connection.query(
      `INSERT INTO counters (name, seq) VALUES (?, LAST_INSERT_ID(1))
       ON DUPLICATE KEY UPDATE seq = LAST_INSERT_ID(seq + 1)`,
      [`invoice-${year}`],
    );
    const [rows] = await connection.query<RowDataPacket[]>(
      "SELECT LAST_INSERT_ID() AS seq",
    );
    return `CREA-${year}-${String(rows[0]!.seq as number).padStart(4, "0")}`;
  } finally {
    connection.release();
  }
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

// Sauvegarde le PDF sur le disque (dossier privé storage/) et les métadonnées en base.
export async function storeInvoice(
  pdf: Buffer,
  data: InvoiceData,
  sellingId: string,
  extra: Record<string, unknown>,
): Promise<StoredInvoice> {
  const storagePath = `invoices/${data.invoiceNumber}.pdf`;
  await savePrivateFile(storagePath, pdf);

  await insertRow("invoices", {
    invoiceNumber: data.invoiceNumber,
    sellingId,
    nom_client: data.nom_client ?? "",
    email_client: data.email_client,
    titre_chanson: data.titre_chanson,
    licence_name: data.licence_name ?? "",
    price: Number(data.price),
    date: data.date,
    storagePath,
    ...pick(extra, ["id_song", "year", "month", "emailStatus"]),
  });

  return { invoiceNumber: data.invoiceNumber, storagePath };
}

export async function updateInvoiceEmailStatus(
  invoiceNumber: string,
  emailStatus: "sent" | "failed",
  emailError?: string,
): Promise<void> {
  await execute("UPDATE invoices SET emailStatus = ?, emailError = ? WHERE invoiceNumber = ?", [
    emailStatus,
    emailError ?? null,
    invoiceNumber,
  ]);
}
