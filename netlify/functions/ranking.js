import { getServiceClient, json } from "./_shared/supabase.js";

function pointsFor(tip, result) {
  if (!result || result.status !== "final") return 0;
  if (tip.score_a === result.score_a && tip.score_b === result.score_b) return 4;

  const tipDiff = Math.sign(tip.score_a - tip.score_b);
  const resultDiff = Math.sign(result.score_a - result.score_b);
  if (tipDiff === resultDiff) return 2;

  return 0;
}

export default async (req) => {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  try {
    const supabase = getServiceClient();
    const [participants, tips, results] = await Promise.all([
      supabase.from("participants").select("id, display_name"),
      supabase.from("tips").select("participant_id, match_id, score_a, score_b"),
      supabase.from("results").select("match_id, score_a, score_b, status"),
    ]);

    for (const response of [participants, tips, results]) {
      if (response.error) throw response.error;
    }

    const resultsByMatch = new Map((results.data ?? []).map((result) => [result.match_id, result]));
    const totals = new Map(
      (participants.data ?? []).map((participant) => [
        participant.id,
        { name: participant.display_name, points: 0 },
      ]),
    );

    (tips.data ?? []).forEach((tip) => {
      const row = totals.get(tip.participant_id);
      if (!row) return;
      row.points += pointsFor(tip, resultsByMatch.get(tip.match_id));
    });

    const ranking = Array.from(totals.values()).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
    return json({ ranking });
  } catch (error) {
    return json({ error: error.message || "Rangliste konnte nicht geladen werden." }, 500);
  }
};

export const config = {
  path: "/api/ranking",
};
