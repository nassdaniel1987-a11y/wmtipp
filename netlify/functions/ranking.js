import { cachedJson, getServiceClient, json } from "./_shared/supabase.js";
import { fetchAllPages } from "./_shared/pagination.js";
import { buildWmRanking } from "./_shared/wm-scoring.js";

export default async (req) => {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  try {
    const supabase = getServiceClient();
    // tips und bonus_tips paginiert laden, sonst kappt Supabase bei 1000 Zeilen
    // und die Rangliste zählt zu wenige Tipps (vgl. Admin, der ebenfalls paginiert).
    const [participants, tips, results, bonusTips, bonusResults] = await Promise.all([
      supabase.from("participants").select("id, display_name"),
      fetchAllPages(() => supabase
        .from("tips")
        .select("participant_id, match_id, score_a, score_b")),
      supabase.from("results").select("match_id, score_a, score_b, winner, status"),
      fetchAllPages(() => supabase
        .from("bonus_tips")
        .select("participant_id, champion, top_scorer, top_scorer_player_id, group_winners")),
      supabase.from("bonus_results").select("id, champion, top_scorer, top_scorer_player_ids, group_winners").eq("id", "official").maybeSingle(),
    ]);

    // fetchAllPages liefert direkt Arrays (und wirft bei Fehlern); nur die übrigen
    // Antworten tragen ein error-Feld.
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
    return cachedJson({ ranking }, 120);
  } catch (error) {
    return json({ error: error.message || "Rangliste konnte nicht geladen werden." }, 500);
  }
};

export const config = {
  path: "/api/ranking",
};
