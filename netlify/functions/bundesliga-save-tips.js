import { getServiceClient, json } from "./_shared/supabase.js";
import { BUNDESLIGA_COMPETITION_ID } from "./_shared/bundesliga.js";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { participantId, tips } = await req.json();
    if (!participantId || !Array.isArray(tips)) return json({ error: "Teilnehmer und Tipps sind erforderlich." }, 400);
    const rows = tips.map((tip) => ({
      competition_id: BUNDESLIGA_COMPETITION_ID,
      participant_id: participantId,
      match_id: tip.matchId,
      score_a: Number(tip.scoreA),
      score_b: Number(tip.scoreB),
      saved_at: new Date().toISOString(),
    }));
    if (rows.some((row) => !row.match_id || !Number.isInteger(row.score_a) || !Number.isInteger(row.score_b) || row.score_a < 0 || row.score_a > 12 || row.score_b < 0 || row.score_b > 12)) {
      return json({ error: "Mindestens ein Bundesliga-Tipp ist ungültig." }, 400);
    }

    const supabase = getServiceClient();
    const { data: competition, error: competitionError } = await supabase
      .from("competitions")
      .select("status, public_enabled")
      .eq("id", BUNDESLIGA_COMPETITION_ID)
      .maybeSingle();
    if (competitionError) throw competitionError;

    if (competition?.status === "public" && competition.public_enabled) {
      const { data: lockedMatches, error: lockError } = await supabase
        .from("competition_matches")
        .select("id, team_a_name, team_b_name, kickoff_at")
        .in("id", rows.map((row) => row.match_id))
        .not("kickoff_at", "is", null)
        .lte("kickoff_at", new Date().toISOString());
      if (lockError) throw lockError;
      if ((lockedMatches ?? []).length > 0) {
        const locked = lockedMatches[0];
        return json({ error: `Tipp gesperrt: ${locked.team_a_name} - ${locked.team_b_name} hat bereits begonnen.` }, 409);
      }
    }

    const { data, error } = await supabase
      .from("competition_tips")
      .upsert(rows, { onConflict: "competition_id,participant_id,match_id" })
      .select("match_id, score_a, score_b, saved_at");
    if (error) throw error;
    return json({ tips: data ?? [] });
  } catch (error) {
    return json({ error: error.message || "Bundesliga-Tipps konnten nicht gespeichert werden." }, 500);
  }
};

export const config = {
  path: "/api/bundesliga-save-tips",
};
