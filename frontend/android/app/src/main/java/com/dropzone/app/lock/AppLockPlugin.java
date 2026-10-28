package com.dropzone.app.lock;

import android.content.ComponentName;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.security.advancedprotection.AdvancedProtectionManager;

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
        openSettings(call);
    }

    @PluginMethod
    public void openOverlaySettings(PluginCall call) {
        openSettings(call);
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

    private void openSettings(PluginCall call) {
        String service = new ComponentName(getContext(), AppLockService.class).flattenToString();
        Intent details = new Intent("android.settings.ACCESSIBILITY_DETAILS_SETTINGS");
        details.putExtra(Intent.EXTRA_COMPONENT_NAME, service);
        Bundle args = new Bundle();
        args.putString(":settings:fragment_args_key", service);
        Intent list = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
        list.putExtra(":settings:fragment_args_key", service);
        list.putExtra(":settings:show_fragment_args", args);
        for (Intent intent : new Intent[] { details, list }) {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                getContext().startActivity(intent);
                call.resolve();
                return;
            } catch (Exception ignored) {
            }
        }
        call.reject("Unable to open accessibility settings");
    }
}
