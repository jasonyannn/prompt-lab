/**
 * Pulling saveable prompts out of a written reply.
 *
 * The agent is told to propose prompts through `create_prompt`, which stages
 * them as structured rows inside the assistant response. It does not always
 * comply — models like writing
 * numbered lists — and a prompt the user cannot tick and save is useless to
 * them.
 *
 * So a reply is also scanned for prompt-shaped blocks, which are offered
 * inline under the message. No second model call, and it works even when the
 * agent ignores the tool entirely.
 */

export type PromptCandidate = {
  /** Stable within one message, so React keys and tick state survive rerenders. */
  id: string;
  title: string;
  content: string;
  /** Line index of the title, so the UI can render a control in place. */
  titleLine: number;
  /** Line index after the block ends. */
  endLine: number;
};

/**
 * Prompt Lab's own prompts contain section headings — "Known context",
 * "Process", "Return exactly" — so any rule that treats every short line as a
 * title splits one prompt into a dozen. Titles are therefore detected by tier,
 * and only the strongest tier present in a reply is used:
 *
 *   1. numbered items   "1) Build Brief"  /  "2. Build Brief"
 *   2. markdown headings "### Build Brief"
 *   3. bold-only lines   "**Build Brief**"
 *
 * A reply that numbers its prompts therefore never treats an inner heading as
 * the start of a new prompt.
 */
const NUMBERED = /^\s{0,3}(?:[*-]\s*)?\*{0,2}(\d{1,2})[).:]\s*\*{0,2}\s*(.+?)\s*\*{0,2}\s*$/;
const MARKDOWN_HEADING = /^\s{0,3}#{2,4}\s+(.+?)\s*$/;
const BOLD_LINE = /^\s{0,3}(?:\*\*|__)([^*_\n]{3,80})(?:\*\*|__)\s*:?\s*$/;

type Tier = "numbered" | "heading" | "bold";

function cleanTitle(raw: string): string | null {
  const title = raw
    .replace(/[*_`#]/g, "")
    .replace(/\s*[—–-]\s*$/, "")
    .replace(/:\s*$/, "")
    .trim();

  if (title.length < 3 || title.length > 80) return null;
  if (title.endsWith("?")) return null;
  if (title.split(/\s+/).length > 12) return null;
  if (/[.!]$/.test(title)) return null;
  return title;
}

/** Returns the title for a line, if it belongs to the tier in play. */
function titleForTier(line: string, tier: Tier): string | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith(">")) return null;

  if (tier === "numbered") {
    const match = NUMBERED.exec(trimmed);
    return match ? cleanTitle(match[2]) : null;
  }
  if (tier === "heading") {
    const match = MARKDOWN_HEADING.exec(trimmed);
    return match ? cleanTitle(match[1]) : null;
  }
  const match = BOLD_LINE.exec(trimmed);
  return match ? cleanTitle(match[1]) : null;
}

/** The strongest title style the reply actually uses. */
function detectTier(lines: string[]): Tier | null {
  let inFence = false;
  const counts = { numbered: 0, heading: 0, bold: 0 };

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (titleForTier(line, "numbered")) counts.numbered += 1;
    else if (titleForTier(line, "heading")) counts.heading += 1;
    else if (titleForTier(line, "bold")) counts.bold += 1;
  }

  if (counts.numbered > 0) return "numbered";
  if (counts.heading > 0) return "heading";
  if (counts.bold > 0) return "bold";
  return null;
}

/** Enough substance to be worth saving, rather than a one-line bullet. */
const MIN_CONTENT = 40;

export function extractPromptCandidates(message: string): PromptCandidate[] {
  if (!message.trim()) return [];

  const lines = message.split("\n");
  const tier = detectTier(lines);
  if (!tier) return [];

  const candidates: PromptCandidate[] = [];

  let title: string | null = null;
  let titleLine: number | null = null;
  let body: string[] = [];
  let inFence = false;

  const flush = (end: number) => {
    if (!title) return;

    // Replies usually end with a question to the user — "Want me to save
    // these?" — which belongs to the conversation, not to the prompt.
    const kept = [...body];
    while (kept.length) {
      const last = kept[kept.length - 1].trim();
      if (last === "" || last.endsWith("?")) kept.pop();
      else break;
    }

    const content = kept.join("\n").trim();
    const lines = kept.map((line) => line.trim()).filter(Boolean);
    const questions = lines.filter((line) => line.endsWith("?")).length;
    // A block that is mostly questions is the agent interviewing the user.
    const mostlyQuestions = lines.length > 0 && questions * 2 >= lines.length;

    if (content.length >= MIN_CONTENT && !mostlyQuestions) {
      candidates.push({
        id: `c${candidates.length}`,
        title,
        content,
        titleLine: titleLine ?? 0,
        endLine: end,
      });
    }

    title = null;
    titleLine = null;
    body = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (line.trim().startsWith("```")) {
      inFence = !inFence;
      // Fence markers are dropped; the code inside is kept as prompt text.
      continue;
    }

    // Inside a fence everything is body, including lines that look like titles.
    if (inFence) {
      if (title) body.push(line);
      continue;
    }

    const heading = titleForTier(line, tier);
    if (heading) {
      // The previous block ends where this title begins.
      flush(index);
      title = heading;
      titleLine = index;
      continue;
    }

    if (title) body.push(line);
  }

  flush(lines.length);
  return candidates;
}

/**
 * Whether a reply is worth offering a save control for at all. Clarifying
 * questions are numbered too, so a bare list check offers it at the wrong
 * moment.
 */
export function replyOffersPrompts(message: string): boolean {
  return extractPromptCandidates(message).length > 0;
}

/* ------------------------------------------------------------------ *
 * Menus of prompt ideas
 * ------------------------------------------------------------------ */

/**
 * The agent often lists prompt *ideas* rather than writing the prompts, then
 * asks the user to reply with which ones they want. That reply is a typing
 * task the UI can do better: these are the pickable options.
 *
 * Distinct from `extractPromptCandidates`, which finds prompts already written
 * out in full. An offer is one line — a title and a short description.
 */
export type PromptOffer = {
  id: string;
  title: string;
  summary: string;
  /** Line index of the bullet this offer came from. */
  line: number;
};

/** "- **Design System Starter**: output a minimal design system." */
const OFFER =
  /^\s{0,3}(?:[-*•]|\d{1,2}[).])\s*(?:\*\*|__)?([^*_:—–\n]{3,60}?)(?:\*\*|__)?\s*(?::|—|–)\s*(.+?)\s*$/;

export function extractPromptOffers(message: string): PromptOffer[] {
  if (!message.trim()) return [];

  const offers: PromptOffer[] = [];
  let inFence = false;
  const lines = message.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim().startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const match = OFFER.exec(line.trim());
    if (!match) continue;

    const title = match[1].replace(/[*_`]/g, "").trim();
    const summary = match[2].replace(/[*_`]/g, "").trim();

    // A question is the agent interviewing, not offering.
    if (summary.endsWith("?") || title.endsWith("?")) continue;
    if (title.split(/\s+/).length > 8) continue;
    if (summary.length < 10 || summary.length > 220) continue;

    offers.push({ id: `o${offers.length}`, title, summary, line: index });
  }

  // One bullet is not a menu.
  return offers.length >= 2 ? offers : [];
}

/* ------------------------------------------------------------------ *
 * Rendering a reply as interactive segments
 * ------------------------------------------------------------------ */

/**
 * A reply, broken into what the UI should draw. Controls sit *inside* the
 * message at the position the item appeared, rather than in a panel below it —
 * so the tick box is attached to the thing it refers to.
 */
export type ReplySegment =
  | { kind: "text"; key: string; text: string }
  | { kind: "prompt"; key: string; candidate: PromptCandidate; body: string }
  | { kind: "offer"; key: string; offer: PromptOffer };

export function segmentReply(message: string): ReplySegment[] {
  const lines = message.split("\n");
  const candidates = extractPromptCandidates(message);
  // A reply is one or the other: written-out prompts, or a menu of ideas.
  const offers = candidates.length > 0 ? [] : extractPromptOffers(message);

  if (candidates.length === 0 && offers.length === 0) {
    return message.trim()
      ? [{ kind: "text", key: "t0", text: message }]
      : [];
  }

  const promptByLine = new Map(candidates.map((c) => [c.titleLine, c]));
  const offerByLine = new Map(offers.map((o) => [o.line, o]));

  const segments: ReplySegment[] = [];
  let buffer: string[] = [];

  const flushText = () => {
    const text = buffer.join("\n").trim();
    if (text) {
      segments.push({ kind: "text", key: `t${segments.length}`, text });
    }
    buffer = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const candidate = promptByLine.get(index);
    if (candidate) {
      flushText();
      segments.push({
        kind: "prompt",
        key: `p${candidate.id}`,
        candidate,
        body: candidate.content,
      });
      // The body is rendered by the prompt segment, so skip those lines.
      index = candidate.endLine - 1;
      continue;
    }

    const offer = offerByLine.get(index);
    if (offer) {
      flushText();
      segments.push({ kind: "offer", key: `o${offer.id}`, offer });
      continue;
    }

    buffer.push(lines[index]);
  }

  flushText();
  return segments;
}
