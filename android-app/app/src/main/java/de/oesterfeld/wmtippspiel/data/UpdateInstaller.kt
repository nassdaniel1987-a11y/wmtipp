package de.oesterfeld.wmtippspiel.data

import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.database.Cursor
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
import androidx.core.content.getSystemService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext

class UpdateInstaller(private val context: Context) {
    suspend fun downloadAndOpenInstaller(update: AppUpdate, onProgress: (Int?) -> Unit) = withContext(Dispatchers.IO) {
        ensureInstallPermission()
        val manager = context.getSystemService<DownloadManager>()
            ?: error("Download-Manager ist nicht verfügbar.")
        val request = DownloadManager.Request(Uri.parse(update.apkUrl))
            .setTitle("WM-Tippspiel ${update.versionName}")
            .setDescription("Update wird heruntergeladen")
            .setMimeType(APK_MIME)
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalPublicDir(
                Environment.DIRECTORY_DOWNLOADS,
                "wmtippspiel-${update.versionName}.apk",
            )
        val downloadId = manager.enqueue(request)

        while (true) {
            manager.query(DownloadManager.Query().setFilterById(downloadId)).use { cursor ->
                if (!cursor.moveToFirst()) error("Download konnte nicht gefunden werden.")
                when (cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))) {
                    DownloadManager.STATUS_SUCCESSFUL -> {
                        val apkUri = manager.getUriForDownloadedFile(downloadId)
                            ?: error("Heruntergeladene Datei konnte nicht geöffnet werden.")
                        openInstaller(apkUri)
                        onProgress(100)
                        return@withContext
                    }

                    DownloadManager.STATUS_FAILED -> error("Update-Download fehlgeschlagen.")
                    else -> onProgress(cursor.progressPercent())
                }
            }
            delay(500)
        }
    }

    private fun ensureInstallPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !context.packageManager.canRequestPackageInstalls()) {
            val intent = Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:${context.packageName}"),
            ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            error("Bitte erlaube zuerst Installationen aus dieser App und starte das Update danach erneut.")
        }
    }

    private fun openInstaller(uri: Uri) {
        val intent = Intent(Intent.ACTION_INSTALL_PACKAGE)
            .setData(uri)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
        context.startActivity(intent)
    }

    private fun Cursor.progressPercent(): Int? {
        val downloaded = getLong(getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR))
        val total = getLong(getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES))
        return if (total > 0) ((downloaded * 100) / total).toInt() else null
    }

    private companion object {
        const val APK_MIME = "application/vnd.android.package-archive"
    }
}
