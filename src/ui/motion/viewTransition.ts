import { SPRING_EASE, SPRING_MS } from './springs';
import { mediaPrefersReducedMotion } from './reduced';

let active: ReturnType<Document['startViewTransition']> | undefined;

/** Feature-detected. A new navigation can interrupt the previous animation. */
export function startViewTransition(
  update: () => void | Promise<void>,
  reduced = false,
): 'transition' | 'instant' {
  active?.skipTransition?.();
  if (
    reduced || mediaPrefersReducedMotion()
    || typeof document === 'undefined'
    || document.documentElement.dataset.reducedMotion === 'on'
    || typeof document.startViewTransition !== 'function'
  ) {
    if (typeof document !== 'undefined') delete document.documentElement.dataset.tabTransition;
    void update();
    return 'instant';
  }
  document.documentElement.dataset.tabTransition = 'on';
  const boxes = () => ['exercise-name', 'exercise-chart'].flatMap((name) => {
    const node = document.querySelector<HTMLElement | SVGElement>(`[style*="view-transition-name: ${name}"]`);
    return node ? [{ name, box: node.getBoundingClientRect() }] : [];
  });
  const before = boxes();
  let after: ReturnType<typeof boxes> = [];
  const transition = document.startViewTransition(async () => { await update(); after = boxes(); });
  active = transition;
  // Duplicate names or a hidden tab may skip a transition; navigation still runs.
  void transition?.ready?.then(() => {
    for (const source of before) {
      const destination = after.find((item) => item.name === source.name)?.box;
      if (!destination?.width || !destination.height) continue;
      document.documentElement.animate([
        { transform: `translate(${source.box.x - destination.x}px, ${source.box.y - destination.y}px) scale(${source.box.width / destination.width}, ${source.box.height / destination.height})`, transformOrigin: '0 0' },
        { transform: 'translate(0, 0) scale(1)', transformOrigin: '0 0' },
      ], { pseudoElement: `::view-transition-group(${source.name})`, duration: SPRING_MS.ui, easing: SPRING_EASE.ui });
    }
  }).catch(() => undefined);
  void transition?.finished?.catch(() => undefined).then(() => {
    if (active === transition) { active = undefined; delete document.documentElement.dataset.tabTransition; }
  });
  return 'transition';
}

const TABS = ['/', '/session', '/progress', '/crew'];
export function tabDirection(from: string, to: string): 'left' | 'right' | null {
  const before = TABS.indexOf(from);
  const after = TABS.indexOf(to);
  return before < 0 || after < 0 || before === after ? null : after > before ? 'left' : 'right';
}

/** Wait for a lazy screen/live query before taking the destination snapshot. */
export function screenReady(selector: string): Promise<void> {
  return new Promise((resolve) => {
    const finish = () => { observer.disconnect(); window.clearTimeout(timer); resolve(); };
    const observer = new MutationObserver(() => { if (document.querySelector(selector)) finish(); });
    const timer = window.setTimeout(finish, 1500);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    if (document.querySelector(selector)) finish();
  });
}
