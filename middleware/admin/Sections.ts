import { execute, selectOne, selectRows } from "../../database/mysql.ts";

// Rubriques du catalogue (table sections). Le front les lit pour le menu,
// les pages de rubrique, les fiches et les formulaires d'ajout / de modification.

export interface Section {
  slug: string;
  label: string;
  icon: string;
  description: string;
  item_label: string;
  has_creatoke: boolean;
  has_lyrics: boolean;
  position: number;
}

export interface SectionInput {
  label?: string;
  icon?: string;
  description?: string;
  item_label?: string;
  has_creatoke?: boolean;
  has_lyrics?: boolean;
  position?: number;
}

type SectionRow = Omit<Section, "has_creatoke" | "has_lyrics"> & { has_creatoke: number; has_lyrics: number };

const toSection = (row: SectionRow): Section => ({
  ...row,
  has_creatoke: Boolean(row.has_creatoke),
  has_lyrics: Boolean(row.has_lyrics),
});

/** « Chansons de Noël » → chansons-de-noel (même règle que les adresses de chansons). */
export function sectionSlug(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Icônes Remix Icon (https://remixicon.com) : « ri-xxx-line » uniquement.
const validIcon = (icon: string): boolean => /^ri-[a-z0-9-]+-(line|fill)$/.test(icon);

export class Sections {
  async list(): Promise<Section[]> {
    const rows = await selectRows<SectionRow>(
      "SELECT slug, label, icon, description, item_label, has_creatoke, has_lyrics, position FROM sections ORDER BY position, label",
    );
    return rows.map(toSection);
  }

  async get(slug: string): Promise<Section | null> {
    const row = await selectOne<SectionRow>(
      "SELECT slug, label, icon, description, item_label, has_creatoke, has_lyrics, position FROM sections WHERE slug = ?",
      [slug],
    );
    return row ? toSection(row) : null;
  }

  async create(input: SectionInput & { label: string }): Promise<Section> {
    const label = input.label.trim();
    const slug = sectionSlug(label);
    if (!label || !slug) throw new Error("INVALID_LABEL");
    if (await this.get(slug)) throw new Error("SECTION_EXISTS");
    if (input.icon && !validIcon(input.icon)) throw new Error("INVALID_ICON");
    const last = await selectOne<{ max: number | null }>("SELECT MAX(position) AS max FROM sections");
    await execute(
      `INSERT INTO sections (slug, label, icon, description, item_label, has_creatoke, has_lyrics, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        slug,
        label,
        input.icon ?? "ri-music-2-line",
        input.description?.trim() ?? "",
        input.item_label?.trim() || "la chanson",
        input.has_creatoke ? 1 : 0,
        input.has_lyrics === false ? 0 : 1,
        input.position ?? Number(last?.max ?? 0) + 10,
      ],
    );
    return (await this.get(slug))!;
  }

  async update(slug: string, input: SectionInput): Promise<Section> {
    const current = await this.get(slug);
    if (!current) throw new Error("SECTION_NOT_FOUND");
    if (input.icon && !validIcon(input.icon)) throw new Error("INVALID_ICON");
    const next = { ...current, ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) };
    if (!String(next.label).trim()) throw new Error("INVALID_LABEL");
    await execute(
      `UPDATE sections SET label = ?, icon = ?, description = ?, item_label = ?, has_creatoke = ?, has_lyrics = ?, position = ?
        WHERE slug = ?`,
      [
        String(next.label).trim(), next.icon, String(next.description).trim(), String(next.item_label).trim() || "la chanson",
        next.has_creatoke ? 1 : 0, next.has_lyrics ? 1 : 0, Number(next.position), slug,
      ],
    );
    return (await this.get(slug))!;
  }

  /** Seulement une rubrique vide : on ne supprime jamais des chansons par ce biais. */
  async delete(slug: string): Promise<void> {
    const current = await this.get(slug);
    if (!current) throw new Error("SECTION_NOT_FOUND");
    const used = await selectOne<{ n: number }>("SELECT COUNT(*) AS n FROM musics WHERE category = ?", [slug]);
    if (Number(used?.n ?? 0) > 0) throw new Error("SECTION_NOT_EMPTY");
    await execute("DELETE FROM sections WHERE slug = ?", [slug]);
  }
}

export const SECTION_ERRORS: Record<string, string> = {
  INVALID_LABEL: "Nom de rubrique invalide.",
  SECTION_EXISTS: "Une rubrique porte déjà ce nom.",
  SECTION_NOT_FOUND: "Rubrique introuvable.",
  SECTION_NOT_EMPTY: "La rubrique contient encore des chansons : déplacez-les ou supprimez-les d'abord.",
  INVALID_ICON: "Icône invalide (attendu : une icône Remix Icon, par ex. « ri-music-2-line »).",
};
