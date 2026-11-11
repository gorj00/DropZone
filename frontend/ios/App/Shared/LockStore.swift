import Foundation
import ManagedSettings

enum LockKeys {
    static let group = "group.com.dropzone.app"
    static let state = "lockState"
    static let tokens = "lockTokens"
    static let used = "lockMinutesUsed"
    static let session = "lockSession"
    static let unlockEnd = "lockUnlockEnd"
    static let keepDays = 14
}

struct LockState: Codable {
    var enabled = false
    var packages: [String] = []
    var unlockedUntil: Double?
    var minutesBudget = 0
    var budgetDay: String?
    var title = "Locked by DropZone"
    var message = "Clear today's quests to unlock."
}

struct LockSession: Codable {
    var day: String
    var base: Int
    var budget: Int
    var packages: [String]

    func matches(_ other: LockSession) -> Bool {
        day == other.day && budget == other.budget && packages == other.packages
    }
}

enum LockStore {
    static var defaults: UserDefaults {
        UserDefaults(suiteName: LockKeys.group) ?? .standard
    }

    private static func read<T: Decodable>(_ key: String, _ type: T.Type) -> T? {
        guard let data = defaults.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }

    private static func write<T: Encodable>(_ key: String, _ value: T?) {
        guard let value, let data = try? JSONEncoder().encode(value) else {
            defaults.removeObject(forKey: key)
            return
        }
        defaults.set(data, forKey: key)
    }

    static func state() -> LockState {
        read(LockKeys.state, LockState.self) ?? LockState()
    }

    static func save(_ state: LockState) {
        write(LockKeys.state, state)
    }

    static func tokens() -> [String: ApplicationToken] {
        read(LockKeys.tokens, [String: ApplicationToken].self) ?? [:]
    }

    static func saveTokens(_ tokens: [String: ApplicationToken]) {
        write(LockKeys.tokens, tokens)
    }

    static func session() -> LockSession? {
        read(LockKeys.session, LockSession.self)
    }

    static func saveSession(_ session: LockSession?) {
        write(LockKeys.session, session)
    }

    static func used(day: String?) -> Int {
        guard let day else { return 0 }
        return (defaults.dictionary(forKey: LockKeys.used) as? [String: Int])?[day] ?? 0
    }

    static func setUsed(_ minutes: Int, day: String) {
        var all = (defaults.dictionary(forKey: LockKeys.used) as? [String: Int]) ?? [:]
        all[day] = minutes
        for old in all.keys.sorted().dropLast(LockKeys.keepDays) {
            all.removeValue(forKey: old)
        }
        defaults.set(all, forKey: LockKeys.used)
    }

    static func scheduledUnlockEnd() -> Double {
        defaults.double(forKey: LockKeys.unlockEnd)
    }

    static func saveScheduledUnlockEnd(_ value: Double?) {
        if let value {
            defaults.set(value, forKey: LockKeys.unlockEnd)
        } else {
            defaults.removeObject(forKey: LockKeys.unlockEnd)
        }
    }
}

enum LockEngine {
    static let store = ManagedSettingsStore()

    static func endOfDay(_ day: String?) -> Date? {
        guard let day else { return nil }
        let format = DateFormatter()
        format.calendar = Calendar(identifier: .gregorian)
        format.locale = Locale(identifier: "en_US_POSIX")
        format.timeZone = .current
        format.dateFormat = "yyyy-MM-dd"
        guard let start = format.date(from: day) else { return nil }
        return Calendar.current.date(byAdding: .day, value: 1, to: start)
    }

    static func unlockEnd(_ state: LockState, now: Date) -> Date? {
        guard let until = state.unlockedUntil else { return nil }
        let end = Date(timeIntervalSince1970: until / 1000)
        return end > now ? end : nil
    }

    static func budgetEnd(_ state: LockState, now: Date) -> Date? {
        guard state.minutesBudget > 0, let end = endOfDay(state.budgetDay), end > now else { return nil }
        return end
    }

    static func minutesLeft(_ state: LockState, now: Date) -> Int {
        guard budgetEnd(state, now: now) != nil else { return 0 }
        return max(0, state.minutesBudget - LockStore.used(day: state.budgetDay))
    }

    static func lockedTokens(_ state: LockState) -> Set<ApplicationToken> {
        guard state.enabled else { return [] }
        let tokens = LockStore.tokens()
        return Set(state.packages.compactMap { tokens[$0] })
    }

    static func isOpen(_ state: LockState, now: Date) -> Bool {
        unlockEnd(state, now: now) != nil || minutesLeft(state, now: now) > 0
    }

    @discardableResult
    static func apply(now: Date = Date()) -> Bool {
        let state = LockStore.state()
        let tokens = lockedTokens(state)
        let locked = !tokens.isEmpty && !isOpen(state, now: now)
        store.shield.applications = locked ? tokens : nil
        return locked
    }
}
