import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { sites } from "@openai/sites-vite-plugin";
import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

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

// Deployed as a GitHub Pages *project* site, so built assets live under
// /prompt-lab/. Dev keeps "/" so localhost URLs stay clean.
export default defineConfig(({ command, mode }) => ({
  base: command === "build" && mode !== "sites" ? "/prompt-lab/" : "/",
  plugins: [react(), sites(), promptLabWorker()],
  build: { outDir: "dist" },
}));
