import {
  BUNDESLIGA_COMPETITION_ID,
  getBundesligaSeasonLabel,
  isBundesligaCompetitionId,
} from "./bundesliga.js";
import { json, normalizeCode } from "./supabase.js";

export const BUNDESLIGA_CODE_HEADER = "x-bundesliga-code";
export const BUNDESLIGA_COMPETITION_HEADER = "x-bundesliga-competition";

export class BundesligaHttpError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function bundesligaErrorResponse(error, fallbackMessage) {
  return json({ error: error.message || fallbackMessage }, error.status || 500);
}

export function resolveRequestedBundesligaCompetition(req) {
  const requested = String(req.headers.get(BUNDESLIGA_COMPETITION_HEADER) || "").trim();
  return isBundesligaCompetitionId(requested) ? requested : BUNDESLIGA_COMPETITION_ID;
}

export async function loadBundesligaCompetition(supabase, competitionId = BUNDESLIGA_COMPETITION_ID) {
  const { data, error } = await supabase
    .from("competitions")
    .select("*")
    .eq("id", competitionId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new BundesligaHttpError(`Die Bundesliga-Saison ${getBundesligaSeasonLabel(competitionId)} ist noch nicht eingerichtet.`, 503);
  return data;
}

export async function resolveBundesligaParticipant(req, supabase, { required = false, competitionId = resolveRequestedBundesligaCompetition(req) } = {}) {
  const code = normalizeCode(req.headers.get(BUNDESLIGA_CODE_HEADER));
  if (!code) {
    if (required) throw new BundesligaHttpError("Bitte melde dich mit deinem Bundesliga-Code an.", 401);
    return null;
  }

  const { data: invite, error } = await supabase
    .from("competition_invite_codes")
    .select("code, status, participant:competition_participants!competition_invite_codes_participant_id_fkey(id, competition_id, display_name, invite_code_id)")
    .eq("competition_id", competitionId)
    .eq("code", code)
    .maybeSingle();
  if (error) throw error;

  if (!invite || invite.status === "disabled" || invite.participant?.competition_id !== competitionId) {
    if (required) throw new BundesligaHttpError("Dein Bundesliga-Code ist nicht aktiv.", 401);
    return null;
  }

  return {
    id: invite.participant.id,
    display_name: invite.participant.display_name,
    invite_code_id: invite.participant.invite_code_id,
    code: invite.code,
    competition_id: competitionId,
  };
}

export async function requireBundesligaViewAccess(req, supabase) {
  const competitionId = resolveRequestedBundesligaCompetition(req);
  const competition = await loadBundesligaCompetition(supabase, competitionId);
  const participant = await resolveBundesligaParticipant(req, supabase, { competitionId });
  if (!competition.public_enabled && !participant) {
    throw new BundesligaHttpError(`Die Bundesliga ${getBundesligaSeasonLabel(competitionId)} ist noch nicht öffentlich freigegeben.`, 403);
  }
  return { competition, participant, competitionId };
}
