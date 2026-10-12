// Vérifie les accès aux réseaux sociaux sans rien publier.
//
//   npm run social:check
//
// Pour chaque réseau configuré : connexion et lecture du compte cible.
import "dotenv/config";
import axios from "axios";
import { errorMessage } from "../services/social/common.ts";
import { blueskySession } from "../services/social/bluesky.ts";
import { facebookToken } from "../services/social/facebook.ts";
import { linkedinConfigured } from "../services/social/linkedin.ts";
import { NETWORKS } from "../services/social/publish.ts";
import { oauthHeader, twitterKeys } from "../services/social/twitter.ts";
import { youtubeAccessToken } from "../services/social/youtube.ts";

const GRAPH = "https://graph.facebook.com/v23.0";

const checks: Record<string, () => Promise<string>> = {
  async instagram() {
    const { data } = await axios.get(`${GRAPH}/${process.env.IG_USER_ID}`, {
      params: { fields: "username", access_token: process.env.FB_ACCESS_TOKEN },
    });
    return `compte @${data.username}`;
  },
  async facebook() {
    const pageId = process.env.FB_PAGE_ID;
    const token = facebookToken();
    const { data: page } = await axios.get(`${GRAPH}/${pageId}`, { params: { fields: "name", access_token: token } });
    const { data: me } = await axios.get(`${GRAPH}/me`, { params: { fields: "id", access_token: token } });
    // Publier une vidéo sur une Page demande un jeton de cette Page
    const pageToken = me.id === pageId;
    return `Page « ${page.name} »${pageToken ? "" : " — attention : ce n'est pas un jeton de Page (FB_PAGE_ACCESS_TOKEN)"}`;
  },
  async youtube() {
    const token = await youtubeAccessToken();
    const { data } = await axios.get("https://www.googleapis.com/youtube/v3/channels", {
      params: { part: "snippet", mine: "true" },
      headers: { Authorization: `Bearer ${token}` },
    });
    return `chaîne « ${data.items?.[0]?.snippet?.title ?? "introuvable"} »`;
  },
  async bluesky() {
    const session = await blueskySession();
    return `compte @${session.handle}`;
  },
  async linkedin() {
    const { data } = await axios.get("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${process.env.LINKEDIN_ACCESS_TOKEN}` },
    });
    const sameAuthor = process.env.LINKEDIN_AUTHOR_URN === `urn:li:person:${data.sub}`;
    return `compte ${data.name}${sameAuthor || !linkedinConfigured() ? "" : " — attention : LINKEDIN_AUTHOR_URN ne correspond pas"}`;
  },
  async twitter() {
    const url = "https://api.x.com/2/users/me";
    const { data } = await axios.get(url, { headers: { Authorization: oauthHeader("GET", url, twitterKeys()) } });
    return `compte @${data.data?.username}`;
  },
};

let failures = 0;
for (const network of NETWORKS) {
  if (!network.configured()) {
    console.log(`–  ${network.id} : non configuré`);
    continue;
  }
  try {
    console.log(`✅ ${network.id} : ${await checks[network.id]()}`);
  } catch (error) {
    failures += 1;
    console.log(`❌ ${network.id} : ${errorMessage(error)}`);
  }
}
process.exitCode = failures ? 1 : 0;
