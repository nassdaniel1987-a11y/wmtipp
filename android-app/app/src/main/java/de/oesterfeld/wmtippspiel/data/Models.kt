package de.oesterfeld.wmtippspiel.data

data class Participant(
    val id: String,
    val displayName: String,
    val inviteCodeId: String,
)

data class Match(
    val id: String,
    val matchNumber: Int,
    val groupKey: String?,
    val kickoffAt: String?,
    val matchDate: String,
    val matchTime: String,
    val teamA: String,
    val teamB: String,
    val venue: String,
    val city: String,
)

data class Tip(
    val matchId: String,
    val scoreA: Int,
    val scoreB: Int,
)
