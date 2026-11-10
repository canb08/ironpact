import { lazy, Suspense, useState, type ReactNode } from 'react';
import { ProofPromptContext, type ProofPromptInput } from './promptContext.ts';
const Prompt = lazy(() => import('./ProofPrompt.tsx'));
export function ProofPromptProvider({ children, defer = false }: { children: ReactNode; defer?: boolean }) {
  const [input, setInput] = useState<ProofPromptInput | null>(null);
  return <ProofPromptContext value={setInput}>
    {children}
    {input && !defer && <Suspense fallback={null}><Prompt key={input.entryRef.id} input={input} onDone={() => setInput((current) => current?.entryRef.id === input.entryRef.id ? null : current)} /></Suspense>}
  </ProofPromptContext>;
}
