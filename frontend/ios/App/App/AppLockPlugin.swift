import Capacitor
import FamilyControls
import ManagedSettings
import SwiftUI
import UIKit

@objc(AppLockPlugin)
public class AppLockPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppLockPlugin"
    public let jsName = "AppLock"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openAccessibilitySettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openOverlaySettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setConfig", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pickApp", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "forgetApp", returnType: CAPPluginReturnPromise)
    ]

    private var approved: Bool {
        AuthorizationCenter.shared.authorizationStatus == .approved
    }

    private func sync() {
        LockEngine.apply()
        LockSchedule.refresh()
    }

    private func authorize(_ done: @escaping (Bool) -> Void) {
        Task {
            do {
                try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
            } catch {
            }
            done(self.approved)
        }
    }

    @objc func getStatus(_ call: CAPPluginCall) {
        sync()
        let state = LockStore.state()
        call.resolve([
            "serviceEnabled": approved,
            "overlayPermission": approved,
            "usagePermission": true,
            "advancedProtection": false,
            "minutesUsed": LockStore.used(day: state.budgetDay),
            "minutesLeft": LockEngine.minutesLeft(state, now: Date()),
            "pickedPackages": Array(LockStore.tokens().keys)
        ])
    }

    @objc func openAccessibilitySettings(_ call: CAPPluginCall) {
        authorize { _ in call.resolve() }
    }

    @objc func openOverlaySettings(_ call: CAPPluginCall) {
        call.resolve()
    }

    @objc func requestAuthorization(_ call: CAPPluginCall) {
        authorize { granted in call.resolve(["granted": granted]) }
    }

    @objc func setConfig(_ call: CAPPluginCall) {
        var state = LockState()
        state.enabled = call.getBool("enabled") ?? false
        state.packages = call.getArray("packages", String.self) ?? []
        state.unlockedUntil = call.getDouble("unlockedUntil")
        state.minutesBudget = max(0, call.getInt("minutesBudget") ?? 0)
        state.budgetDay = call.getString("budgetDay")
        state.title = call.getString("title") ?? "Locked by DropZone"
        state.message = call.getString("message") ?? ""
        LockStore.save(state)
        sync()
        call.resolve()
    }

    @objc func pickApp(_ call: CAPPluginCall) {
        guard let package = call.getString("package"), !package.isEmpty else {
            call.reject("Missing package")
            return
        }
        let name = call.getString("name") ?? "the app"
        DispatchQueue.main.async {
            guard let presenter = self.bridge?.viewController else {
                call.reject("Unable to show the app list")
                return
            }
            let taken = Set(LockStore.tokens().filter { $0.key != package }.values)
            weak var sheet: UIViewController?
            let picker = AppPickerView(name: name, taken: taken) { token in
                sheet?.dismiss(animated: true)
                if let token {
                    var tokens = LockStore.tokens()
                    tokens[package] = token
                    LockStore.saveTokens(tokens)
                    self.sync()
                }
                call.resolve(["picked": token != nil])
            }
            let host = UIHostingController(rootView: picker)
            host.isModalInPresentation = true
            sheet = host
            presenter.present(host, animated: true)
        }
    }

    @objc func forgetApp(_ call: CAPPluginCall) {
        guard let package = call.getString("package") else {
            call.reject("Missing package")
            return
        }
        var tokens = LockStore.tokens()
        tokens.removeValue(forKey: package)
        LockStore.saveTokens(tokens)
        sync()
        call.resolve()
    }
}
