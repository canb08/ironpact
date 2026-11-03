import '../../data/harness.ts';
import { MemoryRouter } from 'react-router';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { RepoProvider } from '../../../../src/app/RepoProvider.tsx';
import { createMockRemote } from '../../../../src/data/adapter.mock.ts';
import { createClock } from '../../../../src/data/clock.ts';
import { IronpactDB } from '../../../../src/data/db.ts';
import { createDataRepo } from '../../../../src/data/repo.ts';
import { ManualEnvironment, unwrap } from '../../data/harness.ts';

export async function sessionHarness() {
  let instant = Date.now();
  const now = () => instant;
  const remote = createMockRemote({ now });
  const environment = new ManualEnvironment();
  const db = new IronpactDB(`ironpact-session-${crypto.randomUUID()}`);
  const repo = createDataRepo(remote, { db, environment, autoStart: false,
    clock: createClock({ now, timezone: () => 'Europe/Amsterdam' }) });
  await repo.ready;
  return {
    repo, environment,
    tick: () => { instant += 1000; },
    exercise: async (name = 'Bench press', kind: 'lift' | 'bw_lift' = 'lift') => unwrap(await repo.w.createExercise({
      name, export_label: name, kind, category: 'compound', lower_body: false,
    })),
    render: (children: ReactNode) => render(<MemoryRouter><RepoProvider repo={repo}>{children}</RepoProvider></MemoryRouter>),
    close: async () => { repo.close(); await db.delete(); },
  };
}
