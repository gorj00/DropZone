import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { Leaderboard, LeaderboardEntry, Period, User } from '../../core/api/models';
import { LockService } from '../../core/native/lock';
import { SessionStore } from '../../core/session.store';
import { LeaderboardSwiper, formatDelta, formatPercent } from './leaderboard';

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const person = (id: string, name: string) => ({ id, displayName: name, handle: id, avatarUrl: null, path: 'LOSE' as const });
const entry = (rank: number, id: string, delta: number): LeaderboardEntry => ({ rank, user: person(id, `Friend ${id}`), delta, unit: 'kg' });
const board = (period: Period, entries: LeaderboardEntry[], me: LeaderboardEntry | null = null): Leaderboard => ({
  period, path: 'LOSE', metric: 'WEIGHT', unit: 'kg', endsAt: new Date(Date.now() + 3 * 86400000).toISOString(), entries, me
});

async function render(leaderboard: (p: Period) => Promise<Leaderboard>, patch: Partial<User> = {}) {
  const api = { leaderboard: vi.fn(leaderboard) };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: ApiService, useValue: api },
      { provide: LockService, useValue: { native: false, disable: vi.fn().mockResolvedValue(undefined) } }
    ]
  });
  TestBed.inject(SessionStore).setUser({ id: 'me', path: 'LOSE', pro: true, onboarded: true, theme: 'NEON', timezone: tz, lockedApps: [], weightUnit: 'KG', lengthUnit: 'CM', ...patch } as unknown as User);
  const fixture = TestBed.createComponent(LeaderboardSwiper);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const card = (i: number) => (el.querySelectorAll('.tcard')[i] as HTMLElement).textContent?.replace(/\s+/g, ' ') ?? '';
  return { fixture, el, api, card };
}

describe('formatDelta', () => {
  it('prints the direction the value really moved', () => {
    expect(formatDelta(2, 'LOSE', '2.0', 'kg')).toBe('−2.0 KG');
    expect(formatDelta(-2, 'LOSE', '2.0', 'kg')).toBe('+2.0 KG');
    expect(formatDelta(5, 'GAIN', '5.0', 'kg')).toBe('+5.0 KG');
    expect(formatDelta(-1, 'GAIN', '1.0', 'cm')).toBe('−1.0 CM');
    expect(formatDelta(0, 'LOSE', '0.0', 'kg')).toBe('0.0 KG');
  });
});

describe('formatPercent', () => {
  it('prints one decimal with the sign', () => {
    expect(formatPercent(4.24)).toBe('+4.2%');
    expect(formatPercent(-1)).toBe('−1.0%');
    expect(formatPercent(0)).toBe('0.0%');
  });
});

describe('LeaderboardSwiper', () => {
  it('ranks Gain boards by percent and keeps the kg as the second number', async () => {
    const gain = (period: Period): Leaderboard => ({
      ...board(period, [
        { ...entry(1, 'f1', 2.5), percent: 4.2 },
        { ...entry(2, 'f2', 6), percent: 3.1 },
        { ...entry(3, 'me', 1), percent: 1.4 },
        { ...entry(4, 'f3', -0.5), percent: -0.8 }
      ]),
      path: 'GAIN'
    });
    const { card } = await render(p => Promise.resolve(gain(p)), { path: 'GAIN' });
    expect(card(0)).toContain('+4.2%');
    expect(card(0)).toContain('+2.5 KG');
    expect(card(0)).toContain('+3.1%');
    expect(card(0)).toContain('−0.8%');
    expect(card(0)).toContain('−0.5 KG');
  });

  it('keeps kg as the only number on Lose boards', async () => {
    const { card } = await render(p => Promise.resolve(board(p, [{ ...entry(1, 'f1', 2), percent: 2.6 }, entry(2, 'me', 1)])));
    expect(card(0)).toContain('−2.0 KG');
    expect(card(0)).not.toContain('%');
  });

  it('tells a hidden user that friends do not see their place', async () => {
    const { card } = await render(p => Promise.resolve(board(p, [entry(1, 'f1', 2), entry(2, 'f2', 1.5)], entry(2, 'me', 1.8))), { hiddenFromLeaderboards: true });
    expect(card(0)).toContain('You · #2 (hidden from friends)');
  });

  it('shows my place under the top 10 and labels the board top 10', async () => {
    const top = Array.from({ length: 10 }, (_, i) => entry(i + 1, `f${i}`, 10 - i));
    const { card } = await render(p => Promise.resolve(board(p, top, entry(11, 'me', -0.5))));

    expect(card(0)).toContain('top 10');
    expect(card(0)).not.toContain('top 3');
    expect(card(0)).toContain('You · #11');
    expect(card(0)).toContain('+0.5 KG');
    expect(card(0)).toContain('−10.0 KG');
  });

  it('shows the "Add friends" state when only I am on the board', async () => {
    const { card } = await render(p => Promise.resolve(board(p, p === 'WEEK' ? [entry(1, 'me', 1.2)] : [])));

    expect(card(0)).toContain('No ranking yet');
    expect(card(0)).toContain('Add friends');
    expect(card(1)).toContain('No ranking yet');
  });

  it('shows a retry instead of an empty board when loading fails', async () => {
    let fail = true;
    const { fixture, el, api, card } = await render(p => (fail ? Promise.reject(new Error('offline')) : Promise.resolve(board(p, [entry(1, 'f1', 2), entry(2, 'me', 1)]))));

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(card(0)).toContain("Couldn't load the ranking");
    });
    expect(card(0)).not.toContain('No ranking yet');
    fail = false;
    (el.querySelector('.tcard button') as HTMLButtonElement).click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(card(0)).toContain('Friend');
    });

    expect(api.leaderboard).toHaveBeenCalledTimes(4);
    expect(card(1)).toContain("Couldn't load the ranking");
  });
});
