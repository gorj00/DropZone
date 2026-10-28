package com.dropzone.app.lock;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public class AppLockConfig {

    static final long CLOCK_TOLERANCE_MS = 5 * 60_000L;
    static final long MAX_UNLOCK_MS = 25 * 60 * 60_000L;
    static final long MINUTE_MS = 60_000L;
    static final String PREFS = "dropzone_app_lock";

    private static final String KEY_ENABLED = "enabled";
    private static final String KEY_PACKAGES = "packages";
    private static final String KEY_UNLOCKED_UNTIL = "unlockedUntil";
    private static final String KEY_BUDGET_MINUTES = "minutesBudget";
    private static final String KEY_BUDGET_DAY = "budgetDay";
    private static final String KEY_BUDGET_UNTIL = "budgetUntil";
    private static final String KEY_TITLE = "title";
    private static final String KEY_MESSAGE = "message";
    private static final String KEY_ANCHOR_WALL = "anchorWall";
    private static final String KEY_ANCHOR_ELAPSED = "anchorElapsed";
    private static final String KEY_ANCHOR_BOOT = "anchorBoot";
    private static final String KEY_ANCHOR_TRUSTED = "anchorTrusted";
    private static final int NO_BOOT = Integer.MIN_VALUE;

    private static final Map<String, String[]> VARIANTS = new HashMap<>();

    static {
        VARIANTS.put("com.instagram.android", new String[] { "com.instagram.lite" });
        VARIANTS.put("com.zhiliaoapp.musically", new String[] { "com.ss.android.ugc.trill", "com.zhiliaoapp.musically.go", "com.ss.android.ugc.trill.go" });
        VARIANTS.put("com.google.android.youtube", new String[] { "com.google.android.apps.youtube.mango" });
    }

    public final boolean enabled;
    public final List<String> packages;
    public final Long unlockedUntil;
    public final int minutesBudget;
    public final String budgetDay;
    public final Long budgetUntil;
    public final String title;
    public final String message;
    final long anchorWall;
    final long anchorElapsed;
    final int anchorBoot;
    final long anchorTrusted;
    private final Set<String> lockedPackages;

    private AppLockConfig(boolean enabled, List<String> packages, Long unlockedUntil, int minutesBudget, String budgetDay, Long budgetUntil,
                          String title, String message, long anchorWall, long anchorElapsed, int anchorBoot, long anchorTrusted) {
        this.enabled = enabled;
        this.packages = packages;
        this.unlockedUntil = unlockedUntil;
        this.minutesBudget = minutesBudget;
        this.budgetDay = budgetDay;
        this.budgetUntil = budgetUntil;
        this.title = title;
        this.message = message;
        this.anchorWall = anchorWall;
        this.anchorElapsed = anchorElapsed;
        this.anchorBoot = anchorBoot;
        this.anchorTrusted = anchorTrusted;
        this.lockedPackages = expand(packages);
    }

    public static AppLockConfig create(boolean enabled, List<String> packages, Long unlockedUntil, int minutesBudget, String budgetDay,
                                       Long budgetUntil, String title, String message, LockClock now, AppLockConfig previous) {
        long trusted = now.wall;
        if (!now.networkTime && previous != null && previous.anchorBoot == now.boot && now.elapsed >= previous.anchorElapsed) {
            trusted = Math.max(now.wall, previous.anchorTrusted + now.elapsed - previous.anchorElapsed);
        }
        return new AppLockConfig(enabled, packages, unlockedUntil, Math.max(0, minutesBudget), budgetDay, budgetUntil,
            title, message, now.wall, now.elapsed, now.boot, trusted);
    }

    public static Long endOfDay(String day, ZoneId zone) {
        if (day == null) {
            return null;
        }
        try {
            return LocalDate.parse(day).plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli();
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    static Set<String> expand(List<String> packages) {
        Set<String> all = new HashSet<>(packages);
        for (String p : packages) {
            String[] variants = VARIANTS.get(p);
            if (variants != null) {
                Collections.addAll(all, variants);
            }
        }
        return all;
    }

    public boolean covers(String packageName) {
        return enabled && packageName != null && lockedPackages.contains(packageName);
    }

    public boolean isLocked(String packageName, long usedMs, LockClock now) {
        return covers(packageName) && !isOpen(usedMs, now);
    }

    public boolean isOpen(long usedMs, LockClock now) {
        return unlockRemaining(now) > 0 || budgetLeft(usedMs, now) > 0;
    }

    public long unlockRemaining(LockClock now) {
        return remaining(unlockedUntil, now);
    }

    public long budgetWindow(LockClock now) {
        return minutesBudget > 0 && budgetDay != null ? remaining(budgetUntil, now) : 0;
    }

    public long budgetLeft(long usedMs, LockClock now) {
        if (budgetWindow(now) <= 0) {
            return 0;
        }
        return Math.max(0, minutesBudget * MINUTE_MS - usedMs);
    }

    private long remaining(Long until, LockClock now) {
        if (until == null || now.boot != anchorBoot) {
            return 0;
        }
        long sinceAnchor = now.elapsed - anchorElapsed;
        if (sinceAnchor < 0 || now.wall < anchorWall + sinceAnchor - CLOCK_TOLERANCE_MS) {
            return 0;
        }
        long byElapsed = Math.min(until - anchorTrusted, MAX_UNLOCK_MS) - sinceAnchor;
        long byWall = until - now.wall;
        return Math.max(0, Math.min(byElapsed, byWall));
    }

    public static AppLockConfig load(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        List<String> packages = new ArrayList<>();
        try {
            JSONArray array = new JSONArray(prefs.getString(KEY_PACKAGES, "[]"));
            for (int i = 0; i < array.length(); i++) {
                packages.add(array.getString(i));
            }
        } catch (Exception ignored) {
        }
        long until = prefs.getLong(KEY_UNLOCKED_UNTIL, -1L);
        long budgetUntil = prefs.getLong(KEY_BUDGET_UNTIL, -1L);
        return new AppLockConfig(
            prefs.getBoolean(KEY_ENABLED, false),
            packages,
            until < 0 ? null : until,
            prefs.getInt(KEY_BUDGET_MINUTES, 0),
            prefs.getString(KEY_BUDGET_DAY, null),
            budgetUntil < 0 ? null : budgetUntil,
            prefs.getString(KEY_TITLE, "Locked"),
            prefs.getString(KEY_MESSAGE, "Finish today's quests in DropZone to unlock."),
            prefs.getLong(KEY_ANCHOR_WALL, 0L),
            prefs.getLong(KEY_ANCHOR_ELAPSED, 0L),
            prefs.getInt(KEY_ANCHOR_BOOT, NO_BOOT),
            prefs.getLong(KEY_ANCHOR_TRUSTED, 0L)
        );
    }

    public void save(Context context) {
        JSONArray array = new JSONArray();
        for (String p : packages) {
            array.put(p);
        }
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_ENABLED, enabled)
            .putString(KEY_PACKAGES, array.toString())
            .putLong(KEY_UNLOCKED_UNTIL, unlockedUntil == null ? -1L : unlockedUntil)
            .putInt(KEY_BUDGET_MINUTES, minutesBudget)
            .putString(KEY_BUDGET_DAY, budgetDay)
            .putLong(KEY_BUDGET_UNTIL, budgetUntil == null ? -1L : budgetUntil)
            .putString(KEY_TITLE, title)
            .putString(KEY_MESSAGE, message)
            .putLong(KEY_ANCHOR_WALL, anchorWall)
            .putLong(KEY_ANCHOR_ELAPSED, anchorElapsed)
            .putInt(KEY_ANCHOR_BOOT, anchorBoot)
            .putLong(KEY_ANCHOR_TRUSTED, anchorTrusted)
            .apply();
    }
}
