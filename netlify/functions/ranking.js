import { getServiceClient, json } from "./_shared/supabase.js";
import { buildWmRanking } from "./_shared/wm-scoring.js";

export default async (req) => {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  try {
    const supabase = getServiceClient();
    const [participants, tips, results, bonusTips, bonusResults] = await Promise.all([
      supabase.from("participants").select("id, display_name"),
      supabase.from("tips").select("participant_id, match_id, score_a, score_b"),
      supabase.from("results").select("match_id, score_a, score_b, status"),
      supabase.from("bonus_tips").select("participant_id, champion, top_scorer, top_scorer_player_id, group_winners"),
      supabase.from("bonus_results").select("id, champion, top_scorer, top_scorer_player_ids, group_winners").eq("id", "official").maybeSingle(),
    ]);

    for (const response of [participants, tips, results, bonusTips, bonusResults]) {
      if (response.error) throw response.error;
    }

    const ranking = buildWmRanking(
      participants.data ?? [],
      tips.data ?? [],
      results.data ?? [],
      bonusTips.data ?? [],
      bonusResults.data ?? null,
    );
    return json({ ranking });
  } catch (error) {
    return json({ error: error.message || "Rangliste konnte nicht geladen werden." }, 500);
  }
};

export const config = {
  path: "/api/ranking",
};
