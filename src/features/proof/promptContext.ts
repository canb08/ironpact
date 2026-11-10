import { createContext, useContext } from 'react';
import type { ProofEntryRef, ProofKind } from '../../core/types.ts';
export interface ProofPromptInput { kind: ProofKind; day: string; entryRef: ProofEntryRef; defaultTogether?: boolean }
export const ProofPromptContext = createContext<(input: ProofPromptInput) => void>(() => undefined);
export const useProofPrompt = () => useContext(ProofPromptContext);
