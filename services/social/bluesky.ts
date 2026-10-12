// services/social/bluesky.ts — post Bluesky avec la vidéo intégrée (AT Protocol)
import axios from "axios";
import fs from "node:fs";
import { REQUEST_TIMEOUT_MS, UPLOAD_TIMEOUT_MS, truncate, type VideoPost } from "./common.ts";

// Limites Bluesky : 300 caractères par post, 100 Mo par vidéo
const MAX_TEXT = 300;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

export function blueskyConfigured(): boolean {
  return Boolean(process.env.BLUESKY_EMAIL && process.env.BLUESKY_PASSWORD);
}

// BLUESKY_AUTH (URL complète de createSession) reste accepté pour compatibilité
function pdsUrl(): string {
  if (process.env.BLUESKY_AUTH) return new URL(process.env.BLUESKY_AUTH).origin;
  return process.env.BLUESKY_PDS || "https://bsky.social";
}

interface Session {
  accessJwt: string;
  did: string;
  handle: string;
}

export async function blueskySession(): Promise<Session> {
  const { data } = await axios.post<Session>(
    `${pdsUrl()}/xrpc/com.atproto.server.createSession`,
    { identifier: process.env.BLUESKY_EMAIL, password: process.env.BLUESKY_PASSWORD },
    { timeout: REQUEST_TIMEOUT_MS },
  );
  return data;
}

// Rend cliquables les #hashtags et les liens (positions en octets UTF-8)
function facets(text: string) {
  const result: object[] = [];
  const byteIndex = (i: number) => Buffer.byteLength(text.slice(0, i), "utf8");

  for (const m of text.matchAll(/https?:\/\/[^\s]+[^\s.,;:!?)\]]/g)) {
    result.push({
      index: { byteStart: byteIndex(m.index), byteEnd: byteIndex(m.index + m[0].length) },
      features: [{ $type: "app.bsky.richtext.facet#link", uri: m[0] }],
    });
  }
  for (const m of text.matchAll(/(^|\s)#([\p{L}\p{N}_]+)/gu)) {
    const start = m.index + m[1].length;
    result.push({
      index: { byteStart: byteIndex(start), byteEnd: byteIndex(start + 1 + m[2].length) },
      features: [{ $type: "app.bsky.richtext.facet#tag", tag: m[2] }],
    });
  }
  return result;
}

export async function publishBluesky(post: VideoPost): Promise<{ url: string }> {
  const { size } = await fs.promises.stat(post.filePath);
  if (size > MAX_VIDEO_BYTES) throw new Error("Vidéo trop lourde pour Bluesky (100 Mo maximum).");

  const session = await blueskySession();
  const auth = { Authorization: `Bearer ${session.accessJwt}` };

  const { data: upload } = await axios.post(
    `${pdsUrl()}/xrpc/com.atproto.repo.uploadBlob`,
    fs.createReadStream(post.filePath),
    {
      headers: { ...auth, "Content-Type": post.mimeType, "Content-Length": size },
      maxBodyLength: Infinity,
      timeout: UPLOAD_TIMEOUT_MS,
    },
  );

  const text = truncate(post.description, MAX_TEXT);
  const { data: record } = await axios.post(
    `${pdsUrl()}/xrpc/com.atproto.repo.createRecord`,
    {
      repo: session.did,
      collection: "app.bsky.feed.post",
      record: {
        $type: "app.bsky.feed.post",
        text,
        facets: facets(text),
        createdAt: new Date().toISOString(),
        langs: ["fr"],
        embed: { $type: "app.bsky.embed.video", video: upload.blob },
      },
    },
    { headers: auth, timeout: REQUEST_TIMEOUT_MS },
  );

  const rkey = String(record.uri).split("/").pop();
  return { url: `https://bsky.app/profile/${session.handle}/post/${rkey}` };
}
