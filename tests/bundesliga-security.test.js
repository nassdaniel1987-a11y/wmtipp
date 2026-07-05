import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  BUNDESLIGA_ARCHIVE_SHOWCASE_PARTICIPANT_NAME,
  BUNDESLIGA_COMPETITION_ID,
  BUNDESLIGA_RETIRED_LIVE_PROBE_COMPETITION_ID,
  BUNDESLIGA_SEASON_LABEL,
  buildCompetitionRanking,
  buildBundesligaMatchDetail,
  buildBundesligaRulesSummary,
  buildMatchdayLive,
  buildTipTrends,
  canViewMatchTips,
  isBundesligaTipLocked,
  isBundesligaCompetitionId,
  normalizeTeamLogoUrl,
  normalizeOpenLigaMatch,
} from "../netlify/functions/_shared/bundesliga.js";
import {
  mergeOpenLigaMatchDetail,
  needsOpenLigaMatchDetail,
  preserveKnownGoalScorer,
  selectHybridLiveResult,
  summarizeHybridObservation,
} from "../netlify/functions/_shared/bundesliga-live-sync.js";

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

test("regular relegation matches use the active season live path", () => {
  const normalized = normalizeOpenLigaMatch({
    matchID: 81659,
    matchDateTimeUTC: "2026-05-25T18:30:00.000Z",
    matchIsFinished: false,
    team1: { teamId: 1, teamName: "SC Paderborn 07" },
    team2: { teamId: 2, teamName: "VfL Wolfsburg" },
    goals: [{ goalID: 1, goalGetterName: "Dženan Pejcinovic", matchMinute: 3, scoreTeam1: 0, scoreTeam2: 1 }],
  }, "rel", 0, {
    competitionId: BUNDESLIGA_COMPETITION_ID,
    matchdayOverride: 35,
    now: new Date("2026-05-25T18:45:00.000Z"),
  });
  assert.equal(normalized.matchRow.competition_id, BUNDESLIGA_COMPETITION_ID);
  assert.equal(normalized.matchRow.phase, "relegation");
  assert.equal(normalized.matchRow.matchday, 35);
  assert.equal(normalized.resultRow.status, "live");
  assert.deepEqual([normalized.resultRow.score_a, normalized.resultRow.score_b], [0, 1]);
  assert.equal(normalized.goals[0].scorer_name, "Dženan Pejcinovic");
});

test("completed live probe is no longer an accepted preview competition", () => {
  assert.equal(BUNDESLIGA_RETIRED_LIVE_PROBE_COMPETITION_ID, "bundesliga-liveprobe-rel-2026");
  assert.equal(isBundesligaCompetitionId(BUNDESLIGA_RETIRED_LIVE_PROBE_COMPETITION_ID), false);
});

test("Bundesliga team logos fall back by team name when source rows are empty", () => {
  const missingLogoTeams = [
    "1. FC Union Berlin",
    "Bayer 04 Leverkusen",
    "Borussia Mönchengladbach",
    "Eintracht Frankfurt",
    "FC Augsburg",
    "RB Leipzig",
    "SC Freiburg",
    "TSG Hoffenheim",
    "VfB Stuttgart",
  ];

  for (const teamName of missingLogoTeams) {
    assert.match(normalizeTeamLogoUrl(null, teamName), /^https:\/\//, teamName);
  }
});

test("Netlify CSP allows the Bundesliga logo fallback sources", () => {
  const netlifyConfig = readFileSync(new URL("../netlify.toml", import.meta.url), "utf8");
  for (const host of [
    "https://upload.wikimedia.org",
    "https://assets.dfb.de",
    "https://www.bundesliga-reisefuehrer.de",
    "https://i.imgur.com",
  ]) {
    assert.match(netlifyConfig, new RegExp(host.replaceAll(".", "\\.")));
  }
});

test("goal refresh upgrades unknown scorers and never downgrades known names", () => {
  assert.equal(
    preserveKnownGoalScorer({ scorer_name: "Dženan Pejcinovic", scorer_external_id: "24380" }, { scorer_name: "Unbekannt" }).scorer_name,
    "Dženan Pejcinovic",
  );
  assert.equal(
    preserveKnownGoalScorer({ scorer_name: "Unbekannt", scorer_external_id: null }, { scorer_name: "Dženan Pejcinovic", scorer_external_id: "24380" }).scorer_name,
    "Dženan Pejcinovic",
  );
});

test("live sync enriches unnamed league-feed goals from OpenLigaDB match detail", () => {
  const leagueFeedMatch = {
    matchID: 81659,
    goals: [
      { goalID: 143106, matchMinute: 3, goalGetterID: 24380, goalGetterName: "", scoreTeam1: 0, scoreTeam2: 1 },
      { goalID: 143107, matchMinute: 39, goalGetterID: 20074, goalGetterName: "", scoreTeam1: 1, scoreTeam2: 1 },
    ],
  };
  const matchDetail = {
    ...leagueFeedMatch,
    goals: [
      { ...leagueFeedMatch.goals[0], goalGetterName: "Dženan Pejcinovic" },
      { ...leagueFeedMatch.goals[1], goalGetterName: "Filip Bilbija" },
    ],
  };
  assert.equal(needsOpenLigaMatchDetail(leagueFeedMatch), true);
  assert.deepEqual(
    mergeOpenLigaMatchDetail(leagueFeedMatch, matchDetail).goals.map((goal) => goal.goalGetterName),
    ["Dženan Pejcinovic", "Filip Bilbija"],
  );
});

test("free hybrid uses football-data only as live fallback and confirms matching final scores", () => {
  const openLive = { match_id: "m", competition_id: BUNDESLIGA_COMPETITION_ID, score_a: 1, score_b: 0, status: "live" };
  const footballLive = { match_id: "m", competition_id: BUNDESLIGA_COMPETITION_ID, score_a: 0, score_b: 1, status: "live" };
  const primary = selectHybridLiveResult(openLive, footballLive, { footballDataConfigured: true });
  assert.equal(primary.live_source, "openligadb");
  assert.equal(primary.verification_status, "primary_live");

  const fallback = selectHybridLiveResult(null, footballLive, { footballDataConfigured: true });
  assert.equal(fallback.live_source, "football-data");
  assert.equal(fallback.verification_status, "fallback_live");

  const openFinal = { ...openLive, score_a: 2, score_b: 1, status: "final" };
  const matchingFinal = { ...footballLive, score_a: 2, score_b: 1, status: "final" };
  const confirmed = selectHybridLiveResult(openFinal, matchingFinal, { footballDataConfigured: true });
  assert.equal(confirmed.status, "final");
  assert.equal(confirmed.verification_status, "confirmed");
  assert.equal(summarizeHybridObservation(openFinal, matchingFinal, confirmed, true), "stimmt_ueberein");

  const conflictingFinal = selectHybridLiveResult(openFinal, { ...matchingFinal, score_b: 2 }, { footballDataConfigured: true });
  assert.equal(conflictingFinal.status, "live");
  assert.equal(conflictingFinal.verification_status, "conflict");
  assert.equal(summarizeHybridObservation(openFinal, matchingFinal, conflictingFinal, true), "abweichend");

  const openLigaOnly = selectHybridLiveResult(openFinal, null, { footballDataConfigured: false });
  assert.equal(openLigaOnly.status, "final");
  assert.equal(openLigaOnly.verification_status, "single_source");
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

test("rules summary exposes the configured community visibility", () => {
  const kickoffRules = buildBundesligaRulesSummary({ foreign_tips_visible_from: "kickoff" });
  const finishedRules = buildBundesligaRulesSummary({ foreign_tips_visible_from: "match_finished" });
  const privateRules = buildBundesligaRulesSummary({ foreign_tips_visible_from: "never" });

  assert.equal(kickoffRules.visibilityMode, "kickoff");
  assert.match(kickoffRules.visibility, /ab Anpfiff/);
  assert.equal(finishedRules.visibilityMode, "match_finished");
  assert.match(finishedRules.visibility, /nach Abpfiff/);
  assert.equal(privateRules.visibilityMode, "never");
  assert.match(privateRules.visibility, /verborgen/);
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

test("live result exposes provisional points but ranking remains final only", () => {
  const participants = [{ id: "self", display_name: "Daniel" }];
  const tips = [{ participant_id: "self", match_id: match.id, score_a: 2, score_b: 1 }];
  const liveResult = { match_id: match.id, status: "live", score_a: 2, score_b: 1, updated_at: "2026-08-21T18:40:00.000Z" };
  const rules = { foreign_tips_visible_from: "kickoff", exact_score_points: 4, goal_diff_points: 3, tendency_points: 2 };
  const live = buildMatchdayLive([match], participants, tips, [liveResult], "self", 1, afterKickoff, rules, [
    { id: "goal", match_id: match.id, minute: 10, scorer_name: "Test", is_penalty: false, is_own_goal: false },
  ]);
  assert.equal(live.matches[0].status, "live");
  assert.equal(live.matches[0].tips[0].points, 4);
  assert.equal(live.matches[0].tips[0].provisional, true);
  assert.match(live.matches[0].tips[0].reason, /vorläufig/);
  assert.equal(live.matches[0].goals[0].scorerName, "Test");

  const ranking = buildCompetitionRanking(participants, tips, [liveResult], [], null, [], [match], rules);
  assert.equal(ranking[0].points, 0);
  assert.equal(ranking[0].scoredTipCount, 0);
});

test("football-data live fallback exposes a neutral pending-goals state", () => {
  const live = buildMatchdayLive([match], [{ id: "self", display_name: "Daniel" }], [], [{
    match_id: match.id,
    status: "live",
    score_a: 0,
    score_b: 1,
    verification_status: "fallback_live",
  }], "self", 1, afterKickoff, { foreign_tips_visible_from: "kickoff" }, []);
  assert.equal(live.matches[0].goalsPending, true);
  assert.equal(live.matches[0].isFallbackLive, true);
});

test("finished match detail respects tip visibility and derives goal sides", () => {
  const participants = [
    { id: "self", display_name: "Daniel" },
    { id: "other", display_name: "Clemens" },
  ];
  const tips = [
    { participant_id: "self", match_id: match.id, score_a: 2, score_b: 1 },
    { participant_id: "other", match_id: match.id, score_a: 1, score_b: 1 },
  ];
  const goals = [
    { id: "goal-1", minute: 12, scorer_name: "Kane", team_side: null, source_json: { scoreTeam1: 1, scoreTeam2: 0 } },
    { id: "goal-2", minute: 64, scorer_name: "Sesko", team_side: null, source_json: { scoreTeam1: 1, scoreTeam2: 1 } },
  ];

  const privateDetail = buildBundesligaMatchDetail(match, finalResult, goals, participants, tips, "self", afterKickoff, {
    foreign_tips_visible_from: "never",
    exact_score_points: 4,
    goal_diff_points: 3,
    tendency_points: 2,
  });
  assert.deepEqual(privateDetail.tips.map((tip) => tip.participantId), ["self"]);
  assert.equal(privateDetail.ownTip.points, 4);
  assert.equal(privateDetail.ownTip.reason, "exakt getroffen: 4 Punkte");
  assert.equal(privateDetail.trend.total, 1);
  assert.deepEqual(privateDetail.goals.map((goal) => goal.teamSide), ["home", "away"]);

  const visibleDetail = buildBundesligaMatchDetail(match, finalResult, goals, participants, tips, "self", afterKickoff, {
    foreign_tips_visible_from: "match_finished",
    exact_score_points: 4,
    goal_diff_points: 3,
    tendency_points: 2,
  });
  assert.deepEqual(visibleDetail.tips.map((tip) => tip.participantId), ["self", "other"]);
  assert.equal(visibleDetail.trend.total, 2);
  assert.equal(buildBundesligaMatchDetail(match, null, goals, participants, tips, "self", afterKickoff), null);
});

test("preview access and personal requests require a validated code", async () => {
  const {
    filterBundesligaArchiveShowcaseParticipants,
    requireBundesligaWriteCompetition,
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
  assert.throws(
    () => requireBundesligaWriteCompetition(new Request("http://localhost", {
      headers: { "X-Bundesliga-Competition": "bundesliga-2025" },
    })),
    (error) => error.status === 409 && /Archivvorschau/.test(error.message),
  );
  assert.equal(requireBundesligaWriteCompetition(new Request("http://localhost")), BUNDESLIGA_COMPETITION_ID);
  assert.throws(
    () => requireBundesligaWriteCompetition(new Request("http://localhost", {
      headers: { "X-Bundesliga-Competition": BUNDESLIGA_RETIRED_LIVE_PROBE_COMPETITION_ID },
    })),
    (error) => error.status === 410 && /abgeschlossen/.test(error.message),
  );
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

  const archiveParticipant = { ...participant, competition_id: "bundesliga-2025" };
  const archiveSupabase = {
    from(table) {
      return mockQuery(table === "competitions"
        ? { id: "bundesliga-2025", public_enabled: false }
        : { code: "BL-ARCHIVE", status: "claimed", participant: archiveParticipant });
    },
  };
  const archiveRequest = new Request("http://localhost/api/bundesliga-public-data", {
    headers: {
      "X-Bundesliga-Code": "BL-ARCHIVE",
      "X-Bundesliga-Competition": "bundesliga-2025",
    },
  });
  assert.equal((await requireBundesligaViewAccess(archiveRequest, archiveSupabase)).participant.id, "self");

  const archiveShowcaseParticipant = {
    id: "archive-showcase",
    competition_id: "bundesliga-2025",
    display_name: BUNDESLIGA_ARCHIVE_SHOWCASE_PARTICIPANT_NAME,
    invite_code_id: null,
  };
  const anonymousArchiveSupabase = {
    from(table) {
      return mockQuery(table === "competitions"
        ? { id: "bundesliga-2025", public_enabled: false }
        : archiveShowcaseParticipant);
    },
  };
  const anonymousArchiveRequest = new Request("http://localhost/api/bundesliga-public-data", {
    headers: { "X-Bundesliga-Competition": "bundesliga-2025" },
  });
  const anonymousArchiveAccess = await requireBundesligaViewAccess(anonymousArchiveRequest, anonymousArchiveSupabase);
  assert.equal(anonymousArchiveAccess.participant.id, "archive-showcase");
  assert.equal(anonymousArchiveAccess.participant.showcase, true);
  assert.deepEqual(
    filterBundesligaArchiveShowcaseParticipants([
      { id: "archive-showcase", display_name: BUNDESLIGA_ARCHIVE_SHOWCASE_PARTICIPANT_NAME },
      { id: "private-archive-test-user", display_name: "Alter Testnutzer" },
    ], "bundesliga-2025", anonymousArchiveAccess.participant).map((row) => row.id),
    ["archive-showcase"],
  );

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
