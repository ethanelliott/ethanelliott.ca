import { Route } from '@angular/router';

export const appRoutes: Route[] = [
  {
    path: '',
    loadComponent: () =>
      import('./layout/shell.component').then((m) => m.ShellComponent),
    children: [
      { path: '', redirectTo: 'board', pathMatch: 'full' },
      {
        path: 'board',
        loadComponent: () =>
          import('./pages/board/board.component').then((m) => m.BoardComponent),
      },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./pages/dashboard/dashboard.component').then(
            (m) => m.DashboardComponent
          ),
      },
      {
        path: 'tasks/:id',
        loadComponent: () =>
          import('./pages/task-detail/task-detail.component').then(
            (m) => m.TaskDetailComponent
          ),
      },
      {
        path: 'skill',
        loadComponent: () =>
          import('./pages/skill/skill.component').then(
            (m) => m.SkillComponent
          ),
      },
    ],
  },
  { path: '**', redirectTo: 'board' },
];
