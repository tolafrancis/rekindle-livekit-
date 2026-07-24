package com.rekindlebc.ministry;

import android.app.PictureInPictureParams;
import android.content.res.Configuration;
import android.os.Build;
import android.os.Bundle;
import android.util.Rational;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.JSObject;

public class MainActivity extends BridgeActivity {

  private boolean isInCall = false;

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
