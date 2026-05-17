package de.oesterfeld.wmtippspiel.data

import android.content.Context
import org.json.JSONObject

class ParticipantStore(context: Context) {
    private val prefs = context.getSharedPreferences("wm_tippspiel", Context.MODE_PRIVATE)

    fun load(): StoredParticipant? {
        val id = prefs.getString("participant_id", null) ?: return null
        val name = prefs.getString("participant_name", null) ?: return null
        val code = prefs.getString("participant_code", null) ?: return null
        return StoredParticipant(id, name, code)
    }

    fun save(participant: Participant, code: String) {
        prefs.edit()
            .putString("participant_id", participant.id)
            .putString("participant_name", participant.displayName)
            .putString("participant_code", code)
            .apply()
    }

    fun clear() {
        prefs.edit().clear().apply()
    }

    fun notificationsEnabled(): Boolean = prefs.getBoolean("notifications_enabled", false)
    fun setNotificationsEnabled(enabled: Boolean) = prefs.edit().putBoolean("notifications_enabled", enabled).apply()
    fun notificationPromptSeen(): Boolean = prefs.getBoolean("notification_prompt_seen", false)
    fun setNotificationPromptSeen() = prefs.edit().putBoolean("notification_prompt_seen", true).apply()
    fun fcmToken(): String? = prefs.getString("fcm_token", null)
    fun setFcmToken(token: String) = prefs.edit().putString("fcm_token", token).apply()
}

data class StoredParticipant(
    val id: String,
    val displayName: String,
    val code: String,
)
