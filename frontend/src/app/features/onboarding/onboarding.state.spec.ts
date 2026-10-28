import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { Preferences } from '@capacitor/preferences';
import { QuestType, User } from '../../core/api/models';
import { LockService } from '../../core/native/lock';
import { SessionStore } from '../../core/session.store';
import { CatalogStore } from '../../core/stores';
import { formatValue } from '../../core/units';
import { OnboardingDraft, OnboardingState, parseDraft, planCheckpoints, resumeOnboardingGuard } from './onboarding.state';

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: LockService, useValue: { native: false, disable: vi.fn().mockResolvedValue(undefined) } }
    ]
  });
  return { state: TestBed.inject(OnboardingState), session: TestBed.inject(SessionStore) };
}

const draft = (patch: Partial<OnboardingDraft> = {}): OnboardingDraft => ({
  userId: 'u1', step: 'lock', path: 'GAIN', metric: 'STRENGTH', metricLabel: 'Squat', start: 135, goal: 175, checkpoints: 5,
  questCodes: ['PROTEIN', 'SLEEP'], schedules: { PROTEIN: { days: [1, 3, 5], perDay: 1, target: null } }, lockedApps: ['com.instagram.android'],
  unlockMode: 'WHOLE_DAY', weightUnit: 'LB', lengthUnit: 'IN', ...patch
});

describe('planCheckpoints', () => {
  it('matches the backend planner', () => {
    expect(planCheckpoints(90, 80, 4)).toEqual([87.5, 85, 82.5, 80]);
    expect(planCheckpoints(70, 76, 3)).toEqual([72, 74, 76]);
    expect(planCheckpoints(90, 80, 3)).toEqual([86.7, 83.3, 80]);
    expect(planCheckpoints(80, 70, 2)).toEqual([75, 70]);
    const ten = planCheckpoints(80, 70, 10);
    expect(ten.length).toBe(10);
    expect(ten[0]).toBe(79);
    expect(ten[9]).toBe(70);
  });

  it('drops milestones that would round onto each other', () => {
    expect(planCheckpoints(80, 79.8, 4)).toEqual([79.9, 79.8]);
    expect(planCheckpoints(80, 79.95, 2)).toEqual([]);
  });

  it('respects a minimum gap', () => {
    expect(planCheckpoints(80, 79, 10, 0.2)).toEqual([79.8, 79.6, 79.4, 79.2, 79]);
  });
});

describe('OnboardingState preview', () => {
  beforeEach(() => localStorage.clear());

  it('shows the targets the backend stores for a pound user', () => {
    const { state } = setup();
    state.setWeightUnit('LB');
    state.path.set('LOSE');
    state.start.set(204);
    state.goal.set(172);
    state.checkpoints.set(4);

    const req = state.request();
    const stored = planCheckpoints(req.startValue, req.goalValue, req.checkpoints);
    const units = { weight: 'LB', length: 'IN' } as const;

    expect(state.track().map(v => v.toFixed(1))).toEqual(['196.0', '188.1', '179.9', '172.0']);
    expect(state.track().map(v => v.toFixed(1))).toEqual(stored.map(t => formatValue(t, 'kg', units)));
  });

  it('keeps metric previews unchanged', () => {
    const { state } = setup();
    state.setWeightUnit('KG');
    state.path.set('LOSE');
    state.start.set(92.4);
    state.goal.set(78);
    state.checkpoints.set(4);

    expect(state.track().map(v => v.toFixed(1))).toEqual(['88.8', '85.2', '81.6', '78.0']);
  });

  it('blocks a goal too close to the start for any milestone', () => {
    const { state } = setup();
    state.setWeightUnit('KG');
    state.path.set('LOSE');
    state.start.set(80);
    state.goal.set(79.7);
    expect(state.problem()).toBe('close');
    expect(state.valid()).toBe(false);
    expect(state.minDistance()).toBe(0.4);

    state.goal.set(79.6);
    expect(state.problem()).toBeNull();
    expect(state.set('goal', '19')).toBe(false);
  });

  it('drops milestones closer than the backend minimum gap', () => {
    const { state } = setup();
    state.setLengthUnit('CM');
    state.setPath('GAIN');
    state.setMetric('SIZE');
    state.start.set(36);
    state.goal.set(38);
    state.checkpoints.set(10);

    expect(state.track()).toEqual([36.5, 37, 37.5, 38]);
  });

  it('caps the milestone count buttons by the minimum gap and sends the count it shows', () => {
    const { state } = setup();
    state.setWeightUnit('KG');
    state.path.set('LOSE');
    state.start.set(80);
    state.goal.set(79);
    state.checkpoints.set(8);

    expect([...state.fittingCounts()]).toEqual([2, 3, 4, 5]);
    expect(state.checkpointCount()).toBe(5);
    expect(state.request().checkpoints).toBe(5);
    expect(state.perCheckpoint()).toBeCloseTo(0.2);

    state.goal.set(70);
    expect(state.fittingCounts().has(10)).toBe(true);
    expect(state.checkpointCount()).toBe(8);
  });
});

describe('onboarding draft', () => {
  beforeEach(() => localStorage.clear());

  it('parses only a complete draft of the same user', () => {
    expect(parseDraft(JSON.stringify(draft()), 'u1')?.step).toBe('lock');
    expect(parseDraft(JSON.stringify(draft()), 'u2')).toBeNull();
    expect(parseDraft(JSON.stringify(draft({ step: 'nope' as never })), 'u1')).toBeNull();
    expect(parseDraft(JSON.stringify({ ...draft(), start: 'x' }), 'u1')).toBeNull();
    expect(parseDraft('{broken', 'u1')).toBeNull();
    expect(parseDraft(null, 'u1')).toBeNull();
  });

  it('restores the saved choices and step', async () => {
    const { state } = setup();
    await Preferences.set({ key: 'dz-onboarding', value: JSON.stringify(draft()) });

    expect(await state.restore('u1')).toBe('lock');
    expect(state.path()).toBe('GAIN');
    expect(state.metric()).toBe('STRENGTH');
    expect(state.metricLabel()).toBe('Squat');
    expect(state.weightUnit()).toBe('LB');
    expect(state.start()).toBe(135);
    expect(state.goal()).toBe(175);
    expect(state.checkpoints()).toBe(5);
    expect(state.questCodes()).toEqual(['PROTEIN', 'SLEEP']);
    expect(state.schedule('PROTEIN').days).toEqual([1, 3, 5]);
  });

  it('saves changes and removes the draft when onboarding finishes', async () => {
    const { state } = setup();
    await state.restore('u1');
    state.checkpoints.set(7);
    TestBed.tick();
    await vi.waitFor(async () => expect(parseDraft((await Preferences.get({ key: 'dz-onboarding' })).value, 'u1')?.checkpoints).toBe(7));

    state.reset();
    TestBed.tick();
    await vi.waitFor(async () => expect((await Preferences.get({ key: 'dz-onboarding' })).value).toBeNull());
  });

  it('resumes a not-onboarded user at the saved step', async () => {
    const { session } = setup();
    session.setUser({ id: 'u1', onboarded: false, theme: 'NEON', timezone: tz, lockedApps: [] } as unknown as User);
    session.token.set('tok');
    await Preferences.set({ key: 'dz-onboarding', value: JSON.stringify(draft({ step: 'quests' })) });

    const route = {} as ActivatedRouteSnapshot;
    const atProfile = await TestBed.runInInjectionContext(() => resumeOnboardingGuard(route, { url: '/onboarding/profile' } as RouterStateSnapshot));
    expect(TestBed.inject(Router).serializeUrl(atProfile as UrlTree)).toBe('/onboarding/quests');

    const atGoal = await TestBed.runInInjectionContext(() => resumeOnboardingGuard(route, { url: '/onboarding/goal' } as RouterStateSnapshot));
    expect(atGoal).toBe(true);
  });
});

describe('onboarding quest defaults', () => {
  beforeEach(() => localStorage.clear());

  const type = (code: string, patch: Partial<QuestType>): QuestType => ({
    code, path: 'LOSE', name: code, icon: 'meal', group: 'BURN_FUEL', proof: 'PHOTO', free: true, autoSource: null, target: null,
    multiSlot: false, defaultDays: [1, 2, 3, 4, 5, 6, 7], defaultPerDay: 1, ...patch
  });

  it('reads days and meals a day from the catalog of the chosen path', () => {
    const { state } = setup();
    TestBed.inject(CatalogStore).catalog.set([
      type('WEIGH_IN', { defaultDays: [1] }),
      type('HEALTHY_MEAL', { multiSlot: true, defaultPerDay: 3 }),
      type('PROTEIN_MEAL', { path: 'GAIN', multiSlot: true, defaultPerDay: 3 })
    ]);
    state.setPath('LOSE');
    expect(state.schedule('WEIGH_IN')).toEqual({ days: [1], perDay: 1, target: null });
    expect(state.schedule('HEALTHY_MEAL')).toEqual({ days: [1, 2, 3, 4, 5, 6, 7], perDay: 3, target: null });
    expect(state.schedule('PROTEIN_MEAL')).toEqual({ days: [1, 2, 3, 4, 5, 6, 7], perDay: 1, target: null });

    state.setDays('HEALTHY_MEAL', [1, 2]);
    expect(state.schedule('HEALTHY_MEAL')).toEqual({ days: [1, 2], perDay: 3, target: null });
  });
});
