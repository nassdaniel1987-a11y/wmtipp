// Scheduled Function: holt offizielle WM-Ergebnisse periodisch von
// football-data.org und schreibt neue/geaenderte Endergebnisse nach Supabase.
// So entstehen externe API-Aufrufe NICHT pro Seitenaufruf, sondern gebuendelt
// im Hintergrund. Clients (Web + Android) lesen die Ergebnisse anschliessend
// direkt aus der DB (Web zusaetzlich per Realtime). Im Anschluss wird der
// Ranglisten-Snapshot fuers Web aktualisiert.
import { getServiceClient } from "./_shared/supabase.js";
import { buildCandidates } from "./_shared/wm-official-results.js";
import { refreshWmRankingSnapshot } from "./_shared/refresh-ranking.js";

export default async () => {
  // Ohne API-Key (z. B. ausserhalb des Turniers) still beenden, statt zu werfen.
  if (!Netlify.env.get("FOOTBALL_DATA_API_KEY")) {
    return new Response("skipped: no FOOTBALL_DATA_API_KEY", { status: 200 });
  }

  try {
    const supabase = getServiceClient();
    const preview = await buildCandidates(supabase);

    const rows = preview.candidates
      .filter((candidate) => !candidate.alreadySaved)
      .map((candidate) => ({
        match_id: candidate.matchId,
        score_a: candidate.scoreA,
        score_b: candidate.scoreB,
        status: "final",
        updated_at: new Date().toISOString(),
      }));

    if (rows.length === 0) {
      return new Response("ok: nothing to import", { status: 200 });
    }

    const { error } = await supabase
      .from("results")
      .upsert(rows, { onConflict: "match_id" });
    if (error) throw error;

    await refreshWmRankingSnapshot(supabase);
    return new Response(`ok: imported ${rows.length}`, { status: 200 });
  } catch (error) {
    return new Response(`error: ${error.message || "sync failed"}`, { status: 500 });
  }
};

// Alle 10 Minuten. Ausserhalb des Turniers (kein API-Key) ist der Lauf ein
// No-op. Bei Bedarf das Intervall in Netlify anpassen.
export const config = {
  schedule: "*/10 * * * *",
};
