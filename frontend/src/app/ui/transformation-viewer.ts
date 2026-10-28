import { ChangeDetectionStrategy, Component, ElementRef, input, signal, viewChild } from '@angular/core';
import { TransformationView } from '../core/api/models';

@Component({
  selector: 'app-transformation-viewer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (t(); as v) {
      @if (v.layout === 'SPLIT') {
        <div class="grid grid-cols-2 gap-[2px] bg-line" [style.height.px]="height()">
          @for (side of sides(v); track side.label) {
            <div class="relative overflow-hidden bg-s2">
              <img class="ph" [src]="side.url" [alt]="side.label" loading="lazy">
              <span class="chip absolute left-2 top-2 !bg-[rgba(0,0,0,.45)] !text-white !border-transparent">{{ side.label }}</span>
              @if (side.caption) {
                <div class="absolute inset-x-0 bottom-0 px-2.5 pb-2 pt-6 text-[12px] font-semibold leading-snug text-white bg-gradient-to-t from-black/70 to-transparent">{{ side.caption }}</div>
              }
            </div>
          }
        </div>
      } @else {
        <div class="relative" [style.height.px]="height()">
          <div #track class="flex h-full overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" (scroll)="onScroll()">
            @for (side of sides(v); track side.label) {
              <div class="relative flex-none w-full h-full snap-center bg-s2 overflow-hidden">
                <img class="ph" [src]="side.url" [alt]="side.label" loading="lazy">
                <span class="chip absolute left-3 top-3 !bg-[rgba(0,0,0,.45)] !text-white !border-transparent">{{ side.label }}</span>
                @if (side.caption) {
                  <div class="absolute inset-x-0 bottom-0 px-3.5 pb-7 pt-8 text-[13px] font-semibold leading-snug text-white bg-gradient-to-t from-black/70 to-transparent">{{ side.caption }}</div>
                }
              </div>
            }
          </div>
          <div class="absolute bottom-2.5 inset-x-0 flex justify-center gap-1.5">
            @for (i of [0, 1]; track i) {
              <button type="button" class="h-[6px] rounded-full transition-all" [class.w-5]="slide() === i" [class.w-[6px]]="slide() !== i"
                [style.background]="slide() === i ? 'var(--accent)' : 'rgba(255,255,255,.55)'" (click)="go(i)" [attr.aria-label]="i ? 'After' : 'Before'"></button>
            }
          </div>
        </div>
      }
    }
  `
})
export class TransformationViewer {
  readonly t = input.required<TransformationView>();
  readonly height = input(280);
  protected readonly slide = signal(0);
  private readonly track = viewChild<ElementRef<HTMLElement>>('track');

  protected sides(v: TransformationView): { label: string; url: string; caption: string | null }[] {
    return [
      { label: 'BEFORE', url: v.beforeUrl, caption: v.beforeCaption },
      { label: 'AFTER', url: v.afterUrl, caption: v.afterCaption }
    ];
  }

  protected onScroll(): void {
    const el = this.track()?.nativeElement;
    if (el && el.clientWidth) this.slide.set(Math.round(el.scrollLeft / el.clientWidth));
  }

  protected go(i: number): void {
    const el = this.track()?.nativeElement;
    el?.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  }
}
