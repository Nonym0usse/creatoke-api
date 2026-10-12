// services/social/history.ts — historique des vidéos publiées (table video_posts)
//
// Chaque publication (page « Publier une vidéo » ou assistant IA) y est
// enregistrée avec le résultat de chaque réseau.
import { execute, selectRows } from "../../database/mysql.ts";
import type { PublishResult } from "./common.ts";

export type VideoSource = "site" | "assistant";

export interface VideoPostRow {
  id: number;
  title: string;
  description: string | null;
  video_url: string | null;
  source: VideoSource;
  status: "running" | "done" | "failed";
  results: string | null;
  error: string | null;
  created_at: Date;
  finished_at: Date | null;
}

export async function startVideoPost(post: { title: string; description: string; source: VideoSource }): Promise<number> {
  const result = await execute("INSERT INTO video_posts (title, description, source, status) VALUES (?, ?, ?, 'running')", [
    post.title,
    post.description,
    post.source,
  ]);
  return result.insertId;
}

export async function finishVideoPost(id: number, outcome: { videoUrl?: string; results?: PublishResult[]; error?: string }) {
  await execute(
    "UPDATE video_posts SET status = ?, video_url = COALESCE(?, video_url), results = ?, error = ?, finished_at = UTC_TIMESTAMP() WHERE id = ?",
    [
      outcome.error ? "failed" : "done",
      outcome.videoUrl ?? null,
      outcome.results ? JSON.stringify(outcome.results) : null,
      outcome.error ?? null,
      id,
    ],
  );
}

/** Enregistrement d'une publication déjà terminée (page du site, qui attend la fin). */
export async function recordVideoPost(post: {
  title: string;
  description: string;
  source: VideoSource;
  videoUrl?: string;
  results?: PublishResult[];
  error?: string;
}): Promise<void> {
  const id = await startVideoPost(post);
  await finishVideoPost(id, post);
}

export async function listVideoPosts(limit = 20): Promise<VideoPostRow[]> {
  return selectRows<VideoPostRow & { id: string }>("SELECT * FROM video_posts ORDER BY id DESC LIMIT ?", [limit]) as unknown as Promise<
    VideoPostRow[]
  >;
}
