/**
 * Client for the server-side model routes.
 *
 * The key lives in the worker (or the dev middleware), never here — this only
 * asks whether a model is configured and posts briefs to it. Every call has a
 * deterministic fallback in the caller, so the app stays fully usable when no
 * key is configured or the request fails.
 */

const APP_BASE = import.meta.env.BASE_URL.endsWith("/")
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`;

export type ModelStatus = {
  ready: boolean;
  model: string;
};

export type ModelGenerateRequest = {
  mode: "pack" | "predict";
  idea: string;
  audience?: string;
  platform?: string;
  sourceData?: string;
  constraints?: string;
  agentRole: string;
  agentInstructions: string;
  count: number;
  categories: string[];
  exclude?: string[];
};

export type ModelPrompt = {
  title: string;
  intent: string;
  category: string;
  content: string;
};

/**
 * Reads a model route's JSON reply. A static host (GitHub Pages) answers
 * `/api/*` with an HTML 404, and a gateway can answer with an HTML 502; both
 * used to surface as "Unexpected token <". Turn them into a readable error.
 */
export async function readModelResponse<T extends { error?: string }>(
  response: Response,
  fallback: string
): Promise<T> {
  const text = await response.text();
  let payload: T | null = null;
  try {
    payload = text ? (JSON.parse(text) as T) : null;
  } catch {
    payload = null;
  }

  if (!payload) {
    throw new Error(
      response.status === 404
        ? "The AI model isn't available on this deployment. Built-in generators still work."
        : `${fallback} (${response.status}).`
    );
  }
  if (response.status === 429) {
    throw new Error(payload.error || "Too many AI requests. Wait a little and try again.");
  }
  if (!response.ok || payload.error) {
    throw new Error(payload.error || `${fallback} (${response.status}).`);
  }
  return payload;
}

/** Generation is slow — roughly 900 output tokens per prompt. */
const TIMEOUT_MS = 120_000;

export async function checkModel(signal?: AbortSignal): Promise<ModelStatus> {
  try {
    const response = await fetch(`${APP_BASE}api/model/status`, {
      signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return { ready: false, model: "" };
    const payload = (await response.json()) as Partial<ModelStatus>;
    return {
      ready: Boolean(payload.ready),
      model: typeof payload.model === "string" ? payload.model : "",
    };
  } catch {
    return { ready: false, model: "" };
  }
}

export async function generateWithModel(
  request: ModelGenerateRequest,
  signal?: AbortSignal
): Promise<{ prompts: ModelPrompt[]; model: string }> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  signal?.addEventListener("abort", () => controller.abort(), { once: true });

  try {
    const response = await fetch(`${APP_BASE}api/model/generate`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(request),
    });

    const payload = await readModelResponse<{
      prompts?: ModelPrompt[];
      model?: string;
      error?: string;
    }>(response, "Generation failed");
    if (!Array.isArray(payload.prompts) || payload.prompts.length === 0) {
      throw new Error("The model returned no prompts.");
    }

    return { prompts: payload.prompts, model: payload.model || "" };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("The model took too long to respond. Try fewer prompts.");
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}
