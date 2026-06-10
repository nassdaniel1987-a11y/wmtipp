import { requireAdmin } from "./_shared/admin.js";
import { json } from "./_shared/supabase.js";

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
    !Number.isInteger(row.score_a) ||
    !Number.isInteger(row.score_b) ||
    row.score_a < 0 ||
    row.score_b < 0 ||
    row.score_a > 30 ||
    row.score_b > 30 ||
    !["scheduled", "live", "final"].includes(row.status)
  ) {
    throw new Error("Test-Ergebnis ist ungültig.");
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
    return json({ error: error.message || "Test-Ergebnis konnte nicht gespeichert werden." }, 401);
  }
};

export const config = {
  path: "/api/admin-save-wm-test-result",
};
