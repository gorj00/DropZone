import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { ApiService } from '../../core/api/api.service';
import { PhotoCredit } from '../../core/api/models';
import { apiError } from '../../core/api/errors';
import { pickPhoto } from '../../core/native/photos';
import { samePhoto } from '../../core/photo-links';
import { PromptService } from '../../core/prompt.service';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../ui/icon';
import { UnsplashCredit } from '../../ui/unsplash-credit';
import { shrinkImage } from './journey.util';

export interface RewardPhoto {
  url: string;
  thumb: string;
  credit: PhotoCredit | null;
  unsplashId: string | null;
}

interface SearchError {
  text: string;
  retry: boolean;
}


export function trackUnsplashDownload(api: ApiService, id: string | null): void {
  if (id) void api.trackPhotoDownload(id).catch(() => undefined);
}

function plain(url: string): RewardPhoto {
  return { url, thumb: url, credit: null, unsplashId: null };
}

export function searchError(e: unknown): SearchError {
  const err = apiError(e);
  if (err.code === 'NETWORK') return { text: 'No connection. Check your internet and try again.', retry: true };
  if (err.code === 'PHOTO_SEARCH_OFF') return { text: err.message, retry: false };
  if (err.code.startsWith('PHOTO_SEARCH') || (err.code === 'RATE_LIMITED' && err.message)) return { text: err.message, retry: true };
  return { text: 'Photo search isn\'t working right now. Try again or upload your own photo.', retry: true };
}

@Component({
  selector: 'app-reward-photo-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, UnsplashCredit],
  template: `
    <div class="grid grid-cols-2 gap-1 bg-s1 rounded-[14px] p-1 border border-line">
      <button class="rounded-[10px] h-[36px] flex items-center justify-center gap-2 font-bold text-[13.5px]" [class.bg-s3]="tab() === 'search'" [class.text-mute]="tab() !== 'search'" (click)="tab.set('search')">
        <app-icon name="search" [size]="15" />Search photos
      </button>
      <button class="rounded-[10px] h-[36px] flex items-center justify-center gap-2 font-bold text-[13.5px]" [class.bg-s3]="tab() === 'upload'" [class.text-mute]="tab() !== 'upload'" (click)="tab.set('upload')">
        <app-icon name="upload" [size]="15" />Upload
      </button>
    </div>

    @if (tab() === 'search') {
      <div class="mt-2.5 card h-[42px] px-3.5 flex items-center gap-2" style="border-radius:12px">
        <app-icon name="search" [size]="16" class="text-mute" />
        <input class="flex-1 bg-transparent outline-none text-[14.5px]" placeholder="Search photos" [value]="query()" (input)="onQuery($event)" enterkeyhint="search">
      </div>
      <div class="grid grid-cols-3 gap-2 mt-2.5">
        @if (searching() && !searchTiles().length) {
          @for (i of [1, 2, 3, 4, 5, 6]; track i) { <div class="skeleton h-[84px]"></div> }
        } @else if (error(); as err) {
          <div class="col-span-3 rounded-[14px] bg-s1 border border-line px-4 py-4 flex flex-col items-center gap-3 text-center" role="alert">
            <span class="text-[13px] text-mute">{{ err.text }}</span>
            <div class="flex gap-2">
              @if (err.retry) {
                <button class="btn btn-ghost btn-sm !h-[34px] !text-[13px]" [disabled]="searching()" (click)="retry()">Try again</button>
              }
              <button class="btn btn-ghost btn-sm !h-[34px] !text-[13px]" (click)="tab.set('upload')"><app-icon name="upload" [size]="14" />Upload</button>
            </div>
          </div>
        } @else {
          @for (t of searchTiles(); track t.url) {
            <button class="relative h-[84px] rounded-[14px] overflow-hidden bg-s2" [style.box-shadow]="isSelected(t) ? ring : null" (click)="pick(t)">
              <img class="ph" [src]="t.thumb" alt="" loading="lazy">
              @if (isSelected(t)) { <span class="check"><app-icon name="check" /></span> }
            </button>
          } @empty {
            <div class="col-span-3 text-[13px] text-mute py-4 text-center">{{ query().trim() ? 'No photos found.' : 'Type what you are working for.' }}</div>
          }
        }
      </div>
    } @else {
      <div class="grid grid-cols-3 gap-2 mt-2.5">
        <label class="relative h-[84px] rounded-[14px] border border-dashed border-line bg-s1 flex flex-col items-center justify-center gap-1 text-mute text-[12px] font-bold cursor-pointer" (click)="onUploadTap($event)">
          <input type="file" accept="image/*" class="hidden" [disabled]="uploading()" (change)="onFile($event)">
          @if (uploading()) {
            <span class="skeleton absolute inset-0"></span><span class="relative">Uploading…</span>
          } @else {
            <app-icon name="upload" [size]="20" />Upload
          }
        </label>
        @for (t of uploadTiles(); track t.url) {
          <button class="relative h-[84px] rounded-[14px] overflow-hidden bg-s2" [style.box-shadow]="isSelected(t) ? ring : null" (click)="pick(t)">
            <img class="ph" [src]="t.thumb" alt="" loading="lazy">
            @if (isSelected(t)) { <span class="check"><app-icon name="check" /></span> }
          </button>
        }
      </div>
    }
    @if (credit()) {
      <p class="text-[11px] text-mute mt-2"><app-unsplash-credit [credit]="credit()" /></p>
    }
  `
})
export class RewardPhotoPicker {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly prompt = inject(PromptService);
  private readonly native = Capacitor.isNativePlatform();

  readonly selected = input<string | null>(null);
  readonly selectedCredit = input<PhotoCredit | null | undefined>(null);
  readonly initialQuery = input('');
  readonly picked = output<RewardPhoto | null>();
  readonly uploadingChange = output<boolean>();

  protected readonly ring = '0 0 0 2px var(--accent), 0 0 18px rgba(var(--accent-rgb), .65)';
  protected readonly tab = signal<'search' | 'upload'>('search');
  protected readonly query = signal('');
  protected readonly results = signal<RewardPhoto[]>([]);
  protected readonly searching = signal(false);
  protected readonly error = signal<SearchError | null>(null);
  protected readonly uploads = signal<string[]>([]);
  protected readonly uploading = signal(false);
  protected readonly credit = signal<RewardPhoto['credit']>(null);

  protected readonly searchTiles = computed(() => {
    const list = this.results();
    const p = this.selected();
    return p && !list.some(t => samePhoto(t.url, p)) ? [plain(p), ...list] : list;
  });

  protected readonly uploadTiles = computed(() => {
    const p = this.selected();
    const urls = [...this.uploads()];
    if (p && !urls.some(u => samePhoto(u, p))) urls.unshift(p);
    return urls.map(plain);
  });

  protected isSelected(t: RewardPhoto): boolean {
    return !!this.selected() && samePhoto(t.url, this.selected());
  }

  private seeded = false;
  private creditSeeded = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private seq = 0;

  constructor() {
    effect(() => {
      const cr = this.selectedCredit();
      if (this.creditSeeded || !cr) return;
      this.creditSeeded = true;
      untracked(() => this.credit.set(cr));
    });
    effect(() => {
      const q = this.initialQuery().trim();
      if (this.seeded || !q) return;
      this.seeded = true;
      this.query.set(q);
      void this.search(q);
    });
    inject(DestroyRef).onDestroy(() => {
      if (this.timer) clearTimeout(this.timer);
      this.seq++;
    });
  }

  protected retry(): void {
    void this.search(this.query());
  }

  protected onQuery(e: Event): void {
    const q = (e.target as HTMLInputElement).value;
    this.query.set(q);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.search(q), 450);
  }

  protected async pick(t: RewardPhoto): Promise<void> {
    if (this.isSelected(t)) {
      const ok = await this.prompt.confirm('Remove this photo?', 'The milestone reward will have no photo until you pick a new one.', 'Remove', 'Cancel');
      if (!ok) return;
      this.credit.set(null);
      this.picked.emit(null);
      return;
    }
    this.credit.set(t.credit);
    this.picked.emit(t);
  }

  protected onUploadTap(e: Event): void {
    if (!this.native) return;
    e.preventDefault();
    if (!this.uploading()) void this.uploadFrom(pickPhoto);
  }

  protected async onFile(e: Event): Promise<void> {
    const el = e.target as HTMLInputElement;
    const file = el.files?.[0];
    el.value = '';
    if (file) await this.uploadFrom(() => shrinkImage(file));
  }

  private async uploadFrom(source: () => Promise<Blob | null>): Promise<void> {
    this.setUploading(true);
    try {
      const blob = await source();
      if (!blob) return;
      const { url } = await this.api.upload(blob, `reward-${Date.now()}.jpg`);
      this.uploads.update(u => [url, ...u]);
      this.credit.set(null);
      this.picked.emit(plain(url));
    } catch (err) {
      this.toast.error(err);
    } finally {
      this.setUploading(false);
    }
  }

  private setUploading(v: boolean): void {
    this.uploading.set(v);
    this.uploadingChange.emit(v);
  }

  private async search(q: string): Promise<void> {
    const term = q.trim();
    const id = ++this.seq;
    this.error.set(null);
    if (!term) {
      this.results.set([]);
      this.searching.set(false);
      return;
    }
    this.searching.set(true);
    try {
      const photos = await this.api.searchPhotos(term);
      if (id !== this.seq) return;
      this.results.set(photos.map(p => ({ url: p.url, thumb: p.thumb, credit: p.credit, unsplashId: p.id })));
    } catch (e) {
      if (id !== this.seq) return;
      this.results.set([]);
      this.error.set(searchError(e));
    } finally {
      if (id === this.seq) this.searching.set(false);
    }
  }
}
