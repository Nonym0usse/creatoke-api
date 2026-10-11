import type { Request } from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// Stockage des fichiers sur le disque du serveur (remplace Firebase Storage).
// - uploads/ : fichiers publics, servis par express.static sur /uploads
// - storage/ : fichiers privés (factures), jamais servis directement
export const UPLOAD_DIR = path.join(process.cwd(), "uploads");
export const PRIVATE_DIR = path.join(process.cwd(), "storage");

// Sous-dossiers publics dans lesquels l'admin peut envoyer des fichiers.
export const PUBLIC_DIRS = ["songs", "background", "category", "users"] as const;
export type PublicDir = (typeof PUBLIC_DIRS)[number];

export const isPublicDir = (dir: string): dir is PublicDir =>
  (PUBLIC_DIRS as readonly string[]).includes(dir);

const BASE_PUBLIC_URL = (process.env.BASE_PUBLIC_URL || "").replace(/\/+$/, ""); // ex: https://api.creatoke.fr

for (const dir of [UPLOAD_DIR, ...PUBLIC_DIRS.map((d) => path.join(UPLOAD_DIR, d)), PRIVATE_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Nom non devinable (les URLs publiques des fichiers payants ne doivent pas
// pouvoir être reconstruites) tout en gardant le nom d'origine lisible.
export function uniqueFileName(originalName: string): string {
  const base = path.basename(originalName || "file")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(-120);
  return `${Date.now()}_${crypto.randomBytes(8).toString("hex")}_${base}`;
}

const encodePath = (relativePath: string): string =>
  relativePath.split("/").map(encodeURIComponent).join("/");

// URL publique robuste d'un fichier de uploads/ (chemin relatif, ex. "songs/x.mp3").
export function buildPublicUrl(req: Request | null, relativePath: string): string | null {
  if (BASE_PUBLIC_URL) {
    return `${BASE_PUBLIC_URL}/uploads/${encodePath(relativePath)}`;
  }
  if (!req) return null;
  const forwardedProto = req.headers["x-forwarded-proto"];
  const proto =
    (typeof forwardedProto === "string" && forwardedProto.split(",")[0].trim()) ||
    req.protocol ||
    "https";
  const host = req.get("x-forwarded-host") || req.get("host");
  if (!host) return null;
  return `${proto}://${host.replace(/\/+$/, "")}/uploads/${encodePath(relativePath)}`;
}

// Chemin disque d'un fichier public à partir de son URL, ou null si l'URL
// ne désigne pas un fichier de uploads/ (URL externe, placeholder...).
export function localPathFromUrl(url: unknown): string | null {
  if (typeof url !== "string" || !url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (BASE_PUBLIC_URL && parsed.host !== new URL(BASE_PUBLIC_URL).host) return null;
  if (!parsed.pathname.startsWith("/uploads/")) return null;

  const relative = decodeURIComponent(parsed.pathname.slice("/uploads/".length));
  const absolute = path.resolve(UPLOAD_DIR, relative);
  if (!absolute.startsWith(UPLOAD_DIR + path.sep)) return null;
  return absolute;
}

export async function deleteFileByUrl(url: unknown): Promise<void> {
  const filePath = localPathFromUrl(url);
  if (filePath) await fs.promises.unlink(filePath).catch(() => undefined);
}

export async function savePrivateFile(relativePath: string, content: Buffer): Promise<void> {
  const absolute = path.join(PRIVATE_DIR, relativePath);
  await fs.promises.mkdir(path.dirname(absolute), { recursive: true });
  await fs.promises.writeFile(absolute, content);
}
