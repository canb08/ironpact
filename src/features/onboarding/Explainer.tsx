import { useEffect, useRef, useState } from 'react';
import { Button } from '../../ui/Button.tsx';
import { BigNumber } from '../../ui/BigNumber.tsx';
import { Chip } from '../../ui/Chip.tsx';
import { PlateBar } from '../../ui/PlateBar.tsx';
import { copy, fill } from '../../ui/copy.ts';

const cards = [
  { title: copy.x9Sessions, body: copy.x9SessionsBody },
  { title: copy.x9Bar, body: copy.x9BarBody },
  { title: copy.x9Prs, body: copy.x9PrsBody },
];

export function Explainer({ onFinish, pending, error }: { onFinish: () => void; pending: boolean; error: string | null }) {
  const [index, setIndex] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [index]);
  const card = cards[index]!;
  return <section className="onboarding-guide" aria-label={copy.x9Explainer}>
    <p className="onboarding-hint">{fill(copy.x9GuidePosition, { current: index + 1, total: cards.length })}</p>
    <h1 ref={heading} tabIndex={-1}>{card.title}</h1>
    <div className="onboarding-guide__visual" aria-hidden="true">
      {index === 0 ? <BigNumber value={10} size="mega" /> : index === 1 ? <PlateBar members={[
        { credits: 2.5, target: 3, minCount: 1 }, { credits: 3, target: 3 },
      ]} /> : <><BigNumber value={2} size="mega" /><Chip tone="pr">{copy.x9PrBadge}</Chip></>}
    </div>
    <p>{card.body}</p>
    {error && <p role="alert">{error}</p>}
    <div className="onboarding-actions">
      <Button size="xl" disabled={pending} onClick={index === 2 ? onFinish : () => setIndex((value) => value + 1)}>
        {pending ? copy.x9Saving : index === 2 ? copy.x9Finish : copy.x9Next}
      </Button>
      {index > 0 && <Button variant="secondary" disabled={pending} onClick={() => setIndex((value) => value - 1)}>{copy.x9Back}</Button>}
      <Button variant="quiet" disabled={pending} onClick={onFinish}>{copy.x9Skip}</Button>
    </div>
  </section>;
}
