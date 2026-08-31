import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { sites } from "@openai/sites-vite-plugin";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

function sitesStaticWorker() {
  return {
    name: "prompt-lab-sites-static-worker",
    apply: "build" as const,
    async closeBundle() {
      const serverDirectory = resolve("dist/server");
      await mkdir(serverDirectory, { recursive: true });
      await writeFile(
        resolve(serverDirectory, "index.js"),
        `export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404 || request.method !== "GET") return response;
    if (!(request.headers.get("accept") || "").includes("text/html")) return response;
    const url = new URL(request.url);
    url.pathname = "/";
    return env.ASSETS.fetch(new Request(url, request));
  },
};\n`
      );
    },
  };
}

// Deployed as a GitHub Pages *project* site, so built assets live under
// /prompt-lab/. Dev keeps "/" so localhost URLs stay clean.
export default defineConfig(({ command, mode }) => ({
  base: command === "build" && mode !== "sites" ? "/prompt-lab/" : "/",
  plugins: [react(), sites(), sitesStaticWorker()],
  build: { outDir: "dist" },
}));
