import { requireAdmin } from "./_shared/admin.js";
import { json } from "./_shared/supabase.js";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { supabase } = await requireAdmin(req);
    const { matchId, scoreA, scoreB, status = "final" } = await req.json();
    const row = {
      match_id: matchId,
      score_a: Number(scoreA),
      score_b: Number(scoreB),
      status,
      updated_at: new Date().toISOString(),
    };

    if (
      !row.match_id ||
      !Number.isInteger(row.score_a) ||
      !Number.isInteger(row.score_b) ||
      row.score_a < 0 ||
      row.score_b < 0 ||
      row.score_a > 30 ||
      row.score_b > 30
    ) {
      return json({ error: "Ergebnis ist ungueltig." }, 400);
    }

    const { data, error } = await supabase
      .from("results")
      .upsert(row, { onConflict: "match_id" })
      .select("match_id, score_a, score_b, status, updated_at")
      .single();

    if (error) throw error;
    return json({ result: data });
  } catch (error) {
    return json({ error: error.message || "Ergebnis konnte nicht gespeichert werden." }, 401);
  }
};

export const config = {
  path: "/api/admin-save-result",
};
