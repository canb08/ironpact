import { copy, fill } from './copy';

export interface PlateBarMember {
  name?: string | null;
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
  const namedMembers = members.map((member, index) => ({
    ...member,
    name: member.name?.trim() || (index === 0 ? copy.x1You : copy.x1Partner),
  }));
  const label = namedMembers.map((member) => fill(copy.x1PlateLabel, {
    name: member.name, credits: member.credits, target: member.target,
  })).join(copy.x1PlateSeparator);
  return <div className={`ui-plate-bar ${className}`} role="img" aria-label={label}>
    <div className="ui-plate-bar__labels" aria-hidden="true">
      {namedMembers.map((member, index) => <span key={index}>{member.name}</span>)}
    </div>
    <svg viewBox="0 0 343 112" aria-hidden="true" focusable="false">
      <path d="M 3 56 H 340" className="ui-plate-bar__shaft" />
      <path d="M 155 53 V 59 M 163 53 V 59 M 180 53 V 59 M 188 53 V 59" className="ui-plate-bar__grip" />
      <rect x={140} y={38} width={8} height={36} rx={3} className="ui-plate-bar__collar" />
      <rect x={195} y={38} width={8} height={36} rx={3} className="ui-plate-bar__collar" />
      {namedMembers.map((member, side) => {
        const states = plateStates(member);
        // Keep the 3px gaps; exceptionally dense MIN weeks narrow the plates to fit.
        const pitch = Math.min(17, 119 / states.length);
        const width = pitch - 3;
        return <g key={side} data-side={side === 0 ? 'you' : 'partner'}>
          {states.map((state, index) => <rect
            key={index}
            data-plate={state}
            x={side === 0 ? 137 - width - index * pitch : 206 + index * pitch}
            y={state === 'min' ? 28 : 12}
            width={width}
            height={state === 'min' ? 56 : 88}
            rx={3}
            className={`ui-plate-bar__plate ui-plate-bar__plate--${side === 0 ? 'you' : 'partner'} ui-plate-bar__plate--${state}`}
          />)}
        </g>;
      })}
    </svg>
    <div className="ui-plate-bar__labels ui-plate-bar__counts" aria-hidden="true">
      {namedMembers.map((member, index) => <span key={index}>{fill(copy.x1PlateCount, {
        credits: member.credits, target: member.target,
      })}</span>)}
    </div>
  </div>;
}
