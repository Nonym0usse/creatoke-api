// services/social/common.ts — types et utilitaires partagés par la publication des vidéos
import axios from "axios";

// Réseaux proposés à la publication (via Upload-Post). « twitter » désigne X : identifiant
// conservé pour l'historique déjà enregistré.
export const NETWORK_IDS = ["instagram", "tiktok", "youtube", "facebook", "linkedin", "twitter", "threads", "bluesky"] as const;
export type NetworkId = (typeof NETWORK_IDS)[number];

export const NETWORK_NAMES: Record<NetworkId, string> = {
  instagram: "Instagram (Reel)",
  tiktok: "TikTok",
  youtube: "YouTube",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  twitter: "X (Twitter)",
  threads: "Threads",
  bluesky: "Bluesky",
};

// Vidéo à publier : fichier compressé sur le disque.
// `texts` remplace `description` pour les réseaux qui ont leur propre texte.
export interface VideoPost {
  title: string;
  description: string;
  texts?: Partial<Record<NetworkId, string>>;
  filePath: string;
}

// Texte publié sur un réseau : son texte dédié s'il existe, sinon le texte commun
export function textFor(post: Pick<VideoPost, "description" | "texts">, network: NetworkId): string {
  return post.texts?.[network]?.trim() || post.description;
}

export interface PublishResult {
  network: NetworkId;
  status: "ok" | "error" | "skipped";
  url?: string;
  message?: string;
}

const segmenter = new Intl.Segmenter("fr", { granularity: "grapheme" });

export function graphemes(text: string): string[] {
  return Array.from(segmenter.segment(text), (s) => s.segment);
}

// Tronque sans couper un emoji ou un caractère accentué composé
export function truncate(text: string, max: number, ellipsis = "…"): string {
  const parts = graphemes(text);
  if (parts.length <= max) return text;
  return parts.slice(0, Math.max(0, max - ellipsis.length)).join("").trimEnd() + ellipsis;
}

// Poids X : 1 pour la plupart des caractères latins, 2 pour les emojis et les idéogrammes
function tweetCharWeight(grapheme: string): number {
  const cp = grapheme.codePointAt(0) ?? 0;
  const light =
    grapheme.length === 1 &&
    (cp <= 0x10ff || (cp >= 0x2000 && cp <= 0x200d) || (cp >= 0x2010 && cp <= 0x201f) || (cp >= 0x2032 && cp <= 0x2037));
  return light ? 1 : 2;
}

export function tweetWeight(text: string): number {
  return graphemes(text.trim()).reduce((sum, g) => sum + tweetCharWeight(g), 0);
}

// Texte trop long pour un réseau : message d'erreur, sinon null (limites documentées par Upload-Post)
export function textProblem(network: NetworkId, text: string): string | null {
  const name = NETWORK_NAMES[network];
  const length = graphemes(text).length;
  const over = (max: number) => (length > max ? `${name} : ${length} caractères, ${max.toLocaleString("fr-FR")} maximum.` : null);
  switch (network) {
    case "instagram": {
      const hashtags = text.match(/(^|\s)#[\p{L}\p{N}_]+/gu)?.length ?? 0;
      if (hashtags > 30) return `${name} : ${hashtags} hashtags, 30 maximum.`;
      return over(2200);
    }
    case "tiktok":
      return text.length > 2200 ? `${name} : ${text.length} caractères (un emoji compte double), 2 200 maximum.` : null;
    case "youtube": {
      const bytes = Buffer.byteLength(text.replace(/[<>]/g, ""), "utf8");
      return bytes > 5000 ? `${name} : texte trop long (${bytes} octets, 5 000 maximum ; un accent ou un emoji compte pour plusieurs octets).` : null;
    }
    case "threads": {
      const bytes = Buffer.byteLength(text, "utf8");
      return bytes > 500 ? `${name} : texte trop long (${bytes} octets, 500 maximum ; un accent ou un emoji compte pour plusieurs octets).` : null;
    }
    case "twitter": {
      const weight = tweetWeight(text);
      return weight > 280 ? `${name} : ${weight} caractères décomptés (un emoji compte double), 280 maximum.` : null;
    }
    case "bluesky":
      return over(300);
    case "linkedin":
      return over(3000);
    case "facebook":
      return over(5000);
  }
}

// Filet de sécurité : coupe le texte (sans couper un caractère) s'il dépasse la limite du réseau
export function fitText(network: NetworkId, text: string): string {
  if (!textProblem(network, text)) return text;
  const parts = graphemes(text);
  let low = 0;
  let high = parts.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (textProblem(network, parts.slice(0, mid).join("").trimEnd() + "…")) high = mid - 1;
    else low = mid;
  }
  return parts.slice(0, low).join("").trimEnd() + "…";
}

// Message lisible à partir d'une erreur axios (Upload-Post) ou JS
export function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as any;
    const detail =
      data?.message ||
      (typeof data?.error === "string" ? data.error : "") ||
      data?.error?.message ||
      data?.details ||
      data?.detail;
    const status = error.response?.status;
    if (detail) return status ? `${detail} (HTTP ${status})` : String(detail);
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}
