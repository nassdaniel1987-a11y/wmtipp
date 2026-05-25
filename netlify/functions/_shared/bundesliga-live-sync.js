import {
  BUNDESLIGA_COMPETITION_ID,
  BUNDESLIGA_LIVE_PROBE_COMPETITION_ID,
  BUNDESLIGA_LIVE_PROBE_MATCH_ID,
  normalizeOpenLigaMatch,
} from "./bundesliga.js";

export const LIVE_UPDATE_COMPETITION_IDS = [
  BUNDESLIGA_COMPETITION_ID,
  BUNDESLIGA_LIVE_PROBE_COMPETITION_ID,
];

const LIVE_WINDOW_BEFORE_MS = 15 * 60 * 1000;
const LIVE_WINDOW_AFTER_MS = 5 * 60 * 60 * 1000;

function externalMatchId(row) {
  return String(row.external_id || "").split("-").pop();
}

export function isRelevantLiveFixture(match, now = new Date()) {
  const kickoff = new Date(match.kickoff_at);
  if (Number.isNaN(kickoff.getTime())) return false;
  const distance = kickoff.getTime() - now.getTime();
  return distance <= LIVE_WINDOW_BEFORE_MS && distance >= -LIVE_WINDOW_AFTER_MS;
}

export async function fetchOpenLigaCompetitionMatches(competition) {
  const response = await fetch(`https://api.openligadb.de/getmatchdata/${competition.source_league}/${competition.source_season}`);
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`OpenLigaDB ${competition.source_league}/${competition.source_season} konnte nicht geladen werden.`);
  return response.json();
}

export async function syncLiveCompetition(supabase, competition, {
  setup = false,
  now = new Date(),
} = {}) {
  const { data: storedMatches, error: matchReadError } = await supabase
    .from("competition_matches")
    .select("*")
    .eq("competition_id", competition.id)
    .eq("phase", "league")
    .order("match_number");
  if (matchReadError) throw matchReadError;

  const existingMatches = storedMatches ?? [];
  const relevantMatches = existingMatches.filter((match) => isRelevantLiveFixture(match, now));

  if (!setup && relevantMatches.length === 0) {
    return { skipped: true, reason: "Kein Live-Zeitfenster aktiv.", matches: 0, results: 0, goals: 0 };
  }

  const sourceMatches = await fetchOpenLigaCompetitionMatches(competition);
  const requestedExternalIds = new Set(
    relevantMatches.map(externalMatchId).filter(Boolean),
  );
  const selectedSourceMatches = competition.id === BUNDESLIGA_LIVE_PROBE_COMPETITION_ID && setup
    ? sourceMatches.filter((match) => String(match.matchID) === BUNDESLIGA_LIVE_PROBE_MATCH_ID)
    : sourceMatches.filter((match) => requestedExternalIds.has(String(match.matchID)));

  if (selectedSourceMatches.length === 0) {
    return { skipped: true, reason: "OpenLigaDB lieferte kein passendes Spiel.", matches: 0, results: 0, goals: 0 };
  }

  const normalized = selectedSourceMatches.map((match, index) => normalizeOpenLigaMatch(
    match,
    competition.source_league,
    index,
    {
      competitionId: competition.id,
      phaseOverride: competition.id === BUNDESLIGA_LIVE_PROBE_COMPETITION_ID ? "league" : undefined,
      matchdayOverride: competition.id === BUNDESLIGA_LIVE_PROBE_COMPETITION_ID ? 1 : undefined,
      now,
    },
  ));
  const teamRows = Array.from(new Map(
    normalized
      .flatMap((item) => [item.homeTeam, item.awayTeam])
      .map((team) => [team.external_id, team]),
  ).values());
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

  const resultRows = normalized.map((item) => item.resultRow).filter(Boolean);
  if (resultRows.length) {
    const { error: resultError } = await supabase
      .from("competition_results")
      .upsert(resultRows, { onConflict: "match_id" });
    if (resultError) throw resultError;
  }

  const matchIds = normalized.map((item) => item.matchRow.id);
  const goalRows = normalized.flatMap((item) => item.goals);
  const { error: deleteGoalError } = await supabase
    .from("competition_goals")
    .delete()
    .eq("competition_id", competition.id)
    .in("match_id", matchIds);
  if (deleteGoalError) throw deleteGoalError;
  if (goalRows.length) {
    const { error: goalError } = await supabase
      .from("competition_goals")
      .insert(goalRows);
    if (goalError) throw goalError;
  }

  return {
    skipped: false,
    matches: matches?.length ?? matchRows.length,
    results: resultRows.length,
    goals: goalRows.length,
    updatedAt: new Date().toISOString(),
  };
}
