import { Injectable, signal } from '@angular/core';
import { errorMessage } from './api';

@Injectable({ providedIn: 'root' })
export class Toast {
  readonly message = signal<{ text: string; error: boolean } | null>(null);
  private timer: ReturnType<typeof setTimeout> | null = null;

  show(text: string, error = false): void {
    this.message.set({ text, error });
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.message.set(null), error ? 5000 : 2500);
  }

  error(e: unknown): void {
    this.show(errorMessage(e), true);
  }
}
