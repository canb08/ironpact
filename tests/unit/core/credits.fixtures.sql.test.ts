import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

interface CreditGenerator {
  loadCreditFixtures: () => readonly { name: string; file: string }[];
  renderCreditFixturesSql: (fixtures: readonly { name: string; file: string }[]) => string;
}

function asGenerator(value: unknown): CreditGenerator {
  if (typeof value !== 'object' || value === null) throw new Error('credit fixture generator missing');
  const loadCreditFixtures = Reflect.get(value, 'loadCreditFixtures') as unknown;
  const renderCreditFixturesSql = Reflect.get(value, 'renderCreditFixturesSql') as unknown;
  if (typeof loadCreditFixtures !== 'function' || typeof renderCreditFixturesSql !== 'function') {
    throw new Error('credit fixture generator missing');
  }
  return {
    loadCreditFixtures: loadCreditFixtures as CreditGenerator['loadCreditFixtures'],
    renderCreditFixturesSql: renderCreditFixturesSql as CreditGenerator['renderCreditFixturesSql'],
  };
}

const root = fileURLToPath(new URL('../../..', import.meta.url));
const files = readdirSync(`${root}/tests/fixtures/credits`).filter((name) => name.endsWith('.json')).sort();
const committed = readFileSync(`${root}/supabase/tests/credits_fixtures.test.sql`, 'utf8');

async function generator(): Promise<CreditGenerator> {
  const specifier = '../../../scripts/credit-fixtures.mjs';
  return asGenerator(await import(specifier));
}

it(`P3H pgTAP credit fixtures: ${files.length}`, async () => {
  const gen = await generator();
  const fixtures = gen.loadCreditFixtures();
  const sql = gen.renderCreditFixturesSql(fixtures);
  expect(fixtures.map((fixture) => fixture.file)).toEqual(files);
  expect(sql).toContain(`select plan(${files.length});`);
  expect(sql).toContain(`P3H pgTAP credit fixtures: ${files.length}`);
  expect(sql.match(/select is\(public\.week_credits\(/g)?.length).toBe(files.length);
  expect(sql).toBe(committed);
  console.log(`P3H pgTAP credit fixtures: ${files.length}`);
});
