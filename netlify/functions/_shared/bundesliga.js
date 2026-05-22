export const BUNDESLIGA_COMPETITION_ID = "bundesliga-2025";
export const BUNDESLIGA_SOURCE_SEASON = 2025;
export const BUNDESLIGA_SOURCE_LEAGUE = "bl1";
export const BUNDESLIGA_RELEGATION_LEAGUE = "rel";

const WIKIMEDIA_SVG_THUMBNAIL_SIZE_PATTERN = /\/(\d+)px-([^/]+\.svg\.png)$/i;
const MISSING_OPTIONAL_SCHEMA_CODES = new Set(["42P01", "42703", "PGRST200", "PGRST204", "PGRST205"]);

export const defaultBundesligaRuleSettings = {
  competition_id: BUNDESLIGA_COMPETITION_ID,
  exact_score_points: 4,
  goal_diff_points: 3,
  tendency_points: 2,
  champion_bonus_points: 6,
  top_scorer_bonus_points: 6,
  relegated_team_bonus_points: 4,
  foreign_tips_visible_from: "kickoff",
  tie_breakers: ["points", "matchday_wins", "match_points", "display_name"],
};

function isOptionalSchemaMissing(error) {
  return MISSING_OPTIONAL_SCHEMA_CODES.has(error?.code) || /does not exist|schema cache|column/i.test(error?.message || "");
}

export async function loadCompetitionRuleSettings(supabase) {
  const { data, error } = await supabase
    .from("competition_rule_settings")
    .select("*")
    .eq("competition_id", BUNDESLIGA_COMPETITION_ID)
    .maybeSingle();
  if (error && isOptionalSchemaMissing(error)) return defaultBundesligaRuleSettings;
  if (error) throw error;
  return {
    ...defaultBundesligaRuleSettings,
    ...(data ?? {}),
    tie_breakers: Array.isArray(data?.tie_breakers) ? data.tie_breakers : defaultBundesligaRuleSettings.tie_breakers,
  };
}

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

export function pointsFor(tip, result, ruleSettings = defaultBundesligaRuleSettings) {
  if (!result || result.status !== "final") return 0;
  if (tip.score_a === result.score_a && tip.score_b === result.score_b) return ruleSettings.exact_score_points;

  const tipGoalDiff = tip.score_a - tip.score_b;
  const resultGoalDiff = result.score_a - result.score_b;
  const tipTrend = Math.sign(tipGoalDiff);
  const resultTrend = Math.sign(resultGoalDiff);
  if (tipTrend !== resultTrend) return 0;
  if (tipTrend === 0) return ruleSettings.tendency_points;
  return tipGoalDiff === resultGoalDiff ? ruleSettings.goal_diff_points : ruleSettings.tendency_points;
}

export function explainPointsFor(tip, result, ruleSettings = defaultBundesligaRuleSettings) {
  if (!tip) return { points: 0, reason: "kein Tipp abgegeben" };
  if (!result || result.status !== "final") return { points: 0, reason: "noch nicht ausgewertet" };
  const points = pointsFor(tip, result, ruleSettings);
  if (tip.score_a === result.score_a && tip.score_b === result.score_b) {
    return { points, reason: `exakt getroffen: ${points} Punkte` };
  }

  const tipGoalDiff = tip.score_a - tip.score_b;
  const resultGoalDiff = result.score_a - result.score_b;
  const tipTrend = Math.sign(tipGoalDiff);
  const resultTrend = Math.sign(resultGoalDiff);
  if (tipTrend !== resultTrend) return { points: 0, reason: "falsch: 0 Punkte" };
  if (tipTrend === 0) return { points, reason: `Tendenz richtig: ${points} Punkte` };
  return tipGoalDiff === resultGoalDiff
    ? { points, reason: `Tordifferenz richtig: ${points} Punkte` }
    : { points, reason: `Tendenz richtig: ${points} Punkte` };
}

export function buildTipTrends(tips = [], matches = [], now = new Date()) {
  const matchesById = new Map((matches ?? []).map((match) => [match.id, match]));
  const trendMap = new Map();
  (tips ?? []).forEach((tip) => {
    const match = matchesById.get(tip.match_id);
    if (!match || !canViewMatchTips(match, now)) return;
    const row = trendMap.get(tip.match_id) ?? {
      matchId: tip.match_id,
      total: 0,
      home: 0,
      draw: 0,
      away: 0,
    };
    row.total += 1;
    const trend = Math.sign(tip.score_a - tip.score_b);
    if (trend > 0) row.home += 1;
    else if (trend < 0) row.away += 1;
    else row.draw += 1;
    trendMap.set(tip.match_id, row);
  });

  return Array.from(trendMap.values()).map((row) => ({
    ...row,
    homePercent: row.total ? Math.round((row.home / row.total) * 100) : 0,
    drawPercent: row.total ? Math.round((row.draw / row.total) * 100) : 0,
    awayPercent: row.total ? Math.round((row.away / row.total) * 100) : 0,
  }));
}

export function buildParticipantComfortStats(participantId, tips = [], matches = [], results = [], ruleSettings = defaultBundesligaRuleSettings) {
  const participantTips = (tips ?? []).filter((tip) => tip.participant_id === participantId);
  const matchesById = new Map((matches ?? []).map((match) => [match.id, match]));
  const resultsByMatch = new Map((results ?? []).map((result) => [result.match_id, result]));
  const matchdayPoints = new Map();
  const stats = {
    participantId,
    savedTipCount: participantTips.length,
    scoredTipCount: 0,
    exactHits: 0,
    goalDiffHits: 0,
    tendencyHits: 0,
    wrongTips: 0,
    bestMatchdays: [],
  };

  participantTips.forEach((tip) => {
    const match = matchesById.get(tip.match_id);
    const result = resultsByMatch.get(tip.match_id);
    if (!match || result?.status !== "final") return;
    const explanation = explainPointsFor(tip, result, ruleSettings);
    stats.scoredTipCount += 1;
    if (explanation.points === ruleSettings.exact_score_points && explanation.reason.startsWith("exakt")) stats.exactHits += 1;
    else if (explanation.points === ruleSettings.goal_diff_points && explanation.reason.startsWith("Tordifferenz")) stats.goalDiffHits += 1;
    else if (explanation.points === ruleSettings.tendency_points) stats.tendencyHits += 1;
    else stats.wrongTips += 1;
    const matchday = Number(match.matchday) || 0;
    if (matchday) matchdayPoints.set(matchday, (matchdayPoints.get(matchday) ?? 0) + explanation.points);
  });

  stats.bestMatchdays = Array.from(matchdayPoints.entries())
    .map(([matchday, points]) => ({ matchday, points }))
    .sort((first, second) => second.points - first.points || first.matchday - second.matchday)
    .slice(0, 3);
  return stats;
}

export function buildOpenTaskSummary(matches = [], tips = [], bonusTip = null) {
  const tipsByMatch = new Set((tips ?? []).map((tip) => tip.match_id));
  const openByMatchday = new Map();
  (matches ?? []).forEach((match) => {
    const matchday = Number(match.matchday) || 0;
    if (!matchday || tipsByMatch.has(match.id)) return;
    openByMatchday.set(matchday, (openByMatchday.get(matchday) ?? 0) + 1);
  });
  const bonusStatus = buildBonusStatus(bonusTip);
  return {
    openTipCount: Array.from(openByMatchday.values()).reduce((sum, value) => sum + value, 0),
    openByMatchday: Array.from(openByMatchday.entries()).map(([matchday, count]) => ({ matchday, count })),
    bonusStatus,
    nextOpenMatchday: Array.from(openByMatchday.keys()).sort((a, b) => a - b)[0] ?? null,
  };
}

export const bundesligaBonusPointValues = {
  champion: 6,
  topScorer: 6,
  relegatedTeam: 4,
};

export const bundesligaRulesSummary = {
  matchPoints: [
    ["Exaktes Ergebnis", "4 Punkte"],
    ["Richtige Tordifferenz", "3 Punkte"],
    ["Richtige Tendenz", "2 Punkte"],
    ["Falsch", "0 Punkte"],
  ],
  bonusPoints: [
    ["Meister", "6 Punkte"],
    ["Torschützenkönig", "6 Punkte"],
    ["Absteiger", "4 Punkte je Verein"],
  ],
  visibility: "Fremde Tipps werden pro Spiel ab Anpfiff sichtbar.",
  tieBreaker: "Bei Punktgleichstand zählen zuerst die Spieltagssiege.",
};

export function buildBundesligaRulesSummary(ruleSettings = defaultBundesligaRuleSettings, competition = null) {
  return {
    matchPoints: [
      ["Exaktes Ergebnis", `${ruleSettings.exact_score_points} Punkte`],
      ["Richtige Tordifferenz", `${ruleSettings.goal_diff_points} Punkte`],
      ["Richtige Tendenz", `${ruleSettings.tendency_points} Punkte`],
      ["Falsch", "0 Punkte"],
    ],
    bonusPoints: [
      ["Meister", `${ruleSettings.champion_bonus_points} Punkte`],
      ["Torschützenkönig", `${ruleSettings.top_scorer_bonus_points} Punkte`],
      ["Absteiger", `${ruleSettings.relegated_team_bonus_points} Punkte je Verein`],
    ],
    visibility: ruleSettings.foreign_tips_visible_from === "match_finished"
      ? "Fremde Tipps werden pro Spiel nach Abpfiff sichtbar."
      : ruleSettings.foreign_tips_visible_from === "never"
        ? "Fremde Tipps bleiben während der Saison verborgen."
        : "Fremde Tipps werden pro Spiel ab Anpfiff sichtbar.",
    tieBreaker: "Bei Punktgleichstand zählen zuerst die Spieltagssiege.",
    bonusDeadlineAt: competition?.bonus_deadline_at ?? null,
    tipLockMode: competition?.tip_lock_mode ?? "kickoff",
    tieBreakers: ruleSettings.tie_breakers,
  };
}

export function canViewMatchTips(match, now = new Date()) {
  if (!match?.kickoff_at) return false;
  const kickoff = new Date(match.kickoff_at);
  return !Number.isNaN(kickoff.getTime()) && kickoff <= now;
}

export function getBundesligaMatchStatus(match, result = null, now = new Date()) {
  if (result?.status === "final") return "finished";
  return canViewMatchTips(match, now) ? "locked" : "open";
}

export function buildBonusStatus(bonusTip = null) {
  const relegatedCount = Array.isArray(bonusTip?.relegated_team_ids) ? bonusTip.relegated_team_ids.length : 0;
  const doneCount = (bonusTip?.champion_team_id ? 1 : 0) + (bonusTip?.top_scorer_id || bonusTip?.top_scorer ? 1 : 0) + Math.min(3, relegatedCount);
  return {
    doneCount,
    totalCount: 5,
    championDone: Boolean(bonusTip?.champion_team_id),
    topScorerDone: Boolean(bonusTip?.top_scorer_id || bonusTip?.top_scorer),
    relegatedDoneCount: Math.min(3, relegatedCount),
    complete: doneCount >= 5,
  };
}

export function buildMatchdayStatus(matches = [], tips = [], results = [], now = new Date()) {
  const tipsByMatch = new Map((tips ?? []).map((tip) => [tip.match_id, tip]));
  const resultsByMatch = new Map((results ?? []).map((result) => [result.match_id, result]));
  const grouped = new Map();

  (matches ?? []).forEach((match) => {
    const matchday = Number(match.matchday) || 0;
    if (!matchday) return;
    const tip = tipsByMatch.get(match.id);
    const result = resultsByMatch.get(match.id);
    const row = grouped.get(matchday) ?? {
      matchday,
      matchCount: 0,
      savedTipCount: 0,
      openTipCount: 0,
      lockedCount: 0,
      finishedCount: 0,
      status: "open",
    };
    row.matchCount += 1;
    if (tip) row.savedTipCount += 1;
    if (!tip) row.openTipCount += 1;
    const status = getBundesligaMatchStatus(match, result, now);
    if (status === "locked") row.lockedCount += 1;
    if (status === "finished") row.finishedCount += 1;
    grouped.set(matchday, row);
  });

  return Array.from(grouped.values())
    .map((row) => ({
      ...row,
      status: row.finishedCount === row.matchCount
        ? "finished"
        : row.openTipCount === 0
          ? "complete"
          : row.lockedCount > 0
            ? "locked"
            : "open",
    }))
    .sort((first, second) => first.matchday - second.matchday);
}

export function buildMatchdayPointRows(participants = [], tips = [], matches = [], results = [], ruleSettings = defaultBundesligaRuleSettings) {
  const matchesById = new Map((matches ?? []).map((match) => [match.id, match]));
  const resultsByMatch = new Map((results ?? []).map((result) => [result.match_id, result]));
  const grouped = new Map();

  (participants ?? []).forEach((participant) => {
    (matches ?? []).forEach((match) => {
      const matchday = Number(match.matchday) || 0;
      if (!matchday) return;
      const key = `${matchday}:${participant.id}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          matchday,
          participantId: participant.id,
          name: participant.display_name,
          points: 0,
          tipCount: 0,
          scoredTipCount: 0,
        });
      }
    });
  });

  (tips ?? []).forEach((tip) => {
    const match = matchesById.get(tip.match_id);
    if (!match) return;
    const matchday = Number(match.matchday) || 0;
    const key = `${matchday}:${tip.participant_id}`;
    const row = grouped.get(key);
    if (!row) return;
    const result = resultsByMatch.get(tip.match_id);
    row.tipCount += 1;
    if (result?.status === "final") row.scoredTipCount += 1;
    row.points += pointsFor(tip, result, ruleSettings);
  });

  return Array.from(grouped.values()).sort((first, second) =>
    first.matchday - second.matchday || second.points - first.points || first.name.localeCompare(second.name, "de"),
  );
}

export function buildMatchdayWins(participants = [], tips = [], matches = [], results = [], ruleSettings = defaultBundesligaRuleSettings) {
  const wins = new Map((participants ?? []).map((participant) => [participant.id, 0]));
  const pointRows = buildMatchdayPointRows(participants, tips, matches, results, ruleSettings);
  const rowsByMatchday = new Map();
  pointRows.forEach((row) => {
    const rows = rowsByMatchday.get(row.matchday) ?? [];
    rows.push(row);
    rowsByMatchday.set(row.matchday, rows);
  });

  rowsByMatchday.forEach((rows) => {
    const scoredRows = rows.filter((row) => row.scoredTipCount > 0);
    if (!scoredRows.length) return;
    const best = Math.max(...scoredRows.map((row) => row.points));
    scoredRows
      .filter((row) => row.points === best)
      .forEach((row) => wins.set(row.participantId, (wins.get(row.participantId) ?? 0) + 1));
  });

  return wins;
}

export function buildBundesligaBonusPoints(bonusTip, bonusResult, topScorers = [], ruleSettings = defaultBundesligaRuleSettings) {
  if (!bonusTip || !bonusResult) return 0;
  let points = 0;
  if (bonusTip.champion_team_id && bonusTip.champion_team_id === bonusResult.champion_team_id) {
    points += ruleSettings.champion_bonus_points;
  }

  const officialScorerNames = new Set((bonusResult.top_scorers ?? []).map((name) => String(name || "").trim().toLocaleLowerCase("de-DE")));
  const pickedScorer = topScorers.find((row) => row.id === bonusTip.top_scorer_id);
  if (pickedScorer && officialScorerNames.has(String(pickedScorer.display_name || "").trim().toLocaleLowerCase("de-DE"))) {
    points += ruleSettings.top_scorer_bonus_points;
  } else if (!pickedScorer && bonusTip.top_scorer && officialScorerNames.has(String(bonusTip.top_scorer).trim().toLocaleLowerCase("de-DE"))) {
    points += ruleSettings.top_scorer_bonus_points;
  }

  const officialRelegated = new Set(bonusResult.relegated_team_ids ?? []);
  (bonusTip.relegated_team_ids ?? []).forEach((teamId) => {
    if (officialRelegated.has(teamId)) points += ruleSettings.relegated_team_bonus_points;
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

export function buildDemoRanking(participants, tips, results, ruleSettings = defaultBundesligaRuleSettings) {
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
    const points = pointsFor(tip, result, ruleSettings);
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

export function buildCompetitionRanking(participants, tips, results, bonusTips = [], bonusResult = null, topScorers = [], matches = [], ruleSettings = defaultBundesligaRuleSettings) {
  const resultsByMatch = new Map((results ?? []).map((result) => [result.match_id, result]));
  const bonusTipByParticipant = new Map((bonusTips ?? []).map((tip) => [tip.participant_id, tip]));
  const matchdayWins = buildMatchdayWins(participants, tips, matches, results, ruleSettings);
  const matchdayPointRows = buildMatchdayPointRows(participants, tips, matches, results, ruleSettings);
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
        matchdayWins: 0,
        matchdayPoints: {},
      },
    ]),
  );

  (tips ?? []).forEach((tip) => {
    const row = totals.get(tip.participant_id);
    if (!row) return;
    row.tipCount += 1;
    const result = resultsByMatch.get(tip.match_id);
    const points = pointsFor(tip, result, ruleSettings);
    if (result?.status === "final") row.scoredTipCount += 1;
    row.matchPoints += points;
    row.points += points;
  });

  totals.forEach((row, participantId) => {
    const bonusPoints = buildBundesligaBonusPoints(bonusTipByParticipant.get(participantId), bonusResult, topScorers, ruleSettings);
    row.bonusPoints = bonusPoints;
    row.points += bonusPoints;
    row.matchdayWins = matchdayWins.get(participantId) ?? 0;
    row.matchdayPoints = Object.fromEntries(
      matchdayPointRows
        .filter((item) => item.participantId === participantId)
        .map((item) => [item.matchday, item.points]),
    );
    row.averagePoints = row.scoredTipCount > 0 ? row.matchPoints / row.scoredTipCount : 0;
  });

  return Array.from(totals.values()).sort((first, second) =>
    second.points - first.points ||
    second.matchdayWins - first.matchdayWins ||
    second.matchPoints - first.matchPoints ||
    first.name.localeCompare(second.name, "de"),
  );
}

export function buildMatchdayLive(matches = [], participants = [], tips = [], results = [], participantId = "", matchday = 1, now = new Date(), ruleSettings = defaultBundesligaRuleSettings) {
  const visibleMatches = (matches ?? []).filter((match) => Number(match.matchday) === Number(matchday));
  const resultsByMatch = new Map((results ?? []).map((result) => [result.match_id, result]));
  const participantsById = new Map((participants ?? []).map((participant) => [participant.id, participant]));
  const pointRows = buildMatchdayPointRows(participants, tips, visibleMatches, results, ruleSettings);

  return {
    matchday: Number(matchday),
    standings: pointRows.filter((row) => row.tipCount > 0 || row.scoredTipCount > 0),
    matches: visibleMatches.map((match) => {
      const result = resultsByMatch.get(match.id) ?? null;
      const visible = canViewMatchTips(match, now);
      const matchTips = (tips ?? [])
        .filter((tip) => tip.match_id === match.id)
        .map((tip) => {
          const isOwnTip = tip.participant_id === participantId;
          const explanation = explainPointsFor(tip, result, ruleSettings);
          return {
            participantId: tip.participant_id,
            participantName: participantsById.get(tip.participant_id)?.display_name ?? "Teilnehmer",
            isOwnTip,
            visible: visible || isOwnTip,
            scoreA: visible || isOwnTip ? tip.score_a : null,
            scoreB: visible || isOwnTip ? tip.score_b : null,
            points: result?.status === "final" && (visible || isOwnTip) ? explanation.points : null,
            reason: result?.status === "final" && (visible || isOwnTip) ? explanation.reason : null,
          };
        });
      return {
        id: match.id,
        matchday: match.matchday,
        kickoffAt: match.kickoff_at,
        teamA: match.team_a_name,
        teamB: match.team_b_name,
        result,
        status: getBundesligaMatchStatus(match, result, now),
        tipsVisible: visible,
        tips: matchTips,
      };
    }),
  };
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
