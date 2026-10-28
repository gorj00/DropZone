import { trialBillingNote, trialEnd, trialLeft } from './trial';

describe('trialLeft', () => {
  const now = new Date('2026-10-25T12:00:00Z').getTime();

  it('counts whole days, rounding up', () => {
    expect(trialLeft('2026-10-28T12:00:00Z', now)).toBe('3 days left');
    expect(trialLeft('2026-10-27T01:00:00Z', now)).toBe('2 days left');
  });

  it('switches to hours on the last day', () => {
    expect(trialLeft('2026-10-25T17:30:00Z', now)).toBe('6 hours left');
    expect(trialLeft('2026-10-25T12:20:00Z', now)).toBe('1 hour left');
  });

  it('returns null when missing or over', () => {
    expect(trialLeft(null, now)).toBeNull();
    expect(trialLeft('2026-10-25T11:00:00Z', now)).toBeNull();
  });
});

describe('trialBillingNote', () => {
  const now = new Date('2026-10-25T12:00:00Z').getTime();

  it('names the remaining trial days', () => {
    expect(trialBillingNote('2026-10-28T12:00:00Z', now)).toBe('Billing starts today; your remaining 3 trial days end now.');
    expect(trialBillingNote('2026-10-25T18:00:00Z', now)).toBe('Billing starts today; your remaining 1 trial day ends now.');
  });

  it('says nothing without a running trial', () => {
    expect(trialBillingNote(null, now)).toBeNull();
    expect(trialBillingNote('2026-10-25T11:00:00Z', now)).toBeNull();
  });
});

describe('trialEnd', () => {
  it('formats the end date', () => {
    expect(trialEnd('2026-10-28T12:00:00Z', false)).toMatch(/Oct 28|Oct 29|Oct 27/);
  });
});
