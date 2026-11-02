import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { weekCredits } from '../../../src/core/credits.ts';
import type { CardioEntry, LocalDate, MartialEntry, MinEntry, Session, SetRow } from '../../../src/core/types.ts';

interface CreditFixture {
  name: string;
  week_start: LocalDate;
  target: number;
  sessions: Session[];
  min_entries: MinEntry[];
  sets: SetRow[];
  cardio_entries: CardioEntry[];
  martial_entries: MartialEntry[];
  expected: { credits: number; status: 'FULL' | 'HELD' | 'REST' };
}

const dir = fileURLToPath(new URL('../../fixtures/credits/', import.meta.url));
const files = readdirSync(dir).filter((name) => name.endsWith('.json')).sort();
const fixtures = files.map((file) => JSON.parse(readFileSync(`${dir}/${file}`, 'utf8')) as CreditFixture);
console.log(`P3H vitest credit fixtures: ${fixtures.length}`);

it(`P3H vitest credit fixtures: ${fixtures.length}`, () => {
  expect(fixtures.length).toBe(files.length);
  expect(new Set(fixtures.map((fixture) => fixture.name)).size).toBe(fixtures.length);
});

for (const fixture of fixtures) {
  it(fixture.name, () => {
    const result = weekCredits({
      sessions: fixture.sessions,
      sets: fixture.sets,
      cardio: fixture.cardio_entries,
      martial: fixture.martial_entries,
      min: fixture.min_entries,
    }, fixture.week_start, fixture.target);
    expect({ credits: result.credits, status: result.status }).toEqual(fixture.expected);
  });
}
