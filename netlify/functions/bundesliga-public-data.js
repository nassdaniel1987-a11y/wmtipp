import { getServiceClient, json } from "./_shared/supabase.js";
import {
  BUNDESLIGA_COMPETITION_ID,
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
    const [competition, teams, matches, results, topScorers, bonusResults, ruleSettings] = await Promise.all([
      supabase.from("competitions").select("*").eq("id", BUNDESLIGA_COMPETITION_ID).maybeSingle(),
      supabase.from("competition_teams").select("*").eq("competition_id", BUNDESLIGA_COMPETITION_ID).order("name"),
      supabase.from("competition_matches").select("*").eq("competition_id", BUNDESLIGA_COMPETITION_ID).eq("phase", "league").order("match_number"),
      supabase.from("competition_results").select("*").eq("competition_id", BUNDESLIGA_COMPETITION_ID),
      supabase.from("competition_top_scorers").select("*").eq("competition_id", BUNDESLIGA_COMPETITION_ID).order("goals", { ascending: false }).order("display_name"),
      supabase.from("competition_bonus_results").select("*").eq("competition_id", BUNDESLIGA_COMPETITION_ID).maybeSingle(),
      loadCompetitionRuleSettings(supabase),
    ]);

    for (const response of [competition, teams, matches, results, topScorers, bonusResults]) {
      if (response.error) throw response.error;
    }

    const normalizedTeams = (teams.data ?? []).map((team) => ({
      ...team,
      logo_url: normalizeTeamLogoUrl(team.logo_url),
    }));

    return json({
      competition: competition.data,
      teams: normalizedTeams,
      matches: matches.data ?? [],
      results: results.data ?? [],
      topScorers: topScorers.data ?? [],
      bonusResults: bonusResults.data ?? null,
      ruleSettings,
      table: buildLeagueTable(matches.data ?? [], results.data ?? [], normalizedTeams),
      matchdayStatus: buildMatchdayStatus(matches.data ?? [], [], results.data ?? []),
      bonusStatus: buildBonusStatus(null),
      rulesSummary: buildBundesligaRulesSummary(ruleSettings, competition.data),
      importStatus: {
        source: "OpenLigaDB",
        teams: normalizedTeams.length,
        matches: matches.data?.length ?? 0,
        results: results.data?.length ?? 0,
        topScorers: topScorers.data?.length ?? 0,
        lastMatchImportAt: (matches.data ?? []).reduce((latest, row) => {
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
    return json({ error: error.message || "Bundesliga-Daten konnten nicht geladen werden." }, 500);
  }
};

export const config = {
  path: "/api/bundesliga-public-data",
};
