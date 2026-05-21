import { getServiceClient, json } from "./_shared/supabase.js";
import { BUNDESLIGA_COMPETITION_ID } from "./_shared/bundesliga.js";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { participantId, championTeamId, topScorerId, topScorer, relegatedTeamIds } = await req.json();
    if (!participantId) return json({ error: "Teilnehmer fehlt." }, 400);
    const row = {
      participant_id: participantId,
      competition_id: BUNDESLIGA_COMPETITION_ID,
      champion_team_id: championTeamId || null,
      top_scorer_id: topScorerId || null,
      top_scorer: String(topScorer || "").trim() || null,
      relegated_team_ids: Array.isArray(relegatedTeamIds) ? relegatedTeamIds.slice(0, 3) : [],
      saved_at: new Date().toISOString(),
    };

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("competition_participant_bonus_tips")
      .upsert(row, { onConflict: "participant_id" })
      .select("*")
      .single();
    if (error) throw error;
    return json({ bonusTip: data });
  } catch (error) {
    return json({ error: error.message || "Bundesliga-Bonus konnte nicht gespeichert werden." }, 500);
  }
};

export const config = {
  path: "/api/bundesliga-save-bonus-tips",
};
