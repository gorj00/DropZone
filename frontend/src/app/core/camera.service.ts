import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AiCheckTarget } from './ai-check';
import { Exercise, ScaleUnit } from './native/vision';

export type CameraMode = 'PHOTO' | 'WEIGH_IN' | 'REPS';

export interface CameraRequest {
  mode: CameraMode;
  title: string;
  exercise?: Exercise;
  targetReps?: number;
  expected?: number | null;
  unit?: ScaleUnit;
  check?: AiCheckTarget;
}

export interface CameraResult {
  dataUrl: string;
  labels: string[];
  text: string | null;
  number: number | null;
  reps: number | null;
  exercise?: Exercise;
}

@Injectable({ providedIn: 'root' })
export class CameraService {
  private readonly router = inject(Router);
  readonly request = signal<CameraRequest | null>(null);
  private resolver: ((r: CameraResult | null) => void) | null = null;
  private returnUrl = '/today';

  open(req: CameraRequest): Promise<CameraResult | null> {
    this.resolver?.(null);
    this.request.set(req);
    this.returnUrl = this.router.url;
    void this.router.navigateByUrl('/camera');
    return new Promise(resolve => (this.resolver = resolve));
  }

  finish(result: CameraResult | null): void {
    const r = this.resolver;
    this.resolver = null;
    this.request.set(null);
    void this.router.navigateByUrl(this.returnUrl, { replaceUrl: true }).then(() => r?.(result));
  }

  cancel(): void {
    const r = this.resolver;
    this.resolver = null;
    this.request.set(null);
    r?.(null);
  }
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [head, data] = dataUrl.split(',');
  const mime = /data:(.*?);/.exec(head)?.[1] ?? 'image/jpeg';
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
