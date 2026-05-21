import { requireAdmin } from "./_shared/admin.js";
import { json } from "./_shared/supabase.js";
import {
  BUNDESLIGA_COMPETITION_ID,
  buildDemoRanking,
  buildLeagueTable,
  buildTopScorers,
  pointsFor,
} from "./_shared/bundesliga.js";

function isMissingRelation(error) {
  return error?.code === "42P01" || error?.code === "PGRST205" || /does not exist|schema cache/i.test(error?.message || "");
}

async function loadOptionalTopScorers(supabase) {
  const { data, error } = await supabase
    .from("competition_top_scorers")
    .select("*")
    .eq("competition_id", BUNDESLIGA_COMPETITION_ID)
    .order("goals", { ascending: false })
    .order("display_name", { ascending: true });
  if (error && isMissingRelation(error)) return [];
  if (error) throw error;
  return data ?? [];
}

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
      topScorers,
      inviteCodes,
    ] = await Promise.all([
      supabase.from("competitions").select("*").eq("id", BUNDESLIGA_COMPETITION_ID).maybeSingle(),
      supabase.from("competition_teams").select("*").eq("competition_id", BUNDESLIGA_COMPETITION_ID).order("name"),
      supabase.from("competition_matches").select("*").eq("competition_id", BUNDESLIGA_COMPETITION_ID).order("match_number"),
      supabase.from("competition_results").select("*").eq("competition_id", BUNDESLIGA_COMPETITION_ID),
      supabase.from("competition_goals").select("*").eq("competition_id", BUNDESLIGA_COMPETITION_ID),
      supabase.from("competition_demo_participants").select("*").eq("competition_id", BUNDESLIGA_COMPETITION_ID).order("created_at"),
      supabase.from("competition_demo_tips").select("*").eq("competition_id", BUNDESLIGA_COMPETITION_ID).order("saved_at"),
      supabase.from("competition_bonus_results").select("*").eq("competition_id", BUNDESLIGA_COMPETITION_ID).maybeSingle(),
      loadOptionalTopScorers(supabase),
      supabase.from("competition_invite_codes").select("*").eq("competition_id", BUNDESLIGA_COMPETITION_ID).order("created_at", { ascending: false }).limit(20),
    ]);

    for (const response of [competition, teams, matches, results, goals, demoParticipants, demoTips, bonusResults, inviteCodes]) {
      if (response.error) throw response.error;
    }

    const leagueMatches = (matches.data ?? []).filter((match) => match.phase === "league");
    const leagueTeamIds = new Set(leagueMatches.flatMap((match) => [match.team_a_id, match.team_b_id]).filter(Boolean));
    const leagueTeams = (teams.data ?? []).filter((team) => leagueTeamIds.has(team.id));
    const resultsByMatch = new Map((results.data ?? []).map((result) => [result.match_id, result]));
    const participantsById = new Map((demoParticipants.data ?? []).map((participant) => [participant.id, participant]));
    const tipsByMatch = new Map();
    const goalAggregation = buildTopScorers(goals.data ?? []);
    const topScorerRows = topScorers.length
      ? topScorers.map((row) => ({
          id: row.id,
          externalId: row.external_id,
          name: row.display_name,
          sourceName: row.source_name,
          teamName: row.team_name,
          goals: row.goals,
          manualOverride: row.manual_override,
          updatedAt: row.updated_at,
        }))
      : goalAggregation;
    const incompleteTopScorers = topScorers.filter((row) =>
      !row.source_name || /^[A-ZÄÖÜ]\.\s/u.test(row.display_name || row.source_name || ""),
    ).length;

    (demoTips.data ?? []).forEach((tip) => {
      const rows = tipsByMatch.get(tip.match_id) ?? [];
      rows.push(tip);
      tipsByMatch.set(tip.match_id, rows);
    });

    const enrichedMatches = (matches.data ?? []).map((match) => {
      const result = resultsByMatch.get(match.id) ?? null;
      return {
        ...match,
        result,
        demoTips: (tipsByMatch.get(match.id) ?? []).map((tip) => ({
          ...tip,
          participantName: participantsById.get(tip.participant_id)?.display_name ?? "Demo-Tipper",
          points: pointsFor(tip, result),
          hasResult: result?.status === "final",
        })),
      };
    });

    return json({
      competition: competition.data,
      teams: teams.data ?? [],
      matches: enrichedMatches,
      results: results.data ?? [],
      goals: goals.data ?? [],
      demoParticipants: demoParticipants.data ?? [],
      demoTips: demoTips.data ?? [],
      bonusResults: bonusResults.data ?? null,
      table: buildLeagueTable(leagueMatches, results.data ?? [], leagueTeams),
      ranking: buildDemoRanking(demoParticipants.data ?? [], demoTips.data ?? [], results.data ?? []),
      topScorers: topScorerRows,
      inviteCodes: inviteCodes.data ?? [],
      dataQuality: {
        source: "OpenLigaDB",
        topScorerSource: topScorers.length ? "goalgetters" : "match_goals_fallback",
        topScorerCount: topScorerRows.length,
        incompleteTopScorers,
        lastTopScorerImportAt: topScorers.reduce((latest, row) => {
          if (!row.updated_at) return latest;
          return !latest || row.updated_at > latest ? row.updated_at : latest;
        }, null),
      },
    });
  } catch (error) {
    return json({ error: error.message || "Bundesliga-Daten konnten nicht geladen werden." }, 400);
  }
};

export const config = {
  path: "/api/admin-bundesliga-data",
};
