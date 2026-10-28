import { Injectable, signal } from '@angular/core';

export type DisclosureKind = 'ACCESSIBILITY' | 'HEALTH';

export interface Disclosure {
  kind: DisclosureKind;
  resolve: (agreed: boolean) => void;
}

@Injectable({ providedIn: 'root' })
export class DisclosureService {
  readonly current = signal<Disclosure | null>(null);

  ask(kind: DisclosureKind): Promise<boolean> {
    this.current()?.resolve(false);
    return new Promise(resolve => this.current.set({ kind, resolve }));
  }

  answer(agreed: boolean): void {
    const d = this.current();
    if (!d) return;
    this.current.set(null);
    d.resolve(agreed);
  }
}
