import type { Request, Response, NextFunction } from "express";
import { passwordVersion, verifyToken, type TokenClaims } from "../services/auth.ts";
import { selectOne } from "./mysql.ts";

// Une session n'est acceptée que si le compte existe toujours et que son mot de passe
// n'a pas changé depuis l'ouverture de la session (« mot de passe oublié »).
// Empreinte du mot de passe gardée 30 secondes en mémoire pour éviter une requête par appel.
const CACHE_MS = 30 * 1000;
const cache = new Map<string, { version: string | null; at: number }>();

export function forgetSessionCache(adminId: string): void {
  cache.delete(adminId);
}

async function currentVersion(adminId: string): Promise<string | null> {
  const hit = cache.get(adminId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.version;
  const row = await selectOne<{ password_hash: string }>("SELECT password_hash FROM admins WHERE id = ?", [adminId]);
  const version = row ? passwordVersion(row.password_hash) : null;
  cache.set(adminId, { version, at: Date.now() });
  return version;
}

async function sessionStillValid(claims: TokenClaims): Promise<boolean> {
  const version = await currentVersion(claims.uid);
  if (version === null) return false; // compte supprimé
  if (claims.pv) return claims.pv === version;
  // Jetons émis avant l'ajout de l'empreinte : refusés si le mot de passe a été réinitialisé depuis.
  // Table absente (création au démarrage ratée) : la session reste acceptée, comme avant.
  const reset = await selectOne(
    "SELECT 1 AS found FROM admin_password_resets WHERE admin_id = ? AND used_at >= FROM_UNIXTIME(?) LIMIT 1",
    [claims.uid, claims.iat ?? 0],
  ).catch(() => null);
  return !reset;
}

const verifyTokenMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const token = req.headers.authorization?.split(" ")[1]; // Expecting "Bearer <token>"
  if (!token || token === "null") {
    res.status(401).json({ message: "No token provided, authorization denied" });
    return;
  }

  let claims: TokenClaims;
  try {
    claims = verifyToken(token);
  } catch (error) {
    console.error("Error verifying token:", error instanceof Error ? error.message : error);
    res.status(401).json({ message: "Token verification failed, authorization denied" });
    return;
  }

  try {
    if (!(await sessionStillValid(claims))) {
      res.status(401).json({ message: "Session expired, please sign in again" });
      return;
    }
  } catch (error) {
    console.error("Error checking session:", error instanceof Error ? error.message : error);
    res.status(503).json({ message: "Service temporarily unavailable" });
    return;
  }

  req.user = { uid: claims.uid, email: claims.email };
  next();
};

export default verifyTokenMiddleware;
