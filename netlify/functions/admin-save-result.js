import { requireAdmin } from "./_shared/admin.js";
import { json } from "./_shared/supabase.js";
import { RESULT_SCORE_MAX, isValidScorePair } from "./_shared/scores.js";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { supabase } = await requireAdmin(req);
    const { matchId, scoreA, scoreB, status = "final", winner = null } = await req.json();
    const normalizedWinner = winner === "A" || winner === "B" ? winner : null;
    const row = {
      match_id: matchId,
      score_a: Number(scoreA),
      score_b: Number(scoreB),
      // Sieger nur bei K.o.-Remis relevant; bei Entscheidung in 90 Min ignoriert.
      winner: Number(scoreA) === Number(scoreB) ? normalizedWinner : null,
      status,
      updated_at: new Date().toISOString(),
    };

    if (!row.match_id || !isValidScorePair(row.score_a, row.score_b, RESULT_SCORE_MAX)) {
      return json({ error: "Ergebnis ist ungültig." }, 400);
    }

    const { data, error } = await supabase
      .from("results")
      .upsert(row, { onConflict: "match_id" })
      .select("match_id, score_a, score_b, winner, status, updated_at")
      .single();

    if (error) throw error;
    return json({ result: data });
  } catch (error) {
    return json({ error: error.message || "Ergebnis konnte nicht gespeichert werden." }, error.status || 500);
  }
};

export const config = {
  path: "/api/admin-save-result",
};
