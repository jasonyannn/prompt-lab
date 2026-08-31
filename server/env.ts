export type Env = {
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
  DB: D1Database;
  /** Optional comma-separated origins allowed to make browser MCP calls. */
  PROMPTLAB_ALLOWED_ORIGINS?: string;
};
