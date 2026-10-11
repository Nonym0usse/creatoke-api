// Export brut de Firebase (sauvegarde) : Firestore en JSON + fichiers du bucket.
//
//   node scripts/export-firebase.ts <dossier-de-sortie> [--skip-files]
//
// Produit :
//   <sortie>/firestore/<collection>.json   [{ id, ...champs }] (+ sous-collections)
//   <sortie>/storage/<chemin du bucket>    copie des fichiers
//   <sortie>/manifest.json                 date, nombre de documents et fichiers
// Lecture seule côté Firebase. Relançable : les fichiers déjà copiés
// (même taille) sont ignorés.
import admin from "firebase-admin";
import fs from "node:fs";
import path from "node:path";
import serviceAccount from "../database/creatoke-admin.json" with { type: "json" };

const BUCKET = "creatoke-a8611.appspot.com";
const outDir = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
const skipFiles = process.argv.includes("--skip-files");

if (!outDir) {
  console.error("Usage : node scripts/export-firebase.ts <dossier-de-sortie> [--skip-files]");
  process.exit(1);
}
const root = path.resolve(outDir);

const app = admin.initializeApp(
  { credential: admin.credential.cert(serviceAccount as admin.ServiceAccount), storageBucket: BUCKET },
  "export",
);
const firestore = app.firestore();

// Types Firestore -> JSON lisible (Timestamp en ISO, références en chemin...).
function toJson(value: unknown): unknown {
  if (value instanceof admin.firestore.Timestamp) return value.toDate().toISOString();
  if (value instanceof admin.firestore.DocumentReference) return { $ref: value.path };
  if (value instanceof admin.firestore.GeoPoint) return { $geo: [value.latitude, value.longitude] };
  if (Buffer.isBuffer(value)) return { $bytes: value.toString("base64") };
  if (Array.isArray(value)) return value.map(toJson);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toJson(v)]));
  }
  return value;
}

type ExportedDoc = Record<string, unknown> & { id: string };

async function exportCollection(collection: admin.firestore.CollectionReference): Promise<ExportedDoc[]> {
  const snapshot = await collection.get();
  const docs: ExportedDoc[] = [];
  for (const doc of snapshot.docs) {
    const exported: ExportedDoc = { ...(toJson(doc.data()) as Record<string, unknown>), id: doc.id };
    const subcollections = await doc.ref.listCollections();
    if (subcollections.length) {
      exported.$subcollections = Object.fromEntries(
        await Promise.all(subcollections.map(async (sub) => [sub.id, await exportCollection(sub)] as const)),
      );
    }
    docs.push(exported);
  }
  return docs;
}

const manifest: Record<string, unknown> = { exportedAt: new Date().toISOString(), project: serviceAccount.project_id };

// Firestore
const counts: Record<string, number> = {};
await fs.promises.mkdir(path.join(root, "firestore"), { recursive: true });
for (const collection of await firestore.listCollections()) {
  const docs = await exportCollection(collection);
  await fs.promises.writeFile(path.join(root, "firestore", `${collection.id}.json`), JSON.stringify(docs, null, 2));
  counts[collection.id] = docs.length;
  console.log(`✔ ${collection.id} : ${docs.length} documents`);
}
manifest.firestore = counts;

// Storage
if (skipFiles) {
  console.log("Fichiers ignorés (--skip-files).");
} else {
  const storageRoot = path.join(root, "storage");
  const [files] = await app.storage().bucket().getFiles();
  let downloaded = 0;
  let skipped = 0;
  let bytes = 0;
  for (const file of files) {
    if (file.name.endsWith("/")) continue;
    const destination = path.resolve(storageRoot, file.name);
    if (!destination.startsWith(storageRoot + path.sep)) continue;
    const size = Number(file.metadata.size ?? -1);
    bytes += Math.max(size, 0);
    if (fs.existsSync(destination) && fs.statSync(destination).size === size) {
      skipped++;
      continue;
    }
    await fs.promises.mkdir(path.dirname(destination), { recursive: true });
    await file.download({ destination });
    downloaded++;
    process.stdout.write(`\r  fichiers téléchargés : ${downloaded}/${files.length}`);
  }
  console.log(`\n✔ storage : ${downloaded} téléchargés, ${skipped} déjà présents (${(bytes / 1e9).toFixed(2)} Go)`);
  manifest.storage = { files: downloaded + skipped, bytes };
}

await fs.promises.writeFile(path.join(root, "manifest.json"), JSON.stringify(manifest, null, 2));
await app.delete();
console.log(`Export terminé : ${root}`);
