import { useState } from 'react';
import type { ReactElement } from 'react';
import { Link } from 'react-router';
import { localDateOf } from '../../core/weeks.ts';
import type { Repo } from '../../data/adapter.ts';
import { useRepo } from '../../app/useRepo.ts';
import { Button } from '../../ui/Button.tsx';
import { SegmentedControl } from '../../ui/SegmentedControl.tsx';
import { ListRow } from '../../ui/ListRow.tsx';
import { formatDate } from '../../core/formatDate.ts';
import { copy, fill } from '../../ui/copy.ts';
import { useRepoQuery } from '../floor/useRepoQuery.ts';
import { comboBook } from '../quicklog/muaythai/classNote.ts';
import {
  disciplinesOf,
  formatPaceLabel,
  martialInWindow,
  runPrs,
  runsInWindow,
  weeklyDistance,
  weeklyMinutes,
} from './activity.ts';
import { movingAverage7 } from './body.ts';
import { addLocalDays } from './calendar.ts';
import type { EntryBundle, ProgressData } from './bundle.ts';
import { plotDated, rebaseSeries, type DatedValue } from './geometry.ts';
import { HiddenTable } from './HiddenTable.tsx';
import { liftSeries } from './lifts.ts';
import { LineChart } from './LineChart.tsx';
import { chartModel, formatTrendNumber, trendWindow, CHART_HEIGHT, CHART_WIDTH } from './trend.ts';
import './progress.css';

function scaleOf(series: readonly (readonly DatedValue[])[], unit: string) {
  const values = series.flatMap((line) => line.map((point) => point.value));
  return { min: Math.min(...values), max: Math.max(...values), unit };
}

type Tab = 'lifts' | 'run' | 'martial' | 'body';

const TABS: readonly { id: Tab; label: string }[] = [
  { id: 'lifts', label: copy.progressLifts },
  { id: 'run', label: copy.x5Cardio },
  { id: 'martial', label: copy.x5Fight },
  { id: 'body', label: copy.progressBody },
];

function bundleOf(entries: EntryBundle): EntryBundle {
  return {
    sessions: entries.sessions,
    sets: entries.sets,
    bodyweight: entries.bodyweight,
    cardio: entries.cardio,
    martial: entries.martial,
  };
}

async function loadProgress(repo: Repo): Promise<ProgressData | null> {
  const me = await repo.q.me();
  if (!me) return null;
  const today = localDateOf(new Date().toISOString(), me.tz);
  const window = trendWindow(today);
  const [exercises, crew, mine, prs] = await Promise.all([
    repo.q.exercises(),
    repo.q.myCrew(),
    repo.q.entriesBetween(me.id, '0000-01-01', window.to),
    repo.q.prEvents({ since: window.from }),
  ]);
  const partnerIds = (crew?.members ?? [])
    .filter((member) => member.left_at === null && member.user_id !== me.id)
    .map((member) => member.user_id);
  const partners = (await repo.q.profiles(partnerIds)).sort((a, b) => a.display_name.localeCompare(b.display_name));
  const bundles = new Map<string, EntryBundle>();
  await Promise.all(partners.map(async (partner) => {
    const entries = await repo.q.entriesBetween(partner.id, '0000-01-01', window.to);
    bundles.set(partner.id, bundleOf(entries));
  }));
  return { me, window, lifts: exercises, partners, mine: bundleOf(mine), bundles, prs };
}

function plotted(series: readonly (readonly DatedValue[])[], data: ProgressData): string[] {
  return plotDated(series, data.window, CHART_WIDTH, CHART_HEIGHT);
}

function LiftsPanel({
  data,
  partnerId,
  showPartner,
}: {
  data: ProgressData;
  partnerId: string | null;
  showPartner: boolean;
}): ReactElement {
  const partner = data.partners.find((item) => item.id === partnerId) ?? null;
  const comparing = showPartner && partner != null;
  const rows = liftSeries({
    userId: data.me.id,
    partnerId: comparing ? partner.id : null,
    exercises: data.lifts,
    window: data.window,
    mine: data.mine,
    partner: comparing ? data.bundles.get(partner.id) ?? null : null,
  });
  const anyLine = rows.length > 0;
  return (
    <div className="progress-panel" role="region" id="progress-panel-lifts" aria-label={copy.progressLifts}>
      {!anyLine && <p className="progress-empty">{copy.x5LiftsEmpty}</p>}
      {anyLine && <p className="progress-caption">{copy.x5LiftHint}</p>}
      <ul className="progress-lifts">
        {rows.map((row) => {
          const model = chartModel(row.mine, comparing ? row.partner : [], comparing);
          const caption = fill(copy.progressSparkCaption, { exercise: row.exercise.name });
          const mine = model.mine.map((point) => ({ date: point.localDate, value: point.value }));
          const theirs = model.partner.map((point) => ({ date: point.localDate, value: point.value }));
          const lines = plotted([mine, theirs], data);
          return (
            <li key={row.exercise.id} className="progress-lift">
              <Link to={`/exercise/${row.exercise.id}`} className="progress-lift-link">
                <ListRow title={row.exercise.name}
                  detail={fill(copy.x5Last, { date: formatDate(row.mine.at(-1)?.localDate ?? data.window.to, data.window.to, copy) })}
                  trailing={<span className="progress-lift-best"><small>{copy.x5BestLabel}</small><span>{formatTrendNumber(Math.max(...row.mine.map((point) => point.e1rm)))}<span className="progress-lift-unit"> {copy.kg}</span></span></span>}
                  chevron />
              </Link>
              {row.mine.length >= 2 && (
                <>
                  <LineChart
                    compact
                    caption={caption}
                    youLabel={copy.progressYou}
                    partnerLabel={comparing ? partner?.display_name ?? null : null}
                    partnerHue={partner?.color_hue ?? 200}
                    lines={[
                      { kind: 'you', points: lines[0] ?? '' },
                      { kind: 'partner', points: lines[1] ?? '' },
                    ]}
                  />
                  <HiddenTable
                    caption={caption}
                    headers={comparing && partner != null
                      ? [copy.progressColDate, copy.progressYou, partner.display_name]
                      : [copy.progressColDate, copy.progressColKg]}
                    rows={comparing
                      ? [
                        ...model.mine.map((point) => [
                          point.localDate,
                          fill(copy.progressPointOwn, {
                            date: point.localDate,
                            percent: formatTrendNumber(point.value),
                            kg: formatTrendNumber(point.raw),
                          }),
                          '',
                        ]),
                        ...model.partner.map((point) => [
                          point.localDate,
                          '',
                          fill(copy.progressPointPartner, {
                            date: point.localDate,
                            percent: formatTrendNumber(point.value),
                          }),
                        ]),
                      ]
                      : model.mine.map((point) => [point.localDate, formatTrendNumber(point.raw)])}
                  />
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RunPanel({
  data,
  partnerId,
  showPartner,
}: {
  data: ProgressData;
  partnerId: string | null;
  showPartner: boolean;
}): ReactElement {
  const partner = data.partners.find((item) => item.id === partnerId) ?? null;
  const comparing = showPartner && partner != null;
  const partnerBundle = comparing ? data.bundles.get(partner.id) : undefined;
  const runs = runsInWindow(data.mine.cardio, data.mine.sessions, data.me.id, data.window);
  const theirs = partnerBundle == null || partner == null
    ? []
    : runsInWindow(partnerBundle.cardio, partnerBundle.sessions, partner.id, data.window);
  const weeks = weeklyDistance(runs, data.window);
  const partnerWeeks = weeklyDistance(theirs, data.window);
  const distance = weeks.map((week) => ({ date: week.weekStart, value: week.distanceM / 1000 }));
  const partnerDistance = partnerWeeks.map((week) => ({ date: week.weekStart, value: week.distanceM / 1000 }));
  const distanceMine = comparing ? rebaseSeries(distance) : distance;
  const distancePartner = comparing ? rebaseSeries(partnerDistance) : [];
  const distanceLines = plotted([distanceMine, distancePartner], data);
  const pace = runs.map((run) => ({ date: run.localDate, value: run.secondsPerKm }));
  const partnerPace = theirs.map((run) => ({ date: run.localDate, value: run.secondsPerKm }));
  const paceMine = comparing ? rebaseSeries(pace) : pace;
  const pacePartner = comparing ? rebaseSeries(partnerPace) : [];
  const paceLines = plotted([paceMine, pacePartner], data);
  const prs = runPrs(data.prs, data.window);
  const distanceCaption = comparing && partner != null
    ? fill(copy.progressCompareCaption, { partner: partner.display_name })
    : copy.progressDistanceCaption;
  return (
    <div className="progress-panel" role="region" id="progress-panel-run" aria-label={copy.x5Cardio}>
      {runs.length === 0 ? (
        <p className="progress-empty">{copy.x5CardioEmpty}</p>
      ) : (
        <>
          <h2>{copy.x5WeeklyDistance}</h2>
          <p className="progress-caption">{fill(copy.x5LatestRun, { km: formatTrendNumber((runs.at(-1)?.distanceM ?? 0) / 1000), pace: formatPaceLabel(runs.at(-1)?.secondsPerKm ?? 0) })}</p>
          <LineChart
            caption={copy.progressDistanceCaption}
            scale={scaleOf([distanceMine, distancePartner], comparing ? '%' : copy.x5KmUnit)}
            youLabel={copy.progressYou}
            partnerLabel={comparing && partner != null ? partner.display_name : null}
            partnerHue={partner?.color_hue ?? 200}
            lines={[
              { kind: 'you', points: distanceLines[0] ?? '' },
              { kind: 'partner', points: distanceLines[1] ?? '' },
            ]}
          />
          <HiddenTable
            caption={distanceCaption}
            headers={comparing && partner != null
              ? [copy.progressColWeek, copy.progressYou, partner.display_name]
              : [copy.progressColWeek, copy.progressColKm]}
            rows={weeks.map((week, index) => {
              const km = formatTrendNumber(week.distanceM / 1000);
              if (!comparing || partner == null) {
                return [week.weekStart, fill(copy.progressWeekKm, { week: week.weekStart, km })];
              }
              const minePoint = distanceMine[index];
              const other = distancePartner[index];
              return [
                week.weekStart,
                minePoint == null
                  ? fill(copy.progressWeekKm, { week: week.weekStart, km })
                  : fill(copy.progressRunOwn, { percent: formatTrendNumber(minePoint.value), km }),
                other == null ? '' : fill(copy.progressPointPartner, {
                  date: week.weekStart,
                  percent: formatTrendNumber(other.value),
                }),
              ];
            })}
          />
          <h2>{copy.x5Pace}</h2>
          <LineChart
            caption={copy.progressPaceCaption}
            scale={scaleOf([paceMine, pacePartner], comparing ? '%' : copy.x5PaceUnit)}
            youLabel={copy.progressYou}
            partnerLabel={comparing && pacePartner.length >= 2 && partner != null ? partner.display_name : null}
            partnerHue={partner?.color_hue ?? 200}
            lines={[
              { kind: 'you', points: paceLines[0] ?? '' },
              { kind: 'partner', points: paceLines[1] ?? '' },
            ]}
          />
          <HiddenTable
            caption={copy.progressPaceCaption}
            headers={[copy.progressColDate, copy.progressPaceCaption]}
            rows={runs.map((run, index) => {
              const clock = formatPaceLabel(run.secondsPerKm);
              const scaled = paceMine[index];
              const cell = comparing && scaled != null
                ? fill(copy.progressPaceOwn, {
                  date: run.localDate,
                  pace: clock,
                  percent: formatTrendNumber(scaled.value),
                })
                : fill(copy.progressPacePoint, { date: run.localDate, pace: clock });
              return [run.localDate, cell];
            })}
          />
          {comparing && partner != null && pacePartner.length >= 2 && (
            <HiddenTable
              caption={copy.progressPaceCaption}
              headers={[copy.progressColDate, partner.display_name]}
              rows={pacePartner.map((point) => [
                point.date,
                fill(copy.progressPointPartner, { date: point.date, percent: formatTrendNumber(point.value) }),
              ])}
            />
          )}
          {comparing && partner != null && theirs.length < 2 && (
            <p className="progress-empty">{fill(copy.progressPartnerQuietLine, { partner: partner.display_name })}</p>
          )}
        </>
      )}
      {prs.length > 0 && (
        <section>
          <h2>{copy.progressPrHeading}</h2>
          <ol className="progress-lifts">
            {prs.map((pr) => (
              <li key={pr.id}>
                {pr.pr_type === 'distance'
                  ? fill(copy.progressPrDistance, { date: formatDate(pr.local_date, data.window.to, copy), km: formatTrendNumber(pr.value / 1000) })
                  : fill(copy.progressPrPace, { date: formatDate(pr.local_date, data.window.to, copy), pace: formatPaceLabel(pr.value) })}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function MartialPanel({
  data,
  partnerId,
  showPartner,
}: {
  data: ProgressData;
  partnerId: string | null;
  showPartner: boolean;
}): ReactElement {
  const partner = data.partners.find((item) => item.id === partnerId) ?? null;
  const comparing = showPartner && partner != null;
  const partnerBundle = comparing ? data.bundles.get(partner.id) : undefined;
  const mine = martialInWindow(data.mine.martial, data.mine.sessions, data.me.id, data.window);
  const theirs = partnerBundle == null || partner == null
    ? []
    : martialInWindow(partnerBundle.martial, partnerBundle.sessions, partner.id, data.window);
  const ready = disciplinesOf(mine);
  const book = comboBook(data.mine.martial);
  return (
    <div className="progress-panel" role="region" id="progress-panel-martial" aria-label={copy.x5Fight}>
      {book.length > 0 ? (
        <section aria-label={copy.y2ComboBook}>
          <h2>{copy.y2ComboBook}</h2>
          <ol className="progress-week-list">
            {book.map((row) => (
              <li key={row.combo}>{fill(copy.y2Drilled, { combo: row.combo, count: row.count })}</li>
            ))}
          </ol>
        </section>
      ) : null}
      {ready.length === 0 ? (
        <p className="progress-empty">{copy.x5FightEmpty}</p>
      ) : ready.map((discipline) => {
        const weeks = weeklyMinutes(mine, discipline, data.window);
        const partnerWeeks = weeklyMinutes(theirs, discipline, data.window);
        const series = weeks.map((week) => ({ date: week.weekStart, value: week.minutes }));
        const partnerSeries = partnerWeeks.map((week) => ({ date: week.weekStart, value: week.minutes }));
        const mineLine = comparing ? rebaseSeries(series) : series;
        const partnerLine = comparing ? rebaseSeries(partnerSeries) : [];
        const lines = plotted([mineLine, partnerLine], data);
        const caption = fill(copy.progressMartialCaption, { discipline });
        const rounds = weeks.map((week) => ({ date: week.weekStart, value: mine
          .filter((point) => point.discipline === discipline && point.localDate >= week.weekStart && point.localDate < addLocalDays(week.weekStart, 7))
          .reduce((total, point) => total + (data.mine.martial.find((row) => row.id === point.id)?.rounds ?? 0), 0) }));
        return (
          <section key={discipline}>
            <h2>{discipline}</h2>
            <h3>{copy.x5Minutes}</h3>
            <LineChart
              caption={caption}
              scale={scaleOf([mineLine, partnerLine], comparing ? '%' : copy.x5MinutesUnit)}
              youLabel={copy.progressYou}
              partnerLabel={comparing && partner != null ? partner.display_name : null}
              partnerHue={partner?.color_hue ?? 200}
              lines={[
                { kind: 'you', points: lines[0] ?? '' },
                { kind: 'partner', points: lines[1] ?? '' },
              ]}
            />
            <h3>{copy.x5Rounds}</h3>
            <LineChart caption={copy.x5Rounds} youLabel={copy.progressYou} partnerLabel={null} partnerHue={200}
              scale={scaleOf([rounds], copy.x5RoundsUnit)}
              lines={[{ kind: 'you', points: plotted([rounds], data)[0] ?? '' }]} />
            <ul className="progress-week-list">{weeks.filter((week) => week.minutes > 0).map((week) => <li key={week.weekStart}>{fill(copy.x5FightWeek, {
              date: formatDate(week.weekStart, data.window.to, copy), minutes: week.minutes,
              rounds: rounds.find((point) => point.date === week.weekStart)?.value ?? 0,
            })}</li>)}</ul>
            <HiddenTable
              caption={caption}
              headers={comparing && partner != null
                ? [copy.progressColWeek, copy.progressYou, partner.display_name]
                : [copy.progressColWeek, copy.progressColMinutes]}
              rows={weeks.map((week, index) => {
                const minutes = String(week.minutes);
                if (!comparing || partner == null) {
                  return [week.weekStart, fill(copy.progressMartialWeek, { week: week.weekStart, minutes })];
                }
                const own = mineLine[index];
                const other = partnerLine[index];
                return [
                  week.weekStart,
                  own == null
                    ? fill(copy.progressMartialWeek, { week: week.weekStart, minutes })
                    : fill(copy.progressMartialOwn, { percent: formatTrendNumber(own.value), minutes }),
                  other == null ? '' : fill(copy.progressPointPartner, {
                    date: week.weekStart,
                    percent: formatTrendNumber(other.value),
                  }),
                ];
              })}
            />
          </section>
        );
      })}
    </div>
  );
}

function BodyPanel({
  data,
  partnerId,
  showPartner,
}: {
  data: ProgressData;
  partnerId: string | null;
  showPartner: boolean;
}): ReactElement {
  const partner = data.partners.find((item) => item.id === partnerId) ?? null;
  const comparing = showPartner && partner != null;
  const partnerBundle = comparing ? data.bundles.get(partner.id) : undefined;
  const history = movingAverage7(data.mine.bodyweight, data.me.id)
    .filter((point) => point.localDate <= data.window.to);
  const partnerHistory = partnerBundle == null || partner == null
    ? []
    : movingAverage7(partnerBundle.bodyweight, partner.id).filter((point) => point.localDate <= data.window.to);
  const dates = [...history, ...partnerHistory].map((point) => point.localDate).sort();
  const chartWindow = { from: dates[0] ?? data.window.from, to: dates[dates.length - 1] ?? data.window.to };
  const weight = history.map((point) => ({ date: point.localDate, value: point.weightKg }));
  const average = history.map((point) => ({ date: point.localDate, value: point.averageKg }));
  const partnerAverage = partnerHistory.map((point) => ({ date: point.localDate, value: point.averageKg }));
  const averageLine = comparing ? rebaseSeries(average) : average;
  const partnerLine = comparing ? rebaseSeries(partnerAverage) : [];
  const lines = plotDated(comparing ? [averageLine, partnerLine] : [weight, average], chartWindow, CHART_WIDTH, CHART_HEIGHT);
  const caption = comparing && partner != null
    ? fill(copy.progressBodyPercent, { partner: partner.display_name })
    : copy.progressBodyCaption;
  return (
    <div className="progress-panel" role="region" id="progress-panel-body" aria-label={copy.progressBody}>
      {history.length === 0 ? (
        <p className="progress-empty">{copy.x5BodyEmpty}</p>
      ) : (
        <>
          <h2>{copy.x5BodyChart}</h2>
          <p className="progress-caption">{fill(copy.x5LatestWeight, { kg: formatTrendNumber(history.at(-1)?.weightKg ?? 0) })}</p>
          <LineChart
            caption={caption}
            scale={scaleOf(comparing ? [averageLine, partnerLine] : [weight, average], comparing ? '%' : copy.kg)}
            youLabel={copy.progressYou}
            partnerLabel={comparing && partner != null ? partner.display_name : null}
            partnerHue={partner?.color_hue ?? 200}
            lines={comparing
              ? [
                { kind: 'you', points: lines[0] ?? '' },
                { kind: 'partner', points: lines[1] ?? '' },
              ]
              : [
                { kind: 'weight', points: lines[0] ?? '' },
                { kind: 'you', points: lines[1] ?? '' },
              ]}
          />
          <HiddenTable
            caption={caption}
            headers={comparing && partner != null
              ? [copy.progressColDate, copy.progressYou, partner.display_name]
              : [copy.progressColDate, copy.progressColKg, copy.progressColAverage]}
            rows={[
              ...history.map((point, index) => {
                const kg = formatTrendNumber(point.weightKg);
                const averageKg = formatTrendNumber(point.averageKg);
                if (!comparing || partner == null) return [point.localDate, kg, averageKg];
                const own = averageLine[index];
                const other = partnerLine.find((item) => item.date === point.localDate);
                return [
                  point.localDate,
                  own == null
                    ? fill(copy.progressPointKg, { date: point.localDate, kg })
                    : fill(copy.progressPointOwn, {
                      date: point.localDate,
                      percent: formatTrendNumber(own.value),
                      kg,
                    }),
                  other == null ? '' : fill(copy.progressPointPartner, {
                    date: other.date,
                    percent: formatTrendNumber(other.value),
                  }),
                ];
              }),
              ...(comparing && partner != null
                ? partnerLine
                  .filter((point) => !history.some((row) => row.localDate === point.date))
                  .map((point) => [
                    point.date,
                    '',
                    fill(copy.progressPointPartner, {
                      date: point.date,
                      percent: formatTrendNumber(point.value),
                    }),
                  ])
                : []),
            ]}
          />
          {comparing && partner != null && partnerLine.length < 2 && (
            <p className="progress-empty">{fill(copy.progressPartnerQuietLine, { partner: partner.display_name })}</p>
          )}
        </>
      )}
    </div>
  );
}

export function ProgressView({ data }: { data: ProgressData | null }): ReactElement {
  const [tab, setTab] = useState<Tab>('lifts');
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [showPartner, setShowPartner] = useState(false);

  if (data == null) {
    return (
      <main className="progress progress-hub">
        <h1>{copy.progressTitle}</h1>
        <p className="progress-empty">{copy.x5LiftsEmpty}</p>
      </main>
    );
  }

  const partner = data.partners.find((item) => item.id === partnerId) ?? data.partners[0];
  const activePartner = partner?.id ?? null;

  return (
    <main className="progress progress-hub">
      <h1>{copy.progressTitle}</h1>
      <SegmentedControl label={copy.progressTitle} value={tab}
        options={TABS.map((item) => ({ value: item.id, label: item.label }))}
        onChange={(value) => setTab(value as Tab)} />
      {data.partners.length > 1 && (
        <label className="progress-field">
          <span>{copy.partner}</span>
          <select value={activePartner ?? ''} onChange={(event) => setPartnerId(event.target.value)}>
            {data.partners.map((item) => (
              <option key={item.id} value={item.id}>{item.display_name}</option>
            ))}
          </select>
        </label>
      )}
      {partner != null && (
        <Button
          variant={showPartner ? 'primary' : 'secondary'}
          role="switch"
          aria-checked={showPartner}
          onClick={() => setShowPartner((value) => !value)}
        >
          {fill(copy.progressShowPartner, { partner: partner.display_name })}
        </Button>
      )}
      {showPartner && <p className="progress-caption">{copy.x5Comparison}</p>}
      {tab === 'lifts' && <LiftsPanel data={data} partnerId={activePartner} showPartner={showPartner} />}
      {tab === 'run' && <RunPanel data={data} partnerId={activePartner} showPartner={showPartner} />}
      {tab === 'martial' && <MartialPanel data={data} partnerId={activePartner} showPartner={showPartner} />}
      {tab === 'body' && <BodyPanel data={data} partnerId={activePartner} showPartner={showPartner} />}
    </main>
  );
}

export default function ProgressScreen() {
  const repo = useRepo();
  const data = useRepoQuery(() => loadProgress(repo), [repo]);
  if (data === undefined) return <main className="progress progress-hub" aria-busy="true" />;
  return <ProgressView data={data} />;
}
