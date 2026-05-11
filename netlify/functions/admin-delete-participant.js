import { requireAdmin } from "./_shared/admin.js";
import { json } from "./_shared/supabase.js";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { supabase } = await requireAdmin(req);
    const { participantId } = await req.json();
    if (!participantId) return json({ error: "Teilnehmer fehlt." }, 400);

    const { data: participant, error: participantError } = await supabase
      .from("participants")
      .select("id, invite_code_id")
      .eq("id", participantId)
      .single();

    if (participantError) throw participantError;

    const { error: deleteError } = await supabase
      .from("participants")
      .delete()
      .eq("id", participantId);

    if (deleteError) throw deleteError;

    const { error: codeError } = await supabase
      .from("invite_codes")
      .delete()
      .eq("id", participant.invite_code_id);

    if (codeError) throw codeError;

    return json({ deletedParticipantId: participantId, deletedCodeId: participant.invite_code_id });
  } catch (error) {
    return json({ error: error.message || "Nutzer konnte nicht geloescht werden." }, 401);
  }
};

export const config = {
  path: "/api/admin-delete-participant",
};
