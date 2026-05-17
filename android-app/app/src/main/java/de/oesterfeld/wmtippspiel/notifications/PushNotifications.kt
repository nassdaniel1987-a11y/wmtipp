package de.oesterfeld.wmtippspiel.notifications

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import de.oesterfeld.wmtippspiel.MainActivity
import de.oesterfeld.wmtippspiel.R
import de.oesterfeld.wmtippspiel.data.ParticipantStore
import de.oesterfeld.wmtippspiel.data.TippspielApi
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

object PushNotifications {
    const val channelId = "tip_reminders"
    const val openTabExtra = "open_tab"
    const val tipsTabValue = "Tippen"

    fun isConfigured(context: Context): Boolean = runCatching {
        val googleAppIdRes = context.resources.getIdentifier("google_app_id", "string", context.packageName)
        googleAppIdRes != 0 && context.getString(googleAppIdRes).isNotBlank()
    }.getOrDefault(false)

    fun fetchToken(context: Context, onToken: (String) -> Unit, onFailure: (() -> Unit)? = null) {
        FirebaseMessaging.getInstance().token
            .addOnSuccessListener(onToken)
            .addOnFailureListener { onFailure?.invoke() }
    }

    fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(channelId, "Tipp-Erinnerungen", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "Erinnerungen an noch offene Spieltipps"
            },
        )
    }

    fun showTipReminder(context: Context, title: String, body: String) {
        ensureChannel(context)
        val intent = Intent(context, MainActivity::class.java)
            .putExtra(openTabExtra, tipsTabValue)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        val pendingIntent = PendingIntent.getActivity(
            context,
            1001,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()
        context.getSystemService(NotificationManager::class.java).notify((System.currentTimeMillis() % Int.MAX_VALUE).toInt(), notification)
    }
}

class WmFirebaseMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        val store = ParticipantStore(this)
        store.setFcmToken(token)
        val participant = store.load()
        if (participant != null && store.notificationsEnabled()) {
            CoroutineScope(Dispatchers.IO).launch {
                runCatching { TippspielApi().registerDevice(participant.id, token, true) }
            }
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val title = message.notification?.title ?: message.data["title"] ?: "Tipp-Erinnerung"
        val body = message.notification?.body ?: message.data["body"] ?: "Ein Spiel startet bald und dein Tipp fehlt noch."
        PushNotifications.showTipReminder(this, title, body)
    }
}
