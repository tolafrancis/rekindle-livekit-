package com.rekindlebc.app

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat

/**
 * Keeps a live meeting connected while the app is in the background
 * (2026-10-21). Without it, pressing Home (or leaving PiP) let Android cut the
 * WebView's microphone and, on Android 14+, freeze the cached process, so the
 * LiveKit server timed the participant out and the meeting only came back
 * when the app was reopened.
 *
 * Started by MainActivity when the web layer reports a call (setCallActive),
 * which always happens while the app is in the foreground, as Android
 * requires for a microphone-type service. Type microphone only: the camera is
 * left to pause in the background, the way other meeting apps behave.
 */
class MeetingForegroundService : Service() {

    companion object {
        private const val TAG = "MeetingFgService"
        private const val CHANNEL_ID = "meeting_channel"
        private const val NOTIFICATION_ID = 4202

        fun start(context: Context) {
            // A microphone-type service can't start without the permission;
            // without it there's no live mic to keep anyway.
            if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) return
            try {
                ContextCompat.startForegroundService(context, Intent(context, MeetingForegroundService::class.java))
            } catch (e: Exception) {
                Log.w(TAG, "Couldn't start meeting service", e)
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, MeetingForegroundService::class.java))
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            createNotificationChannel()
        }
        val openApp = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.app_name))
            .setContentText("You're in a meeting. Tap to return.")
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentIntent(openApp)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build()
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
        } else {
            0
        }
        try {
            ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, type)
        } catch (e: Exception) {
            // e.g. started from the background, or the mic permission was revoked.
            Log.w(TAG, "Couldn't enter the foreground", e)
            stopSelf()
        }
        return START_NOT_STICKY
    }

    private fun createNotificationChannel() {
        val manager = getSystemService(NotificationManager::class.java)
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Live meetings",
            NotificationManager.IMPORTANCE_LOW,
        )
        manager.createNotificationChannel(channel)
    }
}
