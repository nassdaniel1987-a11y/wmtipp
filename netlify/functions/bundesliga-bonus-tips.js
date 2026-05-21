import { getServiceClient, json } from "./_shared/supabase.js";
import { BUNDESLIGA_COMPETITION_ID } from "./_shared/bundesliga.js";

export default async (req) => {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  try {
    const participantId = new URL(req.url).searchParams.get("participantId");
    if (!participantId) return json({ bonusTip: null });
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("competition_participant_bonus_tips")
      .select("*")
      .eq("competition_id", BUNDESLIGA_COMPETITION_ID)
      .eq("participant_id", participantId)
      .maybeSingle();
    if (error) throw error;
    return json({ bonusTip: data ?? null });
  } catch (error) {
    return json({ error: error.message || "Bundesliga-Bonus konnte nicht geladen werden." }, 500);
  }
};

export const config = {
  path: "/api/bundesliga-bonus-tips",
};
