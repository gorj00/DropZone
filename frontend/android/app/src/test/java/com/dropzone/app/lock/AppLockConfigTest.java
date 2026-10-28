package com.dropzone.app.lock;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.List;

import org.junit.Test;

public class AppLockConfigTest {

    private static final String INSTAGRAM = "com.instagram.android";
    private static final String TIKTOK = "com.zhiliaoapp.musically";
    private static final long MINUTE = 60_000L;
    private static final long HOUR = 60 * MINUTE;
    private static final long T0 = 1_800_000_000_000L;
    private static final long E0 = 5 * HOUR;
    private static final int BOOT = 7;

    private static LockClock at(long wall, long elapsed) {
        return new LockClock(wall, elapsed, BOOT, false);
    }

    private static AppLockConfig config(Long unlockedUntil, LockClock now, AppLockConfig previous) {
        return AppLockConfig.create(true, List.of(INSTAGRAM, TIKTOK), unlockedUntil, 0, null, null, "Locked", "Clear your quests", now, previous);
    }

    @Test
    public void lockedWithoutUnlock() {
        AppLockConfig config = config(null, at(T0, E0), null);
        assertTrue(config.isLocked(INSTAGRAM, 0, at(T0, E0)));
        assertFalse(config.isLocked("com.android.chrome", 0, at(T0, E0)));
    }

    @Test
    public void disabledNeverLocks() {
        AppLockConfig config = AppLockConfig.create(false, List.of(INSTAGRAM), null, 0, null, null, "Locked", "", at(T0, E0), null);
        assertFalse(config.isLocked(INSTAGRAM, 0, at(T0, E0)));
        assertFalse(config.covers(INSTAGRAM));
    }

    @Test
    public void unlockedUntilTimePasses() {
        AppLockConfig config = config(T0 + 2 * HOUR, at(T0, E0), null);
        assertFalse(config.isLocked(INSTAGRAM, 0, at(T0 + HOUR, E0 + HOUR)));
        assertEquals(HOUR, config.unlockRemaining(at(T0 + HOUR, E0 + HOUR)));
        assertTrue(config.isLocked(INSTAGRAM, 0, at(T0 + 2 * HOUR, E0 + 2 * HOUR)));
    }

    @Test
    public void clockSetBackRelocks() {
        AppLockConfig config = config(T0 + 10 * HOUR, at(T0, E0), null);
        assertTrue(config.isLocked(INSTAGRAM, 0, at(T0 + HOUR - 24 * HOUR, E0 + HOUR)));
    }

    @Test
    public void resyncAfterClockSetBackStaysLocked() {
        AppLockConfig unlocked = config(T0 + 10 * HOUR, at(T0, E0), null);
        LockClock fake = at(T0 + HOUR - 24 * HOUR, E0 + HOUR);
        AppLockConfig resynced = config(T0 - 9 * HOUR, fake, unlocked);
        assertTrue(resynced.isLocked(INSTAGRAM, 0, fake));
        assertTrue(resynced.isLocked(INSTAGRAM, 0, at(fake.wall + MINUTE, fake.elapsed + MINUTE)));
    }

    @Test
    public void networkTimeCorrectionIsTrusted() {
        AppLockConfig unlocked = config(T0 + 10 * HOUR, at(T0, E0), null);
        LockClock corrected = new LockClock(T0 + HOUR - 30 * MINUTE, E0 + HOUR, BOOT, true);
        AppLockConfig resynced = config(T0 + 10 * HOUR, corrected, unlocked);
        assertFalse(resynced.isLocked(INSTAGRAM, 0, corrected));
    }

    @Test
    public void smallBackwardCorrectionKeepsUnlock() {
        AppLockConfig config = config(T0 + 10 * HOUR, at(T0, E0), null);
        assertFalse(config.isLocked(INSTAGRAM, 0, at(T0 + HOUR - 2 * MINUTE, E0 + HOUR)));
    }

    @Test
    public void clockSetForwardLocks() {
        AppLockConfig config = config(T0 + 10 * HOUR, at(T0, E0), null);
        assertTrue(config.isLocked(INSTAGRAM, 0, at(T0 + 11 * HOUR, E0 + MINUTE)));
    }

    @Test
    public void rebootLocksUntilResync() {
        AppLockConfig config = config(T0 + 10 * HOUR, at(T0, E0), null);
        LockClock afterReboot = new LockClock(T0 + HOUR, 10 * MINUTE, BOOT + 1, false);
        assertTrue(config.isLocked(INSTAGRAM, 0, afterReboot));
        assertFalse(config(T0 + 10 * HOUR, afterReboot, config).isLocked(INSTAGRAM, 0, afterReboot));
    }

    @Test
    public void unlockIsCappedWhenClockIsFarBehind() {
        AppLockConfig config = config(T0 + 400 * 24 * HOUR, at(T0, E0), null);
        assertEquals(AppLockConfig.MAX_UNLOCK_MS, config.unlockRemaining(at(T0, E0)));
        assertTrue(config.isLocked(INSTAGRAM, 0, at(T0 + AppLockConfig.MAX_UNLOCK_MS, E0 + AppLockConfig.MAX_UNLOCK_MS)));
    }

    @Test
    public void variantsAreLockedWithPrimaryPackage() {
        AppLockConfig config = config(null, at(T0, E0), null);
        for (String pkg : List.of("com.ss.android.ugc.trill", "com.zhiliaoapp.musically.go", "com.ss.android.ugc.trill.go", "com.instagram.lite")) {
            assertTrue(pkg, config.isLocked(pkg, 0, at(T0, E0)));
        }
        assertFalse(config.covers("com.google.android.youtube"));
        assertFalse(config.covers("com.google.android.apps.youtube.mango"));
    }
}
