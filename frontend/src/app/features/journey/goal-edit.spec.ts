import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { Checkpoint, Goal, User } from '../../core/api/models';
import { SessionStore } from '../../core/session.store';
import { GoalEditPage } from './goal-edit';

const cp = (index: number, patch: Partial<Checkpoint> = {}): Checkpoint => ({
  id: `cp${index}`, index, targetValue: 90 - index * 2, deltaToEarn: index * 2, rewardTitle: null, rewardImageUrl: null, isPublic: false, visibility: 'PRIVATE',
  verification: 'AI', deadline: null, status: 'LOCKED', clearedAt: null, proofId: null, verifiedCount: 0, requiredVerifications: 0, ...patch
});
const goal: Goal = {
  id: 'g1', path: 'LOSE', metric: 'WEIGHT', metricLabel: null, unit: 'kg', startValue: 90, goalValue: 82, currentValue: 87, progressValue: 3, totalValue: 8,
  checkpoints: [cp(1, { status: 'CLEARED' }), cp(2, { status: 'ACTIVE' }), cp(3), cp(4)]
} as Goal;

async function render() {
  const api = { goal: vi.fn().mockResolvedValue(goal), updateGoal: vi.fn().mockResolvedValue(goal) };
  TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: ApiService, useValue: api }] });
  TestBed.inject(SessionStore).setUser({ id: 'me', path: 'LOSE', pro: true, onboarded: true, theme: 'NEON', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, lockedApps: [], weightUnit: 'KG', lengthUnit: 'CM' } as unknown as User);
  const fixture = TestBed.createComponent(GoalEditPage);
  const el = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  await settle();
  await new Promise(r => setTimeout(r));
  await settle();
  const button =(label: string) => [...el.querySelectorAll('button')].find(b => b.textContent?.includes(label)) as HTMLButtonElement;
  const rowInputs = () => [...el.querySelectorAll<HTMLInputElement>('input[aria-label^="Milestone"]')];
  const type = async (input: HTMLInputElement, value: string) => {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await settle();
  };
  return { api, el, settle, button, rowInputs, type };
}

describe('Edit goal milestones', () => {
  it('adds a milestone after the last and saves every open milestone', async () => {
    const { api, button, rowInputs, settle } = await render();
    expect(rowInputs().map(i => i.value)).toEqual(['86.0', '84.0', '82.0']);

    button('Add milestone').click();
    await settle();
    expect(rowInputs().map(i => i.value)).toEqual(['86.0', '84.0', '82.0', '80.0']);

    button('Save goal').click();
    await settle();
    expect(api.updateGoal).toHaveBeenCalledWith({ goalValue: 80, milestones: [86, 84, 82, 80] });
  });

  it('lets you set one milestone and blocks values out of order', async () => {
    const { api, el, button, rowInputs, type } = await render();
    await type(rowInputs()[1], '85');
    expect(button('Save goal').disabled).toBe(false);

    await type(rowInputs()[0], '89');
    expect(el.textContent).toContain('Milestone 2 must be below 88.0 kg');
    expect(button('Save goal').disabled).toBe(true);

    await type(rowInputs()[0], '86');
    button('Save goal').click();
    await new Promise(r => setTimeout(r));
    expect(api.updateGoal).toHaveBeenCalledWith({ goalValue: 82, milestones: [86, 85, 82] });
  });
});
