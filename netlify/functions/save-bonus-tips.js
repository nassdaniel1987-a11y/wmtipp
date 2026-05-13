import { getServiceClient, json } from "./_shared/supabase.js";

function normalize(value) {
  return String(value || "").trim();
}

function getFirstKickoff(matches) {
  const timestamps = (matches ?? [])
    .map((match) => match.kickoff_at)
    .filter(Boolean)
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite);
  if (!timestamps.length) return null;
  return Math.min(...timestamps);
}

function getGroupDeadlines(matches) {
  const deadlines = new Map();
  (matches ?? []).forEach((match) => {
    if (!match.group_key || !match.kickoff_at) return;
    const time = new Date(match.kickoff_at).getTime();
    if (!Number.isFinite(time)) return;
    const current = deadlines.get(match.group_key);
    if (!current || time < current) deadlines.set(match.group_key, time);
  });
  return deadlines;
}

function valueChanged(previous, next) {
  return normalize(previous) !== normalize(next);
}

export default async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const { participantId, champion, topScorer, groupWinners } = await req.json();
    if (!participantId) {
      return json({ error: "Teilnehmer fehlt." }, 400);
    }

    const cleanChampion = normalize(champion);
    const cleanTopScorer = normalize(topScorer);
    const cleanGroupWinners =
      groupWinners && typeof groupWinners === "object" && !Array.isArray(groupWinners)
        ? groupWinners
        : {};

    const supabase = getServiceClient();
    const [{ data: matches, error: matchesError }, { data: existingBonusTip, error: existingError }] = await Promise.all([
      supabase
      .from("matches")
        .select("group_key, kickoff_at")
        .not("kickoff_at", "is", null),
      supabase
        .from("bonus_tips")
        .select("champion, top_scorer, group_winners")
        .eq("participant_id", participantId)
        .maybeSingle(),
    ]);

    if (matchesError) throw matchesError;
    if (existingError) throw existingError;

    const now = Date.now();
    const tournamentDeadline = getFirstKickoff(matches);
    const previousGroupWinners = existingBonusTip?.group_winners ?? {};
    if (
      tournamentDeadline &&
      now >= tournamentDeadline &&
      (valueChanged(existingBonusTip?.champion, cleanChampion) ||
        valueChanged(existingBonusTip?.top_scorer, cleanTopScorer))
    ) {
      return json({ error: "Weltmeister und Torschützenkönig sind nach Turnierstart gesperrt." }, 409);
    }

    for (const [groupKey, deadline] of getGroupDeadlines(matches)) {
      if (now < deadline) continue;
      if (valueChanged(previousGroupWinners[groupKey], cleanGroupWinners[groupKey])) {
        return json({ error: `Gruppensieger Gruppe ${groupKey} ist bereits gesperrt.` }, 409);
      }
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
