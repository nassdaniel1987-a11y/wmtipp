export const BUNDESLIGA_COMPETITION_ID = "bundesliga-2025";
export const BUNDESLIGA_SOURCE_SEASON = 2025;
export const BUNDESLIGA_SOURCE_LEAGUE = "bl1";
export const BUNDESLIGA_RELEGATION_LEAGUE = "rel";

const WIKIMEDIA_SVG_THUMBNAIL_SIZE_PATTERN = /\/(\d+)px-([^/]+\.svg\.png)$/i;

export function normalizeTeamLogoUrl(url) {
  const value = String(url || "").trim();
  if (!value) return null;

  return value.replace(WIKIMEDIA_SVG_THUMBNAIL_SIZE_PATTERN, (match, size, fileName) => {
    const numericSize = Number(size);
    if (!Number.isFinite(numericSize) || numericSize <= 500) return match;
    return `/500px-${fileName}`;
  });
}

export function hasLikelyBrokenTeamLogoUrl(url) {
  const value = String(url || "").trim();
  const match = value.match(WIKIMEDIA_SVG_THUMBNAIL_SIZE_PATTERN);
  if (!match) return false;
  return Number(match[1]) > 500;
}

export function pointsFor(tip, result) {
  if (!result || result.status !== "final") return 0;
  if (tip.score_a === result.score_a && tip.score_b === result.score_b) return 4;

  const tipGoalDiff = tip.score_a - tip.score_b;
  const resultGoalDiff = result.score_a - result.score_b;
  const tipTrend = Math.sign(tipGoalDiff);
  const resultTrend = Math.sign(resultGoalDiff);
  if (tipTrend !== resultTrend) return 0;
  if (tipTrend === 0) return 2;
  return tipGoalDiff === resultGoalDiff ? 3 : 2;
}

export const bundesligaBonusPointValues = {
  champion: 6,
  topScorer: 6,
  relegatedTeam: 4,
};

export function buildBundesligaBonusPoints(bonusTip, bonusResult, topScorers = []) {
  if (!bonusTip || !bonusResult) return 0;
  let points = 0;
  if (bonusTip.champion_team_id && bonusTip.champion_team_id === bonusResult.champion_team_id) {
    points += bundesligaBonusPointValues.champion;
  }

  const officialScorerNames = new Set((bonusResult.top_scorers ?? []).map((name) => String(name || "").trim().toLocaleLowerCase("de-DE")));
  const pickedScorer = topScorers.find((row) => row.id === bonusTip.top_scorer_id);
  if (pickedScorer && officialScorerNames.has(String(pickedScorer.display_name || "").trim().toLocaleLowerCase("de-DE"))) {
    points += bundesligaBonusPointValues.topScorer;
  } else if (!pickedScorer && bonusTip.top_scorer && officialScorerNames.has(String(bonusTip.top_scorer).trim().toLocaleLowerCase("de-DE"))) {
    points += bundesligaBonusPointValues.topScorer;
  }

  const officialRelegated = new Set(bonusResult.relegated_team_ids ?? []);
  (bonusTip.relegated_team_ids ?? []).forEach((teamId) => {
    if (officialRelegated.has(teamId)) points += bundesligaBonusPointValues.relegatedTeam;
  });
  return points;
}

export function getFinalScore(match) {
  return (match.matchResults ?? [])
    .slice()
    .sort((first, second) => (second.resultOrderID ?? 0) - (first.resultOrderID ?? 0))
    .find((result) =>
      result.resultTypeID === 2 ||
      String(result.resultName || "").toLocaleLowerCase("de-DE").includes("end"),
    );
}

export function buildLeagueTable(matches, results, teams = []) {
  const table = new Map();
  teams.forEach((team) => {
    table.set(team.id, {
      teamId: team.id,
      team: team.name,
      shortName: team.short_name,
      logoUrl: normalizeTeamLogoUrl(team.logo_url),
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      points: 0,
    });
  });

  const resultsByMatch = new Map((results ?? []).map((result) => [result.match_id, result]));
  (matches ?? []).forEach((match) => {
    const result = resultsByMatch.get(match.id);
    if (!result || result.status !== "final") return;
    const home = table.get(match.team_a_id);
    const away = table.get(match.team_b_id);
    if (!home || !away) return;

    home.played += 1;
    away.played += 1;
    home.goalsFor += result.score_a;
    home.goalsAgainst += result.score_b;
    away.goalsFor += result.score_b;
    away.goalsAgainst += result.score_a;

    if (result.score_a > result.score_b) {
      home.won += 1;
      home.points += 3;
      away.lost += 1;
    } else if (result.score_a < result.score_b) {
      away.won += 1;
      away.points += 3;
      home.lost += 1;
    } else {
      home.drawn += 1;
      away.drawn += 1;
      home.points += 1;
      away.points += 1;
    }
  });

  return Array.from(table.values()).sort((first, second) => {
    const firstDiff = first.goalsFor - first.goalsAgainst;
    const secondDiff = second.goalsFor - second.goalsAgainst;
    return (
      second.points - first.points ||
      secondDiff - firstDiff ||
      second.goalsFor - first.goalsFor ||
      first.team.localeCompare(second.team, "de")
    );
  });
}

export function buildDemoRanking(participants, tips, results) {
  const resultsByMatch = new Map((results ?? []).map((result) => [result.match_id, result]));
  const totals = new Map(
    (participants ?? []).map((participant) => [
      participant.id,
      {
        id: participant.id,
        name: participant.display_name,
        points: 0,
        matchPoints: 0,
        bonusPoints: 0,
        tipCount: 0,
        scoredTipCount: 0,
        averagePoints: 0,
      },
    ]),
  );

  (tips ?? []).forEach((tip) => {
    const row = totals.get(tip.participant_id);
    if (!row) return;
    row.tipCount += 1;
    const result = resultsByMatch.get(tip.match_id);
    const points = pointsFor(tip, result);
    if (result?.status === "final") row.scoredTipCount += 1;
    row.matchPoints += points;
    row.points += points;
  });

  totals.forEach((row) => {
    row.averagePoints = row.scoredTipCount > 0 ? row.matchPoints / row.scoredTipCount : 0;
  });

  return Array.from(totals.values()).sort((first, second) =>
    second.points - first.points || first.name.localeCompare(second.name, "de"),
  );
}

export function buildCompetitionRanking(participants, tips, results, bonusTips = [], bonusResult = null, topScorers = []) {
  const resultsByMatch = new Map((results ?? []).map((result) => [result.match_id, result]));
  const bonusTipByParticipant = new Map((bonusTips ?? []).map((tip) => [tip.participant_id, tip]));
  const totals = new Map(
    (participants ?? []).map((participant) => [
      participant.id,
      {
        id: participant.id,
        name: participant.display_name,
        points: 0,
        matchPoints: 0,
        bonusPoints: 0,
        tipCount: 0,
        scoredTipCount: 0,
        averagePoints: 0,
      },
    ]),
  );

  (tips ?? []).forEach((tip) => {
    const row = totals.get(tip.participant_id);
    if (!row) return;
    row.tipCount += 1;
    const result = resultsByMatch.get(tip.match_id);
    const points = pointsFor(tip, result);
    if (result?.status === "final") row.scoredTipCount += 1;
    row.matchPoints += points;
    row.points += points;
  });

  totals.forEach((row, participantId) => {
    const bonusPoints = buildBundesligaBonusPoints(bonusTipByParticipant.get(participantId), bonusResult, topScorers);
    row.bonusPoints = bonusPoints;
    row.points += bonusPoints;
    row.averagePoints = row.scoredTipCount > 0 ? row.matchPoints / row.scoredTipCount : 0;
  });

  return Array.from(totals.values()).sort((first, second) =>
    second.points - first.points || first.name.localeCompare(second.name, "de"),
  );
}

export function buildTopScorers(goals) {
  const totals = new Map();
  (goals ?? []).forEach((goal) => {
    if (!goal.scorer_name || goal.is_own_goal) return;
    const key = goal.scorer_name.trim();
    const current = totals.get(key) ?? { name: key, goals: 0 };
    current.goals += 1;
    totals.set(key, current);
  });
  return Array.from(totals.values()).sort((first, second) =>
    second.goals - first.goals || first.name.localeCompare(second.name, "de"),
  );
}

export function normalizeGoalgetter(row, existing = null) {
  const externalId = String(row.goalGetterId ?? row.goalGetterID ?? row.id ?? row.goalGetterName ?? "");
  const sourceName = String(row.goalGetterName || "").trim();
  const displayName = existing?.manual_override
    ? existing.display_name
    : sourceName || `Unbekannter Spieler ${externalId}`;

  return {
    competition_id: BUNDESLIGA_COMPETITION_ID,
    external_id: externalId,
    display_name: displayName,
    source_name: sourceName,
    goals: Number(row.goalCount ?? 0),
    team_name: existing?.manual_override ? existing.team_name : existing?.team_name ?? null,
    manual_override: Boolean(existing?.manual_override),
    source_json: row,
    updated_at: new Date().toISOString(),
  };
}

export function normalizeOpenLigaMatch(match, leagueShortcut, indexOffset = 0) {
  const kickoff = match.matchDateTimeUTC || match.matchDateTime;
  const date = new Date(kickoff);
  const externalId = String(match.matchID);
  const matchday = Number(match.group?.groupOrderID ?? 0);
  const finalScore = getFinalScore(match);
  const isRelegation = leagueShortcut === BUNDESLIGA_RELEGATION_LEAGUE;

  return {
    matchRow: {
      id: `${BUNDESLIGA_COMPETITION_ID}-${leagueShortcut}-${externalId}`,
      competition_id: BUNDESLIGA_COMPETITION_ID,
      external_id: `${leagueShortcut}-${externalId}`,
      match_number: isRelegation ? 1000 + indexOffset + 1 : indexOffset + 1,
      matchday,
      phase: isRelegation ? "relegation" : "league",
      kickoff_at: Number.isNaN(date.getTime()) ? null : date.toISOString(),
      match_date: Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10),
      match_time: Number.isNaN(date.getTime()) ? "00:00" : date.toISOString().slice(11, 16),
      team_a_name: match.team1?.teamName ?? "Heimteam",
      team_b_name: match.team2?.teamName ?? "Auswärtsteam",
      status: match.matchIsFinished ? "final" : "scheduled",
      source_json: match,
      updated_at: new Date().toISOString(),
    },
    homeTeam: {
      competition_id: BUNDESLIGA_COMPETITION_ID,
      external_id: String(match.team1?.teamId ?? `${externalId}-home`),
      name: match.team1?.teamName ?? "Heimteam",
      short_name: match.team1?.shortName ?? null,
      logo_url: normalizeTeamLogoUrl(match.team1?.teamIconUrl),
      updated_at: new Date().toISOString(),
    },
    awayTeam: {
      competition_id: BUNDESLIGA_COMPETITION_ID,
      external_id: String(match.team2?.teamId ?? `${externalId}-away`),
      name: match.team2?.teamName ?? "Auswärtsteam",
      short_name: match.team2?.shortName ?? null,
      logo_url: normalizeTeamLogoUrl(match.team2?.teamIconUrl),
      updated_at: new Date().toISOString(),
    },
    resultRow: finalScore && match.matchIsFinished
      ? {
          match_id: `${BUNDESLIGA_COMPETITION_ID}-${leagueShortcut}-${externalId}`,
          competition_id: BUNDESLIGA_COMPETITION_ID,
          score_a: finalScore.pointsTeam1,
          score_b: finalScore.pointsTeam2,
          status: "final",
          updated_at: new Date().toISOString(),
        }
      : null,
    goals: (match.goals ?? []).map((goal, goalIndex) => ({
      competition_id: BUNDESLIGA_COMPETITION_ID,
      match_id: `${BUNDESLIGA_COMPETITION_ID}-${leagueShortcut}-${externalId}`,
      external_goal_id: goal.goalID ? String(goal.goalID) : `${leagueShortcut}-${externalId}-${goalIndex}`,
      scorer_name: String(goal.goalGetterName || "").trim() || "Unbekannt",
      scorer_external_id: goal.goalGetterID ? String(goal.goalGetterID) : null,
      team_side: null,
      minute: Number.isInteger(goal.matchMinute) ? goal.matchMinute : null,
      is_own_goal: Boolean(goal.isOwnGoal),
      is_penalty: Boolean(goal.isPenalty),
      source_json: goal,
    })),
  };
}
