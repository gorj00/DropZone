import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, model, signal } from '@angular/core';
import { ApiService } from '../core/api/api.service';

export const BIO_MAX = 150;
const HANDLE_RE = /^[a-z0-9._]{3,20}$/;

type HandleState = 'idle' | 'checking' | 'ok' | 'taken' | 'invalid' | 'error';

export function cleanHandle(raw: string): string {
  return raw.trim().toLowerCase().replace(/^@/, '');
}

@Component({
  selector: 'app-profile-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="block">
      <span class="lbl block mb-1.5">Name</span>
      <input class="field" type="text" maxlength="80" autocomplete="name" placeholder="Your name"
             [value]="name()" (input)="name.set($any($event.target).value)">
    </label>
    <label class="block mt-4">
      <span class="lbl block mb-1.5">Handle</span>
      <span class="relative block">
        <span class="absolute left-4 top-1/2 -translate-y-1/2 text-mute font-bold">&#64;</span>
        <input class="field !pl-9 !pr-[96px]" type="text" maxlength="21" autocapitalize="none" autocomplete="username" spellcheck="false"
               placeholder="yourhandle" [value]="handle()" (input)="handle.set(clean($any($event.target).value))">
        <span class="absolute right-4 top-1/2 -translate-y-1/2 text-[12px] font-bold" [class]="stateClass()">{{ stateText() }}</span>
      </span>
      <span class="block text-[12px] mt-1.5" [class.text-accent]="handleState() === 'invalid' || handleState() === 'taken'" [class.text-mute]="handleState() !== 'invalid' && handleState() !== 'taken'">
        {{ handleHint() }}
      </span>
    </label>
    <label class="block mt-4">
      <span class="flex items-baseline justify-between mb-1.5"><span class="lbl">Bio</span><span class="text-[11px] text-mute num">{{ bio().length }}/{{ max }}</span></span>
      <textarea class="field !h-[92px] py-3 resize-none leading-snug" [attr.maxlength]="max" placeholder="Optional. What are you working towards?"
                [value]="bio()" (input)="bio.set($any($event.target).value)"></textarea>
    </label>
  `
})
export class ProfileForm {
  private readonly api = inject(ApiService);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private seq = 0;

  readonly name = model('');
  readonly handle = model('');
  readonly bio = model('');
  protected readonly max = BIO_MAX;
  protected readonly handleState = signal<HandleState>('idle');
  private readonly hint = signal<string | null>(null);

  readonly valid = computed(() => this.name().trim().length > 0 && this.handleState() === 'ok' && this.bio().length <= BIO_MAX);
  readonly checking = computed(() => this.handleState() === 'checking');

  protected readonly stateText = computed(() => {
    switch (this.handleState()) {
      case 'checking': return 'Checking…';
      case 'ok': return 'Available';
      case 'taken': return 'Taken';
      case 'invalid': return 'Invalid';
      case 'error': return 'Offline';
      default: return '';
    }
  });
  protected readonly stateClass = computed(() => (this.handleState() === 'ok' ? 'text-ok' : this.handleState() === 'checking' || this.handleState() === 'error' ? 'text-mute' : 'text-accent'));
  protected readonly handleHint = computed(() => this.hint() ?? '3–20 characters: a–z, 0–9, dot or underscore.');

  constructor() {
    effect(() => this.check(this.handle()));
    inject(DestroyRef).onDestroy(() => this.timer && clearTimeout(this.timer));
  }

  protected clean(raw: string): string {
    return cleanHandle(raw);
  }

  private check(handle: string): void {
    if (this.timer) clearTimeout(this.timer);
    const seq = ++this.seq;
    if (!HANDLE_RE.test(handle)) {
      this.handleState.set(handle ? 'invalid' : 'idle');
      this.hint.set(null);
      return;
    }
    this.handleState.set('checking');
    this.timer = setTimeout(async () => {
      try {
        const r = await this.api.handleAvailable(handle);
        if (seq !== this.seq) return;
        this.handleState.set(!r.valid ? 'invalid' : r.available ? 'ok' : 'taken');
        this.hint.set(r.available ? null : r.message);
      } catch {
        if (seq !== this.seq) return;
        this.handleState.set('error');
        this.hint.set('Could not check the handle right now.');
      }
    }, 350);
  }
}
