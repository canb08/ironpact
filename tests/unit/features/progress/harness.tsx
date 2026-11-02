import '../../data/harness.ts';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { RepoProvider } from '../../../../src/app/RepoProvider.tsx';
import { createMockRemote } from '../../../../src/data/adapter.mock.ts';
import { createClock } from '../../../../src/data/clock.ts';
import { IronpactDB } from '../../../../src/data/db.ts';
import { createDataRepo } from '../../../../src/data/repo.ts';
import DayEditorScreen from '../../../../src/features/progress/DayEditorScreen.tsx';
import ExerciseDetailScreen from '../../../../src/features/progress/ExerciseDetailScreen.tsx';
import { ManualEnvironment } from '../../data/harness.ts';

export const DAY = '2026-10-24';

export async function progressHarness() {
  const instant = Date.parse('2026-10-24T12:00:00.000Z');
  const environment = new ManualEnvironment();
  environment.setOnline(true);
  const remote = createMockRemote({ now: () => instant });
  const db = new IronpactDB(`ironpact-p2e-${crypto.randomUUID()}`);
  const repo = createDataRepo(remote, {
    db,
    environment,
    autoStart: false,
    clock: createClock({ now: () => instant, timezone: () => 'Europe/Amsterdam' }),
  });
  await repo.ready;
  return {
    repo,
    db,
    render(path: string) {
      const router = createMemoryRouter([
        { path: '/day/:date', element: <DayEditorScreen /> },
        { path: '/exercise/:id', element: <ExerciseDetailScreen /> },
      ], { initialEntries: [path] });
      render(
        <RepoProvider repo={repo}>
          <RouterProvider router={router} />
        </RepoProvider>,
      );
    },
    async close() {
      repo.close();
      await db.delete();
    },
  };
}
