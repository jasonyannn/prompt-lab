import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { sites } from "@openai/sites-vite-plugin";
import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import {
  chatWithModel,
  DEFAULT_EFFORT,
  DEFAULT_MODEL,
  generateWithModel,
  parseChatRequest,
  parseGenerateRequest,
} from "./server/openai.ts";

function promptLabWorker() {
  return {
    name: "prompt-lab-sites-worker",
    apply: "build" as const,
    async closeBundle() {
      const serverDirectory = resolve("dist/server");
      await mkdir(serverDirectory, { recursive: true });
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

      server.middlewares.use((req, res, next) => {
        const url = (req.url || "").split("?")[0];
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
            if (url === "/api/model/chat") {
              const chat = parseChatRequest(body);
              if (typeof chat === "string") {
                return send(res, 400, { error: chat });
              }
              return send(res, 200, await chatWithModel(chat, config));
            }
            const parsed = parseGenerateRequest(body);
            if (typeof parsed === "string") {
              return send(res, 400, { error: parsed });
            }
            send(res, 200, await generateWithModel(parsed, config));
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
  base: command === "build" && mode !== "sites" ? "/prompt-lab/" : "/",
  plugins: [
    react(),
    sites(),
    promptLabWorker(),
    devModelRoutes(loadEnv(mode, process.cwd(), "")),
  ],
  build: { outDir: "dist" },
}));
