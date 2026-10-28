import { Directive, ElementRef, OnDestroy, inject, output } from '@angular/core';

const HANDLE_ZONE = 56;

@Directive({
  selector: '[sheetDrag]',
  host: {
    '(touchstart)': 'start($event)',
    '(touchmove)': 'move($event)',
    '(touchend)': 'end()',
    '(touchcancel)': 'end()',
    '(click)': 'tap($event)'
  }
})
export class SheetDrag implements OnDestroy {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private startY: number | null = null;
  private dy = 0;
  private lastY = 0;
  private lastT = 0;
  private velocity = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  readonly sheetDismiss = output<void>();

  protected start(e: TouchEvent): void {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    const top = this.el.getBoundingClientRect().top;
    const onHandle = (e.target as Element | null)?.closest('.grabber');
    if (!onHandle && (touch.clientY - top > HANDLE_ZONE || this.el.scrollTop > 0)) return;
    this.startY = touch.clientY;
    this.lastY = touch.clientY;
    this.lastT = e.timeStamp;
    this.dy = 0;
    this.velocity = 0;
    this.el.style.transition = 'none';
  }

  protected move(e: TouchEvent): void {
    if (this.startY === null) return;
    const y = e.touches[0].clientY;
    this.dy = Math.max(0, y - this.startY);
    const dt = e.timeStamp - this.lastT;
    if (dt > 0) this.velocity = (y - this.lastY) / dt;
    this.lastY = y;
    this.lastT = e.timeStamp;
    if (this.dy > 0) {
      e.preventDefault();
      this.el.style.transform = `translateY(${this.dy}px)`;
    }
  }

  protected end(): void {
    if (this.startY === null) return;
    this.startY = null;
    const far = this.dy > Math.max(90, this.el.offsetHeight * 0.22);
    const flick = this.velocity > 0.6 && this.dy > 24;
    if (far || flick) this.close();
    else {
      this.el.style.transition = 'transform .2s ease';
      this.el.style.transform = '';
    }
  }

  protected tap(e: Event): void {
    if ((e.target as Element | null)?.closest('.grabber')) this.close();
  }

  ngOnDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
  }

  private close(): void {
    this.el.style.transition = 'transform .18s ease-in';
    this.el.style.transform = 'translateY(105%)';
    this.timer = setTimeout(() => this.sheetDismiss.emit(), 170);
  }
}
