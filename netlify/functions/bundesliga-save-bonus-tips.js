import { getServiceClient, json } from "./_shared/supabase.js";
import { bundesligaErrorResponse, resolveBundesligaParticipant, resolveRequestedBundesligaCompetition } from "./_shared/bundesliga-access.js";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { championTeamId, topScorerId, topScorer, relegatedTeamIds } = await req.json();
    const supabase = getServiceClient();
    const competitionId = resolveRequestedBundesligaCompetition(req);
    const participant = await resolveBundesligaParticipant(req, supabase, { required: true, competitionId });
    const { data: competition, error: competitionError } = await supabase
      .from("competitions")
      .select("bonus_deadline_at")
      .eq("id", competitionId)
      .single();
    if (competitionError) throw competitionError;
    if (competition.bonus_deadline_at && new Date(competition.bonus_deadline_at) <= new Date()) {
      return json({ error: "Die Bundesliga-Bonusfrist ist abgelaufen. Deine Auswahl kann nicht mehr geändert werden." }, 409);
    }
    const topScorerText = String(topScorer || "").trim();
    if (topScorerText.length > 120) {
      return json({ error: "Der Torschützenname ist zu lang." }, 400);
    }
    const selectedTeamIds = [...new Set([
      championTeamId,
      ...(Array.isArray(relegatedTeamIds) ? relegatedTeamIds.slice(0, 3) : []),
    ].filter(Boolean))];
    if (selectedTeamIds.length) {
      const { data: selectedTeams, error: teamError } = await supabase
        .from("competition_teams")
        .select("id")
        .eq("competition_id", competitionId)
        .in("id", selectedTeamIds);
      if (teamError) throw teamError;
      if ((selectedTeams ?? []).length !== selectedTeamIds.length) {
        return json({ error: "Mindestens ein ausgewähltes Team gehört nicht zur aktuellen Bundesliga-Saison." }, 400);
      }
    }
    if (topScorerId) {
      const { data: selectedScorer, error: scorerError } = await supabase
        .from("competition_top_scorers")
        .select("id")
        .eq("competition_id", competitionId)
        .eq("id", topScorerId)
        .maybeSingle();
      if (scorerError) throw scorerError;
      if (!selectedScorer) {
        return json({ error: "Der ausgewählte Torschütze gehört nicht zur aktuellen Bundesliga-Saison." }, 400);
      }
    }
    const row = {
      participant_id: participant.id,
      competition_id: competitionId,
      champion_team_id: championTeamId || null,
      top_scorer_id: topScorerId || null,
      top_scorer: topScorerText || null,
      relegated_team_ids: Array.isArray(relegatedTeamIds) ? [...new Set(relegatedTeamIds)].slice(0, 3) : [],
      saved_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("competition_participant_bonus_tips")
      .upsert(row, { onConflict: "participant_id" })
      .select("*")
      .single();
    if (error) throw error;
    return json({ bonusTip: data });
  } catch (error) {
    return bundesligaErrorResponse(error, "Bundesliga-Bonus konnte nicht gespeichert werden.");
  }
};

export const config = {
  path: "/api/bundesliga-save-bonus-tips",
};
