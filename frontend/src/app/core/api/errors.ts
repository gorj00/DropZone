import { HttpErrorResponse } from '@angular/common/http';
import { ApiError } from './models';

export function apiError(e: unknown): ApiError {
  if (e instanceof HttpErrorResponse) {
    const body = e.error as Partial<ApiError> | null;
    if (body && typeof body === 'object' && body.code) return { status: e.status, code: body.code, message: body.message ?? '' };
    if (e.status === 0) return { status: 0, code: 'NETWORK', message: 'No connection to the server.' };
    return { status: e.status, code: String(e.status), message: e.message };
  }
  return { status: -1, code: 'UNKNOWN', message: e instanceof Error ? e.message : 'Something went wrong.' };
}

export function isProRequired(e: unknown): boolean {
  return apiError(e).code === 'PRO_REQUIRED';
}
