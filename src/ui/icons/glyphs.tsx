import type { ReactNode, SVGProps } from 'react';

type GlyphProps = SVGProps<SVGSVGElement>;

function Glyph({ children, ...props }: GlyphProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function BarbellGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M2 12h20" />
      <path d="M5 8v8M8 9.5v5M16 9.5v5M19 8v8" />
    </Glyph>
  );
}

export function PlateGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="2" />
    </Glyph>
  );
}

export function KettlebellGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M9 10.5a3 3 0 0 1 6 0" />
      <circle cx="12" cy="15" r="5" />
    </Glyph>
  );
}

export function BeltGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M3 9h18v6H3z" />
      <path d="M10 8h4v8h-4z" />
    </Glyph>
  );
}

export function ShoeGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M3 16h18v2H3z" />
      <path d="M5 16v-2l3-4h5l2 3h5" />
    </Glyph>
  );
}

export function ScaleGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <rect x="4" y="8" width="16" height="10" />
      <circle cx="12" cy="13" r="2" />
    </Glyph>
  );
}

export function MinGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M8 11l4 4 4-4" />
    </Glyph>
  );
}

export function FlameGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M12 3l4 7-4 11-4-11z" />
      <path d="M12 10v7" />
    </Glyph>
  );
}

export function HandprintGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M8 20V13M11 20V10M14 20V10M17 20v-6" />
      <path d="M7 14c.4 3 2.2 5 5 5s4.6-2 5-5" />
    </Glyph>
  );
}

export function StopwatchGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="14" r="6" />
      <path d="M12 14V11M10 4h4M12 4v3" />
    </Glyph>
  );
}
