import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ApiService } from './api/api.service';
import { Today } from './api/models';
import { LockService } from './native/lock';
import { TodayStore, fmt, localDate } from './stores';

describe('localDate', () => {
  it('formats a local date as yyyy-mm-dd', () => {
    expect(localDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});

describe('fmt', () => {
  it('formats with one decimal by default', () => {
    expect(fmt(82)).toBe('82.0');
    expect(fmt(82.44)).toBe('82.4');
  });

  it('supports zero digits', () => {
    expect(fmt(82.6, 0)).toBe('83');
  });

  it('shows a dash for missing values', () => {
    expect(fmt(null)).toBe('–');
    expect(fmt(undefined)).toBe('–');
    expect(fmt(Number.NaN)).toBe('–');
  });
});

describe('TodayStore.load', () => {
  it('reads the lock status after syncing the day to the native lock', async () => {
    const order: string[] = [];
    const lock = {
      native: true,
      sync: vi.fn(async () => { order.push('sync'); }),
      refreshStatus: vi.fn(async () => { order.push('status'); }),
      disable: vi.fn().mockResolvedValue(undefined)
    };
    const t = { date: '2026-10-28', quests: [], doneCount: 1, totalCount: 2, unlocked: true, unlockedUntil: null, minutesEarned: 30 } as unknown as Today;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ApiService, useValue: { today: vi.fn().mockResolvedValue(t) } },
        { provide: LockService, useValue: lock }
      ]
    });
    await TestBed.inject(TodayStore).load();
    await vi.waitFor(() => expect(order).toEqual(['sync', 'status']));
  });
});
