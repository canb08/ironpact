import { copy, fill } from './copy';

export interface PlateBarMember {
  name: string;
  credits: number;
  target: number;
  minCount?: number;
}

export interface PlateBarProps {
  members: readonly [PlateBarMember, PlateBarMember];
  className?: string;
}

function plateStates(member: PlateBarMember): Array<'full' | 'min' | 'empty'> {
  const credits = Math.max(0, Number.isFinite(member.credits) ? member.credits : 0);
  const target = Math.max(1, Math.min(7, Math.floor(member.target) || 1));
  const mins = Math.min(Math.floor(credits * 2), Math.max(0, Math.floor(member.minCount ?? (credits % 1 >= 0.5 ? 1 : 0))));
  const full = Math.max(0, Math.floor(credits - mins * 0.5));
  const states: Array<'full' | 'min' | 'empty'> = [];
  for (let index = 0; index < Math.min(full, target); index++) states.push('full');
  const visibleMins = Math.min(mins, (target - full) * 2);
  for (let index = 0; index < visibleMins; index++) states.push('min');
  const loaded = states.reduce((sum, state) => sum + (state === 'min' ? 0.5 : 1), 0);
  for (let index = 0; index < Math.ceil(target - loaded); index++) states.push('empty');
  return states;
}

/** Owner colour, side, thickness and a text alternative all carry the same information. */
export function PlateBar({ members, className = '' }: PlateBarProps) {
  const label = members.map((member) => fill(copy.x1PlateLabel, {
    name: member.name, credits: member.credits, target: member.target,
  })).join(copy.x1PlateSeparator);
  return <div className={`ui-plate-bar ${className}`} role="img" aria-label={label}>
    <div className="ui-plate-bar__labels" aria-hidden="true">
      {members.map((member, index) => <span key={index}>{member.name}</span>)}
    </div>
    <svg viewBox="0 0 320 80" aria-hidden="true" focusable="false">
      <path d="M 8 40 H 312" className="ui-plate-bar__shaft" />
      <path d="M 136 36 V 44 M 144 36 V 44 M 176 36 V 44 M 184 36 V 44" className="ui-plate-bar__grip" />
      {members.map((member, side) => {
        const states = plateStates(member);
        const gap = Math.min(15, 105 / Math.max(1, states.length));
        return <g key={side} data-side={side === 0 ? 'you' : 'partner'}>
          {states.map((state, index) => <rect
            key={index}
            data-plate={state}
            x={side === 0 ? 119 - index * gap : 193 + index * gap}
            y={state === 'min' ? 15 : 8}
            width={state === 'min' ? 4 : 8}
            height={state === 'min' ? 50 : 64}
            rx={2}
            className={`ui-plate-bar__plate ui-plate-bar__plate--${side === 0 ? 'you' : 'partner'} ui-plate-bar__plate--${state}`}
          />)}
        </g>;
      })}
    </svg>
    <div className="ui-plate-bar__labels ui-plate-bar__counts" aria-hidden="true">
      {members.map((member, index) => <span key={index}>{fill(copy.x1PlateCount, {
        credits: member.credits, target: member.target,
      })}</span>)}
    </div>
  </div>;
}
