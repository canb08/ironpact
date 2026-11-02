import { Link, useNavigate, useParams } from 'react-router';
import { Sheet, copy } from '../../ui';
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
  if (!isKind(kind)) {
    return (
      <main className="ql-missing">
        <p>{copy.unknownKind}</p>
        <Link className="ui-button ui-button--secondary" to="/">{copy.x3Today}</Link>
      </main>
    );
  }
  return (
    <Sheet open title={TITLES[kind]} onClose={() => navigate('/')}>
      {kind === 'run' ? <RunForm /> : null}
      {kind === 'martial' ? <MartialForm /> : null}
      {kind === 'weight' ? <WeightForm /> : null}
      {kind === 'min' ? <MinForm /> : null}
    </Sheet>
  );
}
