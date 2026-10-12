// services/social/facebook.ts — vidéo publiée sur la Page Facebook (Graph API)
import axios from "axios";
import { UPLOAD_TIMEOUT_MS, truncate, type VideoPost } from "./common.ts";

const GRAPH_VIDEO = "https://graph-video.facebook.com/v23.0";

// Jeton de Page (pages_manage_posts) ; à défaut, celui déjà utilisé pour Instagram
export function facebookToken(): string | undefined {
  return process.env.FB_PAGE_ACCESS_TOKEN || process.env.FB_ACCESS_TOKEN;
}

export function facebookConfigured(): boolean {
  return Boolean(process.env.FB_PAGE_ID && facebookToken());
}

export async function publishFacebook(post: VideoPost): Promise<{ url: string }> {
  const pageId = process.env.FB_PAGE_ID as string;

  // Facebook télécharge lui-même la vidéo depuis son URL publique (comme Instagram).
  // Paramètres dans le corps : le jeton n'apparaît pas dans l'URL.
  const body = new URLSearchParams({
    file_url: post.publicUrl,
    title: truncate(post.title, 255),
    description: post.description,
    published: "true",
    access_token: facebookToken() as string,
  });

  const { data } = await axios.post(`${GRAPH_VIDEO}/${pageId}/videos`, body, { timeout: UPLOAD_TIMEOUT_MS });
  if (!data?.id) throw new Error("Facebook n'a pas renvoyé d'identifiant de vidéo.");
  return { url: `https://www.facebook.com/${pageId}/videos/${data.id}` };
}
