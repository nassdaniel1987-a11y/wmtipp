import { getServiceClient, json, normalizeCode } from "./_shared/supabase.js";

export default async (req) => {
  if (req.method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const code = normalizeCode(new URL(req.url).searchParams.get("code"));
    if (!code) return json({ participant: null, codeStatus: "missing" });

    const supabase = getServiceClient();
    const { data: invite, error } = await supabase
      .from("invite_codes")
      .select("id, code, status, participant:participants(id, display_name, invite_code_id)")
      .eq("code", code)
      .maybeSingle();

    if (error) throw error;
    if (!invite) return json({ participant: null, codeStatus: "unknown" }, 404);

    return json({
      participant: invite.participant ?? null,
      codeStatus: invite.status,
      code: invite.code,
    });
  } catch (error) {
    return json({ error: error.message || "Teilnehmer konnte nicht geladen werden." }, 500);
  }
};

export const config = {
  path: "/api/participant",
};
