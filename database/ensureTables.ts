// Création automatique, au démarrage, des tables ajoutées par les migrations
// listées ci-dessous : plus besoin de les exécuter à la main sur le serveur.
//
// N'ajouter ici que des migrations rejouables sans risque (CREATE TABLE IF NOT
// EXISTS…) : elles sont exécutées à chaque démarrage. Une migration qui modifie
// une table existante (ALTER TABLE…) reste à exécuter à la main.
import fs from "node:fs";
import path from "node:path";
import { pool } from "./mysql.ts";

const AUTO_MIGRATIONS = [
  "2026-11-07-monthly-reports.sql",
  "2026-11-07-contact-messages.sql",
  "2026-11-07-password-resets.sql",
];

export async function ensureTables(): Promise<void> {
  for (const file of AUTO_MIGRATIONS) {
    try {
      const sql = await fs.promises.readFile(path.join("database", "migrations", file), "utf8");
      await pool.query(sql);
    } catch (error) {
      console.error(`[migrations] ${file} :`, error instanceof Error ? error.message : error);
    }
  }
}
