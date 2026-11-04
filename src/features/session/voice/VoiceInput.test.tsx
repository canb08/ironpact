// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copy } from '../../../ui/copy.ts';
import { feel } from '../../../ui/feel/feel.ts';
import VoiceMic, { type VoiceMicProps } from './VoiceMic.tsx';
import { VoiceInput } from './VoiceInput.tsx';
import { captureSpeech, type Recognition } from './recognition.ts';
import { recognitionConstructor } from './support.ts';
import SessionScreen from '../SessionScreen.tsx';
import { sessionHarness } from '../../../../tests/unit/features/session/harness.tsx';
import { skipRest } from '../../timer/useRestTimer.ts';

vi.mock('../../../ui/feel/feel.ts', () => ({ feel: vi.fn() }));

class FakeRecognition implements Recognition {
  static instances: FakeRecognition[] = [];
  static delayed = false;
  lang = ''; continuous = true; interimResults = true; maxAlternatives = 0;
  onstart: Recognition['onstart'] = null;
  onresult: Recognition['onresult'] = null;
  onerror: Recognition['onerror'] = null;
  onend: Recognition['onend'] = null;
  start = vi.fn(() => { if (!FakeRecognition.delayed) this.onstart?.(); });
  stop = vi.fn(); abort = vi.fn();
  constructor() { FakeRecognition.instances.push(this); }
  result(text: string, isFinal = true) { this.onresult?.({ results: [{ isFinal, 0: { transcript: text } }] }); }
  end() { this.onend?.(); }
}
const latest = () => FakeRecognition.instances.at(-1)!;
const draft = vi.fn();
const props: VoiceMicProps = { kg: 80, reps: 5, same: { kg: 75, reps: 8 }, minKg: 0, maxKg: 500,
  disabled: false, reduced: true, onDraft: draft };
const mic = () => screen.getByRole('button', { name: copy.y7Hold });
function down() { fireEvent.keyDown(mic(), { key: ' ' }); }
function up() { fireEvent.keyUp(mic(), { key: ' ' }); }
function finish(text: string) { act(() => { latest().result(text); latest().end(); }); }

beforeEach(() => {
  FakeRecognition.instances = []; FakeRecognition.delayed = false;
  vi.stubGlobal('SpeechRecognition', FakeRecognition);
  vi.stubGlobal('webkitSpeechRecognition', undefined);
  vi.mocked(feel).mockClear(); draft.mockClear();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); skipRest(); });

describe('voice dock', () => {
  it('hides entirely without either constructor, including nonfunction browser properties', () => {
    vi.stubGlobal('SpeechRecognition', {});
    render(<VoiceInput {...props} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(recognitionConstructor()).toBeUndefined();
  });
  it('loads the lazy mic with the prefixed API', async () => {
    vi.stubGlobal('SpeechRecognition', undefined);
    vi.stubGlobal('webkitSpeechRecognition', FakeRecognition);
    render(<VoiceInput {...props} />);
    expect(await screen.findByRole('button', { name: copy.y7Hold })).toBeTruthy();
    expect(FakeRecognition.instances).toHaveLength(0);
  });
  it('fills a draft only after a final result ends; release and click never submit its form', () => {
    const submit = vi.fn((event) => event.preventDefault());
    render(<form onSubmit={submit}><VoiceMic {...props} /></form>);
    down();
    expect(latest().lang).toBe('en-US');
    expect(latest().interimResults).toBe(false);
    act(() => latest().result('ninety by five', false));
    expect(draft).not.toHaveBeenCalled();
    up();
    expect(latest().stop).toHaveBeenCalledOnce();
    expect(draft).not.toHaveBeenCalled();
    finish('ninety by five');
    expect(draft).toHaveBeenCalledExactlyOnceWith({ kg: 90, reps: 5 });
    fireEvent.click(mic());
    expect(submit).not.toHaveBeenCalled();
    expect(feel).toHaveBeenLastCalledWith('tick', { reducedMotion: true });
  });
  it.each([
    ['same again', { kg: 75, reps: 8 }], ['plus two and a half', { kg: 82.5, reps: 5 }],
    ['six reps', { kg: 80, reps: 6 }],
  ])('applies %s to the draft', (phrase, expected) => {
    render(<VoiceMic {...props} />); down(); up(); finish(phrase);
    expect(draft).toHaveBeenCalledExactlyOnceWith(expected);
  });
  it('supports pointer holds without a click committing anything', () => {
    render(<VoiceMic {...props} />);
    fireEvent.pointerDown(mic(), { button: 0, pointerId: 4 });
    expect(latest().start).toHaveBeenCalledOnce();
    fireEvent.pointerUp(mic(), { pointerId: 4 });
    finish('100 kilos for 3');
    expect(draft).toHaveBeenCalledExactlyOnceWith({ kg: 100, reps: 3 });
  });
  it('stops after delayed microphone permission even if released before onstart', () => {
    FakeRecognition.delayed = true;
    render(<VoiceMic {...props} />); down(); up();
    expect(latest().stop).not.toHaveBeenCalled();
    act(() => latest().onstart?.());
    expect(latest().stop).toHaveBeenCalledOnce();
    finish('ninety by five');
    expect(draft).toHaveBeenCalledOnce();
  });
  it.each(['Escape', 'blur', 'pointercancel', 'lostpointercapture', 'unmount', 'disabled'])('cancels on %s and ignores late results', (reason) => {
    const view = render(<VoiceMic {...props} />);
    if (reason === 'lostpointercapture') fireEvent.pointerDown(mic(), { button: 0, pointerId: 4 });
    else down();
    const staleEnd = latest().onend;
    const staleError = latest().onerror;
    if (reason === 'Escape') fireEvent.keyDown(mic(), { key: 'Escape' });
    if (reason === 'blur') fireEvent(window, new Event('blur'));
    if (reason === 'pointercancel') fireEvent.pointerCancel(mic());
    if (reason === 'lostpointercapture') fireEvent.lostPointerCapture(mic());
    if (reason === 'unmount') view.unmount();
    if (reason === 'disabled') view.rerender(<VoiceMic {...props} disabled />);
    act(() => { latest().result('ninety by five'); staleEnd?.(); staleError?.({ error: 'network' }); });
    expect(latest().abort).toHaveBeenCalledOnce();
    expect(draft).not.toHaveBeenCalled();
    expect(feel).toHaveBeenCalledTimes(1);
  });
  it('never starts when disabled or repeats recognition on held-key repeats', () => {
    const view = render(<VoiceMic {...props} disabled />); down();
    expect(FakeRecognition.instances).toHaveLength(0);
    view.rerender(<VoiceMic {...props} />); down();
    fireEvent.keyDown(mic(), { key: ' ', repeat: true });
    expect(FakeRecognition.instances).toHaveLength(1);
  });
  it.each(['', 'hello', 'minus one hundred', '501 by 5'])('preserves the draft for rejected speech: %s', (text) => {
    render(<VoiceMic {...props} />); down(); up(); finish(text);
    expect(draft).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toBe(copy.y7Unclear);
    expect(feel).toHaveBeenLastCalledWith('error', { reducedMotion: true });
  });
  it('enforces the smaller added-weight limit', () => {
    render(<VoiceMic {...props} minKg={-100} maxKg={200} />); down(); up(); finish('250 by 5');
    expect(draft).not.toHaveBeenCalled();
  });
  it('shows permission feedback and allows a new hold after errors', () => {
    render(<VoiceMic {...props} />); down();
    act(() => latest().onerror?.({ error: 'not-allowed' }));
    expect(screen.getByRole('status').textContent).toBe(copy.y7Blocked);
    down(); up(); finish('90 by 5');
    expect(draft).toHaveBeenCalledOnce();
  });
  it('bounds a recognition session that never ends', () => {
    vi.useFakeTimers(); render(<VoiceMic {...props} />); down();
    act(() => vi.advanceTimersByTime(15_000));
    expect(latest().abort).toHaveBeenCalledOnce();
    expect(screen.getByRole('status').textContent).toBe(copy.y7Unavailable);
    expect(draft).not.toHaveBeenCalled();
  });
  it('handles a thrown start and stop without leaving a live mic', () => {
    const result = vi.fn(), error = vi.fn();
    const capture = captureSpeech({ result, error });
    latest().stop.mockImplementation(() => { throw new Error('unavailable'); });
    capture?.stop();
    expect(error).toHaveBeenCalledWith('unavailable');
    expect(result).not.toHaveBeenCalled();
    vi.stubGlobal('SpeechRecognition', class extends FakeRecognition { override start = vi.fn<() => void>(() => { throw new Error('blocked'); }); });
    expect(captureSpeech({ result, error })).toBeNull();
  });
});

it('fills the real ghost row and writes exactly once only after the confirming Log set tap', async () => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  const harness = await sessionHarness();
  try {
    await harness.exercise();
    const log = vi.spyOn(harness.repo.w, 'logSet');
    harness.render(<SessionScreen />);
    const picker = await screen.findByRole('dialog', { name: copy.pickerTitle });
    fireEvent.click(await within(picker).findByRole('button', { name: 'Bench press' }));
    await screen.findByRole('button', { name: copy.y7Hold });
    down(); up(); finish('ninety by five');
    await waitFor(() => expect(document.querySelector('.session-ghost')?.textContent).toContain('90'));
    expect(screen.getByRole('slider', { name: copy.kg }).getAttribute('aria-valuenow')).toBe('90');
    expect(log).not.toHaveBeenCalled();
    const session = await harness.repo.q.openSession();
    expect(await harness.repo.q.setsOfSession(session!.id)).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: copy.x4Log }));
    await waitFor(() => expect(log).toHaveBeenCalledTimes(1));
    await waitFor(async () => expect((await harness.repo.q.setsOfSession(session!.id)).map((set) => [set.weight_kg, set.reps])).toEqual([[90, 5]]));
  } finally { cleanup(); await harness.close(); }
});
