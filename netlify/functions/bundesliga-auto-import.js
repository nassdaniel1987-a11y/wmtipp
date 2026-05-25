import { getServiceClient, json } from "./_shared/supabase.js";
import {
  BUNDESLIGA_COMPETITION_ID,
  BUNDESLIGA_SOURCE_LEAGUE,
  BUNDESLIGA_SOURCE_SEASON,
  normalizeGoalgetter,
  normalizeOpenLigaMatch,
} from "./_shared/bundesliga.js";

async function fetchOpenLigaMatches() {
  const response = await fetch(`https://api.openligadb.de/getmatchdata/${BUNDESLIGA_SOURCE_LEAGUE}/${BUNDESLIGA_SOURCE_SEASON}`);
  if (response.status === 404) return [];
  if (!response.ok) throw new Error("OpenLigaDB-Spielplan konnte nicht geladen werden.");
  return response.json();
}

async function fetchOpenLigaGoalgetters() {
  const response = await fetch(`https://api.openligadb.de/getgoalgetters/${BUNDESLIGA_SOURCE_LEAGUE}/${BUNDESLIGA_SOURCE_SEASON}`);
  if (!response.ok) throw new Error("OpenLigaDB-Torschützen konnten nicht geladen werden.");
  return response.json();
}

export default async () => {
  if (Netlify.env.get("BUNDESLIGA_AUTO_IMPORT_ENABLED") !== "true") {
    return json({ ok: true, skipped: true, reason: "BUNDESLIGA_AUTO_IMPORT_ENABLED ist nicht aktiv." });
  }

  try {
    const supabase = getServiceClient();
    const [openLigaMatches, goalgetters] = await Promise.all([
      fetchOpenLigaMatches(),
      fetchOpenLigaGoalgetters().catch(() => []),
    ]);
    const normalized = openLigaMatches.map((match, index) => normalizeOpenLigaMatch(match, BUNDESLIGA_SOURCE_LEAGUE, index));
    if (normalized.length === 0) {
      return json({ ok: true, skipped: true, reason: "Spielplan für 2026/27 ist bei OpenLigaDB noch nicht verfügbar." });
    }
    const resultRows = normalized
      .map((item) => item.resultRow)
      .filter(Boolean);

    if (resultRows.length) {
      const { error } = await supabase
        .from("competition_results")
        .upsert(resultRows, { onConflict: "competition_id,match_id" });
      if (error) throw error;
    }

    let topScorerCount = 0;
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
      importedResults: resultRows.length,
      importedTopScorers: topScorerCount,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    return json({ ok: false, error: error.message || "Bundesliga-Auto-Import fehlgeschlagen." }, 500);
  }
};

export const config = { schedule: "*/30 * * * *" };
