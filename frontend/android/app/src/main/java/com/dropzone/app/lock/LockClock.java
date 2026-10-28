package com.dropzone.app.lock;

import android.content.Context;
import android.os.SystemClock;
import android.provider.Settings;

public final class LockClock {

    public final long wall;
    public final long elapsed;
    public final int boot;
    public final boolean networkTime;

    public LockClock(long wall, long elapsed, int boot, boolean networkTime) {
        this.wall = wall;
        this.elapsed = elapsed;
        this.boot = boot;
        this.networkTime = networkTime;
    }

    public static LockClock now(Context context) {
        return new LockClock(
            System.currentTimeMillis(),
            SystemClock.elapsedRealtime(),
            Settings.Global.getInt(context.getContentResolver(), Settings.Global.BOOT_COUNT, -1),
            Settings.Global.getInt(context.getContentResolver(), Settings.Global.AUTO_TIME, 0) == 1
        );
    }
}
