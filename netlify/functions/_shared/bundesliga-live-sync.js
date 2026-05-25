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
const FOOTBALL_DATA_COMPETITION = "BL1";
const FOOTBALL_DATA_SEASON = "2026";

function externalMatchId(row) {
  return String(row.external_id || "").split("-").pop();
}

export function isRelevantLiveFixture(match, now = new Date()) {
  const kickoff = new Date(match.kickoff_at);
  if (Number.isNaN(kickoff.getTime())) return false;
  const distance = kickoff.getTime() - now.getTime();
  return distance <= LIVE_WINDOW_BEFORE_MS && distance >= -LIVE_WINDOW_AFTER_MS;
}

function toIsoOrNull(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function normalizedTeamKey(value) {
  const name = String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  const knownClubs = [
    ["bayern", "bayern"], ["leipzig", "leipzig"], ["dortmund", "dortmund"],
    ["leverkusen", "leverkusen"], ["stuttgart", "stuttgart"], ["frankfurt", "frankfurt"],
    ["freiburg", "freiburg"], ["hoffenheim", "hoffenheim"], ["heidenheim", "heidenheim"],
    ["wolfsburg", "wolfsburg"], ["mainz", "mainz"], ["gladbach", "gladbach"],
    ["monchengladbach", "gladbach"], ["union", "union-berlin"], ["werder", "bremen"],
    ["bremen", "bremen"], ["pauli", "st-pauli"], ["koln", "koln"], ["cologne", "koln"],
    ["hamburg", "hamburg"], ["hsv", "hamburg"], ["augsburg", "augsburg"],
  ];
  return knownClubs.find(([needle]) => name.includes(needle))?.[1]
    ?? name.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function sameFixture(localMatch, sourceMatch) {
  const localKickoff = new Date(localMatch.kickoff_at).getTime();
  const sourceKickoff = new Date(sourceMatch.utcDate).getTime();
  if (!Number.isFinite(localKickoff) || !Number.isFinite(sourceKickoff) || Math.abs(localKickoff - sourceKickoff) > 10 * 60 * 1000) {
    return false;
  }
  return normalizedTeamKey(localMatch.team_a_name) === normalizedTeamKey(sourceMatch.homeTeam?.name)
    && normalizedTeamKey(localMatch.team_b_name) === normalizedTeamKey(sourceMatch.awayTeam?.name);
}

function hasOpenLigaLiveEvidence(match) {
  if (match.matchIsFinished || (match.goals ?? []).length > 0) return true;
  return Boolean(match.lastUpdateDateTime && match.matchDateTime && match.lastUpdateDateTime >= match.matchDateTime);
}

function observationRow(competitionId, matchId, provider, result, sourceJson, providerUpdatedAt) {
  if (!result) return null;
  return {
    competition_id: competitionId,
    match_id: matchId,
    provider,
    score_a: result.score_a,
    score_b: result.score_b,
    status: result.status,
    provider_updated_at: toIsoOrNull(providerUpdatedAt),
    observed_at: new Date().toISOString(),
    source_json: sourceJson ?? {},
  };
}

export function selectHybridLiveResult(openLiga, footballData, { footballDataConfigured = false } = {}) {
  const decorate = (result, liveSource, verificationStatus, status = result?.status) => result ? ({
    match_id: result.match_id,
    competition_id: result.competition_id,
    score_a: result.score_a,
    score_b: result.score_b,
    status,
    live_source: liveSource,
    verification_status: verificationStatus,
    source_updated_at: result.provider_updated_at ?? null,
    updated_at: new Date().toISOString(),
  }) : null;
  if (openLiga?.status === "live") return decorate(openLiga, "openligadb", "primary_live");
  if (footballData?.status === "live") return decorate(footballData, "football-data", "fallback_live");
  if (openLiga?.status === "final") {
    if (!footballDataConfigured) return decorate(openLiga, "openligadb", "single_source");
    const matchesFinal = footballData?.status === "final"
      && footballData.score_a === openLiga.score_a
      && footballData.score_b === openLiga.score_b;
    return matchesFinal
      ? decorate(openLiga, "confirmed", "confirmed")
      : decorate(openLiga, "openligadb", footballData?.status === "final" ? "conflict" : "awaiting_confirmation", "live");
  }
  if (footballData?.status === "final") {
    return decorate(footballData, "football-data", "awaiting_confirmation", "live");
  }
  return null;
}

export function summarizeHybridObservation(openLiga, footballData, selectedResult, footballDataConfigured) {
  if (!footballDataConfigured) return "nicht_konfiguriert";
  if (selectedResult?.verification_status === "confirmed") return "stimmt_ueberein";
  if (selectedResult?.verification_status === "fallback_live") return "fallback_aktiv";
  if (selectedResult?.verification_status === "conflict") return "abweichend";
  return "wartet";
}

export function preserveKnownGoalScorer(incomingGoal, existingGoal) {
  const incomingName = String(incomingGoal?.scorer_name || "").trim();
  const existingName = String(existingGoal?.scorer_name || "").trim();
  if (incomingName && incomingName !== "Unbekannt") return incomingGoal;
  if (existingName && existingName !== "Unbekannt") {
    return { ...incomingGoal, scorer_name: existingName, scorer_external_id: incomingGoal.scorer_external_id ?? existingGoal.scorer_external_id ?? null };
  }
  return incomingGoal;
}

export async function fetchOpenLigaCompetitionMatches(competition) {
  const response = await fetch(`https://api.openligadb.de/getmatchdata/${competition.source_league}/${competition.source_season}`);
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`OpenLigaDB ${competition.source_league}/${competition.source_season} konnte nicht geladen werden.`);
  return response.json();
}

async function fetchFootballDataMatches(apiKey) {
  if (!apiKey) return [];
  const url = new URL(`https://api.football-data.org/v4/competitions/${FOOTBALL_DATA_COMPETITION}/matches`);
  url.searchParams.set("season", FOOTBALL_DATA_SEASON);
  const response = await fetch(url, { headers: { "X-Auth-Token": apiKey } });
  if (!response.ok) throw new Error("football-data.org Bundesliga-Livestatus konnte nicht geladen werden.");
  const payload = await response.json();
  return payload.matches ?? [];
}

function normalizeFootballDataObservation(competitionId, localMatch, sourceMatch) {
  const fullTime = sourceMatch.score?.fullTime ?? {};
  if (!Number.isInteger(fullTime.home) || !Number.isInteger(fullTime.away)) return null;
  const sourceStatus = sourceMatch.status === "FINISHED"
    ? "final"
    : ["IN_PLAY", "PAUSED"].includes(sourceMatch.status) ? "live" : null;
  if (!sourceStatus) return null;
  return observationRow(competitionId, localMatch.id, "football-data", {
    match_id: localMatch.id,
    competition_id: competitionId,
    score_a: fullTime.home,
    score_b: fullTime.away,
    status: sourceStatus,
  }, sourceMatch, sourceMatch.lastUpdated);
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

  const openLigaObservations = normalized.map((item, index) => (
    item.resultRow && hasOpenLigaLiveEvidence(selectedSourceMatches[index])
      ? observationRow(
          competition.id,
          item.matchRow.id,
          "openligadb",
          item.resultRow,
          selectedSourceMatches[index],
          selectedSourceMatches[index].lastUpdateDateTime,
        )
      : null
  )).filter(Boolean);
  const footballDataKey = competition.id === BUNDESLIGA_COMPETITION_ID
    ? Netlify.env.get("FOOTBALL_DATA_API_KEY")
    : "";
  const footballMatches = footballDataKey ? await fetchFootballDataMatches(footballDataKey).catch(() => []) : [];
  const footballDataObservations = relevantMatches
    .map((localMatch) => {
      const sourceMatch = footballMatches.find((candidate) => sameFixture(localMatch, candidate));
      return sourceMatch ? normalizeFootballDataObservation(competition.id, localMatch, sourceMatch) : null;
    })
    .filter(Boolean);
  const matchIds = normalized.map((item) => item.matchRow.id);
  const observations = [...openLigaObservations, ...footballDataObservations];
  if (observations.length) {
    const { error: observationError } = await supabase
      .from("competition_live_observations")
      .upsert(observations, { onConflict: "competition_id,match_id,provider" });
    if (observationError) throw observationError;
  }
  const { data: storedObservations, error: storedObservationError } = await supabase
    .from("competition_live_observations")
    .select("*")
    .eq("competition_id", competition.id)
    .in("match_id", matchIds);
  if (storedObservationError) throw storedObservationError;
  const observationByMatch = new Map();
  (storedObservations ?? []).forEach((observation) => {
    const current = observationByMatch.get(observation.match_id) ?? {};
    current[observation.provider] = observation;
    observationByMatch.set(observation.match_id, current);
  });
  const resultRows = normalized
    .map((item) => {
      const providers = observationByMatch.get(item.matchRow.id) ?? {};
      return selectHybridLiveResult(providers.openligadb, providers["football-data"], {
        footballDataConfigured: Boolean(footballDataKey),
      });
    })
    .filter(Boolean);
  if (resultRows.length) {
    const { error: resultError } = await supabase
      .from("competition_results")
      .upsert(resultRows, { onConflict: "match_id" });
    if (resultError) throw resultError;
  }

  const { data: existingGoals, error: existingGoalError } = await supabase
    .from("competition_goals")
    .select("external_goal_id, scorer_name, scorer_external_id")
    .eq("competition_id", competition.id)
    .in("match_id", matchIds);
  if (existingGoalError) throw existingGoalError;
  const existingGoalByExternalId = new Map((existingGoals ?? []).map((goal) => [goal.external_goal_id, goal]));
  const goalRows = normalized.flatMap((item) => item.goals).map((goal) => (
    preserveKnownGoalScorer(goal, existingGoalByExternalId.get(goal.external_goal_id))
  ));
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
    providers: {
      openligadb: openLigaObservations.length,
      footballData: footballDataObservations.length,
      footballDataConfigured: Boolean(footballDataKey),
    },
    updatedAt: new Date().toISOString(),
  };
}
