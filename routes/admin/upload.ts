// routes/admin/upload.ts — envoi de fichiers depuis l'admin (remplace Firebase Storage)
import express, { type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import path from "node:path";
import verifyTokenMiddleware from "../../database/auth.ts";
import { UPLOAD_DIR, buildPublicUrl, isPublicDir, uniqueFileName } from "../../services/storage.ts";

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    cb(null, path.join(UPLOAD_DIR, String(req.params.dir)));
  },
  filename: (_req, file, cb) => {
    // multer décode le nom en latin1 : on rétablit l'UTF-8 (accents).
    cb(null, uniqueFileName(Buffer.from(file.originalname, "latin1").toString("utf8")));
  },
});

const fileFilter: multer.Options["fileFilter"] = (_req, file, cb) => {
  if (file.mimetype?.startsWith("audio/") || file.mimetype?.startsWith("image/")) return cb(null, true);
  cb(new Error("Type de fichier non supporté (audio ou image uniquement)"));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 Mo (fichiers WAV)
});

const checkDir = (req: Request, res: Response, next: NextFunction): void => {
  if (!isPublicDir(String(req.params.dir))) {
    res.status(400).json({ error: "INVALID_DIR" });
    return;
  }
  next();
};

// Authentification vérifiée AVANT multer : aucun fichier écrit sans token valide.
router.post("/:dir", verifyTokenMiddleware, checkDir, upload.single("file"), (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: "NO_FILE" });
    return;
  }
  const relativePath = `${req.params.dir}/${req.file.filename}`;
  const url = buildPublicUrl(req, relativePath);
  if (!url) {
    res.status(500).json({ error: "PUBLIC_URL_UNAVAILABLE" });
    return;
  }
  res.status(200).json({ url, fileName: req.file.filename, path: relativePath });
});

router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    res.status(400).json({ error: err.code });
    return;
  }
  res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
});

export default router;
