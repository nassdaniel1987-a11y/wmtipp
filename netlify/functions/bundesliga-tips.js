import { getServiceClient, json } from "./_shared/supabase.js";
import { BUNDESLIGA_COMPETITION_ID } from "./_shared/bundesliga.js";

export default async (req) => {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  try {
    const participantId = new URL(req.url).searchParams.get("participantId");
    if (!participantId) return json({ tips: [] });

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("competition_tips")
      .select("match_id, score_a, score_b, saved_at")
      .eq("competition_id", BUNDESLIGA_COMPETITION_ID)
      .eq("participant_id", participantId);
    if (error) throw error;
    return json({ tips: data ?? [] });
  } catch (error) {
    return json({ error: error.message || "Bundesliga-Tipps konnten nicht geladen werden." }, 500);
  }
};

export const config = {
  path: "/api/bundesliga-tips",
};
