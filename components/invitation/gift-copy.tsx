'use client';

import { useEffect, useState } from 'react';
import type { GiftCopyLabels } from '@/lib/invitation/guest-copy';

type CopyState = 'idle' | 'copied' | 'selected';

/** The button's words before G-018 (Indonesian); the design families pass their page's language. */
const INDONESIAN_LABELS: GiftCopyLabels = { copy: 'Salin', number: 'nomor', copied: 'Nomor disalin', selected: 'Nomor sudah dipilih, salin dari menu' };

/**
 * B-026 (D-047): copies an account number exactly as the host stored it. The button appears once hydrated, like the music
 * control (D-045): before that, and without JavaScript, the number is plain selectable text, and the row keeps its height
 * so nothing shifts when the button arrives. Where the Clipboard API is missing or refused (some in-app browsers), it
 * selects the number so the guest can copy it from the system menu, and says so. The status is a polite live region, so
 * the result is announced without moving focus.
 */
export function GiftCopyButton({
  number,
  label,
  targetId,
  accentClass,
  mutedClass,
  align = 'start',
  labels = INDONESIAN_LABELS,
}: {
  number: string;
  label: string;
  /** The element holding the number, selected when the Clipboard API cannot write. */
  targetId: string;
  accentClass: string;
  mutedClass: string;
  align?: 'start' | 'center';
  /** G-018: the page's language. */
  labels?: GiftCopyLabels;
}) {
  const [hydrated, setHydrated] = useState(false);
  const [state, setState] = useState<CopyState>('idle');
  useEffect(() => setHydrated(true), []);

  async function copy() {
    if (await writeClipboard(number)) {
      setState('copied');
      return;
    }
    setState(selectAndCopy(targetId) ? 'copied' : 'selected');
  }

  return (
    <div className={`mt-3 flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 ${align === 'center' ? 'justify-center' : ''}`}>
      {hydrated && (
        <>
          <button
            type="button"
            onClick={copy}
            className={`inline-flex min-h-11 items-center rounded-full border border-current px-5 text-xs font-semibold ${accentClass}`}
          >
            {labels.copy}<span className="sr-only">{` ${labels.number} `}{label}</span>
          </button>
          <span role="status" className={`text-sm ${mutedClass}`}>
            {state === 'idle' ? '' : labels[state]}
          </span>
        </>
      )}
    </div>
  );
}

/** Writes through the Clipboard API when the browser offers it to this page; false when it is missing or refuses. */
export async function writeClipboard(
  text: string,
  clipboard: Pick<Clipboard, 'writeText'> | undefined = globalThis.navigator?.clipboard,
): Promise<boolean> {
  if (!clipboard) return false;
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Selects the number for a manual copy, then tries the legacy copy command that older in-app browsers still honour. */
function selectAndCopy(id: string): boolean {
  const node = document.getElementById(id);
  const selection = window.getSelection();
  if (!node || !selection) return false;
  const range = document.createRange();
  range.selectNodeContents(node);
  selection.removeAllRanges();
  selection.addRange(range);
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  }
}
