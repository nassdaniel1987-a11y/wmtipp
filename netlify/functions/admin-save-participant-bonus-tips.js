import { requireAdmin } from "./_shared/admin.js";
import { json } from "./_shared/supabase.js";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { supabase } = await requireAdmin(req);
    const { participantId, champion, topScorer, groupWinners } = await req.json();

    if (!participantId) {
      return json({ error: "Teilnehmer fehlt." }, 400);
    }

    const row = {
      participant_id: participantId,
      champion: String(champion || "").trim() || null,
      top_scorer: String(topScorer || "").trim() || null,
      group_winners:
        groupWinners && typeof groupWinners === "object" && !Array.isArray(groupWinners)
          ? groupWinners
          : {},
      saved_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("bonus_tips")
      .upsert(row, { onConflict: "participant_id" })
      .select("participant_id, champion, top_scorer, group_winners, saved_at")
      .single();

    if (error) throw error;
    return json({ bonusTip: data });
  } catch (error) {
    return json({ error: error.message || "Bonus-Tipps konnten nicht gespeichert werden." }, 401);
  }
};

export const config = {
  path: "/api/admin-save-participant-bonus-tips",
};
