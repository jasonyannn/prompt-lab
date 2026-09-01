/**
 * Pulling saveable prompts out of a written reply.
 *
 * The agent is told to propose prompts through `create_prompt`, which stages
 * them in the review tray. It does not always comply — models like writing
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
};

/** "1) **Build Brief**" / "### 2. Build Brief" / "- **Build Brief**" */
const HEADING = /^\s{0,3}(?:#{2,4}\s*)?(?:\d{1,2}[).:]|[-*•])?\s*(?:\*\*|__)?([^*_\n]{3,80}?)(?:\*\*|__)?\s*:?\s*$/;

/** A line that is plainly prose rather than a title. */
function looksLikeTitle(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  if (trimmed.endsWith("?")) return null;
  if (trimmed.startsWith(">")) return null;
  if (trimmed.startsWith("```")) return null;

  const match = HEADING.exec(trimmed);
  if (!match) return null;

  const title = match[1]
    .replace(/[*_`]/g, "")
    .replace(/\s*[—–-]\s*$/, "")
    .trim();

  if (title.length < 3 || title.length > 80) return null;
  // A full sentence is a paragraph, not a heading.
  if (title.split(/\s+/).length > 12) return null;
  if (/[.!]$/.test(title)) return null;
  return title;
}

/** Enough substance to be worth saving, rather than a one-line bullet. */
const MIN_CONTENT = 40;

export function extractPromptCandidates(message: string): PromptCandidate[] {
  if (!message.trim()) return [];

  const lines = message.split("\n");
  const candidates: PromptCandidate[] = [];

  let title: string | null = null;
  let body: string[] = [];
  let inFence = false;

  const flush = () => {
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
      candidates.push({ id: `c${candidates.length}`, title, content });
    }

    title = null;
    body = [];
  };

  for (const line of lines) {
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

    const heading = looksLikeTitle(line);
    if (heading) {
      flush();
      title = heading;
      continue;
    }

    if (title) body.push(line);
  }

  flush();
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
