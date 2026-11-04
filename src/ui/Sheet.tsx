import { useEffect, useId, useRef } from 'react';
import type { ReactNode, PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';
import { copy } from './copy';
import { useReducedMotion } from './motion/reduced';
import { useMotionReduced } from './motion/reduced-context';
import { SPRING_EASE, SPRING_MS } from './motion/springs';
import './motion/sheet.css';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

const focusable =
  'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

export function Sheet({ open, onClose, title, children }: SheetProps) {
  const titleId = useId();
  const still = useReducedMotion(useMotionReduced()) || document.documentElement.dataset.reducedMotion === 'on';
  const drag = useRef<{
    id: number;
    start: number;
    y: number;
    samples: Array<{ y: number; at: number }>;
  } | null>(null);
  const handle = useRef<HTMLDivElement>(null);
  const animation = useRef<Animation | undefined>(undefined);
  const springToRest = () => {
    const node = panel.current;
    if (!node) return;
    const from = node.style.transform;
    node.style.transform = '';
    if (!still && from) animation.current = node.animate?.([{ transform: from }, { transform: 'translateY(0)' }],
      { duration: SPRING_MS.ui, easing: SPRING_EASE.ui });
  };
  const begin = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.isPrimary === false || drag.current) return;
    // The title is a grab surface, not selectable/draggable text. In WebKit,
    // letting this default run can transfer the next drag to native scrolling
    // or HTML drag-and-drop and cancel our pointer stream.
    event.preventDefault();
    animation.current?.cancel();
    drag.current = {
      id: event.pointerId, start: event.clientY, y: event.clientY,
      samples: [{ y: event.clientY, at: performance.now() }],
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    event.preventDefault();
    const at = performance.now();
    current.y = event.clientY;
    current.samples.push({ y: current.y, at });
    // Retain a short movement window, including its leading sample. A single
    // late or stationary pointermove must not overwrite a real flick velocity.
    while (current.samples.length > 2 && current.samples[1]!.at < at - 80) current.samples.shift();
    if (!still && panel.current) panel.current.style.transform = `translateY(${Math.max(-16, current.y - current.start)}px)`;
  };
  const releaseCapture = (event: PointerEvent<HTMLDivElement>, id: number) => {
    if (event.currentTarget.hasPointerCapture(id)) event.currentTarget.releasePointerCapture(id);
  };
  const end = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    drag.current = null;
    releaseCapture(event, current.id);
    const at = performance.now();
    const first = current.samples[0]!;
    const last = current.samples.at(-1)!;
    const elapsed = at - first.at;
    const velocity = at - last.at < 100 && elapsed > 0 ? (last.y - first.y) / elapsed : 0;
    // Use the last tracked position: WebKit's release/cancel coordinates need
    // not describe the last movement of the captured pointer.
    const distance = current.y - current.start;
    if (distance > Math.max(80, (panel.current?.offsetHeight ?? 400) * 0.25)
      || distance > 12 && velocity > 0.65) close.current();
    else springToRest();
  };
  const cancel = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current) return;
    drag.current = null;
    releaseCapture(event, current.id);
    springToRest();
  };
  const panel = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open || !handle.current) return;
    const grip = handle.current;
    // React's delegated touch listeners can be passive. Reserve only this
    // non-scrollable handle with native, explicitly non-passive listeners.
    const reserveTouch = (event: TouchEvent) => {
      if (event.cancelable) event.preventDefault();
    };
    grip.addEventListener('touchstart', reserveTouch, { passive: false });
    grip.addEventListener('touchmove', reserveTouch, { passive: false });
    return () => {
      grip.removeEventListener('touchstart', reserveTouch);
      grip.removeEventListener('touchmove', reserveTouch);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !panel.current) return;
    const dialog = panel.current;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    const siblings = Array.from(document.body.children).filter(
      (element) => element !== backdrop.current,
    );
    const inert = siblings.map((element) => element.hasAttribute('inert'));
    siblings.forEach((element) => element.setAttribute('inert', ''));
    document.body.style.overflow = 'hidden';
    const targets = () =>
      Array.from(dialog.querySelectorAll<HTMLElement>(focusable)).filter((element) => {
        if (element.tabIndex < 0 || element.closest('[hidden], [inert], [aria-hidden="true"]'))
          return false;
        for (
          let ancestor: HTMLElement | null = element;
          ancestor && ancestor !== dialog;
          ancestor = ancestor.parentElement
        ) {
          const style = getComputedStyle(ancestor);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
        }
        return true;
      });
    (targets()[0] ?? dialog).focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close.current();
      }
      if (event.key !== 'Tab') return;
      const items = targets();
      const index = items.indexOf(document.activeElement as HTMLElement);
      if (
        items.length === 0 ||
        (event.shiftKey ? index <= 0 : index === items.length - 1 || index === -1)
      ) {
        event.preventDefault();
        (event.shiftKey ? (items.at(-1) ?? dialog) : (items[0] ?? dialog)).focus();
      }
    };
    const keepFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !dialog.contains(event.target))
        (targets()[0] ?? dialog).focus();
    };
    document.addEventListener('keydown', keydown);
    document.addEventListener('focusin', keepFocus);
    return () => {
      document.removeEventListener('keydown', keydown);
      document.removeEventListener('focusin', keepFocus);
      siblings.forEach((element, index) => {
        if (!inert[index]) element.removeAttribute('inert');
      });
      document.body.style.overflow = overflow;
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open || !panel.current) return;
    if (!still) animation.current = panel.current.animate?.([
      { transform: 'translateY(100%)' }, { transform: 'translateY(0)' },
    ], { duration: SPRING_MS.ui, easing: SPRING_EASE.ui });
    return () => { animation.current?.cancel(); drag.current = null; };
  }, [open, still]);

  if (!open) return null;
  return createPortal(
    <div ref={backdrop} className="ui-sheet-backdrop">
      <div
        ref={panel}
        className="ui-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div ref={handle} className="ui-sheet__handle"
          onPointerDown={begin} onPointerMove={move} onPointerUp={end}
          onPointerCancel={cancel} onLostPointerCapture={cancel}
          onDragStart={(event) => event.preventDefault()}>
          <h2 id={titleId} draggable={false}>{title}</h2>
        </div>
        <div className="ui-sheet__content">{children}</div>
        <Button variant="secondary" onClick={onClose}>
          {copy.close}
        </Button>
      </div>
    </div>,
    document.body,
  );
}
