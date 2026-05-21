import { getServiceClient, json } from "./_shared/supabase.js";
import {
  BUNDESLIGA_COMPETITION_ID,
  buildLeagueTable,
} from "./_shared/bundesliga.js";

export default async (req) => {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  try {
    const supabase = getServiceClient();
    const [competition, teams, matches, results, topScorers, bonusResults] = await Promise.all([
      supabase.from("competitions").select("*").eq("id", BUNDESLIGA_COMPETITION_ID).maybeSingle(),
      supabase.from("competition_teams").select("*").eq("competition_id", BUNDESLIGA_COMPETITION_ID).order("name"),
      supabase.from("competition_matches").select("*").eq("competition_id", BUNDESLIGA_COMPETITION_ID).eq("phase", "league").order("match_number"),
      supabase.from("competition_results").select("*").eq("competition_id", BUNDESLIGA_COMPETITION_ID),
      supabase.from("competition_top_scorers").select("*").eq("competition_id", BUNDESLIGA_COMPETITION_ID).order("goals", { ascending: false }).order("display_name"),
      supabase.from("competition_bonus_results").select("*").eq("competition_id", BUNDESLIGA_COMPETITION_ID).maybeSingle(),
    ]);

    for (const response of [competition, teams, matches, results, topScorers, bonusResults]) {
      if (response.error) throw response.error;
    }

    return json({
      competition: competition.data,
      teams: teams.data ?? [],
      matches: matches.data ?? [],
      results: results.data ?? [],
      topScorers: topScorers.data ?? [],
      bonusResults: bonusResults.data ?? null,
      table: buildLeagueTable(matches.data ?? [], results.data ?? [], teams.data ?? []),
    });
  } catch (error) {
    return json({ error: error.message || "Bundesliga-Daten konnten nicht geladen werden." }, 500);
  }
};

export const config = {
  path: "/api/bundesliga-public-data",
};
