package de.oesterfeld.wmtippspiel.data

data class Participant(val id: String, val displayName: String, val inviteCodeId: String)

data class Match(
    val id: String,
    val matchNumber: Int,
    val phase: String,
    val groupKey: String?,
    val kickoffAt: String?,
    val matchDate: String,
    val matchTime: String,
    val teamA: String,
    val teamB: String,
    val teamMarkA: String,
    val teamMarkB: String,
    val venue: String,
    val city: String,
)

data class Tip(val matchId: String, val scoreA: Int, val scoreB: Int)

data class TipDraft(val matchId: String, val scoreA: String = "", val scoreB: String = "", val saved: Boolean = false) {
    val isValid: Boolean get() = scoreA.toIntOrNull() in 0..12 && scoreB.toIntOrNull() in 0..12
}

data class BonusTip(
    val champion: String = "",
    val topScorer: String = "",
    val groupWinners: Map<String, String> = emptyMap(),
    val saved: Boolean = false,
)

data class BonusResult(
    val champion: String = "",
    val topScorer: String = "",
    val groupWinners: Map<String, String> = emptyMap(),
)

data class RankingRow(
    val name: String,
    val points: Int,
    val matchPoints: Int,
    val bonusPoints: Int,
    val tipCount: Int,
    val scoredTipCount: Int,
    val averagePoints: Double,
)

data class TipTrend(
    val total: Int = 0,
    val homeWinPercent: Int = 0,
    val drawPercent: Int = 0,
    val awayWinPercent: Int = 0,
)

data class MatchResult(
    val matchId: String,
    val scoreA: Int,
    val scoreB: Int,
    val status: String,
)

data class GroupStanding(
    val team: String,
    val teamMark: String,
    val played: Int = 0,
    val won: Int = 0,
    val drawn: Int = 0,
    val lost: Int = 0,
    val goalsFor: Int = 0,
    val goalsAgainst: Int = 0,
    val points: Int = 0,
) {
    val goalDifference: Int get() = goalsFor - goalsAgainst
}

data class GroupTable(
    val groupKey: String,
    val rows: List<GroupStanding>,
)
