import { db } from "../../database/firebase.ts";
import type { FirestoreRecord } from "../Music.ts";

export class Payment {
  private paymentRef = db.collection("selling");

  async createPayment(data: Record<string, unknown>): Promise<FirestoreRecord> {
    const docRef = this.paymentRef.doc();
    await docRef.set(data);
    const docSnapshot = await docRef.get();
    if (docSnapshot.exists) {
      return { id: docSnapshot.id, ...docSnapshot.data() };
    }
    throw new Error("Failed to retrieve newly created payment.");
  }

  async getPaymentFromCurrentYear(): Promise<FirestoreRecord[]> {
    const currentYear = new Date().getFullYear();
    const snapshot = await this.paymentRef.where("year", "==", currentYear).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }
}
