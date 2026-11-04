import { lazy, Suspense } from 'react';
import { recognitionConstructor } from './support.ts';
import type { VoiceMicProps } from './VoiceMic.tsx';

const VoiceMic = lazy(() => import('./VoiceMic.tsx'));

/** No empty control or lazy request on browsers without either speech API. */
export function VoiceInput(props: VoiceMicProps) {
  if (!recognitionConstructor()) return null;
  return <Suspense fallback={null}><VoiceMic {...props} /></Suspense>;
}
