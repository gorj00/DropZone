import { Injectable, signal } from '@angular/core';

export interface NumberPrompt {
  label: string;
  unit: string;
  value: number | null;
  resolve: (v: number | null) => void;
}

export interface ConfirmPrompt {
  title: string;
  message: string;
  yes: string;
  no: string;
  resolve: (v: boolean) => void;
}

export interface ChoiceOption {
  key: string;
  label: string;
  icon?: string;
  danger?: boolean;
}

export interface ChoicePrompt {
  title: string;
  message: string | null;
  options: ChoiceOption[];
  resolve: (key: string | null) => void;
}

@Injectable({ providedIn: 'root' })
export class PromptService {
  readonly current = signal<NumberPrompt | null>(null);
  readonly confirmation = signal<ConfirmPrompt | null>(null);
  readonly choice = signal<ChoicePrompt | null>(null);

  number(label: string, unit = '', value: number | null = null): Promise<number | null> {
    this.current()?.resolve(null);
    return new Promise(resolve => this.current.set({ label, unit, value, resolve }));
  }

  close(raw: string | null): void {
    const p = this.current();
    if (!p) return;
    this.current.set(null);
    const v = raw === null ? Number.NaN : parseFloat(raw.replace(',', '.'));
    p.resolve(Number.isFinite(v) ? v : null);
  }

  confirm(title: string, message: string, yes = 'Yes', no = 'Not now'): Promise<boolean> {
    this.confirmation()?.resolve(false);
    return new Promise(resolve => this.confirmation.set({ title, message, yes, no, resolve }));
  }

  choose(title: string, options: ChoiceOption[], message: string | null = null): Promise<string | null> {
    this.choice()?.resolve(null);
    return new Promise(resolve => this.choice.set({ title, message, options, resolve }));
  }

  pick(key: string | null): void {
    const c = this.choice();
    if (!c) return;
    this.choice.set(null);
    c.resolve(key);
  }

  answer(ok: boolean): void {
    const c = this.confirmation();
    if (!c) return;
    this.confirmation.set(null);
    c.resolve(ok);
  }
}
