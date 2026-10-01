package com.rekindlebc.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

/**
 * Required by Android before a MediaProjection can start: since Android 10, the
 * OS tears down an active screen capture the moment the requesting app has no
 * foreground service running, and Android 14+ (API 34, this app's targetSdk)
 * additionally requires the service declare foregroundServiceType="mediaProjection"
 * in the manifest (not passable programmatically to startForeground() on this
 * SDK level — see NativeScreenSharePlugin, which starts this service right before
 * calling LocalParticipant.setScreenShareEnabled()).
 *
 * Mirrors LiveKit's own sample app's ForegroundService (client-sdk-android
 * sample-app-common) almost verbatim — there is no ReKindle-specific logic here,
 * just the minimum Android requires to keep the capture alive.
 */
class ScreenShareForegroundService : Service() {

    companion object {
        private const val CHANNEL_ID = "screen_share_channel"
        private const val NOTIFICATION_ID = 4201
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            createNotificationChannel()
        }
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.app_name))
            .setContentText("Sharing your screen in the meeting")
            .setSmallIcon(android.R.drawable.ic_menu_share)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build()
        startForeground(NOTIFICATION_ID, notification)
        return START_NOT_STICKY
    }

    private fun createNotificationChannel() {
        val manager = getSystemService(NotificationManager::class.java)
        val existing = manager.getNotificationChannel(CHANNEL_ID)
        if (existing != null) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Screen sharing",
            NotificationManager.IMPORTANCE_LOW,
        )
        manager.createNotificationChannel(channel)
    }
}
