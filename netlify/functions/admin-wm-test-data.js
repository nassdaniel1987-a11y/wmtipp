import { requireAdmin } from "./_shared/admin.js";
import { fetchAllPages } from "./_shared/pagination.js";
import { json } from "./_shared/supabase.js";
import { buildWmRanking } from "./_shared/wm-scoring.js";

export function buildWmTestRankingPayload({
  participants = [],
  tips = [],
  liveResults = [],
  testResults = [],
  bonusTips = [],
  liveBonusResults = null,
  testBonusResults = null,
} = {}) {
  const sandboxResults = testResults ?? [];
  const sandboxBonusResults = testBonusResults ?? null;
  return {
    mode: "test",
    participants,
    tips,
    liveResults,
    testResults: sandboxResults,
    bonusTips,
    liveBonusResults,
    testBonusResults: sandboxBonusResults,
    ranking: buildWmRanking(participants, tips, sandboxResults, bonusTips, sandboxBonusResults),
  };
}

export function buildWmTestDataPayloadFromSources({
  participants,
  tips,
  liveResults,
  testResults,
  bonusTips,
  liveBonusResults,
  testBonusResults,
}) {
  return buildWmTestRankingPayload({
    participants: participants.data ?? [],
    tips: tips ?? [],
    liveResults: liveResults.data ?? [],
    testResults: testResults.data ?? [],
    bonusTips: bonusTips ?? [],
    liveBonusResults: liveBonusResults.data ?? null,
    testBonusResults: testBonusResults.data ?? null,
  });
}

export default async (req) => {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  try {
    const { supabase } = await requireAdmin(req);
    const [participants, tips, liveResults, testResults, bonusTips, liveBonusResults, testBonusResults] = await Promise.all([
      supabase.from("participants").select("id, display_name").order("created_at", { ascending: false }),
      fetchAllPages(() => supabase.from("tips").select("id, participant_id, match_id, score_a, score_b, saved_at").order("saved_at", { ascending: false })),
      supabase.from("results").select("match_id, score_a, score_b, status, updated_at"),
      supabase.from("wm_test_results").select("match_id, score_a, score_b, status, updated_at"),
      fetchAllPages(() => supabase.from("bonus_tips").select("participant_id, champion, top_scorer, top_scorer_player_id, group_winners, saved_at").order("saved_at", { ascending: false })),
      supabase.from("bonus_results").select("id, champion, top_scorer, top_scorer_player_ids, group_winners, updated_at").eq("id", "official").maybeSingle(),
      supabase.from("wm_test_bonus_results").select("id, champion, top_scorer, top_scorer_player_ids, group_winners, updated_at").eq("id", "sandbox").maybeSingle(),
    ]);

    for (const response of [participants, liveResults, testResults, liveBonusResults, testBonusResults]) {
      if (response.error) throw response.error;
    }

    return json(buildWmTestDataPayloadFromSources({
      participants,
      tips,
      liveResults,
      testResults,
      bonusTips,
      liveBonusResults,
      testBonusResults,
    }));
  } catch (error) {
    return json({ error: error.message || "WM-Testdaten konnten nicht geladen werden." }, 401);
  }
};

export const config = {
  path: "/api/admin-wm-test-data",
};
