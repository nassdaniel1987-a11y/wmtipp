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

function releaseProbeScoreFor(match, participantIndex, matchIndex) {
  const finalScore = getFinalScore(match.source_json ?? {});
  const scoreA = Number.isInteger(finalScore?.pointsTeam1) ? finalScore.pointsTeam1 : (matchIndex + participantIndex) % 4;
  const scoreB = Number.isInteger(finalScore?.pointsTeam2) ? finalScore.pointsTeam2 : (matchIndex + 1 + participantIndex) % 3;

  if (participantIndex === 0) return { score_a: scoreA, score_b: scoreB };
  if (participantIndex === 1) return { score_a: Math.min(12, scoreA + 1), score_b: Math.min(12, scoreB + 1) };
  return { score_a: scoreB, score_b: scoreA };
}

const releaseProbeParticipantNames = ["Release Test 1", "Release Test 2", "Release Test 3"];

async function deleteRowsByCompetition(supabase, table, select = "id") {
  const { data, error } = await supabase
    .from(table)
    .delete()
    .eq("competition_id", BUNDESLIGA_COMPETITION_ID)
    .select(select);
  if (error) throw error;
  return data?.length ?? 0;
}

async function resetReleaseProbeData(supabase) {
  const { data: participants, error: participantReadError } = await supabase
    .from("competition_participants")
    .select("id, display_name, invite_code_id")
    .eq("competition_id", BUNDESLIGA_COMPETITION_ID)
    .in("display_name", releaseProbeParticipantNames);
  if (participantReadError) throw participantReadError;

  const participantRows = participants ?? [];
  const participantIds = participantRows.map((participant) => participant.id);
  const inviteCodeIdSet = new Set(participantRows.map((participant) => participant.invite_code_id).filter(Boolean));

  if (participantIds.length) {
    const { data: linkedCodes, error: linkedCodeError } = await supabase
      .from("competition_invite_codes")
      .select("id")
      .eq("competition_id", BUNDESLIGA_COMPETITION_ID)
      .in("participant_id", participantIds);
    if (linkedCodeError) throw linkedCodeError;
    for (const code of linkedCodes ?? []) {
      inviteCodeIdSet.add(code.id);
    }
  }

  const inviteCodeIds = [...inviteCodeIdSet];
  let deletedTips = 0;
  let deletedBonusTips = 0;
  let deletedInviteCodes = 0;
  let deletedParticipants = 0;

  if (participantIds.length) {
    const { data: tips, error: tipDeleteError } = await supabase
      .from("competition_tips")
      .delete()
      .eq("competition_id", BUNDESLIGA_COMPETITION_ID)
      .in("participant_id", participantIds)
      .select("id");
    if (tipDeleteError) throw tipDeleteError;
    deletedTips = tips?.length ?? 0;

    const { data: bonusTips, error: bonusDeleteError } = await supabase
      .from("competition_participant_bonus_tips")
      .delete()
      .eq("competition_id", BUNDESLIGA_COMPETITION_ID)
      .in("participant_id", participantIds)
      .select("participant_id");
    if (bonusDeleteError) throw bonusDeleteError;
    deletedBonusTips = bonusTips?.length ?? 0;
  }

  if (inviteCodeIds.length) {
    const { data: codes, error: codeDeleteError } = await supabase
      .from("competition_invite_codes")
      .delete()
      .eq("competition_id", BUNDESLIGA_COMPETITION_ID)
      .in("id", inviteCodeIds)
      .select("id");
    if (codeDeleteError) throw codeDeleteError;
    deletedInviteCodes = codes?.length ?? 0;
  }

  if (participantIds.length) {
    const { data: deletedRows, error: participantDeleteError } = await supabase
      .from("competition_participants")
      .delete()
      .eq("competition_id", BUNDESLIGA_COMPETITION_ID)
      .in("id", participantIds)
      .select("id");
    if (participantDeleteError) throw participantDeleteError;
    deletedParticipants = deletedRows?.length ?? 0;
  }

  return {
    deletedParticipants,
    deletedTips,
    deletedBonusTips,
    deletedInviteCodes,
    participantIds,
  };
}

async function loadTopScorers(supabase) {
  const { data, error } = await supabase
    .from("competition_top_scorers")
    .select("*")
    .eq("competition_id", BUNDESLIGA_COMPETITION_ID)
    .order("goals", { ascending: false })
    .order("display_name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function ensureTopScorers(supabase, warnings) {
  const existing = await loadTopScorers(supabase);
  if (existing.length) return existing;

  try {
    const goalgetters = await fetchOpenLigaGoalgetters();
    const rows = goalgetters
      .map((row) => normalizeGoalgetter(row, null))
      .filter((row) => row.external_id);
    if (!rows.length) {
      warnings.push("OpenLigaDB lieferte keine Torschützen.");
      return [];
    }
    const { data, error } = await supabase
      .from("competition_top_scorers")
      .upsert(rows, { onConflict: "competition_id,external_id" })
      .select("*");
    if (error) throw error;
    return data ?? [];
  } catch (error) {
    warnings.push(error.message || "Torschützen konnten nicht automatisch importiert werden.");
    return [];
  }
}

async function ensureReleaseParticipants(supabase, names) {
  const participants = [];

  for (const displayName of names) {
    const { data: participant, error: participantError } = await supabase
      .from("competition_participants")
      .upsert({
        competition_id: BUNDESLIGA_COMPETITION_ID,
        display_name: displayName,
      }, { onConflict: "competition_id,display_name" })
      .select("*")
      .single();
    if (participantError) throw participantError;

    const { data: existingCode, error: existingCodeError } = await supabase
      .from("competition_invite_codes")
      .select("*")
      .eq("competition_id", BUNDESLIGA_COMPETITION_ID)
      .eq("participant_id", participant.id)
      .maybeSingle();
    if (existingCodeError) throw existingCodeError;

    let inviteCode = existingCode;
    if (!inviteCode) {
      const { data: insertedCode, error: codeError } = await supabase
        .from("competition_invite_codes")
        .insert({
          competition_id: BUNDESLIGA_COMPETITION_ID,
          code: makeInviteCode("BL"),
          status: "claimed",
          participant_id: participant.id,
          claimed_at: new Date().toISOString(),
        })
        .select("*")
        .single();
      if (codeError) throw codeError;
      inviteCode = insertedCode;
    } else if (inviteCode.status !== "claimed") {
      const { data: updatedCode, error: codeError } = await supabase
        .from("competition_invite_codes")
        .update({
          status: "claimed",
          participant_id: participant.id,
          claimed_at: inviteCode.claimed_at ?? new Date().toISOString(),
        })
        .eq("id", inviteCode.id)
        .select("*")
        .single();
      if (codeError) throw codeError;
      inviteCode = updatedCode;
    }

    if (participant.invite_code_id !== inviteCode.id) {
      const { data: updatedParticipant, error: updateError } = await supabase
        .from("competition_participants")
        .update({ invite_code_id: inviteCode.id })
        .eq("competition_id", BUNDESLIGA_COMPETITION_ID)
        .eq("id", participant.id)
        .select("*")
        .single();
      if (updateError) throw updateError;
      participants.push(updatedParticipant);
    } else {
      participants.push(participant);
    }
  }

  return participants;
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

    if (action === "run-release-probe") {
      const warnings = [];
      const releaseNames = releaseProbeParticipantNames;

      const { data: competition, error: competitionError } = await supabase
        .from("competitions")
        .update({ status: "admin_test", public_enabled: false, updated_at: new Date().toISOString() })
        .eq("id", BUNDESLIGA_COMPETITION_ID)
        .select("*")
        .single();
      if (competitionError) throw competitionError;

      const [
        { data: teams, error: teamError },
        { data: matches, error: matchError },
      ] = await Promise.all([
        supabase
          .from("competition_teams")
          .select("*")
          .eq("competition_id", BUNDESLIGA_COMPETITION_ID)
          .order("name"),
        supabase
          .from("competition_matches")
          .select("id, competition_id, match_number, matchday, phase, team_a_id, team_b_id, source_json")
          .eq("competition_id", BUNDESLIGA_COMPETITION_ID)
          .eq("phase", "league")
          .order("match_number"),
      ]);
      if (teamError) throw teamError;
      if (matchError) throw matchError;

      const teamRows = teams ?? [];
      const leagueMatches = matches ?? [];
      const matchdayOneMatches = leagueMatches.filter((match) => Number(match.matchday) === 1);
      if (teamRows.length < 18) warnings.push(`Nur ${teamRows.length} Teams vorhanden. Bitte OpenLigaDB-Spielplan/Teams prüfen.`);
      if (leagueMatches.length < 306) warnings.push(`Nur ${leagueMatches.length} Liga-Spiele vorhanden. Bitte Spielplanimport prüfen.`);
      if (matchdayOneMatches.length === 0) warnings.push("Spieltag 1 enthält keine Spiele; Tipps und Ergebnisse konnten nicht vollständig vorbereitet werden.");

      const topScorers = await ensureTopScorers(supabase, warnings);
      const participants = await ensureReleaseParticipants(supabase, releaseNames);

      const tipRows = participants.flatMap((participant, participantIndex) =>
        matchdayOneMatches
          .map((match, matchIndex) => {
            if (participantIndex === 2 && matchIndex === 0) return null;
            return {
              competition_id: BUNDESLIGA_COMPETITION_ID,
              participant_id: participant.id,
              match_id: match.id,
              ...releaseProbeScoreFor(match, participantIndex, matchIndex),
              saved_at: new Date().toISOString(),
            };
          })
          .filter(Boolean),
      );
      const { data: tips, error: tipError } = tipRows.length
        ? await supabase
          .from("competition_tips")
          .upsert(tipRows, { onConflict: "competition_id,participant_id,match_id" })
          .select("*")
        : { data: [], error: null };
      if (tipError) throw tipError;

      const championTeam = teamRows[0] ?? null;
      const relegatedTeams = teamRows.slice(-3);
      const topScorer = topScorers[0] ?? null;
      if (!championTeam) warnings.push("Kein Team für Meister-Bonus gefunden.");
      if (relegatedTeams.length < 3) warnings.push("Nicht genug Teams für 3 Absteiger gefunden.");
      if (!topScorer) warnings.push("Kein Torschützenkönig für Bonus gefunden.");

      const bonusRows = participants.map((participant) => ({
        participant_id: participant.id,
        competition_id: BUNDESLIGA_COMPETITION_ID,
        champion_team_id: championTeam?.id ?? null,
        top_scorer_id: topScorer?.id ?? null,
        top_scorer: topScorer?.display_name ?? topScorer?.source_name ?? null,
        relegated_team_ids: relegatedTeams.map((team) => team.id),
        saved_at: new Date().toISOString(),
      }));
      const { data: bonusTips, error: bonusTipError } = await supabase
        .from("competition_participant_bonus_tips")
        .upsert(bonusRows, { onConflict: "participant_id" })
        .select("*");
      if (bonusTipError) throw bonusTipError;

      const resultRows = matchdayOneMatches
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
      if (resultRows.length < matchdayOneMatches.length) {
        warnings.push(`Für Spieltag 1 fehlen ${matchdayOneMatches.length - resultRows.length} Ergebniswerte in OpenLigaDB.`);
      }
      const { data: results, error: resultError } = resultRows.length
        ? await supabase
          .from("competition_results")
          .upsert(resultRows, { onConflict: "match_id" })
          .select("*")
        : { data: [], error: null };
      if (resultError) throw resultError;

      const { data: existingBonusResults, error: existingBonusResultsError } = await supabase
        .from("competition_bonus_results")
        .select("*")
        .eq("competition_id", BUNDESLIGA_COMPETITION_ID)
        .maybeSingle();
      if (existingBonusResultsError) throw existingBonusResultsError;

      let officialBonusResults = existingBonusResults;
      if (
        !existingBonusResults?.champion_team_id &&
        (!existingBonusResults?.top_scorers || existingBonusResults.top_scorers.length === 0) &&
        (!existingBonusResults?.relegated_team_ids || existingBonusResults.relegated_team_ids.length === 0)
      ) {
        const { data, error } = await supabase
          .from("competition_bonus_results")
          .upsert({
            competition_id: BUNDESLIGA_COMPETITION_ID,
            champion_team_id: championTeam?.id ?? null,
            top_scorers: topScorer ? [topScorer.display_name] : [],
            relegated_team_ids: relegatedTeams.map((team) => team.id),
            updated_at: new Date().toISOString(),
          }, { onConflict: "competition_id" })
          .select("*")
          .single();
        if (error) throw error;
        officialBonusResults = data;
      }

      const { data: rankingParticipants, error: rankingParticipantError } = await supabase
        .from("competition_participants")
        .select("id, display_name")
        .eq("competition_id", BUNDESLIGA_COMPETITION_ID);
      if (rankingParticipantError) throw rankingParticipantError;

      return json({
        releaseProbe: {
          competition: {
            status: competition.status,
            publicEnabled: competition.public_enabled,
          },
          participants: participants.map((participant) => ({
            id: participant.id,
            name: participant.display_name,
          })),
          matchday: 1,
          matchdayMatches: matchdayOneMatches.length,
          savedTips: tips?.length ?? 0,
          openTipsKept: matchdayOneMatches.length > 0 ? 1 : 0,
          bonusTips: bonusTips?.length ?? 0,
          importedResults: results?.length ?? 0,
          officialBonusPrepared: Boolean(officialBonusResults),
          rankingRows: rankingParticipants?.length ?? 0,
          warnings,
        },
      });
    }

    if (action === "reset-release-probe") {
      const resetReleaseProbe = await resetReleaseProbeData(supabase);

      const { data: competition, error: competitionError } = await supabase
        .from("competitions")
        .update({ status: "admin_test", public_enabled: false, updated_at: new Date().toISOString() })
        .eq("id", BUNDESLIGA_COMPETITION_ID)
        .select("status, public_enabled")
        .single();
      if (competitionError) throw competitionError;

      return json({
        resetReleaseProbe: {
          ...resetReleaseProbe,
          competition: {
            status: competition.status,
            publicEnabled: competition.public_enabled,
          },
        },
      });
    }

    if (action === "reset-testlab-data") {
      const resetReleaseProbe = await resetReleaseProbeData(supabase);
      const deletedDemoBonusTips = await deleteRowsByCompetition(supabase, "competition_bonus_tips", "participant_id");
      const deletedDemoTips = await deleteRowsByCompetition(supabase, "competition_demo_tips", "id");
      const deletedDemoParticipants = await deleteRowsByCompetition(supabase, "competition_demo_participants", "id");
      const deletedResults = await deleteRowsByCompetition(supabase, "competition_results", "match_id");
      const deletedGoals = await deleteRowsByCompetition(supabase, "competition_goals", "id");
      const deletedBonusResults = await deleteRowsByCompetition(supabase, "competition_bonus_results", "competition_id");

      const { data: competition, error: competitionError } = await supabase
        .from("competitions")
        .update({ status: "admin_test", public_enabled: false, updated_at: new Date().toISOString() })
        .eq("id", BUNDESLIGA_COMPETITION_ID)
        .select("status, public_enabled")
        .single();
      if (competitionError) throw competitionError;

      return json({
        resetTestlabData: {
          deletedDemoParticipants,
          deletedDemoTips,
          deletedDemoBonusTips,
          deletedResults,
          deletedGoals,
          deletedBonusResults,
          resetReleaseProbe,
          competition: {
            status: competition.status,
            publicEnabled: competition.public_enabled,
          },
        },
      });
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

    if (action === "rename-participant") {
      const participantId = String(body.participantId || "").trim();
      const displayName = String(body.displayName || "").trim();
      if (!participantId || displayName.length < 2) return json({ error: "Teilnehmername ist zu kurz." }, 400);

      const { data, error } = await supabase
        .from("competition_participants")
        .update({ display_name: displayName })
        .eq("competition_id", BUNDESLIGA_COMPETITION_ID)
        .eq("id", participantId)
        .select("*")
        .single();
      if (error) throw error;
      return json({ participant: data });
    }

    if (action === "delete-participant") {
      const participantId = String(body.participantId || "").trim();
      if (!participantId) return json({ error: "Teilnehmer fehlt." }, 400);

      const { data: participant, error: readError } = await supabase
        .from("competition_participants")
        .select("id, invite_code_id")
        .eq("competition_id", BUNDESLIGA_COMPETITION_ID)
        .eq("id", participantId)
        .maybeSingle();
      if (readError) throw readError;
      if (!participant) return json({ error: "Teilnehmer wurde nicht gefunden." }, 404);

      const { error: deleteError } = await supabase
        .from("competition_participants")
        .delete()
        .eq("competition_id", BUNDESLIGA_COMPETITION_ID)
        .eq("id", participantId);
      if (deleteError) throw deleteError;

      if (participant.invite_code_id) {
        const { error: codeError } = await supabase
          .from("competition_invite_codes")
          .update({ status: "free", participant_id: null, claimed_at: null })
          .eq("competition_id", BUNDESLIGA_COMPETITION_ID)
          .eq("id", participant.invite_code_id);
        if (codeError) throw codeError;
      }
      return json({ deletedParticipantId: participantId });
    }

    if (action === "save-participant-tip") {
      const participantId = String(body.participantId || "").trim();
      const matchId = String(body.matchId || "").trim();
      const scoreA = Number(body.scoreA);
      const scoreB = Number(body.scoreB);
      if (!participantId || !matchId || !Number.isInteger(scoreA) || !Number.isInteger(scoreB) || scoreA < 0 || scoreA > 12 || scoreB < 0 || scoreB > 12) {
        return json({ error: "Teilnehmer-Tipp ist ungültig." }, 400);
      }

      const { data, error } = await supabase
        .from("competition_tips")
        .upsert({
          competition_id: BUNDESLIGA_COMPETITION_ID,
          participant_id: participantId,
          match_id: matchId,
          score_a: scoreA,
          score_b: scoreB,
          saved_at: new Date().toISOString(),
        }, { onConflict: "competition_id,participant_id,match_id" })
        .select("*")
        .single();
      if (error) throw error;
      return json({ tip: data });
    }

    if (action === "save-participant-bonus") {
      const participantId = String(body.participantId || "").trim();
      if (!participantId) return json({ error: "Teilnehmer fehlt." }, 400);
      const row = {
        participant_id: participantId,
        competition_id: BUNDESLIGA_COMPETITION_ID,
        champion_team_id: body.championTeamId || null,
        top_scorer_id: body.topScorerId || null,
        top_scorer: String(body.topScorer || "").trim() || null,
        relegated_team_ids: Array.isArray(body.relegatedTeamIds) ? body.relegatedTeamIds.slice(0, 3) : [],
        saved_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from("competition_participant_bonus_tips")
        .upsert(row, { onConflict: "participant_id" })
        .select("*")
        .single();
      if (error) throw error;
      return json({ bonusTip: data });
    }

    if (action === "save-bonus-results") {
      const topScorers = Array.isArray(body.topScorers)
        ? body.topScorers.map((name) => String(name || "").trim()).filter(Boolean)
        : [];
      const relegatedTeamIds = Array.isArray(body.relegatedTeamIds) ? body.relegatedTeamIds.slice(0, 3) : [];
      const { data, error } = await supabase
        .from("competition_bonus_results")
        .upsert({
          competition_id: BUNDESLIGA_COMPETITION_ID,
          champion_team_id: body.championTeamId || null,
          top_scorers: topScorers,
          relegated_team_ids: relegatedTeamIds,
          updated_at: new Date().toISOString(),
        }, { onConflict: "competition_id" })
        .select("*")
        .single();
      if (error) throw error;
      return json({ bonusResults: data });
    }

    if (action === "set-competition-status") {
      const status = String(body.status || "admin_test");
      const publicEnabled = Boolean(body.publicEnabled);
      if (!["admin_test", "public", "archived"].includes(status)) return json({ error: "Ungültiger Status." }, 400);
      const { data, error } = await supabase
        .from("competitions")
        .update({ status, public_enabled: publicEnabled, updated_at: new Date().toISOString() })
        .eq("id", BUNDESLIGA_COMPETITION_ID)
        .select("*")
        .single();
      if (error) throw error;
      return json({ competition: data });
    }

    return json({ error: "Unbekannte Bundesliga-Testaktion." }, 400);
  } catch (error) {
    return json({ error: error.message || "Bundesliga-Testaktion fehlgeschlagen." }, 400);
  }
};

export const config = {
  path: "/api/admin-bundesliga-test-actions",
};
