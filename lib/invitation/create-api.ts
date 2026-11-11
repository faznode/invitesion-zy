import 'server-only';

import { ApiProblem, apiConfigFromEnv, apiPost, type ApiProblemIssue } from '@/lib/api/client';
import type { CreationIssue, DraftCreateOutcome, DraftCreateRequest } from './creation-rules';
import type { MediaReferenceIssue } from './media-ownership';
import type { ThemeIssue } from './theme-entitlement';

/**
 * B-037 (D-055): the Rust writer's side of draft creation (`BACKEND_CONTENT=rust`; `next` stays the default). Exactly one
 * writer per call and never a fallback to the other. The creation key travels in the body and is stored on the row, so an
 * unknown outcome (unreachable, timed out, 5xx) is sent exactly once more with the same key and answers with the draft
 * the first attempt made, if it made one; if that is unknown too the outcome is "unconfirmed" (R-03's rule, D-043).
 * Problems map to the outcomes the TypeScript writer returns; a 400 or 401 is a deployment or programming error and
 * propagates.
 */

type Env = Record<string, string | undefined>;

const isAmbiguous = (error: ApiProblem) => error.status === 0 || error.status >= 500;

const CREATION_PATHS: ReadonlySet<string> = new Set<CreationIssue['path']>(['eventType', 'theme.templateId']);
const CREATION_REASONS: ReadonlySet<string> = new Set<CreationIssue['reason']>(['event-type', 'template-mismatch']);
const MEDIA_REASONS: ReadonlySet<string> = new Set<MediaReferenceIssue['reason']>(['protected-outside-child-photo', 'not-this-invitation']);
const THEME_PATHS: ReadonlySet<string> = new Set<ThemeIssue['path']>(['theme.templateId', 'theme.paletteId']);
const THEME_REASONS: ReadonlySet<string> = new Set<ThemeIssue['reason']>(['unknown-template', 'premium-template', 'unknown-palette', 'premium-palette']);

const creationIssues = (issues: ApiProblemIssue[] = []): CreationIssue[] =>
  issues
    .filter((issue) => CREATION_PATHS.has(issue.path) && CREATION_REASONS.has(issue.reason))
    .map((issue) => ({ path: issue.path as CreationIssue['path'], reason: issue.reason as CreationIssue['reason'] }));

const mediaIssues = (issues: ApiProblemIssue[] = []): MediaReferenceIssue[] =>
  issues.filter((issue) => MEDIA_REASONS.has(issue.reason)).map((issue) => ({ path: issue.path, reason: issue.reason as MediaReferenceIssue['reason'] }));

const themeIssues = (issues: ApiProblemIssue[] = []): ThemeIssue[] =>
  issues
    .filter((issue) => THEME_PATHS.has(issue.path) && THEME_REASONS.has(issue.reason))
    .map((issue) => ({ path: issue.path as ThemeIssue['path'], reason: issue.reason as ThemeIssue['reason'] }));

export async function createDraftThroughApi(input: DraftCreateRequest & { ownerToken: string }, env: Env = process.env): Promise<DraftCreateOutcome> {
  if (input.creationKey === null) throw new Error('[creation] the API path needs a creation key for its retry');
  const config = apiConfigFromEnv(env);
  const post = () =>
    apiPost(
      config,
      '/v1/invitations',
      {
        templateId: input.templateId,
        eventType: input.eventType,
        slugBase: input.slugBase,
        config: input.config as Record<string, unknown>,
        creationKey: input.creationKey as string,
      },
      { ownerToken: input.ownerToken },
    );
  try {
    let created;
    try {
      created = await post();
    } catch (error) {
      if (!(error instanceof ApiProblem && isAmbiguous(error))) throw error;
      created = await post();
    }
    return { kind: 'created', invitationId: created.invitationId, slug: created.slug, replayed: created.replayed };
  } catch (error) {
    if (!(error instanceof ApiProblem)) throw error;
    switch (error.code) {
      case 'creation.template_missing':
        return { kind: 'template-missing' };
      case 'creation.refused':
        return { kind: 'creation', issues: creationIssues(error.extras.issues) };
      case 'content.media_refused':
        return { kind: 'media', issues: mediaIssues(error.extras.issues) };
      case 'content.theme_not_entitled':
        return { kind: 'theme', issues: themeIssues(error.extras.issues) };
    }
    // The API knows no live customer for this session (deleted, or an administrator): the wizard's rule is sign-in.
    if (error.status === 403) return { kind: 'signin' };
    if (isAmbiguous(error)) {
      // Codes and status only: a problem never carries the draft's content, and neither does this line.
      console.error(`[creation] outcome unknown after a retry with the same key (${error.status} ${error.code})`);
      return { kind: 'unconfirmed' };
    }
    throw error;
  }
}
