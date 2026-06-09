import assert from "node:assert/strict";
import test from "node:test";
import { generateWmTestResultRows } from "../netlify/functions/_shared/wm-test-results.js";
import { buildWmRanking } from "../netlify/functions/_shared/wm-scoring.js";

test("generateWmTestResultRows erzeugt je Spiel ein finales Ergebnis mit gültigen Toren", () => {
  const rows = generateWmTestResultRows(["m01", "m02", "m03"], {
    random: () => 0.5,
    now: new Date("2026-06-11T00:00:00Z"),
  });

  assert.deepEqual(rows.map((row) => row.match_id), ["m01", "m02", "m03"]);
  for (const row of rows) {
    assert.equal(row.status, "final");
    assert.ok(Number.isInteger(row.score_a) && row.score_a >= 0 && row.score_a <= 4);
    assert.ok(Number.isInteger(row.score_b) && row.score_b >= 0 && row.score_b <= 4);
    assert.equal(row.updated_at, "2026-06-11T00:00:00.000Z");
  }
});

test("generateWmTestResultRows ignoriert leere/ungültige Match-IDs", () => {
  const rows = generateWmTestResultRows(["m01", "", null, undefined, "m02"], { random: () => 0.1 });
  assert.deepEqual(rows.map((row) => row.match_id), ["m01", "m02"]);
});

test("Demo-Ergebnisse treiben das WM-Scoring end-to-end (kein manuelles Eintragen nötig)", () => {
  // random()=0 -> sampleGoals liefert für jeden Aufruf 0 -> alle Ergebnisse 0:0
  const matchIds = ["m01", "m02"];
  const results = generateWmTestResultRows(matchIds, { random: () => 0 });
  assert.ok(results.every((row) => row.score_a === 0 && row.score_b === 0));

  const participants = [{ id: "p1", display_name: "Ada" }];
  const tips = [
    { participant_id: "p1", match_id: "m01", score_a: 0, score_b: 0 }, // exakt -> 4
    { participant_id: "p1", match_id: "m02", score_a: 1, score_b: 0 }, // falsche Tendenz -> 0
  ];

  const ranking = buildWmRanking(participants, tips, results, [], null);
  assert.equal(ranking[0].matchPoints, 4);
  assert.equal(ranking[0].tipCount, 2);
  assert.equal(ranking[0].scoredTipCount, 2);
});
