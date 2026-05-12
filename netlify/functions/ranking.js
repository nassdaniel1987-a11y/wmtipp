import { getServiceClient, json } from "./_shared/supabase.js";

const bonusPointValues = {
  champion: 8,
  topScorer: 6,
  groupWinner: 2,
};

function normalize(value) {
  return String(value || "").trim().toLocaleLowerCase("de-DE");
}

function pointsFor(tip, result) {
  if (!result || result.status !== "final") return 0;
  if (tip.score_a === result.score_a && tip.score_b === result.score_b) return 4;

  const tipGoalDiff = tip.score_a - tip.score_b;
  const resultGoalDiff = result.score_a - result.score_b;
  const tipTrend = Math.sign(tipGoalDiff);
  const resultTrend = Math.sign(resultGoalDiff);
  if (tipTrend !== resultTrend) return 0;
  if (tipGoalDiff === resultGoalDiff) return 3;

  return 2;
}

function bonusPointsFor(bonusTip, bonusResult) {
  if (!bonusTip || !bonusResult) return 0;

  let points = 0;
  if (normalize(bonusTip.champion) && normalize(bonusTip.champion) === normalize(bonusResult.champion)) {
    points += bonusPointValues.champion;
  }
  if (normalize(bonusTip.top_scorer) && normalize(bonusTip.top_scorer) === normalize(bonusResult.top_scorer)) {
    points += bonusPointValues.topScorer;
  }

  const tipGroups = bonusTip.group_winners ?? {};
  const resultGroups = bonusResult.group_winners ?? {};
  Object.entries(resultGroups).forEach(([groupKey, winner]) => {
    if (normalize(tipGroups[groupKey]) && normalize(tipGroups[groupKey]) === normalize(winner)) {
      points += bonusPointValues.groupWinner;
    }
  });

  return points;
}

export default async (req) => {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  try {
    const supabase = getServiceClient();
    const [participants, tips, results, bonusTips, bonusResults] = await Promise.all([
      supabase.from("participants").select("id, display_name"),
      supabase.from("tips").select("participant_id, match_id, score_a, score_b"),
      supabase.from("results").select("match_id, score_a, score_b, status"),
      supabase.from("bonus_tips").select("participant_id, champion, top_scorer, group_winners"),
      supabase.from("bonus_results").select("id, champion, top_scorer, group_winners").eq("id", "official").maybeSingle(),
    ]);

    for (const response of [participants, tips, results, bonusTips, bonusResults]) {
      if (response.error) throw response.error;
    }

    const resultsByMatch = new Map((results.data ?? []).map((result) => [result.match_id, result]));
    const bonusTipByParticipant = new Map((bonusTips.data ?? []).map((tip) => [tip.participant_id, tip]));
    const officialBonusResult = bonusResults.data ?? null;
    const totals = new Map(
      (participants.data ?? []).map((participant) => [
        participant.id,
        { name: participant.display_name, points: 0, matchPoints: 0, bonusPoints: 0 },
      ]),
    );

    (tips.data ?? []).forEach((tip) => {
      const row = totals.get(tip.participant_id);
      if (!row) return;
      const points = pointsFor(tip, resultsByMatch.get(tip.match_id));
      row.matchPoints += points;
      row.points += points;
    });

    totals.forEach((row, participantId) => {
      const points = bonusPointsFor(bonusTipByParticipant.get(participantId), officialBonusResult);
      row.bonusPoints = points;
      row.points += points;
    });

    const ranking = Array.from(totals.values()).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
    return json({ ranking });
  } catch (error) {
    return json({ error: error.message || "Rangliste konnte nicht geladen werden." }, 500);
  }
};

export const config = {
  path: "/api/ranking",
};
