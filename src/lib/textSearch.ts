/**
 * Shared ranked text search.
 *
 * Every search surface — Discover, the library, `search_products`,
 * `search_catalog` and the remote D1 library — used to do its own substring
 * matching, so "I want to get fit" found nothing tagged "fitness", a stray "a"
 * in a query matched every record, and "art" matched "start". This module
 * gives them one retrieval model:
 *
 * - **Tokens, not substrings.** Text is split into words, stop words dropped,
 *   and each word lightly stemmed, so "budgets" and "budgeting" meet "budget".
 * - **Synonym expansion.** A query term also matches its small hand-written
 *   synonym group, at reduced weight, so a goal phrased in the user's words
 *   reaches content written in the catalog's words.
 * - **Field weights.** A hit in a title outranks a hit in a body.
 * - **IDF.** Rare terms count for more than ones that appear everywhere.
 * - **Coverage.** A record matching every query term beats one matching a
 *   single term many times.
 *
 * Deterministic and dependency-free, so it runs identically in the browser and
 * in the worker.
 */

const STOP_WORDS = new Set([
  "a", "about", "after", "again", "all", "am", "an", "and", "any", "are", "as",
  "at", "be", "been", "being", "but", "by", "can", "could", "do", "does",
  "doing", "for", "from", "get", "getting", "give", "go", "going", "got", "had",
  "has", "have", "help", "how", "i", "if", "im", "in", "into", "is", "it",
  "its", "just", "like", "make", "me", "more", "my", "need", "new", "of", "off",
  "on", "one", "or", "our", "out", "please", "really", "should", "so", "some",
  "something", "that", "the", "their", "them", "then", "there", "these",
  "they", "this", "those", "to", "too", "up", "us", "use", "using", "very",
  "want", "was", "way", "we", "were", "what", "when", "where", "which", "while",
  "who", "why", "will", "with", "would", "you", "your",
]);

/**
 * Small, conservative suffix stripper. It does not need to produce real words,
 * only to map inflections of one word to the same key — and it is applied to
 * queries and documents alike, so the keys always agree.
 */
export function stem(word: string): string {
  let w = word;
  if (w.length > 4 && w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.length > 5 && w.endsWith("ing")) {
    w = w.slice(0, -3);
    // running → run, shopping → shop
    if (w.length > 2 && w[w.length - 1] === w[w.length - 2]) w = w.slice(0, -1);
    return w;
  }
  if (w.length > 4 && w.endsWith("ed")) {
    w = w.slice(0, -2);
    if (w.length > 2 && w[w.length - 1] === w[w.length - 2]) w = w.slice(0, -1);
    return w;
  }
  if (w.length > 3 && /(ss|x|z|ch|sh)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us")) {
    return w.slice(0, -1);
  }
  return w;
}

/** Lowercased, accent-stripped, stop-word-free, stemmed tokens. */
export function tokenize(text: string): string[] {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word))
    .map(stem);
}

/**
 * Words people use for the same goal. Kept deliberately tight: a group that is
 * too broad makes every query match everything, which is worse than a miss.
 */
const SYNONYM_GROUPS: string[][] = [
  ["fit", "fitness", "workout", "exercise", "gym", "shape", "strength", "training"],
  ["diet", "nutrition", "meal", "eating", "food", "recipe", "cooking"],
  ["job", "career", "resume", "cv", "interview", "hiring", "recruiter", "employer"],
  ["store", "shop", "ecommerce", "retail", "seller", "merchant", "dropshipping"],
  ["money", "finance", "financial", "budget", "saving", "debt", "spending", "invest"],
  ["learn", "study", "studying", "learning", "course", "exam", "tutor", "revision"],
  ["write", "writing", "essay", "blog", "article", "copywriting", "draft"],
  ["edit", "editing", "editor", "proofread", "rewrite", "revise"],
  ["marketing", "growth", "seo", "advertising", "ads", "campaign", "promotion"],
  ["code", "coding", "software", "programming", "developer", "engineering"],
  ["bug", "debug", "error", "troubleshooting", "fix"],
  ["app", "application", "mvp", "prototype"],
  ["startup", "business", "company", "founder", "venture"],
  ["fundraising", "investor", "vc", "pitch", "raise", "funding"],
  ["productivity", "focus", "procrastination", "habit", "routine"],
  ["plan", "planning", "schedule", "organise", "organize"],
  ["relationship", "dating", "partner", "couple", "conflict"],
  ["travel", "trip", "vacation", "holiday", "itinerary"],
  ["presentation", "deck", "slides", "keynote", "talk"],
  ["ux", "usability", "interface", "ui"],
  ["email", "newsletter", "outreach", "inbox"],
  ["research", "analysis", "analyse", "analyze", "investigate"],
  ["idea", "ideas", "brainstorm", "ideation"],
  ["launch", "release", "ship", "go-to-market"],
  ["customer", "client", "user", "buyer"],
  ["price", "pricing", "cost", "costing"],
  ["social", "instagram", "tiktok", "linkedin", "youtube"],
];

const SYNONYMS: Map<string, Set<string>> = (() => {
  const map = new Map<string, Set<string>>();
  for (const group of SYNONYM_GROUPS) {
    const keys = [...new Set(group.flatMap(tokenize))];
    for (const key of keys) {
      const related = map.get(key) ?? new Set<string>();
      for (const other of keys) if (other !== key) related.add(other);
      map.set(key, related);
    }
  }
  return map;
})();

/** Weight a synonym hit carries relative to the literal term. */
const SYNONYM_WEIGHT = 0.6;
/** Weight a prefix hit ("cov" → "cover") carries relative to an exact one. */
const PREFIX_WEIGHT = 0.7;

export type SearchField = { text: string; weight: number };

type IndexedField = { tokens: Set<string>; weight: number };

type QueryTerm = {
  /** The stemmed literal term. */
  term: string;
  /** Stemmed synonyms that also count, at SYNONYM_WEIGHT. */
  synonyms: string[];
};

export function parseQuery(query: string): QueryTerm[] {
  const seen = new Set<string>();
  const terms: QueryTerm[] = [];
  for (const term of tokenize(query)) {
    if (seen.has(term)) continue;
    seen.add(term);
    terms.push({ term, synonyms: [...(SYNONYMS.get(term) ?? [])] });
  }
  return terms;
}

/** How strongly one token set answers one term: 1 exact, 0.7 prefix, 0 none. */
function tokenMatch(tokens: Set<string>, term: string): number {
  if (tokens.has(term)) return 1;
  // Prefix matching only for terms long enough to be intentional, so search
  // as you type works ("cov" finds "cover") but "ai" does not match "aim".
  if (term.length >= 3) {
    for (const token of tokens) {
      if (token.length > term.length && token.startsWith(term)) return PREFIX_WEIGHT;
    }
  }
  return 0;
}

export type SearchHit<T> = { item: T; score: number };

export type SearchOptions = {
  /**
   * Minimum share of query terms (0–1) a record must answer, literally or by
   * synonym. Defaults to matching at least one term.
   */
  minCoverage?: number;
  /**
   * Drop hits scoring below this fraction of the best hit (0–1), which trims
   * the long tail of one-weak-synonym matches. Defaults to keeping everything.
   */
  minRelativeScore?: number;
};

export type SearchIndex<T> = {
  search(query: string, options?: SearchOptions): SearchHit<T>[];
  size: number;
};

/**
 * Builds an index over `items`. Fields are read once, so building is the only
 * cost proportional to corpus size; static corpora should build once and keep
 * the index.
 */
export function createSearchIndex<T>(
  items: readonly T[],
  fields: (item: T) => SearchField[]
): SearchIndex<T> {
  const documents = items.map((item) => ({
    item,
    fields: fields(item)
      .filter((field) => field.text && field.weight > 0)
      .map<IndexedField>((field) => ({
        tokens: new Set(tokenize(field.text)),
        weight: field.weight,
      })),
  }));

  const idfCache = new Map<string, number>();
  const idf = (term: string) => {
    const cached = idfCache.get(term);
    if (cached !== undefined) return cached;
    let df = 0;
    for (const doc of documents) {
      if (doc.fields.some((field) => tokenMatch(field.tokens, term) > 0)) df += 1;
    }
    const n = documents.length;
    // BM25's IDF, floored so a term present everywhere still counts a little.
    const value = Math.max(0.1, Math.log(1 + (n - df + 0.5) / (df + 0.5)));
    idfCache.set(term, value);
    return value;
  };

  return {
    size: documents.length,
    search(query, options = {}) {
      const terms = parseQuery(query);
      if (terms.length === 0) return [];
      const minCoverage = options.minCoverage ?? 0;

      const hits: SearchHit<T>[] = [];
      for (const doc of documents) {
        let score = 0;
        let covered = 0;

        for (const { term, synonyms } of terms) {
          let best = 0;
          for (const field of doc.fields) {
            const literal = tokenMatch(field.tokens, term);
            let strength = literal;
            if (literal < 1) {
              for (const synonym of synonyms) {
                const viaSynonym = tokenMatch(field.tokens, synonym) * SYNONYM_WEIGHT;
                if (viaSynonym > strength) strength = viaSynonym;
              }
            }
            best = Math.max(best, strength * field.weight);
          }
          if (best > 0) {
            covered += 1;
            score += best * idf(term);
          }
        }

        const coverage = covered / terms.length;
        if (covered === 0 || coverage < minCoverage) continue;
        // Squared coverage: matching 2 of 2 terms clearly beats 1 of 2.
        hits.push({ item: doc.item, score: score * coverage * coverage });
      }

      hits.sort((a, b) => b.score - a.score);
      const floor = (hits[0]?.score ?? 0) * (options.minRelativeScore ?? 0);
      return floor > 0 ? hits.filter((hit) => hit.score >= floor) : hits;
    },
  };
}

/** One-shot search for corpora that change between calls. */
export function rankItems<T>(
  items: readonly T[],
  query: string,
  fields: (item: T) => SearchField[],
  options?: SearchOptions
): SearchHit<T>[] {
  return createSearchIndex(items, fields).search(query, options);
}

/** The distinct raw words of a query, for building a broad SQL prefilter. */
export function queryWords(query: string): string[] {
  const words = new Set<string>();
  for (const { term, synonyms } of parseQuery(query)) {
    words.add(term);
    for (const synonym of synonyms) words.add(synonym);
  }
  return [...words];
}
