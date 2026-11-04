import { useEffect, useId, useRef, useState } from 'react';
import { parseVoice } from '../../../core/voice.ts';
import { copy, fill } from '../../../ui/copy.ts';
import { feel } from '../../../ui/feel/feel.ts';
import { captureSpeech, type Capture } from './recognition.ts';
import './voice.css';

export interface VoiceMicProps {
  kg: number;
  reps: number;
  same: { kg: number; reps: number };
  minKg: number;
  maxKg: number;
  disabled: boolean;
  reduced: boolean;
  onDraft: (draft: { kg: number; reps: number }) => void;
}

type State = 'idle' | 'listening' | 'processing' | 'ready' | 'unclear' | 'blocked' | 'failed';

export default function VoiceMic({ kg, reps, same, minKg, maxKg, disabled, reduced, onDraft }: VoiceMicProps) {
  const hint = useId();
  const status = useId();
  const [state, setState] = useState<State>('idle');
  const [preview, setPreview] = useState<{ kg: number; reps: number } | null>(null);
  const capture = useRef<Capture | null>(null);
  const held = useRef<string | null>(null);
  const cancel = () => {
    held.current = null;
    capture.current?.cancel();
    capture.current = null;
  };
  useEffect(() => {
    const leave = () => { cancel(); setState('idle'); };
    const visibility = () => { if (document.hidden) leave(); };
    if (disabled) leave();
    window.addEventListener('blur', leave);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      cancel();
      window.removeEventListener('blur', leave);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [disabled]);

  const error = (next: State) => {
    held.current = null;
    capture.current = null;
    setState(next);
    feel('error', { reducedMotion: reduced });
  };
  const start = (source: string) => {
    if (disabled || held.current || capture.current) return;
    held.current = source;
    setState('listening');
    capture.current = captureSpeech({
      error: (reason) => error(reason === 'not-allowed' || reason === 'service-not-allowed' ? 'blocked' : 'failed'),
      result: (text) => {
        held.current = null;
        capture.current = null;
        const parsed = parseVoice(text, kg);
        if (!parsed) { error('unclear'); return; }
        const draft = parsed.same ? same : { kg: parsed.kg ?? kg, reps: parsed.reps ?? reps };
        if (!Number.isFinite(draft.kg) || draft.kg < minKg || draft.kg > maxKg || !Number.isInteger(draft.kg * 4)
          || !Number.isInteger(draft.reps) || draft.reps < 1 || draft.reps > 100) { error('unclear'); return; }
        onDraft(draft);
        setPreview(draft);
        setState('ready');
        feel('tick', { reducedMotion: reduced });
      },
    });
    if (capture.current) feel('tick', { reducedMotion: reduced });
    else held.current = null;
  };
  const stop = (source: string) => {
    if (held.current !== source) return;
    held.current = null;
    if (!capture.current) return;
    setState('processing');
    capture.current.stop();
  };
  const message = state === 'ready' ? (preview?.kg === kg && preview.reps === reps ? fill(copy.y7Preview, preview) : '') : state === 'listening' ? copy.y7Listening : state === 'processing' ? copy.y7Processing
    : state === 'unclear' ? copy.y7Unclear : state === 'blocked' ? copy.y7Blocked : state === 'failed' ? copy.y7Unavailable : '';
  return <div className="session-voice" data-error={state === 'unclear' || state === 'blocked' || state === 'failed' ? 'true' : undefined}>
    <button type="button" className="session-voice-mic" disabled={disabled} aria-disabled={disabled || state === 'processing'}
      aria-label={copy.y7Hold} title={copy.y7Hold} aria-describedby={`${hint} ${status}`} aria-pressed={!disabled && state === 'listening'}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        start(`pointer:${event.pointerId}`);
      }}
      onPointerUp={(event) => stop(`pointer:${event.pointerId}`)}
      onPointerCancel={() => { cancel(); setState('idle'); }}
      onLostPointerCapture={() => { if (held.current?.startsWith('pointer:')) { cancel(); setState('idle'); } }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancel(); setState('idle'); }
        if (event.key !== ' ' && event.key !== 'Enter') return;
        event.preventDefault(); event.stopPropagation();
        if (!event.repeat) start(event.key);
      }}
      onKeyUp={(event) => {
        if (event.key !== ' ' && event.key !== 'Enter') return;
        event.preventDefault(); event.stopPropagation(); stop(event.key);
      }}
      onBlur={() => { if (capture.current) { cancel(); setState('idle'); } }}
      onClick={(event) => event.preventDefault()}
      onContextMenu={(event) => event.preventDefault()}>
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" />
      </svg>
      <span className="session-sr-only">{state === 'listening' && !disabled ? copy.y7Listening : copy.y7Hold}</span>
    </button>
    <span id={hint} className="session-sr-only">{copy.y7Hint}</span>
    <span id={status} className="session-voice-status" role="status" aria-live="polite">{disabled ? '' : message}</span>
  </div>;
}
