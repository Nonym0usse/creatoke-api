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
    res.status(200).json({ token: signToken(user), user });
  } catch (error) {
    console.error("Login failed:", error instanceof Error ? error.message : error);
    res.status(500).json({ error: "LOGIN_FAILED" });
  }
});

// Nouveau token pour une session encore valide (le compte doit toujours exister).
router.post("/refresh-token", verifyTokenMiddleware, async (req: Request, res: Response) => {
  try {
    const admin = req.user ? await selectOne<AdminRow>("SELECT id, email FROM admins WHERE id = ?", [req.user.uid]) : null;
    if (!admin) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    res.json({ idToken: signToken({ uid: admin.id, email: admin.email }) });
  } catch {
    res.status(500).json({ error: "Token refresh failed" });
  }
});

export default router;
