import { requireAdmin } from "./_shared/admin.js";
import { json } from "./_shared/supabase.js";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { supabase } = await requireAdmin(req);
    const { topScorerText, playerId } = await req.json();
    const cleanText = String(topScorerText || "").trim();
    if (!cleanText || !playerId) return json({ error: "Name und Spieler fehlen." }, 400);

    const { data: player, error: playerError } = await supabase
      .from("players")
      .select("id, display_name")
      .eq("id", playerId)
      .single();
    if (playerError) throw playerError;

    const { data, error } = await supabase
      .from("bonus_tips")
      .update({ top_scorer_player_id: player.id, top_scorer: player.display_name })
      .ilike("top_scorer", cleanText)
      .select("participant_id, champion, top_scorer, top_scorer_player_id, group_winners, saved_at");

    if (error) throw error;
    return json({ bonusTips: data ?? [] });
  } catch (error) {
    return json({ error: error.message || "Torschützen-Tipps konnten nicht zugeordnet werden." }, 401);
  }
};

export const config = {
  path: "/api/admin-map-top-scorer",
};
