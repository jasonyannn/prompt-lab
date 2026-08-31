/**
 * Library categories.
 *
 * Every user starts with the same seven, then adds their own. Prompt categories
 * are still plain strings on the prompt itself — this store only tracks the set
 * a user can choose from, so a freshly created (and still empty) category
 * survives a reload and shows up in the library filter.
 */

export const DEFAULT_CATEGORIES = [
  "Coding",
  "Personal",
  "Finance",
  "Marketing",
  "Design",
  "Security",
  "Hobbies",
];

const STORAGE_KEY = "promptlab_categories";
const UPDATED_EVENT = "promptlab:categories-updated";

function normalise(name: string) {
  return name.replace(/\s+/g, " ").trim().slice(0, 32);
}

function dedupe(names: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of names) {
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    result.push(name);
  }
  return result;
}

function read(): string[] {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_CATEGORIES));
    return [...DEFAULT_CATEGORIES];
  }

  try {
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [...DEFAULT_CATEGORIES];
    const names = dedupe(
      parsed
        .filter((entry): entry is string => typeof entry === "string")
        .map(normalise)
    );
    return names.length > 0 ? names : [...DEFAULT_CATEGORIES];
  } catch {
    return [...DEFAULT_CATEGORIES];
  }
}

function write(categories: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(categories));
  window.dispatchEvent(new CustomEvent(UPDATED_EVENT));
}

export const categoryStore = {
  eventName: UPDATED_EVENT,

  getAll(): string[] {
    return read();
  },

  /** Returns the canonical spelling if the name already exists. */
  find(name: string): string | undefined {
    const key = normalise(name).toLowerCase();
    return read().find((category) => category.toLowerCase() === key);
  },

  /**
   * Adds a category. Returns the canonical name, or null if the input was
   * empty. An existing category is returned untouched rather than duplicated
   * with different casing.
   */
  create(name: string): string | null {
    const clean = normalise(name);
    if (!clean) return null;

    const categories = read();
    const existing = categories.find(
      (category) => category.toLowerCase() === clean.toLowerCase()
    );
    if (existing) return existing;

    write([...categories, clean]);
    return clean;
  },

  /** Registers a category used by a prompt so it stays selectable. */
  ensure(name: string): string {
    return this.create(name) ?? "General";
  },

  remove(name: string) {
    const key = normalise(name).toLowerCase();
    const remaining = read().filter(
      (category) => category.toLowerCase() !== key
    );
    write(remaining);
  },

  replaceAll(categories: string[]) {
    write(dedupe(categories.map(normalise).filter(Boolean)));
  },
};
