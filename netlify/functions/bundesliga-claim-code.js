import { getServiceClient, json, normalizeCode } from "./_shared/supabase.js";
import { resolveRequestedBundesligaCompetition } from "./_shared/bundesliga-access.js";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { code, name } = await req.json();
    const cleanCode = normalizeCode(code);
    const displayName = String(name || "").trim();
    if (!cleanCode || displayName.length < 2) return json({ error: "Code und Name sind erforderlich." }, 400);

    const supabase = getServiceClient();
    const competitionId = resolveRequestedBundesligaCompetition(req);
    const { data: invite, error: inviteError } = await supabase
      .from("competition_invite_codes")
      .select("id, code, status, participant_id")
      .eq("competition_id", competitionId)
      .eq("code", cleanCode)
      .maybeSingle();
    if (inviteError) throw inviteError;
    if (!invite) return json({ error: "Dieser Bundesliga-Code ist nicht bekannt." }, 404);
    if (invite.status === "disabled") return json({ error: "Dieser Bundesliga-Code ist gesperrt." }, 403);

    if (invite.participant_id) {
      const { data: participant, error } = await supabase
        .from("competition_participants")
        .select("id, display_name, invite_code_id")
        .eq("competition_id", competitionId)
        .eq("id", invite.participant_id)
        .maybeSingle();
      if (error) throw error;
      if (!participant) return json({ error: "Dieser Bundesliga-Code ist nicht korrekt verknüpft." }, 409);
      return json({ participant, code: cleanCode, alreadyClaimed: true });
    }

    const { data: participant, error: createError } = await supabase
      .from("competition_participants")
      .insert({ competition_id: competitionId, display_name: displayName, invite_code_id: invite.id })
      .select("id, display_name, invite_code_id")
      .single();
    if (createError?.code === "23505") {
      return json({ error: "Dieser Bundesliga-Code wurde gerade bereits aktiviert." }, 409);
    }
    if (createError) throw createError;

    return json({ participant, code: cleanCode, alreadyClaimed: false });
  } catch (error) {
    return json({ error: error.message || "Bundesliga-Code konnte nicht aktiviert werden." }, 500);
  }
};

export const config = {
  path: "/api/bundesliga-claim-code",
};
