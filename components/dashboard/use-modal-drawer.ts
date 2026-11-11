'use client';

import { useEffect, useRef } from 'react';

// Both signed-in shells render their phone drawer only below Tailwind's `lg` breakpoint (`lg:hidden`).
const DESKTOP_QUERY = '(min-width: 1024px)';

/**
 * The signed-in shells' phone menu is a modal dialog (E-099): opening it moves focus to its close button, the shell
 * renders the page behind it `inert` while it is open, and a close by the user (Escape, the close button, the backdrop)
 * hands focus back to the menu button. A route change closes it without moving focus, so the new page keeps the
 * router's focus handling; widening the window to the desktop layout closes it, so the page is never left inert.
 */
export function useModalDrawer(open: boolean, setOpen: (open: boolean) => void) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const initialFocusRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);

  useEffect(() => {
    if (!open) {
      // Runs after the commit that removed `inert` from the page, so the menu button can take focus again.
      if (returnFocus.current) {
        returnFocus.current = false;
        triggerRef.current?.focus();
      }
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const desktop = window.matchMedia(DESKTOP_QUERY);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      returnFocus.current = true;
      setOpen(false);
    };
    const onDesktop = () => {
      if (desktop.matches) setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    desktop.addEventListener('change', onDesktop);
    initialFocusRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
      desktop.removeEventListener('change', onDesktop);
    };
  }, [open, setOpen]);

  const close = () => {
    returnFocus.current = true;
    setOpen(false);
  };

  return { triggerRef, initialFocusRef, close };
}
