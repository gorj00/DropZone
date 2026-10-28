import { TestBed } from '@angular/core/testing';
import { Preferences } from '@capacitor/preferences';
import { DisclosureService } from './disclosure';
import { HEALTH, HEALTH_RATIONALE_KEY, HealthService, sleepMinutesOf } from './health';

const at = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 26, h, m)).toISOString();
const from = Date.UTC(2026, 9, 25, 14);
const to = Date.UTC(2026, 9, 26, 14);

describe('sleepMinutesOf', () => {
  it('counts two overlapping 7 h sessions once', () => {
    const watch = { startDate: at(0), endDate: at(7) };
    const phone = { startDate: at(0, 30), endDate: at(7, 30) };
    expect(sleepMinutesOf([watch], from, to)).toBe(420);
    expect(sleepMinutesOf([watch, { startDate: at(0), endDate: at(7) }], from, to)).toBe(420);
    expect(sleepMinutesOf([watch, phone], from, to)).toBe(450);
  });

  it('subtracts awake stages', () => {
    const night = {
      startDate: at(0), endDate: at(8),
      stages: [
        { startDate: at(0), endDate: at(3), stage: 'light' as const, durationMinutes: 180 },
        { startDate: at(3), endDate: at(3, 30), stage: 'awake' as const, durationMinutes: 30 },
        { startDate: at(3, 30), endDate: at(8), stage: 'deep' as const, durationMinutes: 270 }
      ]
    };
    expect(sleepMinutesOf([night], from, to)).toBe(450);
  });

  it('subtracts awake samples and ignores time outside the window', () => {
    const night = { startDate: at(0), endDate: at(8) };
    const awake = { startDate: at(2), endDate: at(2, 20), sleepState: 'awake' as const };
    expect(sleepMinutesOf([night, awake], from, to)).toBe(460);
    expect(sleepMinutesOf([{ startDate: at(12), endDate: at(16) }], from, to)).toBe(120);
  });

  it('adds separate naps', () => {
    expect(sleepMinutesOf([{ startDate: at(0), endDate: at(6) }, { startDate: at(9), endDate: at(10) }], from, to)).toBe(420);
  });
});

describe('HealthService rationale', () => {
  function setup(available = true) {
    const plugin = {
      isAvailable: vi.fn().mockResolvedValue({ available }),
      requestAuthorization: vi.fn().mockResolvedValue({ readAuthorized: ['sleep'], readDenied: ['steps'], writeAuthorized: [], writeDenied: [] }),
      openHealthConnectSettings: vi.fn(),
      queryAggregated: vi.fn(),
      readSamples: vi.fn()
    };
    TestBed.configureTestingModule({ providers: [{ provide: HEALTH, useValue: { native: true, plugin } }] });
    return { health: TestBed.inject(HealthService), disclosure: TestBed.inject(DisclosureService), plugin };
  }

  beforeEach(async () => {
    localStorage.clear();
    await Preferences.remove({ key: HEALTH_RATIONALE_KEY });
  });

  it('shows the rationale before the first permission request and stops on Not now', async () => {
    const { health, disclosure, plugin } = setup();
    const result = health.authorize('sleep');
    await vi.waitFor(() => expect(disclosure.current()?.kind).toBe('HEALTH'));
    expect(plugin.requestAuthorization).not.toHaveBeenCalled();
    disclosure.answer(false);

    expect(await result).toBe('not-now');
    expect(plugin.requestAuthorization).not.toHaveBeenCalled();
  });

  it('requests access after Continue and does not ask again', async () => {
    const { health, disclosure, plugin } = setup();
    const first = health.authorize('sleep');
    await vi.waitFor(() => expect(disclosure.current()).not.toBeNull());
    disclosure.answer(true);

    expect(await first).toBe('granted');
    expect(plugin.requestAuthorization).toHaveBeenCalledTimes(1);
    expect(await health.authorize('steps')).toBe('denied');
    expect(disclosure.current()).toBeNull();
    expect(plugin.requestAuthorization).toHaveBeenCalledTimes(2);
  });

  it('reports a missing Health Connect without asking', async () => {
    const { health, disclosure, plugin } = setup(false);
    expect(await health.authorize('steps')).toBe('unavailable');
    expect(disclosure.current()).toBeNull();
    expect(plugin.requestAuthorization).not.toHaveBeenCalled();
  });
});
