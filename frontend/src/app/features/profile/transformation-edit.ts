import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { ApiService } from '../../core/api/api.service';
import { isProRequired } from '../../core/api/errors';
import { ModerationState, PostVisibility, Transformation, TransformationLayout, TransformationRequest, TransformationView } from '../../core/api/models';
import { PhotoSource, pickPhoto } from '../../core/native/photos';
import { samePhoto } from '../../core/photo-links';
import { PromptService } from '../../core/prompt.service';
import { SessionStore } from '../../core/session.store';
import { ToastService } from '../../core/toast.service';
import { ProTag } from '../../ui/bits';
import { Icon } from '../../ui/icon';
import { reportedText } from '../../ui/reported-flag';
import { TransformationViewer } from '../../ui/transformation-viewer';
import { shrinkImage } from '../journey/journey.util';
import { widens } from '../journey/visibility';

type Side = 'before' | 'after';

const VISIBILITY: { id: PostVisibility; label: string; hint: string; icon: string; pro: boolean }[] = [
  { id: 'PRIVATE', label: 'Private', hint: 'Only you', icon: 'lock', pro: false },
  { id: 'FRIENDS', label: 'Friends', hint: 'Your friends can see and comment', icon: 'users', pro: true },
  { id: 'EVERYONE', label: 'Everyone', hint: 'Shows in the public feed', icon: 'globe', pro: true }
];

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ProTag, Icon, TransformationViewer],
  template: `
    <div class="screen">
      <div class="pad pt-3 flex items-center gap-3">
        <button class="circ" (click)="back()" aria-label="Back"><app-icon name="back" /></button>
        <div class="h text-[26px] flex-1 leading-none">{{ id() ? 'Edit before & after' : 'New before & after' }}</div>
        @if (id()) { <button class="circ text-accent" [disabled]="saving()" (click)="remove()" aria-label="Delete"><app-icon name="trash" /></button> }
      </div>

      @if (ready()) {
        <div class="pad mt-4 grid grid-cols-2 gap-2.5">
          @for (side of sides; track side) {
            <div>
              <div class="lbl mb-1.5">{{ side === 'before' ? 'Before' : 'After' }}</div>
              <label class="relative block h-[190px] rounded-[16px] overflow-hidden bg-s1 border border-dashed border-line cursor-pointer" (click)="native && pick($event, side)">
                @if (!native) { <input type="file" accept="image/*" class="hidden" [disabled]="uploading() === side" (change)="onFile($event, side)"> }
                @if (url(side); as u) {
                  <img class="ph" [src]="u" [alt]="side">
                  <span class="absolute right-2 bottom-2 circ !w-9 !h-9 !bg-[rgba(0,0,0,.5)]"><app-icon name="edit" [size]="15" /></span>
                } @else {
                  <span class="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-mute text-[12.5px] font-bold">
                    <app-icon name="camera" [size]="24" />Add photo
                  </span>
                }
                @if (uploading() === side) { <span class="skeleton absolute inset-0"></span><span class="absolute inset-0 grid place-items-center text-[12.5px] font-bold">Uploading…</span> }
              </label>
              <input class="field !h-[42px] mt-2 !text-[13.5px]" type="text" maxlength="160" [placeholder]="side === 'before' ? 'Caption, e.g. Day 1' : 'Caption, e.g. Day 90'"
                [value]="caption(side)" (input)="setCaption(side, $event)" [attr.aria-label]="side + ' caption'">
            </div>
          }
        </div>

        <div class="pad mt-4">
          <div class="lbl mb-2">Layout</div>
          <div class="grid grid-cols-2 gap-1 bg-s1 rounded-[14px] p-1 border border-line">
            @for (l of layouts; track l.id) {
              <button class="rounded-[10px] h-[38px] flex items-center justify-center gap-2 font-bold text-[13.5px]" [class.bg-s3]="layout() === l.id" [class.text-mute]="layout() !== l.id" (click)="layout.set(l.id)">
                <app-icon [name]="l.icon" [size]="16" />{{ l.label }}
              </button>
            }
          </div>
        </div>

        @if (preview(); as p) {
          <div class="mx-5 mt-4 card overflow-hidden"><app-transformation-viewer [t]="p" [height]="260" /></div>
        }

        <div class="pad mt-4">
          <div class="lbl mb-2">Who can see it</div>
          <div class="space-y-2">
            @for (v of visibilities; track v.id) {
              <button class="w-full p-3 flex gap-3 items-center text-left disabled:opacity-50" [class]="visibility() === v.id ? 'card-hi' : 'card'" style="border-radius:14px"
                [attr.data-test]="'vis-' + v.id" [disabled]="locked(v.id)" (click)="setVisibility(v.id, v.pro)">
                <span class="radio" [class.on]="visibility() === v.id" style="width:18px;height:18px"></span>
                <span class="inline-flex text-mute"><app-icon [name]="v.icon" [size]="17" /></span>
                <span class="flex-1 min-w-0">
                  <span class="font-bold text-[14.5px] flex items-center gap-1.5">{{ v.label }}@if (v.pro && !pro()) { <app-pro-tag /> }</span>
                  <span class="block text-[12px] text-mute">{{ v.hint }}</span>
                </span>
              </button>
            }
          </div>
          @if (reportedHint(); as h) {
            <p class="mt-2.5 text-[12.5px] text-mute flex items-start gap-1.5" data-test="visibility-hint"><span class="tag tag-accent flex-none"><app-icon name="flag" />Reported</span>{{ h }}</p>
          }
          @if (hiddenOnFree()) {
            <p class="mt-2.5 text-[12.5px] font-semibold text-gold flex items-center gap-1.5"><app-icon name="eyeoff" [size]="14" />Hidden while you're on Free. It's shared again when you go PRO.</p>
          }
        </div>

        <div class="mt-auto pad pt-6" style="padding-bottom: calc(40px + env(safe-area-inset-bottom))">
          <button class="btn btn-primary" [disabled]="!valid() || saving() || !!uploading()" (click)="save()">{{ saving() ? 'Saving…' : 'Save' }}</button>
        </div>
      } @else {
        <div class="pad mt-4 space-y-3"><div class="skeleton h-[240px]"></div><div class="skeleton h-[48px]"></div><div class="skeleton h-[160px]"></div></div>
      }
    </div>
  `
})
export class TransformationEditPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionStore);
  private readonly prompt = inject(PromptService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly location = inject(Location);

  readonly id = input<string | undefined>(undefined);

  protected readonly native = Capacitor.isNativePlatform();
  protected readonly pro = this.session.pro;
  protected readonly sides: Side[] = ['before', 'after'];
  protected readonly visibilities = VISIBILITY;
  protected readonly layouts: { id: TransformationLayout; label: string; icon: string }[] = [
    { id: 'SPLIT', label: 'Split', icon: 'split' },
    { id: 'SLIDESHOW', label: 'Slideshow', icon: 'slides' }
  ];
  protected readonly ready = signal(false);
  protected readonly saving = signal(false);
  protected readonly uploading = signal<Side | null>(null);
  protected readonly beforeUrl = signal<string | null>(null);
  protected readonly afterUrl = signal<string | null>(null);
  protected readonly beforeCaption = signal('');
  protected readonly afterCaption = signal('');
  protected readonly layout = signal<TransformationLayout>('SPLIT');
  protected readonly visibility = signal<PostVisibility>('PRIVATE');
  private readonly original = signal<Transformation | null>(null);
  private readonly moderation = computed<ModerationState | null>(() => {
    const t = this.original();
    return t?.moderation ?? (t?.removedByModerator ? 'REMOVED' : null);
  });
  protected readonly reportedHint = computed(() => reportedText(this.moderation()));
  protected readonly valid = computed(() => !!this.beforeUrl() && !!this.afterUrl());
  protected readonly hiddenOnFree = computed(() => !this.pro() && this.visibility() !== 'PRIVATE');
  protected readonly preview = computed<TransformationView | null>(() => {
    const before = this.beforeUrl();
    const after = this.afterUrl();
    return before && after
      ? { layout: this.layout(), beforeUrl: before, afterUrl: after, beforeCaption: this.beforeCaption() || null, afterCaption: this.afterCaption() || null }
      : null;
  });

  ngOnInit(): void {
    void this.load();
  }

  protected url(side: Side): string | null {
    return side === 'before' ? this.beforeUrl() : this.afterUrl();
  }

  protected caption(side: Side): string {
    return side === 'before' ? this.beforeCaption() : this.afterCaption();
  }

  protected setCaption(side: Side, e: Event): void {
    const value = (e.target as HTMLInputElement).value;
    (side === 'before' ? this.beforeCaption : this.afterCaption).set(value);
  }

  protected locked(v: PostVisibility): boolean {
    const t = this.original();
    return !!t && !!this.moderation() && widens(t.visibility, v);
  }

  protected setVisibility(v: PostVisibility, pro: boolean): void {
    if (this.locked(v)) return;
    if (pro && !this.pro()) {
      void this.router.navigateByUrl('/paywall');
      return;
    }
    this.visibility.set(v);
  }

  protected async pick(e: Event, side: Side): Promise<void> {
    e.preventDefault();
    if (this.uploading()) return;
    const source = await this.prompt.choose(side === 'before' ? 'Before photo' : 'After photo', [
      { key: 'camera', label: 'Take a photo', icon: 'camera' },
      { key: 'gallery', label: 'Choose from gallery', icon: 'image' }
    ]);
    if (source) await this.upload(side, () => pickPhoto(source as PhotoSource));
  }

  protected async onFile(e: Event, side: Side): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) await this.upload(side, () => shrinkImage(file));
  }

  protected async save(): Promise<void> {
    if (!this.valid() || this.saving()) return;
    this.saving.set(true);
    const t = this.original();
    const req: TransformationRequest = {
      beforeCaption: this.beforeCaption().trim(),
      afterCaption: this.afterCaption().trim(),
      layout: this.layout(),
      visibility: this.visibility()
    };
    if (!t || !samePhoto(this.beforeUrl(), t.beforeUrl)) req.beforeUrl = this.beforeUrl()!;
    if (!t || !samePhoto(this.afterUrl(), t.afterUrl)) req.afterUrl = this.afterUrl()!;
    try {
      const id = this.id();
      if (id) await this.api.updateTransformation(id, req);
      else await this.api.addTransformation(req);
      this.toast.show(this.visibility() === 'PRIVATE' ? 'Saved. Only you can see it.' : this.hiddenOnFree() ? "Saved. Hidden while you're on Free." : 'Shared with your community.');
      void this.router.navigateByUrl('/me', { replaceUrl: true });
    } catch (e) {
      if (isProRequired(e)) void this.router.navigateByUrl('/paywall');
      else this.toast.error(e);
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(): Promise<void> {
    const id = this.id();
    if (!id) return;
    const ok = await this.prompt.confirm('Delete this before & after?', 'The photos, comments and hypes on it will be removed.', 'Delete', 'Keep');
    if (!ok) return;
    this.saving.set(true);
    try {
      await this.api.deleteTransformation(id);
      void this.router.navigateByUrl('/me', { replaceUrl: true });
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.saving.set(false);
    }
  }

  protected back(): void {
    if (window.history.length > 1) this.location.back();
    else void this.router.navigateByUrl('/me');
  }

  private async upload(side: Side, get: () => Promise<Blob | null>): Promise<void> {
    this.uploading.set(side);
    try {
      const blob = await get();
      if (!blob) return;
      const { url } = await this.api.upload(blob, `${side}-${Date.now()}.jpg`);
      (side === 'before' ? this.beforeUrl : this.afterUrl).set(url);
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.uploading.set(null);
    }
  }

  private async load(): Promise<void> {
    const id = this.id();
    if (!id) {
      this.ready.set(true);
      return;
    }
    try {
      const t = (await this.api.transformations()).find(x => x.id === id);
      if (!t) {
        void this.router.navigateByUrl('/me', { replaceUrl: true });
        return;
      }
      this.original.set(t);
      this.beforeUrl.set(t.beforeUrl);
      this.afterUrl.set(t.afterUrl);
      this.beforeCaption.set(t.beforeCaption ?? '');
      this.afterCaption.set(t.afterCaption ?? '');
      this.layout.set(t.layout);
      this.visibility.set(t.visibility);
      this.ready.set(true);
    } catch (e) {
      this.toast.error(e);
    }
  }
}
