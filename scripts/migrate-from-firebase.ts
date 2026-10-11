// Migration ponctuelle Firebase -> MySQL + disque local.
//
//   node scripts/migrate-from-firebase.ts [--skip-files]
//
// Prérequis : schéma créé (database/schema.sql), variables MYSQL_* et
// BASE_PUBLIC_URL dans .env. Relançable sans risque : les lignes sont
// upsertées et les fichiers déjà téléchargés (même taille) sont ignorés.
// Firebase n'est jamais modifié.
import "dotenv/config";
import admin from "firebase-admin";
import fs from "node:fs";
import path from "node:path";
import serviceAccount from "../database/creatoke-admin.json" with { type: "json" };
import { execute, pool, selectRows } from "../database/mysql.ts";
import { PRIVATE_DIR, UPLOAD_DIR } from "../services/storage.ts";

const BUCKET = "creatoke-a8611.appspot.com";
const BASE_PUBLIC_URL = (process.env.BASE_PUBLIC_URL || "").replace(/\/+$/, "");
const skipFiles = process.argv.includes("--skip-files");

if (!BASE_PUBLIC_URL) {
  console.error("BASE_PUBLIC_URL manquant dans .env (ex: https://api.creatoke.fr)");
  process.exit(1);
}

const app = admin.initializeApp(
  { credential: admin.credential.cert(serviceAccount as admin.ServiceAccount), storageBucket: BUCKET },
  "migration",
);
const firestore = app.firestore();
const bucket = app.storage().bucket();

// Collection Firestore -> table MySQL et colonne qui reçoit l'ID du document.
const COLLECTIONS: Record<string, { table: string; idColumn: string }> = {
  musics: { table: "musics", idColumn: "id" },
  category: { table: "category", idColumn: "id" },
  background: { table: "background", idColumn: "id" },
  texts: { table: "texts", idColumn: "id" },
  comment: { table: "comment", idColumn: "id" },
  licence: { table: "licence", idColumn: "id" },
  selling: { table: "selling", idColumn: "id" },
  invoices: { table: "invoices", idColumn: "invoiceNumber" },
  counters: { table: "counters", idColumn: "name" },
  contacts: { table: "prospects", idColumn: "id" },
  prospectTemplates: { table: "prospect_templates", idColumn: "template_key" },
};

// URL Firebase Storage -> URL publique du serveur (même chemin sous /uploads).
const FIREBASE_URL = /^https:\/\/(?:firebasestorage\.googleapis\.com\/v0\/b\/([^/]+)\/o\/([^?#]+)|storage\.googleapis\.com\/([^/]+)\/([^?#]+))/;
const rewrittenUrls = new Set<string>();

function rewriteUrl(value: string): string {
  const match = FIREBASE_URL.exec(value);
  if (!match) return value;
  const bucketName = match[1] ?? match[3];
  if (bucketName !== BUCKET) return value;
  const objectPath = decodeURIComponent(match[2] ?? match[4]!);
  rewrittenUrls.add(objectPath);
  return `${BASE_PUBLIC_URL}/uploads/${objectPath.split("/").map(encodeURIComponent).join("/")}`;
}

function toSqlValue(value: unknown, columnType: string): unknown {
  if (value instanceof admin.firestore.Timestamp) return value.toDate();
  if (typeof value === "string") {
    if (columnType.startsWith("decimal") || columnType.startsWith("int")) {
      const n = Number(value);
      return value !== "" && Number.isFinite(n) ? n : null;
    }
    return rewriteUrl(value);
  }
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value !== null && typeof value === "object") return JSON.stringify(value);
  return value;
}

async function tableColumns(table: string): Promise<Map<string, string>> {
  const rows = await selectRows<{ Field: string; Type: string }>("SHOW COLUMNS FROM ??", [table]);
  return new Map(rows.map((r) => [r.Field, r.Type.toLowerCase()]));
}

async function migrateCollection(name: string, table: string, idColumn: string): Promise<void> {
  const columns = await tableColumns(table);
  const snapshot = await firestore.collection(name).get();
  const dropped = new Set<string>();

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const row: Record<string, unknown> = { [idColumn]: doc.id };
    for (const [field, value] of Object.entries(data)) {
      if (field === "id" || field === idColumn) continue;
      if (name === "contacts" && field === "history") continue;
      const type = columns.get(field);
      if (!type) {
        dropped.add(field);
        continue;
      }
      row[field] = toSqlValue(value, type);
    }
    await execute("INSERT INTO ?? SET ? ON DUPLICATE KEY UPDATE ?", [table, row, row]);

    if (name === "contacts") {
      await execute("DELETE FROM prospect_history WHERE prospect_id = ?", [doc.id]);
      const history = Array.isArray(data.history) ? data.history : [];
      for (const entry of history) {
        await execute("INSERT INTO prospect_history SET ?", [{
          prospect_id: doc.id,
          step: Number(entry.step ?? 0),
          label: String(entry.label ?? ""),
          sentAt: entry.sentAt instanceof admin.firestore.Timestamp ? entry.sentAt.toDate() : new Date(),
          ok: entry.ok === false ? 0 : 1,
          error: entry.error ?? null,
        }]);
      }
    }
  }

  const warning = dropped.size ? `  ⚠️ champs ignorés (pas de colonne) : ${[...dropped].join(", ")}` : "";
  console.log(`✔ ${name} -> ${table} : ${snapshot.size} lignes${warning}`);
}

async function migrateFiles(): Promise<Set<string>> {
  const [files] = await bucket.getFiles();
  const existing = new Set<string>();
  let downloaded = 0;
  let skipped = 0;

  for (const file of files) {
    if (file.name.endsWith("/")) continue;
    existing.add(file.name);
    const root = file.name.startsWith("invoices/") ? PRIVATE_DIR : UPLOAD_DIR;
    const destination = path.resolve(root, file.name);
    if (!destination.startsWith(root + path.sep)) continue;

    const size = Number(file.metadata.size ?? -1);
    if (fs.existsSync(destination) && fs.statSync(destination).size === size) {
      skipped++;
      continue;
    }
    await fs.promises.mkdir(path.dirname(destination), { recursive: true });
    await file.download({ destination });
    downloaded++;
    process.stdout.write(`\r  fichiers téléchargés : ${downloaded}`);
  }
  console.log(`\n✔ fichiers : ${downloaded} téléchargés, ${skipped} déjà présents`);
  return existing;
}

const known = new Set(Object.keys(COLLECTIONS));
for (const collection of await firestore.listCollections()) {
  if (!known.has(collection.id)) console.warn(`⚠️ collection non migrée : ${collection.id}`);
}

for (const [name, { table, idColumn }] of Object.entries(COLLECTIONS)) {
  await migrateCollection(name, table, idColumn);
}

if (skipFiles) {
  console.log("Fichiers ignorés (--skip-files).");
} else {
  const existing = await migrateFiles();
  const missing = [...rewrittenUrls].filter((p) => !existing.has(p));
  if (missing.length) {
    console.warn(`⚠️ ${missing.length} URL(s) en base pointent vers des fichiers absents du bucket :`);
    for (const p of missing) console.warn(`   - ${p}`);
  }
}

await pool.end();
await app.delete();
console.log("Migration terminée.");
