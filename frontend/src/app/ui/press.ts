import { Directive, ElementRef, OnDestroy, OnInit, inject, output } from '@angular/core';

const HOLD_MS = 500;
const DOUBLE_MS = 300;
const SLOP = 10;
const CONTROLS = 'button, a, input, textarea, select, label';

@Directive({
  selector: '[appPress]',
  host: {
    style: '-webkit-touch-callout: none; -webkit-user-select: none; user-select: none',
    '(pointerdown)': 'down($event)',
    '(pointermove)': 'move($event)',
    '(pointerup)': 'up($event)',
    '(pointercancel)': 'cancel()',
    '(contextmenu)': 'contextMenu($event)'
  }
})
export class Press implements OnInit, OnDestroy {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private start: { x: number; y: number } | null = null;
  private fired = false;
  private lastTap: { t: number; x: number; y: number } | null = null;
  private readonly swallow = (e: Event) => {
    if (!this.fired) return;
    this.fired = false;
    e.preventDefault();
    e.stopPropagation();
  };

  readonly longPress = output<void>();
  readonly doubleTap = output<void>();

  ngOnInit(): void {
    this.el.addEventListener('click', this.swallow, true);
  }

  ngOnDestroy(): void {
    this.clear();
    this.el.removeEventListener('click', this.swallow, true);
  }

  protected down(e: PointerEvent): void {
    if (e.button > 0) return;
    this.fired = false;
    this.start = { x: e.clientX, y: e.clientY };
    this.clear();
    this.timer = setTimeout(() => this.fire(), HOLD_MS);
  }

  protected move(e: PointerEvent): void {
    if (this.start && Math.hypot(e.clientX - this.start.x, e.clientY - this.start.y) > SLOP) this.cancel();
  }

  protected up(e: PointerEvent): void {
    const tapped = this.start && !this.fired;
    this.cancel();
    if (!tapped || (e.target as Element | null)?.closest(CONTROLS)) {
      this.lastTap = null;
      return;
    }
    const last = this.lastTap;
    if (last && e.timeStamp - last.t < DOUBLE_MS && Math.hypot(e.clientX - last.x, e.clientY - last.y) < SLOP * 3) {
      this.lastTap = null;
      this.doubleTap.emit();
    } else {
      this.lastTap = { t: e.timeStamp, x: e.clientX, y: e.clientY };
    }
  }

  protected cancel(): void {
    this.start = null;
    this.clear();
  }

  protected contextMenu(e: Event): void {
    e.preventDefault();
    if (!this.fired) this.fire();
  }

  private fire(): void {
    this.clear();
    this.start = null;
    this.fired = true;
    this.longPress.emit();
  }

  private clear(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
