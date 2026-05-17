import { getServiceClient, json } from "./_shared/supabase.js";
import { getFirebaseMessaging } from "./_shared/firebase-admin.js";
import { disableInvalidTokens } from "./_shared/tip-reminders.js";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (req.headers.get("x-test-push-secret") !== Netlify.env.get("TEST_PUSH_SECRET")) {
    return json({ error: "Nicht erlaubt." }, 401);
  }

  try {
    const { participantId } = await req.json();
    if (!participantId) return json({ error: "Teilnehmer fehlt." }, 400);

    const supabase = getServiceClient();
    const { data: devices, error } = await supabase
      .from("participant_devices")
      .select("id, fcm_token")
      .eq("participant_id", participantId)
      .eq("notifications_enabled", true);
    if (error) throw error;
    if (!devices?.length) return json({ error: "Kein aktives Gerät gefunden." }, 404);

    const response = await getFirebaseMessaging().sendEach(
      devices.map((device) => ({
        notification: {
          title: "Test-Erinnerung",
          body: "Wenn du das siehst, funktionieren Push-Benachrichtigungen.",
        },
        data: { openTab: "Tippen" },
        token: device.fcm_token,
      })),
    );
    const disabledInvalidTokens = await disableInvalidTokens(supabase, devices, response);

    return json({
      ok: true,
      requested: devices.length,
      successCount: response.successCount,
      failureCount: response.failureCount,
      disabledInvalidTokens,
    });
  } catch (error) {
    return json({ error: error.message || "Test-Push fehlgeschlagen." }, 500);
  }
};

export const config = { path: "/api/send-test-push" };
