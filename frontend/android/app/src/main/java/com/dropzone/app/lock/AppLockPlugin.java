package com.dropzone.app.lock;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.res.Resources;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.Settings;
import android.security.advancedprotection.AdvancedProtectionManager;
import android.widget.Toast;

import com.dropzone.app.R;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(name = "AppLock")
public class AppLockPlugin extends Plugin {

    private static final String SAMSUNG_INSTALLED_APPS = "accessibility_installed_services";
    private static final String SETTINGS_PACKAGE = "com.android.settings";
    private static final long HINT_DELAY_MS = 600;
    private static final long HINT_GAP_MS = 3600;
    private static final long HINT_LIMIT_MS = 120_000;
    private static volatile long hintsUntil;
    public static volatile boolean guiding;

    @PluginMethod
    public void getStatus(PluginCall call) {
        boolean enabled = AppLockService.isEnabled(getContext());
        JSObject result = new JSObject();
        result.put("serviceEnabled", enabled);
        result.put("overlayPermission", enabled);
        result.put("usagePermission", true);
        result.put("advancedProtection", isAdvancedProtectionEnabled());
        AppLockConfig config = AppLockConfig.load(getContext());
        long used = MinutesUsage.load(getContext()).used(config.budgetDay);
        long left = config.budgetLeft(used, LockClock.now(getContext()));
        result.put("minutesUsed", used / AppLockConfig.MINUTE_MS);
        result.put("minutesLeft", (left + AppLockConfig.MINUTE_MS - 1) / AppLockConfig.MINUTE_MS);
        call.resolve(result);
    }

    private boolean isAdvancedProtectionEnabled() {
        if (Build.VERSION.SDK_INT < 36) {
            return false;
        }
        try {
            AdvancedProtectionManager manager = getContext().getSystemService(AdvancedProtectionManager.class);
            return manager != null && manager.isAdvancedProtectionEnabled();
        } catch (Exception e) {
            return false;
        }
    }

    @PluginMethod
    public void openAccessibilitySettings(PluginCall call) {
        openSettings(call, Boolean.TRUE.equals(call.getBoolean("guide", false)));
    }

    @PluginMethod
    public void openOverlaySettings(PluginCall call) {
        openSettings(call, false);
    }

    @PluginMethod
    public void setConfig(PluginCall call) {
        List<String> packages = new ArrayList<>();
        JSArray array = call.getArray("packages", new JSArray());
        for (int i = 0; i < array.length(); i++) {
            String value = array.optString(i, null);
            if (value != null && !value.isEmpty()) {
                packages.add(value);
            }
        }
        Long unlockedUntil = null;
        Object rawUntil = call.getData().opt("unlockedUntil");
        if (rawUntil != null && rawUntil != JSONObject.NULL && rawUntil instanceof Number) {
            unlockedUntil = ((Number) rawUntil).longValue();
        }
        Object rawBudget = call.getData().opt("minutesBudget");
        int minutesBudget = rawBudget instanceof Number ? ((Number) rawBudget).intValue() : 0;
        String budgetDay = call.getString("budgetDay", null);
        AppLockConfig config = AppLockConfig.create(
            Boolean.TRUE.equals(call.getBoolean("enabled", false)),
            packages,
            unlockedUntil,
            minutesBudget,
            budgetDay,
            AppLockConfig.endOfDay(budgetDay, ZoneId.systemDefault()),
            call.getString("title", "Locked"),
            call.getString("message", "Finish today's quests in DropZone to unlock."),
            LockClock.now(getContext()),
            AppLockConfig.load(getContext())
        );
        config.save(getContext());
        AppLockService.onConfigChanged();
        call.resolve();
    }

    private void openSettings(PluginCall call, boolean guide) {
        String service = new ComponentName(getContext(), AppLockService.class).flattenToString();
        boolean samsung = "samsung".equalsIgnoreCase(Build.MANUFACTURER);
        String highlight = samsung ? SAMSUNG_INSTALLED_APPS : service;
        Intent details = new Intent("android.settings.ACCESSIBILITY_DETAILS_SETTINGS");
        details.putExtra(Intent.EXTRA_COMPONENT_NAME, service);
        Bundle args = new Bundle();
        args.putString(":settings:fragment_args_key", highlight);
        Intent list = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
        list.putExtra(":settings:fragment_args_key", highlight);
        list.putExtra(":settings:show_fragment_args", args);
        Intent[] intents = { details, list };
        boolean enabled = AppLockService.isEnabled(getContext());
        if (guide && !enabled) {
            guiding = true;
            launch(call, new Intent[] { list }, list, true, samsung);
            return;
        }
        launch(call, intents, list, !enabled, samsung);
    }

    private void launch(PluginCall call, Intent[] intents, Intent list, boolean hints, boolean samsung) {
        for (Intent intent : intents) {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                getContext().startActivity(intent);
                if (intent == list && hints) {
                    startHints(getContext(), samsung);
                }
                call.resolve();
                return;
            } catch (Exception ignored) {
            }
        }
        guiding = false;
        call.reject("Unable to open accessibility settings");
    }

    private static void startHints(Context context, boolean samsung) {
        Context app = context.getApplicationContext();
        String name = app.getString(R.string.app_lock_service_label);
        String section = samsung
            ? settingsText(app, "installed_apps_title", "Installed apps")
            : settingsText(app, "user_installed_services_category_title", "Downloaded apps");
        String allow = settingsText(app, "accessibility_dialog_button_allow", "Allow");
        String text = (samsung ? "1. Tap '" : "1. Open '") + section + "'\n2. '" + name + "' → turn on → '" + allow + "'";
        hintsUntil = SystemClock.elapsedRealtime() + HINT_LIMIT_MS;
        Handler main = new Handler(Looper.getMainLooper());
        main.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (SystemClock.elapsedRealtime() > hintsUntil || AppLockService.isEnabled(app)) {
                    return;
                }
                Toast.makeText(app, text, Toast.LENGTH_LONG).show();
                main.postDelayed(this, HINT_GAP_MS);
            }
        }, HINT_DELAY_MS);
    }

    public static void stopHints() {
        hintsUntil = 0;
    }

    private static String settingsText(Context context, String name, String fallback) {
        try {
            Resources res = context.getPackageManager().getResourcesForApplication(SETTINGS_PACKAGE);
            int id = res.getIdentifier(name, "string", SETTINGS_PACKAGE);
            if (id != 0) {
                return res.getString(id);
            }
        } catch (Exception ignored) {
        }
        return fallback;
    }
}
