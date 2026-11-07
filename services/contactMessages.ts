// services/contactMessages.ts — messages du formulaire de contact (table contact_messages)
//
// Chaque message est enregistré avant l'envoi de sa copie par e-mail à l'équipe,
// pour que l'assistant IA puisse les lire. Conservation : 3 ans maximum (page RGPD).
import { execute, selectRows } from "../database/mysql.ts";

const RETENTION_YEARS = 3;

export interface ContactMessageRow {
  id: number;
  name: string;
  email: string;
  tel: string;
  message: string;
  email_status: "pending" | "sent" | "failed";
  handled_at: Date | null;
  created_at: Date;
}

export async function saveContactMessage(m: { name: string; email: string; tel: string; message: string }): Promise<number> {
  const result = await execute("INSERT INTO contact_messages (name, email, tel, message) VALUES (?, ?, ?, ?)", [
    m.name.slice(0, 255),
    m.email.slice(0, 255),
    m.tel.slice(0, 64),
    m.message,
  ]);
  return result.insertId;
}

export async function setEmailStatus(id: number, status: "sent" | "failed"): Promise<void> {
  await execute("UPDATE contact_messages SET email_status = ? WHERE id = ?", [status, id]);
}

/** Supprime les messages de plus de 3 ans. */
export async function purgeOldContactMessages(): Promise<number> {
  const result = await execute("DELETE FROM contact_messages WHERE created_at < UTC_TIMESTAMP() - INTERVAL ? YEAR", [RETENTION_YEARS]);
  return result.affectedRows;
}

export async function listContactMessages(filters: {
  days?: number;
  unhandledOnly?: boolean;
  search?: string;
  limit?: number;
}): Promise<ContactMessageRow[]> {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filters.days) {
    clauses.push("created_at >= UTC_TIMESTAMP() - INTERVAL ? DAY");
    params.push(filters.days);
  }
  if (filters.unhandledOnly) clauses.push("handled_at IS NULL");
  if (filters.search) {
    clauses.push("(name LIKE ? OR email LIKE ? OR message LIKE ?)");
    const like = `%${filters.search}%`;
    params.push(like, like, like);
  }
  return selectRows<ContactMessageRow & { id: string }>(
    `SELECT * FROM contact_messages ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""} ORDER BY created_at DESC, id DESC LIMIT ?`,
    [...params, filters.limit ?? 30],
  ) as unknown as Promise<ContactMessageRow[]>;
}

/** Marque des messages comme traités (ou non). Renvoie les identifiants trouvés. */
export async function setHandled(ids: number[], handled: boolean): Promise<number[]> {
  if (!ids.length) return [];
  const found = await selectRows<{ id: number } & { id: string }>(
    `SELECT id FROM contact_messages WHERE id IN (${ids.map(() => "?").join(", ")})`,
    ids,
  );
  const existing = found.map((r) => Number(r.id));
  if (existing.length) {
    await execute(
      `UPDATE contact_messages SET handled_at = ${handled ? "COALESCE(handled_at, UTC_TIMESTAMP())" : "NULL"}
        WHERE id IN (${existing.map(() => "?").join(", ")})`,
      existing,
    );
  }
  return existing;
}
