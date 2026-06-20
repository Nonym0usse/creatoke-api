import { db, admin } from "../../database/firebase.ts";
import type { FirestoreRecord } from "../Music.ts";

export class Category {
  private categoryRef = db.collection("category");
  private bucket = admin.storage().bucket();

  async getAllCategory(): Promise<FirestoreRecord[]> {
    const snapshot = await this.categoryRef.get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }

  async deleteCategory(data: { id: string; picture?: string }): Promise<FirestoreRecord[]> {
    await this.categoryRef.doc(data.id).delete();
    if (data.picture) {
      await this.bucket.file(`category/${data.picture}`).delete().catch(() => undefined);
    }
    return this.getAllCategory();
  }

  async createCategory(category: Record<string, unknown>): Promise<string> {
    await this.categoryRef.doc().set({ ...category });
    return "OK";
  }

  async createBackground(data: { picture?: string; picture_name?: string }): Promise<string> {
    const backgrounds = await this.getBackgroundImg();
    await Promise.all(
      backgrounds.map(async (background) => {
        if (background.id) {
          await db.collection("background").doc(background.id).delete();
          if (typeof background.picture_name === "string") {
            await this.bucket
              .file(`background/${background.picture_name}`)
              .delete()
              .catch(() => undefined);
          }
        }
      }),
    );
    await db
      .collection("background")
      .doc()
      .set({ picture: data?.picture, picture_name: data?.picture_name });
    return "OK";
  }

  async modifyText(text: Record<string, unknown> & { id?: string }): Promise<string> {
    if (text.id === undefined || text.id === "") {
      await db.collection("texts").doc().set(text);
    } else {
      await db.collection("texts").doc(text.id).update(text);
    }
    return "OK";
  }

  async getBackgroundImg(): Promise<FirestoreRecord[]> {
    const snapshot = await db.collection("background").get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }

  async getTexts(): Promise<FirestoreRecord[]> {
    const snapshot = await db.collection("texts").get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }
}
