import { requireAdmin } from "./_shared/admin.js";
import { json } from "./_shared/supabase.js";
import { TIP_SCORE_MAX, isValidScorePair } from "./_shared/scores.js";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { supabase } = await requireAdmin(req);
    const { participantId, tips } = await req.json();

    if (!participantId || !Array.isArray(tips)) {
      return json({ error: "Teilnehmer und Tipps sind erforderlich." }, 400);
    }

    const rows = tips.map((tip) => ({
      participant_id: participantId,
      match_id: tip.matchId,
      score_a: Number(tip.scoreA),
      score_b: Number(tip.scoreB),
      saved_at: new Date().toISOString(),
    }));

    if (
      rows.some(
        (row) => !row.match_id || !isValidScorePair(row.score_a, row.score_b, TIP_SCORE_MAX),
      )
    ) {
      return json({ error: "Mindestens ein Tipp ist ungültig." }, 400);
    }

    const { data, error } = await supabase
      .from("tips")
      .upsert(rows, { onConflict: "participant_id,match_id" })
      .select("id, participant_id, match_id, score_a, score_b, saved_at");

    if (error) throw error;
    return json({ tips: data });
  } catch (error) {
    return json({ error: error.message || "Tipps konnten nicht gespeichert werden." }, error.status || 500);
  }
};

export const config = {
  path: "/api/admin-save-participant-tips",
};
