// services/social/publish.ts — publie une vidéo sur tous les réseaux configurés
//
// Instagram, Facebook, YouTube et Bluesky reçoivent la vidéo en parallèle.
// LinkedIn et X partagent ensuite le lien de la vidéo YouTube.
// L'échec d'un réseau n'empêche pas la publication sur les autres.
import { errorMessage, type NetworkId, type PublishResult, type VideoPost } from "./common.ts";
import { Instagram } from "./instagram.ts";
import { blueskyConfigured, publishBluesky } from "./bluesky.ts";
import { facebookConfigured, publishFacebook } from "./facebook.ts";
import { linkedinConfigured, publishLinkedin } from "./linkedin.ts";
import { publishTwitter, twitterConfigured } from "./twitter.ts";
import { publishYoutube, youtubeConfigured } from "./youtube.ts";

export function instagramConfigured(): boolean {
  return Boolean(process.env.FB_ACCESS_TOKEN && process.env.IG_USER_ID);
}

export const NETWORKS: { id: NetworkId; configured: () => boolean }[] = [
  { id: "instagram", configured: instagramConfigured },
  { id: "facebook", configured: facebookConfigured },
  { id: "youtube", configured: youtubeConfigured },
  { id: "bluesky", configured: blueskyConfigured },
  { id: "linkedin", configured: linkedinConfigured },
  { id: "twitter", configured: twitterConfigured },
];

export function networkStatus(): { id: NetworkId; configured: boolean }[] {
  return NETWORKS.map((n) => ({ id: n.id, configured: n.configured() }));
}

const isConfigured = (network: NetworkId) => Boolean(NETWORKS.find((n) => n.id === network)?.configured());

async function run(
  network: NetworkId,
  publish: () => Promise<{ url?: string }>,
): Promise<PublishResult> {
  if (!isConfigured(network)) {
    return { network, status: "skipped", message: "Réseau non configuré." };
  }
  try {
    const { url } = await publish();
    return { network, status: "ok", url };
  } catch (error) {
    const message = errorMessage(error);
    console.error(`[social] ${network} :`, message);
    return { network, status: "error", message };
  }
}

export async function publishVideo(post: VideoPost): Promise<PublishResult[]> {
  const instagram = run("instagram", async () => {
    const reel = await new Instagram().publishReel(post.description, post.publicUrl);
    return { url: reel.permalink };
  });
  const facebook = run("facebook", () => publishFacebook(post));
  const youtube = run("youtube", () => publishYoutube(post));
  const bluesky = run("bluesky", () => publishBluesky(post));

  // LinkedIn et X partent dès que le lien YouTube est connu, sans attendre Instagram
  const shareLink = (network: NetworkId, publish: (link: string) => Promise<{ url: string }>) =>
    youtube.then((yt): Promise<PublishResult> | PublishResult => {
      if (yt.status === "ok" && yt.url) return run(network, () => publish(yt.url as string));
      return isConfigured(network)
        ? { network, status: "skipped", message: "Pas de lien YouTube à partager." }
        : { network, status: "skipped", message: "Réseau non configuré." };
    });
  const linkedin = shareLink("linkedin", (link) => publishLinkedin(post, link));
  const twitter = shareLink("twitter", (link) => publishTwitter(post, link));

  return Promise.all([instagram, facebook, youtube, bluesky, linkedin, twitter]);
}
