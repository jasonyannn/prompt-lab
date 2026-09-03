import { defineConfig } from "vitest/config";

// Kept separate from vite.config.ts so the Sites plugin and the worker bundler
// do not run during tests.
//
// Two projects because the surfaces need different globals: the browser library
// and its WebMCP tools want a DOM, while the remote MCP server runs on the
// worker runtime and only needs node.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "browser",
          environment: "happy-dom",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "server",
          environment: "node",
          include: ["server/**/*.test.ts"],
        },
      },
    ],
  },
});
