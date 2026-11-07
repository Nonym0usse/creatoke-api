// services/social/publishJob.ts — publication d'une vidéo en arrière-plan
//
// Utilisé par la page « Publier une vidéo » et par l'assistant IA : la ligne video_posts
// est créée tout de suite (status running), puis compression, envoi à Upload-Post et
// résultat de chaque réseau, enregistré dans la même ligne.
import fs from "node:fs";
import path from "node:path";
import { videoCompress } from "../../utils/videoCompress.ts";
import { finishVideoPost, startVideoPost, type VideoSource } from "./history.ts";
import { publishVideo } from "./uploadPost.ts";
import type { NetworkId } from "./common.ts";

export interface PublicationRequest {
  sourcePath: string; // vidéo reçue, supprimée après compression
  title: string;
  description: string;
  texts?: Partial<Record<NetworkId, string>>;
  link?: string; // lien de chanson déjà vérifié (songLink)
  networks?: NetworkId[];
  source: VideoSource;
}

export async function startPublication(request: PublicationRequest): Promise<number> {
  // L'historique garde le lien avec le texte (visible par l'assistant IA)
  const description = request.link ? `${request.description}\n\n${request.link}` : request.description;
  const postId = await startVideoPost({ title: request.title, description, source: request.source });
  void runPublication(postId, request);
  return postId;
}

async function runPublication(postId: number, request: PublicationRequest): Promise<void> {
  const compressedPath = request.sourcePath.replace(/(\.[^./\\]+)?$/, "_compressed.mp4");
  try {
    try {
      await videoCompress(request.sourcePath, compressedPath);
    } catch (error) {
      throw new Error(`Compression impossible : ${error instanceof Error ? error.message : "erreur inconnue"}`);
    } finally {
      await fs.promises.unlink(request.sourcePath).catch(() => undefined);
    }
    const results = await publishVideo(
      { title: request.title, description: request.description, texts: request.texts, link: request.link, filePath: compressedPath },
      request.networks,
      `video-post-${postId}`,
    );
    await finishVideoPost(postId, { results });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[social] publication ${postId} (${path.basename(request.sourcePath)}) :`, message);
    await finishVideoPost(postId, { error: message }).catch(() => undefined);
  } finally {
    // Upload-Post a reçu sa copie : rien à garder sur le serveur
    await fs.promises.unlink(compressedPath).catch(() => undefined);
  }
}
