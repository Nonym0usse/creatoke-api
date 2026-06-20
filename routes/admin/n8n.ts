// routes/admin/n8n.ts — upload + publication (ESM / TypeScript)
import express, { type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import axios from "axios";
import FormData from "form-data";
import { Bluesky } from "../../middleware/admin/BlueSky.ts";
import { Instagram } from "../../middleware/admin/Instagram.ts";
import { videoCompress } from "../../utils/videoCompress.ts";

const router = express.Router();
const fsp = fs.promises;

// ---- Config ----
const UPLOAD_DIR = path.join(process.cwd(), "uploads");
const BASE_PUBLIC_URL = (process.env.BASE_PUBLIC_URL || "").replace(/\/+$/, ""); // ex: https://api.creatoke.fr
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

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

// URL publique robuste
function buildPublicUrl(req: Request, filename: string): string | null {
  if (BASE_PUBLIC_URL) {
    return `${BASE_PUBLIC_URL}/uploads/${encodeURIComponent(filename)}`;
  }
  const forwardedProto = req.headers["x-forwarded-proto"];
  const proto =
    (typeof forwardedProto === "string" && forwardedProto.split(",")[0].trim()) ||
    req.protocol ||
    "https";
  const host = req.get("x-forwarded-host") || req.get("host");
  if (!host) return null;
  return `${proto}://${host.replace(/\/+$/, "")}/uploads/${encodeURIComponent(filename)}`;
}

router.post("/api/upload", upload.single("video"), async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ status: "error", message: "Aucun fichier fourni" });
  }

  let filePath = req.file.path;
  let fileName = req.file.filename;

  try {
    const compressedName = fileName.replace(/(\.[^.]+)$/, "_compressed$1");
    const compressedPath = path.join(UPLOAD_DIR, compressedName);

    await videoCompress(filePath, compressedPath);
    await fsp.unlink(filePath).catch(() => {});
    filePath = compressedPath;
    fileName = compressedName;

    const publicUrl = buildPublicUrl(req, fileName);
    const title = (req.body && req.body.title) || "";
    const description = truncateText(req.body?.description, 280);

    if (!publicUrl) {
      return res.status(500).json({
        status: "error",
        message: "Impossible de construire l'URL publique.",
      });
    }

    const blueSky = new Bluesky();
    const ig = new Instagram();
    const formData = new FormData();

    const blueSkyJwt = await blueSky.loginOnBlueSky();
    await ig.publishReel(description, publicUrl);

    formData.append("video", fs.createReadStream(filePath), {
      filename: req.file.originalname || fileName,
      contentType: req.file.mimetype || "video/mp4",
    });
    formData.append("title", title);
    formData.append("description", description);
    formData.append("blueSkyJwt", blueSkyJwt);
    formData.append("videoUrl", publicUrl);

    const n8nResponse = await axios.post(process.env.N8N_WEBHOOK_URL as string, formData, {
      headers: formData.getHeaders(),
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout: 5 * 60 * 1000,
    });

    return res.status(200).json({
      status: "ok",
      file: fileName,
      videoUrl: publicUrl,
      n8n: n8nResponse.data,
    });
  } catch (error) {
    const status = (axios.isAxiosError(error) && error.response?.status) || 500;
    const message = axios.isAxiosError(error)
      ? error.response?.data || error.message
      : error instanceof Error
        ? error.message
        : "Échec envoi n8n";
    return res.status(status).json({ status: "error", message });
  }
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
