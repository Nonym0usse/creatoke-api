// services/social/youtube.ts — envoi de la vidéo sur YouTube (Data API v3, envoi « resumable »)
import axios from "axios";
import fs from "node:fs";
import { REQUEST_TIMEOUT_MS, UPLOAD_TIMEOUT_MS, truncate, type VideoPost } from "./common.ts";

export function youtubeConfigured(): boolean {
  return Boolean(
    process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET && process.env.YOUTUBE_REFRESH_TOKEN,
  );
}

// Jeton d'accès (1 h) obtenu à partir du refresh token enregistré par `npm run social:auth youtube`
export async function youtubeAccessToken(): Promise<string> {
  try {
    const { data } = await axios.post(
      "https://oauth2.googleapis.com/token",
      new URLSearchParams({
        client_id: process.env.YOUTUBE_CLIENT_ID as string,
        client_secret: process.env.YOUTUBE_CLIENT_SECRET as string,
        refresh_token: process.env.YOUTUBE_REFRESH_TOKEN as string,
        grant_type: "refresh_token",
      }),
      { timeout: REQUEST_TIMEOUT_MS },
    );
    return data.access_token;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.data?.error === "invalid_grant") {
      throw new Error("Autorisation YouTube expirée ou révoquée : relancez « npm run social:auth youtube ».");
    }
    throw error;
  }
}

// YouTube refuse les caractères < et > dans le titre et la description
const clean = (text: string) => text.replace(/[<>]/g, "");

export async function publishYoutube(post: VideoPost): Promise<{ url: string }> {
  const token = await youtubeAccessToken();
  const { size } = await fs.promises.stat(post.filePath);
  const title = truncate(clean(post.title).trim() || "Créatoke", 100);

  // 1) Ouverture de la session d'envoi : métadonnées de la vidéo
  const init = await axios.post(
    "https://www.googleapis.com/upload/youtube/v3/videos",
    {
      snippet: {
        title,
        description: clean(post.description),
        categoryId: "10", // Musique
        defaultLanguage: "fr",
        defaultAudioLanguage: "fr",
      },
      status: {
        privacyStatus: process.env.YOUTUBE_PRIVACY || "public",
        selfDeclaredMadeForKids: false,
      },
    },
    {
      params: { uploadType: "resumable", part: "snippet,status" },
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Length": size,
        "X-Upload-Content-Type": post.mimeType,
      },
      timeout: REQUEST_TIMEOUT_MS,
    },
  );
  const uploadUrl = init.headers.location;
  if (!uploadUrl) throw new Error("YouTube n'a pas ouvert de session d'envoi.");

  // 2) Envoi du fichier
  const { data } = await axios.put(uploadUrl, fs.createReadStream(post.filePath), {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": post.mimeType, "Content-Length": size },
    maxBodyLength: Infinity,
    timeout: UPLOAD_TIMEOUT_MS,
  });
  if (!data?.id) throw new Error("YouTube n'a pas renvoyé d'identifiant de vidéo.");
  return { url: `https://www.youtube.com/watch?v=${data.id}` };
}
