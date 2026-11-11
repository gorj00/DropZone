import ManagedSettings
import UserNotifications

class LockShieldActionExtension: ShieldActionDelegate {
    private static let notificationId = "dropzone.lock"

    override func handle(action: ShieldAction, for application: ApplicationToken, completionHandler: @escaping (ShieldActionResponse) -> Void) {
        respond(to: action, completionHandler)
    }

    override func handle(action: ShieldAction, for webDomain: WebDomainToken, completionHandler: @escaping (ShieldActionResponse) -> Void) {
        respond(to: action, completionHandler)
    }

    override func handle(action: ShieldAction, for category: ActivityCategoryToken, completionHandler: @escaping (ShieldActionResponse) -> Void) {
        respond(to: action, completionHandler)
    }

    private func respond(to action: ShieldAction, _ done: @escaping (ShieldActionResponse) -> Void) {
        guard action == .primaryButtonPressed else {
            done(.close)
            return
        }
        let content = UNMutableNotificationContent()
        content.title = LockStore.state().title
        content.body = "Tap to open DropZone and clear today's quests."
        content.sound = .default
        content.userInfo = ["type": "APP_LOCK"]
        let request = UNNotificationRequest(identifier: Self.notificationId, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request) { _ in
            done(.close)
        }
    }
}
