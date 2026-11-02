/** Minimal types for the lazy `canvas-confetti` import. The package ships no types. */
declare module 'canvas-confetti' {
  export interface Options {
    particleCount?: number;
    angle?: number;
    spread?: number;
    startVelocity?: number;
    decay?: number;
    gravity?: number;
    ticks?: number;
    origin?: { x?: number; y?: number };
    colors?: string[];
    shapes?: ReadonlyArray<string | Shape>;
    scalar?: number;
    zIndex?: number;
    disableForReducedMotion?: boolean;
  }
  export interface Shape {
    readonly type?: string;
  }
  export interface ConfettiFn {
    (options?: Options): Promise<undefined> | null;
    shapeFromPath(path: { path: string; matrix?: number[] } | string): Shape;
    reset(): void;
  }
  const confetti: ConfettiFn;
  export default confetti;
}
