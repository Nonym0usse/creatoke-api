import "dotenv/config";
import express, { type Request, type Response } from "express";
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
import renewTokenRouter from "./routes/admin/renew-token.ts";
import n8nRouter from "./routes/admin/n8n.ts";

const app = express();

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

app.set("trust proxy", true); // important derrière nginx/traefik
app.use("/uploads", express.static(path.join(process.cwd(), "uploads"), { maxAge: "7d" }));

app.use("/", indexRouter);
app.use("/admin", adminRouter);
app.use("/contact", contactRouter);
app.use("/category", categoryRouter);
app.use("/licence", licenceRouter);
app.use("/payment", paymentRouter);
app.use("/comment", commentRouter);
app.use("/auth", renewTokenRouter);
app.use("/n8n", n8nRouter);

app.use(express.static(path.join(import.meta.dirname, "public")));

// 404
app.use((_req: Request, res: Response) => {
  res.status(404).sendFile(path.join(import.meta.dirname, "public", "404.html"));
});

export default app;
