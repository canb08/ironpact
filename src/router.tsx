import { createBrowserRouter } from 'react-router';

// Route table is frozen (C3): each ticket replaces its own screen file, never this table.
const screen = (load: () => Promise<{ default: React.ComponentType }>) => ({
  lazy: async () => ({ Component: (await load()).default }),
});

export const router = createBrowserRouter([
  { path: '/', ...screen(() => import('./features/floor/FloorScreen.tsx')) }, // B5
  { path: '/install', ...screen(() => import('./features/install/InstallGate.tsx')) }, // B7
  { path: '/sign-in', ...screen(() => import('./features/auth/SignInScreen.tsx')) }, // B3
  { path: '/crew/new', ...screen(() => import('./features/onboarding/CrewSetupScreen.tsx')) }, // B3
  { path: '/join/:code', ...screen(() => import('./features/onboarding/CrewSetupScreen.tsx')) }, // B3
  { path: '/session', ...screen(() => import('./features/session/SessionScreen.tsx')) }, // B4
  { path: '/log/:kind', ...screen(() => import('./features/quicklog/QuickLogScreen.tsx')) }, // B5
  { path: '/crew', ...screen(() => import('./features/crew-feed/CrewScreen.tsx')) }, // B6
  { path: '/settings', ...screen(() => import('./features/settings/SettingsScreen.tsx')) }, // B6
  ...(import.meta.env.DEV ? [{ path: '/dev/ui', ...screen(() => import('./ui/DevUi.tsx')) }] : []),
]);
