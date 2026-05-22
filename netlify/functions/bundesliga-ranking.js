import { getServiceClient, json } from "./_shared/supabase.js";
import {
  BUNDESLIGA_COMPETITION_ID,
  buildCompetitionRanking,
  loadCompetitionRuleSettings,
} from "./_shared/bundesliga.js";

export default async (req) => {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  try {
    const supabase = getServiceClient();
    const [participants, tips, results, bonusTips, bonusResults, topScorers, matches, ruleSettings] = await Promise.all([
      supabase.from("competition_participants").select("id, display_name").eq("competition_id", BUNDESLIGA_COMPETITION_ID),
      supabase.from("competition_tips").select("participant_id, match_id, score_a, score_b").eq("competition_id", BUNDESLIGA_COMPETITION_ID),
      supabase.from("competition_results").select("match_id, score_a, score_b, status").eq("competition_id", BUNDESLIGA_COMPETITION_ID),
      supabase.from("competition_participant_bonus_tips").select("*").eq("competition_id", BUNDESLIGA_COMPETITION_ID),
      supabase.from("competition_bonus_results").select("*").eq("competition_id", BUNDESLIGA_COMPETITION_ID).maybeSingle(),
      supabase.from("competition_top_scorers").select("id, display_name").eq("competition_id", BUNDESLIGA_COMPETITION_ID),
      supabase.from("competition_matches").select("id, matchday").eq("competition_id", BUNDESLIGA_COMPETITION_ID).eq("phase", "league"),
      loadCompetitionRuleSettings(supabase),
    ]);

    for (const response of [participants, tips, results, bonusTips, bonusResults, topScorers, matches]) {
      if (response.error) throw response.error;
    }

    return json({
      ranking: buildCompetitionRanking(
        participants.data ?? [],
        tips.data ?? [],
        results.data ?? [],
        bonusTips.data ?? [],
        bonusResults.data ?? null,
        topScorers.data ?? [],
        matches.data ?? [],
        ruleSettings,
      ),
    });
  } catch (error) {
    return json({ error: error.message || "Bundesliga-Rangliste konnte nicht geladen werden." }, 500);
  }
};

export const config = {
  path: "/api/bundesliga-ranking",
};
