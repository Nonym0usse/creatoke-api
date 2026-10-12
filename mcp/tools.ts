import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { selectOne, selectRows, type DbRecord } from "../database/mysql.ts";

// Outils du connecteur MCP — phase 1 : consultation uniquement, rien n'est modifié.

const SITE_URL = (process.env.SITE_URL ?? "https://creatoke.com").replace(/\/$/, "");

const CATEGORIES = {
  "chansons-a-chanter": "Chansons à chanter",
  "chansons-cherche-auteur": "Chanson(s) cherche auteur",
  instrumentaux: "Instrumentaux",
  "musique-de-contenus": "Musique de contenus",
  creacourcis: "Créacourcis",
  "virgules-sonores": "Virgules sonores",
} as const;
const CATEGORY_KEYS = Object.keys(CATEGORIES) as [keyof typeof CATEGORIES, ...(keyof typeof CATEGORIES)[]];

const PROSPECT_STATUS: Record<string, string> = {
  draft: "Brouillon (présentation pas encore envoyée)",
  active: "Relances en cours",
  replied: "A répondu (relances arrêtées)",
  closed: "Clôturé sans réponse (J+90)",
};

const PROSPECT_STEPS: Record<number, string> = {
  0: "Présentation pas encore envoyée",
  1: "Présentation envoyée (J0)",
  2: "1er rappel envoyé (J+10)",
  3: "2e rappel envoyé (J+30)",
  4: "3e rappel envoyé (J+60)",
};

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

// ---- Mise en forme ----

const json = (data: unknown): CallToolResult => ({
  content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
});

const notFound = (message: string): CallToolResult => ({ content: [{ type: "text", text: message }], isError: true });

const empty = (value: unknown): boolean => value === null || value === undefined || value === "" || value === "vide";

const text = (value: unknown): string | null => (empty(value) ? null : String(value));

// Licence vendue : enregistrée sous le nom du champ de prix (parfois vide sur les anciennes ventes).
const LICENCES: Record<string, string> = {
  price_base: "Licence de base chanson (MP3)",
  price_premium: "Licence premium chanson (WAV)",
  price_base_creatoke: "Licence de base créatoké (MP3)",
  price_premium_creatoke: "Licence premium créatoké (WAV)",
};
const licenceLabel = (key: unknown): string => LICENCES[String(key ?? "")] ?? (empty(key) ? "non précisée" : String(key));


// Entités HTML courantes (les paroles collées depuis Word en sont pleines).
const ACCENTS: Record<string, string> = { grave: "\u0300", acute: "\u0301", circ: "\u0302", tilde: "\u0303", uml: "\u0308", ring: "\u030A", cedil: "\u0327" };
const NAMED: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", laquo: "«", raquo: "»", lsquo: "‘", rsquo: "’",
  ldquo: "“", rdquo: "”", hellip: "…", ndash: "–", mdash: "—", euro: "€", deg: "°", oelig: "œ", OElig: "Œ",
  aelig: "æ", AElig: "Æ", szlig: "ß", copy: "©", reg: "®", trade: "™", bull: "•", middot: "·",
};

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, name: string) => {
    if (name[0] === "#") {
      const code = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (NAMED[name]) return NAMED[name];
    // Lettres accentuées : « eacute » → e + accent aigu, « Ccedil » → C + cédille…
    const accent = Object.keys(ACCENTS).find((key) => name.length === key.length + 1 && name.endsWith(key));
    return accent ? (name[0] + ACCENTS[accent]).normalize("NFC") : match;
  });
}

/** HTML (CKEditor) → texte lisible. */
function plain(html: unknown): string | null {
  if (empty(html)) return null;
  return decodeEntities(
    String(html)
      .replace(/<\s*br\s*\/?>/gi, "\n")
      .replace(/<\/\s*br\s*>/gi, "\n")
      .replace(/<\/(p|div|h[1-6]|li)>/gi, "\n")
      .replace(/<li[^>]*>/gi, "• ")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const fileName = (url: unknown): string | null => {
  if (empty(url)) return null;
  try {
    return decodeURIComponent(new URL(String(url)).pathname.split("/").pop() ?? "").replace(/^\d{13}_[0-9a-f]{16}_/, "");
  } catch {
    return String(url);
  }
};

const songUrl = (song: DbRecord): string => `${SITE_URL}/song/${song.category}/${song.slug}`;
const categoryLabel = (key: unknown): string => CATEGORIES[String(key) as keyof typeof CATEGORIES] ?? String(key ?? "");

/** Une offre de licence telle que la voit le client sur la fiche. */
function offer(song: DbRecord, show: string, price: string, file: string, label: string) {
  const shown = song[show] === "oui";
  const value = song[price];
  const priced = !empty(value);
  return {
    licence: label,
    affichee: shown,
    prix_euros: priced ? Number(value) : null,
    etat: !shown ? "non proposée" : !priced ? "affichée sans prix (« — », non achetable)" : Number(value) === 0 ? "gratuite (téléchargement direct)" : "en vente",
    fichier_livre: fileName(song[file]),
    ...(shown && priced && empty(song[file]) ? { alerte: "offre en vente mais fichier à livrer manquant" } : {}),
  };
}

function songSummary(song: DbRecord) {
  return {
    id: song.id,
    titre: song.title,
    artiste: text(song.artist),
    rubrique: categoryLabel(song.category),
    exclusivite: song.exclu === "oui",
    coup_de_coeur: song.isHeartStroke === "oui",
    date_ajout: text(song.created_at),
    fiche: songUrl(song),
  };
}

function songDetails(song: DbRecord) {
  const hasCreatoke = !["instrumentaux", "musique-de-contenus", "virgules-sonores"].includes(String(song.category));
  return {
    ...songSummary(song),
    slug: song.slug,
    description: plain(song.description),
    paroles: plain(song.lyrics),
    message_exclusivite: song.exclu === "oui" ? plain(song.message) : null,
    offres_chanson: song.exclu === "oui" ? "non vendue (exclusivité)" : [
      offer(song, "isLicenceBase", "price_base", "chanson_mp3", "Licence de base (MP3)"),
      offer(song, "isPremium", "price_premium", "chanson_wav", "Licence premium (WAV)"),
    ],
    offres_creatoke: hasCreatoke ? [
      offer(song, "isLicenceBaseCreatoke", "price_base_creatoke", "creatoke_mp3", "Licence de base créatoké (MP3)"),
      offer(song, "isPremiumCreatoke", "price_premium_creatoke", "creatoke_wav", "Licence premium créatoké (WAV)"),
    ] : "pas de créatoké dans cette rubrique",
    fichiers_ecoute: {
      chanson: fileName(song.url),
      creatoke: fileName(song.creatoke),
    },
    pochette: text(song.image),
    youtube: empty(song.youtubeURL) ? null : `https://www.youtube.com/watch?v=${song.youtubeURL}`,
    spotify: text(song.spotifyURL),
  };
}

async function findSong(reference: string): Promise<DbRecord | null> {
  const ref = reference.trim();
  return (
    (await selectOne("SELECT * FROM musics WHERE id = ? OR slug = ?", [ref, ref])) ??
    (await selectOne("SELECT * FROM musics WHERE title = ?", [ref])) ??
    (await selectOne("SELECT * FROM musics WHERE title LIKE ? ORDER BY CHAR_LENGTH(title) LIMIT 1", [`%${ref}%`]))
  );
}

// ---- Ventes ----

type SaleFilters = { year?: number; month?: number; song?: string; client?: string };

function saleWhere({ year, month, song, client }: SaleFilters): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (year) { clauses.push("s.year = ?"); params.push(year); }
  if (month) { clauses.push("CAST(s.month AS UNSIGNED) = ?"); params.push(month); }
  if (song) { clauses.push("s.titre_chanson LIKE ?"); params.push(`%${song}%`); }
  if (client) { clauses.push("(s.nom_client LIKE ? OR s.email_client LIKE ?)"); params.push(`%${client}%`, `%${client}%`); }
  return { sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
}

const round2 = (n: unknown): number => Math.round(Number(n ?? 0) * 100) / 100;

const yearSchema = z.number().int().min(2020).max(2100).optional();
const monthSchema = z.number().int().min(1).max(12).optional();

// ---- Serveur ----

export function buildMcpServer(): McpServer {
  const server = new McpServer(
    { name: "creatoke", version: "1.0.0", title: "Créatoké" },
    {
      instructions:
        "Connecteur du site Créatoké (catalogue de chansons, créatokés et musiques à licence). " +
        "Phase 1 : consultation uniquement — aucun outil ne modifie le site. Les montants sont en euros TTC. " +
        "Un « créatoké » est la version d'accompagnement d'une chanson, sans la voix principale. " +
        "Les ventes et les prospects contiennent des données personnelles : ne les citer que si c'est utile à la demande.",
    },
  );

  server.registerTool(
    "search_songs",
    {
      title: "Rechercher des chansons",
      description:
        "Recherche dans le catalogue Créatoké (titre, artiste, description et paroles). Sans texte, liste tout le catalogue " +
        "(filtrable par rubrique). Exemple : « Quelles chansons parlent de Paris ? » → query: \"Paris\".",
      inputSchema: {
        query: z.string().optional().describe("Mots à chercher dans le titre, l'artiste, la description ou les paroles"),
        category: z.enum(CATEGORY_KEYS).optional().describe("Rubrique du site"),
        limit: z.number().int().min(1).max(100).optional().describe("Nombre maximum de résultats (25 par défaut)"),
      },
      annotations: { title: "Rechercher des chansons", ...READ_ONLY },
    },
    async ({ query, category, limit }) => {
      const clauses: string[] = [];
      const params: unknown[] = [];
      if (query?.trim()) {
        const like = `%${query.trim()}%`;
        clauses.push("(title LIKE ? OR artist LIKE ? OR description LIKE ? OR lyrics LIKE ?)");
        params.push(like, like, like, like);
      }
      if (category) { clauses.push("category = ?"); params.push(category); }
      const rows = await selectRows(
        `SELECT * FROM musics ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""} ORDER BY title LIMIT ?`,
        [...params, limit ?? 25],
      );
      return json({
        nombre: rows.length,
        chansons: rows.map((song) => {
          const where = query?.trim()
            ? ["title", "artist", "description", "lyrics"].filter((c) =>
                String(plain(song[c]) ?? "").toLowerCase().includes(query.trim().toLowerCase()))
            : undefined;
          return { ...songSummary(song), ...(where?.length ? { trouve_dans: where } : {}) };
        }),
      });
    },
  );

  server.registerTool(
    "get_song",
    {
      title: "Consulter une fiche chanson",
      description:
        "Fiche complète d'une chanson : rubrique, description, paroles, offres de licence (affichées ou non, prix, fichier livré), " +
        "fichiers d'écoute, liens YouTube/Spotify. Exemple : « Combien coûte la licence de MUITA ? ».",
      inputSchema: {
        song: z.string().min(1).describe("Titre (même partiel), identifiant ou adresse courte (slug) de la chanson"),
      },
      annotations: { title: "Consulter une fiche chanson", ...READ_ONLY },
    },
    async ({ song }) => {
      const found = await findSong(song);
      return found ? json(songDetails(found)) : notFound(`Aucune chanson trouvée pour « ${song} ».`);
    },
  );

  server.registerTool(
    "get_licence_terms",
    {
      title: "Textes des licences",
      description: "Textes des licences affichés sur les fiches (base, premium, licence pro) et contrats MP3 / WAV. Communs à toutes les chansons.",
      inputSchema: {},
      annotations: { title: "Textes des licences", ...READ_ONLY },
    },
    async () => {
      const row = await selectOne("SELECT * FROM licence LIMIT 1");
      if (!row) return notFound("Aucun texte de licence enregistré.");
      return json({
        licence_de_base: plain(row.basic),
        licence_premium: plain(row.base_plus),
        licence_pro_et_exclusivite: plain(row.premium),
        contrat_mp3: plain(row.contract_mp3),
        contrat_wav: plain(row.contract_wav),
      });
    },
  );

  server.registerTool(
    "sales_summary",
    {
      title: "Chiffre d'affaires et statistiques",
      description:
        "Chiffre d'affaires, nombre de ventes, ventes par mois, meilleures chansons et répartition par licence, sur une année " +
        "(par défaut l'année en cours) ou un mois. Exemple : « Combien a-t-on vendu en septembre ? ».",
      inputSchema: {
        year: yearSchema.describe("Année (par défaut l'année en cours)"),
        month: monthSchema.describe("Mois de 1 à 12 (facultatif)"),
      },
      annotations: { title: "Chiffre d'affaires et statistiques", ...READ_ONLY },
    },
    async ({ year, month }) => {
      const filters = { year: year ?? new Date().getFullYear(), month };
      const { sql, params } = saleWhere(filters);
      const total = await selectOne<{ ventes: number; ca: number; payantes: number }>(
        `SELECT COUNT(*) AS ventes, COALESCE(SUM(price), 0) AS ca, SUM(price > 0) AS payantes FROM selling s ${sql}`, params);
      const byMonth = await selectRows<{ mois: number; ventes: number; ca: number }>(
        `SELECT CAST(s.month AS UNSIGNED) AS mois, COUNT(*) AS ventes, COALESCE(SUM(price), 0) AS ca
           FROM selling s ${sql} GROUP BY mois ORDER BY mois`, params);
      const topSongs = await selectRows<{ titre: string; ventes: number; ca: number }>(
        `SELECT titre_chanson AS titre, COUNT(*) AS ventes, COALESCE(SUM(price), 0) AS ca
           FROM selling s ${sql} GROUP BY titre_chanson ORDER BY ca DESC, ventes DESC LIMIT 10`, params);
      const byLicence = await selectRows<{ licence: string; ventes: number; ca: number }>(
        `SELECT licence_name AS licence, COUNT(*) AS ventes, COALESCE(SUM(price), 0) AS ca
           FROM selling s ${sql} GROUP BY licence_name ORDER BY ca DESC`, params);
      const ventes = Number(total?.ventes ?? 0);
      return json({
        periode: month ? `${String(month).padStart(2, "0")}/${filters.year}` : String(filters.year),
        nombre_de_ventes: ventes,
        dont_telechargements_gratuits: ventes - Number(total?.payantes ?? 0),
        chiffre_affaires_euros: round2(total?.ca),
        panier_moyen_euros: total?.payantes ? round2(Number(total.ca) / Number(total.payantes)) : 0,
        ...(month ? {} : { par_mois: byMonth.map((m) => ({ mois: m.mois, ventes: m.ventes, chiffre_affaires_euros: round2(m.ca) })) }),
        meilleures_chansons: topSongs.map((s) => ({ ...s, ca: round2(s.ca) })),
        par_licence: byLicence.map((l) => ({ licence: licenceLabel(l.licence), ventes: l.ventes, ca: round2(l.ca) })),
      });
    },
  );

  server.registerTool(
    "list_sales",
    {
      title: "Liste des ventes",
      description:
        "Ventes une par une (date, client, chanson, licence, prix) avec le numéro de facture et l'état de l'envoi par e-mail, " +
        "de la plus récente à la plus ancienne. Filtres : année, mois, chanson, client.",
      inputSchema: {
        year: yearSchema.describe("Année"),
        month: monthSchema.describe("Mois de 1 à 12"),
        song: z.string().optional().describe("Titre de chanson (même partiel)"),
        client: z.string().optional().describe("Nom ou e-mail du client (même partiel)"),
        limit: z.number().int().min(1).max(200).optional().describe("Nombre maximum de ventes (30 par défaut)"),
      },
      annotations: { title: "Liste des ventes", ...READ_ONLY },
    },
    async ({ limit, ...filters }) => {
      const { sql, params } = saleWhere(filters);
      const rows = await selectRows<DbRecord>(
        `SELECT s.*, i.invoiceNumber, i.emailStatus
           FROM selling s LEFT JOIN invoices i ON i.sellingId = s.id
           ${sql}
          ORDER BY s.year DESC, CAST(s.month AS UNSIGNED) DESC, STR_TO_DATE(s.date, '%d/%m/%Y') DESC, s.date DESC
          LIMIT ?`,
        [...params, limit ?? 30],
      );
      return json({
        nombre: rows.length,
        ventes: rows.map((s) => ({
          date: s.date,
          client: s.nom_client,
          email: s.email_client,
          chanson: s.titre_chanson,
          licence: licenceLabel(s.licence_name),
          prix_euros: round2(s.price),
          facture: s.invoiceNumber ?? null,
          facture_envoyee: s.emailStatus ?? null,
        })),
      });
    },
  );

  server.registerTool(
    "get_invoice",
    {
      title: "Consulter une facture",
      description:
        "Détails d'une facture (numéro, client, chanson, licence, prix, date, envoi par e-mail). Sans numéro, renvoie la dernière " +
        "facture émise. Exemple : « Retrouve la facture de la dernière vente. ».",
      inputSchema: {
        invoice_number: z.string().optional().describe("Numéro de facture (facultatif : sinon la dernière)"),
      },
      annotations: { title: "Consulter une facture", ...READ_ONLY },
    },
    async ({ invoice_number }) => {
      const row = invoice_number?.trim()
        ? await selectOne<DbRecord>("SELECT * FROM invoices WHERE invoiceNumber = ?", [invoice_number.trim()])
        : await selectOne<DbRecord>("SELECT * FROM invoices ORDER BY createdAt DESC LIMIT 1");
      if (!row) return notFound(invoice_number ? `Aucune facture n° ${invoice_number}.` : "Aucune facture émise pour l'instant.");
      return json({
        numero: row.invoiceNumber,
        date: row.date,
        client: row.nom_client,
        email: row.email_client,
        chanson: row.titre_chanson,
        licence: licenceLabel(row.licence_name),
        prix_euros: round2(row.price),
        envoi_email: row.emailStatus,
        ...(row.emailError ? { erreur_envoi: row.emailError } : {}),
      });
    },
  );

  server.registerTool(
    "list_prospects",
    {
      title: "Prospects et avancement",
      description:
        "Éditeurs et contacts démarchés, avec l'avancement de la séquence de relances (J0, J+10, J+30, J+60, clôture à J+90). " +
        "Filtres : statut, ou « sans réponse depuis N jours ». Exemple : « Qui n'a pas répondu depuis deux semaines ? » → " +
        "no_reply_for_days: 14.",
      inputSchema: {
        status: z.enum(["draft", "active", "replied", "closed"]).optional()
          .describe("draft = présentation pas envoyée, active = relances en cours, replied = a répondu, closed = clôturé sans réponse"),
        no_reply_for_days: z.number().int().min(1).max(365).optional()
          .describe("Seulement les prospects en relance dont la présentation date d'au moins N jours, sans réponse"),
        limit: z.number().int().min(1).max(200).optional().describe("Nombre maximum (50 par défaut)"),
      },
      annotations: { title: "Prospects et avancement", ...READ_ONLY },
    },
    async ({ status, no_reply_for_days, limit }) => {
      const clauses: string[] = [];
      const params: unknown[] = [];
      if (status) { clauses.push("sequenceStatus = ?"); params.push(status); }
      if (no_reply_for_days) {
        clauses.push("sequenceStatus = 'active' AND presentationSentAt <= UTC_TIMESTAMP() - INTERVAL ? DAY");
        params.push(no_reply_for_days);
      }
      const rows = await selectRows<DbRecord>(
        `SELECT * FROM prospects ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""} ORDER BY createdAt DESC LIMIT ?`,
        [...params, limit ?? 50],
      );
      return json({ nombre: rows.length, prospects: rows.map(prospectSummary) });
    },
  );

  server.registerTool(
    "get_prospect",
    {
      title: "Consulter un prospect",
      description: "Fiche d'un prospect : coordonnées, chanson proposée, notes et historique des envois de la séquence.",
      inputSchema: {
        prospect: z.string().min(1).describe("E-mail, nom, prénom, société ou identifiant du prospect"),
      },
      annotations: { title: "Consulter un prospect", ...READ_ONLY },
    },
    async ({ prospect }) => {
      const ref = prospect.trim();
      const like = `%${ref}%`;
      const row =
        (await selectOne<DbRecord>("SELECT * FROM prospects WHERE id = ? OR email = ?", [ref, ref])) ??
        (await selectOne<DbRecord>(
          `SELECT * FROM prospects WHERE CONCAT_WS(' ', prenom, nom) LIKE ? OR CONCAT_WS(' ', nom, prenom) LIKE ?
             OR societe LIKE ? OR email LIKE ? ORDER BY createdAt DESC LIMIT 1`,
          [like, like, like, like]));
      if (!row) return notFound(`Aucun prospect trouvé pour « ${prospect} ».`);
      const history = await selectRows<{ step: number; label: string; sentAt: Date; ok: number; error: string | null }>(
        "SELECT step, label, sentAt, ok, error FROM prospect_history WHERE prospect_id = ? ORDER BY id", [row.id]);
      return json({
        ...prospectSummary(row),
        notes: text(row.notes),
        lien_chanson: text(row.lien_musique),
        historique: history.map((h) => ({
          etape: h.label,
          date: h.sentAt,
          reussi: Boolean(h.ok),
          ...(h.error ? { erreur: h.error } : {}),
        })),
      });
    },
  );

  return server;
}

function prospectSummary(p: DbRecord) {
  const sentAt = p.presentationSentAt ? new Date(String(p.presentationSentAt)) : null;
  return {
    id: p.id,
    nom: [p.prenom, p.nom].filter((v) => !empty(v)).join(" "),
    societe: text(p.societe),
    email: p.email,
    chanson_proposee: text(p.titre_chanson),
    statut: PROSPECT_STATUS[String(p.sequenceStatus)] ?? p.sequenceStatus,
    etape: PROSPECT_STEPS[Number(p.currentStep ?? 0)] ?? `Étape ${p.currentStep}`,
    presentation_envoyee_le: sentAt,
    jours_depuis_presentation: sentAt ? Math.floor((Date.now() - sentAt.getTime()) / 86_400_000) : null,
    ajoute_le: p.createdAt,
  };
}
