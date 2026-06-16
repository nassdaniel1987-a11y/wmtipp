// Geteilte Import-Logik fuer offizielle WM-Ergebnisse (football-data.org).
// Genutzt vom Admin-Endpunkt (Vorschau/Auswahl) und von der Scheduled Function
// (periodischer Auto-Import), damit Ergebnisse NICHT pro Seitenaufruf, sondern
// gebuendelt im Hintergrund in Supabase landen.

const teamAliases = {
  "bosnia-herzegovina": "bosnia-herzegovina",
  "bosnia-and-herzegovina": "bosnia-herzegovina",
  "bosnien-und-herzegowina": "bosnia-herzegovina",
  "cape-verde": "cape-verde",
  "kap-verde": "cape-verde",
  "czech-republic": "czechia",
  czechia: "czechia",
  tschechien: "czechia",
  curacao: "curacao",
  "cote-d-ivoire": "ivory-coast",
  "cote-divoire": "ivory-coast",
  "ivory-coast": "ivory-coast",
  elfenbeinkuste: "ivory-coast",
  "dr-congo": "dr-congo",
  "democratic-republic-of-congo": "dr-congo",
  "korea-republic": "south-korea",
  "south-korea": "south-korea",
  "republik-korea": "south-korea",
  "saudi-arabia": "saudi-arabia",
  "saudi-arabien": "saudi-arabia",
  turkiye: "turkiye",
  turkey: "turkiye",
  turkei: "turkiye",
  "united-states": "united-states",
  usa: "united-states",
};

export function normalizeTeamName(value) {
  const key = String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return teamAliases[key] ?? key;
}

export function teamPairKey(teamA, teamB) {
  return [normalizeTeamName(teamA), normalizeTeamName(teamB)].sort().join("__");
}

function getFootballDataConfig() {
  return {
    apiKey: Netlify.env.get("FOOTBALL_DATA_API_KEY"),
    competition: Netlify.env.get("FOOTBALL_DATA_COMPETITION") || "WC",
    season: Netlify.env.get("FOOTBALL_DATA_SEASON") || "2026",
  };
}

export async function loadExternalMatches() {
  const { apiKey, competition, season } = getFootballDataConfig();

  if (!apiKey) {
    throw new Error("FOOTBALL_DATA_API_KEY fehlt in Netlify. Bitte als Environment Variable eintragen.");
  }

  const url = new URL(`https://api.football-data.org/v4/competitions/${competition}/matches`);
  if (season) url.searchParams.set("season", season);

  const response = await fetch(url, {
    headers: { "X-Auth-Token": apiKey },
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.message || "Offizielle Ergebnisse konnten nicht abgerufen werden.");
  }

  return {
    source: `football-data.org ${competition} ${season}`,
    matches: payload.matches ?? [],
  };
}

function mapCandidate(match, external, existingResult) {
  const fullTime = external.score?.fullTime ?? {};
  const scoreA =
    normalizeTeamName(external.homeTeam?.name) === normalizeTeamName(match.team_a)
      ? fullTime.home
      : fullTime.away;
  const scoreB =
    normalizeTeamName(external.homeTeam?.name) === normalizeTeamName(match.team_a)
      ? fullTime.away
      : fullTime.home;

  return {
    matchId: match.id,
    matchNumber: match.match_number,
    teamA: match.team_a,
    teamB: match.team_b,
    scoreA,
    scoreB,
    externalId: external.id,
    externalHomeTeam: external.homeTeam?.name ?? "",
    externalAwayTeam: external.awayTeam?.name ?? "",
    externalStatus: external.status,
    utcDate: external.utcDate,
    alreadySaved:
      existingResult?.status === "final" &&
      existingResult?.score_a === scoreA &&
      existingResult?.score_b === scoreB,
    wouldOverwrite:
      existingResult?.status === "final" &&
      (existingResult?.score_a !== scoreA || existingResult?.score_b !== scoreB),
  };
}

export async function buildCandidates(supabase) {
  const [{ data: matches, error: matchesError }, { data: results, error: resultsError }, externalPayload] =
    await Promise.all([
      supabase
        .from("matches")
        .select("id, match_number, team_a, team_b, kickoff_at")
        .order("match_number", { ascending: true }),
      supabase.from("results").select("match_id, score_a, score_b, status"),
      loadExternalMatches(),
    ]);

  if (matchesError) throw matchesError;
  if (resultsError) throw resultsError;

  const localByPair = new Map((matches ?? []).map((match) => [teamPairKey(match.team_a, match.team_b), match]));
  const resultsByMatch = new Map((results ?? []).map((result) => [result.match_id, result]));
  const candidates = [];
  const unmatched = [];

  (externalPayload.matches ?? [])
    .filter((match) => match.status === "FINISHED")
    .forEach((external) => {
      const fullTime = external.score?.fullTime ?? {};
      if (!Number.isInteger(fullTime.home) || !Number.isInteger(fullTime.away)) return;

      const localMatch = localByPair.get(teamPairKey(external.homeTeam?.name, external.awayTeam?.name));
      if (!localMatch) {
        unmatched.push({
          externalId: external.id,
          homeTeam: external.homeTeam?.name ?? "",
          awayTeam: external.awayTeam?.name ?? "",
          scoreA: fullTime.home,
          scoreB: fullTime.away,
        });
        return;
      }

      candidates.push(mapCandidate(localMatch, external, resultsByMatch.get(localMatch.id)));
    });

  return {
    source: externalPayload.source,
    candidates,
    unmatched,
    fetchedAt: new Date().toISOString(),
  };
}
