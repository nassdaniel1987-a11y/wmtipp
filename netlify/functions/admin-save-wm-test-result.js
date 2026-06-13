import { requireAdmin } from "./_shared/admin.js";
import { json } from "./_shared/supabase.js";
import { RESULT_SCORE_MAX, isValidScorePair } from "./_shared/scores.js";

export function toWmTestResultRow(payload = {}) {
  const winner = payload.winner === "A" || payload.winner === "B" ? payload.winner : null;
  const row = {
    match_id: payload.matchId,
    score_a: Number(payload.scoreA),
    score_b: Number(payload.scoreB),
    // Sieger nur bei K.o.-Remis relevant; bei Entscheidung in 90 Min ignoriert.
    winner: Number(payload.scoreA) === Number(payload.scoreB) ? winner : null,
    status: payload.status || "final",
  };

  if (
    !row.match_id ||
    !isValidScorePair(row.score_a, row.score_b, RESULT_SCORE_MAX) ||
    !["scheduled", "live", "final"].includes(row.status)
  ) {
    const error = new Error("Test-Ergebnis ist ungültig.");
    error.status = 400;
    throw error;
  }

  return row;
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { supabase } = await requireAdmin(req);
    const row = {
      ...toWmTestResultRow(await req.json()),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from("wm_test_results")
      .upsert(row, { onConflict: "match_id" })
      .select("match_id, score_a, score_b, winner, status, updated_at")
      .single();

    if (error) throw error;
    return json({ result: data });
  } catch (error) {
    return json({ error: error.message || "Test-Ergebnis konnte nicht gespeichert werden." }, error.status || 500);
  }
};

export const config = {
  path: "/api/admin-save-wm-test-result",
};
