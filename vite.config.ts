import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { sites } from "@openai/sites-vite-plugin";
import { build } from "esbuild";
import { cp, mkdir, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  chatWithModel,
  DEFAULT_EFFORT,
  DEFAULT_MODEL,
  generateWithModel,
  parseChatRequest,
  parseGenerateRequest,
} from "./server/openai";
import { createSqliteD1 } from "./server/localD1";
import { handleUsageRequest, meterModelCall } from "./server/usage";

/**
 * Where `npm run dev` records model usage, so a local tracker such as Token
 * Doctor can read it from /api/usage/* exactly as it would from the worker.
 * Gitignored. Needs Node 22+ for node:sqlite; older Node just skips recording.
 */
const DEV_USAGE_DB = ".promptlab/usage.sqlite";

async function openDevUsageDb(): Promise<D1Database | undefined> {
  try {
    const { DatabaseSync } = await import("node:sqlite");
    await mkdir(resolve(".promptlab"), { recursive: true });
    return createSqliteD1(new DatabaseSync(resolve(DEV_USAGE_DB)));
  } catch (error) {
    console.warn(
      "[prompt-lab] Model usage will not be recorded locally (needs Node 22+):",
      error instanceof Error ? error.message : error
    );
    return undefined;
  }
}

/** Adapts a Node request to a fetch Request for the shared usage handler. */
function toFetchRequest(req: any): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers ?? {})) {
    if (typeof value === "string") headers.set(name, value);
    else if (Array.isArray(value)) headers.set(name, value.join(", "));
  }
  return new Request(new URL(req.url || "/", `http://${req.headers?.host || "localhost"}`), {
    method: req.method,
    headers,
  });
}

function promptLabWorker() {
  return {
    name: "prompt-lab-sites-worker",
    apply: "build" as const,
    async closeBundle() {
      const serverDirectory = resolve("dist/server");
      const clientDirectory = resolve("dist/client");
      await mkdir(serverDirectory, { recursive: true });
      await mkdir(clientDirectory, { recursive: true });
      await build({
        entryPoints: [resolve("server/index.ts")],
        outfile: resolve(serverDirectory, "index.js"),
        bundle: true,
        format: "esm",
        platform: "browser",
        target: "es2022",
        conditions: ["workerd", "browser"],
        minify: true,
        sourcemap: false,
        legalComments: "none",
      });

      await cp(resolve("dist/index.html"), resolve(clientDirectory, "index.html"));
      await cp(resolve("dist/assets"), resolve(clientDirectory, "assets"), {
        recursive: true,
      });
      for (const entry of await readdir(resolve("public"))) {
        await cp(resolve("public", entry), resolve(clientDirectory, entry), {
          recursive: true,
        });
      }

      await writeFile(
        resolve(serverDirectory, "wrangler.json"),
        JSON.stringify({
          name: "prompt-lab",
          compatibility_date: "2026-05-15",
          main: "index.js",
          no_bundle: true,
          rules: [{ type: "ESModule", globs: ["**/*.js", "**/*.mjs"] }],
          assets: {
            directory: "../client",
            binding: "ASSETS",
            run_worker_first: true,
          },
          d1_databases: [
            {
              binding: "DB",
              database_name: "site-creator-d1",
              database_id: "00000000-0000-4000-8000-000000000000",
            },
          ],
          observability: { enabled: true },
        })
      );
    },
  };
}

/**
 * The worker does not run under `vite dev`, so the model routes are mirrored
 * here for local development. The key is read server-side from .env.local and
 * never reaches the browser bundle.
 */
function devModelRoutes(env: Record<string, string>) {
  return {
    name: "prompt-lab-dev-model",
    apply: "serve" as const,
    configureServer(server: {
      middlewares: {
        use(handler: (req: any, res: any, next: () => void) => void): void;
      };
    }) {
      const send = (res: any, status: number, payload: unknown) => {
        res.statusCode = status;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.end(JSON.stringify(payload));
      };

      // Opened once, on first use, so `vite` starts no slower.
      let usageDb: Promise<D1Database | undefined> | null = null;
      const devUsageDb = () => (usageDb ??= openDevUsageDb());

      server.middlewares.use(async (req, res, next) => {
        const url = (req.url || "").split("?")[0];

        if (url.startsWith("/api/usage/")) {
          try {
            const response = await handleUsageRequest(toFetchRequest(req), {
              DB: await devUsageDb(),
              USAGE_API_TOKEN: env.USAGE_API_TOKEN,
            });
            res.statusCode = response.status;
            response.headers.forEach((value, name) => res.setHeader(name, value));
            res.end(await response.text());
          } catch (error) {
            send(res, 500, {
              error: error instanceof Error ? error.message : "Usage request failed.",
            });
          }
          return;
        }

        if (!url.startsWith("/api/model/")) return next();

        const apiKey = env.OPENAI_API_KEY;
        const model = env.OPENAI_MODEL || DEFAULT_MODEL;

        if (url === "/api/model/status") {
          return send(res, 200, { ready: Boolean(apiKey), model, dev: true });
        }
        if (url !== "/api/model/generate" && url !== "/api/model/chat") {
          return send(res, 404, { error: "Not found." });
        }
        if (req.method !== "POST") {
          return send(res, 405, { error: "Method not allowed." });
        }
        if (!apiKey) {
          return send(res, 503, {
            error: "No OPENAI_API_KEY found. Add it to .env.local and restart the dev server.",
          });
        }

        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", async () => {
          let body: unknown;
          try {
            body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          } catch {
            return send(res, 400, { error: "Invalid JSON body." });
          }
          const config = {
            apiKey,
            model: env.OPENAI_MODEL,
            effort: env.OPENAI_REASONING_EFFORT || DEFAULT_EFFORT,
          };
          try {
            const db = await devUsageDb();
            if (url === "/api/model/chat") {
              const chat = parseChatRequest(body);
              if (typeof chat === "string") {
                return send(res, 400, { error: chat });
              }
              return send(
                res,
                200,
                await meterModelCall(db, "chat", model, () => chatWithModel(chat, config))
              );
            }
            const parsed = parseGenerateRequest(body);
            if (typeof parsed === "string") {
              return send(res, 400, { error: parsed });
            }
            send(
              res,
              200,
              await meterModelCall(db, "generate", model, () =>
                generateWithModel(parsed, config)
              )
            );
          } catch (error) {
            send(res, 502, {
              error: error instanceof Error ? error.message : "Generation failed.",
            });
          }
        });
      });
    },
  };
}

// Deployed as a GitHub Pages *project* site, so built assets live under
// /prompt-lab/. Dev keeps "/" so localhost URLs stay clean.
export default defineConfig(({ command, mode }) => ({
  // GitHub Pages serves from /prompt-lab/; Sites and Vercel (VERCEL=1 at build) serve from the root.
  base: command === "build" && mode !== "sites" && !process.env.VERCEL ? "/prompt-lab/" : "/",
  plugins: [
    react(),
    sites(),
    promptLabWorker(),
    devModelRoutes(loadEnv(mode, process.cwd(), "")),
  ],
  build: { outDir: "dist" },
}));
