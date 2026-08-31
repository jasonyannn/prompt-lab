/**
 * Library categories.
 *
 * Every user starts with the same defaults, then adds their own. Prompt categories
 * are still plain strings on the prompt itself — this store only tracks the set
 * a user can choose from, so a freshly created (and still empty) category
 * survives a reload and shows up in the library filter.
 */

export const DEFAULT_CATEGORIES = [
  "Accounting",
  "Business",
  "Career",
  "Coding",
  "Design",
  "E-commerce",
  "Education",
  "Finance",
  "Health",
  "Hobbies",
  "Marketing",
  "Personal",
  "Productivity",
  "Relationships",
  "Security",
  "Tax",
  "Writing",
];

const STORAGE_KEY = "promptlab_categories";
const UPDATED_EVENT = "promptlab:categories-updated";

/**
 * Bumped whenever DEFAULT_CATEGORIES gains entries. On read, a stored list from
 * an older seed is merged with the current defaults, so existing users pick up
 * new categories instead of being stuck with whatever shipped first. Custom
 * categories are always preserved; a default someone deleted does come back
 * once, which is the price of keeping the merge this simple.
 */
const SEED_VERSION = 2;

type StoredCategories = { version: number; categories: string[] };

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

function persist(categories: string[]) {
  const payload: StoredCategories = { version: SEED_VERSION, categories };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

/** Keeps the user's own order, then appends defaults they do not have yet. */
function mergeWithDefaults(existing: string[]) {
  const known = new Set(existing.map((name) => name.toLowerCase()));
  return [
    ...existing,
    ...DEFAULT_CATEGORIES.filter((name) => !known.has(name.toLowerCase())),
  ];
}

function read(): string[] {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    persist(DEFAULT_CATEGORIES);
    return [...DEFAULT_CATEGORIES];
  }

  try {
    const parsed: unknown = JSON.parse(saved);

    // Version 1 stored a bare array.
    const stored = Array.isArray(parsed)
      ? { version: 1, categories: parsed }
      : (parsed as StoredCategories);

    if (!stored || !Array.isArray(stored.categories)) {
      persist(DEFAULT_CATEGORIES);
      return [...DEFAULT_CATEGORIES];
    }

    const names = dedupe(
      stored.categories
        .filter((entry): entry is string => typeof entry === "string")
        .map(normalise)
        .filter(Boolean)
    );

    if ((stored.version ?? 1) < SEED_VERSION) {
      const merged = mergeWithDefaults(names);
      persist(merged);
      return merged;
    }

    return names.length > 0 ? names : [...DEFAULT_CATEGORIES];
  } catch {
    return [...DEFAULT_CATEGORIES];
  }
}

function write(categories: string[]) {
  persist(categories);
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
