package com.lexicard.app;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onBackPressed() {
        // Send back button event to the WebView JavaScript
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().evaluateJavascript(
                "(function(){" +
                "  if(typeof handleAndroidBack==='function'){" +
                "    handleAndroidBack();" +
                "    return 'HANDLED';" +
                "  } else {" +
                "    return 'EXIT';" +
                "  }" +
                "})()",
                value -> {
                    // If JS didn't handle it or returned EXIT, minimize app
                    if (value == null || value.contains("EXIT")) {
                        runOnUiThread(() -> moveTaskToBack(true));
                    }
                }
            );
        } else {
            moveTaskToBack(true);
        }
    }
}
