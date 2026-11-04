import type { RecognitionConstructor } from './recognition.ts';

/** MDN: SpeechRecognition has limited availability; presence is not permission. */
export function recognitionConstructor(): RecognitionConstructor | undefined {
  if (typeof window === 'undefined') return undefined;
  const api = window as Window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  if (typeof api.SpeechRecognition === 'function') return api.SpeechRecognition;
  if (typeof api.webkitSpeechRecognition === 'function') return api.webkitSpeechRecognition;
  return undefined;
}
