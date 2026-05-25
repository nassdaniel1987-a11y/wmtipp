import { makeInviteCode, requireAdmin } from "./_shared/admin.js";
import { json } from "./_shared/supabase.js";
import {
  BUNDESLIGA_LIVE_PROBE_COMPETITION_ID,
  BUNDESLIGA_LIVE_PROBE_MATCH_ID,
} from "./_shared/bundesliga.js";
import { syncLiveCompetition } from "./_shared/bundesliga-live-sync.js";

const PROBE_COMPETITION = {
  id: BUNDESLIGA_LIVE_PROBE_COMPETITION_ID,
  name: "Relegation Liveprobe",
  season_label: "Relegation Liveprobe 2025/2026",
  status: "admin_test",
  source_provider: "openligadb",
  source_league: "rel",
  source_season: 2025,
  public_enabled: false,
  public_slug: BUNDESLIGA_LIVE_PROBE_COMPETITION_ID,
  tip_lock_mode: "kickoff",
};

const PROBE_RULES = {
  competition_id: BUNDESLIGA_LIVE_PROBE_COMPETITION_ID,
  exact_score_points: 4,
  goal_diff_points: 3,
  tendency_points: 2,
  champion_bonus_points: 6,
  top_scorer_bonus_points: 6,
  relegated_team_bonus_points: 4,
  foreign_tips_visible_from: "kickoff",
  tie_breakers: ["points", "matchday_wins", "match_points", "display_name"],
};

async function ensureProbeCompetition(supabase, { resetPause = false } = {}) {
  const now = new Date().toISOString();
  const competitionValues = {
    ...PROBE_COMPETITION,
    updated_at: now,
    ...(resetPause ? { live_updates_paused: false } : {}),
  };
  const { data: competition, error: competitionError } = await supabase
    .from("competitions")
    .upsert(competitionValues, { onConflict: "id" })
    .select("*")
    .single();
  if (competitionError) throw competitionError;
  const { error: ruleError } = await supabase
    .from("competition_rule_settings")
    .upsert({ ...PROBE_RULES, updated_at: now }, { onConflict: "competition_id" });
  if (ruleError) throw ruleError;
  return competition;
}

async function loadProbeState(supabase) {
  const { data: competition, error: competitionError } = await supabase
    .from("competitions")
    .select("*")
    .eq("id", BUNDESLIGA_LIVE_PROBE_COMPETITION_ID)
    .maybeSingle();
  if (competitionError) throw competitionError;
  if (!competition) return { prepared: false, competition: null, participants: [], inviteCodes: [], match: null, result: null, goals: [] };

  const [matches, results, goals, participants, inviteCodes] = await Promise.all([
    supabase.from("competition_matches").select("*").eq("competition_id", BUNDESLIGA_LIVE_PROBE_COMPETITION_ID).order("match_number"),
    supabase.from("competition_results").select("*").eq("competition_id", BUNDESLIGA_LIVE_PROBE_COMPETITION_ID),
    supabase.from("competition_goals").select("*").eq("competition_id", BUNDESLIGA_LIVE_PROBE_COMPETITION_ID).order("minute"),
    supabase.from("competition_participants").select("*").eq("competition_id", BUNDESLIGA_LIVE_PROBE_COMPETITION_ID).order("created_at"),
    supabase.from("competition_invite_codes").select("*").eq("competition_id", BUNDESLIGA_LIVE_PROBE_COMPETITION_ID).order("created_at", { ascending: false }),
  ]);
  for (const response of [matches, results, goals, participants, inviteCodes]) {
    if (response.error) throw response.error;
  }
  const match = matches.data?.[0] ?? null;
  return {
    prepared: Boolean(match),
    competition,
    participants: participants.data ?? [],
    inviteCodes: inviteCodes.data ?? [],
    match,
    result: (results.data ?? []).find((row) => row.match_id === match?.id) ?? null,
    goals: goals.data ?? [],
  };
}

async function createProbeParticipant(supabase, displayName) {
  const code = makeInviteCode("BLP");
  const { data: invite, error: codeError } = await supabase
    .from("competition_invite_codes")
    .insert({ competition_id: BUNDESLIGA_LIVE_PROBE_COMPETITION_ID, code, status: "free" })
    .select("*")
    .single();
  if (codeError) throw codeError;
  const { data: participant, error: participantError } = await supabase
    .from("competition_participants")
    .insert({
      competition_id: BUNDESLIGA_LIVE_PROBE_COMPETITION_ID,
      display_name: displayName,
      invite_code_id: invite.id,
    })
    .select("*")
    .single();
  if (participantError) throw participantError;
  const { data: claimedCode, error: claimError } = await supabase
    .from("competition_invite_codes")
    .update({ status: "claimed", participant_id: participant.id, claimed_at: new Date().toISOString() })
    .eq("id", invite.id)
    .eq("competition_id", BUNDESLIGA_LIVE_PROBE_COMPETITION_ID)
    .select("*")
    .single();
  if (claimError) throw claimError;
  return { participant, code: claimedCode };
}

async function deleteProbe(supabase) {
  const id = BUNDESLIGA_LIVE_PROBE_COMPETITION_ID;
  const tables = [
    "competition_participant_bonus_tips",
    "competition_tips",
    "competition_bonus_tips",
    "competition_demo_tips",
    "competition_demo_participants",
    "competition_results",
    "competition_goals",
    "competition_live_observations",
    "competition_bonus_results",
    "competition_top_scorers",
  ];
  for (const table of tables) {
    const { error } = await supabase.from(table).delete().eq("competition_id", id);
    if (error && !/does not exist|schema cache/i.test(error.message || "")) throw error;
  }
  const { data: participants, error: participantReadError } = await supabase
    .from("competition_participants")
    .select("id")
    .eq("competition_id", id);
  if (participantReadError) throw participantReadError;
  if (participants?.length) {
    const participantIds = participants.map((participant) => participant.id);
    const { error: unlinkCodeError } = await supabase
      .from("competition_invite_codes")
      .update({ participant_id: null, status: "free", claimed_at: null })
      .eq("competition_id", id)
      .in("participant_id", participantIds);
    if (unlinkCodeError) throw unlinkCodeError;
    const { error: unlinkParticipantError } = await supabase
      .from("competition_participants")
      .update({ invite_code_id: null })
      .eq("competition_id", id);
    if (unlinkParticipantError) throw unlinkParticipantError;
  }
  for (const table of ["competition_invite_codes", "competition_participants", "competition_matches", "competition_teams", "competition_rule_settings"]) {
    const { error } = await supabase.from(table).delete().eq("competition_id", id);
    if (error) throw error;
  }
  const { error: competitionDeleteError } = await supabase.from("competitions").delete().eq("id", id);
  if (competitionDeleteError) throw competitionDeleteError;
}

export default async (req) => {
  try {
    const { supabase } = await requireAdmin(req);
    if (req.method === "GET") return json({ probe: await loadProbeState(supabase) });
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    if (action === "prepare") {
      const competition = await ensureProbeCompetition(supabase, { resetPause: true });
      const update = await syncLiveCompetition(supabase, competition, { setup: true });
      return json({ probe: await loadProbeState(supabase), update });
    }
    if (action === "create-participant") {
      const displayName = String(body.displayName || "").trim();
      if (displayName.length < 2 || displayName.length > 80) return json({ error: "Name muss zwischen 2 und 80 Zeichen lang sein." }, 400);
      await ensureProbeCompetition(supabase);
      const created = await createProbeParticipant(supabase, displayName);
      return json({ ...created, probe: await loadProbeState(supabase) });
    }
    if (action === "refresh") {
      const competition = await ensureProbeCompetition(supabase);
      const update = await syncLiveCompetition(supabase, competition, { setup: true });
      return json({ probe: await loadProbeState(supabase), update });
    }
    if (action === "set-paused") {
      const paused = Boolean(body.paused);
      const { error } = await supabase
        .from("competitions")
        .update({ live_updates_paused: paused, updated_at: new Date().toISOString() })
        .eq("id", BUNDESLIGA_LIVE_PROBE_COMPETITION_ID);
      if (error) throw error;
      return json({ probe: await loadProbeState(supabase) });
    }
    if (action === "delete") {
      await deleteProbe(supabase);
      return json({ deleted: true, probe: await loadProbeState(supabase) });
    }
    return json({ error: "Unbekannte Liveprobe-Aktion." }, 400);
  } catch (error) {
    return json({ error: error.message || "Relegations-Liveprobe konnte nicht verarbeitet werden." }, 400);
  }
};

export const config = {
  path: "/api/admin-bundesliga-live-probe",
};
