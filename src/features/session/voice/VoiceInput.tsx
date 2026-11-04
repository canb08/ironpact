import { lazy, Suspense, type ComponentType } from 'react';
import { recognitionConstructor } from './support.ts';
import type { VoiceMicProps } from './VoiceMic.tsx';

// An optional chunk can be unavailable on a first visit in airplane mode.
// Keep the existing dock usable instead of bubbling to the route error screen.
const VoiceMic = lazy<ComponentType<VoiceMicProps>>(() => import('./VoiceMic.tsx').catch(() => ({ default: () => null })));

/** No empty control or lazy request on browsers without either speech API. */
export function VoiceInput(props: VoiceMicProps) {
  if (!recognitionConstructor()) return null;
  return <Suspense fallback={null}><VoiceMic {...props} /></Suspense>;
}
