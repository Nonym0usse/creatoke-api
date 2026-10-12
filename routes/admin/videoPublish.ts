// routes/admin/videoPublish.ts — envoi d'une vidéo et publication sur les réseaux sociaux
import express, { type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { networkStatus, publishVideo } from "../../services/social/publish.ts";
import { recordVideoPost } from "../../services/social/history.ts";
import { videoCompress } from "../../utils/videoCompress.ts";
import { UPLOAD_DIR, buildPublicUrl } from "../../services/storage.ts";
import verifyTokenMiddleware from "../../database/auth.ts";

const router = express.Router();
const fsp = fs.promises;

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

// Historique (table video_posts) : un échec d'écriture ne doit jamais bloquer la publication.
const remember = (post: Parameters<typeof recordVideoPost>[0]) =>
  recordVideoPost(post).catch((error) => console.error("[social] historique :", error instanceof Error ? error.message : error));

function truncateText(text: string | undefined, max = 280): string {
  if (!text) return "";
  // découpe Unicode-safe
  return Array.from(text).slice(0, max).join("");
}

// Réseaux configurés (variables d'environnement présentes), affichés sur la page de publication
router.get("/networks", verifyTokenMiddleware, (_req: Request, res: Response) => {
  res.json({ networks: networkStatus() });
});

// Authentification vérifiée AVANT multer : aucun fichier écrit sans token valide.
// La réponse détaille le résultat de chaque réseau : un échec n'annule pas les autres publications.
router.post("/publish", verifyTokenMiddleware, upload.single("video"), async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ status: "error", message: "Aucun fichier fourni" });
  }

  const sourcePath = req.file.path;
  const compressedName = req.file.filename.replace(/(\.[^.]+)$/, "_compressed.mp4");
  const compressedPath = path.join(UPLOAD_DIR, compressedName);

  const title = String(req.body?.title || "").trim();
  const description = truncateText(String(req.body?.description || "").trim(), 280);

  try {
    await videoCompress(sourcePath, compressedPath);
  } catch (error) {
    await fsp.unlink(compressedPath).catch(() => {});
    const message = `Compression impossible : ${error instanceof Error ? error.message : "erreur inconnue"}`;
    await remember({ title, description, source: "site", error: message });
    return res.status(500).json({ status: "error", message });
  } finally {
    await fsp.unlink(sourcePath).catch(() => {});
  }

  // Le fichier compressé reste dans uploads/ : Instagram et Facebook le téléchargent par son URL
  const publicUrl = buildPublicUrl(req, compressedName);
  if (!publicUrl) {
    return res.status(500).json({ status: "error", message: "Impossible de construire l'URL publique." });
  }

  const results = await publishVideo({
    title,
    description,
    filePath: compressedPath,
    publicUrl,
    mimeType: "video/mp4",
  });
  await remember({ title, description, source: "site", videoUrl: publicUrl, results });

  return res.status(200).json({ status: "ok", videoUrl: publicUrl, results });
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
