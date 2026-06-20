import { db } from "../database/firebase.ts";

export type FirestoreRecord = { id: string } & Record<string, unknown>;

export class Music {
  private musicRef = db.collection("musics");

  async getMusics(): Promise<FirestoreRecord[]> {
    const snapshot = await this.musicRef.get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }
}

export default Music;
