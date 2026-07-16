import { Route } from '@angular/router';

export const appRoutes: Route[] = [
  {
    path: '',
    loadComponent: () =>
      import('./layout/layout.component').then((m) => m.LayoutComponent),
    children: [
      { path: '', redirectTo: 'chat', pathMatch: 'full' },
      {
        path: 'chat',
        loadComponent: () =>
          import('./pages/chat/chat-page.component').then(
            (m) => m.ChatPageComponent
          ),
      },
      {
        path: 'chat/:id',
        loadComponent: () =>
          import('./pages/chat/chat-page.component').then(
            (m) => m.ChatPageComponent
          ),
      },
      {
        path: 'workflows',
        loadComponent: () =>
          import('./pages/workflows/workflows-page.component').then(
            (m) => m.WorkflowsPageComponent
          ),
      },
      {
        path: 'workflows/:id',
        loadComponent: () =>
          import('./pages/workflows/workflow-editor-page.component').then(
            (m) => m.WorkflowEditorPageComponent
          ),
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./pages/settings/settings-page.component').then(
            (m) => m.SettingsPageComponent
          ),
      },
      {
        path: 'control-panel',
        loadComponent: () =>
          import('./pages/control-panel/control-panel-page.component').then(
            (m) => m.ControlPanelPageComponent
          ),
      },
    ],
  },
];
