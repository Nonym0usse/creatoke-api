import dns from "node:dns/promises";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { UPLOAD_DIR, buildPublicUrl, uniqueFileName, type PublicDir } from "../services/storage.ts";

// Import d'un fichier (audio, image ou vidéo) depuis un lien de partage, pour le
// connecteur MCP : « les fichiers sont dans ce lien Drive ».
// Le serveur télécharge une adresse fournie par l'assistant : on refuse tout
// ce qui vise le réseau interne (localhost, IP privées…), y compris après une
// redirection, on vérifie le type et on limite la taille (comme l'envoi depuis l'admin).

const MAX_BYTES: Record<ImportKind, number> = { audio: 500 * 1024 * 1024, image: 500 * 1024 * 1024, video: 512 * 1024 * 1024 };
const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 10 * 60 * 1000;

const AUDIO_EXT = [".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"];
const IMAGE_EXT = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
const VIDEO_EXT = [".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi"];
const KIND_LABEL: Record<ImportKind, string> = { audio: "un fichier audio", image: "une image", video: "une vidéo" };

export type ImportKind = "audio" | "image" | "video";

export interface ImportedFile {
  url: string;
  nom_fichier: string;
  taille_mo: number;
  type: string;
}

/** Liens de partage → lien de téléchargement direct (Google Drive, Dropbox). */
export function directDownloadUrl(input: string): string {
  const url = new URL(input.trim());
  if (/(^|\.)drive\.google\.com$/.test(url.hostname)) {
    const id = url.pathname.match(/\/file\/d\/([^/]+)/)?.[1] ?? url.searchParams.get("id");
    if (id) return `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download&confirm=t`;
  }
  if (/(^|\.)dropbox\.com$/.test(url.hostname)) {
    url.searchParams.set("dl", "1");
    return url.href;
  }
  return url.href;
}

function isPrivateAddress(address: string): boolean {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || // CGNAT
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  const v6 = address.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateAddress(v6.slice(7));
  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80") || v6.startsWith("ff");
}

async function assertPublicHttps(url: URL): Promise<void> {
  if (url.protocol !== "https:") throw new Error("Seuls les liens https:// sont acceptés.");
  if (url.username || url.password) throw new Error("Lien refusé (identifiants dans l'adresse).");
  const addresses = await dns.lookup(url.hostname, { all: true }).catch(() => []);
  if (!addresses.length) throw new Error(`Adresse introuvable : ${url.hostname}.`);
  if (addresses.some((a) => isPrivateAddress(a.address))) throw new Error("Lien refusé (adresse interne).");
}

function fileNameFrom(response: Response, url: URL): string {
  const disposition = response.headers.get("content-disposition") ?? "";
  const encoded = disposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i)?.[1];
  const plain = disposition.match(/filename\s*=\s*"?([^";]+)"?/i)?.[1];
  try {
    if (encoded) return decodeURIComponent(encoded.trim());
  } catch {
    // nom mal encodé : on essaie la suite
  }
  return (plain?.trim() || decodeURIComponent(path.basename(url.pathname)) || "fichier").slice(-150);
}

/** dir vide : racine de uploads/ (vidéos à publier, comme la page « Publier une vidéo »). */
export async function importFileFromUrl(link: string, kind: ImportKind, dir: PublicDir | ""): Promise<ImportedFile> {
  const maxBytes = MAX_BYTES[kind];
  const tooBig = `Fichier trop lourd (${Math.round(maxBytes / 1024 / 1024)} Mo maximum).`;
  let url = new URL(directDownloadUrl(link));
  let response: Response | null = null;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHttps(url);
    response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) });
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      url = new URL(location, url);
      continue;
    }
    break;
  }
  if (!response || (response.status >= 300 && response.status < 400)) throw new Error("Trop de redirections.");
  if (!response.ok || !response.body) throw new Error(`Téléchargement impossible (erreur ${response.status}).`);

  const type = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (type === "text/html") {
    throw new Error(
      "Le lien mène à une page web et non au fichier : vérifiez qu'il est partagé « à toute personne disposant du lien », " +
      "ou ajoutez le fichier depuis le site.",
    );
  }
  let name = fileNameFrom(response, url);
  const allowed = { audio: AUDIO_EXT, image: IMAGE_EXT, video: VIDEO_EXT }[kind];
  // Types génériques renvoyés par Drive, Dropbox… : on se fie alors à l'extension.
  const typeOk = type.startsWith(`${kind}/`) || ["", "application/octet-stream", "binary/octet-stream", "application/ogg"].includes(type);
  if (!typeOk) throw new Error(`Ce lien ne contient pas ${KIND_LABEL[kind]} (type reçu : ${type}).`);
  if (!allowed.includes(path.extname(name).toLowerCase())) {
    if (!type.startsWith(`${kind}/`)) {
      throw new Error(`Format non reconnu pour « ${name} » (attendu : ${allowed.join(", ")}).`);
    }
    name += `.${type.split("/")[1].replace("mpeg", "mp3").replace("x-wav", "wav").replace("quicktime", "mov")}`;
  }
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new Error(tooBig);

  const fileName = uniqueFileName(name);
  const relative = dir ? `${dir}/${fileName}` : fileName;
  const destination = path.join(UPLOAD_DIR, relative);
  let received = 0;
  const limit = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length;
      if (received > maxBytes) callback(new Error(tooBig));
      else callback(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(response.body as never), limit, fs.createWriteStream(destination));
  } catch (error) {
    await fs.promises.unlink(destination).catch(() => undefined);
    throw error;
  }
  if (received === 0) {
    await fs.promises.unlink(destination).catch(() => undefined);
    throw new Error("Le fichier téléchargé est vide.");
  }

  const publicUrl = buildPublicUrl(null, relative);
  if (!publicUrl) throw new Error("Adresse publique des fichiers non configurée (BASE_PUBLIC_URL).");
  return { url: publicUrl, nom_fichier: name, taille_mo: Math.round((received / 1024 / 1024) * 10) / 10, type: type || kind };
}
