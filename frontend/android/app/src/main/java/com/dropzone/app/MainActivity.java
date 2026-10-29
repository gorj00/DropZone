package com.dropzone.app;

import android.os.Bundle;

import com.dropzone.app.lock.AppLockPlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppLockPlugin.class);
        registerPlugin(AppSettingsPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onResume() {
        super.onResume();
        AppLockPlugin.stopHints();
        AppLockPlugin.guiding = false;
    }
}
