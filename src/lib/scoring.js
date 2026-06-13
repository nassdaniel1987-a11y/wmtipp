// Geteilte Punkte-/Bonuslogik fuer WM und Bundesliga (reine Funktionen).

export const bonusPointValues = {
  champion: 8,
  topScorer: 6,
  groupWinner: 2,
};

export function isCompleteTip(tip) {
  return Number.isInteger(tip?.scoreA) && Number.isInteger(tip?.scoreB);
}

export function pointsFor(tip, result) {
  if (!isCompleteTip(tip)) return 0;
  if (!result || result.status !== "final") return 0;
  if (tip.scoreA === result.score_a && tip.scoreB === result.score_b) return 4;
  const tipGoalDiff = tip.scoreA - tip.scoreB;
  const resultGoalDiff = result.score_a - result.score_b;
  const tipTrend = Math.sign(tipGoalDiff);
  const resultTrend = Math.sign(resultGoalDiff);

  // K.o.-Phase: 90-Min-Remis per Elfmeterschießen entschieden. Wer den
  // Weiterkommenden richtig getippt hat, bekommt die Tendenz-Punkte (2).
  if (resultTrend === 0 && (result.winner === "A" || result.winner === "B")) {
    if (tipTrend === 0) return 2;
    const advancingTrend = result.winner === "A" ? 1 : -1;
    return tipTrend === advancingTrend ? 2 : 0;
  }

  if (tipTrend !== resultTrend) return 0;
  if (tipTrend === 0) return 2;
  return tipGoalDiff === resultGoalDiff ? 3 : 2;
}

export function explainBundesligaPoints(tip, result) {
  if (!isCompleteTip(tip)) return { points: 0, reason: "kein Tipp abgegeben" };
  if (!result || result.status !== "final") return { points: 0, reason: "noch nicht ausgewertet" };
  const points = pointsFor(tip, result);
  if (tip.scoreA === result.score_a && tip.scoreB === result.score_b) return { points, reason: `exakt getroffen: ${points} Punkte` };
  const tipGoalDiff = tip.scoreA - tip.scoreB;
  const resultGoalDiff = result.score_a - result.score_b;
  const tipTrend = Math.sign(tipGoalDiff);
  const resultTrend = Math.sign(resultGoalDiff);
  if (tipTrend !== resultTrend) return { points: 0, reason: "falsch: 0 Punkte" };
  if (tipTrend === 0) return { points, reason: `Tendenz richtig: ${points} Punkte` };
  return tipGoalDiff === resultGoalDiff
    ? { points, reason: `Tordifferenz richtig: ${points} Punkte` }
    : { points, reason: `Tendenz richtig: ${points} Punkte` };
}

export function normalizeText(value) {
  return String(value || "").trim().toLocaleLowerCase("de-DE");
}

export function bonusPointsFor(bonusTip, bonusResult) {
  if (!bonusTip || !bonusResult) return 0;
  let points = 0;
  if (normalizeText(bonusTip.champion) && normalizeText(bonusTip.champion) === normalizeText(bonusResult.champion)) {
    points += bonusPointValues.champion;
  }
  if (
    bonusTip.topScorerPlayerId &&
    (bonusResult.topScorerPlayerIds ?? []).includes(bonusTip.topScorerPlayerId)
  ) {
    points += bonusPointValues.topScorer;
  } else if (
    (bonusResult.topScorerPlayerIds ?? []).length === 0 &&
    normalizeText(bonusTip.topScorer) &&
    normalizeText(bonusTip.topScorer) === normalizeText(bonusResult.topScorer)
  ) {
    points += bonusPointValues.topScorer;
  }

  Object.entries(bonusResult.groupWinners ?? {}).forEach(([groupKey, winner]) => {
    if (normalizeText(bonusTip.groupWinners?.[groupKey]) && normalizeText(bonusTip.groupWinners?.[groupKey]) === normalizeText(winner)) {
      points += bonusPointValues.groupWinner;
    }
  });
  return points;
}

export function areBonusTipsEqual(first, second) {
  if (!first || !second) return false;
  if ((first.champion ?? "") !== (second.champion ?? "")) return false;
  if ((first.topScorer ?? "") !== (second.topScorer ?? "")) return false;
  if ((first.topScorerPlayerId ?? "") !== (second.topScorerPlayerId ?? "")) return false;

  const firstWinners = first.groupWinners ?? {};
  const secondWinners = second.groupWinners ?? {};
  const groupKeys = new Set([...Object.keys(firstWinners), ...Object.keys(secondWinners)]);
  return [...groupKeys].every((groupKey) => (firstWinners[groupKey] ?? "") === (secondWinners[groupKey] ?? ""));
}

export function getGroupLeaderSuggestions(groupTables) {
  return Object.fromEntries(
    groupTables.map((group) => [group.groupKey, group.rows[0]?.team ?? ""]),
  );
}
