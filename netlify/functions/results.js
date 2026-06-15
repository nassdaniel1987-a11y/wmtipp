// Public results endpoint shared by web and Android clients.
import { cachedJson, getServiceClient, json } from "./_shared/supabase.js";

export default async (req) => {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("results")
      .select("match_id, score_a, score_b, winner, status, updated_at");

    if (error) throw error;
    return cachedJson({ results: data ?? [] }, 120);
  } catch (error) {
    return json({ error: error.message || "Ergebnisse konnten nicht geladen werden." }, 500);
  }
};

export const config = {
  path: "/api/results",
};
