import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { QuestType } from '../../core/api/models';
import { LockService } from '../../core/native/lock';
import { CatalogStore } from '../../core/stores';
import { OnboardingState } from './onboarding.state';
import { QuestsPage } from './quests';

const quest = (code: string, name: string, patch: Partial<QuestType> = {}): QuestType => ({
  code, name, path: 'GAIN', icon: 'protein', group: 'BUILD_FUEL', proof: 'PHOTO', free: true, autoSource: null, target: null, multiSlot: false,
  defaultDays: [1, 2, 3, 4, 5, 6, 7], defaultPerDay: 1, ...patch
});

async function render(codes = ['PROTEIN_MEAL', 'GYM']) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: LockService, useValue: { native: false, disable: vi.fn().mockResolvedValue(undefined) } }
    ]
  });
  TestBed.inject(CatalogStore).catalog.set([
    quest('WEIGH_IN', 'Weigh-in', { icon: 'scale', defaultDays: [1] }),
    quest('PROTEIN_MEAL', 'Protein meal', { multiSlot: true, defaultPerDay: 3 }),
    quest('EXTRA_MEAL', 'Extra meal', { multiSlot: true, defaultPerDay: 3 }),
    quest('GYM', 'Gym session', { icon: 'gym' }),
    quest('CAMERA_REPS', 'Camera reps', { icon: 'reps', proof: 'REPS', target: 20, free: false })
  ]);
  const state = TestBed.inject(OnboardingState);
  state.setPath('GAIN');
  state.questCodes.set(codes);
  const fixture = TestBed.createComponent(QuestsPage);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const card = (name: string) => Array.from(el.querySelectorAll<HTMLElement>('.card.p-3\\.5')).find(c => c.textContent?.includes(name))!;
  return { fixture, state, card };
}

describe('onboarding quest schedule', () => {
  it('offers several meals a day for multi-slot GAIN quests only', async () => {
    const { card } = await render();
    expect(card('Protein meal').textContent).toContain('Meals a day');
    expect(card('Gym session').textContent).not.toContain('Meals a day');
  });

  it('starts with the catalog defaults: meals 3 a day, weigh-in on Monday', async () => {
    const { state, card } = await render(['WEIGH_IN', 'PROTEIN_MEAL', 'GYM']);
    expect(card('Protein meal').textContent).toContain('3 meals a day');
    expect(card('Weigh-in').textContent).toContain('Mon');
    expect(card('Gym session').textContent).toContain('Every day');
    const on = Array.from(card('Weigh-in').querySelectorAll<HTMLButtonElement>('.day.on')).map(b => b.getAttribute('aria-label'));
    expect(on).toEqual(['Monday']);
    expect(state.request().questSettings).toEqual([]);
  });

  it('sends the meals a day for a protein meal', async () => {
    const { fixture, state, card } = await render();
    card('Protein meal').querySelector<HTMLButtonElement>('[aria-label="More meals"]')!.click();
    fixture.detectChanges();

    expect(card('Protein meal').textContent).toContain('4 meals a day');
    expect(state.request().questSettings).toContainEqual({ code: 'PROTEIN_MEAL', days: [1, 2, 3, 4, 5, 6, 7], perDay: 4 });
  });

  it('keeps the Monday default when another weigh-in day is added', async () => {
    const { fixture, state, card } = await render(['WEIGH_IN']);
    card('Weigh-in').querySelector<HTMLButtonElement>('[aria-label="Thursday"]')!.click();
    fixture.detectChanges();

    expect(card('Weigh-in').textContent).toContain('Mon, Thu');
    expect(state.request().questSettings).toEqual([{ code: 'WEIGH_IN', days: [1, 4], perDay: 1 }]);
  });

  it('sets the rep goal with the level chips', async () => {
    const { fixture, state, card } = await render(['CAMERA_REPS']);
    expect(card('Camera reps').textContent).toContain('20 squats or 10 push-ups · Every day');
    const hard = Array.from(card('Camera reps').querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent?.includes('Hard 40'))!;
    hard.click();
    fixture.detectChanges();

    expect(card('Camera reps').textContent).toContain('40 squats or 20 push-ups · Every day');
    expect(state.request().questSettings).toEqual([{ code: 'CAMERA_REPS', days: [1, 2, 3, 4, 5, 6, 7], perDay: 1, target: 40 }]);
  });
});
