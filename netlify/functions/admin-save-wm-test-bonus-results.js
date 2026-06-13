import { requireAdmin } from "./_shared/admin.js";
import { json } from "./_shared/supabase.js";

function normalizeTopScorerPlayerIds(topScorerPlayerIds) {
  return Array.isArray(topScorerPlayerIds)
    ? [...new Set(topScorerPlayerIds.map((id) => String(id || "").trim()).filter(Boolean))]
    : [];
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { supabase } = await requireAdmin(req);
    const { champion, topScorer, topScorerPlayerIds, groupWinners } = await req.json();
    const cleanTopScorerPlayerIds = normalizeTopScorerPlayerIds(topScorerPlayerIds);
    let topScorerNames = String(topScorer || "").trim() || null;

    if (cleanTopScorerPlayerIds.length > 0) {
      const { data: players, error: playersError } = await supabase
        .from("players")
        .select("id, display_name")
        .in("id", cleanTopScorerPlayerIds);
      if (playersError) throw playersError;
      topScorerNames = (players ?? []).map((player) => player.display_name).join(", ") || topScorerNames;
    }

    const row = {
      id: "sandbox",
      champion: String(champion || "").trim() || null,
      top_scorer: topScorerNames,
      top_scorer_player_ids: cleanTopScorerPlayerIds,
      group_winners:
        groupWinners && typeof groupWinners === "object" && !Array.isArray(groupWinners)
          ? groupWinners
          : {},
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("wm_test_bonus_results")
      .upsert(row, { onConflict: "id" })
      .select("id, champion, top_scorer, top_scorer_player_ids, group_winners, updated_at")
      .single();

    if (error) throw error;
    return json({ bonusResults: data });
  } catch (error) {
    return json({ error: error.message || "Test-Bonus-Ergebnisse konnten nicht gespeichert werden." }, error.status || 500);
  }
};

export const config = {
  path: "/api/admin-save-wm-test-bonus-results",
};
