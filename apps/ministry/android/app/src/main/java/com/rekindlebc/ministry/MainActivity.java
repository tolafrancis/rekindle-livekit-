package com.rekindlebc.ministry;

import android.app.PictureInPictureParams;
import android.content.Context;
import android.content.res.Configuration;
import android.media.AudioManager;
import android.os.Build;
import android.os.Bundle;
import android.util.Rational;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.JSObject;

public class MainActivity extends BridgeActivity {

  private boolean isInCall = false;

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
    }, "AndroidBridge");
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
