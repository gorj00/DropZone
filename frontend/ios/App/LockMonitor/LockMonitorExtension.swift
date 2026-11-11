import DeviceActivity
import Foundation

class LockMonitorExtension: DeviceActivityMonitor {
    private static let endSlack: TimeInterval = 90

    override func intervalDidEnd(for activity: DeviceActivityName) {
        super.intervalDidEnd(for: activity)
        LockEngine.apply(now: Date().addingTimeInterval(Self.endSlack))
    }

    override func eventDidReachThreshold(_ event: DeviceActivityEvent.Name, activity: DeviceActivityName) {
        super.eventDidReachThreshold(event, activity: activity)
        if let session = LockStore.session(), let minutes = Int(event.rawValue.dropFirst()) {
            let used = session.base + minutes
            if used > LockStore.used(day: session.day) {
                LockStore.setUsed(used, day: session.day)
            }
        }
        LockEngine.apply()
    }
}
