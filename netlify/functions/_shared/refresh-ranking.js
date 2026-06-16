// Berechnet die WM-Rangliste mit der bestehenden Scoring-Logik neu und legt sie
// als Snapshot in public.wm_ranking ab. Das Web-Frontend liest diesen Snapshot
// direkt (anon) + per Realtime, statt bei jedem Seitenaufruf /api/ranking
// aufzurufen. Bewusst nur dann ausfuehren, wenn sich Ergebnisse aendern.
import { fetchAllPages } from "./pagination.js";
import { buildWmRanking } from "./wm-scoring.js";

export async function refreshWmRankingSnapshot(supabase) {
  const [participants, tips, results, bonusTips, bonusResults] = await Promise.all([
    supabase.from("participants").select("id, display_name"),
    fetchAllPages(() => supabase.from("tips").select("participant_id, match_id, score_a, score_b")),
    supabase.from("results").select("match_id, score_a, score_b, winner, status"),
    fetchAllPages(() => supabase
      .from("bonus_tips")
      .select("participant_id, champion, top_scorer, top_scorer_player_id, group_winners")),
    supabase.from("bonus_results").select("id, champion, top_scorer, top_scorer_player_ids, group_winners").eq("id", "official").maybeSingle(),
  ]);

  for (const response of [participants, results, bonusResults]) {
    if (response.error) throw response.error;
  }

  const ranking = buildWmRanking(
    participants.data ?? [],
    tips ?? [],
    results.data ?? [],
    bonusTips ?? [],
    bonusResults.data ?? null,
  );

  const { error } = await supabase
    .from("wm_ranking")
    .upsert({ id: "wm", ranking, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) throw error;

  return ranking;
}
