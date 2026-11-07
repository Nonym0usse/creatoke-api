// routes/siteVisits.ts — compteur de visites (signal du site, lecture par la page Statistiques)
import express, { type Request, type Response } from "express";
import verifyTokenMiddleware from "../database/auth.ts";
import { isBot, recordVisit, visitsByMonth } from "../services/siteVisits.ts";

const router = express.Router();

// Signal envoyé par le site au chargement (public, sans cookie). Répond toujours 204 :
// un robot ou une erreur ne doivent rien changer pour le visiteur.
router.post("/visit", (req: Request, res: Response) => {
  res.status(204).end();
  const userAgent = String(req.get("user-agent") ?? "");
  if (isBot(userAgent)) return;
  // Derrière Passenger, l'IP du visiteur peut n'arriver que dans X-Forwarded-For
  const forwarded = String(req.get("x-forwarded-for") ?? "").split(",")[0].trim();
  const ip = forwarded || req.get("x-real-ip") || req.ip || req.socket.remoteAddress || "";
  void recordVisit(ip, userAgent).catch((error) =>
    console.error("[visites] :", error instanceof Error ? error.message : error),
  );
});

// Visites par mois d'une année (administrateurs)
router.get("/visits", verifyTokenMiddleware, async (req: Request, res: Response) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  try {
    res.json({ year, months: await visitsByMonth(year) });
  } catch (error) {
    console.error("[visites] lecture :", error instanceof Error ? error.message : error);
    res.status(500).json({ error: "VISITS_UNAVAILABLE" });
  }
});

export default router;
