/**
 * B-035: the editor's save loop, without React or the network so its rules can be tested with a fake clock.
 *
 * - Every edit bumps a revision. A save carries the revision and config of that moment plus the version they were based
 *   on, and only one save is in flight, so answers arrive in order.
 * - A save's answer never replaces the editor's config: the edits made while it was in flight stay, stay "unsaved", and
 *   go out in the next save. An answer only moves the base version and what counts as saved.
 * - Automatic mode saves `debounceMs` after the last edit (the backlog's "≤ 2 s after idle" is debounce plus one request)
 *   and retries transport failures with a growing delay. Manual mode saves only on `flush()`, the "Simpan" button.
 * - A conflict (another tab or device stored a newer version) stops saving until the host chooses: `overwrite()` rebases
 *   this tab's edits on the stored version and saves them; reloading loads the stored version. Nothing is overwritten
 *   silently.
 * - A refusal (invalid field, image or theme not allowed) is not retried with the same content; the next edit tries again.
 */

export type SaveResult =
  | { kind: 'saved'; version: number }
  | { kind: 'conflict'; currentVersion: number }
  | { kind: 'refused'; reason: 'invalid' | 'media' | 'theme' | 'notfound' | 'signin' }
  | { kind: 'retry'; reason: 'network' | 'server' | 'unconfirmed' };

export type SaveRequest<C> = { config: C; expectedVersion: number };

export type AutosaveProblem = Extract<SaveResult, { kind: 'refused' } | { kind: 'retry' }>;

export type AutosaveStatus = 'saved' | 'dirty' | 'saving' | 'failed' | 'conflict';

export type AutosaveSnapshot = {
  status: AutosaveStatus;
  /** Edits the server has not stored yet (including any in flight). */
  dirty: boolean;
  /** The version the next save is based on. */
  baseVersion: number;
  /** The stored version that blocks saving, while in conflict. */
  conflictVersion: number | null;
  /** The last refusal or failure, until a save succeeds. */
  problem: AutosaveProblem | null;
  /** When the server last confirmed a save (ms since the epoch), or null. */
  savedAt: number | null;
  auto: boolean;
};

type Handle = unknown;

export type AutosaveOptions<C> = {
  baseVersion: number;
  config: C;
  send: (request: SaveRequest<C>) => Promise<SaveResult>;
  auto: boolean;
  debounceMs?: number;
  onChange?: (snapshot: AutosaveSnapshot) => void;
  schedule?: (run: () => void, ms: number) => Handle;
  cancel?: (handle: Handle) => void;
  now?: () => number;
};

export const AUTOSAVE_DEBOUNCE_MS = 800;
const RETRY_DELAYS_MS = [2000, 4000, 8000, 15000];

/** The wait before the n-th consecutive transport failure is retried automatically (n ≥ 1). */
export function retryDelayMs(failures: number): number {
  return RETRY_DELAYS_MS[Math.min(Math.max(failures, 1), RETRY_DELAYS_MS.length) - 1];
}

export class AutosaveController<C> {
  private latest: C;
  private revision = 0;
  private savedRevision = 0;
  private baseVersion: number;
  private inFlight: number | null = null;
  private flushAfterFlight = false;
  private timer: Handle | null = null;
  private problem: AutosaveProblem | null = null;
  private conflictVersion: number | null = null;
  private failures = 0;
  private savedAt: number | null = null;
  private lastEditAt = 0;
  private disposed = false;
  private readonly debounceMs: number;
  private readonly scheduleFn: (run: () => void, ms: number) => Handle;
  private readonly cancelFn: (handle: Handle) => void;
  private readonly now: () => number;

  constructor(private readonly options: AutosaveOptions<C>) {
    this.latest = options.config;
    this.baseVersion = options.baseVersion;
    this.debounceMs = options.debounceMs ?? AUTOSAVE_DEBOUNCE_MS;
    this.scheduleFn = options.schedule ?? ((run, ms) => setTimeout(run, ms));
    this.cancelFn = options.cancel ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
    this.now = options.now ?? (() => Date.now());
  }

  snapshot(): AutosaveSnapshot {
    const dirty = this.revision !== this.savedRevision;
    const status: AutosaveStatus =
      this.conflictVersion !== null ? 'conflict'
      : this.inFlight !== null ? 'saving'
      : dirty && this.problem ? 'failed'
      : dirty ? 'dirty'
      : 'saved';
    return {
      status,
      dirty,
      baseVersion: this.baseVersion,
      conflictVersion: this.conflictVersion,
      problem: this.problem,
      savedAt: this.savedAt,
      auto: this.options.auto,
    };
  }

  /** A newer config from the editor. */
  edit(config: C): void {
    if (this.disposed) return;
    this.latest = config;
    this.revision += 1;
    this.lastEditAt = this.now();
    if (this.options.auto && this.conflictVersion === null && this.inFlight === null) this.arm(this.debounceMs);
    this.notify();
  }

  /** Save now: the manual button, or "try again". While a save is in flight, the next one follows it at once. */
  flush(): void {
    if (this.disposed) return;
    this.disarm();
    if (this.inFlight !== null) {
      this.flushAfterFlight = true;
      return;
    }
    void this.run();
  }

  /** The host keeps this tab's edits over the stored version: rebase on it and save. */
  overwrite(): void {
    if (this.disposed || this.conflictVersion === null) return;
    this.baseVersion = this.conflictVersion;
    this.conflictVersion = null;
    this.problem = null;
    this.notify();
    void this.run();
  }

  dispose(): void {
    this.disposed = true;
    this.disarm();
  }

  private arm(ms: number) {
    this.disarm();
    this.timer = this.scheduleFn(() => {
      this.timer = null;
      void this.run();
    }, ms);
  }

  private disarm() {
    if (this.timer !== null) this.cancelFn(this.timer);
    this.timer = null;
  }

  private notify() {
    this.options.onChange?.(this.snapshot());
  }

  private async run(): Promise<void> {
    if (this.disposed || this.conflictVersion !== null || this.inFlight !== null) return;
    if (this.revision === this.savedRevision) return;
    const revision = this.revision;
    const request: SaveRequest<C> = { config: this.latest, expectedVersion: this.baseVersion };
    this.inFlight = revision;
    this.notify();

    let result: SaveResult;
    try {
      result = await this.options.send(request);
    } catch {
      result = { kind: 'retry', reason: 'network' };
    }
    this.inFlight = null;
    if (this.disposed) return;
    const flushNext = this.flushAfterFlight;
    this.flushAfterFlight = false;

    switch (result.kind) {
      case 'saved':
        this.savedRevision = revision;
        this.baseVersion = result.version;
        this.problem = null;
        this.failures = 0;
        this.savedAt = this.now();
        if (this.revision !== this.savedRevision) {
          if (flushNext) {
            this.notify();
            return this.run();
          }
          if (this.options.auto) this.arm(Math.max(0, this.lastEditAt + this.debounceMs - this.now()));
        }
        break;
      case 'conflict':
        this.conflictVersion = result.currentVersion;
        break;
      case 'refused':
        this.problem = result;
        this.failures = 0;
        // Edits made while the refused save was in flight are new content: they get their own attempt.
        if (this.revision !== revision) {
          if (flushNext) {
            this.notify();
            return this.run();
          }
          if (this.options.auto) this.arm(Math.max(0, this.lastEditAt + this.debounceMs - this.now()));
        }
        break;
      case 'retry':
        this.problem = result;
        this.failures += 1;
        if (flushNext) {
          this.notify();
          return this.run();
        }
        if (this.options.auto) this.arm(retryDelayMs(this.failures));
        break;
    }
    this.notify();
  }
}

/** The detail API's answer to a save, as the loop understands it. */
export function saveResultOf(status: number, body: unknown): SaveResult {
  const json = (body && typeof body === 'object' ? body : {}) as {
    version?: unknown;
    error?: { code?: unknown; details?: { currentVersion?: unknown } | null } | null;
  };
  if (status >= 200 && status < 300) {
    return Number.isInteger(json.version) ? { kind: 'saved', version: json.version as number } : { kind: 'retry', reason: 'server' };
  }
  const code = typeof json.error?.code === 'string' ? json.error.code : '';
  const currentVersion = json.error?.details?.currentVersion;
  if (status === 409 && code === 'VERSION_CONFLICT' && Number.isInteger(currentVersion)) {
    return { kind: 'conflict', currentVersion: currentVersion as number };
  }
  if (code === 'INVALID_MEDIA') return { kind: 'refused', reason: 'media' };
  if (code === 'THEME_NOT_ENTITLED') return { kind: 'refused', reason: 'theme' };
  if (status === 401) return { kind: 'refused', reason: 'signin' };
  if (status === 404) return { kind: 'refused', reason: 'notfound' };
  if (status === 400 || status === 422) return { kind: 'refused', reason: 'invalid' };
  if (code === 'SAVE_UNCONFIRMED') return { kind: 'retry', reason: 'unconfirmed' };
  return { kind: 'retry', reason: 'server' };
}
