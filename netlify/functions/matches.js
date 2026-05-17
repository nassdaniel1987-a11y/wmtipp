// Public schedule endpoint shared by web and Android clients.
import { getServiceClient, json } from "./_shared/supabase.js";

export default async (req) => {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("matches")
      .select("id, match_number, phase, group_key, kickoff_at, match_date, match_time, team_a, team_b, flag_code_a, flag_code_b, venue, city, status")
      .order("match_number", { ascending: true });

    if (error) throw error;
    return json({ matches: data ?? [] });
  } catch (error) {
    return json({ error: error.message || "Spiele konnten nicht geladen werden." }, 500);
  }
};

export const config = {
  path: "/api/matches",
};
