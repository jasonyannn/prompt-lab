import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

it.each(["", "   "])("initializes without crashing when build settings are %j", async (value) => {
  vi.stubEnv("VITE_SUPABASE_URL", value);
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", value);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.resetModules();

  const { supabase } = await import("./supabase");
  expect(supabase).toBeDefined();
});
