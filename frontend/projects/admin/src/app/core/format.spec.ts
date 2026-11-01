import { ago, initials, num, plan, since } from './format';
import { barHeights } from '../pages/dashboard';
import { rangeFrom } from '../pages/user';

describe('format helpers', () => {
  const now = Date.parse('2026-11-01T12:00:00Z');

  it('describes how long ago something happened', () => {
    expect(ago(null)).toBe('—');
    expect(ago('2026-11-01T11:59:30Z', now)).toBe('just now');
    expect(ago('2026-11-01T11:30:00Z', now)).toBe('30 min ago');
    expect(ago('2026-11-01T09:00:00Z', now)).toBe('3 h ago');
    expect(ago('2026-10-29T12:00:00Z', now)).toBe('3 d ago');
  });

  it('formats uptime', () => {
    expect(since('2026-11-01T11:45:00Z', now)).toBe('15 min');
    expect(since('2026-11-01T09:30:00Z', now)).toBe('2 h 30 min');
    expect(since('2026-10-30T10:00:00Z', now)).toBe('2 d 2 h');
  });

  it('labels the plan and initials', () => {
    expect(plan({ subscribed: true, trial: false })).toBe('PRO');
    expect(plan({ subscribed: false, trial: true })).toBe('TRIAL');
    expect(plan({ subscribed: false, trial: false })).toBe('FREE');
    expect(initials('Jan Gorol')).toBe('JG');
    expect(initials('')).toBe('?');
    expect(num(89.456)).toBe('89.5');
    expect(num(null)).toBe('—');
  });

  it('scales sign-up bars to the busiest day', () => {
    const bars = barHeights([{ day: '2026-10-30', count: 1 }, { day: '2026-10-31', count: 4 }, { day: '2026-11-01', count: 0 }]);
    expect(bars.map(b => b.pct)).toEqual([25, 100, 0]);
    expect(barHeights([]).length).toBe(0);
  });

  it('computes the start of a day range', () => {
    expect(rangeFrom(30, new Date('2026-11-01T12:00:00Z'))).toBe('2026-10-03');
    expect(rangeFrom(1, new Date('2026-11-01T12:00:00Z'))).toBe('2026-11-01');
  });
});
