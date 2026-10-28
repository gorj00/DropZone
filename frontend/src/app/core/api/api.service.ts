import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AdminReport, AdminUser, AppConfig, AppNotification, Page, Checkpoint, CheckpointPatch, DailyLogDetail, DayLogs, CheckpointSocial, CompleteQuestRequest, CustomQuestRequest, FeedComment, FeedItem,
  FeedScope, FriendRequest, Goal, GoalHistory, GoalPatch, HandleCheck, InviteResult, Leaderboard, Measurement, NewGoalRequest, OnboardingRequest, PastGoal, Period, PhotoResult, ProofView, QuestPatch, QuestSettings, QuestType,
  ReportedItem, ReportTarget, SlipUp, SlipUpType, Stats, Today, TodayQuest, Transformation, TransformationRequest, User, UserPatch,
  UserQuest, UserSummary
} from './models';

export const API_URL = Capacitor.getPlatform() === 'android' ? environment.androidApiUrl : environment.apiUrl;

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = API_URL;

  private get<T>(url: string, params?: Record<string, string | number | undefined>): Promise<T> {
    return firstValueFrom(this.http.get<T>(this.base + url, { params: this.params(params) }));
  }
  private async page<T>(url: string, params: Record<string, string | number | undefined>): Promise<Page<T>> {
    const res = await firstValueFrom(this.http.get<T[]>(this.base + url, { params: this.params(params), observe: 'response' }));
    return { items: res.body ?? [], next: res.headers.get('X-Next-Cursor') || null };
  }
  private params(params?: Record<string, string | number | undefined>): HttpParams {
    let p = new HttpParams();
    for (const [k, v] of Object.entries(params ?? {})) if (v !== undefined && v !== null) p = p.set(k, String(v));
    return p;
  }
  private post<T>(url: string, body: unknown = {}): Promise<T> {
    return firstValueFrom(this.http.post<T>(this.base + url, body));
  }
  private put<T>(url: string, body: unknown): Promise<T> {
    return firstValueFrom(this.http.put<T>(this.base + url, body));
  }
  private patch<T>(url: string, body: unknown): Promise<T> {
    return firstValueFrom(this.http.patch<T>(this.base + url, body));
  }
  private delete<T>(url: string): Promise<T> {
    return firstValueFrom(this.http.delete<T>(this.base + url));
  }

  loginGoogle(idToken: string) { return this.post<{ token: string; user: User }>('/auth/google', { idToken }); }
  loginDev(email: string, displayName: string): Promise<{ token: string; user: User }> {
    const path = environment.production ? null : environment.devLoginPath;
    if (!path) return Promise.reject(new Error('Dev sign-in is not available.'));
    return this.post<{ token: string; user: User }>(path, { email, displayName });
  }

  async me(): Promise<{ user: User; token: string | null }> {
    const res = await firstValueFrom(this.http.get<User>(this.base + '/me', { observe: 'response' }));
    return { user: res.body as User, token: res.headers.get('X-Auth-Token') };
  }
  config() { return this.get<AppConfig>('/config'); }
  acceptConsent(termsVersion: string, privacyVersion: string) { return this.post<User>('/me/consent', { termsVersion, privacyVersion, ageConfirmed: true }); }
  async exportData(): Promise<{ json: string; filename: string | null }> {
    const res = await firstValueFrom(this.http.get(this.base + '/me/export', { observe: 'response', responseType: 'text' }));
    const name = /filename="?([^";]+)"?/i.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? null;
    return { json: res.body ?? '', filename: name };
  }
  signOutEverywhere() { return this.post<void>('/me/sign-out-everywhere'); }
  deleteAccount() { return this.delete<void>('/me'); }
  updateMe(patch: UserPatch) { return this.patch<User>('/me', patch); }
  setPushToken(token: string) { return this.put<void>('/me/push-token', { token }); }
  removePushToken(token: string) { return firstValueFrom(this.http.delete<void>(this.base + '/me/push-token', { body: { token } })); }
  setLockedApps(packages: string[]) { return this.put<User>('/me/locked-apps', { packages }); }
  refreshBilling() { return this.post<User>('/billing/refresh'); }

  onboard(req: OnboardingRequest) { return this.post<{ user: User; goal: Goal }>('/onboarding', req); }

  goal() { return this.get<Goal>('/goal'); }
  updateGoal(patch: GoalPatch) { return this.patch<Goal>('/goal', patch); }
  newGoal(req: NewGoalRequest) { return this.post<Goal>('/goal', req); }
  pastGoals() { return this.get<PastGoal[]>('/goals/history'); }
  applyGoalDefaults() { return this.post<{ count: number }>('/goal/apply-defaults'); }
  handleAvailable(handle: string) { return this.post<HandleCheck>('/users/handle-available', { handle }); }
  goalHistory() { return this.get<GoalHistory>('/goal/history'); }
  logGoalProgress(value: number, date?: string) { return this.post<Goal>('/goal/progress', { value, date }); }
  measurements() { return this.get<Measurement[]>('/measurements'); }
  deleteMeasurement(id: string) { return this.delete<void>(`/measurements/${id}`); }
  checkpointSocial(id: string) { return this.get<CheckpointSocial>(`/checkpoints/${id}/social`); }
  updateCheckpoint(id: string, patch: CheckpointPatch) { return this.patch<Checkpoint>(`/checkpoints/${id}`, patch); }
  submitCheckpointProof(id: string, body: { photoUrl: string; value: number; mlLabels?: string[]; mlText?: string }) {
    return this.post<Checkpoint>(`/checkpoints/${id}/proof`, body);
  }

  upload(file: Blob, name = 'photo.jpg') {
    const form = new FormData();
    form.append('file', file, name);
    return this.post<{ url: string }>('/uploads', form);
  }
  searchPhotos(q: string) { return this.post<PhotoResult[]>('/photos/search', { q }); }
  trackPhotoDownload(id: string) { return this.post<void>(`/photos/${id}/download`); }

  catalog() { return this.get<QuestType[]>('/quests/catalog'); }
  quests() { return this.get<UserQuest[]>('/quests'); }
  setQuests(codes: string[], settings?: QuestSettings[]) { return this.put<UserQuest[]>('/quests', { codes, settings }); }
  addCustomQuest(req: CustomQuestRequest) { return this.post<UserQuest>('/quests/custom', req); }
  updateQuest(id: string, patch: QuestPatch) { return this.patch<UserQuest>(`/quests/${id}`, patch); }
  deleteQuest(id: string) { return this.delete<void>(`/quests/${id}`); }

  today(date?: string) { return this.get<Today>('/today', { date }); }
  completeQuest(userQuestId: string, req: CompleteQuestRequest) { return this.post<TodayQuest>(`/quests/${userQuestId}/complete`, req); }
  weighIn(body: { date: string; value: number; photoUrl?: string; mlText?: string }) {
    return this.post<{ id: string; date: string; value: number }>('/weigh-ins', body);
  }
  deleteWeighIn(day: string) { return this.delete<void>(`/weigh-ins/${day}`); }

  friends() { return this.get<UserSummary[]>('/social/friends'); }
  searchUsers(q: string) { return this.post<UserSummary[]>('/social/search', { q }); }
  friendRequests() { return this.get<{ incoming: FriendRequest[]; outgoing: FriendRequest[] }>('/social/requests'); }
  sendFriendRequest(userId: string) { return this.post<FriendRequest>('/social/requests', { userId }); }
  acceptFriendRequest(id: string) { return this.post<UserSummary>(`/social/requests/${id}/accept`); }
  deleteFriendRequest(id: string) { return this.delete<void>(`/social/requests/${id}`); }
  removeFriend(userId: string) { return this.delete<void>(`/social/friends/${userId}`); }
  invite() { return this.get<{ code: string; url: string }>('/social/invite'); }
  acceptInvite(code: string) { return this.post<InviteResult>(`/social/invite/${code}/accept`); }

  feed(scope: FeedScope, cursor?: string, limit = 20) { return this.page<FeedItem>('/feed', { scope, cursor, limit }); }
  updateFeedItem(feedId: string, patch: { isPublic: boolean }) { return this.patch<FeedItem>(`/feed/${feedId}`, patch); }
  deleteFeedItem(feedId: string) { return this.delete<void>(`/feed/${feedId}`); }
  pendingCount() { return this.get<{ count: number }>('/feed/pending-count'); }
  proof(proofId: string) { return this.get<ProofView>(`/proofs/${proofId}`); }
  verifyProof(proofId: string) { return this.post<FeedItem>(`/proofs/${proofId}/verify`); }
  withdrawProof(proofId: string) { return this.post<ProofView>(`/proofs/${proofId}/withdraw`); }
  useAiCheck(proofId: string) { return this.post<ProofView>(`/proofs/${proofId}/use-ai`); }
  hype(feedId: string) { return this.post<FeedItem>(`/feed/${feedId}/hype`); }
  feedItem(feedId: string) { return this.get<FeedItem>(`/feed/${feedId}`); }
  comments(feedId: string) { return this.get<FeedComment[]>(`/feed/${feedId}/comments`); }
  addComment(feedId: string, body: string) { return this.post<FeedComment>(`/feed/${feedId}/comments`, { body }); }
  deleteComment(id: string) { return this.delete<void>(`/comments/${id}`); }
  likeComment(id: string) { return this.post<FeedComment>(`/comments/${id}/like`); }
  dayLogs(date: string) { return this.get<DayLogs>(`/logs?date=${date}`); }
  dailyLog(id: string) { return this.get<DailyLogDetail>(`/logs/${id}`); }

  transformations() { return this.get<Transformation[]>('/transformations'); }
  addTransformation(req: TransformationRequest) { return this.post<Transformation>('/transformations', req); }
  updateTransformation(id: string, req: TransformationRequest) { return this.patch<Transformation>(`/transformations/${id}`, req); }
  deleteTransformation(id: string) { return this.delete<void>(`/transformations/${id}`); }

  notifications(cursor?: string, limit = 30) { return this.page<AppNotification>('/notifications', { cursor, limit }); }
  unreadNotifications() { return this.get<{ count: number }>('/notifications/unread-count'); }
  markNotificationsRead(ids?: string[]) { return this.post<void>('/notifications/read', { ids }); }

  report(targetType: ReportTarget, targetId: string, reason?: string) { return this.post<void>('/reports', { targetType, targetId, reason }); }
  blocked() { return this.get<UserSummary[]>('/blocks'); }
  block(userId: string) { return this.post<void>(`/blocks/${userId}`); }
  unblock(userId: string) { return this.delete<void>(`/blocks/${userId}`); }
  reportedItems() { return this.get<ReportedItem[]>('/admin/reports'); }
  restoreReported(type: ReportTarget, id: string) { return this.post<void>(`/admin/reports/${type}/${id}/restore`); }
  removeReported(type: ReportTarget, id: string) { return this.post<void>(`/admin/reports/${type}/${id}/remove`); }
  adminReport(type: ReportTarget, id: string) { return this.get<AdminReport>(`/admin/reports/${type}/${id}`); }
  adminUser(id: string) { return this.get<AdminUser>(`/admin/users/${id}`); }
  resetProfile(id: string) { return this.post<AdminUser>(`/admin/users/${id}/reset-profile`); }
  suspendUser(id: string) { return this.post<AdminUser>(`/admin/users/${id}/suspend`); }
  unsuspendUser(id: string) { return this.post<AdminUser>(`/admin/users/${id}/unsuspend`); }

  leaderboard(period: Period) { return this.get<Leaderboard>('/leaderboard', { period }); }

  stats(month: string) { return this.get<Stats>('/stats', { month }); }
  slipUpTypes() { return this.get<SlipUpType[]>('/slip-ups/types'); }
  addSlipUpType(body: { name: string; icon: string }) { return this.post<SlipUpType>('/slip-ups/types', body); }
  deleteSlipUpType(code: string) { return this.delete<void>(`/slip-ups/types/${code}`); }
  logSlipUp(body: { type: string; occurredAt?: string; note?: string }) { return this.post<SlipUp>('/slip-ups', body); }
  slipUps(date: string) { return this.get<SlipUp[]>('/slip-ups', { date }); }
  deleteSlipUp(id: string) { return this.delete<void>(`/slip-ups/${id}`); }
}
