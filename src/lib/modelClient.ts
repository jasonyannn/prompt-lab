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
  signal?.addEventListener("abort", () => controller.abort());

  try {
    const response = await fetch(`${APP_BASE}api/model/generate`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(request),
    });

    const payload = (await response.json()) as {
      prompts?: ModelPrompt[];
      model?: string;
      error?: string;
    };

    if (!response.ok || payload.error) {
      throw new Error(payload.error || `Generation failed (${response.status}).`);
    }
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
