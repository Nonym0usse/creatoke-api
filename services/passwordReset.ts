// services/passwordReset.ts — « mot de passe oublié » des administrateurs
//
// 1. requestPasswordReset : si l'adresse est celle d'un administrateur, envoie un
//    lien à usage unique valable une heure. Aucune différence de réponse visible
//    selon que l'adresse existe ou non.
// 2. resetPassword : enregistre le nouveau mot de passe, ferme toutes les sessions
//    (site et assistant IA) et prévient l'administrateur par e-mail.
import crypto from "node:crypto";
import path from "node:path";
import { execute, selectOne } from "../database/mysql.ts";
import { forgetSessionCache } from "../database/auth.ts";
import { clearLoginFailures, hashPassword } from "./auth.ts";
import { MAIL_FROM, renderEmailTemplate, transporter } from "./mailer.ts";
import { SITE_URL } from "../mcp/shared.ts";

export const MIN_PASSWORD_LENGTH = 10;
const MAX_PASSWORD_LENGTH = 200;
const LINK_TTL_MINUTES = 60;

// Demandes limitées : 3 par adresse et 10 par IP sur une heure (au-delà, rien n'est envoyé).
const LIMITS = { email: 3, ip: 10 } as const;
const WINDOW_MS = 60 * 60 * 1000;
const requests = new Map<string, { count: number; resetAt: number }>();

function allowRequest(key: string, max: number): boolean {
  const now = Date.now();
  const entry = requests.get(key);
  if (!entry || entry.resetAt <= now) {
    requests.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  entry.count++;
  return entry.count <= max;
}

const sha256 = (value: string): string => crypto.createHash("sha256").update(value).digest("hex");

type AdminRow = { id: string; email: string };

async function sendMail(to: string, subject: string, template: string, data: Record<string, unknown>): Promise<void> {
  const html = await renderEmailTemplate(path.join("templates", template), data);
  await transporter.sendMail({ from: MAIL_FROM, to, subject, html });
}

/** Envoie le lien de réinitialisation si l'adresse est celle d'un administrateur. Ne lève jamais d'erreur visible. */
export async function requestPasswordReset(rawEmail: string, ip: string): Promise<void> {
  const email = rawEmail.trim().toLowerCase();
  const byEmail = allowRequest(`email:${email}`, LIMITS.email);
  const byIp = allowRequest(`ip:${ip}`, LIMITS.ip);
  if (!byEmail || !byIp) {
    console.warn(`[password-reset] demande ignorée (trop de demandes) pour ${email} depuis ${ip}`);
    return;
  }

  const admin = await selectOne<AdminRow>("SELECT id, email FROM admins WHERE email = ?", [email]);
  if (!admin) return;

  // Un seul lien valable à la fois : les précédents non utilisés sont supprimés.
  await execute("DELETE FROM admin_password_resets WHERE admin_id = ? AND used_at IS NULL", [admin.id]);
  const token = crypto.randomBytes(32).toString("base64url");
  await execute(
    `INSERT INTO admin_password_resets (token_hash, admin_id, expires_at, ip)
     VALUES (?, ?, UTC_TIMESTAMP() + INTERVAL ? MINUTE, ?)`,
    [sha256(token), admin.id, LINK_TTL_MINUTES, ip.slice(0, 64)],
  );

  await sendMail(admin.email, "Créatoké : réinitialisation de votre mot de passe", "password-reset.ejs", {
    link: `${SITE_URL}/nouveau-mot-de-passe?token=${encodeURIComponent(token)}`,
    minutes: LINK_TTL_MINUTES,
  });
  console.log(`[password-reset] lien envoyé à ${admin.email}`);
}

/** Adresse du compte si le lien est encore valable, sinon null. */
export async function checkResetToken(token: string): Promise<string | null> {
  if (!token) return null;
  const row = await selectOne<{ email: string }>(
    `SELECT a.email FROM admin_password_resets r JOIN admins a ON a.id = r.admin_id
      WHERE r.token_hash = ? AND r.used_at IS NULL AND r.expires_at > UTC_TIMESTAMP()`,
    [sha256(token)],
  );
  return row?.email ?? null;
}

export class PasswordResetError extends Error {}

export async function resetPassword(token: string, password: string): Promise<void> {
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    throw new PasswordResetError("WEAK_PASSWORD");
  }
  const tokenHash = sha256(token || "");

  // Le lien est consommé avant tout changement : deux envois simultanés ne peuvent pas l'utiliser tous les deux.
  const claimed = await execute(
    `UPDATE admin_password_resets SET used_at = UTC_TIMESTAMP()
      WHERE token_hash = ? AND used_at IS NULL AND expires_at > UTC_TIMESTAMP()`,
    [tokenHash],
  );
  if (claimed.affectedRows !== 1) throw new PasswordResetError("INVALID_TOKEN");

  const admin = await selectOne<AdminRow>(
    "SELECT a.id, a.email FROM admin_password_resets r JOIN admins a ON a.id = r.admin_id WHERE r.token_hash = ?",
    [tokenHash],
  );
  if (!admin) throw new PasswordResetError("INVALID_TOKEN");

  await execute("UPDATE admins SET password_hash = ? WHERE id = ?", [await hashPassword(password), admin.id]);
  // Autres liens supprimés ; assistant IA déconnecté ; sessions du site refusées dès leur prochain appel.
  await execute("DELETE FROM admin_password_resets WHERE admin_id = ? AND used_at IS NULL", [admin.id]);
  await execute("DELETE FROM mcp_tokens WHERE admin_id = ?", [admin.id]);
  forgetSessionCache(admin.id);
  clearLoginFailures([`email:${admin.email}`]);

  await sendMail(admin.email, "Créatoké : votre mot de passe a été modifié", "password-changed.ejs", {
    loginUrl: `${SITE_URL}/login`,
    date: new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "long", timeStyle: "short" }),
  }).catch((error) => console.error("[password-reset] e-mail de confirmation :", error instanceof Error ? error.message : error));
  console.log(`[password-reset] mot de passe modifié pour ${admin.email}`);
}
