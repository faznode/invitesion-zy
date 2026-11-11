import { LockKeyhole } from 'lucide-react';
import { unlockInvitation } from '@/app/i/[slug]/actions';
import { guestCopy } from '@/lib/invitation/guest-copy';
import type { PasscodeCover } from '@/lib/invitation/guest-gate';
import { PASSCODE_MAX_LENGTH, PASSCODE_MIN_LENGTH, type PasscodeNotice } from '@/lib/invitation/guest-passcode';

/**
 * G-047 (D-069): the whole page of a passcode-protected invitation until the server admits the visitor. It receives the
 * cover alone (label and names, `passcodeCover`), so neither its HTML nor its RSC payload can carry the invitation's
 * content; on a personal link it does not even name the guest. A plain form posting to a server action, so it works
 * without JavaScript; the action redirects back here with `?kode=…` when it refuses.
 */
export function PasscodeGate({ cover, slug, guestSlug, target, notice }: { cover: PasscodeCover; slug: string; guestSlug?: string; target?: 'pass'; notice: PasscodeNotice }) {
  const copy = guestCopy(cover.language).passcode;
  const message = notice?.kind === 'wrong' ? copy.wrong : notice?.kind === 'wait' ? copy.wait(notice.minutes) : null;

  return (
    <main lang={cover.language} className="flex min-h-dvh items-center justify-center px-6 py-16" style={{ background: cover.colors.bg, color: cover.colors.ink }}>
      <div className="flex w-full max-w-sm flex-col items-center gap-8 text-center">
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm font-semibold uppercase tracking-widest">{cover.label}</p>
          <h1 className="text-balance font-serif text-4xl leading-tight">{cover.name}</h1>
        </div>
        <span aria-hidden="true" className="h-px w-16" style={{ background: cover.colors.accent }} />
        <form action={unlockInvitation} className="flex w-full flex-col gap-5">
          <input type="hidden" name="slug" value={slug} />
          {guestSlug ? <input type="hidden" name="guestSlug" value={guestSlug} /> : null}
          {target ? <input type="hidden" name="target" value={target} /> : null}
          <div className="flex flex-col items-center gap-2">
            <h2 className="flex items-center gap-2 text-pretty text-base font-semibold">
              <LockKeyhole className="h-5 w-5 shrink-0" aria-hidden="true" />
              {copy.heading}
            </h2>
            <p className="text-pretty text-sm leading-6">{copy.hint}</p>
          </div>
          <label className="flex flex-col gap-2 text-left text-sm font-semibold">
            {copy.label}
            <input
              name="passcode"
              type="text"
              required
              minLength={PASSCODE_MIN_LENGTH}
              maxLength={PASSCODE_MAX_LENGTH}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              aria-invalid={message ? true : undefined}
              aria-describedby={message ? 'passcode-message' : undefined}
              className="min-h-12 rounded-xl border-2 bg-transparent px-4 text-center text-lg font-medium tracking-widest outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              style={{ borderColor: cover.colors.ink, color: cover.colors.ink }}
            />
          </label>
          {message ? (
            <p id="passcode-message" role="alert" className="text-pretty text-sm font-semibold leading-6">
              {message}
            </p>
          ) : null}
          <button
            type="submit"
            className="min-h-12 rounded-full px-6 text-base font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ background: cover.colors.ink, color: cover.colors.bg, outlineColor: cover.colors.ink }}
          >
            {copy.submit}
          </button>
        </form>
      </div>
    </main>
  );
}
