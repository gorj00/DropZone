import { Directive, input, output, signal } from '@angular/core';

export const PULL_TRIGGER = 64;
const PULL_MAX = 96;

@Directive({
  selector: '[appPullRefresh]',
  exportAs: 'pull',
  host: {
    '(touchstart)': 'start($event)',
    '(touchmove)': 'move($event)',
    '(touchend)': 'end()',
    '(touchcancel)': 'end()'
  }
})
export class PullRefresh {
  private startY: number | null = null;

  readonly refreshing = input(false);
  readonly appPullRefresh = output<void>();
  readonly distance = signal(0);

  protected start(e: TouchEvent): void {
    if (e.touches.length !== 1 || window.scrollY > 0 || this.refreshing()) return;
    if ((e.target as Element | null)?.closest('.sheet, .sheet-backdrop')) return;
    this.startY = e.touches[0].clientY;
  }

  protected move(e: TouchEvent): void {
    if (this.startY === null) return;
    const dy = e.touches[0].clientY - this.startY;
    this.distance.set(dy > 0 && window.scrollY <= 0 ? Math.min(PULL_MAX, dy * 0.5) : 0);
  }

  protected end(): void {
    if (this.startY === null) return;
    this.startY = null;
    if (this.distance() >= PULL_TRIGGER) this.appPullRefresh.emit();
    this.distance.set(0);
  }
}
