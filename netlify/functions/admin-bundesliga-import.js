import { requireAdmin } from "./_shared/admin.js";
import { json } from "./_shared/supabase.js";
import {
  BUNDESLIGA_COMPETITION_ID,
  BUNDESLIGA_RELEGATION_LEAGUE,
  BUNDESLIGA_SOURCE_LEAGUE,
  BUNDESLIGA_SOURCE_SEASON,
  normalizeGoalgetter,
  normalizeOpenLigaMatch,
} from "./_shared/bundesliga.js";

async function fetchOpenLigaMatches(leagueShortcut) {
  const response = await fetch(`https://api.openligadb.de/getmatchdata/${leagueShortcut}/${BUNDESLIGA_SOURCE_SEASON}`);
  if (!response.ok) {
    throw new Error(`OpenLigaDB ${leagueShortcut}/${BUNDESLIGA_SOURCE_SEASON} konnte nicht geladen werden.`);
  }
  return response.json();
}

async function fetchOpenLigaGoalgetters() {
  const response = await fetch(`https://api.openligadb.de/getgoalgetters/${BUNDESLIGA_SOURCE_LEAGUE}/${BUNDESLIGA_SOURCE_SEASON}`);
  if (!response.ok) {
    throw new Error(`OpenLigaDB Torschützen ${BUNDESLIGA_SOURCE_LEAGUE}/${BUNDESLIGA_SOURCE_SEASON} konnten nicht geladen werden.`);
  }
  return response.json();
}

async function ensureCompetition(supabase) {
  const { error } = await supabase.from("competitions").upsert({
    id: BUNDESLIGA_COMPETITION_ID,
    name: "Bundesliga",
    season_label: "2025/2026",
    status: "admin_test",
    source_provider: "openligadb",
    source_league: BUNDESLIGA_SOURCE_LEAGUE,
    source_season: BUNDESLIGA_SOURCE_SEASON,
    public_enabled: false,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { supabase } = await requireAdmin(req);
    const body = await req.json().catch(() => ({}));
    const includeRelegation = Boolean(body.includeRelegation);

    await ensureCompetition(supabase);

    const leagueMatches = await fetchOpenLigaMatches(BUNDESLIGA_SOURCE_LEAGUE);
    const relegationMatches = includeRelegation ? await fetchOpenLigaMatches(BUNDESLIGA_RELEGATION_LEAGUE).catch(() => []) : [];
    const goalgetters = await fetchOpenLigaGoalgetters().catch(() => []);
    const normalized = [
      ...leagueMatches.map((match, index) => normalizeOpenLigaMatch(match, BUNDESLIGA_SOURCE_LEAGUE, index)),
      ...relegationMatches.map((match, index) => normalizeOpenLigaMatch(match, BUNDESLIGA_RELEGATION_LEAGUE, index)),
    ];

    const teamRows = Array.from(
      new Map(
        normalized
          .flatMap((item) => [item.homeTeam, item.awayTeam])
          .map((team) => [`${team.competition_id}:${team.external_id}`, team]),
      ).values(),
    );

    const { data: teams, error: teamError } = await supabase
      .from("competition_teams")
      .upsert(teamRows, { onConflict: "competition_id,external_id" })
      .select("*");
    if (teamError) throw teamError;

    const teamByExternalId = new Map((teams ?? []).map((team) => [team.external_id, team]));
    const matchRows = normalized.map((item) => ({
      ...item.matchRow,
      team_a_id: teamByExternalId.get(item.homeTeam.external_id)?.id ?? null,
      team_b_id: teamByExternalId.get(item.awayTeam.external_id)?.id ?? null,
    }));

    const { data: matches, error: matchError } = await supabase
      .from("competition_matches")
      .upsert(matchRows, { onConflict: "competition_id,external_id" })
      .select("*");
    if (matchError) throw matchError;

    const goalRows = normalized.flatMap((item) => item.goals);
    if (goalRows.length) {
      const { error: goalDeleteError } = await supabase
        .from("competition_goals")
        .delete()
        .eq("competition_id", BUNDESLIGA_COMPETITION_ID);
      if (goalDeleteError) throw goalDeleteError;

      const { error: goalError } = await supabase
        .from("competition_goals")
        .upsert(goalRows, { onConflict: "competition_id,external_goal_id" });
      if (goalError) throw goalError;
    }

    let importedTopScorers = 0;
    if (goalgetters.length) {
      const { data: existingScorers, error: existingScorerError } = await supabase
        .from("competition_top_scorers")
        .select("*")
        .eq("competition_id", BUNDESLIGA_COMPETITION_ID);
      if (existingScorerError) throw existingScorerError;

      const existingByExternalId = new Map((existingScorers ?? []).map((row) => [row.external_id, row]));
      const scorerRows = goalgetters
        .map((row) => normalizeGoalgetter(row, existingByExternalId.get(String(row.goalGetterId ?? row.goalGetterID ?? ""))))
        .filter((row) => row.external_id);

      const { data: scorerData, error: scorerError } = await supabase
        .from("competition_top_scorers")
        .upsert(scorerRows, { onConflict: "competition_id,external_id" })
        .select("*");
      if (scorerError) throw scorerError;
      importedTopScorers = scorerData?.length ?? 0;
    }

    return json({
      importedMatches: matches?.length ?? 0,
      importedTeams: teams?.length ?? 0,
      importedGoals: goalRows.length,
      importedTopScorers,
      includeRelegation,
    });
  } catch (error) {
    return json({ error: error.message || "Bundesliga-Import fehlgeschlagen." }, 400);
  }
};

export const config = {
  path: "/api/admin-bundesliga-import",
};
