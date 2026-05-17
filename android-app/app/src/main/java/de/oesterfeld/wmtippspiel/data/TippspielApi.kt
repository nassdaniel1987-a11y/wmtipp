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
        val body = JSONObject()
            .put("code", code)
            .put("name", name)
            .toString()
            .toRequestBody(JSON)
        val request = Request.Builder()
            .url("$baseUrl/api/claim-code")
            .post(body)
            .build()

        executeObject(request).getJSONObject("participant").toParticipant()
    }

    suspend fun loadParticipant(code: String): Participant? = withContext(Dispatchers.IO) {
        val encoded = URLEncoder.encode(code, StandardCharsets.UTF_8.toString())
        val request = Request.Builder()
            .url("$baseUrl/api/participant?code=$encoded")
            .get()
            .build()
        val payload = executeObject(request)
        payload.optJSONObject("participant")?.toParticipant()
    }

    suspend fun loadMatches(): List<Match> = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url("$baseUrl/api/matches")
            .get()
            .build()
        executeObject(request).getJSONArray("matches").mapObjects { it.toMatch() }
    }

    suspend fun loadTips(participantId: String): List<Tip> = withContext(Dispatchers.IO) {
        val encoded = URLEncoder.encode(participantId, StandardCharsets.UTF_8.toString())
        val request = Request.Builder()
            .url("$baseUrl/api/tips?participantId=$encoded")
            .get()
            .build()
        executeObject(request).getJSONArray("tips").mapObjects { it.toTip() }
    }

    suspend fun saveTip(participantId: String, tip: Tip): List<Tip> = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("participantId", participantId)
            .put(
                "tips",
                JSONArray().put(
                    JSONObject()
                        .put("matchId", tip.matchId)
                        .put("scoreA", tip.scoreA)
                        .put("scoreB", tip.scoreB),
                ),
            )
            .toString()
            .toRequestBody(JSON)
        val request = Request.Builder()
            .url("$baseUrl/api/save-tips")
            .post(body)
            .build()
        executeObject(request).getJSONArray("tips").mapObjects { it.toTip() }
    }

    private fun executeObject(request: Request): JSONObject {
        client.newCall(request).execute().use { response ->
            val raw = response.body?.string().orEmpty()
            val payload = runCatching {
                if (raw.isBlank()) JSONObject() else JSONObject(raw)
            }.getOrElse {
                throw IllegalStateException(
                    "Der Server hat keine JSON-Antwort geliefert. Bitte prüfe, ob das Backend aktuell deployed ist.",
                )
            }
            if (!response.isSuccessful) {
                throw IllegalStateException(payload.optString("error", "Serverfehler"))
            }
            return payload
        }
    }

    private fun JSONObject.toParticipant() = Participant(
        id = getString("id"),
        displayName = getString("display_name"),
        inviteCodeId = getString("invite_code_id"),
    )

    private fun JSONObject.toMatch() = Match(
        id = getString("id"),
        matchNumber = getInt("match_number"),
        groupKey = optString("group_key").ifBlank { null },
        kickoffAt = optString("kickoff_at").ifBlank { null },
        matchDate = getString("match_date"),
        matchTime = getString("match_time"),
        teamA = getString("team_a"),
        teamB = getString("team_b"),
        venue = getString("venue"),
        city = getString("city"),
    )

    private fun JSONObject.toTip() = Tip(
        matchId = getString("match_id"),
        scoreA = getInt("score_a"),
        scoreB = getInt("score_b"),
    )

    private inline fun <T> JSONArray.mapObjects(transform: (JSONObject) -> T): List<T> =
        List(length()) { index -> transform(getJSONObject(index)) }

    private companion object {
        val JSON = "application/json; charset=utf-8".toMediaType()
    }
}
