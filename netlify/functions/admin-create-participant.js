import { makeInviteCode, requireAdmin } from "./_shared/admin.js";
import { json } from "./_shared/supabase.js";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { supabase } = await requireAdmin(req);
    const { name, prefix = "WM" } = await req.json();
    const displayName = String(name || "").trim();

    if (displayName.length < 2 || displayName.length > 80) {
      return json({ error: "Name muss zwischen 2 und 80 Zeichen lang sein." }, 400);
    }

    const cleanPrefix =
      String(prefix || "WM").replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 8) || "WM";

    let invite = null;
    let attempts = 0;

    while (!invite && attempts < 5) {
      attempts += 1;
      const { data, error } = await supabase
        .from("invite_codes")
        .insert({ code: makeInviteCode(cleanPrefix), status: "free" })
        .select("id, code, status, created_at")
        .single();

      if (!error) invite = data;
      if (error && error.code !== "23505") throw error;
    }

    if (!invite) return json({ error: "Code konnte nicht eindeutig erzeugt werden." }, 500);

    const { data: participant, error: participantError } = await supabase
      .from("participants")
      .insert({ display_name: displayName, invite_code_id: invite.id })
      .select("id, display_name, invite_code_id, created_at")
      .single();

    if (participantError) throw participantError;

    const { data: code, error: updateError } = await supabase
      .from("invite_codes")
      .update({
        status: "claimed",
        participant_id: participant.id,
        claimed_at: new Date().toISOString(),
      })
      .eq("id", invite.id)
      .select("id, code, status, claimed_at")
      .single();

    if (updateError) throw updateError;

    return json({
      participant,
      code: {
        ...code,
        participant: {
          id: participant.id,
          display_name: participant.display_name,
        },
      },
    });
  } catch (error) {
    return json({ error: error.message || "Nutzer konnte nicht erstellt werden." }, 401);
  }
};

export const config = {
  path: "/api/admin-create-participant",
};
