import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ApiService } from './api/api.service';
import { Today, TodayQuest, UserQuest } from './api/models';
import { CameraService } from './camera.service';
import { HEALTH, HealthService } from './native/health';
import { LockService } from './native/lock';
import { ProofService } from './proof.service';
import { PromptService } from './prompt.service';
import { localDate } from './stores';
import { ToastService } from './toast.service';

const uq = (patch: Partial<UserQuest> = {}): UserQuest => ({
  id: 's1', code: 'STEPS', name: 'Steps', icon: 'steps', group: 'BURN_FUEL', proof: 'AUTO', autoSource: 'STEPS', target: 8000,
  custom: false, days: [1, 2, 3, 4, 5, 6, 7], squadCheck: false, perDay: 1, multiSlot: false, ...patch
});

const tq = (quest: UserQuest): TodayQuest => ({
  quest, status: 'TODO', progress: null, target: 8000, completionId: null, proofId: null, verifiedCount: 0, requiredVerifications: 0,
  summary: null, value: null, slot: 1, slots: 1
});

function setup(opts: { native?: boolean; available?: boolean; quests?: UserQuest[] } = {}) {
  const day: Today = { date: localDate(), quests: [], doneCount: 0, totalCount: 0, unlocked: true, unlockedUntil: null, minutesEarned: 0, streak: 0, friendsCleared: null };
  const api = {
    quests: vi.fn().mockResolvedValue(opts.quests ?? [uq(), uq({ id: 'm1', code: 'HEALTHY_MEAL', name: 'Healthy meal', proof: 'PHOTO', autoSource: null })]),
    deleteQuest: vi.fn().mockResolvedValue(undefined),
    completeQuest: vi.fn(),
    today: vi.fn().mockResolvedValue(day),
    me: vi.fn().mockResolvedValue({ user: null, token: null })
  };
  const plugin = {
    isAvailable: vi.fn().mockResolvedValue({ available: opts.available ?? false }),
    requestAuthorization: vi.fn().mockResolvedValue({ readAuthorized: ['steps'] }),
    openHealthConnectSettings: vi.fn(),
    queryAggregated: vi.fn().mockResolvedValue({ samples: [{ value: 9000 }] }),
    readSamples: vi.fn()
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: ApiService, useValue: api },
      { provide: CameraService, useValue: { open: vi.fn() } },
      { provide: HEALTH, useValue: { native: opts.native ?? true, plugin } },
      { provide: LockService, useValue: { native: false, sync: vi.fn().mockResolvedValue(undefined), disable: vi.fn().mockResolvedValue(undefined) } }
    ]
  });
  const open = vi.spyOn(window, 'open').mockReturnValue(null);
  return { api, plugin, open, proofs: TestBed.inject(ProofService), prompt: TestBed.inject(PromptService), toast: TestBed.inject(ToastService) };
}

async function sheet(prompt: PromptService) {
  await vi.waitFor(() => expect(prompt.choice()?.title).toBe('Health Connect is missing'));
  return prompt.choice()!;
}

describe('steps quest without Health Connect', () => {
  afterEach(() => vi.restoreAllMocks());

  it('offers to install Health Connect from the Play Store app', async () => {
    const { proofs, prompt, open, api } = setup();
    const done = proofs.complete(tq(uq()));
    const s = await sheet(prompt);
    expect(s.options.map(o => o.label)).toEqual(['Install Health Connect', 'Stop using steps']);
    prompt.pick('install');

    expect(await done).toBeNull();
    expect(open).toHaveBeenCalledWith('market://details?id=com.google.android.apps.healthdata', '_blank');
    expect(api.completeQuest).not.toHaveBeenCalled();
  });

  it('removes the quest after a confirmation when the user stops using steps', async () => {
    const { proofs, prompt, api, toast } = setup();
    const done = proofs.complete(tq(uq()));
    await sheet(prompt);
    prompt.pick('stop');
    await vi.waitFor(() => expect(prompt.confirmation()?.title).toBe('Stop using Steps?'));
    expect(prompt.confirmation()?.message).toContain('removed from your daily quests');
    expect(api.deleteQuest).not.toHaveBeenCalled();
    prompt.answer(true);

    expect(await done).toBeNull();
    expect(api.deleteQuest).toHaveBeenCalledWith('s1');
    expect(api.today).toHaveBeenCalled();
    expect(toast.message()?.text).toBe('Steps removed from your daily quests.');
  });

  it('keeps the quest when the confirmation is cancelled', async () => {
    const { proofs, prompt, api } = setup();
    const done = proofs.complete(tq(uq()));
    await sheet(prompt);
    prompt.pick('stop');
    await vi.waitFor(() => expect(prompt.confirmation()).not.toBeNull());
    prompt.answer(false);
    await done;
    expect(api.deleteQuest).not.toHaveBeenCalled();
  });

  it('does not remove the only daily quest', async () => {
    const { proofs, prompt, api, toast } = setup({ quests: [uq()] });
    const done = proofs.complete(tq(uq()));
    await sheet(prompt);
    prompt.pick('stop');
    await vi.waitFor(() => expect(prompt.confirmation()).not.toBeNull());
    prompt.answer(true);
    await done;
    expect(api.deleteQuest).not.toHaveBeenCalled();
    expect(toast.message()?.text).toContain('Keep at least one daily quest');
  });

  it('syncs steps without the sheet when Health Connect is there', async () => {
    const { proofs, prompt, api } = setup({ available: true });
    localStorage.setItem('CapacitorStorage.dz-health-rationale', '1');
    api.completeQuest.mockResolvedValue({ ...tq(uq()), status: 'DONE' });
    await proofs.complete(tq(uq()));
    expect(prompt.choice()).toBeNull();
    expect(api.completeQuest).toHaveBeenCalledWith('s1', expect.objectContaining({ value: 9000 }));
    localStorage.clear();
  });

  it('links the web Play page outside the Android app', () => {
    const { open } = setup({ native: false });
    TestBed.inject(HealthService).openInstall();
    expect(open).toHaveBeenCalledWith('https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata', '_blank');
  });
});
