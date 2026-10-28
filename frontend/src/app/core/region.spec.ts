import { describe, expect, it } from 'vitest';
import { isEuCountry, isEuTimeZone, regionOf } from './region';

describe('regionOf', () => {
  it('uses the SIM country first', () => {
    expect(regionOf({ sim: 'cz', network: 'US', locale: 'US' }, 'America/New_York')).toEqual({ source: 'SIM', value: 'CZ', eu: true });
  });

  it('falls back to the network, then the phone region, then the time zone', () => {
    expect(regionOf({ sim: '', network: 'US', locale: 'DE' }, 'Europe/Prague')).toEqual({ source: 'NETWORK', value: 'US', eu: false });
    expect(regionOf({ sim: '', network: '', locale: 'FR' }, 'America/New_York')).toEqual({ source: 'PHONE_REGION', value: 'FR', eu: true });
    expect(regionOf({}, 'Europe/Prague')).toEqual({ source: 'TIME_ZONE', value: 'Europe/Prague', eu: true });
  });

  it('only counts EU members', () => {
    expect(isEuCountry('GB')).toBe(false);
    expect(isEuCountry('NO')).toBe(false);
    expect(isEuTimeZone('Europe/London')).toBe(false);
    expect(isEuTimeZone('Europe/Lisbon')).toBe(true);
  });
});
