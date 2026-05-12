import { requireAdmin } from "./_shared/admin.js";
import { json } from "./_shared/supabase.js";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { supabase } = await requireAdmin(req);
    const { codeId } = await req.json();
    if (!codeId) return json({ error: "QR-Code fehlt." }, 400);

    const { data: inviteCode, error: readError } = await supabase
      .from("invite_codes")
      .select("id, code, status, participant_id")
      .eq("id", codeId)
      .maybeSingle();

    if (readError) throw readError;
    if (!inviteCode) return json({ error: "QR-Code wurde nicht gefunden." }, 404);
    if (inviteCode.status !== "free" || inviteCode.participant_id) {
      return json({ error: "Nur freie QR-Codes können gelöscht werden." }, 400);
    }

    const { error: deleteError } = await supabase
      .from("invite_codes")
      .delete()
      .eq("id", codeId);

    if (deleteError) throw deleteError;

    return json({ deletedCodeId: codeId });
  } catch (error) {
    return json({ error: error.message || "QR-Code konnte nicht gelöscht werden." }, 401);
  }
};

export const config = {
  path: "/api/admin-delete-code",
};
