import { getServiceClient, json } from "./_shared/supabase.js";
import { isBundesligaTipLocked } from "./_shared/bundesliga.js";
import { BundesligaHttpError, bundesligaErrorResponse, resolveBundesligaParticipant, resolveRequestedBundesligaCompetition } from "./_shared/bundesliga-access.js";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { tips } = await req.json();
    if (!Array.isArray(tips)) return json({ error: "Tipps sind erforderlich." }, 400);
    const supabase = getServiceClient();
    const competitionId = resolveRequestedBundesligaCompetition(req);
    const participant = await resolveBundesligaParticipant(req, supabase, { required: true, competitionId });
    const rows = tips.map((tip) => ({
      competition_id: competitionId,
      participant_id: participant.id,
      match_id: tip.matchId,
      score_a: Number(tip.scoreA),
      score_b: Number(tip.scoreB),
      saved_at: new Date().toISOString(),
    }));
    if (rows.some((row) => !row.match_id || !Number.isInteger(row.score_a) || !Number.isInteger(row.score_b) || row.score_a < 0 || row.score_a > 12 || row.score_b < 0 || row.score_b > 12)) {
      return json({ error: "Mindestens ein Bundesliga-Tipp ist ungültig." }, 400);
    }

    const { data: competition, error: competitionError } = await supabase
      .from("competitions")
      .select("status, public_enabled, tip_lock_mode")
      .eq("id", competitionId)
      .maybeSingle();
    if (competitionError) throw competitionError;

    const { data: matches, error: matchError } = await supabase
      .from("competition_matches")
      .select("id, team_a_name, team_b_name, kickoff_at, status")
      .eq("competition_id", competitionId)
      .in("id", rows.map((row) => row.match_id));
    if (matchError) throw matchError;
    if ((matches ?? []).length !== rows.length) {
      throw new BundesligaHttpError("Mindestens ein Spiel gehoert nicht zur aktuellen Bundesliga-Saison.", 400);
    }

    const locked = (matches ?? []).find((match) =>
      isBundesligaTipLocked(match, match.status === "final" ? { status: "final" } : null, new Date(), competition?.tip_lock_mode ?? "kickoff"),
    );
    if (locked) {
      return json({ error: `Tipp gesperrt: ${locked.team_a_name} - ${locked.team_b_name} kann nicht mehr geaendert werden.` }, 409);
    }

    const { data, error } = await supabase
      .from("competition_tips")
      .upsert(rows, { onConflict: "competition_id,participant_id,match_id" })
      .select("match_id, score_a, score_b, saved_at");
    if (error) throw error;
    return json({ tips: data ?? [] });
  } catch (error) {
    return bundesligaErrorResponse(error, "Bundesliga-Tipps konnten nicht gespeichert werden.");
  }
};

export const config = {
  path: "/api/bundesliga-save-tips",
};
