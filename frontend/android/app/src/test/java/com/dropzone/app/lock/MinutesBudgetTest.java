package com.dropzone.app.lock;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;

import org.junit.Test;

public class MinutesBudgetTest {

    private static final String INSTAGRAM = "com.instagram.android";
    private static final long SECOND = 1_000L;
    private static final long MINUTE = 60 * SECOND;
    private static final long HOUR = 60 * MINUTE;
    private static final long T0 = 1_800_000_000_000L;
    private static final long E0 = 5 * HOUR;
    private static final int BOOT = 7;
    private static final String DAY = "2027-01-15";
    private static final String NEXT_DAY = "2027-01-16";
    private static final long DAY_END = T0 + 10 * HOUR;

    private static LockClock at(long wall, long elapsed) {
        return new LockClock(wall, elapsed, BOOT, false);
    }

    private static AppLockConfig budget(Long unlockedUntil, int minutes, String day, LockClock now, AppLockConfig previous) {
        long end = NEXT_DAY.equals(day) ? DAY_END + 24 * HOUR : DAY_END;
        return AppLockConfig.create(true, List.of(INSTAGRAM), unlockedUntil, minutes, day, end, "Locked", "Clear your quests", now, previous);
    }

    private static AppLockConfig budget(int minutes, String day, LockClock now) {
        return budget(null, minutes, day, now, null);
    }

    private static MinutesUsage spent(String day, long ms) {
        MinutesUsage usage = new MinutesUsage();
        usage.start(day, at(T0, E0));
        usage.commit(at(T0 + ms, E0 + ms));
        return usage;
    }

    @Test
    public void earnedMinutesOpenLockedApps() {
        AppLockConfig config = budget(30, DAY, at(T0, E0));
        assertFalse(config.isLocked(INSTAGRAM, 0, at(T0, E0)));
        assertEquals(30 * MINUTE, config.budgetLeft(0, at(T0, E0)));
        LockDecision decision = LockDecision.decide(config, INSTAGRAM, 0, at(T0, E0));
        assertEquals(LockDecision.Action.COUNT, decision.action);
        assertEquals(LockDecision.RECHECK_MS, decision.recheckMs);
    }

    @Test
    public void usedUpBudgetLocksAgain() {
        AppLockConfig config = budget(30, DAY, at(T0, E0));
        MinutesUsage usage = spent(DAY, 30 * MINUTE);
        LockClock now = at(T0 + 30 * MINUTE, E0 + 30 * MINUTE);
        assertEquals(30 * MINUTE, usage.used(DAY));
        assertTrue(config.isLocked(INSTAGRAM, usage.used(DAY), now));
        assertEquals(LockDecision.Action.LOCK, LockDecision.decide(config, INSTAGRAM, usage.used(DAY), now).action);
    }

    @Test
    public void recheckFiresWhenTheBudgetRunsOut() {
        AppLockConfig config = budget(30, DAY, at(T0, E0));
        LockDecision decision = LockDecision.decide(config, INSTAGRAM, 29 * MINUTE + 40 * SECOND, at(T0, E0));
        assertEquals(LockDecision.Action.COUNT, decision.action);
        assertEquals(20 * SECOND, decision.recheckMs);
    }

    @Test
    public void onlyTimeInLockedAppsIsCounted() {
        MinutesUsage usage = new MinutesUsage();
        usage.start(DAY, at(T0, E0));
        assertTrue(usage.commit(at(T0 + 10 * MINUTE, E0 + 10 * MINUTE)));
        assertFalse(usage.commit(at(T0 + 20 * MINUTE, E0 + 20 * MINUTE)));
        usage.start(DAY, at(T0 + 30 * MINUTE, E0 + 30 * MINUTE));
        usage.commit(at(T0 + 35 * MINUTE, E0 + 35 * MINUTE));
        assertEquals(15 * MINUTE, usage.used(DAY));
    }

    @Test
    public void clockChangesDoNotChangeCountedTime() {
        MinutesUsage usage = new MinutesUsage();
        usage.start(DAY, at(T0, E0));
        usage.commit(at(T0 - 24 * HOUR, E0 + 10 * MINUTE));
        usage.start(DAY, at(T0 + 5 * HOUR, E0 + 20 * MINUTE));
        usage.commit(at(T0 + 5 * HOUR + 5 * MINUTE, E0 + 25 * MINUTE));
        assertEquals(15 * MINUTE, usage.used(DAY));
    }

    @Test
    public void clockSetBackClosesTheBudget() {
        AppLockConfig config = budget(30, DAY, at(T0, E0));
        LockClock back = at(T0 + HOUR - 3 * HOUR, E0 + HOUR);
        assertEquals(0, config.budgetLeft(0, back));
        assertEquals(LockDecision.Action.LOCK, LockDecision.decide(config, INSTAGRAM, 0, back).action);
    }

    @Test
    public void resyncWithClockSetBackDoesNotExtendTheDay() {
        AppLockConfig config = budget(30, DAY, at(T0, E0));
        LockClock back = at(T0 + HOUR - 3 * HOUR, E0 + HOUR);
        AppLockConfig resynced = budget(null, 30, DAY, back, config);
        assertEquals(9 * HOUR, resynced.budgetWindow(back));
        assertEquals(20 * MINUTE, resynced.budgetLeft(spent(DAY, 10 * MINUTE).used(DAY), back));
    }

    @Test
    public void budgetEndsWithItsDay() {
        AppLockConfig config = budget(30, DAY, at(T0, E0));
        assertTrue(config.isLocked(INSTAGRAM, 0, at(DAY_END, E0 + 10 * HOUR)));
        LockDecision late = LockDecision.decide(config, INSTAGRAM, 0, at(DAY_END - 20 * SECOND, E0 + 10 * HOUR - 20 * SECOND));
        assertEquals(20 * SECOND, late.recheckMs);
    }

    @Test
    public void newBudgetDayStartsFreshAndOldDayKeepsItsUsage() {
        MinutesUsage usage = spent(DAY, 30 * MINUTE);
        LockClock tomorrow = at(DAY_END + HOUR, E0 + 11 * HOUR);
        AppLockConfig next = budget(30, NEXT_DAY, tomorrow);
        assertFalse(next.isLocked(INSTAGRAM, usage.used(NEXT_DAY), tomorrow));
        AppLockConfig back = budget(30, DAY, at(T0 + HOUR, E0 + HOUR));
        assertTrue(back.isLocked(INSTAGRAM, usage.used(DAY), at(T0 + HOUR, E0 + HOUR)));
    }

    @Test
    public void rebootDropsTheRunningSessionAndLocksUntilResync() {
        MinutesUsage usage = new MinutesUsage();
        usage.start(DAY, at(T0, E0));
        assertFalse(usage.commit(new LockClock(T0 + HOUR, 10 * MINUTE, BOOT + 1, false)));
        AppLockConfig config = budget(30, DAY, at(T0, E0));
        assertTrue(config.isLocked(INSTAGRAM, 0, new LockClock(T0 + HOUR, 10 * MINUTE, BOOT + 1, false)));
    }

    @Test
    public void wholeDayUnlockIsNotCounted() {
        AppLockConfig config = budget(DAY_END, 30, DAY, at(T0, E0), null);
        LockDecision decision = LockDecision.decide(config, INSTAGRAM, 30 * MINUTE, at(T0, E0));
        assertEquals(LockDecision.Action.OPEN, decision.action);
    }

    @Test
    public void noBudgetWithoutMinutesOrDay() {
        assertTrue(budget(0, DAY, at(T0, E0)).isLocked(INSTAGRAM, 0, at(T0, E0)));
        assertTrue(budget(30, null, at(T0, E0)).isLocked(INSTAGRAM, 0, at(T0, E0)));
        assertEquals(LockDecision.Action.NONE, LockDecision.decide(budget(30, DAY, at(T0, E0)), "com.android.chrome", 0, at(T0, E0)).action);
    }

    @Test
    public void usageIsStoredPerDayAndKeepsRecentDays() {
        StringBuilder raw = new StringBuilder("garbage,=5,2026-12-01=abc,");
        for (int day = 1; day <= 20; day++) {
            raw.append(String.format("2027-01-%02d=%d,", day, day * MINUTE));
        }
        MinutesUsage usage = MinutesUsage.parse(raw.toString());
        assertEquals(0, usage.used("2027-01-06"));
        assertEquals(7 * MINUTE, usage.used("2027-01-07"));
        assertEquals(20 * MINUTE, usage.used("2027-01-20"));
        assertEquals(usage.encode(), MinutesUsage.parse(usage.encode()).encode());
        assertEquals(MinutesUsage.KEEP_DAYS, usage.encode().split(",").length);
    }

    @Test
    public void endOfDayUsesTheLocalZone() {
        assertEquals(Instant.parse("2026-10-29T00:00:00Z").toEpochMilli(), (long) AppLockConfig.endOfDay("2026-10-28", ZoneOffset.UTC));
        assertEquals(Instant.parse("2026-10-25T23:00:00Z").toEpochMilli(), (long) AppLockConfig.endOfDay("2026-10-25", ZoneId.of("Europe/Prague")));
        assertNull(AppLockConfig.endOfDay("tomorrow", ZoneOffset.UTC));
        assertNull(AppLockConfig.endOfDay(null, ZoneOffset.UTC));
    }
}
