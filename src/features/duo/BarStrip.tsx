import { copy } from '../../ui/copy.ts';
import { BigNumber, Button } from '../../ui';
import { barTier, platesAfterDebugClose } from './view.ts';
import { ForgeFlame } from './ForgeFlame.tsx';

export function BarStrip({
  plates,
  ghost,
  archived,
  adjusted,
  debugClose,
  onDismissAdjusted,
  platesTestId,
  reduced = false,
  batterySaver = false,
}: {
  plates: number;
  ghost: boolean;
  archived: boolean;
  adjusted: boolean;
  debugClose: boolean;
  onDismissAdjusted: () => void;
  platesTestId?: string;
  reduced?: boolean;
  batterySaver?: boolean;
}) {
  const shown = debugClose ? platesAfterDebugClose(plates) : plates;
  const tier = barTier(shown);
  return (
    <section className={`bar-strip${archived ? ' is-archived' : ''}`} aria-label={copy.platesLabel}>
      <div className="bar-strip__main">
        <p className="bar-tier" data-testid={platesTestId ? 'bar-tier' : undefined}>{tier}</p>
        <BigNumber data-testid={platesTestId} value={shown} unit={copy.platesLabel} size="xl" />
        {archived ? <p className="bar-note">{copy.archived}</p> : null}
        {ghost && !debugClose && !archived ? (
          <p className="bar-ghost" data-testid="ghost-plate">{copy.weekTargetHit}</p>
        ) : null}
        {debugClose ? <p role="status" data-testid={platesTestId ? 'debug-week' : undefined}>{copy.plateAdded}</p> : null}
        {adjusted ? (
          <p className="bar-note">
            {copy.barAdjusted}{' '}
            <Button variant="ghost" onClick={onDismissAdjusted}>{copy.dismiss}</Button>
          </p>
        ) : null}
      </div>
      <ForgeFlame plates={shown} tier={tier} reduced={reduced} batterySaver={batterySaver} />
    </section>
  );
}