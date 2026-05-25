import { getServiceClient, json } from "./_shared/supabase.js";
import { bundesligaErrorResponse, resolveBundesligaParticipant, resolveRequestedBundesligaCompetition } from "./_shared/bundesliga-access.js";

export default async (req) => {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  try {
    const supabase = getServiceClient();
    const competitionId = resolveRequestedBundesligaCompetition(req);
    const participant = await resolveBundesligaParticipant(req, supabase, { required: true, competitionId });
    const { data, error } = await supabase
      .from("competition_participant_bonus_tips")
      .select("*")
      .eq("competition_id", competitionId)
      .eq("participant_id", participant.id)
      .maybeSingle();
    if (error) throw error;
    return json({ bonusTip: data ?? null });
  } catch (error) {
    return bundesligaErrorResponse(error, "Bundesliga-Bonus konnte nicht geladen werden.");
  }
};

export const config = {
  path: "/api/bundesliga-bonus-tips",
};
