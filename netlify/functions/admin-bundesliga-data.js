import { requireAdmin } from "./_shared/admin.js";
import { fetchAllPages, fetchExactCount } from "./_shared/pagination.js";
import { json } from "./_shared/supabase.js";
import { buildBundesligaReleaseGates } from "./_shared/bundesliga-release.js";
import {
  BUNDESLIGA_COMPETITION_ID,
  buildBundesligaRulesSummary,
  buildMatchdayLive,
  buildMatchdayStatus,
  buildCompetitionRanking,
  buildDemoRanking,
  buildLeagueTable,
  buildTopScorers,
  hasLikelyBrokenTeamLogoUrl,
  loadCompetitionRuleSettings,
  normalizeTeamLogoUrl,
  pointsFor,
} from "./_shared/bundesliga.js";
import { summarizeHybridObservation } from "./_shared/bundesliga-live-sync.js";

function isMissingRelation(error) {
  return error?.code === "42P01" || error?.code === "PGRST205" || /does not exist|schema cache/i.test(error?.message || "");
}

async function loadOptionalTopScorers(supabase) {
  const { data, error } = await supabase
    .from("competition_top_scorers")
    .select("*")
    .eq("competition_id", BUNDESLIGA_COMPETITION_ID)
    .order("goals", { ascending: false })
    .order("display_name", { ascending: true });
  if (error && isMissingRelation(error)) return [];
  if (error) throw error;
  return data ?? [];
}

export default async (req) => {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  try {
    const { supabase } = await requireAdmin(req);
    const [
      competition,
      teams,
      matches,
      results,
      goals,
      demoParticipants,
      demoTips,
      bonusResults,
      topScorers,
      inviteCodes,
      participants,
      participantTips,
      participantTipCount,
      participantBonusTips,
      participantBonusTipCount,
      ruleSettings,
      releaseGates,
      liveObservations,
    ] = await Promise.all([
      supabase.from("competitions").select("*").eq("id", BUNDESLIGA_COMPETITION_ID).maybeSingle(),
      supabase.from("competition_teams").select("*").eq("competition_id", BUNDESLIGA_COMPETITION_ID).order("name"),
      supabase.from("competition_matches").select("*").eq("competition_id", BUNDESLIGA_COMPETITION_ID).order("match_number"),
      supabase.from("competition_results").select("*").eq("competition_id", BUNDESLIGA_COMPETITION_ID),
      supabase.from("competition_goals").select("*").eq("competition_id", BUNDESLIGA_COMPETITION_ID),
      supabase.from("competition_demo_participants").select("*").eq("competition_id", BUNDESLIGA_COMPETITION_ID).order("created_at"),
      fetchAllPages(() => supabase.from("competition_demo_tips").select("*").eq("competition_id", BUNDESLIGA_COMPETITION_ID).order("saved_at")),
      supabase.from("competition_bonus_results").select("*").eq("competition_id", BUNDESLIGA_COMPETITION_ID).maybeSingle(),
      loadOptionalTopScorers(supabase),
      supabase.from("competition_invite_codes").select("*").eq("competition_id", BUNDESLIGA_COMPETITION_ID).order("created_at", { ascending: false }),
      supabase.from("competition_participants").select("*").eq("competition_id", BUNDESLIGA_COMPETITION_ID).order("created_at"),
      fetchAllPages(() => supabase.from("competition_tips").select("*").eq("competition_id", BUNDESLIGA_COMPETITION_ID).order("saved_at")),
      fetchExactCount(supabase.from("competition_tips").select("id", { count: "exact", head: true }).eq("competition_id", BUNDESLIGA_COMPETITION_ID)),
      fetchAllPages(() => supabase.from("competition_participant_bonus_tips").select("*").eq("competition_id", BUNDESLIGA_COMPETITION_ID)),
      fetchExactCount(supabase.from("competition_participant_bonus_tips").select("participant_id", { count: "exact", head: true }).eq("competition_id", BUNDESLIGA_COMPETITION_ID)),
      loadCompetitionRuleSettings(supabase),
      buildBundesligaReleaseGates(supabase),
      supabase.from("competition_live_observations").select("*").eq("competition_id", BUNDESLIGA_COMPETITION_ID).order("observed_at", { ascending: false }),
    ]);

    for (const response of [competition, teams, matches, results, goals, demoParticipants, bonusResults, inviteCodes, participants, liveObservations]) {
      if (response.error) throw response.error;
    }

    const rawTeams = teams.data ?? [];
    const normalizedTeams = rawTeams.map((team) => ({
      ...team,
      logo_url: normalizeTeamLogoUrl(team.logo_url, team.name),
    }));
    const logoIssues = normalizedTeams
      .filter((team) => !team.logo_url)
      .map((team) => ({
        id: team.id,
        name: team.name,
        reason: "missing",
      }));
    const normalizedLogoCount = rawTeams.filter((team) => (
      team.logo_url && normalizeTeamLogoUrl(team.logo_url) !== team.logo_url
    )).length;
    const likelyBrokenLogoCount = rawTeams.filter((team) => hasLikelyBrokenTeamLogoUrl(team.logo_url)).length;

    const leagueMatches = (matches.data ?? []).filter((match) => match.phase === "league");
    const leagueTeamIds = new Set(leagueMatches.flatMap((match) => [match.team_a_id, match.team_b_id]).filter(Boolean));
    const leagueTeams = normalizedTeams.filter((team) => leagueTeamIds.has(team.id));
    const resultsByMatch = new Map((results.data ?? []).map((result) => [result.match_id, result]));
    const participantsById = new Map((demoParticipants.data ?? []).map((participant) => [participant.id, participant]));
    const realParticipantsById = new Map((participants.data ?? []).map((participant) => [participant.id, participant]));
    const tipsByMatch = new Map();
    const participantTipsByMatch = new Map();
    const goalAggregation = buildTopScorers(goals.data ?? []);
    const topScorerRows = topScorers.length
      ? topScorers.map((row) => ({
          id: row.id,
          externalId: row.external_id,
          name: row.display_name,
          sourceName: row.source_name,
          teamName: row.team_name,
          goals: row.goals,
          manualOverride: row.manual_override,
          updatedAt: row.updated_at,
        }))
      : goalAggregation;
    const incompleteTopScorers = topScorers.filter((row) =>
      !row.source_name || /^[A-ZÄÖÜ]\.\s/u.test(row.display_name || row.source_name || ""),
    ).length;

    demoTips.forEach((tip) => {
      const rows = tipsByMatch.get(tip.match_id) ?? [];
      rows.push(tip);
      tipsByMatch.set(tip.match_id, rows);
    });

    participantTips.forEach((tip) => {
      const rows = participantTipsByMatch.get(tip.match_id) ?? [];
      rows.push(tip);
      participantTipsByMatch.set(tip.match_id, rows);
    });

    const enrichedMatches = (matches.data ?? []).map((match) => {
      const result = resultsByMatch.get(match.id) ?? null;
      return {
        ...match,
        result,
        demoTips: (tipsByMatch.get(match.id) ?? []).map((tip) => ({
          ...tip,
          participantName: participantsById.get(tip.participant_id)?.display_name ?? "Demo-Tipper",
          points: pointsFor(tip, result, ruleSettings),
          hasResult: result?.status === "final",
        })),
        participantTips: (participantTipsByMatch.get(match.id) ?? []).map((tip) => ({
          ...tip,
          participantName: realParticipantsById.get(tip.participant_id)?.display_name ?? "Teilnehmer",
          points: pointsFor(tip, result, ruleSettings),
          hasResult: result?.status === "final",
        })),
      };
    });

    const participantRanking = buildCompetitionRanking(
      participants.data ?? [],
      participantTips,
      results.data ?? [],
      participantBonusTips,
      bonusResults.data ?? null,
      topScorers,
      leagueMatches,
      ruleSettings,
      releaseGates,
    );
    const participantMatchdayStatus = buildMatchdayStatus(leagueMatches, participantTips, results.data ?? []);
    const demoMatchdayStatus = buildMatchdayStatus(leagueMatches, demoTips, results.data ?? []);
    const activeLive = buildMatchdayLive(
      leagueMatches,
      participants.data ?? [],
      participantTips,
      results.data ?? [],
      "",
      Number(new URL(req.url).searchParams.get("matchday")) || 1,
      new Date(),
      ruleSettings,
    );
    const footballDataConfigured = Boolean(Netlify.env.get("FOOTBALL_DATA_API_KEY"));
    const observationsByMatch = new Map();
    (liveObservations.data ?? []).forEach((observation) => {
      const current = observationsByMatch.get(observation.match_id) ?? {};
      current[observation.provider] = observation;
      observationsByMatch.set(observation.match_id, current);
    });
    const sourceChecks = Array.from(observationsByMatch.entries()).map(([matchId, observations]) => {
      const match = leagueMatches.find((row) => row.id === matchId);
      const selectedResult = resultsByMatch.get(matchId) ?? null;
      return {
        matchId,
        label: match ? `${match.team_a_name} - ${match.team_b_name}` : matchId,
        openligadb: observations.openligadb ?? null,
        footballData: observations["football-data"] ?? null,
        selectedResult,
        status: summarizeHybridObservation(observations.openligadb, observations["football-data"], selectedResult, footballDataConfigured),
      };
    }).slice(0, 8);

    return json({
      competition: competition.data,
      teams: normalizedTeams,
      matches: enrichedMatches,
      results: results.data ?? [],
      goals: goals.data ?? [],
      demoParticipants: demoParticipants.data ?? [],
      demoTips,
      bonusResults: bonusResults.data ?? null,
      ruleSettings,
      rulesSummary: buildBundesligaRulesSummary(ruleSettings, competition.data),
      table: buildLeagueTable(leagueMatches, results.data ?? [], leagueTeams),
      ranking: buildDemoRanking(demoParticipants.data ?? [], demoTips, results.data ?? [], ruleSettings),
      participants: participants.data ?? [],
      participantTips,
      participantTipCount,
      participantBonusTips,
      participantBonusTipCount,
      participantRanking,
      participantMatchdayStatus,
      demoMatchdayStatus,
      activeLive,
      liveSources: {
        footballDataConfigured,
        checks: sourceChecks,
      },
      releaseGates,
      topScorers: topScorerRows,
      inviteCodes: inviteCodes.data ?? [],
      dataQuality: {
        source: "OpenLigaDB",
        autoImportEnabled: !competition.data?.live_updates_paused,
        pushRemindersEnabled: Netlify.env.get("BUNDESLIGA_PUSH_REMINDERS_ENABLED") === "true",
        topScorerSource: topScorers.length ? "goalgetters" : "match_goals_fallback",
        topScorerCount: topScorerRows.length,
        incompleteTopScorers,
        logoIssueCount: logoIssues.length,
        logoIssues,
        normalizedLogoCount,
        likelyBrokenLogoCount,
        lastMatchImportAt: (matches.data ?? []).reduce((latest, row) => {
          if (!row.updated_at) return latest;
          return !latest || row.updated_at > latest ? row.updated_at : latest;
        }, null),
        lastResultImportAt: (results.data ?? []).reduce((latest, row) => {
          if (!row.updated_at) return latest;
          return !latest || row.updated_at > latest ? row.updated_at : latest;
        }, null),
        lastTopScorerImportAt: topScorers.reduce((latest, row) => {
          if (!row.updated_at) return latest;
          return !latest || row.updated_at > latest ? row.updated_at : latest;
        }, null),
      },
    });
  } catch (error) {
    return json({ error: error.message || "Bundesliga-Daten konnten nicht geladen werden." }, 400);
  }
};

export const config = {
  path: "/api/admin-bundesliga-data",
};
