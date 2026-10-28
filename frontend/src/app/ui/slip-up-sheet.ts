import { ChangeDetectionStrategy, Component, OnInit, inject, output, signal } from '@angular/core';
import { ApiService } from '../core/api/api.service';
import { SlipUpType } from '../core/api/models';
import { PromptService } from '../core/prompt.service';
import { ToastService } from '../core/toast.service';
import { Icon } from './icon';
import { SheetDrag } from './sheet-drag';

type When = 'NOW' | 'HOUR' | 'EARLIER';

@Component({
  selector: 'app-slip-up-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, SheetDrag],
  template: `
    <div class="sheet-backdrop" (click)="closed.emit()"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="Log a slip-up" sheetDrag (sheetDismiss)="closed.emit()">
      <div class="grabber"></div>
      <div class="h text-[30px] [[data-theme=stealth]_&]:text-[34px] mt-4">Log a slip-up</div>
      <p class="text-[13.5px] text-mute mt-1.5 leading-snug">It happens. Your streak stays, it just shows up in Stats.</p>
      <div class="lbl mt-4">What happened?</div>
      <div class="grid grid-cols-2 gap-2 mt-2">
        @for (t of types(); track t.code) {
          @if (t.custom) {
            <div class="relative">
              <button class="pick w-full !pr-9" [class.on]="picked() === t.code" (click)="picked.set(t.code)"><app-icon [name]="t.icon" /><span class="truncate">{{ t.name }}</span></button>
              <button class="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 grid place-items-center rounded-full text-mute" [disabled]="saving()" (click)="removeType(t)" [attr.aria-label]="'Remove ' + t.name"><app-icon name="close" [size]="14" /></button>
            </div>
          } @else {
            <button class="pick" [class.on]="picked() === t.code" (click)="picked.set(t.code)"><app-icon [name]="t.icon" />{{ t.name }}</button>
          }
        } @empty {
          @for (i of [1, 2, 3, 4, 5, 6]; track i) { <div class="skeleton h-[44px]"></div> }
        }
        @if (types().length && !adding()) {
          <button class="pick" style="border-style:dashed" [style.color]="'var(--mute)'" (click)="adding.set(true)"><app-icon name="plus" />Add your own</button>
        }
      </div>
      @if (adding()) {
        <form class="card p-3 mt-2.5" (submit)="$event.preventDefault(); addType(name.value); name.value = ''">
          <div class="lbl">Your slip-up</div>
          <input #name class="field mt-2" maxlength="40" placeholder="e.g. Energy drink" autocomplete="off" required />
          <div class="flex gap-1.5 mt-2.5 overflow-x-auto pb-1">
            @for (i of customIcons; track i) {
              <button type="button" class="icon-pick flex-none" [class.on]="newIcon() === i" (click)="newIcon.set(i)" [attr.aria-label]="i"><app-icon [name]="i" /></button>
            }
          </div>
          <div class="flex gap-2 mt-3">
            <button type="button" class="btn btn-ghost btn-sm flex-1" (click)="adding.set(false)">Cancel</button>
            <button type="submit" class="btn btn-cyan btn-sm flex-1" [disabled]="saving()">Add</button>
          </div>
        </form>
      }
      <div class="lbl mt-4">When</div>
      <div class="flex gap-2 mt-2">
        @for (w of whens; track w.id) {
          <button class="chip !px-3 !py-2" [class.on]="when() === w.id" (click)="when.set(w.id)">{{ w.label }}</button>
        }
      </div>
      <div class="mt-6"><button class="btn btn-cyan" [disabled]="!picked() || saving()" (click)="log()">Log it</button></div>
    </div>
  `
})
export class SlipUpSheet implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly prompt = inject(PromptService);

  readonly closed = output<void>();
  readonly logged = output<void>();

  protected readonly types = signal<SlipUpType[]>([]);
  protected readonly picked = signal<string | null>(null);
  protected readonly when = signal<When>('NOW');
  protected readonly saving = signal(false);
  protected readonly adding = signal(false);
  protected readonly newIcon = signal('cup');
  protected readonly customIcons = ['cup', 'burger', 'wine', 'candy', 'bag', 'moon', 'phone', 'meal', 'drop', 'flame', 'film', 'timer'];
  protected readonly whens: { id: When; label: string }[] = [
    { id: 'NOW', label: 'Now' },
    { id: 'HOUR', label: '1 h ago' },
    { id: 'EARLIER', label: 'Earlier today' }
  ];

  ngOnInit(): void {
    void this.api.slipUpTypes()
      .then(t => {
        this.types.set(t);
        this.picked.set(t[0]?.code ?? null);
      })
      .catch(e => this.toast.error(e));
  }

  protected async addType(raw: string): Promise<void> {
    const name = raw.trim();
    if (!name || this.saving()) return;
    this.saving.set(true);
    try {
      const t = await this.api.addSlipUpType({ name, icon: this.newIcon() });
      this.types.update(list => [...list, t]);
      this.picked.set(t.code);
      this.adding.set(false);
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.saving.set(false);
    }
  }

  protected async removeType(t: SlipUpType): Promise<void> {
    if (this.saving()) return;
    const ok = await this.prompt.confirm(`Delete "${t.name}"?`, 'It disappears from the list. Slip-ups you already logged keep their name.', 'Delete', 'Cancel');
    if (!ok) return;
    this.saving.set(true);
    try {
      await this.api.deleteSlipUpType(t.code);
      this.types.update(list => list.filter(x => x.code !== t.code));
      if (this.picked() === t.code) this.picked.set(this.types()[0]?.code ?? null);
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.saving.set(false);
    }
  }

  protected async log(): Promise<void> {
    const type = this.picked();
    if (!type) return;
    const now = Date.now();
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const at = this.when() === 'NOW' ? now : this.when() === 'HOUR' ? now - 3600_000 : Math.max(midnight.getTime(), now - 4 * 3600_000);
    this.saving.set(true);
    try {
      await this.api.logSlipUp({ type, occurredAt: new Date(at).toISOString() });
      this.toast.show('Logged. Your streak is safe.');
      this.logged.emit();
      this.closed.emit();
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.saving.set(false);
    }
  }
}
