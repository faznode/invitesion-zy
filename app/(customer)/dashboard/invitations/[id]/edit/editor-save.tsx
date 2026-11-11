'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, CloudOff, Loader2, RotateCcw } from 'lucide-react';
import { AutosaveController, saveResultOf, type AutosaveSnapshot, type SaveRequest, type SaveResult } from '@/lib/invitation/autosave';

/**
 * B-035: the editor's side of the save loop (`lib/invitation/autosave.ts`): the request, the status line, the conflict
 * banner and the side-by-side preview. `auto` is `FLAG_EDITOR_AUTOSAVE`; off keeps the manual "Simpan" button as the only
 * trigger. Both modes send the version the editor loaded or last saved.
 */

async function sendDetailSave<C extends object>(invitationId: number, request: SaveRequest<C>): Promise<SaveResult> {
  let response: Response;
  try {
    response = await fetch(`/api/invitations/${invitationId}/detail`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...request.config, expectedVersion: request.expectedVersion }),
    });
  } catch {
    return { kind: 'retry', reason: 'network' };
  }
  const body = await response.json().catch(() => null);
  return saveResultOf(response.status, body);
}

export type EditorSave = {
  snapshot: AutosaveSnapshot;
  flush: () => void;
  overwrite: () => void;
  /** Loads the stored version, after the host confirms that this tab's unsaved edits are dropped. */
  reload: () => void;
};

export function useEditorSave<C extends object>({
  invitationId,
  config,
  initialVersion,
  auto,
  en,
}: {
  invitationId: number;
  config: C;
  initialVersion: number;
  auto: boolean;
  en: boolean;
}): EditorSave {
  const [snapshot, setSnapshot] = useState<AutosaveSnapshot>({
    status: 'saved',
    dirty: false,
    baseVersion: initialVersion,
    conflictVersion: null,
    problem: null,
    savedAt: null,
    auto,
  });
  // One loop per editor. It is not disposed on unmount: a save already due still goes out, so leaving the page by a link
  // does not drop edits the host made a moment before.
  const [controller] = useState(
    () =>
      new AutosaveController<C>({
        baseVersion: initialVersion,
        config,
        auto,
        send: (request) => sendDetailSave(invitationId, request),
        onChange: setSnapshot,
      }),
  );
  const seen = useRef(config);
  const leaving = useRef(false);

  useEffect(() => {
    if (seen.current === config) return;
    seen.current = config;
    controller.edit(config);
  }, [config, controller]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (leaving.current || !controller.snapshot().dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    // Automatic mode saves at once when the host switches away, so another tab opened next starts from these edits.
    const hidden = () => {
      if (auto && document.visibilityState === 'hidden') controller.flush();
    };
    window.addEventListener('beforeunload', warn);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('beforeunload', warn);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [auto, controller]);

  return {
    snapshot,
    flush: () => controller.flush(),
    overwrite: () => controller.overwrite(),
    reload: () => {
      const message = en
        ? 'Your unsaved changes in this tab will be discarded. Load the latest version?'
        : 'Perubahan yang belum tersimpan di tab ini akan dibuang. Muat versi terbaru?';
      if (controller.snapshot().dirty && !window.confirm(message)) return;
      leaving.current = true;
      window.location.reload();
    },
  };
}

function clock(at: number, en: boolean) {
  return new Intl.DateTimeFormat(en ? 'en-GB' : 'id-ID', { hour: '2-digit', minute: '2-digit' }).format(at);
}

function statusText(snapshot: AutosaveSnapshot, en: boolean): string {
  const { status, problem, auto, savedAt } = snapshot;
  if (status === 'saving') return en ? 'Saving…' : 'Menyimpan…';
  if (status === 'conflict') return en ? 'A newer version exists' : 'Ada versi yang lebih baru';
  if (status === 'dirty') {
    if (auto) return en ? 'Saving shortly…' : 'Sebentar lagi disimpan…';
    return en ? 'You have unsaved changes.' : 'Ada perubahan yang belum disimpan.';
  }
  if (status === 'failed' && problem) {
    switch (problem.reason) {
      case 'invalid':
        return en ? 'Not saved yet: a field is not valid.' : 'Belum tersimpan: ada isian yang belum valid.';
      case 'media':
        return en ? 'Not saved yet: that image cannot be used here.' : 'Belum tersimpan: gambar itu tidak bisa dipakai di bagian ini.';
      case 'theme':
        return en
          ? 'Not saved yet: that theme, palette or layout choice is not available for this invitation.'
          : 'Belum tersimpan: tema, palet, atau pilihan tata letak itu tidak tersedia untuk undangan ini.';
      case 'signin':
        return en ? 'Your session ended. Sign in again, then save.' : 'Sesi berakhir. Masuk lagi, lalu simpan.';
      case 'notfound':
        return en ? 'This invitation was not found.' : 'Undangan ini tidak ditemukan.';
      case 'unconfirmed':
        return en ? 'The save was not confirmed. Your changes are kept here.' : 'Penyimpanan belum terkonfirmasi. Perubahanmu tetap di sini.';
      case 'network':
      case 'server':
        if (auto) return en ? 'Could not save. Your changes are kept; retrying…' : 'Gagal menyimpan. Perubahanmu tetap di sini, mencoba lagi…';
        return en ? 'Could not save. Your changes are kept; try again.' : 'Gagal menyimpan. Perubahanmu tetap di sini, coba lagi.';
    }
  }
  if (savedAt !== null) return en ? `Saved at ${clock(savedAt, en)}` : `Tersimpan pukul ${clock(savedAt, en)}`;
  return auto
    ? en ? 'Changes save automatically.' : 'Perubahan tersimpan otomatis.'
    : en ? 'Save your changes when you\u2019re done.' : 'Simpan perubahan setelah selesai.';
}

/**
 * The save state, with "try again" after a failure that can be retried. `live` makes it the page's announcement for
 * screen readers (`aria-live`); the editor marks only one copy live, so a change is announced once.
 */
export function SaveStatus({ save, en, compact = false, live = true }: { save: EditorSave; en: boolean; compact?: boolean; live?: boolean }) {
  const { snapshot } = save;
  const text = statusText(snapshot, en);
  const retryable = snapshot.status === 'failed' && snapshot.problem?.kind === 'retry';
  const tone =
    snapshot.status === 'failed' || snapshot.status === 'conflict' ? 'text-rose-700'
    : snapshot.status === 'saved' && snapshot.savedAt !== null ? 'text-emerald-700'
    : 'text-slate-600';
  const Icon =
    snapshot.status === 'saving' ? Loader2
    : snapshot.status === 'failed' ? CloudOff
    : snapshot.status === 'conflict' ? AlertTriangle
    : snapshot.status === 'saved' && snapshot.savedAt !== null ? Check
    : null;
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 text-sm font-medium ${tone}`}>
      <span {...(live ? { role: 'status', 'aria-live': 'polite' as const } : {})} className="inline-flex min-w-0 items-center gap-1.5">
        {Icon && <Icon className={`h-4 w-4 shrink-0 ${snapshot.status === 'saving' ? 'animate-spin' : ''}`} aria-hidden />}
        <span className={compact ? 'truncate' : ''}>{text}</span>
      </span>
      {retryable && (
        <button
          type="button"
          onClick={save.flush}
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-sm font-semibold text-brand-700 underline underline-offset-2 hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          {en ? 'Try again' : 'Coba lagi'}
        </button>
      )}
    </span>
  );
}

/** Another tab or device stored a newer version: nothing is saved until the host picks one. */
export function ConflictBanner({ save, en }: { save: EditorSave; en: boolean }) {
  if (save.snapshot.status !== 'conflict') return null;
  return (
    <div role="alert" className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div className="min-w-0 space-y-1 leading-6">
          <p className="font-semibold">
            {en ? 'This invitation was just changed in another tab or device.' : 'Undangan ini baru saja diubah di tab atau perangkat lain.'}
          </p>
          <p>
            {en
              ? 'Your changes in this tab are not saved yet, and nothing was overwritten. Choose which version to keep.'
              : 'Perubahanmu di tab ini belum disimpan, dan tidak ada yang tertimpa. Pilih versi yang dipakai.'}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 pl-6">
        <button
          type="button"
          onClick={save.reload}
          className="inline-flex min-h-10 items-center rounded-lg border border-amber-300 bg-white px-3.5 text-sm font-semibold text-amber-950 shadow-sm transition hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
        >
          {en ? 'Load the latest version' : 'Muat versi terbaru'}
        </button>
        <button
          type="button"
          onClick={save.overwrite}
          className="inline-flex min-h-10 items-center rounded-lg bg-amber-900 px-3.5 text-sm font-semibold text-amber-50 shadow-sm transition hover:bg-amber-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
        >
          {en ? 'Keep this tab\u2019s version' : 'Simpan versi di tab ini'}
        </button>
      </div>
    </div>
  );
}

/**
 * The owner preview (`/preview/<id>`, the guest renderer) beside the fields, reloaded after each save, so it shows exactly
 * what is stored. The next frame loads hidden and replaces the shown one with its scroll position, so a save neither
 * flashes nor jumps. The cover stays open (`#sampul`, the gate's own no-JavaScript path) except on the cover's tab.
 */
export function PreviewPane({ href, version, showCover, en }: { href: string; version: number; showCover: boolean; en: boolean }) {
  const [shown, setShown] = useState(version);
  const frames = useRef(new Map<number, HTMLIFrameElement>());
  const srcOf = (v: number) => `${href}${href.includes('?') ? '&' : '?'}v=${v}${showCover ? '' : '#sampul'}`;
  const loading = version !== shown ? version : null;

  function loaded(v: number) {
    if (v !== version) return;
    const previous = frames.current.get(shown)?.contentWindow;
    const next = frames.current.get(v)?.contentWindow;
    try {
      if (previous && next && !showCover) next.scrollTo(0, previous.scrollY);
    } catch {
      // A frame that navigated elsewhere is not same-origin any more; it simply starts at the top.
    }
    setShown(v);
  }

  return (
    <aside aria-label={en ? 'Preview' : 'Pratinjau'} className="sticky top-16 hidden h-[calc(100vh-5rem)] w-[400px] shrink-0 flex-col gap-2 lg:flex">
      <div className="flex items-center justify-between gap-2 px-1">
        <h2 className="text-sm font-bold text-slate-900">{en ? 'Preview' : 'Pratinjau'}</h2>
        <span className="text-xs text-slate-500">{en ? 'Shows the last saved version' : 'Menampilkan versi tersimpan terakhir'}</span>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {[shown, ...(loading !== null ? [loading] : [])].map((v) => (
          <iframe
            key={`${v}-${showCover ? 'cover' : 'open'}`}
            ref={(node) => {
              if (node) frames.current.set(v, node);
              else frames.current.delete(v);
            }}
            src={srcOf(v)}
            title={en ? 'Invitation preview' : 'Pratinjau undangan'}
            onLoad={() => loaded(v)}
            className={`absolute inset-0 h-full w-full ${v === shown ? '' : 'invisible'}`}
            aria-hidden={v === shown ? undefined : true}
            tabIndex={v === shown ? undefined : -1}
          />
        ))}
      </div>
    </aside>
  );
}
