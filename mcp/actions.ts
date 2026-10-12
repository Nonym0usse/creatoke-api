import fs from "node:fs";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { execute, selectOne, selectRows, type DbRecord } from "../database/mysql.ts";
import { localPathFromUrl } from "../services/storage.ts";
import { MusicsAdmin } from "../middleware/admin/MusicsAdmin.ts";
import { Licence } from "../middleware/admin/Licence.ts";
import { Prospect } from "../middleware/admin/Prospect.ts";
import { ProspectTemplates, TEMPLATE_KEYS } from "../middleware/admin/ProspectTemplates.ts";
import { Category } from "../middleware/admin/Category.ts";
import { Comment } from "../middleware/admin/Comment.ts";
import { importFileFromUrl } from "./import-file.ts";
import { MCP_WRITE_SCOPE } from "./oauth.ts";
import path from "node:path";
import { networkStatus, publishVideo } from "../services/social/publish.ts";
import { finishVideoPost, listVideoPosts, startVideoPost } from "../services/social/history.ts";
import { videoCompress } from "../utils/videoCompress.ts";
import { UPLOAD_DIR, buildPublicUrl } from "../services/storage.ts";
import { findProspect, findSong, plain, sectionOf, sectionSlugs, songDetails, songUrl, SITE_URL } from "./shared.ts";
import { SECTION_ERRORS, Sections } from "../middleware/admin/Sections.ts";

// Connecteur MCP — phase 2 : actions qui modifient le site.
// Garde-fous : chaque outil est signalé « non lecture seule » aux assistants,
// qui demandent l'accord de l'utilisateur avant de l'appeler ; chaque appel est
// inscrit dans mcp_actions ; pas de suppression en masse (un élément à la fois) ;
// rien sur les paiements, les mots de passe ni les comptes administrateurs.


export interface McpContext {
  adminId: string;
  clientId: string;
  scopes: string[];
}

const musics = new MusicsAdmin();
const licences = new Licence();
const prospects = new Prospect();
const templates = new ProspectTemplates();
const categories = new Category();
const comments = new Comment();
const sectionsStore = new Sections();

const CONFIRM =
  " Avant d'appeler cet outil, récapitulez précisément le changement à l'utilisateur et attendez son accord explicite.";

const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const;
const DESTRUCTIVE = { ...WRITE, destructiveHint: true } as const;

const json = (data: unknown): CallToolResult => ({ content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });

class ActionError extends Error {}

// ---- Mise en forme des textes ----

const escapeHtml = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Texte de l'assistant → HTML de l'éditeur (paragraphes, retours à la ligne). Le HTML fourni est gardé tel quel. */
function toHtml(text: string): string {
  if (/<\/?(p|br|strong|em|ul|ol|li|h[1-6])\b/i.test(text)) return text;
  return text
    .trim()
    .split(/\n\s*\n/)
    .map((paragraph) => `<p>${escapeHtml(paragraph.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** Même règle que le front (bibliothèque « slug ») : « Un rendez-vous à Paris » → un-rendez-vous-a-paris. */
function slugify(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Mêmes règles que le formulaire du site pour les liens YouTube / Spotify. */
function youtubeId(input: string): string {
  const v = input.trim();
  return v.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([\w-]{11})/)?.[1] ?? v;
}

function spotifyEmbed(input: string): string {
  let v = input.trim();
  const src = v.match(/src="([^"]+)"/);
  if (src) v = src[1];
  const m = v.match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?(?:embed\/)?(track|album|playlist|episode|artist)\/([A-Za-z0-9]+)/);
  return m ? `https://open.spotify.com/embed/${m[1]}/${m[2]}` : v;
}

/** Un fichier de chanson doit être sur le serveur Créatoké (importé avec import_file ou envoyé depuis le site). */
function checkUploadedFile(url: string, label: string): string {
  const local = localPathFromUrl(url);
  if (!local || !fs.existsSync(local)) {
    throw new ActionError(`${label} : « ${url} » n'est pas un fichier du site. Importez-le d'abord avec import_file.`);
  }
  return url;
}

// ---- Champs d'une chanson ----

const FILE_FIELDS = {
  listen_song_mp3: { column: "url", label: "Chanson — écoute sur le site (MP3)" },
  song_mp3: { column: "chanson_mp3", label: "Chanson — fichier vendu, licence de base (MP3)" },
  song_wav: { column: "chanson_wav", label: "Chanson — fichier vendu, licence premium (WAV)" },
  listen_creatoke_mp3: { column: "creatoke", label: "Créatoké — écoute sur le site (MP3)" },
  creatoke_mp3: { column: "creatoke_mp3", label: "Créatoké — fichier vendu, licence de base (MP3)" },
  creatoke_wav: { column: "creatoke_wav", label: "Créatoké — fichier vendu, licence premium (WAV)" },
  cover_image: { column: "image", label: "Pochette" },
} as const;

const OFFERS = {
  song_base: { show: "isLicenceBase", price: "price_base" },
  song_premium: { show: "isPremium", price: "price_premium" },
  creatoke_base: { show: "isLicenceBaseCreatoke", price: "price_base_creatoke" },
  creatoke_premium: { show: "isPremiumCreatoke", price: "price_premium_creatoke" },
} as const;

const offerSchema = z
  .object({
    for_sale: z.boolean().describe("true : offre affichée sur la fiche ; false : masquée"),
    price: z.number().min(0).max(100000).nullable().optional()
      .describe("Prix en euros TTC ; 0 = gratuit ; null = sans prix (« — », non achetable)"),
  })
  .optional();

const songFieldsSchema = {
  title: z.string().min(1).max(200).optional().describe("Titre (enregistré en MAJUSCULES)"),
  artist: z.string().max(255).optional().describe("Artiste / interprète"),
  category: z.string().optional().describe("Rubrique du site (slug, voir list_sections)"),
  description: z.string().max(5000).optional().describe("Description (texte ; paragraphes séparés par une ligne vide)"),
  lyrics: z.string().max(50000).optional().describe("Paroles (texte, une ligne par vers)"),
  exclusive: z.boolean().optional().describe("Exclusivité : chanson sous contrat, seul le créatoké est vendu"),
  exclusive_message: z.string().max(5000).optional().describe("Message affiché à la place des offres pour une exclusivité"),
  featured: z.boolean().optional().describe("Coup de cœur (carrousel de l'accueil)"),
  offers: z
    .object({ song_base: offerSchema, song_premium: offerSchema, creatoke_base: offerSchema, creatoke_premium: offerSchema })
    .optional()
    .describe("Offres de licence : chanson / créatoké, base (MP3) / premium (WAV)"),
  files: z
    .object(Object.fromEntries(Object.entries(FILE_FIELDS).map(([key, f]) => [key, z.string().optional().describe(f.label)])) as Record<
      keyof typeof FILE_FIELDS,
      z.ZodOptional<z.ZodString>
    >)
    .optional()
    .describe("Adresses de fichiers déjà sur le site (résultat de import_file) ; chaîne vide = retirer le fichier"),
  youtube: z.string().optional().describe("Lien de la vidéo YouTube (chaîne vide = retirer)"),
  spotify: z.string().optional().describe("Lien du titre Spotify (chaîne vide = retirer)"),
};

type SongFields = {
  title?: string;
  artist?: string;
  category?: string;
  description?: string;
  lyrics?: string;
  exclusive?: boolean;
  exclusive_message?: string;
  featured?: boolean;
  offers?: Partial<Record<keyof typeof OFFERS, { for_sale: boolean; price?: number | null } | undefined>>;
  files?: Partial<Record<keyof typeof FILE_FIELDS, string>>;
  youtube?: string;
  spotify?: string;
};

/** Champs de l'outil → colonnes de la table musics (seulement ceux fournis). */
function songColumns(fields: SongFields): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (fields.title !== undefined) row.title = fields.title.trim().toUpperCase();
  if (fields.artist !== undefined) row.artist = fields.artist.trim() || "vide";
  if (fields.category !== undefined) {
    if (!sectionOf(fields.category)) throw new ActionError(`Rubrique inconnue « ${fields.category} » (rubriques : ${sectionSlugs()}).`);
    row.category = fields.category;
  }
  if (fields.description !== undefined) row.description = fields.description.trim() || "vide";
  if (fields.lyrics !== undefined) row.lyrics = fields.lyrics.trim() ? toHtml(fields.lyrics) : "vide";
  if (fields.exclusive !== undefined) row.exclu = fields.exclusive ? "oui" : "non";
  if (fields.exclusive_message !== undefined) row.message = fields.exclusive_message.trim() ? toHtml(fields.exclusive_message) : "vide";
  if (fields.featured !== undefined) row.isHeartStroke = fields.featured ? "oui" : "non";
  for (const [key, offer] of Object.entries(fields.offers ?? {})) {
    if (!offer) continue;
    const target = OFFERS[key as keyof typeof OFFERS];
    row[target.show] = offer.for_sale ? "oui" : "non";
    if (offer.price !== undefined) row[target.price] = offer.price;
  }
  for (const [key, url] of Object.entries(fields.files ?? {})) {
    if (url === undefined) continue;
    const target = FILE_FIELDS[key as keyof typeof FILE_FIELDS];
    row[target.column] = url.trim() ? checkUploadedFile(url.trim(), target.label) : target.column === "image" ? "https://placehold.co/600x400" : "vide";
  }
  if (fields.youtube !== undefined) row.youtubeURL = fields.youtube.trim() ? youtubeId(fields.youtube) : "vide";
  if (fields.spotify !== undefined) row.spotifyURL = fields.spotify.trim() ? spotifyEmbed(fields.spotify) : "vide";
  return row;
}

async function requireSong(reference: string): Promise<DbRecord> {
  const song = await findSong(reference);
  if (!song) throw new ActionError(`Aucune chanson trouvée pour « ${reference} ».`);
  return song;
}

async function requireProspect(reference: string): Promise<DbRecord> {
  const prospect = await findProspect(reference);
  if (!prospect) throw new ActionError(`Aucun prospect trouvé pour « ${reference} ».`);
  return prospect;
}

const PROSPECT_ERRORS: Record<string, string> = {
  INVALID_EMAIL: "Adresse e-mail invalide.",
  INVALID_NAME: "Il faut au moins un nom ou un prénom.",
  ALREADY_SENT: "La présentation a déjà été envoyée à ce prospect.",
  NOT_FOUND: "Prospect introuvable.",
  INVALID_SUBJECT: "Le sujet ne peut pas être vide.",
  INVALID_BODY: "Le texte ne peut pas être vide.",
};

// ---- Enregistrement des outils ----

export function registerActions(server: McpServer, ctx: McpContext): void {
  const canWrite = ctx.scopes.includes(MCP_WRITE_SCOPE);

  // Toutes les actions passent par ici : droit d'écriture, journal, erreurs lisibles.
  const action = <Shape extends z.ZodRawShape>(
    name: string,
    config: { title: string; description: string; inputSchema: Shape; annotations: Record<string, unknown> },
    run: (args: z.objectOutputType<Shape, z.ZodTypeAny>) => Promise<unknown>,
  ) => {
    server.registerTool(
      name,
      { ...config, annotations: { title: config.title, ...config.annotations } },
      (async (args: z.objectOutputType<Shape, z.ZodTypeAny>) => {
        if (!canWrite) {
          return { content: [{ type: "text", text: "Ce connecteur a été autorisé en lecture seule. Déconnectez-le puis reconnectez-le pour autoriser les modifications." }], isError: true };
        }
        try {
          const result = await run(args);
          await log(name, args, true, result);
          return json(result);
        } catch (error) {
          const raw = error instanceof Error ? error.message : String(error);
          const message = PROSPECT_ERRORS[raw] ?? SECTION_ERRORS[raw] ??
            (/ECONN|ETIMEDOUT|EAUTH|ESOCKET|getaddrinfo|SMTP|Greeting never received/i.test(raw)
              ? "L'e-mail n'a pas pu partir (serveur d'envoi injoignable). Rien n'a été modifié : réessayez plus tard."
              : raw);
          await log(name, args, false, message);
          return { content: [{ type: "text", text: message }], isError: true };
        }
      }) as never,
    );
  };

  const log = async (tool: string, params: unknown, ok: boolean, result: unknown) => {
    await execute(
      "INSERT INTO mcp_actions (admin_id, client_id, tool, params, ok, result) VALUES (?, ?, ?, ?, ?, ?)",
      [ctx.adminId, ctx.clientId, tool, JSON.stringify(params).slice(0, 60000), ok, JSON.stringify(result).slice(0, 20000)],
    ).catch((error) => console.error("MCP action log failed:", error instanceof Error ? error.message : error));
  };

  // ---------------- Fichiers ----------------

  action(
    "import_file",
    {
      title: "Importer un fichier depuis un lien",
      description:
        "Télécharge un fichier audio (MP3, WAV…) ou une image depuis un lien de partage (Google Drive, Dropbox ou lien direct " +
        "https), partagé « à toute personne disposant du lien ». Renvoie l'adresse du fichier sur le site, à utiliser ensuite " +
        "dans create_song ou update_song. 500 Mo maximum.",
      inputSchema: {
        link: z.string().url().describe("Lien de partage ou de téléchargement (https)"),
        kind: z.enum(["audio", "image"]).describe("audio pour un MP3/WAV, image pour une pochette"),
      },
      annotations: { ...WRITE, openWorldHint: true },
    },
    async ({ link, kind }) => importFileFromUrl(link, kind, "songs"),
  );

  // ---------------- Chansons ----------------

  action(
    "create_song",
    {
      title: "Créer une chanson",
      description:
        "Ajoute une chanson au catalogue (elle est publiée aussitôt). Obligatoire : titre, artiste, rubrique, description. " +
        "Les fichiers doivent d'abord être importés avec import_file. Chaque offre proposée à la vente doit avoir son fichier " +
        "(song_base ↔ song_mp3, song_premium ↔ song_wav, creatoke_base ↔ creatoke_mp3, creatoke_premium ↔ creatoke_wav)." + CONFIRM,
      inputSchema: {
        ...songFieldsSchema,
        title: z.string().min(1).max(200).describe("Titre (enregistré en MAJUSCULES)"),
        artist: z.string().min(1).max(255).describe("Artiste / interprète"),
        category: z.string().min(1).describe("Rubrique du site (slug, voir list_sections)"),
        description: z.string().min(1).max(5000).describe("Description"),
      },
      annotations: WRITE,
    },
    async (fields) => {
      const slug = slugify(fields.title);
      if (!slug) throw new ActionError("Titre invalide.");
      const existing = await selectOne("SELECT title FROM musics WHERE slug = ?", [slug]);
      if (existing) throw new ActionError(`Une chanson a déjà cette adresse (« ${existing.title} ») : choisissez un autre titre.`);
      const today = new Date().toISOString().slice(0, 10);
      const defaults: Record<string, unknown> = {
        slug, created_at: today, exclu: "non", isHeartStroke: "non",
        isLicenceBase: "non", isPremium: "non", isLicenceBaseCreatoke: "non", isPremiumCreatoke: "non",
        lyrics: "vide", message: "vide", youtubeURL: "vide", spotifyURL: "vide", image: "https://placehold.co/600x400",
        url: "vide", creatoke: "vide", chanson_mp3: "vide", chanson_wav: "vide", creatoke_mp3: "vide", creatoke_wav: "vide",
      };
      await musics.createMusic({ ...defaults, ...songColumns(fields as SongFields) });
      const created = await requireSong(slug);
      return { message: "Chanson publiée.", chanson: songDetails(created) };
    },
  );

  action(
    "update_song",
    {
      title: "Modifier une chanson",
      description:
        "Modifie une chanson : seuls les champs fournis changent (prix, offres, textes, rubrique, fichiers, liens…). " +
        "Pour plusieurs chansons (ex. « toutes les virgules sonores à 15 € »), appelez l'outil une fois par chanson après " +
        "accord sur la liste. Changer le titre ne change pas l'adresse de la fiche." + CONFIRM,
      inputSchema: {
        song: z.string().min(1).describe("Titre, identifiant ou adresse courte (slug) de la chanson à modifier"),
        ...songFieldsSchema,
      },
      annotations: { ...DESTRUCTIVE, idempotentHint: true },
    },
    async ({ song, ...fields }) => {
      const current = await requireSong(song);
      const changes = songColumns(fields as SongFields);
      if (!Object.keys(changes).length) throw new ActionError("Aucun changement demandé.");
      await musics.updateMusic({ ...current, ...changes, id: current.id });
      const updated = await requireSong(String(current.id));
      return { message: "Chanson modifiée.", champs_modifies: Object.keys(changes), chanson: songDetails(updated) };
    },
  );

  action(
    "delete_song",
    {
      title: "Supprimer une chanson",
      description:
        "Supprime définitivement UNE chanson du site, avec ses fichiers audio et sa pochette (sauf ceux utilisés par une autre " +
        "chanson). Irréversible. Une seule chanson par appel." + CONFIRM,
      inputSchema: { song: z.string().min(1).describe("Titre, identifiant ou adresse courte (slug) de la chanson") },
      annotations: DESTRUCTIVE,
    },
    async ({ song }) => {
      const current = await requireSong(song);
      await musics.deleteMusic(String(current.id));
      return { message: `« ${current.title} » a été supprimée du site.`, ancienne_fiche: songUrl(current) };
    },
  );

  // ---------------- Rubriques ----------------

  const sectionSettings = {
    description: z.string().max(500).optional().describe("Phrase affichée en haut de la page de la rubrique"),
    item_label: z.string().max(100).optional().describe("Fin du titre « Acheter … » sur les fiches (ex. « la chanson de Noël »)"),
    has_creatoke: z.boolean().optional().describe("Proposer une version créatoké (fichiers et prix) dans cette rubrique"),
    has_lyrics: z.boolean().optional().describe("Proposer les paroles dans cette rubrique"),
    icon: z.string().optional().describe("Icône Remix Icon, ex. « ri-snowy-line » (https://remixicon.com)"),
    position: z.number().int().min(0).max(10000).optional().describe("Ordre dans le menu (plus petit = plus haut)"),
  };

  action(
    "create_section",
    {
      title: "Créer une rubrique",
      description:
        "Crée une rubrique du catalogue (ex. « Chansons de Noël ») : elle apparaît aussitôt dans le menu du site, vide, et " +
        "devient disponible pour les chansons. Exemple de réglages : créatoké et paroles pour des chansons à chanter." + CONFIRM,
      inputSchema: { label: z.string().min(1).max(100).describe("Nom affiché dans le menu"), ...sectionSettings },
      annotations: WRITE,
    },
    async (input) => {
      const created = await sectionsStore.create(input);
      return { message: "Rubrique créée : elle apparaît dans le menu du site.", rubrique: created, page: `${SITE_URL}/song/${created.slug}` };
    },
  );

  action(
    "update_section",
    {
      title: "Modifier une rubrique",
      description:
        "Change le nom, la description, l'icône, l'ordre ou les réglages (créatoké, paroles) d'une rubrique. Son adresse " +
        "(slug) ne change pas." + CONFIRM,
      inputSchema: {
        section: z.string().min(1).describe("Slug de la rubrique (list_sections)"),
        label: z.string().min(1).max(100).optional().describe("Nouveau nom"),
        ...sectionSettings,
      },
      annotations: { ...WRITE, idempotentHint: true },
    },
    async ({ section, ...input }) => {
      const updated = await sectionsStore.update(section, input);
      return { message: "Rubrique modifiée.", rubrique: updated };
    },
  );

  action(
    "delete_section",
    {
      title: "Supprimer une rubrique",
      description:
        "Supprime une rubrique VIDE (sans chanson) : elle disparaît du menu. Une rubrique qui contient des chansons est " +
        "refusée : déplacez d'abord les chansons (update_song) ou supprimez-les." + CONFIRM,
      inputSchema: { section: z.string().min(1).describe("Slug de la rubrique (list_sections)") },
      annotations: DESTRUCTIVE,
    },
    async ({ section }) => {
      await sectionsStore.delete(section);
      return { message: `Rubrique « ${section} » supprimée du menu.` };
    },
  );

  // ---------------- Vidéos et réseaux sociaux ----------------

  const NETWORK_NAMES: Record<string, string> = {
    instagram: "Instagram (Reel)", facebook: "Facebook", youtube: "YouTube", bluesky: "Bluesky", linkedin: "LinkedIn", twitter: "X (Twitter)",
  };

  action(
    "publish_video",
    {
      title: "Publier une vidéo sur les réseaux",
      description:
        "Publie une vidéo sur tous les réseaux sociaux configurés (Instagram, Facebook, YouTube, Bluesky ; LinkedIn et X " +
        "partagent ensuite le lien YouTube), comme la page « Publier une vidéo ». La vidéo est téléchargée depuis un lien de " +
        "partage (Google Drive, Dropbox ou lien direct, 512 Mo maximum), compressée puis publiée en arrière-plan : la réponse " +
        "arrive tout de suite, le résultat de chaque réseau quelques minutes plus tard avec list_video_posts. La publication est " +
        "publique et ne peut pas être annulée d'ici. Description : 280 caractères maximum, hashtags compris." + CONFIRM,
      inputSchema: {
        video_link: z.string().url().describe("Lien vers la vidéo (https)"),
        title: z.string().min(1).max(100).describe("Titre (utilisé par YouTube)"),
        description: z.string().min(1).max(2000).describe("Texte de la publication, hashtags compris (coupé à 280 caractères)"),
      },
      annotations: { ...WRITE, openWorldHint: true },
    },
    async ({ video_link, title, description }) => {
      const networks = networkStatus().filter((n) => n.configured).map((n) => NETWORK_NAMES[n.id] ?? n.id);
      if (!networks.length) throw new ActionError("Aucun réseau social n'est configuré sur le serveur.");
      const text = Array.from(description.trim()).slice(0, 280).join("");

      // Le téléchargement se fait tout de suite (lien invalide = erreur immédiate),
      // la compression et la publication ensuite, en arrière-plan.
      const imported = await importFileFromUrl(video_link, "video", "");
      const sourcePath = path.join(UPLOAD_DIR, decodeURIComponent(new URL(imported.url).pathname.split("/").pop() ?? ""));
      const postId = await startVideoPost({ title: title.trim(), description: text, source: "assistant" });

      void (async () => {
        const compressedName = path.basename(sourcePath).replace(/(\.[^.]+)?$/, "_compressed.mp4");
        const compressedPath = path.join(UPLOAD_DIR, compressedName);
        try {
          await videoCompress(sourcePath, compressedPath);
        } catch (error) {
          await fs.promises.unlink(compressedPath).catch(() => undefined);
          throw new Error(`Compression impossible : ${error instanceof Error ? error.message : "erreur inconnue"}`);
        } finally {
          await fs.promises.unlink(sourcePath).catch(() => undefined);
        }
        const publicUrl = buildPublicUrl(null, compressedName);
        if (!publicUrl) throw new Error("Adresse publique des fichiers non configurée.");
        const results = await publishVideo({ title: title.trim(), description: text, filePath: compressedPath, publicUrl, mimeType: "video/mp4" });
        await finishVideoPost(postId, { videoUrl: publicUrl, results });
      })().catch(async (error) => {
        console.error("[social] publication assistant :", error instanceof Error ? error.message : error);
        await finishVideoPost(postId, { error: error instanceof Error ? error.message : String(error) }).catch(() => undefined);
      });

      return {
        message: "Vidéo reçue : compression et publication en cours. Le résultat de chaque réseau sera visible dans quelques minutes (list_video_posts).",
        publication: postId,
        reseaux: networks,
        texte_publie: text,
      };
    },
  );

  server.registerTool(
    "list_video_posts",
    {
      title: "Vidéos publiées et résultats",
      description:
        "Historique des vidéos publiées sur les réseaux (depuis le site ou l'assistant), avec le résultat de chaque réseau " +
        "(publiée avec lien, échec avec la raison, ignorée) et la liste des réseaux configurés. Exemples : « La vidéo est-elle " +
        "bien partie sur YouTube ? », « Qu'a-t-on publié ce mois-ci ? ».",
      inputSchema: { limit: z.number().int().min(1).max(100).optional().describe("Nombre de publications (10 par défaut)") },
      annotations: { title: "Vidéos publiées et résultats", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ limit }) => {
      const posts = await listVideoPosts(limit ?? 10);
      const status = (p: (typeof posts)[number]) => {
        if (p.status === "running") {
          const minutes = (Date.now() - new Date(p.created_at).getTime()) / 60000;
          return minutes > 30 ? "probablement interrompue (aucun résultat après 30 minutes)" : "en cours";
        }
        return p.status === "failed" ? "échec" : "terminée";
      };
      return json({
        reseaux_configures: networkStatus().map((n) => ({ reseau: NETWORK_NAMES[n.id] ?? n.id, configure: n.configured })),
        publications: posts.map((p) => ({
          id: p.id,
          date: p.created_at,
          depuis: p.source === "assistant" ? "assistant IA" : "site",
          titre: p.title,
          texte: p.description,
          etat: status(p),
          ...(p.error ? { erreur: p.error } : {}),
          resultats: p.results
            ? (JSON.parse(p.results) as { network: string; status: string; url?: string; message?: string }[]).map((r) => ({
                reseau: NETWORK_NAMES[r.network] ?? r.network,
                etat: r.status === "ok" ? "publiée" : r.status === "error" ? "échec" : "ignorée",
                ...(r.url ? { lien: r.url } : {}),
                ...(r.message ? { detail: r.message } : {}),
              }))
            : [],
        })),
      });
    },
  );

  // ---------------- Licences ----------------

  action(
    "update_licence_terms",
    {
      title: "Modifier un texte de licence",
      description:
        "Remplace le texte d'une licence (affiché sur toutes les fiches) ou d'un contrat. Fournir le texte complet." + CONFIRM,
      inputSchema: {
        section: z.enum(["licence_de_base", "licence_premium", "licence_pro_et_exclusivite", "contrat_mp3", "contrat_wav"]),
        text: z.string().min(1).max(50000).describe("Nouveau texte complet (paragraphes séparés par une ligne vide)"),
      },
      annotations: { ...DESTRUCTIVE, idempotentHint: true },
    },
    async ({ section, text }) => {
      const column = {
        licence_de_base: "basic", licence_premium: "base_plus", licence_pro_et_exclusivite: "premium",
        contrat_mp3: "contract_mp3", contrat_wav: "contract_wav",
      }[section];
      const row = await selectOne("SELECT id FROM licence LIMIT 1");
      await licences.updateLicence({ ...(row ? { id: row.id } : {}), [column]: toHtml(text) });
      return { message: "Texte de licence enregistré.", section, nouveau_texte: plain(toHtml(text)) };
    },
  );

  // ---------------- Prospection ----------------

  const prospectFields = {
    first_name: z.string().max(255).optional().describe("Prénom"),
    last_name: z.string().max(255).optional().describe("Nom"),
    email: z.string().email().optional().describe("Adresse e-mail"),
    company: z.string().max(255).optional().describe("Société / maison d'édition"),
    song: z.string().optional().describe("Chanson proposée (titre ou slug) : le lien est ajouté à l'e-mail"),
    notes: z.string().max(5000).optional().describe("Notes internes"),
  };

  const prospectColumns = async (fields: {
    first_name?: string; last_name?: string; email?: string; company?: string; song?: string; notes?: string;
  }) => {
    const data: Record<string, string> = {};
    if (fields.first_name !== undefined) data.prenom = fields.first_name.trim();
    if (fields.last_name !== undefined) data.nom = fields.last_name.trim();
    if (fields.email !== undefined) data.email = fields.email.trim();
    if (fields.company !== undefined) data.societe = fields.company.trim();
    if (fields.notes !== undefined) data.notes = fields.notes.trim();
    if (fields.song !== undefined) {
      const song = await requireSong(fields.song);
      data.id_song = String(song.id);
      data.titre_chanson = String(song.title);
      data.lien_musique = songUrl(song);
    }
    return data;
  };

  action(
    "create_prospect",
    {
      title: "Ajouter un prospect",
      description: "Ajoute un éditeur ou contact à prospecter (statut brouillon : aucun e-mail n'est envoyé)." + CONFIRM,
      inputSchema: { ...prospectFields, email: z.string().email().describe("Adresse e-mail") },
      annotations: WRITE,
    },
    async (fields) => {
      const created = await prospects.createProspect(await prospectColumns(fields));
      return { message: "Prospect ajouté (présentation pas encore envoyée).", id: created.id };
    },
  );

  action(
    "update_prospect",
    {
      title: "Modifier un prospect",
      description: "Modifie les coordonnées, la chanson proposée ou les notes d'un prospect (seuls les champs fournis changent)." + CONFIRM,
      inputSchema: { prospect: z.string().min(1).describe("E-mail, nom ou identifiant du prospect"), ...prospectFields },
      annotations: { ...DESTRUCTIVE, idempotentHint: true },
    },
    async ({ prospect, ...fields }) => {
      const current = await requireProspect(prospect);
      const changes = await prospectColumns(fields);
      if (!Object.keys(changes).length) throw new ActionError("Aucun changement demandé.");
      await prospects.updateProspect({ ...changes, id: String(current.id) });
      return { message: "Prospect modifié.", champs_modifies: Object.keys(changes) };
    },
  );

  action(
    "send_prospect_presentation",
    {
      title: "Envoyer l'e-mail de présentation",
      description:
        "Envoie l'e-mail de présentation (J0) à UN prospect au statut brouillon et démarre ses relances automatiques " +
        "(J+10, J+30, J+60). L'e-mail part réellement." + CONFIRM,
      inputSchema: { prospect: z.string().min(1).describe("E-mail, nom ou identifiant du prospect") },
      annotations: { ...WRITE, openWorldHint: true },
    },
    async ({ prospect }) => {
      const current = await requireProspect(prospect);
      await prospects.sendPresentation(String(current.id));
      return { message: `Présentation envoyée à ${current.email} ; relances programmées.` };
    },
  );

  action(
    "mark_prospect_replied",
    {
      title: "Marquer un prospect comme ayant répondu",
      description: "Indique qu'un prospect a répondu : ses relances automatiques s'arrêtent." + CONFIRM,
      inputSchema: { prospect: z.string().min(1).describe("E-mail, nom ou identifiant du prospect") },
      annotations: { ...WRITE, idempotentHint: true },
    },
    async ({ prospect }) => {
      const current = await requireProspect(prospect);
      await prospects.markReplied(String(current.id));
      return { message: `${[current.prenom, current.nom].filter(Boolean).join(" ")} marqué « a répondu » : relances arrêtées.` };
    },
  );

  server.registerTool(
    "get_email_templates",
    {
      title: "Modèles d'e-mails de prospection",
      description:
        "Sujet et texte des 4 e-mails de la séquence (présentation J0, rappels J+10, J+30, J+60). Variables disponibles : " +
        "{prenom}, {nom}, {titre}, {lien}.",
      inputSchema: {},
      annotations: { title: "Modèles d'e-mails de prospection", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => json(await templates.listTemplates()),
  );

  action(
    "update_email_template",
    {
      title: "Modifier un modèle d'e-mail",
      description:
        "Modifie le sujet et/ou le texte d'un e-mail de la séquence de prospection (texte brut ; variables {prenom}, {nom}, " +
        "{titre}, {lien}). Lire d'abord get_email_templates." + CONFIRM,
      inputSchema: {
        template: z.enum(TEMPLATE_KEYS).describe("presentation = J0 ; relance-1 = J+10 ; relance-2 = J+30 ; relance-3 = J+60"),
        subject: z.string().max(500).optional().describe("Nouveau sujet (sinon inchangé)"),
        body: z.string().max(20000).optional().describe("Nouveau texte complet (sinon inchangé)"),
      },
      annotations: { ...DESTRUCTIVE, idempotentHint: true },
    },
    async ({ template, subject, body }) => {
      if (subject === undefined && body === undefined) throw new ActionError("Aucun changement demandé.");
      const current = await templates.getTemplate(template);
      await templates.updateTemplate(template, subject ?? current.subject, body ?? current.body);
      return { message: "Modèle enregistré : les prochains envois utiliseront ce texte.", modele: template };
    },
  );

  action(
    "run_prospect_followups",
    {
      title: "Lancer les relances maintenant",
      description:
        "Envoie tout de suite les relances dues (normalement envoyées chaque jour à 9 h) et clôture les dossiers à J+90. " +
        "N'envoie rien de plus que le passage automatique : chaque relance ne part qu'une fois." + CONFIRM,
      inputSchema: {},
      annotations: { ...WRITE, openWorldHint: true },
    },
    async () => {
      const result = await prospects.runSequence();
      return {
        message: "Relances traitées.",
        prospects_examines: result.processed, relances_envoyees: result.sent, dossiers_clotures: result.closed, erreurs: result.errors,
      };
    },
  );

  // ---------------- Contenu du site ----------------

  server.registerTool(
    "get_home_text",
    {
      title: "Texte de l'accueil",
      description: "Texte de présentation affiché sur la page d'accueil (section « À propos de Créatoké »).",
      inputSchema: {},
      annotations: { title: "Texte de l'accueil", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      const row = await selectOne("SELECT text FROM texts LIMIT 1");
      return json({ texte: plain(row?.text) ?? "" });
    },
  );

  action(
    "update_home_text",
    {
      title: "Modifier le texte de l'accueil",
      description:
        "Remplace le texte de présentation de la page d'accueil. Fournir le texte complet (lire d'abord get_home_text). " +
        "Titres possibles en HTML (<h3>), sinon paragraphes séparés par une ligne vide." + CONFIRM,
      inputSchema: { text: z.string().min(1).max(50000).describe("Nouveau texte complet") },
      annotations: { ...DESTRUCTIVE, idempotentHint: true },
    },
    async ({ text }) => {
      const row = await selectOne("SELECT id FROM texts LIMIT 1");
      await categories.modifyText({ ...(row ? { id: String(row.id) } : {}), text: toHtml(text) });
      return { message: "Texte de l'accueil enregistré.", apercu: `${SITE_URL}/` };
    },
  );

  action(
    "set_background_image",
    {
      title: "Changer l'image de fond",
      description:
        "Remplace l'image affichée en haut de toutes les pages. Accepte un lien de partage (Google Drive, Dropbox) ou direct " +
        "vers une image en largeur (1920 px de large ou plus). L'ancienne image est supprimée du serveur." + CONFIRM,
      inputSchema: { image_link: z.string().url().describe("Lien vers l'image (https)") },
      annotations: { ...DESTRUCTIVE, openWorldHint: true },
    },
    async ({ image_link }) => {
      const imported = await importFileFromUrl(image_link, "image", "background");
      await categories.createBackground({ picture: imported.url, picture_name: imported.nom_fichier });
      return { message: "Nouvelle image de fond en place.", image: imported };
    },
  );

  server.registerTool(
    "list_comments",
    {
      title: "Commentaires",
      description: "Commentaires laissés par les visiteurs sur les fiches (les plus récents d'abord), pour la modération.",
      inputSchema: {
        song: z.string().optional().describe("Seulement les commentaires d'une chanson (titre ou slug)"),
        limit: z.number().int().min(1).max(200).optional().describe("Nombre maximum (30 par défaut)"),
      },
      annotations: { title: "Commentaires", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ song, limit }) => {
      const target = song ? await findSong(song) : null;
      if (song && !target) return { content: [{ type: "text", text: `Aucune chanson trouvée pour « ${song} ».` }], isError: true };
      const rows = await selectRows<DbRecord>(
        `SELECT c.*, m.title FROM comment c LEFT JOIN musics m ON m.id = c.music_id
          ${target ? "WHERE c.music_id = ?" : ""}
          ORDER BY STR_TO_DATE(c.created_at, '%d/%m/%Y') DESC, c.created_at DESC LIMIT ?`,
        [...(target ? [target.id] : []), limit ?? 30],
      );
      return json({
        nombre: rows.length,
        commentaires: rows.map((c) => ({
          id: c.id, chanson: c.title ?? null, auteur: c.name, email: c.email, note: c.ratings, texte: c.comment, date: c.created_at,
        })),
      });
    },
  );

  action(
    "delete_comment",
    {
      title: "Supprimer un commentaire",
      description: "Supprime définitivement UN commentaire (spam, propos inappropriés). Identifiant fourni par list_comments." + CONFIRM,
      inputSchema: { comment_id: z.string().min(1).describe("Identifiant du commentaire (list_comments)") },
      annotations: DESTRUCTIVE,
    },
    async ({ comment_id }) => {
      const row = await selectOne("SELECT id, name, comment FROM comment WHERE id = ?", [comment_id]);
      if (!row) throw new ActionError("Commentaire introuvable.");
      await comments.deleteComment(comment_id);
      return { message: "Commentaire supprimé.", auteur: row.name, texte: row.comment };
    },
  );
}
