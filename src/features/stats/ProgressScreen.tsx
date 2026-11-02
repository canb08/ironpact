import { useState } from 'react';
import type { BodyweightEntry, Exercise, Profile, Session, SetRow } from '../../core/types.ts';
import { localDateOf } from '../../core/weeks.ts';
import type { Repo } from '../../data/adapter.ts';
import { useRepo } from '../../app/useRepo.ts';
import { Button } from '../../ui/Button.tsx';
import { copy, fill } from '../../ui/copy.ts';
import { useRepoQuery } from '../floor/useRepoQuery.ts';
import { TrendChart } from './TrendChart.tsx';
import { bestE1rmPerSession, chartModel, formatTrendNumber, trendWindow, type SessionBest, type TrendWindow } from './trend.ts';
import './progress.css';

interface EntryBundle {
  sessions: Session[];
  sets: SetRow[];
  bodyweight: BodyweightEntry[];
}

interface ProgressData {
  me: Profile;
  window: TrendWindow;
  lifts: Exercise[];
  partners: Profile[];
  mine: EntryBundle;
  bundles: Map<string, EntryBundle>;
}

function bundleOf(entries: { sessions: Session[]; sets: SetRow[]; bodyweight: BodyweightEntry[] }): EntryBundle {
  return { sessions: entries.sessions, sets: entries.sets, bodyweight: entries.bodyweight };
}

async function loadProgress(repo: Repo): Promise<ProgressData | null> {
  const me = await repo.q.me();
  if (!me) return null;
  const today = localDateOf(new Date().toISOString(), me.tz);
  const window = trendWindow(today);
  const [exercises, crew, mine] = await Promise.all([
    repo.q.exercises(),
    repo.q.myCrew(),
    // Bodyweight logged before the 12-week window still counts for bw_lift e1RM.
    repo.q.entriesBetween(me.id, '0000-01-01', window.to),
  ]);
  const lifts = exercises
    .filter((exercise) => exercise.deleted_at === null && (exercise.kind === 'lift' || exercise.kind === 'bw_lift'))
    .sort((a, b) => a.name.localeCompare(b.name));
  const partnerIds = (crew?.members ?? [])
    .filter((member) => member.left_at === null && member.user_id !== me.id)
    .map((member) => member.user_id);
  const partners = (await repo.q.profiles(partnerIds)).sort((a, b) => a.display_name.localeCompare(b.display_name));
  const bundles = new Map<string, EntryBundle>();
  await Promise.all(partners.map(async (partner) => {
    const entries = await repo.q.entriesBetween(partner.id, '0000-01-01', window.to);
    bundles.set(partner.id, bundleOf(entries));
  }));
  return { me, window, lifts, partners, mine: bundleOf(mine), bundles };
}

function seriesFor(
  data: ProgressData,
  userId: string,
  exercise: Exercise,
  bundle: EntryBundle,
): SessionBest[] {
  return bestE1rmPerSession({
    userId,
    exerciseId: exercise.id,
    from: data.window.from,
    to: data.window.to,
    exercise,
    sessions: bundle.sessions,
    sets: bundle.sets,
    bodyweights: bundle.bodyweight,
  });
}

function ProgressBody({ data }: { data: ProgressData | null }) {
  const [exerciseId, setExerciseId] = useState<string | null>(null);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [showPartner, setShowPartner] = useState(false);

  if (data == null || data.lifts.length === 0) {
    return (
      <main className="progress">
        <h1>{copy.progressTitle}</h1>
        <p className="progress-empty">{copy.emptyProgress}</p>
      </main>
    );
  }

  const exercise = data.lifts.find((item) => item.id === exerciseId) ?? data.lifts[0];
  const partner = data.partners.find((item) => item.id === partnerId) ?? data.partners[0];
  if (exercise == null) {
    return (
      <main className="progress">
        <h1>{copy.progressTitle}</h1>
        <p className="progress-empty">{copy.emptyProgress}</p>
      </main>
    );
  }

  const mine = seriesFor(data, data.me.id, exercise, data.mine);
  const partnerBundle = partner == null ? undefined : data.bundles.get(partner.id);
  const partnerSeries = showPartner && partner != null && partnerBundle != null
    ? seriesFor(data, partner.id, exercise, partnerBundle)
    : [];
  const comparing = showPartner && partner != null;
  const model = chartModel(mine, partnerSeries, comparing);
  const caption = comparing
    ? fill(copy.progressChartPercent, { partner: partner.display_name })
    : copy.progressChartKg;

  return (
    <main className="progress">
      <h1>{copy.progressTitle}</h1>
      <label className="progress-field">
        <span>{copy.progressExercise}</span>
        <select
          value={exercise.id}
          onChange={(event) => setExerciseId(event.target.value)}
        >
          {data.lifts.map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
      </label>
      {data.partners.length > 1 && (
        <label className="progress-field">
          <span>{copy.partner}</span>
          <select
            value={partner?.id ?? ''}
            onChange={(event) => setPartnerId(event.target.value)}
          >
            {data.partners.map((item) => (
              <option key={item.id} value={item.id}>{item.display_name}</option>
            ))}
          </select>
        </label>
      )}
      {partner != null && (
        <Button
          variant={comparing ? 'primary' : 'secondary'}
          aria-pressed={comparing}
          onClick={() => setShowPartner((value) => !value)}
        >
          {fill(copy.progressShowPartner, { partner: partner.display_name })}
        </Button>
      )}
      {mine.length < 2 ? (
        <p className="progress-empty">{copy.emptyProgress}</p>
      ) : (
        <>
          <p className="progress-caption">{caption}</p>
          <TrendChart
            model={model}
            window={data.window}
            youLabel={copy.progressYou}
            partnerLabel={comparing ? partner.display_name : null}
            partnerHue={partner?.color_hue ?? 200}
            caption={caption}
          />
          {comparing && partnerSeries.length === 0 && (
            <p className="progress-empty">{fill(copy.progressPartnerQuiet, { partner: partner.display_name })}</p>
          )}
          <div className="progress-readout">
            <section>
              <h2>{copy.progressYou}</h2>
              <ol>
                {model.mine.map((point) => (
                  <li key={point.sessionId}>
                    {comparing
                      ? fill(copy.progressPointOwn, {
                        date: point.localDate,
                        percent: formatTrendNumber(point.value),
                        kg: formatTrendNumber(point.raw),
                      })
                      : fill(copy.progressPointKg, {
                        date: point.localDate,
                        kg: formatTrendNumber(point.raw),
                      })}
                  </li>
                ))}
              </ol>
            </section>
            {comparing && model.partner.length > 0 && (
              <section>
                <h2>{partner.display_name}</h2>
                <ol>
                  {model.partner.map((point) => (
                    <li key={point.sessionId}>
                      {fill(copy.progressPointPartner, {
                        date: point.localDate,
                        percent: formatTrendNumber(point.value),
                      })}
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </div>
        </>
      )}
    </main>
  );
}

export default function ProgressScreen() {
  const repo = useRepo();
  const data = useRepoQuery(() => loadProgress(repo), [repo]);
  if (data === undefined) return <main className="progress" aria-busy="true" />;
  return <ProgressBody data={data} />;
}
