import { getServiceClient, json } from "./_shared/supabase.js";

export default async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
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
        (row) =>
          !row.match_id ||
          !Number.isInteger(row.score_a) ||
          !Number.isInteger(row.score_b) ||
          row.score_a < 0 ||
          row.score_a > 12 ||
          row.score_b < 0 ||
          row.score_b > 12,
      )
    ) {
      return json({ error: "Mindestens ein Tipp ist ungueltig." }, 400);
    }

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("tips")
      .upsert(rows, { onConflict: "participant_id,match_id" })
      .select("match_id, score_a, score_b, saved_at");

    if (error) throw error;
    return json({ tips: data });
  } catch (error) {
    return json({ error: error.message || "Tipps konnten nicht gespeichert werden." }, 500);
  }
};

export const config = {
  path: "/api/save-tips",
};
