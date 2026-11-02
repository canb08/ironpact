import { useId } from 'react';
import { copy, fill } from './copy';

/** Co-op ring is 220px / 18px; the personal ring is the same component at 140px / 14px (§3.9.1). */
const SIZES = {
  personal: { px: 140, stroke: 14 },
  coop: { px: 220, stroke: 18 },
} as const;

/** Segments are separated by 6° gaps and start at 12 o'clock (§3.9.1). */
const GAP_DEG = 6;

export type RingSize = keyof typeof SIZES;

export type RingMember = {
  id: string;
  name: string;
  initial: string;
  /** CSS color. Patterns come from join order, not from this color (§3.2.2). */
  color: string;
  /** Weekly target, normally 1–7. */
  target: number;
  /** Credits this week. A MIN is 0.5. */
  credits: number;
  minCount?: number;
};

export type RingProps = {
  members: readonly RingMember[];
  /** Defaults to personal for one member and coop otherwise. */
  size?: RingSize;
  className?: string;
};

type Segment = {
  member: RingMember;
  memberIndex: number;
  index: number;
  start: number;
  sweep: number;
  gap: number;
};

type Pattern = 'solid' | 'hatch' | 'dots';

function formatCredit(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function patternFor(index: number): Pattern {
  const slot = ((index % 3) + 3) % 3;
  if (slot === 1) return 'hatch';
  if (slot === 2) return 'dots';
  return 'solid';
}

function segmentState(credits: number, index: number): 'empty' | 'min' | 'full' {
  if (credits + 1e-9 >= index + 1) return 'full';
  if (credits + 1e-9 >= index + 0.5) return 'min';
  return 'empty';
}

/** Accessible name. The viewer's own credits lead, then each partner (§3.9.1, P3D). */
function ringLabel(members: readonly RingMember[]): string {
  const capacity = members.reduce((sum, member) => sum + member.target, 0);
  const done = members.reduce((sum, member) => sum + member.credits, 0);
  const mins = members.reduce((sum, member) => sum + (member.minCount ?? 0), 0);
  const detail = members
    .map((member, index) => {
      const credits = formatCredit(member.credits);
      return index === 0
        ? fill(copy.ringOf, { credits, target: member.target })
        : fill(copy.ringNamed, { name: member.name, credits, target: member.target });
    })
    .join(' · ');
  const template = mins > 0 ? copy.ringWeekMins : copy.ringWeek;
  return fill(template, {
    done: formatCredit(done),
    capacity,
    detail,
    mins,
  });
}

/**
 * One contiguous arc per member.
 * Two members climb from 12 o'clock toward 6 (A clockwise, B counter-clockwise).
 * Three or more go clockwise in join order (§3.9.1).
 */
function ringSegments(members: readonly RingMember[]): Segment[] {
  const slots: { member: RingMember; memberIndex: number; index: number }[] = [];
  if (members.length === 2) {
    const first = members[0];
    const second = members[1];
    if (first) {
      for (let index = 0; index < first.target; index += 1) {
        slots.push({ member: first, memberIndex: 0, index });
      }
    }
    if (second) {
      for (let index = second.target - 1; index >= 0; index -= 1) {
        slots.push({ member: second, memberIndex: 1, index });
      }
    }
  } else {
    members.forEach((member, memberIndex) => {
      for (let index = 0; index < member.target; index += 1) {
        slots.push({ member, memberIndex, index });
      }
    });
  }
  if (slots.length === 0) return [];
  const gap = Math.min(GAP_DEG, 360 / slots.length / 2);
  const sweep = (360 - gap * slots.length) / slots.length;
  const step = sweep + gap;
  const origin = gap / 2;
  return slots.map((slot, slotIndex) => ({
    ...slot,
    start: Math.round((origin + slotIndex * step) * 1000) / 1000,
    sweep: Math.round(sweep * 1000) / 1000,
    gap: Math.round(gap * 1000) / 1000,
  }));
}

function polar(cx: number, cy: number, radius: number, deg: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + radius * Math.sin(rad), y: cy - radius * Math.cos(rad) };
}

function arcPath(cx: number, cy: number, radius: number, start: number, sweep: number): string {
  const from = polar(cx, cy, radius, start);
  const to = polar(cx, cy, radius, start + sweep);
  const large = sweep > 180 ? 1 : 0;
  return `M ${from.x} ${from.y} A ${radius} ${radius} 0 ${large} 1 ${to.x} ${to.y}`;
}

export function Ring({ members, size, className = '' }: RingProps) {
  const uid = useId().replace(/:/g, '');
  const resolved = size ?? (members.length > 1 ? 'coop' : 'personal');
  const { px, stroke } = SIZES[resolved];
  const label = ringLabel(members);
  const segments = ringSegments(members);
  const capacity = members.reduce((sum, member) => sum + member.target, 0);
  const done = members.reduce((sum, member) => sum + member.credits, 0);
  const cx = px / 2;
  const cy = px / 2;
  const radius = px / 2 - stroke / 2 - 6;
  const titleId = `${uid}-title`;
  const countSize = resolved === 'personal' ? 28 : 44;

  return (
    <div className={`ui-edge-steel ${className}`.trim()} style={{ borderRadius: 'var(--r-lg)', background: 'var(--surface-1)', padding: 'var(--s-3)' }}>
      <svg
        width={px}
        height={px}
        viewBox={`0 0 ${px} ${px}`}
        role="img"
        aria-labelledby={titleId}
        style={{ display: 'block', marginInline: 'auto' }}
      >
        <title id={titleId}>{label}</title>
        <defs>
          <pattern id={`${uid}-hatch`} patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
            <rect width="2" height="5" fill="rgba(10,10,11,0.25)" />
          </pattern>
          <pattern id={`${uid}-dots`} patternUnits="userSpaceOnUse" width="6" height="6">
            <circle cx="1.5" cy="1.5" r="1" fill="rgba(10,10,11,0.35)" />
          </pattern>
        </defs>
        {segments.map((segment) => {
          const state = segmentState(segment.member.credits, segment.index);
          const width = state === 'min' ? stroke / 2 : stroke;
          const pattern = patternFor(segment.memberIndex);
          const path = arcPath(cx, cy, radius, segment.start, segment.sweep);
          const key = `${segment.member.id}-${segment.index}`;
          return (
            <g key={key}>
              {state === 'min' && (
                <path d={path} fill="none" stroke="var(--line)" strokeWidth={stroke} strokeLinecap="round" />
              )}
              <path
                d={path}
                fill="none"
                stroke={state === 'empty' ? 'var(--line)' : segment.member.color}
                strokeWidth={width}
                strokeLinecap="round"
                data-segment=""
                data-member={segment.member.id}
                data-index={segment.index}
                data-start={segment.start}
                data-sweep={segment.sweep}
                data-gap={segment.gap}
                data-state={state}
                data-pattern={state === 'empty' ? 'none' : pattern}
              />
              {state !== 'empty' && pattern !== 'solid' && (
                <path
                  d={path}
                  fill="none"
                  stroke={`url(#${uid}-${pattern})`}
                  strokeWidth={width}
                  strokeLinecap="round"
                />
              )}
            </g>
          );
        })}
        {members.map((member, memberIndex) => {
          const extra = Math.max(0, Math.floor(member.credits - member.target + 1e-9));
          const owned = segments.filter((segment) => segment.memberIndex === memberIndex);
          if (owned.length === 0 || extra === 0) return null;
          const end = Math.max(...owned.map((segment) => segment.start + segment.sweep));
          const outer = radius + stroke / 2 + 3;
          return Array.from({ length: extra }, (_, tick) => {
            const angle = end - 4 - tick * 8;
            const inner = polar(cx, cy, outer, angle);
            const tip = polar(cx, cy, outer + 6, angle);
            return (
              <line
                key={`${member.id}-tick-${tick}`}
                x1={inner.x}
                y1={inner.y}
                x2={tip.x}
                y2={tip.y}
                stroke="var(--text)"
                strokeWidth={2}
                strokeLinecap="round"
                data-tick=""
                data-member={member.id}
              />
            );
          });
        })}
        <text
          x={cx}
          y={cy - (resolved === 'personal' ? 18 : 28)}
          textAnchor="middle"
          fill="var(--text-muted)"
          fontFamily="var(--font-body)"
          fontSize={resolved === 'personal' ? 10 : 12}
          fontWeight={600}
          letterSpacing="0.08em"
        >
          {copy.ringThisWeek}
        </text>
        <text
          x={cx}
          y={cy + (resolved === 'personal' ? 8 : 12)}
          textAnchor="middle"
          fill="var(--text)"
          fontFamily="var(--font-display)"
          fontSize={countSize}
          fontWeight={800}
        >
          {fill(copy.ringCount, { done: formatCredit(done), capacity })}
        </text>
        <text
          x={cx}
          y={cy + (resolved === 'personal' ? 26 : 40)}
          textAnchor="middle"
          fill="var(--text-muted)"
          fontFamily="var(--font-body)"
          fontSize={resolved === 'personal' ? 11 : 14}
        >
          {copy.ringResets}
        </text>
      </svg>
      <ul style={{ listStyle: 'none', margin: 'var(--s-3) 0 0', padding: 0 }}>
        {members.map((member) => (
          <li
            key={member.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--s-2)',
              minHeight: 48,
              color: 'var(--text)',
              fontFamily: 'var(--font-body)',
            }}
          >
            <span aria-hidden="true" style={{ width: 3, alignSelf: 'stretch', background: member.color }} />
            <span
              aria-hidden="true"
              style={{
                width: 20,
                height: 20,
                flex: '0 0 auto',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 'var(--r-full)',
                border: '1px solid var(--line-steel-b)',
                background: 'var(--surface-2)',
                color: member.color,
                fontWeight: 700,
                fontSize: 11,
              }}
            >
              {member.initial}
            </span>
            <span style={{ flex: '1 1 auto', minWidth: 0 }}>{member.name}</span>
            <span style={{ fontFamily: 'var(--font-data)', fontVariantNumeric: 'tabular-nums' }}>
              {fill(copy.ringRow, {
                credits: formatCredit(member.credits),
                target: member.target,
                mins: member.minCount ?? 0,
              })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
