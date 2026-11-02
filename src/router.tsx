import { createBrowserRouter } from 'react-router';

// Screen implementations remain lazy; X2 owns only their layout grouping.
const screen = (load: () => Promise<{ default: React.ComponentType }>) => ({
  lazy: async () => ({ Component: (await load()).default }),
});

export const router = createBrowserRouter([
  // X2 is the explicit exception to C3: chrome stays inside the unchanged AuthGate.
  {
    lazy: async () => ({ Component: (await import('./app/shell/AppLayout.tsx')).default }),
    children: [
      { path: '/', ...screen(() => import('./features/floor/FloorScreen.tsx')) },
      { path: '/session', ...screen(() => import('./features/session/SessionScreen.tsx')) },
      { path: '/log/:kind', ...screen(() => import('./features/quicklog/QuickLogScreen.tsx')) },
      { path: '/crew', ...screen(() => import('./features/crew-feed/CrewScreen.tsx')) },
      { path: '/settings/*', ...screen(() => import('./features/settings/SettingsScreen.tsx')) },
      { path: '/settings/:section', ...screen(() => import('./features/settings/SettingsScreen.tsx')) },
      { path: '/exercise/:id', ...screen(() => import('./features/progress/ExerciseDetailScreen.tsx')) },
      { path: '/day/:date', ...screen(() => import('./features/progress/DayEditorScreen.tsx')) },
      { path: '/progress', ...screen(() => import('./features/stats/ProgressScreen.tsx')) },
    ],
  },
  { path: '/install', ...screen(() => import('./features/install/InstallGate.tsx')) },
  { path: '/sign-in', ...screen(() => import('./features/auth/SignInScreen.tsx')) },
  { path: '/crew/new', ...screen(() => import('./features/onboarding/CrewSetupScreen.tsx')) },
  { path: '/join/:code', ...screen(() => import('./features/onboarding/CrewSetupScreen.tsx')) },
  ...(import.meta.env.DEV ? [{ path: '/dev/ui', ...screen(() => import('./ui/DevUi.tsx')) }] : []),
]);
