import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Deployed as a GitHub Pages *project* site, so built assets live under
// /prompt-lab/. Dev keeps "/" so localhost URLs stay clean.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/prompt-lab/" : "/",
  plugins: [react()],
  build: { outDir: "dist" },
}));
