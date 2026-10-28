package com.dropzone.app.lock;

final class LockDecision {

    enum Action { NONE, OPEN, COUNT, LOCK }

    static final long RECHECK_MS = 60_000L;

    final Action action;
    final long recheckMs;

    private LockDecision(Action action, long recheckMs) {
        this.action = action;
        this.recheckMs = recheckMs;
    }

    static LockDecision decide(AppLockConfig config, String packageName, long usedMs, LockClock now) {
        if (!config.covers(packageName)) {
            return new LockDecision(Action.NONE, 0);
        }
        long open = config.unlockRemaining(now);
        if (open > 0) {
            return new LockDecision(Action.OPEN, Math.min(open, RECHECK_MS));
        }
        long left = Math.min(config.budgetLeft(usedMs, now), config.budgetWindow(now));
        if (left > 0) {
            return new LockDecision(Action.COUNT, Math.min(left, RECHECK_MS));
        }
        return new LockDecision(Action.LOCK, 0);
    }
}
