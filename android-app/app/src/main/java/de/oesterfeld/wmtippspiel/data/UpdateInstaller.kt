package de.oesterfeld.wmtippspiel.data

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File

class UpdateInstaller(
    private val context: Context,
    private val client: OkHttpClient = OkHttpClient(),
) {
    suspend fun downloadAndOpenInstaller(update: AppUpdate, onProgress: (Int?) -> Unit) = withContext(Dispatchers.IO) {
        ensureInstallPermission()
        clearCachedUpdates()
        val targetDir = File(context.cacheDir, UPDATE_DIR).apply { mkdirs() }
        val targetFile = File(targetDir, "wmtippspiel-${update.versionName}.apk")
        client.newCall(Request.Builder().url(update.apkUrl).get().build()).execute().use { response ->
            if (!response.isSuccessful) error("Update-Download fehlgeschlagen.")
            val body = response.body ?: error("Update-Download fehlgeschlagen.")
            val total = body.contentLength()
            body.byteStream().use { input ->
                targetFile.outputStream().use { output ->
                    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                    var downloaded = 0L
                    while (true) {
                        val read = input.read(buffer)
                        if (read == -1) break
                        output.write(buffer, 0, read)
                        downloaded += read
                        onProgress(if (total > 0) ((downloaded * 100) / total).toInt() else null)
                    }
                }
            }
        }
        val apkUri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", targetFile)
        openInstaller(apkUri)
        onProgress(100)
    }

    fun clearCachedUpdates() {
        File(context.cacheDir, UPDATE_DIR).deleteRecursively()
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

    private companion object {
        const val APK_MIME = "application/vnd.android.package-archive"
        const val UPDATE_DIR = "updates"
    }
}
