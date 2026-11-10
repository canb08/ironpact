import { type ProofPromptInput, useProofPrompt } from '../proof/promptContext.ts';
import { Link, useNavigate, useParams } from 'react-router';
import { Sheet, ToastProvider, copy } from '../../ui';
import { MartialForm } from './MartialForm.tsx';
import { MinForm } from './MinForm.tsx';
import { RunForm } from './RunForm.tsx';
import { WeightForm } from './WeightForm.tsx';
import './quicklog.css';

const TITLES = {
  run: copy.x3Run,
  martial: copy.x3Fight,
  weight: copy.x3WeighIn,
  min: copy.x3Min,
} as const;

type Kind = keyof typeof TITLES;

function isKind(value: string | undefined): value is Kind {
  return value === 'run' || value === 'martial' || value === 'weight' || value === 'min';
}

export default function QuickLogScreen() {
  const { kind } = useParams();
  const navigate = useNavigate();
  const prompt = useProofPrompt();
  const saved = (input: ProofPromptInput) => {
    void Promise.resolve(navigate('/')).then(() => prompt(input));
  };
  if (!isKind(kind)) {
    return (
      <main className="ql-missing">
        <p>{copy.unknownKind}</p>
        <Link className="ui-button ui-button--secondary" to="/">{copy.x3Today}</Link>
      </main>
    );
  }
  return (
    <Sheet open title={TITLES[kind]} onClose={() => navigate('/')}><ToastProvider>
      {kind === 'run' ? <RunForm onSaved={(entry) => { saved({ kind: 'run', day: entry.local_date, entryRef: { table: 'cardio_entries', id: entry.id } }); }} /> : null}
      {kind === 'martial' ? <MartialForm onSaved={(entry) => { saved({ kind: 'muay_thai', day: entry.local_date, entryRef: { table: 'martial_entries', id: entry.id }, defaultTogether: entry.note?.startsWith(copy.y2Pads) }); }} /> : null}
      {kind === 'weight' ? <WeightForm /> : null}
      {kind === 'min' ? <MinForm /> : null}
    </ToastProvider></Sheet>
  );
}
