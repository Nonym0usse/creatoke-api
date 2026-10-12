import { selectOne, type DbRecord } from "../database/mysql.ts";
import { Sections, type Section } from "../middleware/admin/Sections.ts";

// Fonctions communes aux outils de lecture (tools.ts) et d'action (actions.ts).

export const SITE_URL = (process.env.SITE_URL ?? "https://creatoke.com").replace(/\/$/, "");

// Rubriques du catalogue (table sections), relues au début de chaque requête MCP.
let sections: Section[] = [];

export async function loadSections(): Promise<Section[]> {
  sections = await new Sections().list();
  return sections;
}

export const currentSections = (): Section[] => sections;
export const sectionOf = (slug: unknown): Section | undefined => sections.find((s) => s.slug === String(slug));
export const sectionSlugs = (): string => sections.map((s) => s.slug).join(", ");

// ---- Mise en forme ----

export const empty = (value: unknown): boolean => value === null || value === undefined || value === "" || value === "vide";

export const text = (value: unknown): string | null => (empty(value) ? null : String(value));

// Licence vendue : enregistrée sous le nom du champ de prix (parfois vide sur les anciennes ventes).
const LICENCES: Record<string, string> = {
  price_base: "Licence de base chanson (MP3)",
  price_premium: "Licence premium chanson (WAV)",
  price_base_creatoke: "Licence de base créatoké (MP3)",
  price_premium_creatoke: "Licence premium créatoké (WAV)",
};
export const licenceLabel = (key: unknown): string => LICENCES[String(key ?? "")] ?? (empty(key) ? "non précisée" : String(key));


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
export function plain(html: unknown): string | null {
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

export const fileName = (url: unknown): string | null => {
  if (empty(url)) return null;
  try {
    return decodeURIComponent(new URL(String(url)).pathname.split("/").pop() ?? "").replace(/^\d{13}_[0-9a-f]{16}_/, "");
  } catch {
    return String(url);
  }
};

export const songUrl = (song: DbRecord): string => `${SITE_URL}/song/${song.category}/${song.slug}`;
export const categoryLabel = (key: unknown): string => sectionOf(key)?.label ?? String(key ?? "");

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

export function songSummary(song: DbRecord) {
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

export function songDetails(song: DbRecord) {
  const hasCreatoke = Boolean(sectionOf(song.category)?.has_creatoke);
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

export async function findSong(reference: string): Promise<DbRecord | null> {
  const ref = reference.trim();
  return (
    (await selectOne("SELECT * FROM musics WHERE id = ? OR slug = ?", [ref, ref])) ??
    (await selectOne("SELECT * FROM musics WHERE title = ?", [ref])) ??
    (await selectOne("SELECT * FROM musics WHERE title LIKE ? ORDER BY CHAR_LENGTH(title) LIMIT 1", [`%${ref}%`]))
  );
}

export async function findProspect(reference: string): Promise<DbRecord | null> {
  const ref = reference.trim();
  const like = `%${ref}%`;
  return (
    (await selectOne<DbRecord>("SELECT * FROM prospects WHERE id = ? OR email = ?", [ref, ref])) ??
    (await selectOne<DbRecord>(
      `SELECT * FROM prospects WHERE CONCAT_WS(' ', prenom, nom) LIKE ? OR CONCAT_WS(' ', nom, prenom) LIKE ?
         OR societe LIKE ? OR email LIKE ? ORDER BY createdAt DESC LIMIT 1`,
      [like, like, like, like]))
  );
}
