import { Routes } from '@angular/router';
import { authGuard, guestGuard, onboardingGuard, signedInGuard } from './core/auth';
import { rememberInviteGuard } from './core/invite';
import { resumeOnboardingGuard } from './features/onboarding/onboarding.state';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'today' },
  { path: 'welcome', canActivate: [guestGuard], loadComponent: () => import('./features/welcome/welcome').then(m => m.WelcomePage) },
  {
    path: 'onboarding',
    canActivate: [onboardingGuard, resumeOnboardingGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'profile' },
      { path: 'profile', loadComponent: () => import('./features/onboarding/profile').then(m => m.ProfileStepPage) },
      { path: 'path', loadComponent: () => import('./features/onboarding/path').then(m => m.PathPage) },
      { path: 'goal', loadComponent: () => import('./features/onboarding/goal').then(m => m.GoalPage) },
      { path: 'quests', loadComponent: () => import('./features/onboarding/quests').then(m => m.QuestsPage) },
      { path: 'lock', loadComponent: () => import('./features/onboarding/lock').then(m => m.LockPage) }
    ]
  },
  { path: 'camera', canActivate: [signedInGuard], loadComponent: () => import('./features/camera/camera').then(m => m.CameraPage) },
  { path: 'today', canActivate: [authGuard], loadComponent: () => import('./features/today/today').then(m => m.TodayPage) },
  { path: 'goal/edit', canActivate: [authGuard], loadComponent: () => import('./features/journey/goal-edit').then(m => m.GoalEditPage) },
  { path: 'goal/new', canActivate: [authGuard], loadComponent: () => import('./features/journey/new-goal').then(m => m.NewGoalPage) },
  { path: 'journey', canActivate: [authGuard], loadComponent: () => import('./features/journey/journey').then(m => m.JourneyPage) },
  { path: 'journey/:id', canActivate: [authGuard], loadComponent: () => import('./features/journey/checkpoint').then(m => m.CheckpointPage) },
  { path: 'journey/:id/edit', canActivate: [authGuard], loadComponent: () => import('./features/journey/checkpoint-edit').then(m => m.CheckpointEditPage) },
  { path: 'journey/:id/proof', canActivate: [authGuard], loadComponent: () => import('./features/journey/proof-live').then(m => m.ProofLivePage) },
  { path: 'journey/:id/cleared', canActivate: [authGuard], loadComponent: () => import('./features/journey/cleared').then(m => m.ClearedPage) },
  { path: 'stats', canActivate: [authGuard], loadComponent: () => import('./features/stats/stats').then(m => m.StatsPage) },
  { path: 'log/:id', canActivate: [authGuard], loadComponent: () => import('./features/log/log').then(m => m.DailyLogPage) },
  { path: 'logs/:date', canActivate: [authGuard], loadComponent: () => import('./features/log/day').then(m => m.DayLogsPage) },
  { path: 'stats/custom-quest', canActivate: [authGuard], loadComponent: () => import('./features/stats/custom-quest').then(m => m.CustomQuestPage) },
  { path: 'squad', canActivate: [authGuard], loadComponent: () => import('./features/squad/squad').then(m => m.SquadPage) },
  { path: 'squad/friends', canActivate: [authGuard], loadComponent: () => import('./features/squad/friends').then(m => m.FriendsPage) },
  { path: 'p/:id', canActivate: [signedInGuard], loadComponent: () => import('./features/squad/proof').then(m => m.ProofPage) },
  { path: 'u/:id', canActivate: [authGuard], loadComponent: () => import('./features/squad/user').then(m => m.UserPage) },
  { path: 'post/:id', canActivate: [authGuard], loadComponent: () => import('./features/squad/post').then(m => m.PostPage) },
  { path: 'notifications', canActivate: [authGuard], loadComponent: () => import('./features/notifications/notifications').then(m => m.NotificationsPage) },
  { path: 'invite/:code', canActivate: [rememberInviteGuard, authGuard], loadComponent: () => import('./features/squad/invite').then(m => m.InvitePage) },
  { path: 'me', canActivate: [authGuard], loadComponent: () => import('./features/profile/profile').then(m => m.ProfilePage) },
  { path: 'me/transformations/new', canActivate: [authGuard], loadComponent: () => import('./features/profile/transformation-edit').then(m => m.TransformationEditPage) },
  { path: 'me/transformations/:id', canActivate: [authGuard], loadComponent: () => import('./features/profile/transformation-edit').then(m => m.TransformationEditPage) },
  { path: 'admin/reports', canActivate: [authGuard], loadComponent: () => import('./features/admin/reports').then(m => m.ReportsPage) },
  { path: 'admin/reports/:type/:id', canActivate: [authGuard], loadComponent: () => import('./features/admin/report-detail').then(m => m.ReportDetailPage) },
  { path: 'admin/users/:id', canActivate: [authGuard], loadComponent: () => import('./features/admin/user').then(m => m.AdminUserPage) },
  { path: 'settings', canActivate: [authGuard], loadComponent: () => import('./features/settings/settings').then(m => m.SettingsPage) },
  { path: 'trial', canActivate: [authGuard], loadComponent: () => import('./features/trial/trial').then(m => m.TrialPage) },
  { path: 'trial-ended', canActivate: [signedInGuard], loadComponent: () => import('./features/trial/trial-ended').then(m => m.TrialEndedPage) },
  { path: 'pro-ended', canActivate: [signedInGuard], data: { kind: 'PRO' }, loadComponent: () => import('./features/trial/trial-ended').then(m => m.TrialEndedPage) },
  { path: 'paywall', canActivate: [signedInGuard], loadComponent: () => import('./features/paywall/paywall').then(m => m.PaywallPage) },
  { path: '**', loadComponent: () => import('./features/not-found/not-found').then(m => m.NotFoundPage) }
];
