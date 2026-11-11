'use client';

import { useEffect, useState } from 'react';
import { writeClipboard } from '@/components/invitation/gift-copy';
import type { InviteShareLabels } from '@/lib/invitation/guest-copy';
import type { InviteShare } from '@/lib/invitation/invite-share';
import { whatsAppShareLink } from '@/lib/invitation/whatsapp';

type ShareState = 'idle' | 'copied' | 'manual';

/**
 * G-035 (I-16): the footer's share actions on a design family. "Share invitation" opens the device's share sheet with the
 * invitation link; where there is none, or it fails for any reason other than the guest closing it, the link is copied
 * (the Clipboard API, else the legacy copy command older in-app browsers honour), and where neither works it is shown
 * selected in a box to copy by hand. WhatsApp opens
 * `wa.me` with the title and the link. Both buttons appear once hydrated, like the gift's copy button (B-026); the
 * Status / Story image is a plain download link that works without JavaScript. The link is made absolute from the
 * address the guest is on and is always the invitation link (`InviteShare.path`), never their personal one. The result
 * is a polite live region, so it is announced without moving focus.
 */
export function InviteShareActions({
  share,
  labels,
  accentClass,
  mutedClass,
  fieldClass,
  align,
}: {
  share: InviteShare;
  labels: InviteShareLabels;
  accentClass: string;
  mutedClass: string;
  /** The box the link is shown in when it cannot be copied: the palette's line and field tokens. */
  fieldClass: string;
  align: 'center' | 'start';
}) {
  const [hydrated, setHydrated] = useState(false);
  const [state, setState] = useState<ShareState>('idle');
  const [manualLink, setManualLink] = useState('');
  useEffect(() => setHydrated(true), []);

  const invitationLink = () => new URL(share.path, window.location.origin).href;

  async function shareInvitation() {
    const url = invitationLink();
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: share.title, text: share.title, url });
        setState('idle');
        return;
      } catch (error) {
        // The guest closed the sheet: nothing to report. Any other refusal falls back to copying the link.
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }
    if ((await writeClipboard(url)) || legacyCopy(url)) {
      setState('copied');
      return;
    }
    setManualLink(url);
    setState('manual');
  }

  function sendOnWhatsApp() {
    window.open(whatsAppShareLink(`${share.title}\n${invitationLink()}`), '_blank', 'noopener,noreferrer');
  }

  const action = `inline-flex min-h-11 items-center rounded-full border border-current px-5 text-xs font-semibold ${accentClass}`;
  const centered = align === 'center';
  return (
    <div role="group" aria-label={labels.heading} className={`flex flex-col gap-3 ${centered ? 'items-center text-center' : 'items-start'}`}>
      <div className={`flex min-h-11 flex-wrap gap-2 ${centered ? 'justify-center' : ''}`}>
        {hydrated && (
          <>
            <button type="button" onClick={shareInvitation} className={action}>
              {labels.share}
            </button>
            <button type="button" onClick={sendOnWhatsApp} className={action}>
              {labels.whatsapp}
            </button>
          </>
        )}
        <a href={share.storyHref} download={share.storyFileName} className={action}>
          {labels.story}
        </a>
      </div>
      {/* A live region only once hydrated (the gift's copy button does the same, B-026): before that nothing can change it. */}
      <p role={hydrated ? 'status' : undefined} className={`min-h-5 text-sm ${mutedClass}`}>
        {state === 'copied' ? labels.copied : state === 'manual' ? labels.manual : ''}
      </p>
      {state === 'manual' && (
        <input
          type="text"
          readOnly
          autoFocus
          value={manualLink}
          aria-label={labels.link}
          onFocus={(event) => event.currentTarget.select()}
          className={`w-full max-w-sm rounded-lg border px-3 py-2 text-sm ${fieldClass}`}
        />
      )}
    </div>
  );
}

/**
 * The legacy copy command that older in-app browsers still honour where the Clipboard API is missing or refused (as the
 * gift's copy button does, B-026), from a temporary off-screen field; focus returns to the button that asked.
 */
function legacyCopy(text: string): boolean {
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const field = document.createElement('textarea');
  field.value = text;
  field.readOnly = true;
  field.setAttribute('aria-hidden', 'true');
  field.style.position = 'fixed';
  field.style.top = '0';
  field.style.opacity = '0';
  document.body.appendChild(field);
  field.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    field.remove();
    previous?.focus();
  }
}
