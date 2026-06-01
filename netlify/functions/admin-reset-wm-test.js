import { requireAdmin } from "./_shared/admin.js";
import { json } from "./_shared/supabase.js";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { supabase } = await requireAdmin(req);
    const [results, bonusResults] = await Promise.all([
      supabase.from("wm_test_results").delete().not("match_id", "is", null),
      supabase.from("wm_test_bonus_results").delete().eq("id", "sandbox"),
    ]);

    for (const response of [results, bonusResults]) {
      if (response.error) throw response.error;
    }

    return json({ ok: true });
  } catch (error) {
    return json({ error: error.message || "WM-Testmodus konnte nicht zurückgesetzt werden." }, 401);
  }
};

export const config = {
  path: "/api/admin-reset-wm-test",
};
