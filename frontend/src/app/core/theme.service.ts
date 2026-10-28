import { Injectable, effect, signal } from '@angular/core';
import { Theme } from './api/models';

const KEY = 'dz-theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>(this.initial());

  constructor() {
    effect(() => {
      const t = this.theme();
      document.documentElement.dataset['theme'] = t === 'STEALTH' ? 'stealth' : 'neon';
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'STEALTH' ? '#08090c' : '#0d0a2b');
      try { localStorage.setItem(KEY, t); } catch { }
    });
  }

  readonly isNeon = () => this.theme() === 'NEON';

  set(theme: Theme): void {
    this.theme.set(theme);
  }

  private initial(): Theme {
    try {
      const v = localStorage.getItem(KEY);
      if (v === 'STEALTH' || v === 'NEON') return v;
    } catch { }
    return 'NEON';
  }
}
