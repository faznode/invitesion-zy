import 'server-only';

import { randomUUID } from 'node:crypto';
import { ApiProblem, apiConfigFromEnv, apiPostTo, type ApiProblemIssue } from '@/lib/api/client';
import type { ContentWriteOutcome, ContentWriteRequest } from './content-rules';
import type { MediaReferenceIssue } from './media-ownership';
import { THEME_ISSUE_PATHS, THEME_ISSUE_REASONS, type ThemeIssue } from './theme-entitlement';

/**
 * B-035: the Rust writer's side of the editor's save (`BACKEND_CONTENT=rust`; `next` stays the default). Exactly one
 * writer per call and never a fallback to the other: a fallback after a timeout could write a second time for a save the
 * first writer already committed. The write carries an `Idempotency-Key` that the API records in the transaction of the
 * write, so an unknown outcome (unreachable, timed out, 5xx) is sent exactly once more under the same key and stays
 * "unconfirmed" if that is unknown too (R-03's rule, D-043). Problems map to the outcomes the TypeScript writer returns;
 * a 400 or 401 is a deployment or programming error and propagates.
 */

type Env = Record<string, string | undefined>;

const isAmbiguous = (error: ApiProblem) => error.status === 0 || error.status >= 500;

const MEDIA_REASONS: ReadonlySet<string> = new Set<MediaReferenceIssue['reason']>(['protected-outside-child-photo', 'not-this-invitation']);
const THEME_PATHS: ReadonlySet<string> = new Set<string>(THEME_ISSUE_PATHS);
const THEME_REASONS: ReadonlySet<string> = new Set<string>(THEME_ISSUE_REASONS);

const mediaIssues = (issues: ApiProblemIssue[] = []): MediaReferenceIssue[] =>
  issues.filter((issue) => MEDIA_REASONS.has(issue.reason)).map((issue) => ({ path: issue.path, reason: issue.reason as MediaReferenceIssue['reason'] }));

const themeIssues = (issues: ApiProblemIssue[] = []): ThemeIssue[] =>
  issues
    .filter((issue) => THEME_PATHS.has(issue.path) && THEME_REASONS.has(issue.reason))
    .map((issue) => ({ path: issue.path as ThemeIssue['path'], reason: issue.reason as ThemeIssue['reason'] }));

export async function writeContentThroughApi(
  input: ContentWriteRequest & { ownerToken: string },
  env: Env = process.env,
): Promise<ContentWriteOutcome> {
  const config = apiConfigFromEnv(env);
  const post = (idempotencyKey: string) =>
    apiPostTo(
      config,
      '/v1/invitations/{invitation}/content',
      { invitation: input.invitationId },
      { baseVersion: input.baseVersion, config: input.config as Record<string, unknown>, touchedSections: input.touchedSections },
      { ownerToken: input.ownerToken, idempotencyKey },
    );
  const key = randomUUID();
  try {
    let saved;
    try {
      saved = await post(key);
    } catch (error) {
      if (!(error instanceof ApiProblem && isAmbiguous(error))) throw error;
      saved = await post(key);
    }
    return { kind: 'saved', version: saved.version };
  } catch (error) {
    if (!(error instanceof ApiProblem)) throw error;
    switch (error.code) {
      case 'content.not_found':
        return { kind: 'notfound' };
      case 'content.version_conflict':
        if (error.extras.currentVersion !== undefined) return { kind: 'conflict', currentVersion: error.extras.currentVersion };
        break;
      case 'content.media_refused':
        return { kind: 'media', issues: mediaIssues(error.extras.issues) };
      case 'content.theme_not_entitled':
        return { kind: 'theme', issues: themeIssues(error.extras.issues) };
    }
    // The API knows no live customer for this session (deleted, or an administrator): the editor's rule is sign-in.
    if (error.status === 403) return { kind: 'signin' };
    if (isAmbiguous(error)) {
      // Codes and status only: a problem never carries the invitation's content, and neither does this line.
      console.error(`[content] save: outcome unknown after a retry under the same key (${error.status} ${error.code})`);
      return { kind: 'unconfirmed' };
    }
    throw error;
  }
}
