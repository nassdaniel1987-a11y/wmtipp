import { getServiceClient, json } from "./_shared/supabase.js";

export default async (req) => {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("players")
      .select("id, display_name, team_name, aliases, active")
      .eq("active", true)
      .order("display_name");

    if (error) throw error;
    return json({ players: data ?? [] });
  } catch (error) {
    return json({ error: error.message || "Spielerliste konnte nicht geladen werden." }, 500);
  }
};

export const config = {
  path: "/api/players",
};
