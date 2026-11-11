import FamilyControls
import ManagedSettings
import SwiftUI

struct AppPickerView: View {
    let name: String
    let taken: Set<ApplicationToken>
    let done: (ApplicationToken?) -> Void

    @State private var selection = FamilyActivitySelection()
    @State private var problem: String?

    init(name: String, taken: Set<ApplicationToken>, done: @escaping (ApplicationToken?) -> Void) {
        self.name = name
        self.taken = taken
        self.done = done
    }

    var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                VStack(spacing: 6) {
                    Text("Tick \(name) only, then tap Done.")
                        .font(.subheadline)
                        .multilineTextAlignment(.center)
                    if let problem {
                        Text(problem)
                            .font(.footnote)
                            .foregroundColor(.red)
                            .multilineTextAlignment(.center)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 12)
                FamilyActivityPicker(selection: $selection)
            }
            .navigationTitle("Choose \(name)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { done(nil) }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { confirm() }
                }
            }
        }
        .navigationViewStyle(.stack)
    }

    private func confirm() {
        let apps = selection.applicationTokens
        guard apps.count == 1, selection.categoryTokens.isEmpty, selection.webDomainTokens.isEmpty, let token = apps.first else {
            problem = "Pick exactly one app: \(name)."
            return
        }
        guard !taken.contains(token) else {
            problem = "That app is already on your list."
            return
        }
        done(token)
    }
}
