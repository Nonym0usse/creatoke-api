import { execute, insertRow, newId, pick, selectRows, type DbRecord } from "../../database/mysql.ts";

const COMMENT_COLUMNS = ["music_id", "name", "email", "ratings", "comment", "created_at"] as const;

export class Comment {
  async createComment(data: Record<string, unknown>): Promise<string> {
    const row = pick(data, COMMENT_COLUMNS);
    if (row.ratings !== undefined) row.ratings = Number(row.ratings) || null;
    await insertRow("comment", { ...row, id: newId() });
    return "OK";
  }

  async getAllComments(): Promise<DbRecord[]> {
    return selectRows("SELECT * FROM comment ORDER BY id");
  }

  async getComments(id: string): Promise<DbRecord[]> {
    return selectRows("SELECT * FROM comment WHERE music_id = ? ORDER BY id", [id]);
  }

  async deleteComment(id: string): Promise<string> {
    await execute("DELETE FROM comment WHERE id = ?", [id]);
    return "OK";
  }
}
