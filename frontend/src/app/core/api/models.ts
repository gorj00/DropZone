export type Path = 'LOSE' | 'GAIN';
export type Metric = 'WEIGHT' | 'STRENGTH' | 'SIZE';
export type Theme = 'NEON' | 'STEALTH';
export type WeightUnit = 'KG' | 'LB';
export type LengthUnit = 'CM' | 'IN';
export type UnlockMode = 'WHOLE_DAY' | 'MINUTES';
export type Verification = 'AI' | 'COMMUNITY';
export type CheckpointStatus = 'LOCKED' | 'ACTIVE' | 'PENDING_VERIFICATION' | 'CLEARED';
export type QuestGroup = 'BURN_FUEL' | 'BEAT_BINGE' | 'BUILD_FUEL' | 'RECOVERY';
export type ProofType = 'PHOTO' | 'AUTO' | 'REPS' | 'CHECKIN' | 'LOG' | 'NONE';
export type AutoSource = 'STEPS' | 'SLEEP';
export type Exercise = 'SQUAT' | 'PUSHUP';
export type QuestStatus = 'TODO' | 'PENDING' | 'DONE';
export type FeedScope = 'FRIENDS' | 'EVERYONE' | 'TO_VERIFY';
export type FeedType = 'QUEST_PROOF' | 'CHECKPOINT_PROOF' | 'CHECKPOINT_CLEARED' | 'TRANSFORMATION';
export type TransformationLayout = 'SPLIT' | 'SLIDESHOW';
export type PostVisibility = 'PRIVATE' | 'FRIENDS' | 'EVERYONE';
export type NotificationType = 'COMMENT' | 'COMMENT_REPLY' | 'COMMENT_LIKE' | 'HYPE' | 'VERIFY' | 'PROOF_VERIFIED' | 'FRIEND_REQUEST' | 'FRIEND_ACCEPTED' | 'TRIAL_ENDING' | 'PROOF_REJECTED' | 'ADMIN_REPORT'
  | 'TRIAL_ENDED' | 'BILLING_ISSUE' | 'PRO_ENDED' | 'PRO_BACK' | 'LIFETIME_PRO';
export type ReportTarget = 'POST' | 'COMMENT' | 'USER';
export type ProofStatus = 'PENDING' | 'VERIFIED' | 'REJECTED' | 'WITHDRAWN';
export type HiddenReason = 'FRIENDS_ONLY' | 'UNDER_REVIEW' | 'REMOVED';
export type ModerationState = 'UNDER_REVIEW' | 'REMOVED';
export type CheckAudience = 'FRIENDS' | 'EVERYONE';
export type Period = 'WEEK' | 'MONTH' | 'HALF_YEAR';

export interface User {
  id: string;
  email: string;
  displayName: string;
  handle: string;
  avatarUrl: string | null;
  theme: Theme;
  path: Path | null;
  pro: boolean;
  proExpiresAt: string | null;
  unlockMode: UnlockMode;
  minutesPerQuest: number;
  publicByDefault: boolean;
  defaultVerification: Verification;
  slipUpTracking: boolean;
  lockedApps: string[];
  onboarded: boolean;
  streak: number;
  bestStreak: number;
  inviteCode: string;
  timezone: string;
  trial: boolean;
  trialEndsAt: string | null;
  weightUnit: WeightUnit;
  lengthUnit: LengthUnit;
  admin: boolean;
  bio: string | null;
  trialEndPending?: boolean;
  consentRequired?: boolean;
  suspended?: boolean;
  willRenew?: boolean;
  proProductId?: string | null;
  billingIssue?: boolean;
  billingHold?: boolean;
  pendingPlanId?: string | null;
  pendingPlanAt?: string | null;
  proEndPending?: boolean;
  skipRestDays?: boolean;
  hiddenFromSearch?: boolean;
  hiddenFromLeaderboards?: boolean;
  verifyRequestPushes?: boolean;
  commentPushes?: boolean;
  shareStats?: boolean;
}

export interface AppConfig {
  minVersionCode: number;
  termsVersion: string;
  privacyVersion: string;
  termsUrl: string | null;
  privacyUrl: string | null;
  deleteAccountUrl: string | null;
}

export interface UserSummary {
  id: string;
  displayName: string;
  handle: string;
  avatarUrl: string | null;
  path: Path | null;
  bio?: string | null;
}

export interface HandleCheck {
  handle: string;
  valid: boolean;
  available: boolean;
  message: string | null;
}

export interface PhotoCredit {
  name: string;
  link: string;
}

export interface Checkpoint {
  id: string;
  index: number;
  targetValue: number;
  deltaToEarn: number;
  rewardTitle: string | null;
  rewardImageUrl: string | null;
  rewardImageCredit?: PhotoCredit | null;
  isPublic: boolean;
  visibility?: PostVisibility;
  verification: Verification;
  deadline: string | null;
  status: CheckpointStatus;
  clearedAt: string | null;
  proofId: string | null;
  verifiedCount: number;
  requiredVerifications: number;
  overdue?: boolean;
  aiChecked?: boolean;
  moderation?: ModerationState | null;
}

export interface Goal {
  id: string;
  path: Path;
  metric: Metric;
  metricLabel: string | null;
  unit: 'kg' | 'cm';
  startValue: number;
  goalValue: number;
  currentValue: number;
  progressValue: number;
  totalValue: number;
  checkpoints: Checkpoint[];
  reached?: boolean;
}

export interface PastGoal {
  id: string;
  path: Path;
  metric: Metric;
  metricLabel: string | null;
  unit: 'kg' | 'cm';
  startValue: number;
  goalValue: number;
  endValue: number;
  startedAt: string;
  endedAt: string | null;
  reachedAt: string | null;
  reached: boolean;
  milestones: number;
  milestonesCleared: number;
}

export interface NewGoalRequest {
  goalValue: number;
  checkpoints: number;
  metric?: Metric;
  metricLabel?: string | null;
  unit?: 'kg' | 'cm';
  startValue?: number;
}

export interface QuestType {
  code: string;
  path: Path;
  name: string;
  icon: string;
  group: QuestGroup;
  proof: ProofType;
  free: boolean;
  autoSource: AutoSource | null;
  target: number | null;
  multiSlot: boolean;
  defaultDays: number[];
  defaultPerDay: number;
}

export interface UserQuest {
  id: string;
  code: string | null;
  name: string;
  icon: string;
  group: QuestGroup;
  proof: ProofType;
  autoSource: AutoSource | null;
  target: number | null;
  custom: boolean;
  days: number[];
  squadCheck: boolean;
  perDay: number;
  multiSlot: boolean;
  checkAudience?: CheckAudience;
}

export interface QuestSettings {
  code: string;
  days?: number[];
  perDay?: number;
  target?: number;
}

export interface QuestPatch {
  squadCheck?: boolean;
  checkAudience?: CheckAudience;
  days?: number[];
  perDay?: number;
  target?: number;
}

export interface TodayQuest {
  quest: UserQuest;
  status: QuestStatus;
  progress: number | null;
  target: number | null;
  completionId: string | null;
  proofId: string | null;
  verifiedCount: number;
  requiredVerifications: number;
  summary: string | null;
  value: number | null;
  slot: number;
  slots: number;
}

export interface Today {
  date: string;
  quests: TodayQuest[];
  doneCount: number;
  totalCount: number;
  unlocked: boolean;
  unlockedUntil: string | null;
  minutesEarned: number;
  streak: number;
  friendsCleared: { count: number; total: number; avatars: string[] } | null;
}

export interface Proof {
  id: string;
  kind: 'QUEST' | 'CHECKPOINT';
  photoUrl: string;
  value: number | null;
  mlLabels: string[];
  mlText: string | null;
  status: ProofStatus;
  verifiedCount: number;
  requiredVerifications: number;
  createdAt: string;
}

export interface FeedItem {
  id: string;
  type: FeedType;
  user: UserSummary;
  createdAt: string;
  photoUrl: string | null;
  title: string;
  subtitle: string | null;
  deltaValue: number | null;
  value: number | null;
  unit: string | null;
  proofId: string | null;
  verification: { required: number; count: number; verifiedByMe: boolean; canVerify: boolean } | null;
  hypeCount: number;
  hypedByMe: boolean;
  commentCount: number;
  transformation: TransformationView | null;
  hidden: boolean;
  aiChecked: boolean;
  isPublic: boolean;
  moderation?: ModerationState | null;
}

export interface TransformationView {
  layout: TransformationLayout;
  beforeUrl: string;
  afterUrl: string;
  beforeCaption: string | null;
  afterCaption: string | null;
}

export interface Transformation extends TransformationView {
  id: string;
  visibility: PostVisibility;
  createdAt: string;
  updatedAt: string;
  feedItemId: string | null;
  commentCount: number;
  hypeCount: number;
  removedByModerator?: boolean;
  moderation?: ModerationState | null;
}

export interface TransformationRequest {
  beforeUrl?: string;
  afterUrl?: string;
  beforeCaption?: string;
  afterCaption?: string;
  layout?: TransformationLayout;
  visibility?: PostVisibility;
}

export interface FeedComment {
  id: string;
  feedItemId: string;
  user: UserSummary;
  body: string;
  createdAt: string;
  mine: boolean;
  likeCount: number;
  likedByMe: boolean;
  canDelete: boolean;
  parentId?: string | null;
}

export interface DailyLog {
  id: string;
  day: string;
  quest: UserQuest;
  status: QuestStatus;
  slot: number;
  slots: number;
  value: number | null;
  reps: number | null;
  summary: string | null;
  createdAt: string;
  photoUrl: string | null;
  proofId: string | null;
  verifiedCount: number;
  requiredVerifications: number;
  feedItemId: string | null;
}

export interface DailyLogDetail {
  log: DailyLog;
  mlLabels: string[];
  mlText: string | null;
  proofStatus: ProofStatus | null;
  verifiers: UserSummary[];
}

export interface DayLogs {
  date: string;
  doneCount: number;
  totalCount: number;
  logs: DailyLog[];
}

export interface AppNotification {
  id: string;
  type: NotificationType;
  actor: UserSummary | null;
  feedItemId: string | null;
  proofId: string | null;
  commentId: string | null;
  text: string | null;
  read: boolean;
  createdAt: string;
}

export interface ReportedItem {
  targetType: ReportTarget;
  targetId: string;
  reportCount: number;
  hidden: boolean;
  reasons: string[];
  lastReportedAt: string;
  author: UserSummary | null;
  preview: string;
  photoUrl: string | null;
  feedItemId: string | null;
}

export interface ReportEntry {
  targetType: ReportTarget;
  targetId: string;
  reporter: UserSummary | null;
  reason: string | null;
  createdAt: string;
}

export interface AdminUser {
  user: UserSummary;
  email: string;
  createdAt: string;
  suspended: boolean;
  suspendedAt: string | null;
  strikes: number;
  reports: ReportEntry[];
}

export interface AdminPost {
  id: string;
  type: FeedType;
  user: UserSummary | null;
  createdAt: string;
  title: string;
  subtitle: string | null;
  photoUrl: string | null;
  photos: string[];
  transformation: TransformationView | null;
  hidden: boolean;
  isPublic: boolean;
  proofId: string | null;
  proofStatus: ProofStatus | null;
  mlLabels: string[];
  mlText: string | null;
}

export interface AdminComment {
  id: string;
  user: UserSummary | null;
  body: string;
  createdAt: string;
  hidden: boolean;
}

export interface AdminReport {
  targetType: ReportTarget;
  targetId: string;
  reportCount: number;
  hidden: boolean;
  reports: ReportEntry[];
  post: AdminPost | null;
  comment: AdminComment | null;
  user: AdminUser | null;
}

export interface LeaderboardEntry {
  rank: number;
  user: UserSummary;
  delta: number;
  unit: string;
  percent?: number | null;
}

export interface Leaderboard {
  period: Period;
  path: Path;
  metric: Metric;
  unit: string;
  endsAt: string;
  entries: LeaderboardEntry[];
  me: LeaderboardEntry | null;
}

export interface StatsDay {
  date: string;
  questLevel: number;
  slipUps: number;
  future: boolean;
}

export interface Measurement {
  id: string;
  metric: Metric;
  day: string;
  value: number;
  createdAt: string;
}

export interface GoalHistory {
  start: string;
  points: { day: string; value: number }[];
}

export interface PhotoResult {
  id: string;
  url: string;
  thumb: string;
  credit: PhotoCredit | null;
}

export interface Stats {
  month: string;
  days: StatsDay[];
  clearedPct: number;
  bestStreak: number;
  questsDone: number;
  slipUpCount: number;
  slipUpChangePct: number | null;
  cleanDays: number;
  topSlipUps: { type: string; name: string; count: number }[];
}

export interface SlipUpType {
  code: string;
  name: string;
  icon: string;
  custom: boolean;
}

export interface SlipUp {
  id: string;
  type: string;
  name: string;
  icon: string;
  occurredAt: string;
  note: string | null;
}

export type Relation = 'SELF' | 'FRIEND' | 'REQUESTED' | 'INCOMING' | 'NONE';

export interface UserProfile {
  user: UserSummary;
  relation: Relation;
  requestId: string | null;
}

export interface ProofView {
  id: string;
  kind: 'QUEST' | 'CHECKPOINT';
  status: ProofStatus;
  owner: UserSummary;
  relation: Relation;
  visible: boolean;
  post: ProofPost | null;
  reason: HiddenReason | null;
  moderation?: ModerationState | null;
  useAiFrom?: string | null;
}

export type ProofPost = Omit<FeedItem, 'id'> & { id: string | null };

export interface People {
  count: number;
  users: UserSummary[];
}

export interface CheckpointSocial {
  hypes: People;
  alsoChasing: People;
}

export interface InviteResult {
  user: UserSummary;
  relation: 'REQUESTED' | 'FRIEND';
}

export interface FriendRequest {
  id: string;
  from: UserSummary;
  to: UserSummary;
  createdAt: string;
}

export interface Page<T> {
  items: T[];
  next: string | null;
}

export interface ApiError {
  status: number;
  code: 'PRO_REQUIRED' | 'NOT_FOUND' | 'VALIDATION' | 'FORBIDDEN' | 'CONFLICT' | string;
  message: string;
}

export interface OnboardingRequest {
  path: Path;
  metric: Metric;
  metricLabel?: string | null;
  unit: 'kg' | 'cm';
  startValue: number;
  goalValue: number;
  checkpoints: number;
  questCodes: string[];
  lockedApps: string[];
  unlockMode: UnlockMode;
  questSettings?: QuestSettings[];
  weightUnit?: WeightUnit;
  lengthUnit?: LengthUnit;
}

export interface CompleteQuestRequest {
  date: string;
  photoUrl?: string;
  value?: number;
  reps?: number;
  exercise?: Exercise;
  mlLabels?: string[];
  mlText?: string;
  slot?: number;
}

export interface CustomQuestRequest {
  name: string;
  icon: string;
  proof: ProofType;
  group: QuestGroup;
  days: number[];
  squadCheck: boolean;
  checkAudience?: CheckAudience;
}

export type UserPatch = Partial<Pick<User, 'displayName' | 'handle' | 'theme' | 'unlockMode' | 'minutesPerQuest' | 'publicByDefault' | 'defaultVerification' | 'slipUpTracking' | 'timezone' | 'weightUnit' | 'lengthUnit' | 'bio' | 'skipRestDays' | 'hiddenFromSearch' | 'hiddenFromLeaderboards' | 'verifyRequestPushes' | 'commentPushes' | 'shareStats'>> & { avatarUrl?: string; trialEndAcknowledged?: boolean; proEndAcknowledged?: boolean; region?: { source: string; value: string; eu: boolean } };

export type CheckpointPatch = Partial<Pick<Checkpoint, 'rewardTitle' | 'rewardImageUrl' | 'rewardImageCredit' | 'isPublic' | 'visibility' | 'verification' | 'deadline' | 'targetValue'>>;

export type GoalPatch = Partial<Pick<Goal, 'startValue' | 'goalValue'>>;
