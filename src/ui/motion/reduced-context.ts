import { createContext, useContext } from 'react';

/** Combined OS + profile flag. MotionProvider publishes it; default is motion on. */
export const MotionReducedContext = createContext(false);

export function useMotionReduced(): boolean {
  return useContext(MotionReducedContext);
}
