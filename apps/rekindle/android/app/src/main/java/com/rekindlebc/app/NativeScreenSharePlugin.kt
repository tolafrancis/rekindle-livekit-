package com.rekindlebc.app

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.Build
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.Plugin
import androidx.activity.result.ActivityResult
import io.livekit.android.LiveKit
import io.livekit.android.room.Room
import io.livekit.android.room.track.screencapture.ScreenCaptureParams
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Native screen share for Android — see the header comment on the Gradle
 * dependency in app/build.gradle for why this exists at all: the WebView's own
 * getDisplayMedia() is present but non-functional on every mobile browser
 * (confirmed for Chrome specifically — it defines the API but always rejects
 * with NotAllowedError, never actually implemented — see
 * LiveKitRoomWrapper.ts's isLikelyMobileDevice comment), so there is no way to
 * make screen sharing work from the JS side on this platform at all.
 *
 * This plugin instead opens a SECOND, native-only LiveKit connection to the
 * SAME room, under a derived "<identity>-screenshare" identity minted by
 * livekit-token's asScreenShareShadow path (publish-only grant — see that
 * function's own comment), and publishes the MediaProjection-captured screen
 * as that shadow participant's video track. This mirrors a pattern already
 * used in this codebase for a similar problem: the RLT translation bot also
 * joins as a second real participant under a derived identity
 * ("rlt-bot-{sessionId}") rather than trying to inject anything into an
 * existing connection — see LiveKitRoomWrapper.ts's extensive rlt-bot-
 * handling. The JS side (useDailyRoom.ts's startScreenShare /
 * LiveKitRoomWrapper.ts's normalize()) filters this shadow participant out of
 * the visible participant list and merges its video track into the REAL
 * participant's own tile, so it renders identically to a desktop share.
 *
 * Why a second connection instead of somehow feeding the WebView's existing
 * LiveKit room: livekit-client (JS, in the WebView) and this native SDK are
 * two completely separate WebRTC stacks — there is no way to hand a track
 * from one to the other. A shadow participant is the only viable bridge that
 * doesn't require piping raw video frames across the JS bridge every frame
 * (the other option considered — canvas.captureStream() fed by native frames
 * — was rejected for exactly that performance cost).
 */
@CapacitorPlugin(name = "NativeScreenShare")
class NativeScreenSharePlugin : Plugin() {

    private var room: Room? = null
    private val scope = CoroutineScope(Dispatchers.Main)

    @PluginMethod
    fun start(call: PluginCall) {
        val url = call.getString("url")
        val token = call.getString("token")
        if (url.isNullOrEmpty() || token.isNullOrEmpty()) {
            call.reject("url and token are required")
            return
        }

        // Keeps this call's saved state alive across the activity launch below —
        // without it, Capacitor drops the call before handleScreenCaptureResult
        // can resolve/reject it.
        call.setKeepAlive(true)

        val mpm = context.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        startActivityForResult(call, mpm.createScreenCaptureIntent(), "handleScreenCaptureResult")
    }

    @ActivityCallback
    private fun handleScreenCaptureResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return

        if (result.resultCode != Activity.RESULT_OK || result.data == null) {
            call.reject("Screen capture permission was denied")
            return
        }

        val url = call.getString("url")
        val token = call.getString("token")
        if (url.isNullOrEmpty() || token.isNullOrEmpty()) {
            call.reject("url and token are required")
            return
        }
        val projectionData: Intent = result.data!!

        val serviceIntent = Intent(context, ScreenShareForegroundService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(serviceIntent)
        } else {
            context.startService(serviceIntent)
        }

        scope.launch {
            try {
                val newRoom = LiveKit.create(context.applicationContext)
                room = newRoom
                newRoom.connect(url = url, token = token)
                newRoom.localParticipant.setScreenShareEnabled(true, ScreenCaptureParams(projectionData))
                call.resolve()
            } catch (e: Exception) {
                context.stopService(serviceIntent)
                room?.disconnect()
                room = null
                call.reject("Could not start screen sharing: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        val activeRoom = room
        room = null
        scope.launch {
            try {
                activeRoom?.localParticipant?.setScreenShareEnabled(false)
            } catch (e: Exception) {
                // Best-effort — a failure here shouldn't stop the room from being
                // torn down or the foreground service from stopping below.
            }
            activeRoom?.disconnect()
            context.stopService(Intent(context, ScreenShareForegroundService::class.java))
            call.resolve()
        }
    }

    override fun handleOnDestroy() {
        super.handleOnDestroy()
        room?.disconnect()
        room = null
        context.stopService(Intent(context, ScreenShareForegroundService::class.java))
    }
}
