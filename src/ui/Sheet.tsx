import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';
import { copy } from './copy';

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
  const panel = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

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
        <h2 id={titleId}>{title}</h2>
        <div className="ui-sheet__content">{children}</div>
        <Button variant="secondary" onClick={onClose}>
          {copy.close}
        </Button>
      </div>
    </div>,
    document.body,
  );
}
