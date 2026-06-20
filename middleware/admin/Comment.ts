import { db } from "../../database/firebase.ts";
import type { FirestoreRecord } from "../Music.ts";

export class Comment {
  private commentRef = db.collection("comment");

  async createComment(data: Record<string, unknown>): Promise<string> {
    await this.commentRef.doc().set(data);
    return "OK";
  }

  async getAllComments(): Promise<FirestoreRecord[]> {
    const snapshot = await this.commentRef.get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }

  async getComments(id: string): Promise<FirestoreRecord[]> {
    const snapshot = await this.commentRef.where("music_id", "==", id).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }

  async deleteComment(id: string): Promise<string> {
    await this.commentRef.doc(id).delete();
    return "OK";
  }
}
