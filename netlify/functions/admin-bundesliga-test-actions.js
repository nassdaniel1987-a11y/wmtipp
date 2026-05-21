import { makeInviteCode, requireAdmin } from "./_shared/admin.js";
import { json } from "./_shared/supabase.js";
import {
  BUNDESLIGA_COMPETITION_ID,
  BUNDESLIGA_SOURCE_LEAGUE,
  BUNDESLIGA_SOURCE_SEASON,
  getFinalScore,
  normalizeGoalgetter,
} from "./_shared/bundesliga.js";

function demoScoreFor(match, participantIndex) {
  const seed = Number(match.matchday ?? 0) + Number(match.match_number ?? 0) + participantIndex;
  return {
    score_a: seed % 4,
    score_b: Math.floor(seed / 2) % 3,
  };
}

async function fetchOpenLigaGoalgetters() {
  const response = await fetch(`https://api.openligadb.de/getgoalgetters/${BUNDESLIGA_SOURCE_LEAGUE}/${BUNDESLIGA_SOURCE_SEASON}`);
  if (!response.ok) {
    throw new Error("OpenLigaDB-Torschützen konnten nicht geladen werden.");
  }
  return response.json();
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { supabase } = await requireAdmin(req);
    const body = await req.json().catch(() => ({}));
    const action = body.action;

    if (action === "create-demo-participant") {
      const displayName = String(body.displayName || "").trim();
      if (displayName.length < 2) return json({ error: "Name ist zu kurz." }, 400);
      const { data, error } = await supabase
        .from("competition_demo_participants")
        .upsert({
          competition_id: BUNDESLIGA_COMPETITION_ID,
          display_name: displayName,
        }, { onConflict: "competition_id,display_name" })
        .select("*")
        .single();
      if (error) throw error;
      return json({ participant: data });
    }

    if (action === "create-invite-codes") {
      const count = Math.max(1, Math.min(100, Number(body.count) || 10));
      const rows = Array.from({ length: count }, () => ({
        competition_id: BUNDESLIGA_COMPETITION_ID,
        code: makeInviteCode("BL"),
        status: "free",
      }));
      const { data, error } = await supabase
        .from("competition_invite_codes")
        .insert(rows)
        .select("*");
      if (error) throw error;
      return json({ codes: data ?? [] });
    }

    if (action === "generate-demo-tips") {
      const { data: participants, error: participantError } = await supabase
        .from("competition_demo_participants")
        .select("*")
        .eq("competition_id", BUNDESLIGA_COMPETITION_ID)
        .order("created_at");
      if (participantError) throw participantError;

      let demoParticipants = participants ?? [];
      if (demoParticipants.length === 0) {
        const { data, error } = await supabase
          .from("competition_demo_participants")
          .insert([
            { competition_id: BUNDESLIGA_COMPETITION_ID, display_name: "Daniel Test" },
            { competition_id: BUNDESLIGA_COMPETITION_ID, display_name: "Kind 1" },
            { competition_id: BUNDESLIGA_COMPETITION_ID, display_name: "Kind 2" },
          ])
          .select("*");
        if (error) throw error;
        demoParticipants = data ?? [];
      }

      const { data: matches, error: matchError } = await supabase
        .from("competition_matches")
        .select("id, match_number, matchday")
        .eq("competition_id", BUNDESLIGA_COMPETITION_ID)
        .eq("phase", "league")
        .order("match_number");
      if (matchError) throw matchError;

      const rows = demoParticipants.flatMap((participant, participantIndex) =>
        (matches ?? []).map((match) => ({
          competition_id: BUNDESLIGA_COMPETITION_ID,
          participant_id: participant.id,
          match_id: match.id,
          ...demoScoreFor(match, participantIndex),
          saved_at: new Date().toISOString(),
        })),
      );

      const { data, error } = await supabase
        .from("competition_demo_tips")
        .upsert(rows, { onConflict: "competition_id,participant_id,match_id" })
        .select("*");
      if (error) throw error;
      return json({ tips: data ?? [], participants: demoParticipants });
    }

    if (action === "import-results") {
      const throughMatchday = Number(body.throughMatchday);
      if (!Number.isInteger(throughMatchday) || throughMatchday < 1) {
        return json({ error: "Bitte einen gültigen Spieltag auswählen." }, 400);
      }

      const { data: matches, error: matchError } = await supabase
        .from("competition_matches")
        .select("id, competition_id, matchday, phase, source_json")
        .eq("competition_id", BUNDESLIGA_COMPETITION_ID)
        .eq("phase", "league")
        .lte("matchday", throughMatchday);
      if (matchError) throw matchError;

      const rows = (matches ?? [])
        .map((match) => {
          const finalScore = getFinalScore(match.source_json ?? {});
          if (!finalScore || !Number.isInteger(finalScore.pointsTeam1) || !Number.isInteger(finalScore.pointsTeam2)) return null;
          return {
            match_id: match.id,
            competition_id: BUNDESLIGA_COMPETITION_ID,
            score_a: finalScore.pointsTeam1,
            score_b: finalScore.pointsTeam2,
            status: "final",
            updated_at: new Date().toISOString(),
          };
        })
        .filter(Boolean);

      if (rows.length === 0) return json({ imported: [] });
      const { data, error } = await supabase
        .from("competition_results")
        .upsert(rows, { onConflict: "match_id" })
        .select("*");
      if (error) throw error;
      return json({ imported: data ?? [], throughMatchday });
    }

    if (action === "reset-results") {
      const { error } = await supabase
        .from("competition_results")
        .delete()
        .eq("competition_id", BUNDESLIGA_COMPETITION_ID);
      if (error) throw error;
      return json({ reset: true });
    }

    if (action === "import-top-scorers") {
      const goalgetters = await fetchOpenLigaGoalgetters();
      const { data: existingScorers, error: existingScorerError } = await supabase
        .from("competition_top_scorers")
        .select("*")
        .eq("competition_id", BUNDESLIGA_COMPETITION_ID);
      if (existingScorerError) throw existingScorerError;

      const existingByExternalId = new Map((existingScorers ?? []).map((row) => [row.external_id, row]));
      const rows = goalgetters
        .map((row) => normalizeGoalgetter(row, existingByExternalId.get(String(row.goalGetterId ?? row.goalGetterID ?? ""))))
        .filter((row) => row.external_id);

      const { data, error } = await supabase
        .from("competition_top_scorers")
        .upsert(rows, { onConflict: "competition_id,external_id" })
        .select("*");
      if (error) throw error;
      return json({ topScorers: data ?? [] });
    }

    if (action === "save-top-scorer") {
      const id = String(body.id || "").trim();
      const displayName = String(body.displayName || "").trim();
      const teamName = String(body.teamName || "").trim();
      if (!id || displayName.length < 2) return json({ error: "Bitte einen gültigen Torschützennamen eintragen." }, 400);

      const { data, error } = await supabase
        .from("competition_top_scorers")
        .update({
          display_name: displayName,
          team_name: teamName || null,
          manual_override: true,
          updated_at: new Date().toISOString(),
        })
        .eq("competition_id", BUNDESLIGA_COMPETITION_ID)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return json({ topScorer: data });
    }

    return json({ error: "Unbekannte Bundesliga-Testaktion." }, 400);
  } catch (error) {
    return json({ error: error.message || "Bundesliga-Testaktion fehlgeschlagen." }, 400);
  }
};

export const config = {
  path: "/api/admin-bundesliga-test-actions",
};
