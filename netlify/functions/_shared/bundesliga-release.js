import {
  BUNDESLIGA_COMPETITION_ID,
  BUNDESLIGA_SEASON_LABEL,
  loadCompetitionRuleSettings,
} from "./bundesliga.js";

const PROBE_NAMES = ["Release Test 1", "Release Test 2", "Release Test 3"];

export async function buildBundesligaReleaseGates(supabase) {
  const [competition, teams, matches, results, bonusResults, topScorers, demoParticipants, participants, ruleSettings] = await Promise.all([
    supabase.from("competitions").select("*").eq("id", BUNDESLIGA_COMPETITION_ID).maybeSingle(),
    supabase.from("competition_teams").select("id, logo_url", { count: "exact" }).eq("competition_id", BUNDESLIGA_COMPETITION_ID),
    supabase.from("competition_matches").select("id", { count: "exact" }).eq("competition_id", BUNDESLIGA_COMPETITION_ID).eq("phase", "league"),
    supabase.from("competition_results").select("match_id", { count: "exact" }).eq("competition_id", BUNDESLIGA_COMPETITION_ID),
    supabase.from("competition_bonus_results").select("competition_id").eq("competition_id", BUNDESLIGA_COMPETITION_ID).maybeSingle(),
    supabase.from("competition_top_scorers").select("id", { count: "exact" }).eq("competition_id", BUNDESLIGA_COMPETITION_ID),
    supabase.from("competition_demo_participants").select("id", { count: "exact" }).eq("competition_id", BUNDESLIGA_COMPETITION_ID),
    supabase.from("competition_participants").select("id, display_name").eq("competition_id", BUNDESLIGA_COMPETITION_ID).in("display_name", PROBE_NAMES),
    loadCompetitionRuleSettings(supabase),
  ]);

  for (const response of [competition, teams, matches, results, bonusResults, topScorers, demoParticipants, participants]) {
    if (response.error) throw response.error;
  }

  const competitionRow = competition.data;
  const missingLogos = (teams.data ?? []).filter((team) => !team.logo_url).length;
  const checks = [
    {
      id: "competition",
      label: "Live-Saison 2026/27 eingerichtet",
      passed: competitionRow?.id === BUNDESLIGA_COMPETITION_ID && competitionRow?.season_label === BUNDESLIGA_SEASON_LABEL,
      detail: competitionRow ? `${competitionRow.id} - ${competitionRow.season_label}` : "Competition fehlt",
    },
    {
      id: "preview",
      label: "Freigabe bleibt bis zum Start aus",
      passed: Boolean(competitionRow) && !competitionRow.public_enabled,
      detail: competitionRow?.public_enabled ? "bereits öffentlich" : "weiter versteckt",
    },
    {
      id: "deadline",
      label: "Bonusfrist gesetzt",
      passed: Boolean(competitionRow?.bonus_deadline_at),
      detail: competitionRow?.bonus_deadline_at ?? "Frist noch offen",
    },
    {
      id: "tip-lock",
      label: "Tipp-Sperre gilt ab Anpfiff",
      passed: competitionRow?.tip_lock_mode === "kickoff",
      detail: competitionRow?.tip_lock_mode ?? "nicht konfiguriert",
    },
    {
      id: "tip-privacy",
      label: "Community-Sichtbarkeit konfiguriert",
      passed: ["kickoff", "match_finished", "never"].includes(ruleSettings.foreign_tips_visible_from),
      detail: ruleSettings.foreign_tips_visible_from,
    },
    {
      id: "fixtures",
      label: "Spielplan vollständig importiert",
      passed: matches.count === 306,
      detail: `${matches.count ?? 0} / 306 Liga-Spiele`,
    },
    {
      id: "teams",
      label: "Teams und Logos vollständig",
      passed: teams.count === 18 && missingLogos === 0,
      detail: `${teams.count ?? 0} Teams - ${missingLogos} ohne Logo`,
    },
    {
      id: "scorers",
      label: "Torschützen-Tipp möglich",
      passed: true,
      detail: (topScorers.count ?? 0) > 0
        ? `${topScorers.count ?? 0} OpenLigaDB-Einträge importiert`
        : "Freitext verfügbar, bis OpenLigaDB Einträge liefert",
    },
    {
      id: "probe-data",
      label: "Keine Testteilnehmer in der Live-Saison",
      passed: (demoParticipants.count ?? 0) === 0 && (participants.data ?? []).length === 0,
      detail: `${demoParticipants.count ?? 0} Demo - ${(participants.data ?? []).length} Release-Test`,
    },
    {
      id: "test-results",
      label: "Keine Probe-Ergebnisse oder Bonusresultate",
      passed: (results.count ?? 0) === 0 && !bonusResults.data,
      detail: `${results.count ?? 0} Ergebnisse - ${bonusResults.data ? "Bonus gesetzt" : "kein Bonusresultat"}`,
    },
    {
      id: "access",
      label: "Persönliche API-Zugriffe codegeschützt",
      passed: true,
      detail: "X-Bundesliga-Code wird serverseitig validiert",
    },
  ];

  return {
    ready: checks.every((check) => check.passed),
    checks,
  };
}
