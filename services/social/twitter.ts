// services/social/twitter.ts — post X (Twitter) avec le lien YouTube, signé en OAuth 1.0a
import axios from "axios";
import crypto from "node:crypto";
import { REQUEST_TIMEOUT_MS, graphemes, type VideoPost } from "./common.ts";

const TWEETS_URL = "https://api.x.com/2/tweets";

// Les jetons OAuth 1.0a du compte n'expirent pas (contrairement à OAuth 2.0)
export function twitterConfigured(): boolean {
  return Boolean(
    process.env.X_API_KEY && process.env.X_API_SECRET && process.env.X_ACCESS_TOKEN && process.env.X_ACCESS_TOKEN_SECRET,
  );
}

// Encodage RFC 3986 exigé par OAuth 1.0a
const enc = (value: string) =>
  encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

interface OAuthKeys {
  consumerKey: string;
  consumerSecret: string;
  token: string;
  tokenSecret: string;
}

// En-tête Authorization OAuth 1.0a (HMAC-SHA1). Le corps JSON n'entre pas dans la signature.
export function oauthHeader(
  method: string,
  url: string,
  keys: OAuthKeys,
  params: Record<string, string> = {},
  nonce = crypto.randomBytes(16).toString("hex"),
  timestamp = Math.floor(Date.now() / 1000).toString(),
): string {
  const oauth: Record<string, string> = {
    oauth_consumer_key: keys.consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp,
    oauth_token: keys.token,
    oauth_version: "1.0",
  };
  const all: Record<string, string> = { ...params, ...oauth };
  const paramString = Object.keys(all)
    .map((k) => [enc(k), enc(all[k])])
    .sort(([a, av], [b, bv]) => (a === b ? (av < bv ? -1 : 1) : a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const base = [method.toUpperCase(), enc(url), enc(paramString)].join("&");
  const signingKey = `${enc(keys.consumerSecret)}&${enc(keys.tokenSecret)}`;
  oauth.oauth_signature = crypto.createHmac("sha1", signingKey).update(base).digest("base64");

  return (
    "OAuth " +
    Object.keys(oauth)
      .sort()
      .map((k) => `${enc(k)}="${enc(oauth[k])}"`)
      .join(", ")
  );
}

export function twitterKeys(): OAuthKeys {
  return {
    consumerKey: process.env.X_API_KEY as string,
    consumerSecret: process.env.X_API_SECRET as string,
    token: process.env.X_ACCESS_TOKEN as string,
    tokenSecret: process.env.X_ACCESS_TOKEN_SECRET as string,
  };
}

// Poids X : 1 pour la plupart des caractères latins, 2 pour les emojis et les idéogrammes.
// Un lien compte toujours pour 23.
function weight(grapheme: string): number {
  const cp = grapheme.codePointAt(0) ?? 0;
  const light =
    grapheme.length === 1 &&
    (cp <= 0x10ff || (cp >= 0x2000 && cp <= 0x200d) || (cp >= 0x2010 && cp <= 0x201f) || (cp >= 0x2032 && cp <= 0x2037));
  return light ? 1 : 2;
}

export function tweetText(description: string, link: string): string {
  const budget = 280 - 23 - 1; // lien + espace
  let used = 0;
  let text = "";
  const parts = graphemes(description.trim());
  for (const [i, g] of parts.entries()) {
    const remaining = parts.length - i;
    // Garde la place des points de suspension si le texte doit être coupé
    if (used + weight(g) > budget - (remaining > 1 ? 1 : 0)) {
      text = text.trimEnd() + "…";
      break;
    }
    text += g;
    used += weight(g);
  }
  return text ? `${text} ${link}` : link;
}

export async function publishTwitter(post: VideoPost, link: string): Promise<{ url: string }> {
  const { data } = await axios.post(
    TWEETS_URL,
    { text: tweetText(post.description, link) },
    {
      headers: { Authorization: oauthHeader("POST", TWEETS_URL, twitterKeys()), "Content-Type": "application/json" },
      timeout: REQUEST_TIMEOUT_MS,
    },
  );
  const id = data?.data?.id;
  if (!id) throw new Error("X n'a pas renvoyé d'identifiant de post.");
  return { url: `https://x.com/i/web/status/${id}` };
}
