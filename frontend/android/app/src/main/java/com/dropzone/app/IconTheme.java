package com.dropzone.app;

import android.content.ComponentName;
import android.content.Context;
import android.content.pm.PackageManager;

public final class IconTheme {

    static final String NEON = "NEON";
    static final String STEALTH = "STEALTH";
    private static final String PREFS = "dz_icon_theme";
    private static final String KEY = "theme";

    private IconTheme() {
    }

    static boolean isValid(String theme) {
        return NEON.equals(theme) || STEALTH.equals(theme);
    }

    static void request(Context context, String theme) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, theme).apply();
    }

    static void apply(Context context) {
        String theme = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, NEON);
        PackageManager pm = context.getPackageManager();
        ComponentName neon = new ComponentName(context, "com.dropzone.app.LauncherNeon");
        ComponentName stealth = new ComponentName(context, "com.dropzone.app.LauncherStealth");
        boolean wantStealth = STEALTH.equals(theme);
        ComponentName on = wantStealth ? stealth : neon;
        ComponentName off = wantStealth ? neon : stealth;
        if (enabled(pm, on, !wantStealth) && !enabled(pm, off, wantStealth)) {
            return;
        }
        try {
            pm.setComponentEnabledSetting(on, PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP);
            pm.setComponentEnabledSetting(off, PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP);
        } catch (RuntimeException ignored) {
        }
    }

    private static boolean enabled(PackageManager pm, ComponentName component, boolean byDefault) {
        int state = pm.getComponentEnabledSetting(component);
        if (state == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT) {
            return byDefault;
        }
        return state == PackageManager.COMPONENT_ENABLED_STATE_ENABLED;
    }
}
