import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { Button, copy, fill } from '../../ui';
import { feel } from '../../ui/feel/feel.ts';
import { DOCK_PLATES, plateColour, sleevePlates } from '../plate-calc/plateLoad.ts';

export function PlateLoader({ kg, barKg, available, disabled, removing, onChange }: {
  kg: number; barKg: number; available: readonly number[]; disabled: boolean; removing: boolean;
  onChange: (kg: number) => void;
}) {
  const hint = useId();
  const [loaded, setLoaded] = useState<{ kg: number; bar: number; available: readonly number[]; plates: number[] } | null>(null);
  const plates = loaded?.kg === kg && loaded.bar === barKg && loaded.available === available
    ? loaded.plates : sleevePlates(kg, barKg, available);
  const held = useRef(false);
  const press = useRef<{ timer: number; x: number; y: number } | null>(null);
  const cancel = () => { if (press.current) window.clearTimeout(press.current.timer); press.current = null; };
  useEffect(() => cancel, []);
  const change = (plate: number, remove: boolean) => {
    if (disabled) return;
    const next = [...plates];
    if (remove) {
      const index = next.lastIndexOf(plate);
      if (index < 0) return;
      next.splice(index, 1);
    } else next.push(plate);
    const nextKg = remove ? kg - plate * 2 : Math.max(barKg, kg) + plate * 2;
    if (!Number.isFinite(nextKg) || nextKg < barKg || nextKg > 500) return;
    const value = Math.round(nextKg * 1000) / 1000;
    setLoaded({ kg: value, bar: barKg, available, plates: next });
    onChange(value);
    feel('tick');
  };
  return <div className="session-loader">
    <div className="session-mini-bar" role="img" aria-label={fill(copy.y3LoadedBar, { bar: barKg, kg: Number.isFinite(kg) ? kg : 0 })}>
      <span className="session-bar-shaft" />
      {[-1, 1].map((side) => <span className={`session-sleeve session-sleeve--${side === -1 ? 'left' : 'right'}`} key={side} aria-hidden="true">
        {plates.map((plate, index) => <span className="session-mini-plate" key={`${index}-${plate}`}
          style={{ '--plate-mass': .6 + Math.min(25, plate) / 25, '--plate-colour': plateColour(plate), '--plate-height': `${Math.max(10, Math.min(28, plate + 8))}px` } as CSSProperties} />)}
      </span>)}
      <span className="session-bar-label" aria-hidden="true">{barKg} {copy.kg}</span>
    </div>
    <span id={hint} className="session-sr-only">{copy.y3PlateHint}</span>
    <div className="session-plate-chips" role="group" aria-label={copy.y3Plates} aria-describedby={hint}>
      {DOCK_PLATES.map((plate) => <Button key={plate} className="session-plate-chip" variant="secondary"
        disabled={disabled || !available.includes(plate)} style={{ '--plate-colour': plateColour(plate) } as CSSProperties}
        aria-label={fill(removing ? copy.y3RemovePair : copy.y3AddPair, { kg: plate })}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          cancel(); held.current = false;
          press.current = { x: event.clientX, y: event.clientY, timer: window.setTimeout(() => {
            held.current = true; change(plate, true); press.current = null;
          }, 600) };
        }}
        onPointerMove={(event) => { if (press.current && Math.hypot(event.clientX - press.current.x, event.clientY - press.current.y) > 8) { cancel(); held.current = true; } }}
        onPointerUp={cancel} onPointerCancel={() => { cancel(); held.current = true; }} onPointerLeave={cancel}
        onContextMenu={(event) => event.preventDefault()}
        onKeyDown={(event) => { if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); change(plate, true); } }}
        onClick={() => { if (held.current) { held.current = false; return; } change(plate, removing); }}>{plate}</Button>)}
    </div>
  </div>;
}
