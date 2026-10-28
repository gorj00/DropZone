import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, provideRouter } from '@angular/router';
import { ApiService } from './api/api.service';
import { Checkpoint, Goal, Today, TodayQuest, UserQuest } from './api/models';
import { CameraResult, CameraService } from './camera.service';
import { HealthService } from './native/health';
import { LockService } from './native/lock';
import { ProofService } from './proof.service';
import { PromptService } from './prompt.service';
import { GoalStore, localDate } from './stores';

const shot = (patch: Partial<CameraResult> = {}): CameraResult => ({ dataUrl: 'data:image/jpeg;base64,AAAA', labels: [], text: '67.9', number: null, reps: null, ...patch });

const uq = (patch: Partial<UserQuest> = {}): UserQuest => ({
  id: 'q1', code: 'HEALTHY_MEAL', name: 'Healthy meal', icon: 'meal', group: 'BURN_FUEL', proof: 'PHOTO', autoSource: null, target: null,
  custom: false, days: [1, 2, 3, 4, 5, 6, 7], squadCheck: false, perDay: 1, multiSlot: true, ...patch
});

const tq = (quest: UserQuest, patch: Partial<TodayQuest> = {}): TodayQuest => ({
  quest, status: 'TODO', progress: null, target: null, completionId: null, proofId: null, verifiedCount: 0, requiredVerifications: 0,
  summary: null, value: null, slot: 1, slots: 1, ...patch
});

const cp = (patch: Partial<Checkpoint> = {}): Checkpoint => ({
  id: 'cp1', index: 1, targetValue: 68, deltaToEarn: 2, rewardTitle: null, rewardImageUrl: null, isPublic: false, verification: 'AI',
  deadline: null, status: 'ACTIVE', clearedAt: null, proofId: null, verifiedCount: 0, requiredVerifications: 0, ...patch
});

const goal: Goal = {
  id: 'g1', path: 'LOSE', metric: 'WEIGHT', metricLabel: null, unit: 'kg', startValue: 70, goalValue: 64, currentValue: 70, progressValue: 0,
  totalValue: 6, checkpoints: [cp(), cp({ id: 'cp2', index: 2, targetValue: 64, status: 'LOCKED' })]
};

function setup(camera: CameraResult) {
  const today = (quests: TodayQuest[]): Today => ({ date: localDate(), quests, doneCount: 0, totalCount: quests.length, unlocked: false, unlockedUntil: null, minutesEarned: 0, streak: 0, friendsCleared: null });
  const api = {
    upload: vi.fn(),
    weighIn: vi.fn().mockResolvedValue({ id: 'w1', date: localDate(), value: 0 }),
    completeQuest: vi.fn(async (id: string) => tq(uq({ id }), { status: 'DONE' })),
    submitCheckpointProof: vi.fn().mockResolvedValue(cp({ status: 'CLEARED' })),
    today: vi.fn().mockResolvedValue(today([])),
    goal: vi.fn().mockResolvedValue(goal),
    me: vi.fn()
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: '**', children: [] }]),
      { provide: ApiService, useValue: api },
      { provide: CameraService, useValue: { open: vi.fn().mockResolvedValue(camera) } },
      { provide: HealthService, useValue: { native: false, available: vi.fn().mockResolvedValue(false) } },
      { provide: LockService, useValue: { native: false, sync: vi.fn().mockResolvedValue(undefined), disable: vi.fn().mockResolvedValue(undefined) } }
    ]
  });
  TestBed.inject(GoalStore).goal.set(goal);
  return {
    api,
    camera: TestBed.inject(CameraService) as unknown as { open: ReturnType<typeof vi.fn> },
    proofs: TestBed.inject(ProofService),
    prompt: TestBed.inject(PromptService),
    router: TestBed.inject(Router)
  };
}

async function confirm(prompt: PromptService, title: string, yes: boolean): Promise<void> {
  await vi.waitFor(() => expect(prompt.confirmation()?.title).toBe(title));
  prompt.answer(yes);
}

describe('ProofService offline proofs', () => {
  it('keeps the photo when the upload fails offline and sends it on retry without the camera', async () => {
    const { api, camera, proofs, prompt } = setup(shot());
    api.upload.mockRejectedValueOnce(new HttpErrorResponse({ status: 0 })).mockResolvedValue({ url: 'https://cdn.test/u1.jpg' });
    const meal = tq(uq());

    const first = proofs.complete(meal);
    await confirm(prompt, "You're offline", false);
    expect(await first).toBeNull();
    expect(proofs.isPending(localDate(), meal)).toBe(true);

    const retry = await proofs.complete(meal);
    expect(retry?.status).toBe('DONE');
    expect(camera.open).toHaveBeenCalledTimes(1);
    expect(api.completeQuest).toHaveBeenCalledWith('q1', expect.objectContaining({ photoUrl: 'https://cdn.test/u1.jpg' }));
    expect(proofs.isPending(localDate(), meal)).toBe(false);
  });

  it('drops the proof on other errors', async () => {
    const { api, proofs } = setup(shot());
    api.upload.mockRejectedValue(new HttpErrorResponse({ status: 400, error: { code: 'VALIDATION', message: 'Bad photo' } }));
    const meal = tq(uq());

    expect(await proofs.complete(meal)).toBeNull();
    expect(proofs.isPending(localDate(), meal)).toBe(false);
  });
});

describe('ProofService rep quests', () => {
  it('opens the camera with the squat goal and sends the counted exercise', async () => {
    const { api, camera, proofs } = setup(shot({ reps: 10, exercise: 'PUSHUP' }));
    api.upload.mockResolvedValue({ url: 'https://cdn.test/u1.jpg' });
    const reps = tq(uq({ code: 'CAMERA_REPS', name: 'Camera reps', proof: 'REPS', target: 20, multiSlot: false }));

    await proofs.complete(reps);
    expect(camera.open).toHaveBeenCalledWith(expect.objectContaining({ mode: 'REPS', targetReps: 20 }));
    expect(api.completeQuest).toHaveBeenCalledWith('q1', expect.objectContaining({ reps: 10, exercise: 'PUSHUP' }));
  });
});

describe('ProofService.checkpointProof', () => {
  it('asks for the value of a non-weight milestone and submits the photo', async () => {
    const { api, proofs, prompt } = setup(shot({ text: null }));
    api.upload.mockResolvedValue({ url: 'https://cdn.test/arm.jpg' });
    const arm: Goal = { ...goal, path: 'GAIN', metric: 'SIZE', metricLabel: 'Arms', unit: 'cm', startValue: 36, goalValue: 40, currentValue: 37.5 };

    const done = proofs.checkpointProof(arm, cp({ targetValue: 38 }));
    await vi.waitFor(() => expect(prompt.current()?.label).toBe('Arms'));
    prompt.close('38.1');

    expect((await done)?.status).toBe('CLEARED');
    expect(api.submitCheckpointProof).toHaveBeenCalledWith('cp1', expect.objectContaining({ value: 38.1, photoUrl: 'https://cdn.test/arm.jpg' }));
  });

  it('cancels without a request when the camera is closed', async () => {
    const { api, camera, proofs } = setup(shot());
    camera.open.mockResolvedValue(null);

    expect(await proofs.checkpointProof(goal, cp())).toBeNull();
    expect(api.upload).not.toHaveBeenCalled();
    expect(api.submitCheckpointProof).not.toHaveBeenCalled();
  });
});

describe('ProofService weigh-ins', () => {
  const weighIn = () => tq(uq({ id: 'w', code: 'WEIGH_IN', name: 'Weigh-in', multiSlot: false }));

  it('asks before saving a big jump and lets the user fix it', async () => {
    const { api, proofs, prompt } = setup(shot({ number: 700 }));
    api.upload.mockResolvedValue({ url: 'https://cdn.test/w.jpg' });

    const done = proofs.complete(weighIn());
    await confirm(prompt, 'Is 700.0 kg right?', false);
    await vi.waitFor(() => expect(prompt.current()).not.toBeNull());
    prompt.close('69.5');
    await done;

    expect(api.weighIn).toHaveBeenCalledWith(expect.objectContaining({ value: 69.5 }));
    expect(api.submitCheckpointProof).not.toHaveBeenCalled();
  });

  it('offers the weigh-in as milestone proof when it reaches the active target', async () => {
    const { api, proofs, prompt, router } = setup(shot({ number: 67.9 }));
    api.upload.mockResolvedValueOnce({ url: 'https://cdn.test/w1.jpg' }).mockResolvedValueOnce({ url: 'https://cdn.test/w2.jpg' });
    const navigate = vi.spyOn(router, 'navigate');

    const done = proofs.complete(weighIn());
    await confirm(prompt, 'Use this weigh-in as milestone proof?', true);
    await done;

    expect(api.weighIn).toHaveBeenCalledWith(expect.objectContaining({ value: 67.9, photoUrl: 'https://cdn.test/w1.jpg' }));
    expect(api.submitCheckpointProof).toHaveBeenCalledWith('cp1', expect.objectContaining({ value: 67.9, photoUrl: 'https://cdn.test/w2.jpg', mlText: '67.9' }));
    expect(navigate).toHaveBeenCalledWith(['/journey', 'cp1', 'cleared']);
  });

  it('does not offer a proof when the weigh-in misses the target', async () => {
    const { api, proofs, prompt } = setup(shot({ number: 68.5 }));
    api.upload.mockResolvedValue({ url: 'https://cdn.test/w.jpg' });

    await proofs.complete(weighIn());

    expect(prompt.confirmation()).toBeNull();
    expect(api.submitCheckpointProof).not.toHaveBeenCalled();
  });
});
