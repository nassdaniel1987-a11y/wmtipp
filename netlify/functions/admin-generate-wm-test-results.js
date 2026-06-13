import { requireAdmin } from "./_shared/admin.js";
import { json } from "./_shared/supabase.js";
import { generateWmTestResultRows } from "./_shared/wm-test-results.js";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { supabase } = await requireAdmin(req);
    const { data: matches, error: matchError } = await supabase
      .from("matches")
      .select("id");
    if (matchError) throw matchError;

    const rows = generateWmTestResultRows((matches ?? []).map((match) => match.id));
    if (rows.length === 0) return json({ generated: 0 });

    const { error } = await supabase
      .from("wm_test_results")
      .upsert(rows, { onConflict: "match_id" });
    if (error) throw error;

    return json({ generated: rows.length });
  } catch (error) {
    return json({ error: error.message || "Demo-Ergebnisse konnten nicht erzeugt werden." }, error.status || 500);
  }
};

export const config = {
  path: "/api/admin-generate-wm-test-results",
};
