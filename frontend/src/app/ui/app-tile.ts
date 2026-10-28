import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

export interface LockableApp {
  pkg: string;
  name: string;
  key: 'ig' | 'tt' | 'yt' | 'sc';
  free: boolean;
}

export const LOCKABLE_APPS: LockableApp[] = [
  { pkg: 'com.instagram.android', name: 'Instagram', key: 'ig', free: true },
  { pkg: 'com.zhiliaoapp.musically', name: 'TikTok', key: 'tt', free: false },
  { pkg: 'com.google.android.youtube', name: 'YouTube', key: 'yt', free: false },
  { pkg: 'com.snapchat.android', name: 'Snapchat', key: 'sc', free: false }
];

const GLYPHS: Record<string, string> = {
  ig: '<rect x="3.5" y="3.5" width="17" height="17" rx="5" fill="none" stroke="#fff" stroke-width="2.2"/><circle cx="12" cy="12" r="3.9" fill="none" stroke="#fff" stroke-width="2.2"/><circle cx="17.2" cy="6.8" r="1.3" fill="#fff"/>',
  tt: '<g fill="none" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><g stroke="#25f4ee" transform="translate(-1 -1)"><path d="M13.5 4v10.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M13.5 4c.4 2.6 2.4 4.4 5 4.6"/></g><g stroke="#fe2c55" transform="translate(1 1)"><path d="M13.5 4v10.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M13.5 4c.4 2.6 2.4 4.4 5 4.6"/></g><g stroke="#fff"><path d="M13.5 4v10.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M13.5 4c.4 2.6 2.4 4.4 5 4.6"/></g></g>',
  yt: '<path d="M9.5 7.5v9l7.5-4.5z" fill="#fff" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/>',
  sc: '<path d="M12 3c3 0 5 2.2 5 5v2.2l1.6-.4c.6-.1.9.6.4.9l-1.8 1c.6 1.6 2 2.8 3.3 3.2.4.1.4.7 0 .8l-1.6.4-.3 1.2-1.8-.1c-1 0-1.8 1.3-4.8 1.3s-3.8-1.3-4.8-1.3l-1.8.1-.3-1.2-1.6-.4c-.4-.1-.4-.7 0-.8 1.3-.4 2.7-1.6 3.3-3.2l-1.8-1c-.5-.3-.2-1 .4-.9L7 10.2V8c0-2.8 2-5 5-5z" fill="#fff" stroke="#000" stroke-width="1.4" stroke-linejoin="round"/>'
};

@Component({
  selector: 'app-tile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display:contents' },
  template: `<span class="app {{ key() }}" [style.width.px]="size()" [style.height.px]="size()" [style.border-radius.px]="size() * 0.3"><svg viewBox="0 0 24 24" [innerHTML]="glyph()"></svg></span>`
})
export class AppTile {
  private readonly sanitizer = inject(DomSanitizer);
  readonly key = input.required<string>();
  readonly size = input(40);
  protected readonly glyph = computed(() => this.sanitizer.bypassSecurityTrustHtml(GLYPHS[this.key()] ?? ''));
}
