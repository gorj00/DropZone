import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import type {
  Account, AdminReport, AdminUser, BillingEventView, DayView, ErrorView, JobView, Overview, ReportTarget, ReportedItem, User, UserPage
} from './models';

export const API_URL = environment.apiUrl;

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = API_URL;

  private get<T>(url: string, params?: Record<string, string | number | undefined | null>): Promise<T> {
    let p = new HttpParams();
    for (const [k, v] of Object.entries(params ?? {})) if (v !== undefined && v !== null && v !== '') p = p.set(k, String(v));
    return firstValueFrom(this.http.get<T>(this.base + url, { params: p }));
  }

  private post<T>(url: string, body: unknown = {}): Promise<T> {
    return firstValueFrom(this.http.post<T>(this.base + url, body));
  }

  loginAdmin(idToken: string) { return this.post<{ token: string; user: User }>('/auth/admin', { idToken }); }
  loginDev(email: string): Promise<{ token: string; user: User }> {
    const path = environment.production ? null : environment.devLoginPath;
    if (!path) return Promise.reject(new Error('Dev sign-in is not available.'));
    return this.post<{ token: string; user: User }>(path, { email, displayName: 'Admin' });
  }
  async me(): Promise<{ user: User; token: string | null }> {
    const res = await firstValueFrom(this.http.get<User>(this.base + '/me', { observe: 'response' }));
    return { user: res.body as User, token: res.headers.get('X-Auth-Token') };
  }

  overview() { return this.get<Overview>('/admin/overview'); }
  jobs() { return this.get<JobView[]>('/admin/jobs'); }
  users(q: string, page = 0, size = 50) { return this.get<UserPage>('/admin/users', { q, page, size }); }
  account(id: string) { return this.get<Account>(`/admin/users/${id}/account`); }
  days(id: string, from?: string, to?: string) { return this.get<DayView[]>(`/admin/users/${id}/days`, { from, to }); }
  errors(limit = 100) { return this.get<ErrorView[]>('/admin/errors', { limit }); }
  billingEvents(limit = 100) { return this.get<BillingEventView[]>('/admin/billing-events', { limit }); }

  reportedItems() { return this.get<ReportedItem[]>('/admin/reports'); }
  adminReport(type: ReportTarget, id: string) { return this.get<AdminReport>(`/admin/reports/${type}/${id}`); }
  restoreReported(type: ReportTarget, id: string) { return this.post<void>(`/admin/reports/${type}/${id}/restore`); }
  removeReported(type: ReportTarget, id: string) { return this.post<void>(`/admin/reports/${type}/${id}/remove`); }
  adminUser(id: string) { return this.get<AdminUser>(`/admin/users/${id}`); }
  resetProfile(id: string) { return this.post<AdminUser>(`/admin/users/${id}/reset-profile`); }
  suspendUser(id: string) { return this.post<AdminUser>(`/admin/users/${id}/suspend`); }
  unsuspendUser(id: string) { return this.post<AdminUser>(`/admin/users/${id}/unsuspend`); }
}

export function errorMessage(e: unknown): string {
  const err = e as { status?: number; error?: { message?: string } | null; message?: string } | null;
  if (err && typeof err === 'object') {
    if (err.status === 0) return 'No connection to the server.';
    if (err.error && typeof err.error === 'object' && err.error.message) return err.error.message;
    if (err.message) return err.message;
  }
  return 'Something went wrong.';
}
