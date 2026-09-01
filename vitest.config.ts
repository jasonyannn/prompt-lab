import { defineConfig } from "vitest/config";

// Kept separate from vite.config.ts so the Sites plugin and the worker bundler
// do not run during tests.
export default defineConfig({
  test: {
    environment: "happy-dom",
    include: ["src/**/*.test.ts"],
  },
});
