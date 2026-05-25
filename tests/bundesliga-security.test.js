import assert from "node:assert/strict";
import test from "node:test";
import {
  BUNDESLIGA_COMPETITION_ID,
  BUNDESLIGA_SEASON_LABEL,
  buildMatchdayLive,
  buildTipTrends,
  canViewMatchTips,
  isBundesligaTipLocked,
} from "../netlify/functions/_shared/bundesliga.js";

const kickoff = "2026-08-21T18:30:00.000Z";
const beforeKickoff = new Date("2026-08-21T18:00:00.000Z");
const afterKickoff = new Date("2026-08-21T18:31:00.000Z");
const match = {
  id: "bl-1",
  matchday: 1,
  kickoff_at: kickoff,
  team_a_name: "FC Bayern München",
  team_b_name: "RB Leipzig",
};
const finalResult = { match_id: match.id, status: "final", score_a: 2, score_b: 1 };

globalThis.Netlify = { env: { get: () => "" } };

function mockQuery(data) {
  return {
    select() { return this; },
    eq() { return this; },
    maybeSingle: async () => ({ data, error: null }),
  };
}

test("live foundation targets a new 2026/27 competition", () => {
  assert.equal(BUNDESLIGA_COMPETITION_ID, "bundesliga-2026");
  assert.equal(BUNDESLIGA_SEASON_LABEL, "2026/2027");
});

test("match tips lock at kickoff independently of public release state", () => {
  assert.equal(isBundesligaTipLocked(match, null, beforeKickoff, "kickoff"), false);
  assert.equal(isBundesligaTipLocked(match, null, afterKickoff, "kickoff"), true);
  assert.equal(isBundesligaTipLocked(match, finalResult, beforeKickoff, "manual"), true);
});

test("foreign tip visibility follows the configured server rule", () => {
  assert.equal(canViewMatchTips(match, null, beforeKickoff, { foreign_tips_visible_from: "kickoff" }), false);
  assert.equal(canViewMatchTips(match, null, afterKickoff, { foreign_tips_visible_from: "kickoff" }), true);
  assert.equal(canViewMatchTips(match, null, afterKickoff, { foreign_tips_visible_from: "match_finished" }), false);
  assert.equal(canViewMatchTips(match, finalResult, afterKickoff, { foreign_tips_visible_from: "match_finished" }), true);
  assert.equal(canViewMatchTips(match, finalResult, afterKickoff, { foreign_tips_visible_from: "never" }), false);
});

test("live payload hides foreign tip existence until visibility opens", () => {
  const participants = [
    { id: "self", display_name: "Daniel" },
    { id: "other", display_name: "Clemens" },
  ];
  const tips = [
    { participant_id: "self", match_id: match.id, score_a: 1, score_b: 0 },
    { participant_id: "other", match_id: match.id, score_a: 2, score_b: 1 },
  ];
  const ruleSettings = { foreign_tips_visible_from: "kickoff" };

  const privateLive = buildMatchdayLive([match], participants, tips, [], "self", 1, beforeKickoff, ruleSettings);
  assert.deepEqual(privateLive.matches[0].tips.map((tip) => tip.participantId), ["self"]);
  assert.deepEqual(privateLive.standings.map((row) => row.participantId), ["self"]);
  assert.deepEqual(buildTipTrends(tips, [match], [], beforeKickoff, ruleSettings), []);

  const visibleLive = buildMatchdayLive([match], participants, tips, [], "self", 1, afterKickoff, ruleSettings);
  assert.deepEqual(visibleLive.matches[0].tips.map((tip) => tip.participantId), ["self", "other"]);
  assert.equal(buildTipTrends(tips, [match], [], afterKickoff, ruleSettings)[0].total, 2);
});

test("preview access and personal requests require a validated code", async () => {
  const {
    requireBundesligaViewAccess,
    resolveBundesligaParticipant,
    resolveRequestedBundesligaCompetition,
  } = await import("../netlify/functions/_shared/bundesliga-access.js");
  assert.equal(resolveRequestedBundesligaCompetition(new Request("http://localhost", {
    headers: { "X-Bundesliga-Competition": "bundesliga-2025" },
  })), "bundesliga-2025");
  assert.equal(resolveRequestedBundesligaCompetition(new Request("http://localhost", {
    headers: { "X-Bundesliga-Competition": "bundesliga-other" },
  })), BUNDESLIGA_COMPETITION_ID);
  const participant = { id: "self", competition_id: BUNDESLIGA_COMPETITION_ID, display_name: "Daniel", invite_code_id: "code-1" };
  const supabase = {
    from(table) {
      return mockQuery(table === "competitions"
        ? { id: BUNDESLIGA_COMPETITION_ID, public_enabled: false }
        : { code: "BL-SECRET", status: "claimed", participant });
    },
  };

  const anonymousRequest = new Request("http://localhost/api/bundesliga-public-data");
  await assert.rejects(
    requireBundesligaViewAccess(anonymousRequest, supabase),
    (error) => error.status === 403,
  );
  await assert.rejects(
    resolveBundesligaParticipant(anonymousRequest, supabase, { required: true }),
    (error) => error.status === 401,
  );

  const authenticatedRequest = new Request("http://localhost/api/bundesliga-tips?participantId=someone-else", {
    headers: { "X-Bundesliga-Code": "BL-SECRET" },
  });
  assert.equal((await resolveBundesligaParticipant(authenticatedRequest, supabase, { required: true })).id, "self");
  assert.equal((await requireBundesligaViewAccess(authenticatedRequest, supabase)).participant.id, "self");

  const mismatchedSupabase = {
    from(table) {
      return mockQuery(table === "competitions"
        ? { id: BUNDESLIGA_COMPETITION_ID, public_enabled: false }
        : { code: "BL-SECRET", status: "claimed", participant: { ...participant, competition_id: "bundesliga-2025" } });
    },
  };
  await assert.rejects(
    resolveBundesligaParticipant(authenticatedRequest, mismatchedSupabase, { required: true }),
    (error) => error.status === 401,
  );
});
