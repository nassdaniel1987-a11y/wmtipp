import { requireAdmin } from "./_shared/admin.js";
import { json } from "./_shared/supabase.js";
import { fetchAllPages } from "./_shared/pagination.js";
import {
  buildKnockout,
  buildKnockoutScheduleUpdates,
  knockoutMatches,
  knockoutPlaceholderPairing,
} from "../../src/koBracket.js";
import {
  buildTeamFlagLookup,
  resolveTeamFlagCode,
} from "../../src/lib/koManualPairing.js";

const KO_IDS = new Set(knockoutMatches.map((match) => match.id));

// Loest die K.o.-Paarungen aus den Gruppenergebnissen auf (buildKnockout) und
// schreibt die ermittelten Teams in die K.o.-matches-Zeilen. Optionaler
// manualPairings-Override pro Spiel erlaubt Admin-Korrekturen. Preview-Modus
// liefert Admin-Vorschlaege ohne DB-Schreibzugriff.
export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { supabase } = await requireAdmin(req);
    const body = await req.json().catch(() => ({}));

    const action = body?.action === "reset"
      ? "reset"
      : body?.action === "schedule"
        ? "schedule"
        : "resolve";
    const mode = body?.mode === "preview" ? "preview" : "apply";
    const scope = body?.scope === "partial" ? "partial" : "full";
    const selectedUpdateIds = new Set(Array.isArray(body?.updateIds) ? body.updateIds : []);
    const manualPairingSource = body?.manualPairings ?? body ?? {};
    const manualPairings = new Map();
    for (const [matchId, pairing] of Object.entries(manualPairingSource)) {
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
        .select("id, match_number, phase, group_key, kickoff_at, match_date, match_time, team_a, team_b, flag_code_a, flag_code_b, venue, city")
        .order("match_number", { ascending: true }));

    const results = await fetchAllPages(() =>
      supabase
        .from("results")
        .select("match_id, score_a, score_b, winner, status"));

    const resultsByMatchId = new Map(results.map((row) => [row.match_id, row]));

    const groupMatches = matches
      .filter((row) => row.phase === "group")
      .map((row) => ({ id: row.id, groupKey: row.group_key, teamA: row.team_a, teamB: row.team_b }));

    const flagByTeam = buildTeamFlagLookup(matches);

    const { bracket } = buildKnockout(groupMatches, resultsByMatchId, {
      manualPairings,
      partialGroupSlots: scope === "partial",
      resolveThirds: scope !== "partial",
    });

    const koRowsById = new Map(
      matches.filter((row) => KO_IDS.has(row.id)).map((row) => [row.id, row]),
    );

    if (action === "schedule") {
      const scheduleUpdates = buildKnockoutScheduleUpdates(matches.filter((row) => KO_IDS.has(row.id)));
      const updatesToWrite = mode === "preview" ? [] : scheduleUpdates.filter((update) => update.changed);
      for (const update of updatesToWrite) {
        const { error } = await supabase
          .from("matches")
          .update({
            kickoff_at: update.kickoff_at,
            match_date: update.match_date,
            match_time: update.match_time,
            venue: update.venue,
            city: update.city,
          })
          .eq("id", update.id);
        if (error) throw error;
      }

      return json({
        action,
        mode,
        scope,
        updated: updatesToWrite.length,
        candidates: scheduleUpdates.filter((update) => update.changed).length,
        resolved: 0,
        manualReviewRequired: false,
        updates: scheduleUpdates,
        bracket: [],
      });
    }

    if (action === "reset") {
      const resetUpdates = [...selectedUpdateIds]
        .filter((matchId) => koRowsById.has(matchId))
        .map((matchId) => {
          const current = koRowsById.get(matchId);
          const placeholder = knockoutPlaceholderPairing(matchId);
          return placeholder
            ? {
                ...placeholder,
                current_team_a: current.team_a,
                current_team_b: current.team_b,
                resolved: false,
                hasRealTeam: false,
                changed:
                  current.team_a !== placeholder.team_a ||
                  current.team_b !== placeholder.team_b ||
                  (current.flag_code_a ?? "") !== "" ||
                  (current.flag_code_b ?? "") !== "",
              }
            : null;
        })
        .filter(Boolean);

      const updatesToWrite = mode === "preview" ? [] : resetUpdates;
      for (const update of updatesToWrite) {
        const { error } = await supabase
          .from("matches")
          .update({
            team_a: update.team_a,
            team_b: update.team_b,
            flag_code_a: "",
            flag_code_b: "",
          })
          .eq("id", update.id);
        if (error) throw error;
      }

      return json({
        action,
        mode,
        scope,
        updated: updatesToWrite.length,
        candidates: resetUpdates.length,
        resolved: 0,
        manualReviewRequired: false,
        updates: resetUpdates,
        bracket: [],
      });
    }

    const updates = [];
    for (const entry of bracket) {
      if (!koRowsById.has(entry.id)) continue; // nur existierende K.o.-Zeilen anfassen
      const current = koRowsById.get(entry.id);
      const teamA = entry.teamA ?? entry.labelA;
      const teamB = entry.teamB ?? entry.labelB;
      const next = {
        id: entry.id,
        matchNumber: entry.matchNumber,
        round: entry.round,
        roundLabel: entry.roundLabel,
        team_a: teamA,
        team_b: teamB,
        flag_code_a: entry.teamA ? resolveTeamFlagCode(flagByTeam, entry.teamA) : "",
        flag_code_b: entry.teamB ? resolveTeamFlagCode(flagByTeam, entry.teamB) : "",
        current_team_a: current.team_a,
        current_team_b: current.team_b,
        resolved: entry.resolved,
        hasRealTeam: Boolean(entry.teamA || entry.teamB),
      };
      next.changed =
        current.team_a !== next.team_a ||
        current.team_b !== next.team_b ||
        (current.flag_code_a ?? "") !== next.flag_code_a ||
        (current.flag_code_b ?? "") !== next.flag_code_b;
      if (scope === "full" || next.hasRealTeam || next.changed) updates.push(next);
    }

    const updatesToWrite = mode === "preview"
      ? []
      : updates.filter((update) => (
          scope === "full" ||
          selectedUpdateIds.has(update.id)
        ));

    for (const update of updatesToWrite) {
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
      mode,
      scope,
      updated: updatesToWrite.length,
      candidates: updates.length,
      resolved: resolvedCount,
      manualReviewRequired: scope === "partial",
      updates,
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
