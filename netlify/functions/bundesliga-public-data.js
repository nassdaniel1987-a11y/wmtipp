import { getServiceClient, json } from "./_shared/supabase.js";
import { bundesligaErrorResponse, requireBundesligaViewAccess } from "./_shared/bundesliga-access.js";
import {
  BUNDESLIGA_ARCHIVE_COMPETITION_ID,
  buildBonusStatus,
  buildBundesligaRulesSummary,
  buildLeagueTable,
  buildMatchdayStatus,
  loadCompetitionRuleSettings,
  normalizeTeamLogoUrl,
} from "./_shared/bundesliga.js";

export default async (req) => {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  try {
    const supabase = getServiceClient();
    const { competition: activeCompetition, competitionId, participant } = await requireBundesligaViewAccess(req, supabase);
    const [competition, teams, matches, results, topScorers, bonusResults, ruleSettings] = await Promise.all([
      Promise.resolve({ data: activeCompetition, error: null }),
      supabase.from("competition_teams").select("*").eq("competition_id", competitionId).order("name"),
      supabase.from("competition_matches").select("*").eq("competition_id", competitionId).in("phase", ["league", "relegation"]).order("matchday").order("match_number"),
      supabase.from("competition_results").select("*").eq("competition_id", competitionId),
      supabase.from("competition_top_scorers").select("*").eq("competition_id", competitionId).order("goals", { ascending: false }).order("display_name"),
      supabase.from("competition_bonus_results").select("*").eq("competition_id", competitionId).maybeSingle(),
      loadCompetitionRuleSettings(supabase, competitionId),
    ]);

    for (const response of [competition, teams, matches, results, topScorers, bonusResults]) {
      if (response.error) throw response.error;
    }

    const normalizedTeams = (teams.data ?? []).map((team) => ({
      ...team,
      logo_url: normalizeTeamLogoUrl(team.logo_url),
    }));
    const visibleMatches = matches.data ?? [];
    const leagueMatches = visibleMatches.filter((match) => match.phase === "league");
    const leagueTeamIds = new Set(leagueMatches.flatMap((match) => [match.team_a_id, match.team_b_id]).filter(Boolean));
    const leagueTeams = normalizedTeams.filter((team) => leagueTeamIds.has(team.id));

    return json({
      competition: competition.data,
      showcaseParticipant: competitionId === BUNDESLIGA_ARCHIVE_COMPETITION_ID && participant?.showcase
        ? { id: participant.id, display_name: participant.display_name }
        : null,
      teams: normalizedTeams,
      bonusTeams: leagueTeams,
      matches: visibleMatches,
      results: results.data ?? [],
      topScorers: topScorers.data ?? [],
      bonusResults: bonusResults.data ?? null,
      ruleSettings,
      table: buildLeagueTable(leagueMatches, results.data ?? [], leagueTeams),
      matchdayStatus: buildMatchdayStatus(visibleMatches, [], results.data ?? []),
      bonusStatus: buildBonusStatus(null),
      rulesSummary: buildBundesligaRulesSummary(ruleSettings, competition.data),
      importStatus: {
        source: "OpenLigaDB",
        teams: normalizedTeams.length,
        matches: visibleMatches.length,
        results: results.data?.length ?? 0,
        topScorers: topScorers.data?.length ?? 0,
        lastMatchImportAt: visibleMatches.reduce((latest, row) => {
          if (!row.updated_at) return latest;
          return !latest || row.updated_at > latest ? row.updated_at : latest;
        }, null),
        lastResultImportAt: (results.data ?? []).reduce((latest, row) => {
          if (!row.updated_at) return latest;
          return !latest || row.updated_at > latest ? row.updated_at : latest;
        }, null),
        lastTopScorerImportAt: (topScorers.data ?? []).reduce((latest, row) => {
          if (!row.updated_at) return latest;
          return !latest || row.updated_at > latest ? row.updated_at : latest;
        }, null),
      },
    });
  } catch (error) {
    return bundesligaErrorResponse(error, "Bundesliga-Daten konnten nicht geladen werden.");
  }
};

export const config = {
  path: "/api/bundesliga-public-data",
};
