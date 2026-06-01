import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWmRanking,
  bonusPointsFor,
  pointsFor,
} from "../netlify/functions/_shared/wm-scoring.js";

test("WM points ignore missing and non-final results", () => {
  assert.equal(pointsFor({ score_a: 2, score_b: 1 }, null), 0);
  assert.equal(pointsFor({ score_a: 2, score_b: 1 }, { score_a: 2, score_b: 1, status: "live" }), 0);
});

test("WM points award exact score, goal difference, tendency and draw tendency", () => {
  assert.equal(pointsFor({ score_a: 2, score_b: 1 }, { score_a: 2, score_b: 1, status: "final" }), 4);
  assert.equal(pointsFor({ score_a: 3, score_b: 1 }, { score_a: 2, score_b: 0, status: "final" }), 3);
  assert.equal(pointsFor({ score_a: 1, score_b: 0 }, { score_a: 3, score_b: 1, status: "final" }), 2);
  assert.equal(pointsFor({ score_a: 1, score_b: 1 }, { score_a: 2, score_b: 2, status: "final" }), 2);
  assert.equal(pointsFor({ score_a: 0, score_b: 1 }, { score_a: 2, score_b: 1, status: "final" }), 0);
});

test("WM bonus points use mapped top scorer ids before text fallback", () => {
  const bonusResult = {
    champion: "Deutschland",
    top_scorer: "Text Treffer",
    top_scorer_player_ids: ["player-1"],
    group_winners: { A: "Deutschland", B: "Brasilien" },
  };

  assert.equal(
    bonusPointsFor(
      {
        champion: "Deutschland",
        top_scorer: "Anderer Text",
        top_scorer_player_id: "player-1",
        group_winners: { A: "Deutschland", B: "Argentinien" },
      },
      bonusResult,
    ),
    16,
  );
});

test("WM ranking can be built from either live or sandbox results with identical scoring", () => {
  const participants = [
    { id: "p1", display_name: "Ada" },
    { id: "p2", display_name: "Ben" },
  ];
  const tips = [
    { participant_id: "p1", match_id: "m1", score_a: 2, score_b: 1 },
    { participant_id: "p1", match_id: "m2", score_a: 1, score_b: 1 },
    { participant_id: "p2", match_id: "m1", score_a: 0, score_b: 1 },
  ];
  const results = [
    { match_id: "m1", score_a: 2, score_b: 1, status: "final" },
    { match_id: "m2", score_a: 3, score_b: 3, status: "live" },
  ];
  const bonusTips = [
    { participant_id: "p1", champion: "Deutschland", top_scorer: "", top_scorer_player_id: null, group_winners: { A: "Deutschland" } },
  ];
  const bonusResult = { champion: "Deutschland", top_scorer: null, top_scorer_player_ids: [], group_winners: { A: "Deutschland" } };

  assert.deepEqual(buildWmRanking(participants, tips, results, bonusTips, bonusResult), [
    { name: "Ada", points: 14, matchPoints: 4, bonusPoints: 10, tipCount: 2, scoredTipCount: 1, averagePoints: 4 },
    { name: "Ben", points: 0, matchPoints: 0, bonusPoints: 0, tipCount: 1, scoredTipCount: 1, averagePoints: 0 },
  ]);
});
