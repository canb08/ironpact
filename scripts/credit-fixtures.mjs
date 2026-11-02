import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
export const creditFixtureDir = join(repoRoot, 'tests/fixtures/credits');
export const creditFixtureSqlPath = join(repoRoot, 'supabase/tests/credits_fixtures.test.sql');

const ALICE = '10000000-0000-4000-8000-000000000001';
const USERS = new Map([
  [ALICE, 'alice@example.test'],
  ['10000000-0000-4000-8000-000000000002', 'bob@example.test'],
]);
const BENCH = '00000000-0000-4000-8000-000000000001';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const TOP_KEYS = [
  'name', 'week_start', 'target', 'sessions', 'min_entries', 'sets',
  'cardio_entries', 'martial_entries', 'expected',
];
const EXPECTED_KEYS = ['credits', 'status'];
const SESSION_KEYS = [
  'id', 'user_id', 'local_date', 'client_updated_at', 'deleted_at', 'kind', 'mode',
  'started_at', 'ended_at', 'tz', 'readiness', 'together_id', 'note',
];
const SET_KEYS = [
  'id', 'user_id', 'local_date', 'client_updated_at', 'deleted_at', 'session_id',
  'exercise_id', 'set_index', 'reps', 'weight_kg', 'rpe', 'is_warmup', 'note', 'logged_at',
];
const CARDIO_KEYS = [
  'id', 'user_id', 'local_date', 'client_updated_at', 'deleted_at', 'session_id',
  'activity', 'distance_m', 'duration_s', 'rpe', 'note', 'logged_at',
];
const MARTIAL_KEYS = [
  'id', 'user_id', 'local_date', 'client_updated_at', 'deleted_at', 'session_id',
  'discipline', 'duration_min', 'rounds', 'rpe', 'note', 'logged_at',
];
const MIN_KEYS = [
  'id', 'user_id', 'local_date', 'client_updated_at', 'deleted_at', 'session_id',
  'description', 'duration_min', 'logged_at',
];

function fail(file, message) {
  throw new Error(`${file}: ${message}`);
}

function exactKeys(value, keys, file, label) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(file, `${label} must be an object`);
  const got = Object.keys(value);
  const missing = keys.filter((key) => !got.includes(key));
  const extra = got.filter((key) => !keys.includes(key));
  if (missing.length > 0 || extra.length > 0) {
    fail(file, `${label} keys must be ${keys.join(', ')} (missing ${missing.join(', ') || 'none'}; extra ${extra.join(', ') || 'none'})`);
  }
}

function uuid(value, file, label) {
  if (typeof value !== 'string' || !UUID.test(value)) fail(file, `${label} must be a lowercase uuid`);
  return value;
}

function dateOnly(value, file, label) {
  if (typeof value !== 'string' || !DATE.test(value)) fail(file, `${label} must be YYYY-MM-DD`);
  const [year, month, day] = value.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) {
    fail(file, `${label} is not a real date`);
  }
  return value;
}

function monday(value, file) {
  const date = dateOnly(value, file, 'week_start');
  const [year, month, day] = date.split('-').map(Number);
  if (new Date(Date.UTC(year, month - 1, day)).getUTCDay() !== 1) fail(file, 'week_start must be a Monday');
  return date;
}

function instant(value, file, label, nullable) {
  if (value === null && nullable) return null;
  if (typeof value !== 'string' || !INSTANT.test(value)) fail(file, `${label} must be a UTC instant`);
  return value;
}

function text(value, file, label, nullable) {
  if (value === null && nullable) return null;
  if (typeof value !== 'string' || value.length === 0 || /[\0\r\n']/.test(value)) fail(file, `${label} must be plain text`);
  return value;
}

function integer(value, file, label, min, max, nullable) {
  if (value === null && nullable) return null;
  if (!Number.isInteger(value) || value < min || value > max) fail(file, `${label} must be an integer ${min}–${max}`);
  return value;
}

function userId(value, file, label) {
  const id = uuid(value, file, label);
  if (!USERS.has(id)) fail(file, `${label} must be alice@example.test or bob@example.test`);
  return id;
}

function sync(row, file, label) {
  uuid(row.id, file, `${label}.id`);
  userId(row.user_id, file, `${label}.user_id`);
  dateOnly(row.local_date, file, `${label}.local_date`);
  instant(row.client_updated_at, file, `${label}.client_updated_at`, false);
  instant(row.deleted_at, file, `${label}.deleted_at`, true);
}

function validateFixture(fixture, file) {
  exactKeys(fixture, TOP_KEYS, file, 'fixture');
  if (typeof fixture.name !== 'string' || fixture.name.length === 0 || /[\0\r\n']/.test(fixture.name)) {
    fail(file, 'name must be a single plain line');
  }
  monday(fixture.week_start, file);
  integer(fixture.target, file, 'target', 1, 7, false);
  exactKeys(fixture.expected, EXPECTED_KEYS, file, 'expected');
  if (fixture.expected.status !== 'FULL' && fixture.expected.status !== 'HELD' && fixture.expected.status !== 'REST') {
    fail(file, 'expected.status must be FULL, HELD or REST');
  }
  if (typeof fixture.expected.credits !== 'number' || !Number.isFinite(fixture.expected.credits) || fixture.expected.credits < 0) {
    fail(file, 'expected.credits must be a non-negative number');
  }
  for (const key of ['sessions', 'min_entries', 'sets', 'cardio_entries', 'martial_entries']) {
    if (!Array.isArray(fixture[key])) fail(file, `${key} must be an array`);
  }
  const sessions = new Map();
  for (const row of fixture.sessions) {
    exactKeys(row, SESSION_KEYS, file, 'session');
    sync(row, file, 'session');
    if (sessions.has(row.id)) fail(file, `duplicate session ${row.id}`);
    if (!['gym', 'run', 'martial', 'min'].includes(row.kind)) fail(file, 'session.kind is invalid');
    if (!['full', 'min'].includes(row.mode)) fail(file, 'session.mode is invalid');
    instant(row.started_at, file, 'session.started_at', false);
    instant(row.ended_at, file, 'session.ended_at', true);
    text(row.tz, file, 'session.tz', false);
    if (row.readiness !== null) fail(file, 'session.readiness must be null in credit fixtures');
    if (row.together_id !== null) fail(file, 'session.together_id must be null in credit fixtures');
    text(row.note, file, 'session.note', true);
    sessions.set(row.id, row);
  }
  const seen = new Set();
  const child = (row, label) => {
    if (seen.has(row.id)) fail(file, `duplicate ${label} ${row.id}`);
    seen.add(row.id);
    const session = sessions.get(row.session_id);
    if (!session) fail(file, `${label}.session_id does not match a session in this fixture`);
    uuid(row.session_id, file, `${label}.session_id`);
    if (row.user_id !== session.user_id) fail(file, `${label}.user_id must match its session (SQL enforce_owner)`);
    instant(row.logged_at, file, `${label}.logged_at`, false);
  };
  for (const row of fixture.sets) {
    exactKeys(row, SET_KEYS, file, 'set');
    sync(row, file, 'set');
    child(row, 'set');
    if (row.exercise_id !== BENCH) fail(file, 'set.exercise_id must be the seeded bench exercise');
    integer(row.set_index, file, 'set.set_index', 1, 99, false);
    integer(row.reps, file, 'set.reps', 1, 100, false);
    if (typeof row.weight_kg !== 'number' || !Number.isFinite(row.weight_kg)) fail(file, 'set.weight_kg must be a number');
    if (row.rpe !== null) fail(file, 'set.rpe must be null in credit fixtures');
    if (typeof row.is_warmup !== 'boolean') fail(file, 'set.is_warmup must be boolean');
    text(row.note, file, 'set.note', true);
  }
  for (const row of fixture.cardio_entries) {
    exactKeys(row, CARDIO_KEYS, file, 'cardio');
    sync(row, file, 'cardio');
    child(row, 'cardio');
    if (row.activity !== 'Run') fail(file, "cardio.activity must be 'Run'");
    integer(row.distance_m, file, 'cardio.distance_m', 100, 100000, false);
    integer(row.duration_s, file, 'cardio.duration_s', 1, 86400, false);
    if (row.rpe !== null) fail(file, 'cardio.rpe must be null in credit fixtures');
    text(row.note, file, 'cardio.note', true);
  }
  for (const row of fixture.martial_entries) {
    exactKeys(row, MARTIAL_KEYS, file, 'martial');
    sync(row, file, 'martial');
    child(row, 'martial');
    text(row.discipline, file, 'martial.discipline', false);
    integer(row.duration_min, file, 'martial.duration_min', 1, 480, false);
    integer(row.rounds, file, 'martial.rounds', 1, 99, true);
    if (row.rpe !== null) fail(file, 'martial.rpe must be null in credit fixtures');
    text(row.note, file, 'martial.note', true);
  }
  for (const row of fixture.min_entries) {
    exactKeys(row, MIN_KEYS, file, 'min');
    sync(row, file, 'min');
    child(row, 'min');
    text(row.description, file, 'min.description', false);
    integer(row.duration_min, file, 'min.duration_min', 1, 480, true);
  }
}

export function loadCreditFixtures(dir = creditFixtureDir) {
  const files = readdirSync(dir).filter((name) => name.endsWith('.json')).sort();
  const fixtures = files.map((file) => {
    const fixture = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    validateFixture(fixture, file);
    return { ...fixture, file };
  });
  const names = new Set();
  for (const fixture of fixtures) {
    if (names.has(fixture.name)) fail(fixture.file, `duplicate name ${fixture.name}`);
    names.add(fixture.name);
  }
  if (fixtures.length === 0) fail(dir, 'no credit fixtures');
  return fixtures;
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlUuid(value) {
  return `${sqlString(value)}::uuid`;
}

function sqlDate(value) {
  return `${sqlString(value)}::date`;
}

function sqlInstant(value) {
  return value === null ? 'null' : `${sqlString(value)}::timestamptz`;
}

function sqlText(value) {
  return value === null ? 'null' : sqlString(value);
}

function sqlNumeric(value) {
  if (Object.is(value, -0)) return '0::numeric';
  return `${value}::numeric`;
}

function sqlBool(value) {
  return value ? 'true' : 'false';
}

function sqlInt(value) {
  return value === null ? 'null' : String(value);
}

function insert(table, columns, rows) {
  if (rows.length === 0) return '';
  const values = rows.map((row) => `  (${columns.map((column) => row[column]).join(', ')})`).join(',\n');
  return `insert into public.${table} (${columns.join(', ')})\nvalues\n${values};\n`;
}

function subjectUser(fixture) {
  const ids = new Set();
  for (const row of [...fixture.sessions, ...fixture.sets, ...fixture.cardio_entries, ...fixture.martial_entries, ...fixture.min_entries]) {
    ids.add(row.user_id);
  }
  if (ids.size > 1) fail(fixture.file, 'one user per fixture');
  return ids.size === 0 ? ALICE : [...ids][0];
}

function renderFixture(fixture) {
  const user = subjectUser(fixture);
  const sessions = fixture.sessions.map((row) => ({
    id: sqlUuid(row.id),
    kind: sqlText(row.kind),
    mode: sqlText(row.mode),
    started_at: sqlInstant(row.started_at),
    ended_at: sqlInstant(row.ended_at),
    tz: sqlText(row.tz),
    readiness: 'null',
    together_id: 'null',
    note: sqlText(row.note),
    user_id: sqlUuid(row.user_id),
    local_date: sqlDate(row.local_date),
    client_updated_at: sqlInstant(row.client_updated_at),
    deleted_at: sqlInstant(row.deleted_at),
  }));
  const sets = fixture.sets.map((row) => ({
    id: sqlUuid(row.id),
    session_id: sqlUuid(row.session_id),
    exercise_id: sqlUuid(row.exercise_id),
    set_index: sqlInt(row.set_index),
    reps: sqlInt(row.reps),
    weight_kg: sqlNumeric(row.weight_kg),
    rpe: 'null',
    is_warmup: sqlBool(row.is_warmup),
    note: sqlText(row.note),
    logged_at: sqlInstant(row.logged_at),
    user_id: sqlUuid(row.user_id),
    local_date: sqlDate(row.local_date),
    client_updated_at: sqlInstant(row.client_updated_at),
    deleted_at: sqlInstant(row.deleted_at),
  }));
  const cardio = fixture.cardio_entries.map((row) => ({
    id: sqlUuid(row.id),
    session_id: sqlUuid(row.session_id),
    activity: sqlText(row.activity),
    distance_m: sqlInt(row.distance_m),
    duration_s: sqlInt(row.duration_s),
    rpe: 'null',
    note: sqlText(row.note),
    logged_at: sqlInstant(row.logged_at),
    user_id: sqlUuid(row.user_id),
    local_date: sqlDate(row.local_date),
    client_updated_at: sqlInstant(row.client_updated_at),
    deleted_at: sqlInstant(row.deleted_at),
  }));
  const martial = fixture.martial_entries.map((row) => ({
    id: sqlUuid(row.id),
    session_id: sqlUuid(row.session_id),
    discipline: sqlText(row.discipline),
    duration_min: sqlInt(row.duration_min),
    rounds: sqlInt(row.rounds),
    rpe: 'null',
    note: sqlText(row.note),
    logged_at: sqlInstant(row.logged_at),
    user_id: sqlUuid(row.user_id),
    local_date: sqlDate(row.local_date),
    client_updated_at: sqlInstant(row.client_updated_at),
    deleted_at: sqlInstant(row.deleted_at),
  }));
  const mins = fixture.min_entries.map((row) => ({
    id: sqlUuid(row.id),
    session_id: sqlUuid(row.session_id),
    description: sqlText(row.description),
    duration_min: sqlInt(row.duration_min),
    logged_at: sqlInstant(row.logged_at),
    user_id: sqlUuid(row.user_id),
    local_date: sqlDate(row.local_date),
    client_updated_at: sqlInstant(row.client_updated_at),
    deleted_at: sqlInstant(row.deleted_at),
  }));
  return [
    `-- ${fixture.file}: ${fixture.name}`,
    insert('sessions', [
      'id', 'kind', 'mode', 'started_at', 'ended_at', 'tz', 'readiness', 'together_id', 'note',
      'user_id', 'local_date', 'client_updated_at', 'deleted_at',
    ], sessions),
    insert('sets', [
      'id', 'session_id', 'exercise_id', 'set_index', 'reps', 'weight_kg', 'rpe', 'is_warmup', 'note',
      'logged_at', 'user_id', 'local_date', 'client_updated_at', 'deleted_at',
    ], sets),
    insert('cardio_entries', [
      'id', 'session_id', 'activity', 'distance_m', 'duration_s', 'rpe', 'note', 'logged_at',
      'user_id', 'local_date', 'client_updated_at', 'deleted_at',
    ], cardio),
    insert('martial_entries', [
      'id', 'session_id', 'discipline', 'duration_min', 'rounds', 'rpe', 'note', 'logged_at',
      'user_id', 'local_date', 'client_updated_at', 'deleted_at',
    ], martial),
    insert('min_entries', [
      'id', 'session_id', 'description', 'duration_min', 'logged_at', 'user_id', 'local_date',
      'client_updated_at', 'deleted_at',
    ], mins),
    `select is(public.week_credits(${sqlUuid(user)}, ${sqlDate(fixture.week_start)}), ${sqlNumeric(fixture.expected.credits)},`,
    `  ${sqlText(fixture.name)});`,
    `delete from public.sessions where user_id = ${sqlUuid(user)};`,
    '',
  ].filter((part, partIndex, parts) => part !== '' || partIndex === parts.length - 1).join('\n');
}

export function renderCreditFixturesSql(fixtures) {
  const users = new Set([ALICE]);
  for (const fixture of fixtures) users.add(subjectUser(fixture));
  const userRows = [...users].sort().map((id) => `  (${sqlUuid(id)}, ${sqlString(USERS.get(id))})`).join(',\n');
  const body = fixtures.map((fixture) => renderFixture(fixture)).join('\n');
  return `-- Generated by scripts/credit-fixtures.mjs from tests/fixtures/credits/*.json.
-- Do not edit by hand. P3H credit fixtures: ${fixtures.length}
-- Each case is inserted, asserted, then deleted. The file transaction rolls back.
-- enforce_owner rewrites a child local_date to its session local_date; week_credits uses that session date (E5.5).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(${fixtures.length});
select diag('P3H pgTAP credit fixtures: ${fixtures.length}');

insert into auth.users (id, email) values
${userRows};

${body}select * from finish();
rollback;
`;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args[0] !== undefined && args[0] !== '--print')) {
    throw new Error('usage: node scripts/credit-fixtures.mjs [--print]');
  }
  const sql = renderCreditFixturesSql(loadCreditFixtures());
  if (args[0] === '--print') {
    process.stdout.write(sql);
    return;
  }
  writeFileSync(creditFixtureSqlPath, sql);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
