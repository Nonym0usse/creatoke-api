import {
  execute,
  insertRow,
  newId,
  pick,
  selectOne,
  selectRows,
  updateRow,
  type DbRecord,
} from "../../database/mysql.ts";
import { deleteFileByUrl } from "../../services/storage.ts";

const PRICE_COLUMNS = ["price_base", "price_premium", "price_base_creatoke", "price_premium_creatoke"] as const;
const MEDIA_COLUMNS = ["url", "creatoke", "chanson_mp3", "chanson_wav", "creatoke_mp3", "creatoke_wav", "image"] as const;

const MUSIC_COLUMNS = [
  "slug", "title", "artist", "category", "description", "lyrics", "message",
  ...PRICE_COLUMNS,
  "exclu", "isHeartStroke", "isLicenceBase", "isPremium", "isLicenceBaseCreatoke", "isPremiumCreatoke",
  "promotion", ...MEDIA_COLUMNS, "youtubeURL", "spotifyURL", "created_at",
] as const;

// L'admin peut envoyer "" ou "vide" pour un prix absent : NULL en base.
const toPrice = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

function toRow(music: Record<string, unknown>): Record<string, unknown> {
  const row = pick(music, MUSIC_COLUMNS);
  for (const column of PRICE_COLUMNS) {
    if (column in row) row[column] = toPrice(row[column]);
  }
  return row;
}

export class MusicsAdmin {
  async createMusic(music: Record<string, unknown>): Promise<string> {
    await insertRow("musics", { ...toRow(music), id: newId() });
    return "OK";
  }

  async listMusics(): Promise<DbRecord[]> {
    return selectRows("SELECT * FROM musics ORDER BY id");
  }

  async singleMusic(slug: string): Promise<DbRecord | null> {
    return selectOne("SELECT * FROM musics WHERE slug = ? LIMIT 1", [slug]);
  }

  async updateMusic(music: Record<string, unknown> & { id: string }): Promise<string> {
    await updateRow("musics", music.id, toRow(music));
    return "OK";
  }

  async deleteMusic(id: string): Promise<string> {
    const music = await selectOne("SELECT * FROM musics WHERE id = ?", [id]);
    await execute("DELETE FROM musics WHERE id = ?", [id]);
    if (!music) return "ok";

    // Supprime les fichiers de la chanson, sauf ceux encore utilisés par une autre.
    const urls = [...new Set(MEDIA_COLUMNS.map((column) => music[column]).filter((u): u is string => typeof u === "string" && u !== ""))];
    await Promise.all(
      urls.map(async (url) => {
        const stillUsed = await selectOne(
          `SELECT id FROM musics WHERE ${MEDIA_COLUMNS.map((c) => `${c} = ?`).join(" OR ")} LIMIT 1`,
          MEDIA_COLUMNS.map(() => url),
        );
        if (!stillUsed) await deleteFileByUrl(url);
      }),
    );
    return "ok";
  }

  async highlightMusic(): Promise<DbRecord[]> {
    // created_at est un texte "AAAA-M-J" (pas toujours paddé) : tri sur la vraie date.
    return selectRows(
      "SELECT * FROM musics WHERE isHeartStroke = 'oui' ORDER BY STR_TO_DATE(created_at, '%Y-%m-%d') DESC",
    );
  }

  async getSongByCategory(params: { category: unknown }): Promise<DbRecord[]> {
    return selectRows("SELECT * FROM musics WHERE category = ? ORDER BY id", [String(params?.category)]);
  }

  async searchRecommandSongs(limit: string): Promise<DbRecord[]> {
    const n = parseInt(limit, 10);
    return selectRows("SELECT * FROM musics ORDER BY id LIMIT ?", [Number.isFinite(n) && n > 0 ? n : 10]);
  }

  // Recherche par début de titre (insensible à la casse et aux accents).
  async search(searchTerm: string): Promise<DbRecord[]> {
    const escaped = searchTerm.replace(/[\\%_]/g, (c) => `\\${c}`);
    return selectRows("SELECT * FROM musics WHERE title LIKE ? ORDER BY title", [`${escaped}%`]);
  }
}
