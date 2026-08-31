export type Env = {
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
  DB: D1Database;
  /** Optional comma-separated origins allowed to make browser MCP calls. */
  PROMPTLAB_ALLOWED_ORIGINS?: string;
  /**
   * OpenAI API key. Server-side only — never expose this to the browser bundle.
   * Local value comes from .env.local; the deployed value is set in the Sites
   * project settings, not in a committed file.
   */
  OPENAI_API_KEY?: string;
  /** Overrides the default model id. */
  OPENAI_MODEL?: string;
  /** Reasoning effort: none, low, medium, high or xhigh. */
  OPENAI_REASONING_EFFORT?: string;
};
