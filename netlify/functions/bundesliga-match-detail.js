import { getServiceClient, json } from "./_shared/supabase.js";
import {
  BundesligaHttpError,
  bundesligaErrorResponse,
  filterBundesligaArchiveShowcaseParticipants,
  filterBundesligaArchiveShowcaseTips,
  requireBundesligaViewAccess,
} from "./_shared/bundesliga-access.js";
import {
  buildBundesligaMatchDetail,
  loadCompetitionRuleSettings,
} from "./_shared/bundesliga.js";

export default async (req) => {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  try {
    const matchId = String(new URL(req.url).searchParams.get("matchId") || "").trim();
    if (!matchId) throw new BundesligaHttpError("Bitte wähle ein Spiel für die Auswertung.", 400);

    const supabase = getServiceClient();
    const { participant, competitionId } = await requireBundesligaViewAccess(req, supabase);
    const { data: match, error: matchError } = await supabase
      .from("competition_matches")
      .select("id, matchday, kickoff_at, team_a_id, team_b_id, team_a_name, team_b_name, phase")
      .eq("competition_id", competitionId)
      .in("phase", ["league", "relegation"])
      .eq("id", matchId)
      .maybeSingle();
    if (matchError) throw matchError;
    if (!match) throw new BundesligaHttpError("Dieses Bundesliga-Spiel wurde nicht gefunden.", 404);

    const [result, goals, participants, tips, teams, ruleSettings] = await Promise.all([
      supabase.from("competition_results").select("match_id, score_a, score_b, status").eq("competition_id", competitionId).eq("match_id", matchId).maybeSingle(),
      supabase.from("competition_goals").select("id, external_goal_id, minute, scorer_name, team_side, is_own_goal, is_penalty, source_json").eq("competition_id", competitionId).eq("match_id", matchId),
      supabase.from("competition_participants").select("id, display_name").eq("competition_id", competitionId),
      supabase.from("competition_tips").select("participant_id, match_id, score_a, score_b").eq("competition_id", competitionId).eq("match_id", matchId),
      supabase.from("competition_teams").select("id, logo_url").eq("competition_id", competitionId),
      loadCompetitionRuleSettings(supabase, competitionId),
    ]);
    for (const response of [result, goals, participants, tips, teams]) {
      if (response.error) throw response.error;
    }
    if (result.data?.status !== "final") {
      throw new BundesligaHttpError("Die Spielauswertung ist erst nach dem Endergebnis verfügbar.", 409);
    }
    const participantRows = filterBundesligaArchiveShowcaseParticipants(participants.data, competitionId, participant);
    const tipRows = filterBundesligaArchiveShowcaseTips(tips.data, participantRows, competitionId, participant);

    return json(buildBundesligaMatchDetail(
      match,
      result.data,
      goals.data ?? [],
      participantRows,
      tipRows,
      participant?.id ?? "",
      new Date(),
      ruleSettings,
      teams.data ?? [],
    ));
  } catch (error) {
    return bundesligaErrorResponse(error, "Die Spielauswertung konnte nicht geladen werden.");
  }
};

export const config = {
  path: "/api/bundesliga-match-detail",
};
