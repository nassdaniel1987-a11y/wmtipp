import { getServiceClient, json } from "./_shared/supabase.js";

export default async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const { participantId, champion, topScorer, groupWinners } = await req.json();
    if (!participantId) {
      return json({ error: "Teilnehmer fehlt." }, 400);
    }

    const cleanChampion = String(champion || "").trim();
    const cleanTopScorer = String(topScorer || "").trim();
    const cleanGroupWinners =
      groupWinners && typeof groupWinners === "object" && !Array.isArray(groupWinners)
        ? groupWinners
        : {};

    const supabase = getServiceClient();
    const { data: startedMatches, error: lockError } = await supabase
      .from("matches")
      .select("id, kickoff_at")
      .not("kickoff_at", "is", null)
      .lte("kickoff_at", new Date().toISOString())
      .limit(1);

    if (lockError) throw lockError;
    if ((startedMatches ?? []).length > 0) {
      return json({ error: "Bonus-Tipps sind nach Turnierstart gesperrt." }, 409);
    }

    const row = {
      participant_id: participantId,
      champion: cleanChampion || null,
      top_scorer: cleanTopScorer || null,
      group_winners: cleanGroupWinners,
      saved_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("bonus_tips")
      .upsert(row, { onConflict: "participant_id" })
      .select("champion, top_scorer, group_winners, saved_at")
      .single();

    if (error) throw error;
    return json({ bonusTip: data });
  } catch (error) {
    return json({ error: error.message || "Bonus-Tipps konnten nicht gespeichert werden." }, 500);
  }
};

export const config = {
  path: "/api/save-bonus-tips",
};
