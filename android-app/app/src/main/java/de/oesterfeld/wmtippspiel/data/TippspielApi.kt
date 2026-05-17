package de.oesterfeld.wmtippspiel.data

import de.oesterfeld.wmtippspiel.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

class TippspielApi(
    private val client: OkHttpClient = OkHttpClient(),
    private val baseUrl: String = BuildConfig.API_BASE_URL.trimEnd('/'),
) {
    suspend fun claimCode(code: String, name: String): Participant = withContext(Dispatchers.IO) {
        val body = JSONObject().put("code", code).put("name", name).toString().toRequestBody(JSON)
        executeObject(Request.Builder().url("$baseUrl/api/claim-code").post(body).build())
            .getJSONObject("participant").toParticipant()
    }

    suspend fun loadParticipant(code: String): Participant? = withContext(Dispatchers.IO) {
        val encoded = URLEncoder.encode(code, StandardCharsets.UTF_8.toString())
        executeObject(Request.Builder().url("$baseUrl/api/participant?code=$encoded").get().build())
            .optJSONObject("participant")?.toParticipant()
    }

    suspend fun loadMatches(): List<Match> = withContext(Dispatchers.IO) {
        executeObject(Request.Builder().url("$baseUrl/api/matches").get().build())
            .getJSONArray("matches").mapObjects { it.toMatch() }
    }

    suspend fun loadTips(participantId: String): List<Tip> = withContext(Dispatchers.IO) {
        val encoded = URLEncoder.encode(participantId, StandardCharsets.UTF_8.toString())
        executeObject(Request.Builder().url("$baseUrl/api/tips?participantId=$encoded").get().build())
            .getJSONArray("tips").mapObjects { it.toTip() }
    }

    suspend fun saveTip(participantId: String, tip: Tip): List<Tip> = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("participantId", participantId)
            .put("tips", JSONArray().put(JSONObject().put("matchId", tip.matchId).put("scoreA", tip.scoreA).put("scoreB", tip.scoreB)))
            .toString().toRequestBody(JSON)
        executeObject(Request.Builder().url("$baseUrl/api/save-tips").post(body).build())
            .getJSONArray("tips").mapObjects { it.toTip() }
    }

    suspend fun loadBonusTip(participantId: String): BonusTip? = withContext(Dispatchers.IO) {
        val encoded = URLEncoder.encode(participantId, StandardCharsets.UTF_8.toString())
        executeObject(Request.Builder().url("$baseUrl/api/bonus-tips?participantId=$encoded").get().build())
            .optJSONObject("bonusTip")?.toBonusTip(saved = true)
    }

    suspend fun saveBonusTip(participantId: String, bonusTip: BonusTip): BonusTip = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("participantId", participantId)
            .put("champion", bonusTip.champion)
            .put("topScorer", bonusTip.topScorer)
            .put("groupWinners", JSONObject(bonusTip.groupWinners))
            .toString().toRequestBody(JSON)
        executeObject(Request.Builder().url("$baseUrl/api/save-bonus-tips").post(body).build())
            .getJSONObject("bonusTip").toBonusTip(saved = true)
    }

    suspend fun loadBonusResults(): BonusResult? = withContext(Dispatchers.IO) {
        executeObject(Request.Builder().url("$baseUrl/api/bonus-results").get().build())
            .optJSONObject("bonusResults")?.toBonusResult()
    }

    suspend fun loadRanking(): List<RankingRow> = withContext(Dispatchers.IO) {
        executeObject(Request.Builder().url("$baseUrl/api/ranking").get().build())
            .getJSONArray("ranking").mapObjects { it.toRankingRow() }
    }

    suspend fun loadTrends(): Map<String, TipTrend> = withContext(Dispatchers.IO) {
        val trends = executeObject(Request.Builder().url("$baseUrl/api/tip-trends").get().build()).getJSONObject("trends")
        trends.keys().asSequence().associateWith { trends.getJSONObject(it).toTrend() }
    }

    suspend fun loadResults(): List<MatchResult> = withContext(Dispatchers.IO) {
        executeObject(Request.Builder().url("$baseUrl/api/results").get().build())
            .getJSONArray("results").mapObjects { it.toResult() }
    }

    suspend fun loadAppUpdate(): AppUpdate = withContext(Dispatchers.IO) {
        executeObject(Request.Builder().url(BuildConfig.UPDATE_MANIFEST_URL).get().build())
            .toAppUpdate()
    }

    private fun executeObject(request: Request): JSONObject {
        client.newCall(request).execute().use { response ->
            val raw = response.body?.string().orEmpty()
            val payload = runCatching { if (raw.isBlank()) JSONObject() else JSONObject(raw) }
                .getOrElse { throw IllegalStateException("Der Server hat keine JSON-Antwort geliefert. Bitte prüfe, ob das Backend aktuell deployed ist.") }
            if (!response.isSuccessful) throw IllegalStateException(payload.optString("error", "Serverfehler"))
            return payload
        }
    }

    private fun JSONObject.toParticipant() = Participant(getString("id"), getString("display_name"), getString("invite_code_id"))
    private fun JSONObject.toMatch() = Match(
        id = getString("id"), matchNumber = getInt("match_number"), phase = optString("phase", "group"),
        groupKey = optString("group_key").ifBlank { null }, kickoffAt = optString("kickoff_at").ifBlank { null },
        matchDate = getString("match_date"), matchTime = getString("match_time"), teamA = getString("team_a"),
        teamB = getString("team_b"), teamMarkA = optString("flag_code_a"), teamMarkB = optString("flag_code_b"),
        venue = getString("venue"), city = getString("city"),
    )
    private fun JSONObject.toTip() = Tip(getString("match_id"), getInt("score_a"), getInt("score_b"))
    private fun JSONObject.toBonusTip(saved: Boolean) = BonusTip(
        champion = optString("champion"), topScorer = optString("top_scorer"), groupWinners = optJSONObject("group_winners").toStringMap(), saved = saved,
    )
    private fun JSONObject.toBonusResult() = BonusResult(optString("champion"), optString("top_scorer"), optJSONObject("group_winners").toStringMap())
    private fun JSONObject.toRankingRow() = RankingRow(
        name = getString("name"), points = getInt("points"), matchPoints = getInt("matchPoints"), bonusPoints = getInt("bonusPoints"),
        tipCount = getInt("tipCount"), scoredTipCount = getInt("scoredTipCount"), averagePoints = getDouble("averagePoints"),
    )
    private fun JSONObject.toTrend() = TipTrend(getInt("total"), getInt("homeWinPercent"), getInt("drawPercent"), getInt("awayWinPercent"))
    private fun JSONObject.toResult() = MatchResult(getString("match_id"), getInt("score_a"), getInt("score_b"), optString("status", "final"))
    private fun JSONObject.toAppUpdate() = AppUpdate(
        versionCode = getInt("versionCode"),
        versionName = getString("versionName"),
        apkUrl = getString("apkUrl"),
        notes = optString("notes"),
    )
    private fun JSONObject?.toStringMap(): Map<String, String> = this?.keys()?.asSequence()?.associateWith { optString(it) } ?: emptyMap()
    private inline fun <T> JSONArray.mapObjects(transform: (JSONObject) -> T): List<T> = List(length()) { transform(getJSONObject(it)) }
    private companion object { val JSON = "application/json; charset=utf-8".toMediaType() }
}
