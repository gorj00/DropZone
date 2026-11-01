import { Routes } from '@angular/router';
import { adminGuard, guestGuard } from './core/session';
import { Shell } from './shell';

export const routes: Routes = [
  { path: 'login', canActivate: [guestGuard], loadComponent: () => import('./pages/login').then(m => m.LoginPage) },
  {
    path: '',
    component: Shell,
    canActivate: [adminGuard],
    children: [
      { path: '', pathMatch: 'full', loadComponent: () => import('./pages/dashboard').then(m => m.DashboardPage) },
      { path: 'users', loadComponent: () => import('./pages/users').then(m => m.UsersPage) },
      { path: 'users/:id', loadComponent: () => import('./pages/user').then(m => m.UserPage) },
      { path: 'reports', loadComponent: () => import('./pages/reports').then(m => m.ReportsPage) },
      { path: 'reports/:type/:id', loadComponent: () => import('./pages/report').then(m => m.ReportPage) },
      { path: 'jobs', loadComponent: () => import('./pages/jobs').then(m => m.JobsPage) },
      { path: 'errors', loadComponent: () => import('./pages/errors').then(m => m.ErrorsPage) },
      { path: 'billing', loadComponent: () => import('./pages/billing').then(m => m.BillingPage) }
    ]
  },
  { path: '**', redirectTo: '' }
];
