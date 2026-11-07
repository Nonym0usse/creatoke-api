import express, { type Request, type Response } from "express";
import verifyTokenMiddleware from "../../database/auth.ts";
import { execute, selectOne } from "../../database/mysql.ts";
import {
  clearLoginFailures,
  isLoginBlocked,
  recordLoginFailure,
  signToken,
  verifyAgainstDummy,
  verifyPassword,
} from "../../services/auth.ts";
import validator from "validator";
import { PasswordResetError, checkResetToken, requestPasswordReset, resetPassword } from "../../services/passwordReset.ts";

const router = express.Router();

type AdminRow = { id: string; email: string; password_hash: string };

router.post("/login", async (req: Request, res: Response) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!email || !password) {
    res.status(400).json({ error: "INVALID_CREDENTIALS" });
    return;
  }

  const keys = [`email:${email}`, `ip:${req.ip}`];
  if (isLoginBlocked(keys)) {
    res.status(429).json({ error: "TOO_MANY_ATTEMPTS" });
    return;
  }

  try {
    const admin = await selectOne<AdminRow>("SELECT id, email, password_hash FROM admins WHERE email = ?", [email]);
    const valid = admin ? await verifyPassword(password, admin.password_hash) : await verifyAgainstDummy(password);
    if (!admin || !valid) {
      recordLoginFailure(keys);
      res.status(401).json({ error: "INVALID_CREDENTIALS" });
      return;
    }

    clearLoginFailures(keys);
    await execute("UPDATE admins SET last_login_at = NOW() WHERE id = ?", [admin.id]);
    const user = { uid: admin.id, email: admin.email };
    res.status(200).json({ token: signToken(user, admin.password_hash), user });
  } catch (error) {
    console.error("Login failed:", error instanceof Error ? error.message : error);
    res.status(500).json({ error: "LOGIN_FAILED" });
  }
});

// Nouveau token pour une session encore valide (le compte doit toujours exister).
router.post("/refresh-token", verifyTokenMiddleware, async (req: Request, res: Response) => {
  try {
    const admin = req.user
      ? await selectOne<AdminRow>("SELECT id, email, password_hash FROM admins WHERE id = ?", [req.user.uid])
      : null;
    if (!admin) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    res.json({ idToken: signToken({ uid: admin.id, email: admin.email }, admin.password_hash) });
  } catch {
    res.status(500).json({ error: "Token refresh failed" });
  }
});

// ---- Mot de passe oublié ----

// Réponse identique que l'adresse soit celle d'un administrateur ou non, et
// immédiate : l'envoi du lien se fait ensuite, sans trahir l'existence du compte.
router.post("/forgot-password", (req: Request, res: Response) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
  if (!email || !validator.isEmail(email)) {
    res.status(400).json({ error: "INVALID_EMAIL" });
    return;
  }
  res.status(200).json({ ok: true });
  void requestPasswordReset(email, req.ip ?? "").catch((error) =>
    console.error("[password-reset] échec de la demande :", error instanceof Error ? error.message : error),
  );
});

// Le lien est-il encore valable ? (la page l'indique avant de demander le nouveau mot de passe)
router.post("/reset-password/check", async (req: Request, res: Response) => {
  try {
    const email = await checkResetToken(typeof req.body?.token === "string" ? req.body.token : "");
    if (!email) {
      res.status(400).json({ error: "INVALID_TOKEN" });
      return;
    }
    res.json({ email });
  } catch (error) {
    console.error("[password-reset] vérification :", error instanceof Error ? error.message : error);
    res.status(500).json({ error: "RESET_FAILED" });
  }
});

router.post("/reset-password", async (req: Request, res: Response) => {
  const token = typeof req.body?.token === "string" ? req.body.token : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  try {
    await resetPassword(token, password);
    res.json({ ok: true });
  } catch (error) {
    if (error instanceof PasswordResetError) {
      res.status(400).json({ error: error.message });
      return;
    }
    console.error("[password-reset] échec :", error instanceof Error ? error.message : error);
    res.status(500).json({ error: "RESET_FAILED" });
  }
});

export default router;
