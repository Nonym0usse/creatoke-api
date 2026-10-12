import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { selectOne, selectRows, type DbRecord } from "../database/mysql.ts";
import {
  currentSections, empty, findProspect, findSong, licenceLabel, plain, sectionSlugs, songDetails, songSummary, text,
} from "./shared.ts";
import { registerActions, type McpContext } from "./actions.ts";
import { SITE_URL } from "./shared.ts";

// Outils de consultation du connecteur MCP (les actions sont dans actions.ts).

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

const json = (data: unknown): CallToolResult => ({
  content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
});

const notFound = (message: string): CallToolResult => ({ content: [{ type: "text", text: message }], isError: true });

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

export function buildMcpServer(ctx: McpContext): McpServer {
  const server = new McpServer(
    { name: "creatoke", version: "1.0.0", title: "Créatoké" },
    {
      instructions:
        "Connecteur du site Créatoké (catalogue de chansons, créatokés et musiques à licence). " +
        "Outils de consultation, et outils d'action qui modifient le site ou envoient des e-mails : avant toute action, " +
        "récapitulez le changement et attendez l'accord explicite de l'utilisateur ; une seule suppression à la fois. " +
        "Pour une chanson avec fichiers, importez d'abord chaque fichier avec import_file. Les rubriques du site se lisent avec " +
        "list_sections. Une vidéo se publie avec publish_video (en arrière-plan) et son résultat se lit avec list_video_posts. " +
        "Les montants sont en euros TTC. " +
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
        "(filtrable par rubrique : " + sectionSlugs() + "). Exemple : « Quelles chansons parlent de Paris ? » → query: \"Paris\".",
      inputSchema: {
        query: z.string().optional().describe("Mots à chercher dans le titre, l'artiste, la description ou les paroles"),
        category: z.string().optional().describe("Rubrique du site (slug, voir list_sections)"),
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
    "list_sections",
    {
      title: "Rubriques du catalogue",
      description:
        "Rubriques du site (Chansons à chanter, Instrumentaux…) avec leur adresse courte (slug), leur description et leurs " +
        "réglages : version créatoké proposée ou non, paroles proposées ou non. Nombre de chansons par rubrique.",
      inputSchema: {},
      annotations: { title: "Rubriques du catalogue", ...READ_ONLY },
    },
    async () => {
      const counts = await selectRows<{ category: string; n: number }>("SELECT category, COUNT(*) AS n FROM musics GROUP BY category");
      return json({
        rubriques: currentSections().map((s) => ({
          slug: s.slug,
          nom: s.label,
          description: s.description,
          bouton_achat: `Acheter ${s.item_label}`,
          creatoke: s.has_creatoke,
          paroles: s.has_lyrics,
          icone: s.icon,
          chansons: Number(counts.find((c) => c.category === s.slug)?.n ?? 0),
          page: `${SITE_URL}/song/${s.slug}`,
        })),
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
      const row = await findProspect(prospect);
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

  registerActions(server, ctx);

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
