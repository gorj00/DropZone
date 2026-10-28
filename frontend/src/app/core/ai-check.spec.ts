import { cameraVerdict, photoMatches, proofBadge, readsAWeight } from './ai-check';

describe('AI check texts', () => {
  it('says AI verified only for checked proofs', () => {
    expect(proofBadge(true)).toBe('AI verified');
    expect(proofBadge(false)).toBe('Photo proof');
    expect(proofBadge(undefined)).toBe('Photo proof');
  });

  it('tells the user whether a meal photo matched', () => {
    expect(cameraVerdict({ quest: 'HEALTHY_MEAL' }, ['Table', 'Food'], null)).toEqual({ ok: true, title: 'Looks like a meal', note: 'Use it as proof.' });
    expect(cameraVerdict({ quest: 'HEALTHY_MEAL' }, ['Ceiling', 'Room'], null)).toEqual({ ok: false, title: "Didn't recognise a meal", note: "It'll be saved as a photo proof." });
  });

  it('matches labels without case and per quest', () => {
    expect(photoMatches({ quest: 'GYM' }, ['  dumbbell '], null)).toBe(true);
    expect(photoMatches({ quest: 'GYM' }, ['Food'], null)).toBe(false);
    expect(photoMatches({ metric: 'SIZE' }, ['Tape measure'], null)).toBe(true);
  });

  it('passes a weigh-in on a scale reading and ignores labels the weigh-in does not send', () => {
    expect(readsAWeight('78.4')).toBe(true);
    expect(readsAWeight('MAX 180 kg')).toBe(true);
    expect(readsAWeight('8.8')).toBe(false);
    expect(readsAWeight(null)).toBe(false);
    expect(cameraVerdict({ quest: 'WEIGH_IN', textOnly: true }, ['Bathroom scale'], null)?.ok).toBe(false);
    expect(cameraVerdict({ quest: 'WEIGH_IN', textOnly: true }, [], '81,2')?.title).toBe('Looks like a scale');
    expect(cameraVerdict({ metric: 'WEIGHT' }, ['Bathroom scale'], null)?.ok).toBe(true);
  });

  it('calls quests without an AI check a photo proof and mentions friends checking', () => {
    expect(cameraVerdict({ quest: null }, ['Food'], null)).toEqual({ ok: true, title: 'Photo proof', note: 'Looks good? Use it as proof.' });
    expect(cameraVerdict({ quest: 'NEW_HOBBY' }, [], null)?.title).toBe('Photo proof');
    expect(cameraVerdict({ quest: 'HEALTHY_MEAL', friends: true }, [], null)).toEqual({ ok: false, title: "Didn't recognise a meal", note: '3 people verify it next.' });
    expect(cameraVerdict(undefined, ['Food'], null)).toBeNull();
  });
});
