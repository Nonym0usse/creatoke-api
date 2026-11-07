// services/siteVisits.ts — compteur de visites du site, sans cookie
//
// Une visite = un visiteur par jour (heure de Paris). Le site envoie un signal au
// chargement ; l'API reconnaît le visiteur du jour par une empreinte anonyme :
// sha256(clé du jour + IP + navigateur). La clé du jour dérive de JWT_SECRET et change
// chaque jour : l'IP n'est jamais enregistrée et les empreintes, effacées au bout de
// deux jours, ne permettent pas de suivre quelqu'un d'un jour à l'autre.
// Seul le total par mois est conservé (table site_visit_months).
import crypto from "node:crypto";
import { execute, selectRows } from "../database/mysql.ts";

// Robots, outils de surveillance et navigateurs automatisés (le signal part d'un navigateur :
// la plupart des robots, qui n'exécutent pas les pages, ne le déclenchent de toute façon pas)
const BOT_PATTERN =
  /bot|crawl|spider|slurp|bingpreview|mediapartners|facebookexternalhit|embedly|quora link preview|whatsapp|telegram|discord|skype|preview|headless|phantomjs|puppeteer|playwright|selenium|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|statuscake|curl|wget|python|java\/|go-http|axios|node-fetch|okhttp|httpclient|scrapy|semrush|ahrefs|mj12|dotbot|petalbot|yandex|baidu|bytespider|gptbot|claudebot|anthropic|perplexity|ccbot/i;

export function isBot(userAgent: string | undefined): boolean {
  return !userAgent || userAgent.length < 20 || BOT_PATTERN.test(userAgent);
}

// Date du jour et mois à l'heure de Paris
function parisDay(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function visitorHash(day: string, ip: string, userAgent: string): string {
  const daySecret = crypto.createHmac("sha256", process.env.JWT_SECRET || "creatoke-visits").update(`visits:${day}`).digest();
  return crypto.createHmac("sha256", daySecret).update(`${ip}|${userAgent}`).digest("hex");
}

/** Compte la visite si ce visiteur n'est pas encore venu aujourd'hui. Renvoie true si elle est nouvelle. */
export async function recordVisit(ip: string, userAgent: string): Promise<boolean> {
  const day = parisDay();
  const result = await execute("INSERT IGNORE INTO site_visit_days (day, visitor) VALUES (?, ?)", [
    day,
    visitorHash(day, ip, userAgent),
  ]);
  if (result.affectedRows !== 1) return false;
  await execute("INSERT INTO site_visit_months (month, visits) VALUES (?, 1) ON DUPLICATE KEY UPDATE visits = visits + 1", [
    day.slice(0, 7),
  ]);
  // Les empreintes ne servent qu'à ne pas compter deux fois le même visiteur dans la journée
  await execute("DELETE FROM site_visit_days WHERE day < ? - INTERVAL 1 DAY", [day]);
  return true;
}

/** Visites des 12 mois d'une année (janvier à décembre). */
export async function visitsByMonth(year: number): Promise<number[]> {
  const rows = await selectRows<{ month: string; visits: number }>(
    "SELECT month, visits FROM site_visit_months WHERE month LIKE ?",
    [`${year}-%`],
  );
  const months = new Array(12).fill(0);
  for (const row of rows) {
    const index = Number(row.month.slice(5, 7)) - 1;
    if (index >= 0 && index < 12) months[index] = Number(row.visits) || 0;
  }
  return months;
}
