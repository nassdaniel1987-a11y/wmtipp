import { getServiceClient, json } from "./_shared/supabase.js";
import { bundesligaErrorResponse, requireBundesligaViewAccess } from "./_shared/bundesliga-access.js";
import {
  buildCompetitionRanking,
  buildMatchdayPointRows,
  buildParticipantComfortStats,
  loadCompetitionRuleSettings,
} from "./_shared/bundesliga.js";

export default async (req) => {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  try {
    const supabase = getServiceClient();
    const { participant, competitionId } = await requireBundesligaViewAccess(req, supabase);
    const [participants, tips, results, bonusTips, bonusResults, topScorers, matches, ruleSettings] = await Promise.all([
      supabase.from("competition_participants").select("id, display_name").eq("competition_id", competitionId),
      supabase.from("competition_tips").select("participant_id, match_id, score_a, score_b").eq("competition_id", competitionId),
      supabase.from("competition_results").select("match_id, score_a, score_b, status").eq("competition_id", competitionId),
      supabase.from("competition_participant_bonus_tips").select("*").eq("competition_id", competitionId),
      supabase.from("competition_bonus_results").select("*").eq("competition_id", competitionId).maybeSingle(),
      supabase.from("competition_top_scorers").select("id, display_name").eq("competition_id", competitionId),
      supabase.from("competition_matches").select("id, matchday").eq("competition_id", competitionId).in("phase", ["league", "relegation"]),
      loadCompetitionRuleSettings(supabase, competitionId),
    ]);

    for (const response of [participants, tips, results, bonusTips, bonusResults, topScorers, matches]) {
      if (response.error) throw response.error;
    }

    const participantRows = participants.data ?? [];
    const tipRows = tips.data ?? [];
    const matchRows = matches.data ?? [];
    const resultRows = results.data ?? [];
    const ranking = buildCompetitionRanking(
      participantRows,
      tipRows,
      resultRows,
      bonusTips.data ?? [],
      bonusResults.data ?? null,
      topScorers.data ?? [],
      matchRows,
      ruleSettings,
    );
    const matchdayRows = buildMatchdayPointRows(participantRows, tipRows, matchRows, resultRows, ruleSettings);
    const matchdayWinners = Object.values(
      matchdayRows.reduce((groups, row) => {
        const current = groups[row.matchday] ?? { matchday: row.matchday, winners: [], bestPoints: -1 };
        if (row.scoredTipCount > 0 && row.points > current.bestPoints) {
          current.bestPoints = row.points;
          current.winners = [row];
        } else if (row.scoredTipCount > 0 && row.points === current.bestPoints) {
          current.winners.push(row);
        }
        groups[row.matchday] = current;
        return groups;
      }, {}),
    )
      .filter((row) => row.bestPoints >= 0)
      .sort((first, second) => first.matchday - second.matchday);

    return json({
      ranking,
      matchdayWinners,
      personalStats: participant
        ? buildParticipantComfortStats(participant.id, tipRows, matchRows, resultRows, ruleSettings)
        : null,
    });
  } catch (error) {
    return bundesligaErrorResponse(error, "Bundesliga-Rangliste konnte nicht geladen werden.");
  }
};

export const config = {
  path: "/api/bundesliga-ranking",
};
