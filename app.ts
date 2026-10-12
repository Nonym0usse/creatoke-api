import "dotenv/config";
import express, { type Request, type Response } from "express";
import fs from "node:fs";
import path from "node:path";
import cookieParser from "cookie-parser";
import cors from "cors";

import indexRouter from "./routes/index.ts";
import adminRouter from "./routes/admin/index.ts";
import contactRouter from "./routes/admin/contact.ts";
import categoryRouter from "./routes/admin/category.ts";
import licenceRouter from "./routes/admin/licence.ts";
import paymentRouter from "./routes/admin/payment.ts";
import commentRouter from "./routes/admin/comment.ts";
import authRouter from "./routes/admin/auth.ts";
import videoPublishRouter from "./routes/admin/videoPublish.ts";
import prospectRouter from "./routes/admin/prospect.ts";
import uploadRouter from "./routes/admin/upload.ts";
import sectionsRouter from "./routes/admin/sections.ts";
import mcpRouter from "./routes/mcp.ts";
import { UPLOAD_DIR } from "./services/storage.ts";

const app = express();

// Connecteur MCP (assistants IA) : avant le CORS et les lecteurs de corps
// globaux, car il a ses propres règles (en-têtes MCP, OAuth à la racine).
app.use(mcpRouter);

// CORS (consolidé : remplace l'ancien header manuel + cors() en double)
app.use(
  cors({
    origin: "*",
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["Content-Type"],
  }),
);

app.use(express.json({ limit: "200mb" }));
app.use(express.urlencoded({ extended: true, limit: "200mb", parameterLimit: 1000000 }));
app.use(cookieParser());

// Derrière le proxy d'o2switch (Passenger se connecte depuis 127.0.0.1) : on ne fait
// confiance qu'à lui pour X-Forwarded-For, qu'il réécrit avec l'IP réelle du visiteur.
// Avec `true`, n'importe qui joignant l'API autrement pourrait choisir son IP.
app.set("trust proxy", "loopback");
app.use("/uploads", express.static(UPLOAD_DIR, { maxAge: "7d" }));

// Anciens liens de téléchargement : le front ajoutait ".mp3"/".wav" à l'URL du
// fichier (sans effet avec Firebase, où l'ajout tombait dans le token). Ces liens
// ont été envoyés par email : on sert le fichier sans l'extension en trop.
app.get(/^\/uploads\/.+\.(mp3|wav)$/i, (req: Request, res: Response, next) => {
  let requested: string;
  try {
    requested = decodeURIComponent(req.path.slice("/uploads/".length));
  } catch {
    return next();
  }
  const original = path.resolve(UPLOAD_DIR, requested.replace(/\.(mp3|wav)$/i, ""));
  if (!original.startsWith(UPLOAD_DIR + path.sep) || !fs.existsSync(original)) return next();
  res.sendFile(original, { maxAge: "7d" });
});

app.use("/", indexRouter);
app.use("/admin", adminRouter);
app.use("/contact", contactRouter);
app.use("/category", categoryRouter);
app.use("/licence", licenceRouter);
app.use("/payment", paymentRouter);
app.use("/comment", commentRouter);
app.use("/auth", authRouter);
app.use("/video", videoPublishRouter);
app.use("/prospect", prospectRouter);
app.use("/upload", uploadRouter);
app.use("/sections", sectionsRouter);

app.use(express.static(path.join(import.meta.dirname, "public")));

// 404
app.use((_req: Request, res: Response) => {
  res.status(404).sendFile(path.join(import.meta.dirname, "public", "404.html"));
});

export default app;
