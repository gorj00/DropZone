import { RepCounter, angle, parseWeight } from './vision';

type Lm = { type: string; x: number; y: number; inFrameLikelihood: number };

function leg(kneeDeg: number, likelihood = 0.9, side: 'LEFT' | 'RIGHT' = 'LEFT'): Lm[] {
  const rad = (kneeDeg * Math.PI) / 180;
  return [
    { type: `${side}_HIP`, x: 0, y: -1, inFrameLikelihood: likelihood },
    { type: `${side}_KNEE`, x: 0, y: 0, inFrameLikelihood: likelihood },
    { type: `${side}_ANKLE`, x: Math.sin(rad), y: -Math.cos(rad), inFrameLikelihood: likelihood }
  ];
}

describe('parseWeight', () => {
  it('ignores printed capacity labels', () => {
    expect(parseWeight('Mas: 25Okg\nKERA')).toBeNull();
    expect(parseWeight('Max 250 kg\n88.5')).toBe(88.5);
    expect(parseWeight('Mar 250kg\nKERN')).toBeNull();
    expect(parseWeight('M 250ka')).toBeNull();
    expect(parseWeight('M 250ka\n714')).toBe(71.4);
  });

  it('reads pounds when the scale is in lb', () => {
    expect(parseWeight('194.4 lb', null, 'lb')).toBe(194.4);
    expect(parseWeight('1944', null, 'lb')).toBe(194.4);
    expect(parseWeight('420', null, 'lb')).toBe(420);
    expect(parseWeight('420')).toBe(42);
    expect(parseWeight('30', null, 'lb')).toBeNull();
  });

  it('reads a decimal scale value', () => {
    expect(parseWeight('82.4 kg')).toBe(82.4);
  });

  it('accepts comma decimals', () => {
    expect(parseWeight('78,6')).toBe(78.6);
  });

  it('prefers a decimal over an integer', () => {
    expect(parseWeight('2026 12 91.2')).toBe(91.2);
  });

  it('ignores implausible values', () => {
    expect(parseWeight('12 5000 7')).toBeNull();
  });

  it('fixes common LCD misreads', () => {
    expect(parseWeight('B2.4')).toBe(82.4);
    expect(parseWeight('9O.S kg')).toBe(90.5);
    expect(parseWeight('l05.Z')).toBe(105.2);
  });

  it('infers a missing decimal point', () => {
    expect(parseWeight('824')).toBe(82.4);
    expect(parseWeight('1024')).toBe(102.4);
  });

  it('joins a decimal split by a space', () => {
    expect(parseWeight('82. 4')).toBe(82.4);
    expect(parseWeight('82 .4')).toBe(82.4);
  });

  it('keeps plain integers', () => {
    expect(parseWeight('105')).toBe(105);
    expect(parseWeight('weight 78')).toBe(78);
  });

  it('prefers the value closest to the expected weight', () => {
    expect(parseWeight('25.10 81.9', 82)).toBe(81.9);
    expect(parseWeight('245', 25)).toBe(24.5);
    expect(parseWeight('245')).toBe(245);
  });

  it('handles empty input', () => {
    expect(parseWeight(null)).toBeNull();
    expect(parseWeight('')).toBeNull();
  });
});

describe('angle', () => {
  it('computes a right angle', () => {
    expect(angle({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(90);
  });

  it('computes a straight line', () => {
    expect(angle({ x: -1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(180);
  });
});

describe('RepCounter', () => {
  it('counts a squat after going down and back up', () => {
    const c = new RepCounter('SQUAT');
    expect(c.feed(leg(175))).toBe(0);
    expect(c.feed(leg(80))).toBe(0);
    expect(c.feed(leg(170))).toBe(1);
  });

  it('does not count partial reps', () => {
    const c = new RepCounter('SQUAT');
    c.feed(leg(175));
    c.feed(leg(130));
    expect(c.feed(leg(175))).toBe(0);
  });

  it('counts several reps', () => {
    const c = new RepCounter('SQUAT');
    for (let i = 0; i < 3; i++) {
      c.feed(leg(90));
      c.feed(leg(170));
    }
    expect(c.count).toBe(3);
  });

  it('ignores low-confidence landmarks', () => {
    const c = new RepCounter('SQUAT');
    c.feed(leg(80, 0.3));
    expect(c.feed(leg(170, 0.3))).toBe(0);
  });

  it('uses the more confident side', () => {
    const c = new RepCounter('SQUAT');
    c.feed([...leg(80, 0.95, 'LEFT'), ...leg(170, 0.6, 'RIGHT')]);
    expect(c.feed([...leg(170, 0.95, 'LEFT'), ...leg(170, 0.6, 'RIGHT')])).toBe(1);
  });
});
