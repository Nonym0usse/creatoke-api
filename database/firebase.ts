import admin from "firebase-admin";
import serviceAccount from "./creatoke-admin.json" with { type: "json" };

const firebase = admin.initializeApp({
  credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
  storageBucket: "gs://creatoke-a8611.appspot.com",
});

export const db = firebase.firestore();
export { admin };
