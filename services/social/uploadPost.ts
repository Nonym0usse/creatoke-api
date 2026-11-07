// services/social/uploadPost.ts — publication des vidéos sur les réseaux via Upload-Post
//
// Un seul compte Upload-Post (clé UPLOAD_POST_API_KEY) et un profil (UPLOAD_POST_USER)
// sur lequel les réseaux sont connectés depuis le tableau de bord app.upload-post.com.
// La vidéo est envoyée une fois ; Upload-Post la publie sur chaque réseau en arrière-plan.
// On suit ensuite l'envoi (statut, puis historique pour les liens) jusqu'au résultat de chaque réseau.
//
// Doc : https://docs.upload-post.com/api/upload-video
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { NETWORK_IDS, fitText, textFor, truncate, type NetworkId, type PublishResult, type VideoPost } from "./common.ts";

const API = "https://api.upload-post.com/api";
const REQUEST_TIMEOUT_MS = 60 * 1000;
const UPLOAD_TIMEOUT_MS = 15 * 60 * 1000;
// Suivi de la publication : toutes les 10 s (cache du statut côté Upload-Post), 30 minutes au plus
const POLL_INTERVAL_MS = 10 * 1000;
const POLL_MAX_MS = 30 * 60 * 1000;

// Nom du réseau chez Upload-Post
const PLATFORM: Record<NetworkId, string> = {
  instagram: "instagram",
  tiktok: "tiktok",
  youtube: "youtube",
  facebook: "facebook",
  linkedin: "linkedin",
  twitter: "x",
  threads: "threads",
  bluesky: "bluesky",
};
const NETWORK_OF = Object.fromEntries(Object.entries(PLATFORM).map(([id, platform]) => [platform, id])) as Record<string, NetworkId>;

export function uploadPostConfigured(): boolean {
  return Boolean(process.env.UPLOAD_POST_API_KEY);
}

class UploadPostError extends Error {}

async function call<T = any>(method: "GET" | "POST", endpoint: string, init: { body?: FormData; headers?: Record<string, string>; timeout?: number } = {}): Promise<T> {
  const key = process.env.UPLOAD_POST_API_KEY;
  if (!key) throw new UploadPostError("Clé Upload-Post absente du serveur (UPLOAD_POST_API_KEY).");
  const response = await fetch(`${API}${endpoint}`, {
    method,
    headers: { Authorization: `Apikey ${key}`, ...init.headers },
    body: init.body,
    signal: AbortSignal.timeout(init.timeout ?? REQUEST_TIMEOUT_MS),
  });
  const text = await response.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // réponse non JSON (page d'erreur d'un proxy)
  }
  if (!response.ok) {
    const detail = data?.message || (typeof data?.error === "string" ? data.error : "") || data?.details || text.slice(0, 200);
    throw new UploadPostError(`Upload-Post : ${detail || "erreur"} (HTTP ${response.status})`);
  }
  return data as T;
}

// ---------------- Profil et réseaux connectés ----------------

export interface NetworkStatus {
  id: NetworkId;
  configured: boolean;
  account?: string;
  reauthRequired?: boolean;
}

interface Profile {
  username: string;
  social_accounts?: Record<string, any>;
}

let profileCache: { at: number; profile: Profile } | null = null;

// Profil Upload-Post utilisé : UPLOAD_POST_USER, ou le seul profil du compte
export async function uploadPostProfile(fresh = false): Promise<Profile> {
  if (!fresh && profileCache && Date.now() - profileCache.at < 60 * 1000) return profileCache.profile;
  const { profiles = [] } = await call<{ profiles?: Profile[] }>("GET", "/uploadposts/users");
  const wanted = process.env.UPLOAD_POST_USER?.trim();
  const profile = wanted ? profiles.find((p) => p.username === wanted) : profiles.length === 1 ? profiles[0] : undefined;
  if (!profile) {
    const names = profiles.map((p) => p.username).join(", ") || "aucun";
    throw new UploadPostError(
      wanted
        ? `Profil Upload-Post « ${wanted} » introuvable (profils du compte : ${names}).`
        : `Plusieurs profils Upload-Post (${names}) : indiquez lequel utiliser dans UPLOAD_POST_USER.`,
    );
  }
  profileCache = { at: Date.now(), profile };
  return profile;
}

// Réseaux connectés sur le profil Upload-Post (un réseau à reconnecter compte comme non configuré)
export async function networkStatus(): Promise<NetworkStatus[]> {
  if (!uploadPostConfigured()) return NETWORK_IDS.map((id) => ({ id, configured: false }));
  const profile = await uploadPostProfile();
  return NETWORK_IDS.map((id) => {
    const account = profile.social_accounts?.[PLATFORM[id]];
    if (!account || typeof account !== "object") return { id, configured: false };
    const name = account.handle || account.display_name || account.username;
    return {
      id,
      configured: !account.reauth_required,
      ...(name ? { account: String(name) } : {}),
      ...(account.reauth_required ? { reauthRequired: true } : {}),
    };
  });
}

// ---------------- Publication ----------------

// Champs d'Upload-Post : titre commun + titre/description par réseau.
// TikTok, Instagram, X, Threads et Bluesky n'ont qu'un texte : le « titre » du réseau.
function formFor(post: VideoPost, networks: NetworkId[], user: string, requestId: string, externalId: string): FormData {
  const form = new FormData();
  form.append("user", user);
  for (const id of networks) form.append("platform[]", PLATFORM[id]);
  form.append("title", truncate(post.title, 100));
  form.append("async_upload", "true");
  form.append("request_id", requestId);
  form.append("external_id", externalId);

  for (const id of networks) {
    const text = fitText(id, textFor(post, id));
    switch (id) {
      case "youtube":
        form.append("youtube_title", truncate(post.title, 100));
        form.append("youtube_description", text);
        form.append("privacyStatus", process.env.YOUTUBE_PRIVACY || "public");
        form.append("categoryId", "10"); // Musique
        break;
      case "facebook":
        form.append("facebook_title", truncate(post.title, 255));
        form.append("facebook_description", text);
        // Vidéo sur la Page (les Reels sont limités à 90 secondes)
        form.append("facebook_media_type", process.env.UPLOAD_POST_FACEBOOK_MEDIA_TYPE || "VIDEO");
        if (process.env.UPLOAD_POST_FACEBOOK_PAGE_ID) form.append("facebook_page_id", process.env.UPLOAD_POST_FACEBOOK_PAGE_ID);
        break;
      case "linkedin":
        form.append("linkedin_title", truncate(post.title, 200));
        form.append("linkedin_description", text);
        // Page entreprise : identifiant numérique (le format urn:li:organization:… est accepté aussi)
        const linkedinPage = process.env.UPLOAD_POST_LINKEDIN_PAGE_ID?.trim().replace(/^urn:li:organization:/, "");
        if (linkedinPage) form.append("target_linkedin_page_id", linkedinPage);
        break;
      default:
        form.append(`${PLATFORM[id]}_title`, text);
    }
  }
  return form;
}

// Résultat d'un réseau tel que renvoyé par Upload-Post (réponse directe, statut ou historique)
function toResult(network: NetworkId, raw: any): PublishResult {
  if (raw?.skipped) return { network, status: "skipped", message: raw.error || "Réseau non connecté sur Upload-Post." };
  const url = raw?.url || raw?.post_url || undefined;
  if (raw?.success === true) {
    const message = raw.fallback_to_inbox ? "Envoyée en brouillon dans la boîte de réception TikTok : à publier depuis l'application." : undefined;
    return { network, status: "ok", ...(url ? { url } : {}), ...(message ? { message } : {}) };
  }
  if (raw?.success === false) {
    return { network, status: "error", message: raw.error || raw.error_message || raw.message || "Échec sans détail." };
  }
  return { network, status: "error", message: raw?.message || "Toujours en cours chez Upload-Post." };
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Attend la fin de la publication, puis lit l'historique pour les liens et les erreurs de chaque réseau
async function waitForResults(requestId: string, networks: NetworkId[]): Promise<PublishResult[]> {
  const started = Date.now();
  const query = `request_id=${encodeURIComponent(requestId)}`;
  let status: any = null;
  await sleep(5000);
  while (Date.now() - started < POLL_MAX_MS) {
    try {
      status = await call("GET", `/uploadposts/status?${query}`);
    } catch (error) {
      // statut pas encore connu juste après l'envoi, ou incident passager : on réessaie
      console.warn("[social] statut Upload-Post :", error instanceof Error ? error.message : error);
    }
    if (status?.status === "completed" || status?.status === "failed") break;
    await sleep(POLL_INTERVAL_MS);
  }

  const raw = new Map<NetworkId, any>();
  for (const r of Array.isArray(status?.results) ? status.results : []) {
    const id = NETWORK_OF[r?.platform];
    if (id) raw.set(id, r);
  }
  try {
    const { history = [] } = await call<{ history?: any[] }>("GET", `/uploadposts/history?${query}&limit=50`);
    for (const h of history) {
      const id = NETWORK_OF[h?.platform];
      if (id) raw.set(id, { ...raw.get(id), ...h });
    }
  } catch (error) {
    console.warn("[social] historique Upload-Post :", error instanceof Error ? error.message : error);
  }

  const finished = status?.status === "completed" || status?.status === "failed";
  return networks.map((id) => {
    if (raw.has(id)) return toResult(id, raw.get(id));
    if (!finished) return { network: id, status: "error", message: "Toujours en cours après 30 minutes : vérifiez sur app.upload-post.com." };
    return { network: id, status: "error", message: status?.message || "Aucun résultat renvoyé par Upload-Post." };
  });
}

/**
 * Publie la vidéo sur les réseaux connectés (ou seulement ceux de `only`) et attend le résultat de chacun.
 * `externalId` (ex. l'id de la ligne video_posts) permet de retrouver la publication sur Upload-Post.
 */
export async function publishVideo(post: VideoPost, only: NetworkId[] | undefined, externalId: string): Promise<PublishResult[]> {
  const statuses = await networkStatus();
  const targets = statuses.filter((n) => (!only || only.includes(n.id)) && n.configured).map((n) => n.id);
  const skipped: PublishResult[] = statuses
    // réseaux demandés mais indisponibles, et comptes à reconnecter (les réseaux jamais connectés ne sont pas listés)
    .filter((n) => !targets.includes(n.id) && (only ? only.includes(n.id) : n.reauthRequired))
    .map((n) => ({
      network: n.id,
      status: "skipped",
      message: n.reauthRequired ? "Compte à reconnecter sur Upload-Post." : "Réseau non connecté sur Upload-Post.",
    }));
  if (!targets.length) return skipped;

  const profile = await uploadPostProfile();
  const requestId = `creatoke-${externalId}-${crypto.randomBytes(6).toString("hex")}`;
  const form = formFor(post, targets, profile.username, requestId, externalId);
  const blob = await fs.openAsBlob(post.filePath, { type: "video/mp4" });
  form.append("video", blob, path.basename(post.filePath));

  let response: any;
  try {
    response = await call("POST", "/upload", {
      body: form,
      headers: { "Idempotency-Key": requestId },
      timeout: UPLOAD_TIMEOUT_MS,
    });
  } catch (error) {
    // Réponse perdue (délai dépassé, 502/504) : l'envoi a pu être pris en compte, on le suit par son request_id
    const lost = (error instanceof Error && error.name === "TimeoutError") || /HTTP 50[24]\)$/.test(errorText(error));
    if (!lost) throw error;
    console.warn("[social] réponse d'Upload-Post perdue, suivi par request_id :", errorText(error));
    response = { request_id: requestId };
  }

  // Réponse directe (publication déjà terminée) ou suivi en arrière-plan avec request_id
  let results: PublishResult[];
  if (response?.results && typeof response.results === "object") {
    results = targets.map((id) =>
      response.results[PLATFORM[id]] ? toResult(id, response.results[PLATFORM[id]]) : { network: id, status: "error", message: "Aucun résultat renvoyé par Upload-Post." },
    );
  } else {
    results = await waitForResults(response?.request_id || requestId, targets);
  }
  return [...results, ...skipped];
}
