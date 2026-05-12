import { getServiceClient, json } from "./_shared/supabase.js";

export default async (req) => {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("bonus_results")
      .select("id, champion, top_scorer, group_winners, updated_at")
      .eq("id", "official")
      .maybeSingle();

    if (error) throw error;
    return json({ bonusResults: data ?? null });
  } catch (error) {
    return json({ error: error.message || "Bonus-Ergebnisse konnten nicht geladen werden." }, 500);
  }
};

export const config = {
  path: "/api/bonus-results",
};
