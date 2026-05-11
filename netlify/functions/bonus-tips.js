import { getServiceClient, json } from "./_shared/supabase.js";

export default async (req) => {
  if (req.method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const participantId = new URL(req.url).searchParams.get("participantId");
    if (!participantId) return json({ bonusTip: null });

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("bonus_tips")
      .select("champion, top_scorer, group_winners, saved_at")
      .eq("participant_id", participantId)
      .maybeSingle();

    if (error) throw error;
    return json({ bonusTip: data ?? null });
  } catch (error) {
    return json({ error: error.message || "Bonus-Tipps konnten nicht geladen werden." }, 500);
  }
};

export const config = {
  path: "/api/bonus-tips",
};
