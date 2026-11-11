'use client';

import { useActionState, useRef } from 'react';
import Link from 'next/link';
import { LoaderCircle } from 'lucide-react';
import { confirmTrialSave, type TrialActionResult } from '../actions';

/**
 * One POST creates the draft; a refusal is shown in place. A retry after an answer that never arrived still has the
 * cookie and its key, so it finds the same draft. Taps queued behind a save that went through are dropped here: that
 * save cleared the cookie, so they could only answer "nothing waiting".
 */
export function ConfirmSave({ editHref }: { editHref: string }) {
  const sent = useRef(false);
  const [state, action, pending] = useActionState<TrialActionResult | null, FormData>(async (previous) => {
    if (sent.current) return previous;
    sent.current = true;
    try {
      const result = await confirmTrialSave();
      if (result && !result.ok) sent.current = false;
      return result;
    } catch (error) {
      sent.current = false;
      throw error;
    }
  }, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      {state && !state.ok && state.message ? (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {state.message}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60"
        >
          {pending ? <LoaderCircle size={18} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
          {pending ? 'Menyimpan…' : 'Simpan draf'}
        </button>
        <Link href={editHref} className="rounded-full border border-border px-6 py-3 font-semibold text-foreground hover:bg-muted">
          Ubah dulu
        </Link>
      </div>
    </form>
  );
}
