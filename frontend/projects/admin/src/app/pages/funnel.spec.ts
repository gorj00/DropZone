import { funnelRows } from './funnel';

describe('funnelRows', () => {
  it('orders the steps from app open to finished onboarding and compares each to the opens', () => {
    const { steps, drops } = funnelRows([
      { name: 'SIGN_IN_FAIL', step: null, devices: 1, events: 3 },
      { name: 'APP_OPEN', step: null, devices: 8, events: 20 },
      { name: 'ONBOARDING_STEP', step: 'goal', devices: 2, events: 2 },
      { name: 'SIGN_IN_TAP', step: null, devices: 4, events: 5 }
    ]);
    expect(steps.map(s => s.label)).toEqual([
      'Opened the app', 'Saw the welcome screen', 'Tapped sign-in', 'Signed in', 'Onboarding · profile', 'Onboarding · path',
      'Onboarding · goal', 'Onboarding · quests', 'Onboarding · app lock', 'Finished onboarding'
    ]);
    expect(steps.map(s => s.devices)).toEqual([8, 0, 4, 0, 0, 0, 2, 0, 0, 0]);
    expect(steps.map(s => s.pct)).toEqual([100, 0, 50, 0, 0, 0, 25, 0, 0, 0]);
    expect(drops).toEqual([
      { label: 'Cancelled sign-in', devices: 0, events: 0, pct: 0 },
      { label: 'Sign-in failed', devices: 1, events: 3, pct: 13 }
    ]);
  });

  it('shows zeros instead of dividing by nothing when there are no events', () => {
    expect(funnelRows([]).steps.every(s => s.devices === 0 && s.pct === 0)).toBe(true);
  });
});
