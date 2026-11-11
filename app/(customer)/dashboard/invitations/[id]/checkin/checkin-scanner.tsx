'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, CameraOff, CheckCircle2, CircleAlert, Clock3, Search, Wifi, WifiOff } from 'lucide-react';
import { EMPTY_QUEUE, enqueue, nextBatch, parseStoredQueue, queueStorageKey, settle, type QueueState } from '@/lib/invitation/checkin-queue';
import { looksLikePass, passLookupKeyInBrowser } from '@/lib/invitation/pass-lookup-client';
import type { PassScanResult } from '@/lib/invitation/roster-outcomes';
import { manualCheckIn, type ManualCheckInResult } from './actions';

export type RosterEntry = { id: number; name: string; key: string; checkedInAt: string | null };

type Outcome = PassScanResult['outcome'] | 'queued' | 'not-a-pass' | 'refused';
type Greeting = { id: string; outcome: Outcome; name?: string; at?: string };
type LogLine = Greeting & { scannedAt: string };
type Detector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };
type DetectorClass = new (options: { formats: string[] }) => Detector;

const GREETING_MS = 2500;
const RETRY_MS = 10_000;
const REPEAT_MS = 3000;

const TITLES: Record<Outcome, string> = {
  'checked-in': 'Selamat datang',
  already: 'Sudah check-in',
  queued: 'Tersimpan, menunggu sinyal',
  expired: 'Pass sudah tidak berlaku',
  invalid: 'Pass tidak dikenali',
  unknown: 'Pass bukan untuk acara ini',
  'not-a-pass': 'Bukan QR pass undangan',
  refused: 'Check-in ditolak',
};

// White text needs 4.5:1 for the small lines on these screens: emerald-700 and rose-700 give it, the 600s do not.
const SCREENS: Record<Outcome, string> = {
  'checked-in': 'bg-emerald-700 text-white',
  already: 'bg-amber-300 text-slate-950',
  queued: 'bg-slate-800 text-white',
  expired: 'bg-rose-700 text-white',
  invalid: 'bg-rose-700 text-white',
  unknown: 'bg-rose-700 text-white',
  'not-a-pass': 'bg-rose-700 text-white',
  refused: 'bg-rose-700 text-white',
};

const MANUAL_REFUSALS: Record<Exclude<ManualCheckInResult, { ok: true }>['reason'], string> = {
  signin: 'Sesi berakhir. Masuk lagi untuk check-in.',
  off: 'QR pass sedang dinonaktifkan.',
  notfound: 'Tamu tidak ditemukan di undangan ini.',
  'manual-off': 'Check-in manual dinonaktifkan untuk undangan ini.',
  unconfirmed: 'Check-in belum bisa dipastikan. Periksa lagi sebelum mengulang.',
};

const clock = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' });
const timeOf = (iso?: string | null) => (iso ? clock.format(new Date(iso)) : '');
const isRejection = (outcome: Outcome) => !['checked-in', 'already', 'queued'].includes(outcome);

/**
 * B-024 (I-01 / I-27, D-056): the scanner. Scans enter a device-side outbox (`checkin-queue.ts`) and are sent to the
 * check-in route in batches; a batch is resent unchanged under its key until the route answers, so a weak signal never
 * loses or doubles an arrival. Offline, a scan is named from the page's one-way keys and confirmed when the signal
 * returns. The greeting shows the display name only.
 */
export function CheckinScanner({ invitationId, roster: initialRoster, manual, passesShown }: { invitationId: number; roster: RosterEntry[]; manual: boolean; passesShown: boolean }) {
  const [roster, setRoster] = useState(initialRoster);
  const rosterRef = useRef(initialRoster);
  const [queue, setQueueState] = useState<QueueState>(EMPTY_QUEUE);
  const queueRef = useRef<QueueState>(EMPTY_QUEUE);
  const [online, setOnline] = useState(true);
  const [greeting, setGreeting] = useState<Greeting | null>(null);
  const [log, setLog] = useState<LogLine[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [camera, setCamera] = useState<'off' | 'starting' | 'on' | 'unavailable'>('off');
  const [query, setQuery] = useState('');
  const [manualPending, setManualPending] = useState<number | null>(null);
  const keysOfScans = useRef(new Map<string, string | null>());
  const syncing = useRef(false);
  const stopCamera = useRef<() => void>(() => {});
  const lastRead = useRef({ text: '', at: 0 });
  const videoRef = useRef<HTMLVideoElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const storageKey = queueStorageKey(invitationId);

  useEffect(() => {
    rosterRef.current = roster;
  }, [roster]);

  const setQueue = useCallback(
    (next: QueueState) => {
      queueRef.current = next;
      setQueueState(next);
      try {
        if (next.scans.length) localStorage.setItem(storageKey, JSON.stringify(next));
        else localStorage.removeItem(storageKey);
      } catch {
        // Private mode or a full disk: the queue still lives in memory for this page.
      }
    },
    [storageKey],
  );

  const markChecked = useCallback((key: string | null | undefined, at: string) => {
    if (!key) return;
    setRoster((rows) => rows.map((row) => (row.key === key && !row.checkedInAt ? { ...row, checkedInAt: at } : row)));
  }, []);

  const updateLine = useCallback((id: string, patch: Partial<LogLine>) => {
    setLog((lines) => lines.map((line) => (line.id === id ? { ...line, ...patch } : line)));
    setGreeting((current) => (current?.id === id ? { ...current, ...patch } : current));
  }, []);

  const sync = useCallback(async () => {
    if (syncing.current) return;
    syncing.current = true;
    try {
      for (;;) {
        const batch = nextBatch(queueRef.current, () => crypto.randomUUID());
        if (!batch) break;
        setQueue(batch.state);
        let response: Response;
        try {
          response = await fetch(`/api/invitations/${invitationId}/checkins`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ key: batch.key, scans: batch.scans.map(({ token, scannedAt }) => ({ token, scannedAt })) }),
          });
        } catch {
          setOnline(false);
          break;
        }
        setOnline(true);
        if (response.ok) {
          const { results } = (await response.json()) as { results: PassScanResult[] };
          batch.scans.forEach((scan, index) => {
            const result = results[index];
            if (!result) return;
            const named = result.outcome === 'checked-in' || result.outcome === 'already' ? result : null;
            if (named) markChecked(keysOfScans.current.get(scan.id), named.checkedInAt);
            updateLine(scan.id, { outcome: result.outcome, name: named?.name, at: named?.checkedInAt });
          });
          setQueue(settle(queueRef.current, batch.key));
          setNotice(null);
          continue;
        }
        if (response.status === 401) {
          setNotice('Sesi berakhir. Masuk lagi untuk menyinkronkan check-in yang tersimpan.');
          break;
        }
        if (response.status === 429 || response.status >= 500) break;
        // 400, 403, 404 or 409: the route will never accept these scans as sent; they leave the queue and say so.
        // G-044 (D-057): a 404 is also a member whose access ended while the desk was open; it must not say which.
        setNotice(
          response.status === 409
            ? 'QR pass sedang dinonaktifkan untuk undangan ini.'
            : response.status === 404
              ? 'Check-in tidak terkirim: akses Anda ke undangan ini sudah berakhir, atau QR pass sedang dinonaktifkan.'
              : 'Sebagian pindaian ditolak.',
        );
        batch.scans.forEach((scan) => updateLine(scan.id, { outcome: 'refused' }));
        setQueue(settle(queueRef.current, batch.key));
      }
    } finally {
      syncing.current = false;
    }
  }, [invitationId, markChecked, setQueue, updateLine]);

  useEffect(() => {
    const stored = parseStoredQueue(localStorage.getItem(storageKey));
    queueRef.current = stored;
    setQueueState(stored);
    setOnline(navigator.onLine);
    const up = () => {
      setOnline(true);
      void sync();
    };
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    const timer = window.setInterval(() => {
      if (queueRef.current.scans.length) void sync();
    }, RETRY_MS);
    if (stored.scans.length) void sync();
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
      window.clearInterval(timer);
    };
  }, [storageKey, sync]);

  useEffect(() => {
    if (!greeting) return;
    const timer = window.setTimeout(() => setGreeting((current) => (current?.id === greeting.id ? null : current)), GREETING_MS);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setGreeting(null);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, [greeting]);

  useEffect(() => () => stopCamera.current(), []);

  const handleText = useCallback(
    async (raw: string) => {
      const token = raw.trim();
      const id = crypto.randomUUID();
      const scannedAt = new Date().toISOString();
      if (!looksLikePass(token)) {
        const line: LogLine = { id, outcome: 'not-a-pass', scannedAt };
        setLog((lines) => [line, ...lines].slice(0, 12));
        setGreeting(line);
        return;
      }
      const key = await passLookupKeyInBrowser(token);
      const known = key ? rosterRef.current.find((entry) => entry.key === key) : undefined;
      const waiting = queueRef.current.scans.find((scan) => scan.token === token);
      if (waiting) {
        setGreeting({ id: waiting.id, outcome: 'queued', name: known?.name });
        return;
      }
      keysOfScans.current.set(id, key);
      const line: LogLine = { id, outcome: known?.checkedInAt ? 'already' : 'queued', name: known?.name, at: known?.checkedInAt ?? undefined, scannedAt };
      setLog((lines) => [line, ...lines].slice(0, 12));
      setGreeting(line);
      setQueue(enqueue(queueRef.current, { id, token, scannedAt }));
      void sync();
    },
    [setQueue, sync],
  );

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamera('unavailable');
      return;
    }
    setCamera('starting');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    } catch {
      setCamera('unavailable');
      return;
    }
    const video = videoRef.current;
    if (!video) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    video.srcObject = stream;
    await video.play().catch(() => undefined);
    const NativeDetector = (globalThis as { BarcodeDetector?: DetectorClass }).BarcodeDetector;
    const detector = NativeDetector ? new NativeDetector({ formats: ['qr_code'] }) : null;
    const decode = detector ? null : (await import('jsqr')).default;
    const canvas = document.createElement('canvas');
    let stopped = false;
    let timer = 0;
    const tick = async () => {
      if (stopped) return;
      try {
        let text: string | undefined;
        if (detector) text = (await detector.detect(video))[0]?.rawValue;
        else if (decode && video.videoWidth) {
          const width = Math.min(video.videoWidth, 640);
          const height = Math.round(video.videoHeight * (width / video.videoWidth));
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext('2d', { willReadFrequently: true });
          if (context) {
            context.drawImage(video, 0, 0, width, height);
            text = decode(context.getImageData(0, 0, width, height).data, width, height, { inversionAttempts: 'dontInvert' })?.data;
          }
        }
        const now = Date.now();
        if (text && (text !== lastRead.current.text || now - lastRead.current.at > REPEAT_MS)) {
          lastRead.current = { text, at: now };
          void handleText(text);
        }
      } catch {
        // A frame the decoder could not read; the next one is tried.
      }
      timer = window.setTimeout(tick, 200);
    };
    stopCamera.current = () => {
      stopped = true;
      window.clearTimeout(timer);
      stream.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
      setCamera('off');
    };
    setCamera('on');
    void tick();
  }

  async function checkInManually(entry: RosterEntry) {
    setManualPending(entry.id);
    const id = crypto.randomUUID();
    try {
      const result = await manualCheckIn(invitationId, entry.id);
      if (result.ok) {
        markChecked(entry.key, result.checkedInAt);
        const line: LogLine = { id, outcome: result.already ? 'already' : 'checked-in', name: entry.name, at: result.checkedInAt, scannedAt: result.checkedInAt };
        setLog((lines) => [line, ...lines].slice(0, 12));
        setGreeting(line);
        setQuery('');
      } else setNotice(MANUAL_REFUSALS[result.reason]);
    } catch {
      setNotice('Tidak tersambung. Check-in manual membutuhkan sinyal.');
    } finally {
      setManualPending(null);
    }
  }

  const checkedIn = roster.filter((entry) => entry.checkedInAt).length;
  const matches = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('id');
    if (needle.length < 2) return [];
    return roster.filter((entry) => entry.name.toLocaleLowerCase('id').includes(needle)).slice(0, 8);
  }, [query, roster]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4">
        <p className="text-sm text-slate-600">
          <span className="text-2xl font-bold text-slate-950">{checkedIn}</span> / {roster.length} tamu sudah check-in
        </p>
        <p className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${online ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
          {online ? <Wifi className="h-4 w-4" aria-hidden="true" /> : <WifiOff className="h-4 w-4" aria-hidden="true" />}
          {online ? 'Tersambung' : 'Tanpa sinyal'}
          {queue.scans.length > 0 && ` · ${queue.scans.length} menunggu sinkron`}
        </p>
      </div>

      {!passesShown && (
        <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
          Rahasia QR pass (GUEST_PASS_SECRET) belum diatur, jadi tamu belum bisa membuka QR pass mereka.
        </p>
      )}
      {notice && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-700">
          {notice}
        </p>
      )}

      <section aria-labelledby="camera-title" className="flex flex-col gap-3 rounded-xl border bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 id="camera-title" className="font-bold text-slate-900">
            Kamera
          </h2>
          {camera === 'on' ? (
            <button type="button" onClick={() => stopCamera.current()} className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 text-sm font-bold text-slate-700">
              <CameraOff className="h-4 w-4" aria-hidden="true" />
              Hentikan
            </button>
          ) : (
            <button type="button" onClick={() => void startCamera()} disabled={camera === 'starting'} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-bold text-white disabled:opacity-60">
              <Camera className="h-4 w-4" aria-hidden="true" />
              {camera === 'starting' ? 'Membuka kamera…' : 'Mulai pindai'}
            </button>
          )}
        </div>
        <video ref={videoRef} muted playsInline aria-label="Pratinjau kamera pemindai" className={`aspect-square w-full rounded-lg bg-slate-900 object-cover sm:aspect-video ${camera === 'on' ? '' : 'hidden'}`} />
        {camera === 'unavailable' && (
          <p className="text-sm leading-6 text-slate-600">Kamera tidak tersedia atau izinnya ditolak. Gunakan pemindai genggam, tempel kode, atau cari nama tamu.</p>
        )}
      </section>

      <form
        className="flex flex-col gap-2 rounded-xl border bg-white p-4"
        onSubmit={(event) => {
          event.preventDefault();
          const value = codeRef.current?.value ?? '';
          if (codeRef.current) codeRef.current.value = '';
          if (value.trim()) void handleText(value);
        }}
      >
        <label htmlFor="pass-code" className="font-bold text-slate-900">
          Kode pass
        </label>
        <p id="pass-code-hint" className="text-sm leading-6 text-slate-500">
          Untuk pemindai genggam: arahkan ke QR dan kode masuk otomatis.
        </p>
        <div className="flex gap-2">
          <input
            id="pass-code"
            ref={codeRef}
            aria-describedby="pass-code-hint"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault();
            }}
            className="h-11 min-w-0 flex-1 rounded-lg border px-3 font-mono text-sm outline-none focus:border-brand-600"
          />
          <button type="submit" className="min-h-11 rounded-lg border px-4 text-sm font-bold text-slate-700">
            Proses
          </button>
        </div>
      </form>

      {manual && (
        <section aria-labelledby="manual-title" className="flex flex-col gap-3 rounded-xl border bg-white p-4">
          <h2 id="manual-title" className="font-bold text-slate-900">
            Cari nama tamu
          </h2>
          <label className="relative block">
            <span className="sr-only">Nama tamu</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ketik minimal 2 huruf" className="h-11 w-full rounded-lg border pl-9 pr-3 text-sm outline-none focus:border-brand-600" />
          </label>
          {matches.length > 0 && (
            <ul className="divide-y rounded-lg border">
              {matches.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-3 p-3">
                  <span dir="auto" className="min-w-0 text-sm font-semibold text-slate-900 [overflow-wrap:anywhere]">
                    {entry.name}
                  </span>
                  {entry.checkedInAt ? (
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      {timeOf(entry.checkedInAt)}
                    </span>
                  ) : (
                    <button type="button" disabled={!online || manualPending !== null} onClick={() => void checkInManually(entry)} className="min-h-11 shrink-0 rounded-lg border px-3 text-xs font-bold text-slate-700 disabled:opacity-50">
                      {manualPending === entry.id ? 'Menyimpan…' : 'Check-in'}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {!online && <p className="text-xs text-slate-500">Check-in manual membutuhkan sinyal; pindaian QR tetap tersimpan.</p>}
        </section>
      )}

      {log.length > 0 && (
        <section aria-labelledby="log-title" className="flex flex-col gap-2 rounded-xl border bg-white p-4">
          <h2 id="log-title" className="font-bold text-slate-900">
            Pindaian terakhir
          </h2>
          <ul className="divide-y">
            {log.map((line) => (
              <li key={line.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span dir="auto" className="min-w-0 font-semibold text-slate-800 [overflow-wrap:anywhere]">
                  {line.name ?? TITLES[line.outcome]}
                </span>
                <span className={`inline-flex shrink-0 items-center gap-1 text-xs font-semibold ${isRejection(line.outcome) ? 'text-red-700' : line.outcome === 'queued' ? 'text-slate-500' : 'text-emerald-700'}`}>
                  {line.outcome === 'queued' ? <Clock3 className="h-4 w-4" aria-hidden="true" /> : isRejection(line.outcome) ? <CircleAlert className="h-4 w-4" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                  {line.name ? TITLES[line.outcome] : ''} {timeOf(line.at ?? line.scannedAt)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div aria-live="assertive" className="sr-only">
        {greeting ? `${TITLES[greeting.outcome]}${greeting.name ? `, ${greeting.name}` : ''}` : ''}
      </div>
      {greeting && (
        <div className={`fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 p-8 text-center ${SCREENS[greeting.outcome]}`} onClick={() => setGreeting(null)} aria-hidden="true">
          {isRejection(greeting.outcome) ? <CircleAlert className="h-14 w-14" /> : greeting.outcome === 'queued' ? <Clock3 className="h-14 w-14" /> : <CheckCircle2 className="h-14 w-14" />}
          <p className="text-lg font-semibold">{TITLES[greeting.outcome]}</p>
          {greeting.name && (
            <p dir="auto" className="max-w-2xl text-balance text-4xl font-bold leading-tight [overflow-wrap:anywhere] sm:text-5xl">
              {greeting.name}
            </p>
          )}
          {greeting.outcome === 'already' && greeting.at && <p className="text-base">sejak pukul {timeOf(greeting.at)}</p>}
          <p className="text-sm">Ketuk untuk lanjut</p>
        </div>
      )}
    </div>
  );
}
