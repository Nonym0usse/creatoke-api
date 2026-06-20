import { db } from "../../database/firebase.ts";
import type { FirestoreRecord } from "../Music.ts";

export class Licence {
  private licenceRef = db.collection("licence");

  async listLicence(): Promise<FirestoreRecord[]> {
    const snapshot = await this.licenceRef.get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }

  async updateLicence(data: Record<string, unknown> & { id?: string }): Promise<string> {
    if (!data.id) {
      await this.licenceRef.doc().set({ ...data });
    } else {
      await this.licenceRef.doc(data.id).update({ ...data });
    }
    return "OK";
  }
}
