// routes/admin/videoPublish.ts — envoi d'une vidéo et publication sur les réseaux sociaux (via Upload-Post)
import express, { type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { networkStatus } from "../../services/social/uploadPost.ts";
import { startPublication } from "../../services/social/publishJob.ts";
import { getVideoPost } from "../../services/social/history.ts";
import { NETWORK_IDS, type NetworkId } from "../../services/social/common.ts";
import { UPLOAD_DIR } from "../../services/storage.ts";
import verifyTokenMiddleware from "../../database/auth.ts";

const router = express.Router();

// Multer: disque + nom unique + filtre vidéo
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || ".mp4").toLowerCase();
    const name = crypto.randomBytes(16).toString("hex") + ext;
    cb(null, name);
  },
});

const fileFilter: multer.Options["fileFilter"] = (_req, file, cb) => {
  if (file.mimetype && file.mimetype.startsWith("video/")) return cb(null, true);
  cb(new Error("Type de fichier non supporté (seules les vidéos sont acceptées)"));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 512 * 1024 * 1024 }, // 512 Mo
});

function truncateText(text: string | undefined, max = 280): string {
  if (!text) return "";
  // découpe Unicode-safe
  return Array.from(text).slice(0, max).join("");
}

// Réseaux connectés sur le profil Upload-Post, affichés sur la page de publication
router.get("/networks", verifyTokenMiddleware, async (_req: Request, res: Response) => {
  try {
    res.json({ networks: await networkStatus() });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[social] réseaux :", message);
    res.json({ networks: NETWORK_IDS.map((id) => ({ id, configured: false })), error: message });
  }
});

// Authentification vérifiée AVANT multer : aucun fichier écrit sans token valide.
// Réponse immédiate (202) avec l'id de la publication : compression et envoi continuent en
// arrière-plan, la page suit le résultat avec GET /video/posts/:id.
router.post("/publish", verifyTokenMiddleware, upload.single("video"), async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ status: "error", message: "Aucun fichier fourni" });
  }
  const sourcePath = req.file.path;

  const title = String(req.body?.title || "").trim();
  const description = truncateText(String(req.body?.description || "").trim(), 280);
  const requested = String(req.body?.networks || "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
  const networks = requested.filter((n): n is NetworkId => (NETWORK_IDS as readonly string[]).includes(n));

  if (!title || !description) {
    await fs.promises.unlink(sourcePath).catch(() => {});
    return res.status(400).json({ status: "error", message: "Titre et description obligatoires." });
  }
  if (requested.length && !networks.length) {
    await fs.promises.unlink(sourcePath).catch(() => {});
    return res.status(400).json({ status: "error", message: "Aucun réseau valide choisi." });
  }

  try {
    const id = await startPublication({ sourcePath, title, description, networks: networks.length ? networks : undefined, source: "site" });
    return res.status(202).json({ status: "running", id });
  } catch (error) {
    await fs.promises.unlink(sourcePath).catch(() => {});
    return res.status(500).json({ status: "error", message: error instanceof Error ? error.message : "Erreur serveur" });
  }
});

// Suivi d'une publication : status running | done | failed, résultat de chaque réseau
router.get("/posts/:id", verifyTokenMiddleware, async (req: Request, res: Response) => {
  const post = await getVideoPost(Number(req.params.id)).catch(() => null);
  if (!post) return res.status(404).json({ status: "error", message: "Publication introuvable." });
  return res.json({
    id: post.id,
    status: post.status,
    error: post.error,
    results: post.results ? JSON.parse(post.results) : [],
  });
});

// ✅ Middleware d'erreurs Multer (pour tailles, type, etc.)
router.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ status: "error", message: "Fichier trop volumineux" });
    }
    return res.status(400).json({ status: "error", message: `Erreur upload: ${err.code}` });
  }
  if (err && /Type de fichier non supporté/.test(err.message)) {
    return res.status(400).json({ status: "error", message: err.message });
  }
  return res.status(500).json({ status: "error", message: err?.message || "Erreur serveur" });
});

export default router;
