import { requireAdmin } from "./_shared/admin.js";
import { json } from "./_shared/supabase.js";
import { fetchAllPages } from "./_shared/pagination.js";
import { buildKnockout, knockoutMatches } from "../../src/koBracket.js";

const KO_IDS = new Set(knockoutMatches.map((match) => match.id));

// Loest die K.o.-Paarungen aus den finalen Gruppenergebnissen auf (buildKnockout)
// und schreibt die ermittelten Teams in die K.o.-matches-Zeilen. Optionaler
// manualPairings-Override pro Spiel erlaubt Admin-Korrekturen. Noch nicht
// ermittelte Slots behalten ihr lesbares Platzhalter-Label.
export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { supabase } = await requireAdmin(req);
    const body = await req.json().catch(() => ({}));

    const manualPairings = new Map();
    for (const [matchId, pairing] of Object.entries(body?.manualPairings ?? {})) {
      if (!KO_IDS.has(matchId) || !pairing) continue;
      const teamA = typeof pairing.teamA === "string" ? pairing.teamA.trim() : "";
      const teamB = typeof pairing.teamB === "string" ? pairing.teamB.trim() : "";
      const entry = {};
      if (teamA) entry.teamA = teamA;
      if (teamB) entry.teamB = teamB;
      if (Object.keys(entry).length) manualPairings.set(matchId, entry);
    }

    const matches = await fetchAllPages(() =>
      supabase
        .from("matches")
        .select("id, match_number, phase, group_key, team_a, team_b, flag_code_a, flag_code_b")
        .order("match_number", { ascending: true }));

    const results = await fetchAllPages(() =>
      supabase
        .from("results")
        .select("match_id, score_a, score_b, winner, status"));

    const resultsByMatchId = new Map(results.map((row) => [row.match_id, row]));

    const groupMatches = matches
      .filter((row) => row.phase === "group")
      .map((row) => ({ id: row.id, groupKey: row.group_key, teamA: row.team_a, teamB: row.team_b }));

    // Flaggen je Team aus den Gruppenspielen, damit aufgeloeste K.o.-Teams ihre
    // Flagge mitbekommen.
    const flagByTeam = new Map();
    for (const row of matches) {
      if (row.team_a && row.flag_code_a && !flagByTeam.has(row.team_a)) flagByTeam.set(row.team_a, row.flag_code_a);
      if (row.team_b && row.flag_code_b && !flagByTeam.has(row.team_b)) flagByTeam.set(row.team_b, row.flag_code_b);
    }

    const { bracket } = buildKnockout(groupMatches, resultsByMatchId, { manualPairings });

    const koRowsById = new Map(
      matches.filter((row) => KO_IDS.has(row.id)).map((row) => [row.id, row]),
    );

    const updates = [];
    for (const entry of bracket) {
      if (!koRowsById.has(entry.id)) continue; // nur existierende K.o.-Zeilen anfassen
      const teamA = entry.teamA ?? entry.labelA;
      const teamB = entry.teamB ?? entry.labelB;
      updates.push({
        id: entry.id,
        team_a: teamA,
        team_b: teamB,
        flag_code_a: entry.teamA ? (flagByTeam.get(entry.teamA) ?? "") : "",
        flag_code_b: entry.teamB ? (flagByTeam.get(entry.teamB) ?? "") : "",
      });
    }

    for (const update of updates) {
      const { error } = await supabase
        .from("matches")
        .update({
          team_a: update.team_a,
          team_b: update.team_b,
          flag_code_a: update.flag_code_a,
          flag_code_b: update.flag_code_b,
        })
        .eq("id", update.id);
      if (error) throw error;
    }

    const resolvedCount = bracket.filter((entry) => entry.resolved && KO_IDS.has(entry.id)).length;

    return json({
      updated: updates.length,
      resolved: resolvedCount,
      bracket: bracket
        .filter((entry) => KO_IDS.has(entry.id))
        .map((entry) => ({
          id: entry.id,
          round: entry.round,
          roundLabel: entry.roundLabel,
          teamA: entry.teamA,
          teamB: entry.teamB,
          labelA: entry.labelA,
          labelB: entry.labelB,
          resolved: entry.resolved,
        })),
    });
  } catch (error) {
    return json({ error: error.message || "K.o.-Paarungen konnten nicht aufgelöst werden." }, error.status || 500);
  }
};

export const config = {
  path: "/api/admin-resolve-knockout",
};
