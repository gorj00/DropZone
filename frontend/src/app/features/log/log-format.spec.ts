import { DailyLog, UserQuest } from '../../core/api/models';
import { UnitsService } from '../../core/units';
import { logTitle, logValue } from './log-format';

function quest(over: Partial<UserQuest>): UserQuest {
  return {
    id: 'q', code: null, name: 'Healthy meal', icon: 'meal', group: 'BURN_FUEL', proof: 'PHOTO', autoSource: null, target: null,
    custom: false, days: [1, 2, 3, 4, 5, 6, 7], squadCheck: false, perDay: 1, ...over
  } as UserQuest;
}

function log(q: Partial<UserQuest>, over: Partial<DailyLog> = {}): DailyLog {
  return {
    id: 'l', day: '2026-10-05', quest: quest(q), status: 'DONE', slot: 1, slots: 1, value: null, reps: null, summary: null,
    createdAt: '2026-10-05T08:00:00Z', photoUrl: null, proofId: null, verifiedCount: 0, requiredVerifications: 0, feedItemId: null, ...over
  };
}

const units = { amount: (v: number) => `${v.toFixed(1)} kg` } as unknown as UnitsService;

describe('log format', () => {
  it('numbers multiple meals', () => {
    expect(logTitle(log({}, { slot: 2, slots: 3 }))).toBe('Healthy meal · Meal 2 of 3');
    expect(logTitle(log({}))).toBe('Healthy meal');
  });

  it('formats values by quest kind', () => {
    expect(logValue(log({ code: 'WEIGH_IN', name: 'Weigh-in' }, { value: 88.5 }), units)).toBe('88.5 kg');
    expect(logValue(log({ proof: 'AUTO', autoSource: 'STEPS' }, { value: 8240 }), units)).toBe('8,240 steps');
    expect(logValue(log({ proof: 'AUTO', autoSource: 'SLEEP' }, { value: 445 }), units)).toBe('7 h 25 min sleep');
    expect(logValue(log({ proof: 'REPS' }, { reps: 24 }), units)).toBe('24 reps');
    expect(logValue(log({ proof: 'CHECKIN' }), units)).toBe('Checked in');
    expect(logValue(log({}), units)).toBeNull();
  });
});
