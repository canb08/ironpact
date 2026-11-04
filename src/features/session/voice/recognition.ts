import { recognitionConstructor } from './support.ts';

export interface RecognitionResult {
  readonly isFinal: boolean;
  readonly 0?: { readonly transcript: string };
}
export interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: { results: ArrayLike<RecognitionResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
export type RecognitionConstructor = new () => Recognition;

export interface Capture { stop(): void; cancel(): void }

/** One recognition session per hold. Only final results survive a normal end. */
export function captureSpeech(callbacks: { result: (text: string) => void; error: (error: string) => void }): Capture | null {
  const Constructor = recognitionConstructor();
  if (!Constructor) { callbacks.error('unavailable'); return null; }
  let recognition: Recognition;
  try { recognition = new Constructor(); }
  catch { callbacks.error('unavailable'); return null; }
  let ended = false;
  let started = false;
  let released = false;
  let transcript = '';
  let timer: ReturnType<typeof setTimeout> | undefined;
  const detach = () => {
    clearTimeout(timer);
    recognition.onstart = recognition.onresult = recognition.onerror = recognition.onend = null;
  };
  const cancel = () => {
    if (ended) return;
    ended = true;
    detach();
    try { recognition.abort(); } catch { /* Already ended by the browser. */ }
  };
  const fail = (error: string) => { if (ended) return; cancel(); callbacks.error(error); };
  const stop = () => {
    if (ended || released) return;
    released = true;
    if (!started) return; // Permission can resolve after the thumb is lifted.
    try { recognition.stop(); } catch { fail('unavailable'); }
  };
  recognition.lang = 'en-US';
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.onstart = () => {
    if (ended) return;
    started = true;
    if (released) {
      try { recognition.stop(); } catch { fail('unavailable'); }
    }
  };
  recognition.onresult = ({ results }) => {
    transcript = Array.from(results).filter((result) => result.isFinal).map((result) => result[0]?.transcript ?? '').join(' ').trim();
  };
  recognition.onerror = ({ error }) => fail(error);
  recognition.onend = () => {
    if (ended) return;
    ended = true;
    detach();
    callbacks.result(transcript);
  };
  try {
    recognition.start();
    // A browser that never ends must not leave the microphone running indefinitely.
    timer = setTimeout(() => fail('timeout'), 15_000);
  } catch { fail('unavailable'); return null; }
  return { stop, cancel };
}
