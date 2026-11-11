import 'server-only';

import type { paths } from './schema';
import { SIGNATURE_HEADER, signServiceRequest } from './signature';

/**
 * Server-side client for the Rust domain API (`services/api`, R-01). Types come from `./schema.d.ts`, generated from
 * the committed `services/api/openapi.json` (`scripts/api/contract.sh`); CI fails when either drifts. Every request is
 * signed; the API is never called from a browser.
 */
export type ApiConfig = {
  baseUrl: string;
  secret: string;
  timeoutMs?: number;
  /** Tests inject a fetch; production uses the global one. */
  fetch?: typeof fetch;
};

export class ApiConfigError extends Error {}

/** A refused field, by path and rule (B-035: D-040 references, B-041 theme), never its value. */
export type ApiProblemIssue = { path: string; reason: string };

/** What a problem is about (RFC 9457 extension members) and when to retry a 429. */
export type ApiProblemExtras = {
  eventId?: string;
  questionId?: string;
  reason?: string;
  retryAfter?: number;
  /** B-035: the version a `content.version_conflict` found stored. */
  currentVersion?: number;
  /** B-035: the fields a `content.media_refused` or `content.theme_not_entitled` problem refused. */
  issues?: ApiProblemIssue[];
};

function issuesOf(value: unknown): ApiProblemIssue[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const issues = value.filter(
    (item): item is ApiProblemIssue =>
      typeof item === 'object' && item !== null && typeof item.path === 'string' && typeof item.reason === 'string',
  );
  return issues.map(({ path, reason }) => ({ path, reason }));
}

/** An RFC 9457 problem answered by the API, or a transport failure with code `transport.*`. */
export class ApiProblem extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly detail?: string,
    readonly extras: ApiProblemExtras = {},
  ) {
    super(`API ${status} ${code}${detail ? `: ${detail}` : ''}`);
    this.name = 'ApiProblem';
  }
}

const MIN_SECRET_LENGTH = 32;
const DEFAULT_TIMEOUT_MS = 3000;

export function apiConfigFromEnv(env: Record<string, string | undefined> = process.env): ApiConfig {
  const baseUrl = env.API_BASE_URL?.trim().replace(/\/+$/, '');
  const secret = env.INTERNAL_API_SECRET?.trim();
  if (!baseUrl) throw new ApiConfigError('API_BASE_URL is not set');
  if (!/^https?:\/\//.test(baseUrl)) throw new ApiConfigError('API_BASE_URL must be an http(s) URL');
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new ApiConfigError(`INTERNAL_API_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
  }
  return { baseUrl, secret };
}

type Operation<P extends keyof paths, M extends 'get' | 'post'> = NonNullable<paths[P][M]>;
type PathsWith<M extends 'get' | 'post'> = {
  [P in keyof paths]: [NonNullable<paths[P][M]>] extends [never] ? never : P;
}[keyof paths];
type JsonBody<O> = O extends { requestBody: { content: { 'application/json': infer B } } } ? B : never;
type JsonOk<O> = O extends { responses: { 200: { content: { 'application/json': infer R } } } } ? R : never;
type PathParams<O> = O extends { parameters: { path: infer T } } ? T : never;

type RequestOptions = { ownerToken?: string; requestId?: string; idempotencyKey?: string | null };

/**
 * A path template with its parameters, each percent-encoded as one segment (`encodeURIComponent`). The result is what
 * `fetch` sends and what the API sees, so it is also what gets signed.
 */
export function expandPath(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = params[name];
    if (value === undefined) throw new ApiConfigError(`missing path parameter ${name}`);
    return encodeURIComponent(String(value));
  });
}

async function send<T>(config: ApiConfig, method: 'GET' | 'POST', path: string, body: string, options: RequestOptions): Promise<T> {
  const timestamp = Math.floor(Date.now() / 1000);
  const headers: Record<string, string> = {
    accept: 'application/json, application/problem+json',
    [SIGNATURE_HEADER]: signServiceRequest(config.secret, timestamp, method, path, body),
  };
  if (method === 'POST') headers['content-type'] = 'application/json';
  if (options.ownerToken) headers.authorization = `Bearer ${options.ownerToken}`;
  if (options.requestId) headers['x-request-id'] = options.requestId;
  if (options.idempotencyKey) headers['idempotency-key'] = options.idempotencyKey;

  let response: Response;
  try {
    response = await (config.fetch ?? fetch)(`${config.baseUrl}${path}`, {
      method,
      headers,
      body: method === 'POST' ? body : undefined,
      signal: AbortSignal.timeout(config.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    throw new ApiProblem(0, timedOut ? 'transport.timeout' : 'transport.unreachable');
  }
  const text = await response.text();
  if (!response.ok) {
    let code = 'transport.unexpected_status';
    let detail: string | undefined;
    const extras: ApiProblemExtras = {};
    try {
      const problem = JSON.parse(text) as {
        code?: unknown;
        detail?: unknown;
        eventId?: unknown;
        questionId?: unknown;
        reason?: unknown;
        currentVersion?: unknown;
        issues?: unknown;
      };
      if (typeof problem.code === 'string') code = problem.code;
      if (typeof problem.detail === 'string') detail = problem.detail;
      if (typeof problem.eventId === 'string') extras.eventId = problem.eventId;
      if (typeof problem.questionId === 'string') extras.questionId = problem.questionId;
      if (typeof problem.reason === 'string') extras.reason = problem.reason;
      if (Number.isInteger(problem.currentVersion) && (problem.currentVersion as number) >= 0) {
        extras.currentVersion = problem.currentVersion as number;
      }
      const issues = issuesOf(problem.issues);
      if (issues) extras.issues = issues;
    } catch {
      // A non-problem body (a proxy's HTML page) keeps the generic code.
    }
    const retryAfter = Number(response.headers.get('retry-after'));
    if (Number.isInteger(retryAfter) && retryAfter > 0) extras.retryAfter = retryAfter;
    throw new ApiProblem(response.status, code, detail, extras);
  }
  return JSON.parse(text) as T;
}

export function apiPost<P extends PathsWith<'post'>>(
  config: ApiConfig,
  path: P,
  body: JsonBody<Operation<P, 'post'>>,
  options: RequestOptions = {},
): Promise<JsonOk<Operation<P, 'post'>>> {
  return send(config, 'POST', path, JSON.stringify(body), options);
}

/** POST to a templated path (`/v1/guest-links/{slug}/{guest}/rsvp`) with its typed path parameters. */
export function apiPostTo<P extends PathsWith<'post'>>(
  config: ApiConfig,
  template: P,
  params: PathParams<Operation<P, 'post'>>,
  body: JsonBody<Operation<P, 'post'>>,
  options: RequestOptions = {},
): Promise<JsonOk<Operation<P, 'post'>>> {
  return send(config, 'POST', expandPath(template, params as Record<string, string | number>), JSON.stringify(body), options);
}

/** POST without a body to a templated path: an action its path names fully (undoing one import). Signed over ''. */
export function apiPostEmpty<P extends PathsWith<'post'>>(
  config: ApiConfig,
  template: P,
  params: PathParams<Operation<P, 'post'>>,
  options: RequestOptions = {},
): Promise<JsonOk<Operation<P, 'post'>>> {
  return send(config, 'POST', expandPath(template, params as Record<string, string | number>), '', options);
}

export function apiGet<P extends PathsWith<'get'>>(
  config: ApiConfig,
  path: P,
  options: RequestOptions = {},
): Promise<JsonOk<Operation<P, 'get'>>> {
  return send(config, 'GET', path, '', options);
}
