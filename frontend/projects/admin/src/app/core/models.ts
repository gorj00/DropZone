import type { Path, ProofStatus, QuestStatus, ReportEntry, UserSummary } from '@dropzone/core/api/models';

export type { AdminReport, AdminUser, ReportEntry, ReportTarget, ReportedItem, User, UserSummary } from '@dropzone/core/api/models';

export interface Totals {
  users: number;
  onboarded: number;
  subscribed: number;
  trial: number;
  suspended: number;
  newLast7Days: number;
  activeLast7Days: number;
}

export interface SignupDay {
  day: string;
  count: number;
}

export interface JobView {
  name: string;
  lastRunAt: string | null;
  failedAt: string | null;
  error: string | null;
}

export interface Health {
  errorsLast5Minutes: number;
  busyLast5Minutes: number;
  databaseWaitsLast5Minutes: number;
  inFlight: number;
  poolActive: number;
  poolIdle: number;
  poolWaiting: number;
  poolMax: number;
  heapUsedMb: number;
  heapMaxMb: number;
  startedAt: string;
  version: string | null;
  commit: string | null;
  revision: string | null;
}

export interface BillingEventView {
  id: string;
  type: string;
  appUserId: string | null;
  email: string | null;
  environment: string | null;
  receivedAt: string;
}

export interface Overview {
  totals: Totals;
  signups: SignupDay[];
  jobs: JobView[];
  failedJobs: number;
  health: Health;
  openReports: number;
  errorsLast24Hours: number;
  billingEvents: BillingEventView[];
}

export interface UserRow {
  id: string;
  email: string;
  displayName: string;
  handle: string;
  avatarUrl: string | null;
  path: Path | null;
  onboarded: boolean;
  subscribed: boolean;
  trial: boolean;
  trialEndsAt: string | null;
  proExpiresAt: string | null;
  proProductId: string | null;
  suspended: boolean;
  strikes: number;
  streak: number;
  createdAt: string;
  lastSeenAt: string | null;
  timezone: string;
  admin: boolean;
}

export interface UserPage {
  items: UserRow[];
  total: number;
}

export interface Billing {
  pro: boolean;
  proExpiresAt: string | null;
  willRenew: boolean;
  proProductId: string | null;
  billingIssueAt: string | null;
  billingHold: boolean;
  pendingProductId: string | null;
  pendingSwitchAt: string | null;
  lifetimeAt: string | null;
  billingEventAt: string | null;
  proEndedAt: string | null;
  trialEndsAt: string | null;
}

export interface Consent {
  termsVersion: string | null;
  privacyVersion: string | null;
  termsAcceptedAt: string | null;
  ageConfirmedAt: string | null;
  regionSource: string | null;
  regionValue: string | null;
  regionEu: boolean | null;
  regionAt: string | null;
}

export interface CheckpointView {
  id: string;
  index: number;
  targetValue: number;
  rewardTitle: string | null;
  status: string;
  clearedAt: string | null;
  deadline: string | null;
  verification: string;
  visibility: string;
}

export interface GoalView {
  id: string;
  path: Path;
  metric: string;
  metricLabel: string | null;
  unit: string;
  startValue: number;
  goalValue: number;
  currentValue: number;
  active: boolean;
  createdAt: string;
  endedAt: string | null;
  checkpoints: CheckpointView[];
}

export interface QuestView {
  id: string;
  code: string | null;
  name: string;
  icon: string;
  group: string;
  proof: string;
  target: number | null;
  days: number[];
  perDay: number;
  custom: boolean;
  active: boolean;
  startsOn: string | null;
  createdAt: string;
}

export interface Counts {
  posts: number;
  comments: number;
  friends: number;
  days: number;
  devices: number;
}

export interface Account {
  user: UserRow;
  bio: string | null;
  weightUnit: string;
  lengthUnit: string;
  unlockMode: string;
  publicByDefault: boolean;
  defaultVerification: string;
  bestStreak: number;
  skipRestDays: boolean;
  hiddenFromSearch: boolean;
  hiddenFromLeaderboards: boolean;
  billing: Billing;
  consent: Consent;
  counts: Counts;
  goals: GoalView[];
  quests: QuestView[];
  reports: ReportEntry[];
}

export interface CompletionView {
  id: string;
  questName: string;
  questIcon: string | null;
  status: QuestStatus;
  slot: number;
  value: number | null;
  reps: number | null;
  summary: string | null;
  createdAt: string;
  photoUrl: string | null;
  proofStatus: ProofStatus | null;
}

export interface SlipUpView {
  type: string;
  occurredAt: string;
  note: string | null;
}

export interface DayView {
  day: string;
  doneCount: number | null;
  totalCount: number | null;
  proClearedAt: string | null;
  weight: number | null;
  weighInPhotoUrl: string | null;
  completions: CompletionView[];
  slipUps: SlipUpView[];
}

export interface ErrorView {
  id: string;
  at: string;
  method: string;
  path: string;
  exception: string;
  message: string | null;
  userId: string | null;
  email: string | null;
  revision: string | null;
}

export type Summary = UserSummary;
