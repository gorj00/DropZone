import { TestBed } from '@angular/core/testing';
import { StatsDay } from '../core/api/models';
import { Heatmap } from './bits';

function month(start: string, count: number, today: number): StatsDay[] {
  const d0 = new Date(`${start}T00:00:00`);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(d0);
    d.setDate(d0.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { date: iso, questLevel: i % 5, slipUps: i % 7, future: i > today };
  });
}

function cells(days: StatsDay[], kind: 'quests' | 'slips'): string[] {
  const f = TestBed.createComponent(Heatmap);
  f.componentRef.setInput('days', days);
  f.componentRef.setInput('kind', kind);
  f.detectChanges();
  return [...f.nativeElement.querySelectorAll('.hm i')].map((i: Element) => i.className);
}

describe('Heatmap', () => {
  it('offsets the first day to a Monday-first grid', () => {
    const out = cells(month('2026-10-01', 31, 24), 'quests');
    expect(out.slice(0, 3)).toEqual(['x', 'x', 'x']);
    expect(out.length % 7).toBe(0);
  });

  it('maps quest levels and future days', () => {
    const out = cells(month('2026-10-01', 31, 24), 'quests');
    expect(out[3]).toBe('');
    expect(out[4]).toBe('l1');
    expect(out[3 + 25]).toBe('f');
  });

  it('caps slip-up levels at 4', () => {
    const out = cells(month('2026-10-01', 31, 30), 'slips');
    expect(out[3 + 6]).toBe('l4');
  });

  it('renders nothing for an empty month', () => {
    expect(cells([], 'quests')).toEqual([]);
  });

  it('shows the calendar date in each day cell and leaves offset cells blank', () => {
    const f = TestBed.createComponent(Heatmap);
    f.componentRef.setInput('days', month('2026-10-01', 31, 24));
    f.detectChanges();
    const texts = [...f.nativeElement.querySelectorAll('.hm i')].map((i: Element) => i.textContent?.trim());
    expect(texts.slice(0, 3)).toEqual(['', '', '']);
    expect(texts[3]).toBe('1');
    expect(texts[3 + 30]).toBe('31');
    expect(texts[texts.length - 1]).toBe('');
  });

  it('emits the date of a past day and ignores future days', () => {
    const f = TestBed.createComponent(Heatmap);
    f.componentRef.setInput('days', month('2026-10-01', 31, 24));
    f.detectChanges();
    const picked: string[] = [];
    f.componentInstance.dayClick.subscribe(d => picked.push(d));
    const items = f.nativeElement.querySelectorAll('.hm i') as NodeListOf<HTMLElement>;
    items[3 + 4].click();
    items[3 + 28].click();
    items[0].click();
    expect(picked).toEqual(['2026-10-05']);
  });
});
