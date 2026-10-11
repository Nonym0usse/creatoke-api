import { insertRow, newId, pick, selectRows, updateRow, type DbRecord } from "../../database/mysql.ts";

const LICENCE_COLUMNS = ["basic", "base_plus", "premium", "premiulm", "contract_mp3", "contract_wav"] as const;

export class Licence {
  async listLicence(): Promise<DbRecord[]> {
    return selectRows("SELECT * FROM licence");
  }

  async updateLicence(data: Record<string, unknown> & { id?: string }): Promise<string> {
    const row = pick(data, LICENCE_COLUMNS);
    if (!data.id) {
      await insertRow("licence", { ...row, id: newId() });
    } else {
      await updateRow("licence", data.id, row);
    }
    return "OK";
  }
}
