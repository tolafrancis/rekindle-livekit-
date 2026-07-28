package com.rekindlebc.app;

import android.app.PictureInPictureParams;
import android.content.Context;
import android.content.res.Configuration;
import android.media.AudioManager;
import android.os.Build;
import android.os.Bundle;
import android.util.Rational;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.JSObject;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import androidx.core.app.NotificationCompat;
import androidx.media.session.MediaButtonReceiver;

public class MainActivity extends BridgeActivity {

  private boolean isInCall = false;
  private MediaSessionCompat mediaSession;
  private static final String MEDIA_CHANNEL_ID = "media_playback";
  private static final int MEDIA_NOTIFICATION_ID = 501;

  private String currentTitle = "";
  private String currentSubtitle = "";
  private boolean currentHasPrevious = false;
  private boolean currentHasNext = false;

  private void initMediaSession() {
    if (mediaSession != null) return;
    mediaSession = new MediaSessionCompat(this, "ReKindleAudioSession");
    mediaSession.setFlags(MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS | MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS);
    
    mediaSession.setCallback(new MediaSessionCompat.Callback() {
      @Override
      public void onPlay() {
        sendMediaAction("play_pause");
      }

      @Override
      public void onPause() {
        sendMediaAction("play_pause");
      }

      @Override
      public void onSkipToNext() {
        sendMediaAction("next");
      }

      @Override
      public void onSkipToPrevious() {
        sendMediaAction("previous");
      }
    });
  }

  private void sendMediaAction(final String action) {
    runOnUiThread(new Runnable() {
      @Override
      public void run() {
        getBridge().getWebView().evaluateJavascript(
          "window.dispatchEvent(new CustomEvent('mediaSessionAction', { detail: { action: '" + action + "' } }));",
          null
        );
      }
    });
  }

  private boolean isBluetoothConnected() {
    AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
      try {
        android.media.AudioDeviceInfo[] devices = am.getDevices(AudioManager.GET_DEVICES_OUTPUTS);
        for (android.media.AudioDeviceInfo device : devices) {
          int type = device.getType();
          if (type == android.media.AudioDeviceInfo.TYPE_BLUETOOTH_A2DP ||
              type == android.media.AudioDeviceInfo.TYPE_BLUETOOTH_SCO ||
              type == 26 || // AudioDeviceInfo.TYPE_BLE_HEADSET
              type == 27) { // AudioDeviceInfo.TYPE_BLE_SPEAKER
            return true;
          }
        }
      } catch (SecurityException e) {
        return am.isBluetoothA2dpOn() || am.isBluetoothScoOn();
      }
    } else {
      return am.isBluetoothA2dpOn() || am.isBluetoothScoOn();
    }
    return false;
  }

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    getBridge().getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      NotificationChannel channel = new NotificationChannel(
          MEDIA_CHANNEL_ID, "Media Playback", NotificationManager.IMPORTANCE_LOW);
      channel.setDescription("Shows currently playing audio");
      NotificationManager nm = getSystemService(NotificationManager.class);
      if (nm != null) {
        nm.createNotificationChannel(channel);
      }
    }

    // Listen for JS messages about call state
    getBridge().getWebView().addJavascriptInterface(new Object() {
      @android.webkit.JavascriptInterface
      public void setCallActive(boolean active) {
        isInCall = active;
        android.util.Log.d("MainActivity", "Call active: " + active);
      }

      @android.webkit.JavascriptInterface
      public String getAudioOutputs() {
        StringBuilder sb = new StringBuilder();
        sb.append("[");
        sb.append("{\"id\":\"earpiece\",\"label\":\"Phone Earpiece\"},");
        sb.append("{\"id\":\"speaker\",\"label\":\"Speaker\"}");
        if (isBluetoothConnected()) {
          sb.append(",{\"id\":\"bluetooth\",\"label\":\"Bluetooth\"}");
        }
        sb.append("]");
        return sb.toString();
      }

      @android.webkit.JavascriptInterface
      public void setAudioOutput(String outputId) {
        AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        switch (outputId) {
          case "speaker":
            am.stopBluetoothSco();
            am.setBluetoothScoOn(false);
            am.setSpeakerphoneOn(true);
            break;
          case "bluetooth":
            am.setSpeakerphoneOn(false);
            am.startBluetoothSco();
            am.setBluetoothScoOn(true);
            break;
          case "earpiece":
          default:
            am.stopBluetoothSco();
            am.setBluetoothScoOn(false);
            am.setSpeakerphoneOn(false);
            break;
        }
      }

      @android.webkit.JavascriptInterface
      public void showMediaNotification(final String title, final String subtitle, final boolean isPlaying, final boolean hasPrevious, final boolean hasNext) {
        runOnUiThread(new Runnable() {
          @Override
          public void run() {
            initMediaSession();
            
            MediaMetadataCompat metadata = new MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
                .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, subtitle)
                .build();
            mediaSession.setMetadata(metadata);
            
            long actions = PlaybackStateCompat.ACTION_PLAY | PlaybackStateCompat.ACTION_PAUSE;
            if (hasPrevious) {
              actions |= PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS;
            }
            if (hasNext) {
              actions |= PlaybackStateCompat.ACTION_SKIP_TO_NEXT;
            }
            
            int state = isPlaying ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED;
            
            PlaybackStateCompat playbackState = new PlaybackStateCompat.Builder()
                .setState(state, PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN, 1.0f)
                .setActions(actions)
                .build();
            mediaSession.setPlaybackState(playbackState);
            
            if (!mediaSession.isActive()) {
              mediaSession.setActive(true);
            }

            currentTitle = title;
            currentSubtitle = subtitle;
            currentHasPrevious = hasPrevious;
            currentHasNext = hasNext;

            MainActivity.this.postMediaNotification(title, subtitle, isPlaying, hasPrevious, hasNext);
          }
        });
      }

      @android.webkit.JavascriptInterface
      public void updateMediaPlaybackState(final boolean isPlaying) {
        runOnUiThread(new Runnable() {
          @Override
          public void run() {
            if (mediaSession == null) return;
            
            PlaybackStateCompat current = mediaSession.getController().getPlaybackState();
            long actions = current != null ? current.getActions() : (PlaybackStateCompat.ACTION_PLAY | PlaybackStateCompat.ACTION_PAUSE);
            int state = isPlaying ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED;
            
            PlaybackStateCompat playbackState = new PlaybackStateCompat.Builder()
                .setState(state, PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN, 1.0f)
                .setActions(actions)
                .build();
            mediaSession.setPlaybackState(playbackState);

            MainActivity.this.postMediaNotification(currentTitle, currentSubtitle, isPlaying, currentHasPrevious, currentHasNext);
          }
        });
      }

      @android.webkit.JavascriptInterface
      public void hideMediaNotification() {
        runOnUiThread(new Runnable() {
          @Override
          public void run() {
            if (mediaSession != null) {
              mediaSession.setActive(false);
              mediaSession.release();
              mediaSession = null;
            }
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
              nm.cancel(MEDIA_NOTIFICATION_ID);
            }
          }
        });
      }
    }, "AndroidBridge");
  }

  private void postMediaNotification(String title, String subtitle, boolean isPlaying, boolean hasPrevious, boolean hasNext) {
    androidx.media.app.NotificationCompat.MediaStyle mediaStyle =
        new androidx.media.app.NotificationCompat.MediaStyle()
            .setMediaSession(mediaSession.getSessionToken());

    NotificationCompat.Builder builder = new NotificationCompat.Builder(this, MEDIA_CHANNEL_ID)
        .setSmallIcon(R.mipmap.ic_launcher)
        .setContentTitle(title)
        .setContentText(subtitle)
        .setStyle(mediaStyle)
        .setOngoing(isPlaying)
        .setOnlyAlertOnce(true)
        .setPriority(NotificationCompat.PRIORITY_LOW);

    int actionCount = 0;
    if (hasPrevious) {
      builder.addAction(android.R.drawable.ic_media_previous, "Previous",
          androidx.media.session.MediaButtonReceiver.buildMediaButtonPendingIntent(
              this, PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS));
      actionCount++;
    }
    builder.addAction(
        isPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
        isPlaying ? "Pause" : "Play",
        androidx.media.session.MediaButtonReceiver.buildMediaButtonPendingIntent(
            this, isPlaying ? PlaybackStateCompat.ACTION_PAUSE : PlaybackStateCompat.ACTION_PLAY));
    int playPauseIndex = actionCount;
    actionCount++;
    if (hasNext) {
      builder.addAction(android.R.drawable.ic_media_next, "Next",
          androidx.media.session.MediaButtonReceiver.buildMediaButtonPendingIntent(
              this, PlaybackStateCompat.ACTION_SKIP_TO_NEXT));
      actionCount++;
    }
    mediaStyle.setShowActionsInCompactView(playPauseIndex);

    NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
    if (nm != null) {
      nm.notify(MEDIA_NOTIFICATION_ID, builder.build());
    }
  }

  @Override
  public void onDestroy() {
    if (mediaSession != null) {
      mediaSession.setActive(false);
      mediaSession.release();
      mediaSession = null;
    }
    NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
    if (nm != null) {
      nm.cancel(MEDIA_NOTIFICATION_ID);
    }
    super.onDestroy();
  }

  @Override
  public void onUserLeaveHint() {
    super.onUserLeaveHint();
    if (isInCall && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      enterPipMode();
    }
  }

  @Override
  public void onPictureInPictureModeChanged(boolean isInPiP, Configuration newConfig) {
    super.onPictureInPictureModeChanged(isInPiP, newConfig);
    final boolean pipActive = isInPiP;
    runOnUiThread(() -> {
      String js = "window.dispatchEvent(new CustomEvent('pipModeChanged', " +
                  "{ detail: { isInPiP: " + pipActive + " } }));";
      getBridge().getWebView().evaluateJavascript(js, null);
    });
  }

  private void enterPipMode() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      PictureInPictureParams params = new PictureInPictureParams.Builder()
        .setAspectRatio(new Rational(16, 9))
        .build();
      enterPictureInPictureMode(params);
    }
  }
}
