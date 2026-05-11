import { requireAdmin } from "./_shared/admin.js";
import { json } from "./_shared/supabase.js";

export default async (req) => {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  try {
    const { supabase } = await requireAdmin(req);
    const [codes, participants, tips, bonusTips, results] = await Promise.all([
      supabase
        .from("invite_codes")
        .select("id, code, status, claimed_at, participant:participants!invite_codes_participant_id_fkey(id, display_name)")
        .order("created_at", { ascending: false }),
      supabase
        .from("participants")
        .select("id, display_name, created_at, invite_code_id")
        .order("created_at", { ascending: false }),
      supabase
        .from("tips")
        .select("id, participant_id, match_id, score_a, score_b, saved_at")
        .order("saved_at", { ascending: false }),
      supabase
        .from("bonus_tips")
        .select("participant_id, champion, top_scorer, group_winners, saved_at")
        .order("saved_at", { ascending: false }),
      supabase
        .from("results")
        .select("match_id, score_a, score_b, status, updated_at"),
    ]);

    for (const response of [codes, participants, tips, bonusTips, results]) {
      if (response.error) throw response.error;
    }

    return json({
      codes: codes.data ?? [],
      participants: participants.data ?? [],
      tips: tips.data ?? [],
      bonusTips: bonusTips.data ?? [],
      results: results.data ?? [],
    });
  } catch (error) {
    return json({ error: error.message || "Admin-Daten konnten nicht geladen werden." }, 401);
  }
};

export const config = {
  path: "/api/admin-data",
};
