// Oeffentliche App-Settings (globale Schalter) fuer Web und Android.
import { cachedJson, getServiceClient, json } from "./_shared/supabase.js";

const DEFAULTS = {
  ko_visible: false,
};

export default async (req) => {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase.from("app_settings").select("key, value");
    if (error) throw error;

    const settings = { ...DEFAULTS };
    for (const row of data ?? []) {
      settings[row.key] = row.value;
    }
    return cachedJson({ settings }, 300);
  } catch (error) {
    // Settings sind unkritisch: im Fehlerfall die sicheren Defaults liefern.
    return cachedJson({ settings: { ...DEFAULTS } }, 60);
  }
};

export const config = {
  path: "/api/settings",
};
