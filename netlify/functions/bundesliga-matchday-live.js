import { getServiceClient, json } from "./_shared/supabase.js";
import { fetchAllPages } from "./_shared/pagination.js";
import {
  bundesligaErrorResponse,
  filterBundesligaArchiveShowcaseParticipants,
  filterBundesligaArchiveShowcaseTips,
  requireBundesligaViewAccess,
} from "./_shared/bundesliga-access.js";
import {
  buildMatchdayLive,
  buildTipTrends,
  loadCompetitionRuleSettings,
} from "./_shared/bundesliga.js";

export default async (req) => {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  try {
    const url = new URL(req.url);
    const matchday = Math.max(1, Number(url.searchParams.get("matchday")) || 1);
    const supabase = getServiceClient();
    const { participant, competitionId } = await requireBundesligaViewAccess(req, supabase);
    // competition_tips/-goals paginiert laden, sonst kappt Supabase bei 1000 Zeilen.
    const [participants, matches, tips, results, goals, ruleSettings] = await Promise.all([
      supabase.from("competition_participants").select("id, display_name").eq("competition_id", competitionId),
      supabase.from("competition_matches").select("id, matchday, kickoff_at, team_a_name, team_b_name, updated_at").eq("competition_id", competitionId).in("phase", ["league", "relegation"]).eq("matchday", matchday).order("match_number"),
      fetchAllPages(() => supabase.from("competition_tips").select("participant_id, match_id, score_a, score_b").eq("competition_id", competitionId)),
      supabase.from("competition_results").select("match_id, score_a, score_b, status, live_source, verification_status, source_updated_at, updated_at").eq("competition_id", competitionId),
      fetchAllPages(() => supabase.from("competition_goals").select("*").eq("competition_id", competitionId)),
      loadCompetitionRuleSettings(supabase, competitionId),
    ]);

    // tips und goals sind bereits Arrays (fetchAllPages wirft bei Fehlern).
    for (const response of [participants, matches, results]) {
      if (response.error) throw response.error;
    }

    const matchRows = matches.data ?? [];
    const participantRows = filterBundesligaArchiveShowcaseParticipants(participants.data, competitionId, participant);
    const tipRows = filterBundesligaArchiveShowcaseTips(tips, participantRows, competitionId, participant);
    const now = new Date();
    return json({
      live: buildMatchdayLive(
        matchRows,
        participantRows,
        tipRows,
        results.data ?? [],
        participant?.id ?? "",
        matchday,
        now,
        ruleSettings,
        goals,
      ),
      trends: buildTipTrends(tipRows, matchRows, results.data ?? [], now, ruleSettings),
    });
  } catch (error) {
    return bundesligaErrorResponse(error, "Bundesliga-Spieltag konnte nicht geladen werden.");
  }
};

export const config = {
  path: "/api/bundesliga-matchday-live",
};
