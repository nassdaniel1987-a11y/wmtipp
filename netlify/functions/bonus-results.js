import { cachedJson, getServiceClient, json } from "./_shared/supabase.js";

export default async (req) => {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("bonus_results")
      .select("id, champion, top_scorer, top_scorer_player_ids, group_winners, updated_at")
      .eq("id", "official")
      .maybeSingle();

    if (error) throw error;
    return cachedJson({ bonusResults: data ?? null }, 300);
  } catch (error) {
    return json({ error: error.message || "Bonus-Ergebnisse konnten nicht geladen werden." }, 500);
  }
};

export const config = {
  path: "/api/bonus-results",
};
