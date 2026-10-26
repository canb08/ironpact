// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { expect, it } from 'vitest';
import { Button, Sheet, copy } from '../../../src/ui';

function Example() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>{copy.devOpenSheet}</Button>
      <Sheet open={open} onClose={() => setOpen(false)} title={copy.devSheet}>
        <Button>{copy.lockIn}</Button>
        <input aria-label={copy.weight} />
      </Sheet>
    </>
  );
}

it('traps focus in both directions, closes on Esc and restores focus/background', async () => {
  const user = userEvent.setup();
  const view = render(<Example />);
  const trigger = screen.getByRole('button', { name: copy.devOpenSheet });
  await user.click(trigger);
  const dialog = screen.getByRole('dialog', { name: copy.devSheet });
  expect(dialog.getAttribute('aria-modal')).toBe('true');
  expect(view.container.hasAttribute('inert')).toBe(true);
  expect(document.activeElement).toBe(screen.getByRole('button', { name: copy.lockIn }));
  await user.tab({ shift: true });
  expect(document.activeElement).toBe(screen.getByRole('button', { name: copy.close }));
  await user.tab();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: copy.lockIn }));
  await user.tab();
  expect(document.activeElement).toBe(screen.getByRole('textbox'));
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(view.container.hasAttribute('inert')).toBe(false);
  expect(document.body.style.overflow).toBe('');
});

it('closes with its bottom close button and cleans up on unmount', async () => {
  const user = userEvent.setup();
  const view = render(<Example />);
  await user.click(screen.getByRole('button', { name: copy.devOpenSheet }));
  await user.click(screen.getByRole('button', { name: copy.close }));
  expect(screen.queryByRole('dialog')).toBeNull();
  await user.click(screen.getByRole('button', { name: copy.devOpenSheet }));
  view.unmount();
  expect(document.body.style.overflow).toBe('');
  expect(document.querySelector('[inert]')).toBeNull();
});
