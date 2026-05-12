import { requireAdmin } from "./_shared/admin.js";
import { json } from "./_shared/supabase.js";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { supabase } = await requireAdmin(req);
    const { champion, topScorer, groupWinners } = await req.json();

    const row = {
      id: "official",
      champion: String(champion || "").trim() || null,
      top_scorer: String(topScorer || "").trim() || null,
      group_winners:
        groupWinners && typeof groupWinners === "object" && !Array.isArray(groupWinners)
          ? groupWinners
          : {},
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("bonus_results")
      .upsert(row, { onConflict: "id" })
      .select("id, champion, top_scorer, group_winners, updated_at")
      .single();

    if (error) throw error;
    return json({ bonusResults: data });
  } catch (error) {
    return json({ error: error.message || "Bonus-Ergebnisse konnten nicht gespeichert werden." }, 401);
  }
};

export const config = {
  path: "/api/admin-save-bonus-results",
};
