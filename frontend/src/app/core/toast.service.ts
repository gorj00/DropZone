import { Injectable, signal } from '@angular/core';
import { apiError } from './api/errors';

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly message = signal<{ text: string; error: boolean } | null>(null);
  private timer: ReturnType<typeof setTimeout> | null = null;

  show(text: string, error = false): void {
    this.message.set({ text, error });
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.message.set(null), 3200);
  }

  error(e: unknown): void {
    const err = apiError(e);
    if (err.code === 'SUSPENDED') return;
    this.show(err.message || 'Something went wrong.', true);
  }
}
