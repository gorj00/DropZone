import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Press } from './press';

@Component({
  imports: [Press],
  template: `<div appPress (longPress)="longs = longs + 1" (doubleTap)="doubles = doubles + 1"><span class="body">Post</span><button (click)="clicks = clicks + 1">Hype</button></div>`
})
class Host {
  longs = 0;
  doubles = 0;
  clicks = 0;
}

function pointer(target: Element, type: string, x = 10, y = 10): void {
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }));
}

function render() {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { host: fixture.componentInstance, body: el.querySelector('.body')!, button: el.querySelector('button')! };
}

describe('Press', () => {
  afterEach(() => vi.useRealTimers());

  it('fires a long press after holding and swallows the click that follows', () => {
    vi.useFakeTimers();
    const { host, button } = render();
    pointer(button, 'pointerdown');
    vi.advanceTimersByTime(500);
    pointer(button, 'pointerup');
    button.click();

    expect(host.longs).toBe(1);
    expect(host.clicks).toBe(0);
    button.click();
    expect(host.clicks).toBe(1);
  });

  it('cancels the long press when the finger moves, so scrolling does not open the menu', () => {
    vi.useFakeTimers();
    const { host, body } = render();
    pointer(body, 'pointerdown', 10, 10);
    pointer(body, 'pointermove', 10, 40);
    vi.advanceTimersByTime(600);

    expect(host.longs).toBe(0);
  });

  it('fires a long press from the system context menu', () => {
    const { host, body } = render();
    body.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

    expect(host.longs).toBe(1);
  });

  it('fires a double tap on the post but not on its buttons', () => {
    const { host, body, button } = render();
    for (let i = 0; i < 2; i++) {
      pointer(body, 'pointerdown');
      pointer(body, 'pointerup');
    }
    expect(host.doubles).toBe(1);

    for (let i = 0; i < 2; i++) {
      pointer(button, 'pointerdown');
      pointer(button, 'pointerup');
    }
    expect(host.doubles).toBe(1);
  });
});
