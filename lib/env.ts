/**
 * Environment access with fail-loud validation.
 *
 * These values were once read straight off `process.env` at the point of use.
 * That is fine until one is missing, at which point the failure is silent rather
 * than loud. The original case was the session signing key: a missing
 * `AUTH_SECRET` did not throw, it produced the nine bytes of the string
 * "undefined" and handed them to HS256, so the deployment booted, served
 * traffic, and accepted session tokens forged by anyone who noticed. That
 * variable is gone now — Clerk owns sessions — but the lesson is why this module
 * exists: a missing value must be an error, never a default.
 *
 * Validation is lazy and memoised rather than module-level so that `next build`
 * — which imports modules without a runtime environment — still succeeds. The
 * first real request that needs a value is where a misconfiguration surfaces.
 */

class EnvError extends Error {
  constructor(message: string) {
    super(`[env] ${message}`);
    this.name = 'EnvError';
  }
}

function memo<T>(fn: () => T): () => T {
  let cached: { value: T } | null = null;
  return () => {
    if (!cached) cached = { value: fn() };
    return cached.value;
  };
}

/**
 * NOTE: `AUTH_SECRET` is gone.
 *
 * It signed the local session JWT. Clerk owns sessions now, so nothing reads it.
 * The accessor was removed rather than left in place: a validated secret that
 * protects nothing implies protection that does not exist, and the next reader
 * would reasonably assume rotating it mattered.
 */

export const getPostgresUrl = memo((): string => {
  const value = process.env.POSTGRES_URL;
  if (!value) throw new EnvError('POSTGRES_URL is not set.');
  return value;
});

/**
 * Clerk keys.
 *
 * Checked as a pair. A publishable key without a secret key produces a sign-in
 * form that renders, accepts a password, and then fails server-side — which
 * looks like a broken product rather than a missing variable.
 */
function assertClerkKeys(): void {
  const publishable = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();
  const secret = process.env.CLERK_SECRET_KEY?.trim();

  if (!publishable && !secret) {
    throw new EnvError(
      'Clerk is not configured. Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY ' +
        'from the Clerk dashboard → API keys.',
    );
  }
  if (!publishable) throw new EnvError('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is missing while CLERK_SECRET_KEY is set.');
  if (!secret) throw new EnvError('CLERK_SECRET_KEY is missing while NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is set.');

  // Mismatched environments are the subtle one: a live publishable key against a
  // test secret authenticates nobody, with no obvious error to read.
  const publishableEnv = publishable.startsWith('pk_live_') ? 'live' : publishable.startsWith('pk_test_') ? 'test' : null;
  const secretEnv = secret.startsWith('sk_live_') ? 'live' : secret.startsWith('sk_test_') ? 'test' : null;
  if (publishableEnv && secretEnv && publishableEnv !== secretEnv) {
    throw new EnvError(
      `Clerk keys are from different environments: publishable is ${publishableEnv}, secret is ${secretEnv}.`,
    );
  }
}

/** An entry shorter than this is guessable and gives false confidence. */
const MIN_ADMIN_ENTRY_LENGTH = 16;

/**
 * The unguessable admin path segment, or null when there is not a usable one.
 *
 * Null means "no admin surface is reachable" — the safe default, and never a
 * predictable fallback like "admin". A too-short value is treated the same way
 * rather than thrown, deliberately: this is read from middleware on every
 * request, so throwing would convert an admin-only misconfiguration into a
 * site-wide outage for customers and guests. The security boundary fails
 * closed, the rest of the site keeps serving, and `assertServerEnv` still
 * reports it loudly at boot.
 */
export const getAdminEntryPath = (): string | null => {
  const value = process.env.ADMIN_ENTRY_PATH?.trim();
  if (!value) return null;
  if (value.length < MIN_ADMIN_ENTRY_LENGTH) {
    console.error(
      `[env] ADMIN_ENTRY_PATH is only ${value.length} characters; at least ${MIN_ADMIN_ENTRY_LENGTH} are ` +
        'required. The admin surface is disabled until this is fixed.',
    );
    return null;
  }
  return value;
};

/** Boot-check variant that reports the problem instead of hiding it. */
function assertAdminEntryPath(): void {
  const raw = process.env.ADMIN_ENTRY_PATH?.trim();
  if (raw && raw.length < MIN_ADMIN_ENTRY_LENGTH) {
    throw new EnvError(
      `ADMIN_ENTRY_PATH is only ${raw.length} characters; at least ${MIN_ADMIN_ENTRY_LENGTH} are required ` +
        'to be unguessable.',
    );
  }
}

/** Optional allowlist narrowing which ADMIN accounts may actually sign in. */
export function getAdminAllowedEmails(): string[] {
  return (process.env.ADMIN_ALLOWED_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Boot-time check for long-running processes.
 *
 * Call from a startup path or a deploy smoke test to surface every problem at
 * once instead of one 500 at a time.
 */
export function assertServerEnv(): void {
  const problems: string[] = [];
  for (const check of [getPostgresUrl, assertAdminEntryPath, assertClerkKeys]) {
    try {
      check();
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (problems.length) throw new EnvError(`invalid configuration:\n  - ${problems.join('\n  - ')}`);
}
