import 'fake-indexeddb/auto';
import { createClock } from '../../../../src/data/clock.ts';
import { IronpactDB } from '../../../../src/data/db.ts';
import { createMockRemote } from '../../../../src/data/adapter.mock.ts';
import { createDataRepo } from '../../../../src/data/repo.ts';
import { ManualEnvironment } from '../../data/harness.ts';

export async function mockRepo() {
  const now = () => Date.parse('2026-10-25T12:00:00Z');
  const remote = createMockRemote({ now });
  const db = new IronpactDB(`ironpact-b6-${crypto.randomUUID()}`);
  const environment = new ManualEnvironment();
  environment.setOnline(true);
  const repo = createDataRepo(remote, {
    db, clock: createClock({ now, timezone: () => 'Europe/Amsterdam' }), environment, autoStart: false,
  });
  await repo.ready;
  await repo.sync.pullNow();
  return { repo, remote, db, environment, async close() { repo.close(); await db.delete(); } };
}
