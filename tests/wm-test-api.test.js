import assert from "node:assert/strict";
import test from "node:test";

globalThis.Netlify = { env: { get: () => "" } };

const [
  adminWmTestData,
  adminSaveWmTestResult,
  adminSaveWmTestBonusResults,
  adminResetWmTest,
] = await Promise.all([
  import("../netlify/functions/admin-wm-test-data.js"),
  import("../netlify/functions/admin-save-wm-test-result.js"),
  import("../netlify/functions/admin-save-wm-test-bonus-results.js"),
  import("../netlify/functions/admin-reset-wm-test.js"),
]);

async function readJson(response) {
  return response.json();
}

test("WM test endpoints require admin authentication", async () => {
  const getRequest = new Request("http://localhost/api/admin-wm-test-data");
  const postRequest = new Request("http://localhost/api/admin-save-wm-test-result", {
    method: "POST",
    body: JSON.stringify({}),
  });

  for (const handler of [
    adminWmTestData.default,
    adminSaveWmTestResult.default,
    adminSaveWmTestBonusResults.default,
    adminResetWmTest.default,
  ]) {
    const response = await handler(handler === adminWmTestData.default ? getRequest : postRequest);
    assert.equal(response.status, 401);
    assert.match((await readJson(response)).error, /Admin-Login/);
  }
});

test("WM test data ranks real tips with sandbox results", () => {
  const ranking = adminWmTestData.buildWmTestRankingPayload({
    participants: [{ id: "p1", display_name: "Ada" }],
    tips: [{ participant_id: "p1", match_id: "m1", score_a: 2, score_b: 1 }],
    liveResults: [{ match_id: "m1", score_a: 0, score_b: 0, status: "final" }],
    testResults: [{ match_id: "m1", score_a: 2, score_b: 1, status: "final" }],
    bonusTips: [],
    liveBonusResults: { id: "official", champion: "Live", top_scorer_player_ids: [], group_winners: {} },
    testBonusResults: null,
  }).ranking;

  assert.equal(ranking[0].name, "Ada");
  assert.equal(ranking[0].matchPoints, 4);
});

test("WM test result payload is validated and normalized", () => {
  assert.deepEqual(adminSaveWmTestResult.toWmTestResultRow({ matchId: "m1", scoreA: "3", scoreB: 2 }), {
    match_id: "m1",
    score_a: 3,
    score_b: 2,
    status: "final",
  });
  assert.throws(() => adminSaveWmTestResult.toWmTestResultRow({ matchId: "m1", scoreA: -1, scoreB: 2 }), /ungültig/);
});
