import { getServiceClient, json } from "./_shared/supabase.js";
import {
  BUNDESLIGA_COMPETITION_ID,
  buildMatchdayLive,
  loadCompetitionRuleSettings,
} from "./_shared/bundesliga.js";

export default async (req) => {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  try {
    const url = new URL(req.url);
    const matchday = Math.max(1, Number(url.searchParams.get("matchday")) || 1);
    const participantId = String(url.searchParams.get("participantId") || "").trim();
    const supabase = getServiceClient();
    const [participants, matches, tips, results, ruleSettings] = await Promise.all([
      supabase.from("competition_participants").select("id, display_name").eq("competition_id", BUNDESLIGA_COMPETITION_ID),
      supabase.from("competition_matches").select("id, matchday, kickoff_at, team_a_name, team_b_name").eq("competition_id", BUNDESLIGA_COMPETITION_ID).eq("phase", "league").eq("matchday", matchday).order("match_number"),
      supabase.from("competition_tips").select("participant_id, match_id, score_a, score_b").eq("competition_id", BUNDESLIGA_COMPETITION_ID),
      supabase.from("competition_results").select("match_id, score_a, score_b, status").eq("competition_id", BUNDESLIGA_COMPETITION_ID),
      loadCompetitionRuleSettings(supabase),
    ]);

    for (const response of [participants, matches, tips, results]) {
      if (response.error) throw response.error;
    }

    return json({
      live: buildMatchdayLive(
        matches.data ?? [],
        participants.data ?? [],
        tips.data ?? [],
        results.data ?? [],
        participantId,
        matchday,
        new Date(),
        ruleSettings,
      ),
    });
  } catch (error) {
    return json({ error: error.message || "Bundesliga-Spieltag konnte nicht geladen werden." }, 500);
  }
};

export const config = {
  path: "/api/bundesliga-matchday-live",
};
