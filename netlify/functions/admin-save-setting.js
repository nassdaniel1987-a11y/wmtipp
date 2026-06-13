import { requireAdmin } from "./_shared/admin.js";
import { json } from "./_shared/supabase.js";

// Erlaubte Settings-Keys und ihre Validierung. Bewusst eng gehalten, damit ueber
// diesen Endpunkt keine beliebigen Werte gesetzt werden koennen.
const ALLOWED = {
  ko_visible: (value) => typeof value === "boolean",
};

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { supabase } = await requireAdmin(req);
    const { key, value } = await req.json();

    if (!ALLOWED[key] || !ALLOWED[key](value)) {
      return json({ error: "Unbekannter oder ungültiger Settings-Wert." }, 400);
    }

    const { data, error } = await supabase
      .from("app_settings")
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" })
      .select("key, value")
      .single();

    if (error) throw error;
    return json({ setting: data });
  } catch (error) {
    return json({ error: error.message || "Einstellung konnte nicht gespeichert werden." }, error.status || 500);
  }
};

export const config = {
  path: "/api/admin-save-setting",
};
