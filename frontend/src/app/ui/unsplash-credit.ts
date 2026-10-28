import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { PhotoCredit } from '../core/api/models';

export const UNSPLASH_UTM = '?utm_source=dropzone&utm_medium=referral';

@Component({
  selector: 'app-unsplash-credit',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (credit(); as cr) {
      Photo by <a class="underline" [href]="cr.link + utm" target="_blank" rel="noopener">{{ cr.name }}</a>
      on <a class="underline" [href]="'https://unsplash.com/' + utm" target="_blank" rel="noopener">Unsplash</a>
    }
  `
})
export class UnsplashCredit {
  readonly credit = input<PhotoCredit | null | undefined>(null);
  protected readonly utm = UNSPLASH_UTM;
}
