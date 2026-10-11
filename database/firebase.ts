import admin from "firebase-admin";
import serviceAccount from "./creatoke-admin.json" with { type: "json" };

// Firebase n'est plus utilisé que pour l'authentification admin (Firebase Auth).
// Données : MySQL (database/mysql.ts) — fichiers : disque local (services/storage.ts).
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
});

export { admin };
