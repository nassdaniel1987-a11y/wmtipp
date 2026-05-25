import { getServiceClient, json } from "./_shared/supabase.js";
import { getFirebaseMessaging } from "./_shared/firebase-admin.js";
import { buildReminderMessage, disableInvalidTokens, findReminderTargets, reminderWindows } from "./_shared/tip-reminders.js";
import { BUNDESLIGA_COMPETITION_ID } from "./_shared/bundesliga.js";

const toleranceMinutes = 15;

export default async () => {
  try {
    const now = new Date();
    const supabase = getServiceClient();
    const messaging = getFirebaseMessaging();
    let sent = 0;

    for (const reminderWindow of reminderWindows) {
      const lower = new Date(now.getTime() + (reminderWindow.targetHours * 60 - toleranceMinutes) * 60_000).toISOString();
      const upper = new Date(now.getTime() + reminderWindow.targetHours * 60 * 60_000).toISOString();
      const { data: matches, error: matchError } = await supabase
        .from("matches")
        .select("id, match_number, kickoff_at, team_a, team_b")
        .gte("kickoff_at", lower)
        .lt("kickoff_at", upper);
      if (matchError) throw matchError;

      for (const match of matches ?? []) {
        const targets = await findReminderTargets(supabase, match, reminderWindow.key);
        if (!targets.length) continue;

        const responses = await messaging.sendEach(
          targets.map((target) => buildReminderMessage(match, reminderWindow.key, target.fcm_token)),
        );
        await disableInvalidTokens(supabase, targets, responses);
        const successfulRows = [
          ...new Map(
            targets
              .filter((_, index) => responses.responses[index]?.success)
              .map((target) => [
                target.participant_id,
                {
                  participant_id: target.participant_id,
                  match_id: match.id,
                  reminder_type: reminderWindow.key,
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

      if (Netlify.env.get("BUNDESLIGA_PUSH_REMINDERS_ENABLED") === "true") {
        const { data: bundesligaMatches, error: bundesligaMatchError } = await supabase
          .from("competition_matches")
          .select("id, match_number, kickoff_at, team_a_name, team_b_name")
          .eq("competition_id", BUNDESLIGA_COMPETITION_ID)
          .eq("phase", "league")
          .gte("kickoff_at", lower)
          .lt("kickoff_at", upper);
        if (bundesligaMatchError) throw bundesligaMatchError;

        for (const match of bundesligaMatches ?? []) {
          const { data: participants, error: participantError } = await supabase
            .from("competition_participants")
            .select("id")
            .eq("competition_id", BUNDESLIGA_COMPETITION_ID);
          if (participantError) throw participantError;
          const participantIds = (participants ?? []).map((participant) => participant.id);
          if (!participantIds.length) continue;

          const [{ data: devices, error: deviceError }, { data: tips, error: tipError }, { data: reminders, error: reminderError }] = await Promise.all([
            supabase.from("participant_devices").select("participant_id, fcm_token").eq("notifications_enabled", true).in("participant_id", participantIds),
            supabase.from("competition_tips").select("participant_id").eq("competition_id", BUNDESLIGA_COMPETITION_ID).eq("match_id", match.id).in("participant_id", participantIds),
            supabase.from("push_reminders").select("participant_id").eq("match_id", match.id).eq("reminder_type", `bundesliga-${reminderWindow.key}`).in("participant_id", participantIds),
          ]);
          if (deviceError) throw deviceError;
          if (tipError) throw tipError;
          if (reminderError) throw reminderError;

          const tipped = new Set((tips ?? []).map((row) => row.participant_id));
          const reminded = new Set((reminders ?? []).map((row) => row.participant_id));
          const targets = (devices ?? []).filter((row) => !tipped.has(row.participant_id) && !reminded.has(row.participant_id));
          if (!targets.length) continue;

          const reminderMatch = {
            id: match.id,
            match_number: match.match_number,
            kickoff_at: match.kickoff_at,
            team_a: match.team_a_name,
            team_b: match.team_b_name,
          };
          const responses = await messaging.sendEach(
            targets.map((target) => ({
              ...buildReminderMessage(reminderMatch, reminderWindow.key, target.fcm_token),
              data: { openTab: "BundesligaTippen", matchId: match.id, competitionId: BUNDESLIGA_COMPETITION_ID },
            })),
          );
          await disableInvalidTokens(supabase, targets, responses);
          const successfulRows = [
            ...new Map(
              targets
                .filter((_, index) => responses.responses[index]?.success)
                .map((target) => [
                  target.participant_id,
                  {
                    participant_id: target.participant_id,
                    match_id: match.id,
                    reminder_type: `bundesliga-${reminderWindow.key}`,
                  },
                ]),
            ).values(),
          ];
          if (successfulRows.length) {
            const { error: insertError } = await supabase.from("push_reminders").insert(successfulRows);
            if (insertError) throw insertError;
            sent += successfulRows.length;
          }
        }
      }
    }
    return json({ ok: true, sent, checkedAt: now.toISOString() });
  } catch (error) {
    return json({ ok: false, error: error.message || "Reminder-Versand fehlgeschlagen." }, 500);
  }
};

export const config = { schedule: "*/15 * * * *" };
