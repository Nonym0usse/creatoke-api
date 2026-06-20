import { db, admin } from "../../database/firebase.ts";
import type { FirestoreRecord } from "../Music.ts";

export class MusicsAdmin {
  private musicRef = db.collection("musics");
  private bucket = admin.storage().bucket();

  async createMusic(music: Record<string, unknown>): Promise<string> {
    await this.musicRef.doc().set({ ...music });
    return "OK";
  }

  async listMusics(): Promise<FirestoreRecord[]> {
    const snapshot = await this.musicRef.get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }

  async singleMusic(slug: string): Promise<FirestoreRecord | null> {
    const snap = await this.musicRef.where("slug", "==", slug).limit(1).get();
    if (snap.empty) return null;
    const doc = snap.docs[0]!;
    return { id: doc.id, ...doc.data() };
  }

  async updateMusic(music: Record<string, unknown> & { id: string }): Promise<string> {
    await this.musicRef.doc(music.id).update({ ...music });
    return "OK";
  }

  async deleteMusic(id: string): Promise<string> {
    const snapshot = await this.musicRef.doc(id).get();
    const musicData = snapshot.data();
    if (musicData) {
      const nameFieldValues = Object.keys(musicData)
        .filter((key) => key.endsWith("_name"))
        .map((key) => musicData[key]);
      await Promise.all(
        nameFieldValues
          .filter((field): field is string => typeof field === "string" && field !== "")
          .map((field) => this.bucket.file(`songs/${field}`).delete().catch(() => undefined)),
      );
    }
    await this.musicRef.doc(id).delete();
    return "ok";
  }

  async highlightMusic(): Promise<FirestoreRecord[]> {
    const snapshot = await this.musicRef
      .where("isHeartStroke", "==", "oui")
      .orderBy("created_at", "desc")
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }

  async getSongByCategory(params: { category: unknown }): Promise<FirestoreRecord[]> {
    const snapshot = await this.musicRef
      .where("category", "==", String(params?.category))
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }

  async searchRecommandSongs(limit: string): Promise<FirestoreRecord[]> {
    const snapshot = await this.musicRef.limit(parseInt(limit, 10)).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }

  async search(searchTerm: string): Promise<FirestoreRecord[]> {
    const snapshot = await this.musicRef
      .where("title", ">=", searchTerm)
      .where("title", "<=", searchTerm + "")
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }
}
