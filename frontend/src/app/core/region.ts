import { Injectable, computed, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { AppSettings } from './native/plugins';
import { IS_IOS } from './platform';

const COUNTRIES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT',
  'RO', 'SK', 'SI', 'ES', 'SE', 'AX', 'GF', 'GP', 'MQ', 'RE', 'YT', 'MF'
]);

const ZONES = new Set([
  'Europe/Vienna', 'Europe/Brussels', 'Europe/Sofia', 'Europe/Zagreb', 'Europe/Nicosia', 'Asia/Nicosia', 'Asia/Famagusta',
  'Europe/Prague', 'Europe/Copenhagen', 'Europe/Tallinn', 'Europe/Helsinki', 'Europe/Mariehamn', 'Europe/Paris', 'Europe/Berlin',
  'Europe/Busingen', 'Europe/Athens', 'Europe/Budapest', 'Europe/Dublin', 'Europe/Rome', 'Europe/Riga', 'Europe/Vilnius',
  'Europe/Luxembourg', 'Europe/Malta', 'Europe/Amsterdam', 'Europe/Warsaw', 'Europe/Lisbon', 'Atlantic/Azores', 'Atlantic/Madeira',
  'Europe/Bucharest', 'Europe/Bratislava', 'Europe/Ljubljana', 'Europe/Madrid', 'Africa/Ceuta', 'Atlantic/Canary', 'Europe/Stockholm',
  'America/Cayenne', 'America/Guadeloupe', 'America/Martinique', 'America/Marigot', 'Indian/Reunion', 'Indian/Mayotte'
]);

export type RegionSource = 'SIM' | 'NETWORK' | 'PHONE_REGION' | 'TIME_ZONE';

export interface Region {
  source: RegionSource;
  value: string;
  eu: boolean;
}

export function isEuCountry(code: string | null | undefined): boolean {
  return !!code && COUNTRIES.has(code.toUpperCase());
}

export function isEuTimeZone(zone: string | null | undefined): boolean {
  return !!zone && ZONES.has(zone);
}

export function regionOf(found: { sim?: string; network?: string; locale?: string }, zone: string): Region {
  const checks: [RegionSource, string | undefined][] = [['SIM', found.sim], ['NETWORK', found.network], ['PHONE_REGION', found.locale]];
  for (const [source, value] of checks) {
    if (value) return { source, value: value.toUpperCase(), eu: isEuCountry(value) };
  }
  return { source: 'TIME_ZONE', value: zone, eu: isEuTimeZone(zone) };
}

export function regionOfLanguage(tag: string | null | undefined): string {
  return /^[a-z]{2,3}(?:-[A-Za-z]{4})?-([A-Za-z]{2})\b/.exec(tag ?? '')?.[1]?.toUpperCase() ?? '';
}

function timeZone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone ?? ''; } catch { return ''; }
}

@Injectable({ providedIn: 'root' })
export class RegionService {
  readonly region = signal<Region>(regionOf({}, timeZone()));
  readonly eu = computed(() => this.region().eu);

  constructor() {
    if (Capacitor.isNativePlatform()) void this.detect();
  }

  private async detect(): Promise<void> {
    try {
      const found = IS_IOS ? { locale: regionOfLanguage(navigator.language) } : await AppSettings.getRegion();
      this.region.set(regionOf(found, timeZone()));
    } catch { }
  }
}
