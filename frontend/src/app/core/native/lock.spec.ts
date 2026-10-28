import { TestBed } from '@angular/core/testing';
import { Today, User } from '../api/models';
import { DisclosureService } from './disclosure';
import { APP_LOCK, LockService } from './lock';

function setup() {
  const plugin = {
    getStatus: vi.fn().mockResolvedValue({ serviceEnabled: false, overlayPermission: true, usagePermission: true, advancedProtection: false }),
    openAccessibilitySettings: vi.fn().mockResolvedValue(undefined),
    openOverlaySettings: vi.fn().mockResolvedValue(undefined),
    setConfig: vi.fn().mockResolvedValue(undefined)
  };
  TestBed.configureTestingModule({ providers: [{ provide: APP_LOCK, useValue: plugin }] });
  return { lock: TestBed.inject(LockService), disclosure: TestBed.inject(DisclosureService), plugin };
}

const user = (patch: Partial<User> = {}) => ({ onboarded: true, lockedApps: ['com.instagram.android'], ...patch }) as User;
const today = (patch: Partial<Today> = {}) => ({ totalCount: 3, doneCount: 1, unlocked: false, unlockedUntil: null, ...patch }) as Today;

describe('LockService accessibility disclosure', () => {
  it('does not open Accessibility settings when the user picks Not now', async () => {
    const { lock, disclosure, plugin } = setup();
    const opened = lock.openSettings();
    await vi.waitFor(() => expect(disclosure.current()?.kind).toBe('ACCESSIBILITY'));
    disclosure.answer(false);

    expect(await opened).toBe(false);
    expect(plugin.openAccessibilitySettings).not.toHaveBeenCalled();
  });

  it('opens Accessibility settings only after Agree', async () => {
    const { lock, disclosure, plugin } = setup();
    const opened = lock.openSettings();
    await vi.waitFor(() => expect(disclosure.current()).not.toBeNull());
    expect(plugin.openAccessibilitySettings).not.toHaveBeenCalled();
    disclosure.answer(true);

    expect(await opened).toBe(true);
    expect(plugin.openAccessibilitySettings).toHaveBeenCalledTimes(1);
    expect(disclosure.current()).toBeNull();
  });
});

describe('LockService.sync', () => {
  it('locks the chosen apps with the number of quests left', async () => {
    const { lock, plugin } = setup();
    await lock.sync(user(), today());
    expect(plugin.setConfig).toHaveBeenCalledWith(expect.objectContaining({ enabled: true, packages: ['com.instagram.android'], unlockedUntil: null, message: '2 quests left. Clear them to unlock.' }));
  });

  it('passes the unlock time once the day is cleared', async () => {
    const { lock, plugin } = setup();
    await lock.sync(user({ unlockMode: 'MINUTES' }), today({ doneCount: 3, unlocked: true, unlockedUntil: '2026-10-27T21:30:00Z' }));
    expect(plugin.setConfig).toHaveBeenCalledWith(expect.objectContaining({ enabled: true, unlockedUntil: Date.parse('2026-10-27T21:30:00Z') }));
  });

  it('passes the earned minutes and the day for a partly cleared day', async () => {
    const { lock, plugin } = setup();
    await lock.sync(user({ unlockMode: 'MINUTES' }), today({ date: '2026-10-28', unlocked: true, unlockedUntil: null, minutesEarned: 30 }));
    expect(plugin.setConfig).toHaveBeenCalledWith(expect.objectContaining({ unlockedUntil: null, minutesBudget: 30, budgetDay: '2026-10-28' }));
  });

  it('gives no minutes while the server says the day is locked', async () => {
    const { lock, plugin } = setup();
    await lock.sync(user({ unlockMode: 'MINUTES' }), today({ date: '2026-10-27', unlocked: false, minutesEarned: 30 }));
    expect(plugin.setConfig).toHaveBeenCalledWith(expect.objectContaining({ minutesBudget: 0, budgetDay: '2026-10-27' }));
  });

  it('clears the minutes budget on sign-out', async () => {
    const { lock, plugin } = setup();
    Object.assign(lock, { native: true });
    await lock.disable();
    expect(plugin.setConfig).toHaveBeenCalledWith(expect.objectContaining({ enabled: false, minutesBudget: 0, budgetDay: null }));
  });

  it('stays off without locked apps or before onboarding', async () => {
    const { lock, plugin } = setup();
    await lock.sync(user({ lockedApps: [] }), today());
    await lock.sync(user({ onboarded: false }), today());
    expect(plugin.setConfig.mock.calls.every(([c]) => c.enabled === false)).toBe(true);
  });

  it('does nothing without a signed-in user', async () => {
    const { lock, plugin } = setup();
    await lock.sync(null, today());
    expect(plugin.setConfig).not.toHaveBeenCalled();
  });
});
