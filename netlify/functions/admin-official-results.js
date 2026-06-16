import { requireAdmin } from "./_shared/admin.js";
import { json } from "./_shared/supabase.js";
import { refreshWmRankingSnapshot } from "./_shared/refresh-ranking.js";
import { buildCandidates } from "./_shared/wm-official-results.js";

export default async (req) => {
  if (!["GET", "POST"].includes(req.method)) return json({ error: "Method not allowed" }, 405);

  try {
    const { supabase } = await requireAdmin(req);
    const preview = await buildCandidates(supabase);

    if (req.method === "GET") {
      return json(preview);
    }

    const body = await req.json().catch(() => ({}));
    const selectedIds = new Set(body.matchIds ?? preview.candidates.map((candidate) => candidate.matchId));
    const rows = preview.candidates
      .filter((candidate) => selectedIds.has(candidate.matchId) && !candidate.alreadySaved)
      .map((candidate) => ({
        match_id: candidate.matchId,
        score_a: candidate.scoreA,
        score_b: candidate.scoreB,
        status: "final",
        updated_at: new Date().toISOString(),
      }));

    if (rows.length === 0) {
      return json({ ...preview, imported: [] });
    }

    const { data, error } = await supabase
      .from("results")
      .upsert(rows, { onConflict: "match_id" })
      .select("match_id, score_a, score_b, status, updated_at");

    if (error) throw error;
    await refreshWmRankingSnapshot(supabase).catch(() => {});
    return json({ ...preview, imported: data ?? [] });
  } catch (error) {
    return json({ error: error.message || "Offizielle Ergebnisse konnten nicht verarbeitet werden." }, 400);
  }
};

export const config = {
  path: "/api/admin-official-results",
};
