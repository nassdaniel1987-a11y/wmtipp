export const reminderWindows = [
  { key: "24h", targetHours: 24 },
  { key: "3h", targetHours: 3 },
];

export async function findReminderTargets(supabase, match, reminderType) {
  const { data: devices, error } = await supabase
    .from("participant_devices")
    .select("participant_id, fcm_token")
    .eq("notifications_enabled", true);
  if (error) throw error;
  const participantIds = [...new Set((devices ?? []).map((device) => device.participant_id))];
  if (!participantIds.length) return [];

  const [{ data: tips, error: tipError }, { data: reminders, error: reminderReadError }] = await Promise.all([
    supabase.from("tips").select("participant_id").eq("match_id", match.id).in("participant_id", participantIds),
    supabase.from("push_reminders").select("participant_id").eq("match_id", match.id).eq("reminder_type", reminderType).in("participant_id", participantIds),
  ]);
  if (tipError) throw tipError;
  if (reminderReadError) throw reminderReadError;

  const tipped = new Set((tips ?? []).map((row) => row.participant_id));
  const reminded = new Set((reminders ?? []).map((row) => row.participant_id));
  return (devices ?? []).filter((row) => !tipped.has(row.participant_id) && !reminded.has(row.participant_id));
}

export function buildReminderMessage(match, reminderType, token) {
  return {
    notification: {
      title: "Tipp fehlt noch",
      body: `${match.team_a} – ${match.team_b} startet in ${reminderType === "24h" ? "24 Stunden" : "3 Stunden"}.`,
    },
    data: { openTab: "Tippen", matchId: match.id },
    token,
  };
}
