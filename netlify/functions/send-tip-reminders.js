import { getServiceClient, json } from "./_shared/supabase.js";
import { getFirebaseMessaging } from "./_shared/firebase-admin.js";

const windows = [
  { key: "24h", targetHours: 24 },
  { key: "3h", targetHours: 3 },
];
const toleranceMinutes = 15;

export default async () => {
  try {
    const now = new Date();
    const supabase = getServiceClient();
    const messaging = getFirebaseMessaging();
    let sent = 0;

    for (const window of windows) {
      const lower = new Date(now.getTime() + (window.targetHours * 60 - toleranceMinutes) * 60_000).toISOString();
      const upper = new Date(now.getTime() + window.targetHours * 60 * 60_000).toISOString();
      const { data: matches, error: matchError } = await supabase
        .from("matches")
        .select("id, match_number, kickoff_at, team_a, team_b")
        .gte("kickoff_at", lower)
        .lt("kickoff_at", upper);
      if (matchError) throw matchError;

      for (const match of matches ?? []) {
        const { data: devices, error } = await supabase
          .from("participant_devices")
          .select("participant_id, fcm_token")
          .eq("notifications_enabled", true);
        if (error) throw error;
        const participantIds = [...new Set((devices ?? []).map((device) => device.participant_id))];
        if (!participantIds.length) continue;
        const [{ data: tips, error: tipError }, { data: reminders, error: reminderReadError }] = await Promise.all([
          supabase.from("tips").select("participant_id").eq("match_id", match.id).in("participant_id", participantIds),
          supabase.from("push_reminders").select("participant_id").eq("match_id", match.id).eq("reminder_type", window.key).in("participant_id", participantIds),
        ]);
        if (tipError) throw tipError;
        if (reminderReadError) throw reminderReadError;
        const tipped = new Set((tips ?? []).map((row) => row.participant_id));
        const reminded = new Set((reminders ?? []).map((row) => row.participant_id));
        const targets = (devices ?? []).filter((row) => !tipped.has(row.participant_id) && !reminded.has(row.participant_id));
        if (!targets.length) continue;

        const responses = await messaging.sendEach(
          targets.map((target) => ({
            notification: {
              title: "Tipp fehlt noch",
              body: `${match.team_a} – ${match.team_b} startet in ${window.key === "24h" ? "24 Stunden" : "3 Stunden"}.`,
            },
            data: { openTab: "Tippen", matchId: match.id },
            token: target.fcm_token,
          })),
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
