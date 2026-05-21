import { requireAdmin } from "./_shared/admin.js";
import { json } from "./_shared/supabase.js";
import {
  BUNDESLIGA_COMPETITION_ID,
  buildDemoRanking,
  buildLeagueTable,
  buildTopScorers,
} from "./_shared/bundesliga.js";

export default async (req) => {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  try {
    const { supabase } = await requireAdmin(req);
    const [
      competition,
      teams,
      matches,
      results,
      goals,
      demoParticipants,
      demoTips,
      bonusResults,
    ] = await Promise.all([
      supabase.from("competitions").select("*").eq("id", BUNDESLIGA_COMPETITION_ID).maybeSingle(),
      supabase.from("competition_teams").select("*").eq("competition_id", BUNDESLIGA_COMPETITION_ID).order("name"),
      supabase.from("competition_matches").select("*").eq("competition_id", BUNDESLIGA_COMPETITION_ID).order("match_number"),
      supabase.from("competition_results").select("*").eq("competition_id", BUNDESLIGA_COMPETITION_ID),
      supabase.from("competition_goals").select("*").eq("competition_id", BUNDESLIGA_COMPETITION_ID),
      supabase.from("competition_demo_participants").select("*").eq("competition_id", BUNDESLIGA_COMPETITION_ID).order("created_at"),
      supabase.from("competition_demo_tips").select("*").eq("competition_id", BUNDESLIGA_COMPETITION_ID).order("saved_at"),
      supabase.from("competition_bonus_results").select("*").eq("competition_id", BUNDESLIGA_COMPETITION_ID).maybeSingle(),
    ]);

    for (const response of [competition, teams, matches, results, goals, demoParticipants, demoTips, bonusResults]) {
      if (response.error) throw response.error;
    }

    const leagueMatches = (matches.data ?? []).filter((match) => match.phase === "league");
    const leagueTeamIds = new Set(leagueMatches.flatMap((match) => [match.team_a_id, match.team_b_id]).filter(Boolean));
    const leagueTeams = (teams.data ?? []).filter((team) => leagueTeamIds.has(team.id));

    return json({
      competition: competition.data,
      teams: teams.data ?? [],
      matches: matches.data ?? [],
      results: results.data ?? [],
      goals: goals.data ?? [],
      demoParticipants: demoParticipants.data ?? [],
      demoTips: demoTips.data ?? [],
      bonusResults: bonusResults.data ?? null,
      table: buildLeagueTable(leagueMatches, results.data ?? [], leagueTeams),
      ranking: buildDemoRanking(demoParticipants.data ?? [], demoTips.data ?? [], results.data ?? []),
      topScorers: buildTopScorers(goals.data ?? []),
    });
  } catch (error) {
    return json({ error: error.message || "Bundesliga-Daten konnten nicht geladen werden." }, 400);
  }
};

export const config = {
  path: "/api/admin-bundesliga-data",
};
