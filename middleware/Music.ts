import { selectRows, type DbRecord } from "../database/mysql.ts";

export class Music {
  async getMusics(): Promise<DbRecord[]> {
    return selectRows("SELECT * FROM musics ORDER BY id");
  }
}

export default Music;
