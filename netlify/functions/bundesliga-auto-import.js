import { getServiceClient, json } from "./_shared/supabase.js";
import {
  BUNDESLIGA_COMPETITION_ID,
  normalizeGoalgetter,
} from "./_shared/bundesliga.js";
import { LIVE_UPDATE_COMPETITION_IDS, syncLiveCompetition } from "./_shared/bundesliga-live-sync.js";

async function fetchOpenLigaGoalgetters(competition) {
  const response = await fetch(`https://api.openligadb.de/getgoalgetters/${competition.source_league}/${competition.source_season}`);
  if (!response.ok) throw new Error("OpenLigaDB-Torschützen konnten nicht geladen werden.");
  return response.json();
}

export default async () => {
  try {
    const supabase = getServiceClient();
    const { data: competitions, error: competitionError } = await supabase
      .from("competitions")
      .select("id, source_league, source_season, live_updates_paused")
      .in("id", LIVE_UPDATE_COMPETITION_IDS);
    if (competitionError) throw competitionError;

    const updates = [];
    for (const competition of competitions ?? []) {
      if (competition.live_updates_paused) {
        updates.push({ competitionId: competition.id, skipped: true, reason: "Live-Aktualisierung pausiert." });
        continue;
      }
      updates.push({ competitionId: competition.id, ...await syncLiveCompetition(supabase, competition) });
    }

    let topScorerCount = 0;
    const regularCompetition = (competitions ?? []).find((row) => row.id === BUNDESLIGA_COMPETITION_ID);
    const regularUpdated = updates.find((row) => row.competitionId === BUNDESLIGA_COMPETITION_ID && !row.skipped);
    const goalgetters = regularCompetition && regularUpdated
      ? await fetchOpenLigaGoalgetters(regularCompetition).catch(() => [])
      : [];
    if (goalgetters.length) {
      const { data: existingScorers, error: existingError } = await supabase
        .from("competition_top_scorers")
        .select("*")
        .eq("competition_id", BUNDESLIGA_COMPETITION_ID);
      if (existingError) throw existingError;
      const existingByExternalId = new Map((existingScorers ?? []).map((row) => [row.external_id, row]));
      const scorerRows = goalgetters
        .map((row) => normalizeGoalgetter(row, existingByExternalId.get(String(row.goalGetterId ?? row.goalGetterID ?? ""))))
        .filter((row) => row.external_id);
      const { data, error } = await supabase
        .from("competition_top_scorers")
        .upsert(scorerRows, { onConflict: "competition_id,external_id" })
        .select("id");
      if (error) throw error;
      topScorerCount = data?.length ?? 0;
    }

    return json({
      ok: true,
      updates,
      importedTopScorers: topScorerCount,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    return json({ ok: false, error: error.message || "Bundesliga-Auto-Import fehlgeschlagen." }, 500);
  }
};

// Temporarily unscheduled while Bundesliga is paused.
