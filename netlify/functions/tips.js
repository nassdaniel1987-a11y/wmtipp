import { getServiceClient, json } from "./_shared/supabase.js";

export default async (req) => {
  if (req.method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const participantId = new URL(req.url).searchParams.get("participantId");
    if (!participantId) return json({ tips: [] });

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("tips")
      .select("match_id, score_a, score_b, saved_at")
      .eq("participant_id", participantId);

    if (error) throw error;
    return json({ tips: data ?? [] });
  } catch (error) {
    return json({ error: error.message || "Tipps konnten nicht geladen werden." }, 500);
  }
};

export const config = {
  path: "/api/tips",
};
