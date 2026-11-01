import type { UserRow } from './models';

const dateTime = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const dateOnly = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const shortDay = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

export function when(iso: string | null | undefined): string {
  return iso ? dateTime.format(new Date(iso)) : '—';
}

export function day(iso: string | null | undefined): string {
  return iso ? dateOnly.format(new Date(iso)) : '—';
}

export function weekday(iso: string): string {
  return shortDay.format(new Date(iso + 'T00:00:00'));
}

export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export function since(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
}

export function plan(u: Pick<UserRow, 'subscribed' | 'trial'>): 'PRO' | 'TRIAL' | 'FREE' {
  return u.subscribed ? 'PRO' : u.trial ? 'TRIAL' : 'FREE';
}

export function initials(name: string | null | undefined): string {
  return (name ?? '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || '?';
}

export function num(value: number | null | undefined, digits = 1): string {
  return value === null || value === undefined ? '—' : Number(value.toFixed(digits)).toString();
}

export function shortId(id: string | null | undefined): string {
  return id ? id.slice(0, 8) : '—';
}
