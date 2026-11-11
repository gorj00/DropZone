import DeviceActivity
import Foundation
import ManagedSettings

enum LockSchedule {
    static let unlock = DeviceActivityName("dropzone.unlock")
    static let budget = DeviceActivityName("dropzone.budget")
    private static let center = DeviceActivityCenter()
    private static let shortest: TimeInterval = 16 * 60
    private static let maxMarks = 60

    static func refresh() {
        let now = Date()
        let state = LockStore.state()
        let tokens = LockEngine.lockedTokens(state)
        let unlockEnd = tokens.isEmpty ? nil : LockEngine.unlockEnd(state, now: now)
        refreshUnlock(end: unlockEnd, now: now)
        let left = unlockEnd == nil && !tokens.isEmpty ? LockEngine.minutesLeft(state, now: now) : 0
        refreshBudget(state: state, tokens: tokens, left: left, now: now)
    }

    private static func refreshUnlock(end: Date?, now: Date) {
        guard let end else {
            if LockStore.scheduledUnlockEnd() > 0 {
                center.stopMonitoring([unlock])
                LockStore.saveScheduledUnlockEnd(nil)
            }
            return
        }
        let stamp = end.timeIntervalSince1970
        if LockStore.scheduledUnlockEnd() == stamp && center.activities.contains(unlock) {
            return
        }
        center.stopMonitoring([unlock])
        let started = start(unlock, from: now, to: end, events: [:])
        LockStore.saveScheduledUnlockEnd(started ? stamp : nil)
    }

    private static func refreshBudget(state: LockState, tokens: Set<ApplicationToken>, left: Int, now: Date) {
        guard left > 0, let day = state.budgetDay, let end = LockEngine.budgetEnd(state, now: now) else {
            if LockStore.session() != nil {
                center.stopMonitoring([budget])
                LockStore.saveSession(nil)
            }
            return
        }
        let session = LockSession(day: day, base: LockStore.used(day: day), budget: state.minutesBudget, packages: state.packages.sorted())
        if let running = LockStore.session(), running.matches(session), center.activities.contains(budget) {
            return
        }
        center.stopMonitoring([budget])
        var events: [DeviceActivityEvent.Name: DeviceActivityEvent] = [:]
        for mark in marks(left) {
            events[DeviceActivityEvent.Name("m\(mark)")] = DeviceActivityEvent(
                applications: tokens,
                threshold: DateComponents(hour: mark / 60, minute: mark % 60)
            )
        }
        LockStore.saveSession(session)
        if !start(budget, from: now, to: end, events: events) {
            LockStore.saveSession(nil)
        }
    }

    static func marks(_ left: Int) -> [Int] {
        let step = max(1, Int((Double(left) / Double(maxMarks)).rounded(.up)))
        var all = Array(stride(from: step, to: left, by: step))
        all.append(left)
        return all
    }

    private static func start(_ name: DeviceActivityName, from: Date, to: Date, events: [DeviceActivityEvent.Name: DeviceActivityEvent]) -> Bool {
        let end = max(to, from.addingTimeInterval(shortest))
        let units: Set<Calendar.Component> = [.year, .month, .day, .hour, .minute, .second]
        let schedule = DeviceActivitySchedule(
            intervalStart: Calendar.current.dateComponents(units, from: from),
            intervalEnd: Calendar.current.dateComponents(units, from: end),
            repeats: false
        )
        do {
            try center.startMonitoring(name, during: schedule, events: events)
            return true
        } catch {
            return false
        }
    }
}
