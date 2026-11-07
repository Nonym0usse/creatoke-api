// services/monthlyReport.ts — bilan mensuel des ventes envoyé par e-mail
//
// Chaque mois, le bilan du mois précédent part aux administrateurs (ou aux
// adresses de MONTHLY_REPORT_TO) : chiffre d'affaires, ventes, évolution,
// meilleures chansons et licences. Aucune donnée client n'y figure.
// La table monthly_reports garantit un seul envoi par mois, même avec
// plusieurs processus, et permet de rattraper un mois manqué.
import path from "node:path";
import { execute, selectOne, selectRows } from "../database/mysql.ts";
import { MAIL_FROM, renderEmailTemplate, transporter } from "./mailer.ts";
import { SITE_URL, licenceLabel } from "../mcp/shared.ts";

export interface Period {
  year: number;
  month: number; // 1 à 12
}

interface Totals {
  ca: number;
  paid: number;
  free: number;
}

export interface MonthlyReport {
  period: Period;
  label: string; // « octobre 2026 »
  ofLabel: string; // « d'octobre 2026 »
  current: Totals;
  previous: Totals & { label: string };
  lastYear: Totals & { label: string };
  yearToDate: { ca: number; lastYearCa: number; label: string };
  trend: { label: string; ca: number }[]; // 6 derniers mois, du plus ancien au plus récent
  topSongs: { titre: string; ventes: number; ca: number }[];
  byLicence: { licence: string; ventes: number; ca: number }[];
}

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

export const periodKey = (p: Period): string => `${p.year}-${String(p.month).padStart(2, "0")}`;
export const periodLabel = (p: Period): string => `${MONTHS[p.month - 1]} ${p.year}`;

/** « d'octobre 2026 », « de septembre 2026 » */
export const ofPeriod = (p: Period): string => {
  const label = periodLabel(p);
  return /^[aeiouéâ]/i.test(label) ? `d'${label}` : `de ${label}`;
};

export function shiftMonth(p: Period, delta: number): Period {
  const index = p.year * 12 + (p.month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** Mois précédent, selon l'heure de Paris. */
export function previousMonth(now = new Date()): Period {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "numeric" }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return shiftMonth({ year: get("year"), month: get("month") }, -1);
}

const round2 = (n: unknown): number => Math.round(Number(n ?? 0) * 100) / 100;

async function totals(where: string, params: unknown[]): Promise<Totals> {
  const row = await selectOne<{ ca: number; paid: number; free: number }>(
    `SELECT COALESCE(SUM(CASE WHEN price > 0 THEN price END), 0) AS ca,
            COALESCE(SUM(price > 0), 0) AS paid,
            COALESCE(SUM(price IS NULL OR price <= 0), 0) AS free
       FROM selling WHERE ${where}`,
    params,
  );
  return { ca: round2(row?.ca), paid: Number(row?.paid ?? 0), free: Number(row?.free ?? 0) };
}

const monthTotals = (p: Period) => totals("year = ? AND CAST(month AS UNSIGNED) = ?", [p.year, p.month]);

export async function buildMonthlyReport(period: Period): Promise<MonthlyReport> {
  const previous = shiftMonth(period, -1);
  const lastYear = shiftMonth(period, -12);
  const trendStart = shiftMonth(period, -5);

  const [current, prev, ly, ytd, lyYtd, trendRows, topSongs, byLicence] = await Promise.all([
    monthTotals(period),
    monthTotals(previous),
    monthTotals(lastYear),
    totals("year = ? AND CAST(month AS UNSIGNED) <= ?", [period.year, period.month]),
    totals("year = ? AND CAST(month AS UNSIGNED) <= ?", [period.year - 1, period.month]),
    selectRows<{ y: number; m: number; ca: number }>(
      `SELECT year AS y, CAST(month AS UNSIGNED) AS m, COALESCE(SUM(CASE WHEN price > 0 THEN price END), 0) AS ca
         FROM selling
        WHERE year * 12 + CAST(month AS UNSIGNED) BETWEEN ? AND ?
        GROUP BY y, m`,
      [trendStart.year * 12 + trendStart.month, period.year * 12 + period.month],
    ),
    selectRows<{ titre: string; ventes: number; ca: number }>(
      `SELECT titre_chanson AS titre, COUNT(*) AS ventes, SUM(price) AS ca
         FROM selling
        WHERE year = ? AND CAST(month AS UNSIGNED) = ? AND price > 0
        GROUP BY titre_chanson ORDER BY ca DESC, ventes DESC LIMIT 5`,
      [period.year, period.month],
    ),
    selectRows<{ licence: string; ventes: number; ca: number }>(
      `SELECT licence_name AS licence, COUNT(*) AS ventes, SUM(price) AS ca
         FROM selling
        WHERE year = ? AND CAST(month AS UNSIGNED) = ? AND price > 0
        GROUP BY licence_name ORDER BY ca DESC`,
      [period.year, period.month],
    ),
  ]);

  const trend = Array.from({ length: 6 }, (_, i) => {
    const p = shiftMonth(trendStart, i);
    const row = trendRows.find((r) => Number(r.y) === p.year && Number(r.m) === p.month);
    return { label: periodLabel(p), ca: round2(row?.ca) };
  });

  return {
    period,
    label: periodLabel(period),
    ofLabel: ofPeriod(period),
    current,
    previous: { ...prev, label: periodLabel(previous) },
    lastYear: { ...ly, label: periodLabel(lastYear) },
    yearToDate: { ca: ytd.ca, lastYearCa: lyYtd.ca, label: `janvier à ${MONTHS[period.month - 1]}` },
    trend,
    topSongs: topSongs.map((s) => ({ titre: s.titre || "(sans titre)", ventes: Number(s.ventes), ca: round2(s.ca) })),
    byLicence: byLicence.map((l) => ({ licence: licenceLabel(l.licence), ventes: Number(l.ventes), ca: round2(l.ca) })),
  };
}

// ---- Mise en forme ----

const euros = (n: number): string =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: n % 1 ? 2 : 0,
    maximumFractionDigits: n % 1 ? 2 : 0,
  }).format(n);

/** Évolution en pourcentage : « +12 % », « −5 % », « nouveau » ou « — ». */
export function evolution(current: number, before: number): { text: string; tone: "up" | "down" | "flat" } {
  if (!before) return current > 0 ? { text: "nouveau", tone: "up" } : { text: "—", tone: "flat" };
  const pct = Math.round(((current - before) / before) * 100);
  if (pct === 0) return { text: "stable", tone: "flat" };
  return { text: `${pct > 0 ? "+" : "−"}${Math.abs(pct)} %`, tone: pct > 0 ? "up" : "down" };
}

export async function renderMonthlyReport(report: MonthlyReport): Promise<{ subject: string; html: string }> {
  const vsPrevious = evolution(report.current.ca, report.previous.ca);
  const max = Math.max(...report.trend.map((t) => t.ca), 1);
  const html = await renderEmailTemplate(path.join("templates", "monthly-report.ejs"), {
    report,
    euros,
    evolution,
    barWidth: (ca: number) => Math.max(ca > 0 ? 2 : 0, Math.round((ca / max) * 100)),
    average: report.current.paid ? round2(report.current.ca / report.current.paid) : 0,
    statsUrl: `${SITE_URL}/analytics`,
  });
  const headline = report.current.paid
    ? `${euros(report.current.ca)}${vsPrevious.text !== "—" ? ` (${vsPrevious.text})` : ""}`
    : "aucune vente";
  return { subject: `Bilan Créatoké ${report.ofLabel} : ${headline}`, html };
}

// ---- Envoi ----

/** Destinataires : MONTHLY_REPORT_TO (adresses séparées par des virgules), sinon les comptes administrateurs. */
export async function reportRecipients(): Promise<string[]> {
  const configured = (process.env.MONTHLY_REPORT_TO ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (configured.length) return configured;
  const admins = await selectRows<{ email: string }>("SELECT email FROM admins ORDER BY created_at");
  return admins.map((a) => a.email).filter(Boolean);
}

/**
 * Réserve l'envoi du bilan d'un mois. Faux si un autre processus l'a déjà envoyé
 * ou est en train de l'envoyer. Un échec, ou un envoi resté bloqué plus d'une
 * heure (serveur redémarré au mauvais moment), peut être repris.
 */
async function claim(key: string): Promise<boolean> {
  const inserted = await execute("INSERT IGNORE INTO monthly_reports (period) VALUES (?)", [key]);
  if (inserted.affectedRows === 1) return true;
  const retried = await execute(
    `UPDATE monthly_reports SET status = 'sending', created_at = UTC_TIMESTAMP()
      WHERE period = ? AND (status = 'failed' OR (status = 'sending' AND created_at < UTC_TIMESTAMP() - INTERVAL 1 HOUR))`,
    [key],
  );
  return retried.affectedRows === 1;
}

export type SendOutcome =
  | { status: "sent"; period: string; recipients: string[]; subject: string }
  | { status: "already_sent"; period: string }
  | { status: "no_recipients"; period: string };

/**
 * Envoie le bilan d'un mois. Sans `force`, ne fait rien si le bilan est déjà parti
 * (envoi automatique) ; avec `force`, le renvoie (demande depuis l'assistant).
 */
export async function sendMonthlyReport(period: Period, { force = false } = {}): Promise<SendOutcome> {
  const key = periodKey(period);
  const recipients = await reportRecipients();
  if (!recipients.length) return { status: "no_recipients", period: key };

  if (force) {
    await execute(
      `INSERT INTO monthly_reports (period) VALUES (?)
       ON DUPLICATE KEY UPDATE status = 'sending', created_at = UTC_TIMESTAMP()`,
      [key],
    );
  } else if (!(await claim(key))) {
    return { status: "already_sent", period: key };
  }

  try {
    const { subject, html } = await renderMonthlyReport(await buildMonthlyReport(period));
    await transporter.sendMail({ from: MAIL_FROM, to: recipients.join(", "), subject, html });
    await execute("UPDATE monthly_reports SET status = 'sent', recipients = ?, sent_at = UTC_TIMESTAMP() WHERE period = ?", [
      recipients.join(", ").slice(0, 1024),
      key,
    ]);
    return { status: "sent", period: key, recipients, subject };
  } catch (error) {
    await execute("UPDATE monthly_reports SET status = 'failed' WHERE period = ?", [key]).catch(() => undefined);
    throw error;
  }
}
