import { getServiceClient, json } from "./_shared/supabase.js";
import { getFirebaseMessaging } from "./_shared/firebase-admin.js";
import { buildReminderMessage, findReminderTargets, reminderWindows } from "./_shared/tip-reminders.js";

const toleranceMinutes = 15;

export default async () => {
  try {
    const now = new Date();
    const supabase = getServiceClient();
    const messaging = getFirebaseMessaging();
    let sent = 0;

    for (const window of reminderWindows) {
      const lower = new Date(now.getTime() + (window.targetHours * 60 - toleranceMinutes) * 60_000).toISOString();
      const upper = new Date(now.getTime() + window.targetHours * 60 * 60_000).toISOString();
      const { data: matches, error: matchError } = await supabase
        .from("matches")
        .select("id, match_number, kickoff_at, team_a, team_b")
        .gte("kickoff_at", lower)
        .lt("kickoff_at", upper);
      if (matchError) throw matchError;

      for (const match of matches ?? []) {
        const targets = await findReminderTargets(supabase, match, window.key);
        if (!targets.length) continue;

        const responses = await messaging.sendEach(
          targets.map((target) => buildReminderMessage(match, window.key, target.fcm_token)),
        );
        const successfulRows = [
          ...new Map(
            targets
              .filter((_, index) => responses.responses[index]?.success)
              .map((target) => [
                target.participant_id,
                {
                  participant_id: target.participant_id,
                  match_id: match.id,
                  reminder_type: window.key,
                },
              ]),
          ).values(),
        ];
        if (successfulRows.length) {
          const { error: reminderError } = await supabase.from("push_reminders").insert(successfulRows);
          if (reminderError) throw reminderError;
          sent += successfulRows.length;
        }
      }
    }
    return json({ ok: true, sent, checkedAt: now.toISOString() });
  } catch (error) {
    return json({ ok: false, error: error.message || "Reminder-Versand fehlgeschlagen." }, 500);
  }
};

export const config = { schedule: "*/15 * * * *" };
