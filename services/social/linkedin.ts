// services/social/linkedin.ts — post LinkedIn partageant le lien YouTube (Posts API)
import axios from "axios";
import { REQUEST_TIMEOUT_MS, truncate, type VideoPost } from "./common.ts";

// Version d'API LinkedIn (AAAAMM) : chaque version reste disponible environ un an
const DEFAULT_VERSION = "202606";

export function linkedinConfigured(): boolean {
  return Boolean(process.env.LINKEDIN_ACCESS_TOKEN && process.env.LINKEDIN_AUTHOR_URN);
}

// Texte au format « little text » : les caractères réservés doivent être échappés,
// sinon LinkedIn tronque le post. Les #hashtags restent cliquables.
export function littleText(text: string): string {
  const escaped = text.replace(/[\\|{}@[\]()<>#*_~]/g, (c) => `\\${c}`);
  return escaped.replace(/(^|\s)\\#([\p{L}\p{N}]+)/gu, (_m, space, tag) => `${space}{hashtag|\\#|${tag}}`);
}

export async function publishLinkedin(post: VideoPost, link: string): Promise<{ url: string }> {
  try {
    const res = await axios.post(
      "https://api.linkedin.com/rest/posts",
      {
        author: process.env.LINKEDIN_AUTHOR_URN,
        commentary: littleText(post.description),
        visibility: "PUBLIC",
        distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
        content: {
          article: {
            source: link,
            title: truncate(post.title || "Créatoke", 200),
            description: truncate(post.description, 250),
          },
        },
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.LINKEDIN_ACCESS_TOKEN}`,
          "LinkedIn-Version": process.env.LINKEDIN_API_VERSION || DEFAULT_VERSION,
          "X-Restli-Protocol-Version": "2.0.0",
          "Content-Type": "application/json",
        },
        timeout: REQUEST_TIMEOUT_MS,
      },
    );
    const urn = res.headers["x-restli-id"];
    return { url: urn ? `https://www.linkedin.com/feed/update/${urn}` : "https://www.linkedin.com/feed/" };
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      throw new Error("Jeton LinkedIn expiré (valable 60 jours) : relancez « npm run social:auth linkedin ».");
    }
    throw error;
  }
}
