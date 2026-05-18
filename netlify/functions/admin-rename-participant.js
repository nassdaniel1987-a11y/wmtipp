import { requireAdmin } from "./_shared/admin.js";
import { json } from "./_shared/supabase.js";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { supabase } = await requireAdmin(req);
    const { participantId, displayName } = await req.json();
    const cleanName = String(displayName || "").trim();

    if (!participantId) return json({ error: "Teilnehmer fehlt." }, 400);
    if (cleanName.length < 2 || cleanName.length > 80) {
      return json({ error: "Name muss zwischen 2 und 80 Zeichen lang sein." }, 400);
    }

    const { data: participant, error } = await supabase
      .from("participants")
      .update({ display_name: cleanName })
      .eq("id", participantId)
      .select("id, display_name, invite_code_id, created_at")
      .single();

    if (error) throw error;

    return json({ participant });
  } catch (error) {
    return json({ error: error.message || "Name konnte nicht geändert werden." }, 401);
  }
};

export const config = {
  path: "/api/admin-rename-participant",
};
