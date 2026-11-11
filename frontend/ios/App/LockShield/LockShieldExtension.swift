import ManagedSettings
import ManagedSettingsUI
import UIKit

class LockShieldExtension: ShieldConfigurationDataSource {
    private static let background = UIColor(red: 13 / 255, green: 10 / 255, blue: 43 / 255, alpha: 1)
    private static let accent = UIColor(red: 255 / 255, green: 46 / 255, blue: 126 / 255, alpha: 1)

    private func shield() -> ShieldConfiguration {
        let state = LockStore.state()
        return ShieldConfiguration(
            backgroundBlurStyle: .systemThickMaterialDark,
            backgroundColor: Self.background,
            icon: UIImage(systemName: "lock.fill")?.withTintColor(Self.accent, renderingMode: .alwaysOriginal),
            title: ShieldConfiguration.Label(text: state.title, color: .white),
            subtitle: ShieldConfiguration.Label(text: state.message, color: UIColor(white: 1, alpha: 0.75)),
            primaryButtonLabel: ShieldConfiguration.Label(text: "OK", color: .white),
            primaryButtonBackgroundColor: Self.accent
        )
    }

    override func configuration(shielding application: Application) -> ShieldConfiguration {
        shield()
    }

    override func configuration(shielding application: Application, in category: ActivityCategory) -> ShieldConfiguration {
        shield()
    }

    override func configuration(shielding webDomain: WebDomain) -> ShieldConfiguration {
        shield()
    }

    override func configuration(shielding webDomain: WebDomain, in category: ActivityCategory) -> ShieldConfiguration {
        shield()
    }
}
