import { getServiceClient, json, normalizeCode } from "./_shared/supabase.js";
import { BUNDESLIGA_COMPETITION_ID } from "./_shared/bundesliga.js";

export default async (req) => {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  try {
    const code = normalizeCode(new URL(req.url).searchParams.get("code"));
    if (!code) return json({ participant: null, codeStatus: "missing" });

    const supabase = getServiceClient();
    const { data: invite, error } = await supabase
      .from("competition_invite_codes")
      .select("id, code, status, participant:competition_participants!competition_invite_codes_participant_id_fkey(id, competition_id, display_name, invite_code_id)")
      .eq("competition_id", BUNDESLIGA_COMPETITION_ID)
      .eq("code", code)
      .maybeSingle();

    if (error) throw error;
    if (!invite) return json({ participant: null, codeStatus: "unknown" }, 404);
    const participant = invite.participant?.competition_id === BUNDESLIGA_COMPETITION_ID ? invite.participant : null;
    return json({ participant, codeStatus: invite.status, code: invite.code });
  } catch (error) {
    return json({ error: error.message || "Bundesliga-Teilnehmer konnte nicht geladen werden." }, 500);
  }
};

export const config = {
  path: "/api/bundesliga-participant",
};
