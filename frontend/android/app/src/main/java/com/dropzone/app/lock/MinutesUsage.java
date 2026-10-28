package com.dropzone.app.lock;

import android.content.Context;

import java.util.Map;
import java.util.TreeMap;

final class MinutesUsage {

    static final int KEEP_DAYS = 14;

    private static final String KEY_USED = "minutesUsed";

    private final TreeMap<String, Long> usedByDay = new TreeMap<>();
    private String sessionDay;
    private long sessionStart;
    private int sessionBoot;

    static MinutesUsage parse(String raw) {
        MinutesUsage usage = new MinutesUsage();
        if (raw == null || raw.isEmpty()) {
            return usage;
        }
        for (String entry : raw.split(",")) {
            int split = entry.indexOf('=');
            if (split <= 0) {
                continue;
            }
            try {
                long used = Long.parseLong(entry.substring(split + 1));
                if (used > 0) {
                    usage.usedByDay.put(entry.substring(0, split), used);
                }
            } catch (NumberFormatException ignored) {
            }
        }
        usage.prune();
        return usage;
    }

    String encode() {
        StringBuilder out = new StringBuilder();
        for (Map.Entry<String, Long> entry : usedByDay.entrySet()) {
            if (out.length() > 0) {
                out.append(',');
            }
            out.append(entry.getKey()).append('=').append(entry.getValue());
        }
        return out.toString();
    }

    long used(String day) {
        if (day == null) {
            return 0;
        }
        Long used = usedByDay.get(day);
        return used == null ? 0 : used;
    }

    void start(String day, LockClock now) {
        sessionDay = day;
        sessionStart = now.elapsed;
        sessionBoot = now.boot;
    }

    boolean commit(LockClock now) {
        String day = sessionDay;
        sessionDay = null;
        if (day == null || now.boot != sessionBoot || now.elapsed <= sessionStart) {
            return false;
        }
        usedByDay.merge(day, now.elapsed - sessionStart, Long::sum);
        prune();
        return true;
    }

    private void prune() {
        while (usedByDay.size() > KEEP_DAYS) {
            usedByDay.pollFirstEntry();
        }
    }

    static MinutesUsage load(Context context) {
        return parse(context.getSharedPreferences(AppLockConfig.PREFS, Context.MODE_PRIVATE).getString(KEY_USED, ""));
    }

    void save(Context context) {
        context.getSharedPreferences(AppLockConfig.PREFS, Context.MODE_PRIVATE).edit().putString(KEY_USED, encode()).apply();
    }
}
