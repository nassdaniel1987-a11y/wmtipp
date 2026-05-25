import { getServiceClient, json } from "./_shared/supabase.js";
import { BUNDESLIGA_COMPETITION_ID } from "./_shared/bundesliga.js";
import { bundesligaErrorResponse, resolveBundesligaParticipant } from "./_shared/bundesliga-access.js";

export default async (req) => {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  try {
    const supabase = getServiceClient();
    const participant = await resolveBundesligaParticipant(req, supabase, { required: true });
    const { data, error } = await supabase
      .from("competition_tips")
      .select("match_id, score_a, score_b, saved_at")
      .eq("competition_id", BUNDESLIGA_COMPETITION_ID)
      .eq("participant_id", participant.id);
    if (error) throw error;
    return json({ tips: data ?? [] });
  } catch (error) {
    return bundesligaErrorResponse(error, "Bundesliga-Tipps konnten nicht geladen werden.");
  }
};

export const config = {
  path: "/api/bundesliga-tips",
};
