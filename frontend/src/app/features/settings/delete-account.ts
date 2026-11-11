import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth';
import { openExternal, playSubscriptionsUrl } from '../../core/config.service';
import { storeOf } from '../../core/platform';
import { SessionStore } from '../../core/session.store';
import { ToastService } from '../../core/toast.service';
import { SheetDrag } from '../../ui/sheet-drag';

@Component({
  selector: 'app-delete-account-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SheetDrag],
  template: `
    <div class="sheet-backdrop" (click)="close()"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="delete-title" sheetDrag (sheetDismiss)="close()">
      <div class="grabber"></div>
      <div id="delete-title" class="h text-[24px] mt-5">Delete account?</div>
      <p class="text-[14px] text-mute mt-2 leading-snug">Your photos, posts and progress are removed for good. This cannot be undone.</p>
      <p class="text-[14px] text-mute mt-2 leading-snug">{{ store().apple ? 'Deleting your account does not cancel an App Store subscription. Cancel it in the App Store.' : 'Deleting your account does not cancel a Google Play subscription. Cancel it in Google Play.' }}</p>
      <button type="button" class="text-[13.5px] font-bold text-accent mt-2" (click)="openSubscriptions()">Manage subscription in {{ store().name }}</button>
      <label class="lbl block mt-5 mb-1.5" for="delete-confirm">Type DELETE to confirm</label>
      <input id="delete-confirm" class="field" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false"
        [value]="text()" (input)="text.set($any($event.target).value)" />
      <div class="flex gap-3 mt-5">
        <button type="button" class="btn btn-ghost flex-1" (click)="close()">Cancel</button>
        <button type="button" class="btn btn-primary flex-1" [disabled]="busy() || !confirmed()" (click)="delete()">{{ busy() ? 'Deleting…' : 'Delete' }}</button>
      </div>
    </div>
  `
})
export class DeleteAccountSheet {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly session = inject(SessionStore);

  readonly closed = output<void>();

  protected readonly busy = signal(false);
  protected readonly store = computed(() => storeOf(this.session.user()?.proProductId));
  protected readonly text = signal('');
  protected readonly confirmed = computed(() => this.text().trim() === 'DELETE');

  protected close(): void {
    if (!this.busy()) this.closed.emit();
  }

  protected openSubscriptions(): void {
    openExternal(playSubscriptionsUrl(this.session.user()?.proProductId));
  }

  protected async delete(): Promise<void> {
    if (this.busy() || !this.confirmed()) return;
    this.busy.set(true);
    try {
      await this.api.deleteAccount();
      this.busy.set(false);
      this.closed.emit();
      await this.auth.signOut({ revoked: true, deleted: true });
      this.toast.show('Your account was deleted.');
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.busy.set(false);
    }
  }
}
