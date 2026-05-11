import { createClient } from "@supabase/supabase-js";

const supabaseUrl = Netlify.env.get("VITE_SUPABASE_URL");
const supabaseSecretKey =
  Netlify.env.get("SUPABASE_SECRET_KEY") ||
  Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");

export function getServiceClient() {
  if (!supabaseUrl || !supabaseSecretKey) {
    throw new Error("Missing Supabase server environment variables.");
  }

  return createClient(supabaseUrl, supabaseSecretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export function normalizeCode(code) {
  return String(code || "").trim();
}
