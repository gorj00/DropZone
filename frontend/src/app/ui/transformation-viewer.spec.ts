import { TestBed } from '@angular/core/testing';
import { TransformationView } from '../core/api/models';
import { TransformationViewer } from './transformation-viewer';

function render(t: TransformationView): HTMLElement {
  const f = TestBed.createComponent(TransformationViewer);
  f.componentRef.setInput('t', t);
  f.detectChanges();
  return f.nativeElement as HTMLElement;
}

const base: TransformationView = {
  layout: 'SPLIT',
  beforeUrl: 'https://img.test/before.jpg',
  afterUrl: 'https://img.test/after.jpg',
  beforeCaption: 'Day 1',
  afterCaption: null
};

describe('TransformationViewer', () => {
  it('shows both photos side by side in split layout', () => {
    const el = render(base);
    const imgs = [...el.querySelectorAll('img')].map(i => i.getAttribute('src'));
    expect(imgs).toEqual([base.beforeUrl, base.afterUrl]);
    expect(el.textContent).toContain('BEFORE');
    expect(el.textContent).toContain('AFTER');
    expect(el.textContent).toContain('Day 1');
    expect(el.querySelectorAll('button').length).toBe(0);
  });

  it('shows two slides with dots in slideshow layout', () => {
    const el = render({ ...base, layout: 'SLIDESHOW', afterCaption: 'Day 90' });
    expect(el.querySelectorAll('img').length).toBe(2);
    expect(el.querySelectorAll('button').length).toBe(2);
    expect(el.textContent).toContain('Day 90');
  });
});
