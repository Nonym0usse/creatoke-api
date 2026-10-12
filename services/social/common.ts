// services/social/common.ts — types et utilitaires partagés par les réseaux sociaux
import axios from "axios";

export type NetworkId = "instagram" | "facebook" | "youtube" | "bluesky" | "linkedin" | "twitter";

// Vidéo à publier : fichier compressé sur le disque + URL publique (Instagram et Facebook la téléchargent)
export interface VideoPost {
  title: string;
  description: string;
  filePath: string;
  publicUrl: string;
  mimeType: string;
}

export interface PublishResult {
  network: NetworkId;
  status: "ok" | "error" | "skipped";
  url?: string;
  message?: string;
}

// Délai maximum d'un appel réseau (les envois de vidéo peuvent être longs)
export const UPLOAD_TIMEOUT_MS = 10 * 60 * 1000;
export const REQUEST_TIMEOUT_MS = 60 * 1000;

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

// Message lisible à partir d'une erreur axios (Meta, Google, LinkedIn, X, Bluesky) ou JS
export function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as any;
    const detail =
      data?.error?.message ||
      data?.error_description ||
      (typeof data?.error === "string" ? data.error : "") ||
      data?.message ||
      data?.detail ||
      data?.title ||
      data?.errors?.[0]?.message;
    const status = error.response?.status;
    if (detail) return status ? `${detail} (HTTP ${status})` : String(detail);
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}
