export const wmBonusPointValues = {
  champion: 8,
  topScorer: 6,
  groupWinner: 2,
};

export function normalizeWmText(value) {
  return String(value || "").trim().toLocaleLowerCase("de-DE");
}

export function pointsFor(tip, result) {
  if (!result || result.status !== "final") return 0;
  if (tip.score_a === result.score_a && tip.score_b === result.score_b) return 4;

  const tipGoalDiff = tip.score_a - tip.score_b;
  const resultGoalDiff = result.score_a - result.score_b;
  const tipTrend = Math.sign(tipGoalDiff);
  const resultTrend = Math.sign(resultGoalDiff);

  // K.o.-Phase: 90-Min-Remis, im Elfmeterschießen entschieden. Wer den
  // Weiterkommenden richtig getippt hat, bekommt die Tendenz-Punkte (2).
  // Exakt/Differenz bleiben am 90-Min-Ergebnis hängen (oben bereits geprüft).
  if (resultTrend === 0 && (result.winner === "A" || result.winner === "B")) {
    if (tipTrend === 0) return 2; // Remis-Tipp bleibt nach 90 Min korrekt
    const advancingTrend = result.winner === "A" ? 1 : -1;
    return tipTrend === advancingTrend ? 2 : 0;
  }

  if (tipTrend !== resultTrend) return 0;
  if (tipTrend === 0) return 2;
  return tipGoalDiff === resultGoalDiff ? 3 : 2;
}

export function bonusPointsFor(bonusTip, bonusResult) {
  if (!bonusTip || !bonusResult) return 0;

  let points = 0;
  if (normalizeWmText(bonusTip.champion) && normalizeWmText(bonusTip.champion) === normalizeWmText(bonusResult.champion)) {
    points += wmBonusPointValues.champion;
  }

  const officialTopScorerIds = bonusResult.top_scorer_player_ids ?? [];
  if (bonusTip.top_scorer_player_id && officialTopScorerIds.includes(bonusTip.top_scorer_player_id)) {
    points += wmBonusPointValues.topScorer;
  } else if (
    officialTopScorerIds.length === 0 &&
    normalizeWmText(bonusTip.top_scorer) &&
    normalizeWmText(bonusTip.top_scorer) === normalizeWmText(bonusResult.top_scorer)
  ) {
    points += wmBonusPointValues.topScorer;
  }

  const tipGroups = bonusTip.group_winners ?? {};
  const resultGroups = bonusResult.group_winners ?? {};
  Object.entries(resultGroups).forEach(([groupKey, winner]) => {
    if (normalizeWmText(tipGroups[groupKey]) && normalizeWmText(tipGroups[groupKey]) === normalizeWmText(winner)) {
      points += wmBonusPointValues.groupWinner;
    }
  });

  return points;
}

export function withCompetitionRanks(rows, scoreKey = "points") {
  let previousScore = null;
  let previousRank = 0;

  return rows.map((row, index) => {
    const score = row?.[scoreKey] ?? 0;
    const rank = index > 0 && score === previousScore ? previousRank : index + 1;
    previousScore = score;
    previousRank = rank;
    return { ...row, rank };
  });
}

export function buildWmRanking(participants = [], tips = [], results = [], bonusTips = [], bonusResult = null) {
  const resultsByMatch = new Map((results ?? []).map((result) => [result.match_id, result]));
  const bonusTipByParticipant = new Map((bonusTips ?? []).map((tip) => [tip.participant_id, tip]));
  const totals = new Map(
    (participants ?? []).map((participant) => [
      participant.id,
      {
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
    if (result?.status === "final") {
      row.scoredTipCount += 1;
    }
    row.matchPoints += points;
    row.points += points;
  });

  totals.forEach((row, participantId) => {
    const points = bonusPointsFor(bonusTipByParticipant.get(participantId), bonusResult);
    row.bonusPoints = points;
    row.points += points;
    row.averagePoints = row.scoredTipCount > 0 ? row.matchPoints / row.scoredTipCount : 0;
  });

  const sortedRows = Array.from(totals.values()).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  return withCompetitionRanks(sortedRows);
}
