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

const CATEGORY_COLUMNS = ["category", "title_fr", "picture", "picture_name"] as const;

export class Category {
  async getAllCategory(): Promise<DbRecord[]> {
    return selectRows("SELECT * FROM category ORDER BY id");
  }

  async deleteCategory(data: { id: string }): Promise<DbRecord[]> {
    const existing = await selectOne("SELECT * FROM category WHERE id = ?", [data.id]);
    await execute("DELETE FROM category WHERE id = ?", [data.id]);
    if (existing) await deleteFileByUrl(existing.picture);
    return this.getAllCategory();
  }

  async createCategory(category: Record<string, unknown>): Promise<string> {
    await insertRow("category", { ...pick(category, CATEGORY_COLUMNS), id: newId() });
    return "OK";
  }

  // Une seule image de fond : l'ancienne (ligne + fichier) est remplacée.
  async createBackground(data: { picture?: string; picture_name?: string }): Promise<string> {
    const backgrounds = await this.getBackgroundImg();
    await execute("DELETE FROM background");
    await Promise.all(
      backgrounds
        .filter((background) => background.picture !== data?.picture)
        .map((background) => deleteFileByUrl(background.picture)),
    );
    await insertRow("background", {
      id: newId(),
      picture: data?.picture ?? null,
      picture_name: data?.picture_name ?? null,
    });
    return "OK";
  }

  async modifyText(text: Record<string, unknown> & { id?: string }): Promise<string> {
    const row = pick(text, ["text"]);
    if (text.id === undefined || text.id === "") {
      await insertRow("texts", { ...row, id: newId() });
    } else {
      await updateRow("texts", text.id, row);
    }
    return "OK";
  }

  async getBackgroundImg(): Promise<DbRecord[]> {
    return selectRows("SELECT * FROM background");
  }

  async getTexts(): Promise<DbRecord[]> {
    return selectRows("SELECT * FROM texts");
  }
}
