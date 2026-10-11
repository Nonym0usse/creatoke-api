import crypto from "node:crypto";
import { promisify } from "node:util";
import jwt from "jsonwebtoken";

// Authentification des administrateurs (remplace Firebase Auth).
// Mots de passe : scrypt salé. Sessions : JWT HS256 signé avec JWT_SECRET.

const scrypt = promisify(crypto.scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: crypto.ScryptOptions,
) => Promise<Buffer>;

const SCRYPT = { N: 16384, r: 8, p: 1 } as const;
const KEY_LENGTH = 64;
export const TOKEN_TTL = "7d";

export interface AuthUser {
  uid: string;
  email: string;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, KEY_LENGTH, SCRYPT);
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64"), hash.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, r, p, salt, hash] = stored.split("$");
  if (algo !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scrypt(password, Buffer.from(salt, "base64"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return crypto.timingSafeEqual(actual, expected);
}

// Hash factice : la vérification prend le même temps qu'un email existe ou non.
const DUMMY_HASH = await hashPassword(crypto.randomBytes(16).toString("hex"));
export const verifyAgainstDummy = (password: string): Promise<boolean> => verifyPassword(password, DUMMY_HASH);

function secret(): string {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32) throw new Error("JWT_SECRET manquant ou trop court (32 caractères minimum)");
  return value;
}

export function signToken(user: AuthUser): string {
  return jwt.sign({ email: user.email }, secret(), {
    algorithm: "HS256",
    subject: user.uid,
    expiresIn: TOKEN_TTL,
  });
}

export function verifyToken(token: string): AuthUser {
  const payload = jwt.verify(token, secret(), { algorithms: ["HS256"] });
  if (typeof payload === "string" || !payload.sub) throw new Error("INVALID_TOKEN");
  return { uid: payload.sub, email: String(payload.email ?? "") };
}

// Limite les essais de connexion : 10 échecs par email ou par IP sur 15 minutes.
const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60 * 1000;
const failures = new Map<string, { count: number; resetAt: number }>();

export function isLoginBlocked(keys: string[]): boolean {
  const now = Date.now();
  return keys.some((key) => {
    const entry = failures.get(key);
    return entry !== undefined && entry.resetAt > now && entry.count >= MAX_FAILURES;
  });
}

export function recordLoginFailure(keys: string[]): void {
  const now = Date.now();
  for (const key of keys) {
    const entry = failures.get(key);
    if (!entry || entry.resetAt <= now) failures.set(key, { count: 1, resetAt: now + WINDOW_MS });
    else entry.count++;
  }
}

export function clearLoginFailures(keys: string[]): void {
  for (const key of keys) failures.delete(key);
}
