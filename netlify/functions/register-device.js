import { getServiceClient, json } from "./_shared/supabase.js";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const { participantId, token, platform, notificationsEnabled } = await req.json();
    if (!participantId || !token || platform !== "android") {
      return json({ error: "Teilnehmer, Android-Gerät und Token sind erforderlich." }, 400);
    }
    const supabase = getServiceClient();
    const { data: participant, error: participantError } = await supabase
      .from("participants")
      .select("id")
      .eq("id", participantId)
      .maybeSingle();
    if (participantError) throw participantError;
    if (!participant) return json({ error: "Teilnehmer nicht gefunden." }, 404);

    const { data, error } = await supabase
      .from("participant_devices")
      .upsert(
        {
          participant_id: participantId,
          fcm_token: token,
          platform,
          notifications_enabled: Boolean(notificationsEnabled),
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "fcm_token" },
      )
      .select("id, notifications_enabled, last_seen_at")
      .single();
    if (error) throw error;
    return json({ device: data });
  } catch (error) {
    return json({ error: error.message || "Gerät konnte nicht registriert werden." }, 500);
  }
};

export const config = { path: "/api/register-device" };
