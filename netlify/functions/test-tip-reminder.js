import { getServiceClient, json } from "./_shared/supabase.js";
import { getFirebaseMessaging } from "./_shared/firebase-admin.js";
import { buildReminderMessage, findReminderTargets } from "./_shared/tip-reminders.js";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (req.headers.get("x-test-push-secret") !== Netlify.env.get("TEST_PUSH_SECRET")) {
    return json({ error: "Nicht erlaubt." }, 401);
  }

  try {
    const { matchId, reminderType, send = false } = await req.json();
    if (!matchId || !["24h", "3h"].includes(reminderType)) {
      return json({ error: "Spiel und Reminder-Typ sind erforderlich." }, 400);
    }
    const supabase = getServiceClient();
    const { data: match, error: matchError } = await supabase
      .from("matches")
      .select("id, match_number, kickoff_at, team_a, team_b")
      .eq("id", matchId)
      .single();
    if (matchError) throw matchError;

    const targets = await findReminderTargets(supabase, match, reminderType);
    if (!send) {
      return json({
        ok: true,
        mode: "preview",
        match,
        reminderType,
        targetCount: targets.length,
        participantIds: [...new Set(targets.map((target) => target.participant_id))],
      });
    }

    const response = await getFirebaseMessaging().sendEach(
      targets.map((target) => buildReminderMessage(match, reminderType, target.fcm_token)),
    );
    return json({
      ok: true,
      mode: "send",
      match,
      reminderType,
      requested: targets.length,
      successCount: response.successCount,
      failureCount: response.failureCount,
    });
  } catch (error) {
    return json({ error: error.message || "Reminder-Test fehlgeschlagen." }, 500);
  }
};

export const config = { path: "/api/test-tip-reminder" };
