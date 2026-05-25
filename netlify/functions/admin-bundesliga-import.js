import { requireAdmin } from "./_shared/admin.js";
import { json } from "./_shared/supabase.js";
import {
  BUNDESLIGA_COMPETITION_ID,
  BUNDESLIGA_PUBLIC_SLUG,
  BUNDESLIGA_RELEGATION_LEAGUE,
  BUNDESLIGA_SEASON_LABEL,
  BUNDESLIGA_SOURCE_LEAGUE,
  BUNDESLIGA_SOURCE_SEASON,
  normalizeGoalgetter,
  normalizeOpenLigaMatch,
} from "./_shared/bundesliga.js";

async function fetchOpenLigaMatches(leagueShortcut) {
  const response = await fetch(`https://api.openligadb.de/getmatchdata/${leagueShortcut}/${BUNDESLIGA_SOURCE_SEASON}`);
  if (!response.ok) {
    if (leagueShortcut === BUNDESLIGA_SOURCE_LEAGUE && response.status === 404) return [];
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
  const { data: existing, error: readError } = await supabase
    .from("competitions")
    .select("id")
    .eq("id", BUNDESLIGA_COMPETITION_ID)
    .maybeSingle();
  if (readError) throw readError;

  const values = {
    name: "Bundesliga",
    season_label: BUNDESLIGA_SEASON_LABEL,
    source_provider: "openligadb",
    source_league: BUNDESLIGA_SOURCE_LEAGUE,
    source_season: BUNDESLIGA_SOURCE_SEASON,
    public_slug: BUNDESLIGA_PUBLIC_SLUG,
    tip_lock_mode: "kickoff",
    updated_at: new Date().toISOString(),
  };
  const request = existing
    ? supabase.from("competitions").update(values).eq("id", BUNDESLIGA_COMPETITION_ID)
    : supabase.from("competitions").insert({
        id: BUNDESLIGA_COMPETITION_ID,
        ...values,
        status: "admin_test",
        public_enabled: false,
      });
  const { error } = await request;
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
    if (!Array.isArray(leagueMatches) || leagueMatches.length === 0) {
      return json({ error: `Spielplan für ${BUNDESLIGA_SEASON_LABEL} ist bei OpenLigaDB noch nicht verfügbar.` }, 409);
    }
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
