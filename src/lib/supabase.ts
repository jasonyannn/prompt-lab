import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/+$/, "");
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase environment variables are not configured yet.");
}

export const supabase = createClient(
  // GitHub Actions supplies empty strings when repository variables are absent.
  // Keep the local library usable instead of throwing before React mounts.
  supabaseUrl || "https://example.supabase.co",
  supabaseAnonKey || "public-anon-key"
);
