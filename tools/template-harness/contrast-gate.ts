/**
 * contrast-gate.ts — PASS / FAIL / INCOMPLETE verdicts for rendered colour-contrast audits (B-016).
 *
 * A page PASSES only on positive evidence: Lighthouse finished without a runtime error on the requested page, its
 * `color-contrast` audit returned the binary score 1 with no failing node, and axe's needs-review list (from the
 * gathered artifacts) holds no `color-contrast` node it could not measure. Any failing node makes the page FAIL.
 * Everything else is INCOMPLETE and never counts as a finished contrast gate: a missing, null, not-applicable or
 * errored audit, a contradictory or non-binary score, a report for another page or a redirect, missing needs-review
 * results, a Lighthouse process that did not finish, or a report that cannot be read.
 *
 * Why the needs-review list matters: Lighthouse 12 scores `color-contrast` from axe violations only. Text axe cannot
 * measure (over a background image, a gradient, an overlapping element) is left out of the score silently, so a 1
 * alone does not mean every text node was measured. Lighthouse runs axe with `resultTypes: ['violations',
 * 'inapplicable']`, so the needs-review list carries at most one sample node per rule: it shows THAT text went
 * unmeasured, not how much.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export const CONTRAST_AUDIT_ID = 'color-contrast';

export type ContrastStatus = 'PASS' | 'FAIL' | 'INCOMPLETE';
export type ContrastNode = { selector: string; snippet: string; explanation: string };
export type PageVerdict = {
  label: string;
  url: string;
  status: ContrastStatus;
  /** Why the page is not PASS (empty for PASS). FAIL keeps any additional reasons for the record. */
  reasons: string[];
  score: number | null;
  failures: ContrastNode[];
  /** axe needs-review sample(s) for `color-contrast`: text that was not measured. */
  unmeasured: ContrastNode[];
};

type ReportNode = { selector?: string; snippet?: string; explanation?: string };
type ReportAudit = {
  score?: number | null;
  scoreDisplayMode?: string;
  errorMessage?: string;
  details?: { items?: Array<{ node?: ReportNode }> };
};
export type ContrastReport = {
  requestedUrl?: string;
  finalDisplayedUrl?: string;
  finalUrl?: string;
  runtimeError?: { code?: string; message?: string };
  audits?: Record<string, ReportAudit | undefined>;
};
type AxeRule = {
  id?: string;
  nodes?: Array<{ node?: { selector?: string; snippet?: string }; failureSummary?: string }>;
  error?: { message?: string };
};
export type AccessibilityArtifact = { violations?: AxeRule[]; incomplete?: AxeRule[]; notApplicable?: Array<{ id?: string }> };

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Same page: origin, path (trailing slash ignored) and query; the fragment never changes the document. */
export function sameDocument(a: string, b: string): boolean {
  try {
    const [x, y] = [new URL(a), new URL(b)];
    const path = (url: URL) => url.pathname.replace(/\/+$/, '') || '/';
    return x.origin === y.origin && path(x) === path(y) && x.search === y.search;
  } catch {
    return false;
  }
}

const firstLine = (text: string | undefined) => (text ?? '').split('\n')[0].trim();

export function classifyContrast(input: { label: string; url: string; report: unknown; accessibility: unknown }): PageVerdict {
  const { label, url } = input;
  const reasons: string[] = [];
  let score: number | null = null;
  let failures: ContrastNode[] = [];
  let unmeasured: ContrastNode[] = [];
  const verdict = (status: ContrastStatus): PageVerdict => ({ label, url, status, reasons, score, failures, unmeasured });

  if (!isObject(input.report)) {
    reasons.push('no readable Lighthouse report');
    return verdict('INCOMPLETE');
  }
  const report = input.report as ContrastReport;

  if (report.runtimeError?.code) {
    reasons.push(`Lighthouse runtime error ${report.runtimeError.code}${report.runtimeError.message ? `: ${firstLine(report.runtimeError.message)}` : ''}`);
  }
  if (report.requestedUrl && !sameDocument(report.requestedUrl, url)) reasons.push(`report is for ${report.requestedUrl}, not ${url}`);
  const finalUrl = report.finalDisplayedUrl ?? report.finalUrl;
  if (!finalUrl) reasons.push('report does not name the page it measured');
  else if (!sameDocument(finalUrl, url)) reasons.push(`page ended at ${finalUrl} (redirect), not ${url}`);

  const audit = report.audits?.[CONTRAST_AUDIT_ID];
  if (!isObject(audit)) {
    reasons.push(`no ${CONTRAST_AUDIT_ID} audit in the report`);
  } else {
    const mode = audit.scoreDisplayMode;
    if (mode === 'notApplicable') reasons.push('audit not applicable: axe found no text to measure');
    else if (mode === 'error') reasons.push(`audit errored: ${firstLine(audit.errorMessage) || 'no message'}`);
    else if (mode !== undefined && mode !== 'binary') reasons.push(`unexpected score mode "${mode}"`);
    if (audit.errorMessage && mode !== 'error') reasons.push(`audit reported an error: ${firstLine(audit.errorMessage)}`);

    score = typeof audit.score === 'number' && Number.isFinite(audit.score) ? audit.score : null;
    const items = Array.isArray(audit.details?.items) ? audit.details.items : [];
    failures = items.map((item) => ({
      selector: item.node?.selector ?? '',
      snippet: item.node?.snippet ?? '',
      explanation: firstLine(item.node?.explanation),
    }));
    if (score === null) {
      if (mode !== 'notApplicable' && mode !== 'error') reasons.push('audit returned no score');
    } else if (score !== 0 && score !== 1) {
      reasons.push(`non-binary score ${score}`);
    } else if (score === 0 && failures.length === 0) {
      reasons.push('score 0 without any failing node');
    }
  }

  if (!isObject(input.accessibility)) {
    reasons.push('axe needs-review results were not collected (gathered artifacts missing)');
  } else {
    const artifact = input.accessibility as AccessibilityArtifact;
    const rule = (Array.isArray(artifact.incomplete) ? artifact.incomplete : []).find((entry) => entry?.id === CONTRAST_AUDIT_ID);
    if (rule?.error) reasons.push(`axe error: ${firstLine(rule.error.message) || 'no message'}`);
    unmeasured = (rule?.nodes ?? []).map((node) => ({
      selector: node.node?.selector ?? '',
      snippet: node.node?.snippet ?? '',
      explanation: firstLine(node.failureSummary),
    }));
    if (unmeasured.length) {
      reasons.push(`axe could not measure text contrast (needs review; sample ${unmeasured[0].selector || unmeasured[0].snippet || 'unnamed node'})`);
    }
  }

  if (failures.length) return verdict('FAIL');
  if (reasons.length) return verdict('INCOMPLETE');
  if (score === 1) return verdict('PASS');
  reasons.push('no positive evidence of a pass');
  return verdict('INCOMPLETE');
}

export type Exec = (file: string, args: string[], options: { env: NodeJS.ProcessEnv; timeout: number }) => unknown;

const defaultExec: Exec = (file, args, options) =>
  execFileSync(file, args, { ...options, stdio: ['ignore', 'ignore', 'pipe'] });

export type AuditTarget = { label: string; url: string };
export type AuditOptions = { lighthouse: string; chromePath: string; outDir: string; desktop?: boolean; exec?: Exec };

export function lighthouseContrastArgs(url: string, reportFile: string, artifactsDir: string, desktop = false): string[] {
  return [
    url,
    `--only-audits=${CONTRAST_AUDIT_ID}`,
    '--output=json',
    `--output-path=${reportFile}`,
    `--gather-mode=${artifactsDir}`,
    `--audit-mode=${artifactsDir}`,
    '--quiet',
    '--throttling-method=provided',
    ...(desktop ? ['--preset=desktop'] : []),
    '--chrome-flags=--headless=new --no-sandbox --disable-gpu --force-prefers-reduced-motion',
  ];
}

/** One Lighthouse run for one page; every way the run can go wrong ends as INCOMPLETE, never as a pass. */
export function auditPage(target: AuditTarget, options: AuditOptions): PageVerdict {
  const { label, url } = target;
  const reportFile = join(options.outDir, `${label}.report.json`);
  const artifactsDir = join(options.outDir, `${label}.artifacts`);
  const artifactsFile = join(artifactsDir, 'artifacts.json');
  rmSync(reportFile, { force: true });
  rmSync(artifactsFile, { force: true });
  const incomplete = (reason: string): PageVerdict => ({ label, url, status: 'INCOMPLETE', reasons: [reason], score: null, failures: [], unmeasured: [] });

  try {
    (options.exec ?? defaultExec)(options.lighthouse, lighthouseContrastArgs(url, reportFile, artifactsDir, options.desktop), {
      env: { ...process.env, CHROME_PATH: options.chromePath },
      timeout: 180_000,
    });
  } catch (error) {
    const failure = error as { status?: number | null; signal?: string | null; stderr?: unknown; message?: string };
    const how = failure.signal ? `killed by ${failure.signal}` : typeof failure.status === 'number' ? `exited ${failure.status}` : firstLine(failure.message ?? String(error));
    const lastStderr = String(failure.stderr ?? '').trim().split('\n').filter(Boolean).at(-1)?.trim().slice(0, 200);
    return incomplete(`Lighthouse did not finish (${how})${lastStderr ? `: ${lastStderr}` : ''}`);
  }
  if (!existsSync(reportFile)) return incomplete('Lighthouse wrote no report');
  let report: unknown;
  try {
    report = JSON.parse(readFileSync(reportFile, 'utf8'));
  } catch {
    return incomplete('report is not valid JSON');
  }
  let accessibility: unknown;
  if (existsSync(artifactsFile)) {
    try {
      accessibility = (JSON.parse(readFileSync(artifactsFile, 'utf8')) as { Accessibility?: unknown }).Accessibility;
    } catch {
      accessibility = undefined;
    }
  }
  return classifyContrast({ label, url, report, accessibility });
}

export type ContrastSummary = {
  overall: ContrastStatus;
  counts: Record<ContrastStatus, number>;
  exitCode: 0 | 1 | 3;
};

/** PASS only when at least one page ran and every page passed; any FAIL wins over INCOMPLETE. */
export function summarizeContrast(pages: PageVerdict[]): ContrastSummary {
  const counts: Record<ContrastStatus, number> = { PASS: 0, FAIL: 0, INCOMPLETE: 0 };
  for (const page of pages) counts[page.status] += 1;
  const overall: ContrastStatus = !pages.length ? 'INCOMPLETE' : counts.FAIL ? 'FAIL' : counts.INCOMPLETE ? 'INCOMPLETE' : 'PASS';
  return { overall, counts, exitCode: overall === 'PASS' ? 0 : overall === 'FAIL' ? 1 : 3 };
}
