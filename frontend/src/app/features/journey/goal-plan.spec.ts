import { Checkpoint, CheckpointStatus, Goal, Verification } from '../../core/api/models';
import { effectiveVerification, goalEditError, milestoneError, milestoneRange, respread, startLocked } from './goal-plan';

function cp(index: number, targetValue: number, status: CheckpointStatus = 'LOCKED', verification: Verification = 'AI'): Checkpoint {
  return {
    id: `cp${index}`, index, targetValue, deltaToEarn: 0, rewardTitle: null, rewardImageUrl: null, isPublic: false,
    verification, deadline: null, status, clearedAt: null, proofId: null, verifiedCount: 0, requiredVerifications: 0
  };
}

function goal(path: 'LOSE' | 'GAIN', start: number, target: number, checkpoints: Checkpoint[]): Goal {
  return { id: 'g', path, metric: 'WEIGHT', metricLabel: null, unit: 'kg', startValue: start, goalValue: target, currentValue: start, progressValue: 0, totalValue: Math.abs(target - start), checkpoints };
}

const fmt = (v: number) => `${v} kg`;

describe('goal plan', () => {
  const lose = () => goal('LOSE', 90, 80, [cp(1, 87.5, 'ACTIVE'), cp(2, 85), cp(3, 82.5), cp(4, 80)]);

  it('spreads open milestones evenly to the new target', () => {
    expect(respread(lose(), 90, 78)).toEqual([87, 84, 81, 78]);
    expect(respread(lose(), 94, 78)).toEqual([90, 86, 82, 78]);
  });

  it('keeps cleared milestones and spreads from the last one', () => {
    const g = goal('LOSE', 90, 80, [cp(1, 87.5, 'CLEARED'), cp(2, 85, 'ACTIVE'), cp(3, 82.5), cp(4, 80)]);
    expect(respread(g, 90, 75)).toEqual([87.5, 83.3, 79.2, 75]);
    expect(startLocked(g)).toBe(true);
    expect(goalEditError(g, 90, 88, fmt)).toBe('The target must be below milestone 1 (87.5 kg).');
  });

  it('checks the direction of the goal', () => {
    expect(goalEditError(lose(), 90, 95, fmt)).toBe('The target must be below the start value.');
    const gain = goal('GAIN', 60, 80, [cp(1, 70, 'ACTIVE'), cp(2, 80)]);
    expect(goalEditError(gain, 60, 55, fmt)).toBe('The target must be above the start value.');
    expect(goalEditError(gain, 60, 100, fmt)).toBeNull();
  });

  it('checks the minimum milestone gap before saving', () => {
    const round = (v: number) => `${Math.round(v * 10) / 10} kg`;
    expect(goalEditError(lose(), 90, 89.3, round)).toBe('Milestones must be at least 0.2 kg apart: the target must be at least 0.8 kg below the start (90 kg).');
    expect(goalEditError(lose(), 90, 89.2, round)).toBeNull();
    const g = goal('LOSE', 90, 80, [cp(1, 87.5, 'CLEARED'), cp(2, 85, 'ACTIVE'), cp(3, 82.5), cp(4, 80)]);
    expect(goalEditError(g, 90, 87, round)).toBe('Milestones must be at least 0.2 kg apart: the target must be at least 0.6 kg below milestone 1 (87.5 kg).');
    expect(goalEditError(g, 90, 86.9, round)).toBeNull();
  });

  it('shows community milestones as AI while the owner is not PRO', () => {
    expect(effectiveVerification(cp(1, 85, 'ACTIVE', 'COMMUNITY'), false)).toBe('AI');
    expect(effectiveVerification(cp(1, 85, 'ACTIVE', 'COMMUNITY'), true)).toBe('COMMUNITY');
    expect(effectiveVerification(cp(1, 85, 'PENDING_VERIFICATION', 'COMMUNITY'), false)).toBe('COMMUNITY');
    expect(effectiveVerification(cp(1, 85, 'LOCKED', 'AI'), true)).toBe('AI');
  });

  it('keeps a milestone between its neighbours', () => {
    const g = lose();
    expect(milestoneRange(g, g.checkpoints[1])).toEqual({ previous: 87.5, next: 82.5, last: false });
    expect(milestoneError(g, g.checkpoints[1], 84, fmt)).toBeNull();
    expect(milestoneError(g, g.checkpoints[1], 88, fmt)).toBe('Pick a value between 87.5 kg and 82.5 kg.');
    expect(milestoneError(g, g.checkpoints[1], 82.5, fmt)).not.toBeNull();
    expect(milestoneRange(g, g.checkpoints[0]).previous).toBe(90);
    expect(milestoneRange(g, g.checkpoints[3]).last).toBe(true);
  });
});
