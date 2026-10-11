import { randomUUID } from "node:crypto";
import mysql, { type ResultSetHeader, type RowDataPacket } from "mysql2/promise";

export type DbRecord = { id: string } & Record<string, unknown>;

export const pool = mysql.createPool({
  host: process.env.MYSQL_HOST ?? "localhost",
  port: Number(process.env.MYSQL_PORT ?? 3306),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  charset: "utf8mb4",
  connectionLimit: 10,
  // Dates stockées et relues en UTC ; DECIMAL renvoyés en number (comme Firestore).
  timezone: "Z",
  decimalNumbers: true,
});

// CURRENT_TIMESTAMP doit aussi être en UTC pour rester cohérent avec `timezone: "Z"`.
pool.pool.on("connection", (connection) => {
  connection.query("SET time_zone = '+00:00'");
});

export const newId = (): string => randomUUID();

export async function selectRows<T = DbRecord>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [rows] = await pool.query<RowDataPacket[]>(sql, params);
  return rows as T[];
}

export async function selectOne<T = DbRecord>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await selectRows<T>(sql, params);
  return rows[0] ?? null;
}

export async function execute(sql: string, params: unknown[] = []): Promise<ResultSetHeader> {
  const [result] = await pool.query<ResultSetHeader>(sql, params);
  return result;
}

// Ne garde que les colonnes connues de la table : les payloads venant du front
// peuvent contenir des champs en plus, que Firestore acceptait sans broncher.
export function pick(data: Record<string, unknown>, columns: readonly string[]): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const column of columns) {
    if (data[column] !== undefined) row[column] = data[column];
  }
  return row;
}

export async function insertRow(table: string, row: Record<string, unknown>): Promise<void> {
  await execute("INSERT INTO ?? SET ?", [table, row]);
}

export async function updateRow(table: string, id: string, row: Record<string, unknown>): Promise<void> {
  if (Object.keys(row).length === 0) return;
  await execute("UPDATE ?? SET ? WHERE id = ?", [table, row, id]);
}
