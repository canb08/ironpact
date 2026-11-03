import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react';
import { cardioEntrySchema, uiSchemas } from '../../core/validate.ts';
import { useRepo } from '../../app/useRepo.ts';
import { Button, copy, fill, ScrubDial } from '../../ui';
import { useToast } from '../../ui/useToast.ts';
import { StopwatchGlyph } from '../../ui/icons';
import { feel } from '../../ui/feel/feel.ts';
import { useRepoQuery } from '../floor/useRepoQuery.ts';
import { formatClock, formatKm, formatPace, parseDecimal, parseDuration } from './time.ts';
import {
  DEFAULT_DURATION_S,
  DEFAULT_KM,
  DURATION_MAX_S,
  DURATION_MIN_S,
  DURATION_STEP_S,
  durationInRange,
  KM_MAX,
  KM_MIN,
  KM_STEP,
  kmFromMeters,
  kmInRange,
  latestRun,
  metersFromKm,
} from './run/model.ts';
import './run/run.css';

const LiveRun = lazy(() => import('./run/LiveRun.tsx'));

const RPE = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10] as const;

export function RunForm() {
  const repo = useRepo();
  const { showToast } = useToast();
  const distanceDial = useRef<HTMLDivElement>(null);
  const focusDistance = useRef(false);
  const [km, setKm] = useState(DEFAULT_KM);
  const [durationS, setDurationS] = useState(DEFAULT_DURATION_S);
  const [kmText, setKmText] = useState<string | null>(null);
  const [durationText, setDurationText] = useState<string | null>(null);
  const [rpe, setRpe] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [more, setMore] = useState(false);
  const [live, setLive] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const last = useRepoQuery(async () => {
    const profile = await repo.q.me();
    if (!profile) return null;
    const entries = await repo.q.entriesBetween(profile.id, '0000-01-01', '9999-12-31');
    return latestRun(entries.cardio);
  }, [repo]);

  const parsedKm = kmText === null ? km : parseDecimal(kmText);
  const parsedDuration = durationText === null ? durationS : parseDuration(durationText);
  const distanceOk = kmInRange(parsedKm);
  const durationOk = durationInRange(parsedDuration);
  const noteSaved = note.trim();
  const noteOk = cardioEntrySchema.shape.note.safeParse(noteSaved === '' ? null : noteSaved).success;
  const pace = kmInRange(parsedKm) && durationInRange(parsedDuration) ? formatPace(parsedDuration, parsedKm) : null;

  useEffect(() => {
    if (!focusDistance.current || live) return;
    focusDistance.current = false;
    distanceDial.current?.querySelector<HTMLElement>('[role="slider"]')?.focus();
  }, [live, durationS]);

  function applyLast() {
    if (!last) return;
    const nextKm = kmFromMeters(last.distance_m);
    if (!kmInRange(nextKm) || !durationInRange(last.duration_s)) return;
    setKm(nextKm);
    setDurationS(last.duration_s);
    setKmText(null);
    setDurationText(null);
    setRpe(last.rpe !== null && uiSchemas.rpe.safeParse(last.rpe).success ? last.rpe : null);
    setNote(last.note ?? '');
    setAttempted(false);
    setServerError(null);
  }

  function onLiveStop(seconds: number) {
    setDurationS(seconds);
    setDurationText(null);
    focusDistance.current = true;
    setLive(false);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setAttempted(true);
    setServerError(null);
    if (!kmInRange(parsedKm) || !durationInRange(parsedDuration) || !noteOk) return;
    setSaving(true);
    try {
      const result = await repo.w.logRun({
        distance_m: metersFromKm(parsedKm),
        duration_s: parsedDuration,
        rpe,
        note: noteSaved === '' ? null : noteSaved,
      });
      if (!result.ok) {
        setServerError(result.error === 'storage_full' ? copy.storageFull : copy.outOfRange);
        return;
      }
      showToast({ message: copy.x11RunSaved });
      feel('plate');
    } finally {
      setSaving(false);
    }
  }

  if (live) {
    return (
      <Suspense fallback={<p className="ql-run-live__hint">{copy.loading}</p>}>
        <LiveRun onStop={onLiveStop} onCancel={() => setLive(false)} />
      </Suspense>
    );
  }

  return (
    <form className="ql-run" data-testid="run-form" data-last={last ? 'yes' : last === null ? 'no' : 'loading'} onSubmit={(event) => { void onSubmit(event); }}>
      {pace ? <p className="ql-run-pace" data-testid="pace" aria-live="polite"><span className="ql-run-pace__time">{pace}</span><span className="ql-run-pace__unit">{' /km'}</span></p> : null}
      {last ? <button type="button" className="ql-run-chip" onClick={applyLast}>{copy.y6SameAsLast}</button> : null}
      <div className="ql-run-dials">
        <div ref={distanceDial}>
          <ScrubDial
            wheel
            label={copy.distance}
            value={km}
            onChange={(next) => { setKm(next); setKmText(null); }}
            min={KM_MIN}
            max={KM_MAX}
            step={KM_STEP}
            unit={copy.km}
            format={formatKm}
            onTapNumber={() => setKmText(formatKm(km))}
          />
        </div>
        <div>
          <ScrubDial
            wheel
            label={copy.duration}
            value={durationS}
            onChange={(next) => { setDurationS(next); setDurationText(null); }}
            min={DURATION_MIN_S}
            max={DURATION_MAX_S}
            step={DURATION_STEP_S}
            unit={copy.y6MinSec}
            format={formatClock}
            onTapNumber={() => setDurationText(formatClock(durationS))}
          />
        </div>
      </div>
      {more ? (
        <div className="ql-run-more">
          <div>
            <p className="ql-unit" id="run-rpe">{copy.rpe}</p>
            <div className="ql-rpe" role="group" aria-labelledby="run-rpe">
              {RPE.map((value) => (
                <Button key={value} variant={rpe === value ? 'primary' : 'secondary'} aria-pressed={rpe === value} onClick={() => setRpe((current) => current === value ? null : value)}>
                  {value}
                </Button>
              ))}
            </div>
          </div>
          <div className="ql-field">
            <label htmlFor="run-note">{copy.note}</label>
            <textarea id="run-note" value={note} aria-invalid={!noteOk} onChange={(event) => setNote(event.currentTarget.value)} />
            <p className={noteOk ? 'ql-count' : 'ql-error'}>{fill(copy.noteCount, { count: Array.from(noteSaved).length })}</p>
          </div>
        </div>
      ) : (
        <Button variant="quiet" className="ql-run-more-btn" onClick={() => setMore(true)}>{copy.y6More}</Button>
      )}
      <div className="ql-run-dock">
        <Button variant="secondary" className="ql-run-live-btn" onClick={() => setLive(true)}>
          <StopwatchGlyph width={18} height={18} />
          {copy.y6LiveRun}
        </Button>
        <div className="ql-run-type">
          {kmText === null ? (
            <Button variant="quiet" onClick={() => setKmText(formatKm(km))}>{copy.y6TypeDistance}</Button>
          ) : (
            <div className="ql-field">
              <label htmlFor="run-km-type">{copy.y6DistanceKm}</label>
              <input
                id="run-km-type"
                inputMode="decimal"
                autoComplete="off"
                value={kmText}
                aria-invalid={attempted && !distanceOk}
                onChange={(event) => {
                  const text = event.currentTarget.value;
                  setKmText(text);
                  const next = parseDecimal(text);
                  if (kmInRange(next)) setKm(next);
                }}
              />
            </div>
          )}
          {durationText === null ? (
            <Button variant="quiet" onClick={() => setDurationText(formatClock(durationS))}>{copy.y6TypeDuration}</Button>
          ) : (
            <div className="ql-field">
              <label htmlFor="run-duration-type">{copy.y6DurationClock}</label>
              <input
                id="run-duration-type"
                inputMode="numeric"
                autoComplete="off"
                value={durationText}
                aria-invalid={attempted && !durationOk}
                onChange={(event) => {
                  const text = event.currentTarget.value;
                  setDurationText(text);
                  const next = parseDuration(text);
                  if (durationInRange(next)) setDurationS(next);
                }}
              />
            </div>
          )}
        </div>
        {attempted && !distanceOk ? <p className="ql-error" role="alert" data-testid="error-distance">{copy.outOfRange}</p> : null}
        {attempted && !durationOk ? <p className="ql-error" role="alert" data-testid="error-duration">{copy.outOfRange}</p> : null}
        {serverError ? <p className="ql-error" role="alert">{serverError}</p> : null}
        <Button type="submit" size="xl" className="ql-save" disabled={saving}>{copy.x11SaveRun}</Button>
      </div>
    </form>
  );
}
