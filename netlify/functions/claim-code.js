import { getServiceClient, json, normalizeCode } from "./_shared/supabase.js";

export default async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const { code, name } = await req.json();
    const cleanCode = normalizeCode(code);
    const displayName = String(name || "").trim();

    if (!cleanCode || displayName.length < 2) {
      return json({ error: "Code und Name sind erforderlich." }, 400);
    }

    const supabase = getServiceClient();
    const { data: invite, error: inviteError } = await supabase
      .from("invite_codes")
      .select("id, code, status, participant_id")
      .eq("code", cleanCode)
      .maybeSingle();

    if (inviteError) throw inviteError;
    if (!invite) return json({ error: "Dieser QR-Code ist nicht bekannt." }, 404);
    if (invite.status === "disabled") return json({ error: "Dieser QR-Code ist gesperrt." }, 403);

    if (invite.participant_id) {
      const { data: participant, error: participantError } = await supabase
        .from("participants")
        .select("id, display_name, invite_code_id")
        .eq("id", invite.participant_id)
        .single();

      if (participantError) throw participantError;
      return json({ participant, code: cleanCode, alreadyClaimed: true });
    }

    const { data: participant, error: createError } = await supabase
      .from("participants")
      .insert({ display_name: displayName, invite_code_id: invite.id })
      .select("id, display_name, invite_code_id")
      .single();

    if (createError) throw createError;

    const { error: updateError } = await supabase
      .from("invite_codes")
      .update({
        status: "claimed",
        participant_id: participant.id,
        claimed_at: new Date().toISOString(),
      })
      .eq("id", invite.id);

    if (updateError) throw updateError;

    return json({ participant, code: cleanCode, alreadyClaimed: false });
  } catch (error) {
    return json({ error: error.message || "Code konnte nicht aktiviert werden." }, 500);
  }
};

export const config = {
  path: "/api/claim-code",
};
