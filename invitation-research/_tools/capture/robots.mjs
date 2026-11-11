// Shared robots.txt evaluation for the research tools (capture.mjs, discover-demos.mjs).
// We browse with a generic Android Chrome UA, so only `User-agent: *` groups apply to us (groups naming the same agent
// are combined, RFC 9309 §2.2.1). Matching follows RFC 9309 / Google: paths are compared after percent-encoding
// normalisation, `*` wildcards and a trailing `$` anchor are honoured, the longest matching pattern wins, and a tie
// goes to Allow; /robots.txt itself is always allowed.
// Policy on top of the standard (D-030, s12, replaces D-026's blanket cross-agent reading): these reads are made by an
// Anthropic Claude agent at the owner's direction (no training, no search index), so AI-agent groups bind by that
// identity and purpose, whatever UA we send:
//   applicable  - `Claude-User` (Anthropic: retrieval at a user's direction), `Content-Signal: ai-input=no` or
//                 `use=immediate` in a group that binds us (contentsignals.org, Cloudflare; RFC 9309 §2.2.4 allows other
//                 records), and a Cloudflare-managed Agent-policy section. A disallow is an opt-out.
//   uncertain   - the deprecated Anthropic names `anthropic-ai` / `Claude-Web`: their mapping after the ClaudeBot /
//                 Claude-User / Claude-SearchBot split is undocumented, so the restriction is kept (Q-O08), except inside
//                 the "Training crawlers" section of a Cloudflare Managed content block, a documented training opt-out.
//   recorded    - training / search tokens and other operators' agents (ClaudeBot, GPTBot, ChatGPT-User, ...): noted,
//                 not binding.
// Same semantics and matcher as agent_policy() in _tools/discovery/profile-reads.py.

export const APPLICABLE_AGENT_TOKENS = ['claude-user'];
export const UNCERTAIN_AGENT_TOKENS = ['anthropic-ai', 'claude-web'];
export const RECORDED_AGENT_TOKENS = ['claudebot', 'claude-searchbot', 'chatgpt-user', 'perplexity-user', 'gptbot', 'oai-searchbot',
  'perplexitybot', 'ccbot', 'google-extended', 'bytespider', 'amazonbot', 'applebot-extended', 'meta-externalagent', 'cohere-ai',
  'exauser', 'exasearchbot'];
const SIGNAL_KEYS = ['search', 'ai-input', 'ai-train'];
const APPLICABLE_SIGNAL = 'ai-input';
const USE_VALUES = ['immediate', 'reference', 'full'];
const USE_BLOCKING = ['immediate'];
// Cloudflare's managed robots.txt labels one section per enforced site policy. Legacy tokens inside its "Training
// crawlers" section are a documented training opt-out (recorded); an Agent section blocks user-directed AI agents as a
// category and binds us even if our token is not listed.
const MANAGED_BEGIN = /BEGIN Cloudflare Managed content/i;
const MANAGED_END = /END Cloudflare Managed content/i;
const TRAINING_SECTION = /training/i;
const AGENT_SECTION = /\bagents?\b|user[- ]initiated|assistants?/i;
const inTrainingSection = (g) => Boolean(g.section) && TRAINING_SECTION.test(g.section);
const inAgentSection = (g) => Boolean(g.section) && AGENT_SECTION.test(g.section) && !inTrainingSection(g);
const UNRESERVED = /[A-Za-z0-9\-._~]/;

// Fetch outcome before any parsing (RFC 9309 §2.3.1.3–2.3.1.4, session 07 / D-022): 2xx → parse the body (fetch() has
// already followed redirects); 4xx "unavailable" → no rules, allowed; 5xx "unreachable" → assume complete disallow.
// 429 is treated like 5xx (Google does the same). The RFC's 30-day fallback to "unavailable" is never used here.
/** @returns {null | { allowed: boolean, note: string }} null = parse the body with robotsVerdict */
export function robotsStatusVerdict(status) {
  if (status >= 200 && status < 300) return null;
  if (status >= 400 && status < 500 && status !== 429) return { allowed: true, note: `robots.txt ${status} (unavailable: no rules)` };
  return { allowed: false, note: `robots.txt ${status} (unreachable: assume disallow, RFC 9309)` };
}

/** Network failure while fetching robots.txt: unreachable, so assume complete disallow (RFC 9309 §2.3.1.4). */
export const robotsUnreachable = (reason) => ({ allowed: false, note: `robots.txt unreachable (${reason}): assume disallow, RFC 9309` });

/** Percent-encoding normalisation (RFC 9309 §2.2.2): non-printable / non-ASCII octets encoded, unreserved escapes
 * decoded, other escapes upper-cased; in a URL path a literal `*` or `$` is encoded so only rule syntax is special. */
export function normalize(value, pattern = false) {
  const bytes = new TextEncoder().encode(value);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i];
    const hex = String.fromCharCode(bytes[i + 1] ?? 0, bytes[i + 2] ?? 0);
    if (c === 0x25 && /^[0-9A-Fa-f]{2}$/.test(hex)) {
      const decoded = String.fromCharCode(parseInt(hex, 16));
      out += UNRESERVED.test(decoded) ? decoded : `%${hex.toUpperCase()}`;
      i += 2;
    } else if (c <= 0x20 || c >= 0x7f || (!pattern && (c === 0x2a || c === 0x24))) {
      out += `%${c.toString(16).toUpperCase().padStart(2, '0')}`;
    } else {
      out += String.fromCharCode(c);
    }
  }
  return out;
}

/** `Content-Signal` value → { prefix, signals }; accepts the path-scoped form `/blog/ ai-train=no, ...`. */
export function parseSignal(value) {
  let rest = value.trim();
  let prefix = null;
  if (rest.startsWith('/')) {
    const space = rest.indexOf(' ');
    prefix = space < 0 ? rest : rest.slice(0, space);
    rest = space < 0 ? '' : rest.slice(space + 1);
  }
  const signals = {};
  for (const part of rest.split(',')) {
    const [key, val] = part.split('=').map((s) => s?.trim().toLowerCase());
    if (val !== undefined && SIGNAL_KEYS.includes(key) && (val === 'yes' || val === 'no')) signals[key] = val === 'yes';
    else if (key === 'use' && USE_VALUES.includes(val)) signals.use = val;
  }
  return { prefix, signals };
}

function parseGroups(text) {
  const groups = [];
  let current = null;
  let managed = false;
  let section = null;
  for (const raw of text.split(/\r?\n/)) {
    const stripped = raw.trim();
    if (stripped.startsWith('#')) {
      const note = stripped.replace(/^#+/, '').trim();
      if (MANAGED_BEGIN.test(note)) [managed, section] = [true, ''];
      else if (MANAGED_END.test(note)) [managed, section] = [false, null];
      else if (managed && note) section = note;
      continue;
    }
    const line = raw.split('#')[0].trim();
    const colon = line.indexOf(':');
    if (colon < 1) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key === 'user-agent') {
      if (!current || current.rules.length) {
        current = { agents: [], rules: [], signals: [], section: managed ? section : null };
        groups.push(current);
      }
      current.agents.push((value.match(/^[A-Za-z_*-]+/)?.[0] ?? value).toLowerCase());
    } else if ((key === 'allow' || key === 'disallow') && current) {
      current.rules.push({ allow: key === 'allow', path: value });
    } else if (key === 'content-signal' && current) {
      const parsed = parseSignal(value);
      if (Object.keys(parsed.signals).length) current.signals.push(parsed);
    }
  }
  return groups;
}

/** Signals for the path from groups naming `tokens`; per key the longest matching prefix wins (unscoped = ''). */
function contentSignals(groups, pathWithQuery, tokens = ['*', ...APPLICABLE_AGENT_TOKENS]) {
  const best = {};
  for (const g of groups) {
    if (!g.agents.some((a) => tokens.includes(a))) continue;
    for (const { prefix, signals } of g.signals) {
      const scope = prefix ?? '';
      if (!pathWithQuery.startsWith(scope)) continue;
      for (const [key, allowed] of Object.entries(signals)) {
        if (!(key in best) || scope.length >= best[key].len) best[key] = { len: scope.length, allowed };
      }
    }
  }
  return Object.fromEntries(Object.entries(best).map(([k, v]) => [k, v.allowed]));
}

const rulesFor = (groups, token, keep = () => true) =>
  groups.filter((g) => g.agents.includes(token) && keep(g)).flatMap((g) => g.rules).filter((r) => r.path);

function patternToRegex(pattern) {
  const anchored = pattern.endsWith('$');
  const body = normalize(anchored ? pattern.slice(0, -1) : pattern, true)
    .replaceAll('$', '%24')
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${body}${anchored ? '$' : ''}`, 's');
}

/** Longest matching pattern wins; a tie goes to Allow. @returns {{ allow: boolean, path: string } | undefined} */
function bestMatch(rules, pathWithQuery) {
  if (pathWithQuery.split('?')[0] === '/robots.txt') return undefined;
  const target = normalize(pathWithQuery);
  return rules
    .filter((r) => patternToRegex(r.path).test(target))
    .sort((a, b) => normalize(b.path, true).length - normalize(a.path, true).length || Number(b.allow) - Number(a.allow))[0];
}

/** D-030 classification of the AI-agent groups that disallow the path. @returns {{ applicable: string[],
 * uncertain: string[], recorded: string[], signals: Record<string, boolean> }} */
export function agentPolicy(text, pathWithQuery) {
  const groups = parseGroups(text);
  const disallowed = (rules) => {
    const match = rules.length ? bestMatch(rules, pathWithQuery) : undefined;
    return match !== undefined && !match.allow;
  };
  const signals = contentSignals(groups, pathWithQuery);
  const applicable = APPLICABLE_AGENT_TOKENS.filter((t) => disallowed(rulesFor(groups, t)));
  if (signals[APPLICABLE_SIGNAL] === false) applicable.push(`content-signal:${APPLICABLE_SIGNAL}=no`);
  if (USE_BLOCKING.includes(signals.use)) applicable.push(`content-signal:use=${signals.use}`);
  if (groups.some((g) => inAgentSection(g) && disallowed(g.rules.filter((r) => r.path)))) applicable.push('cloudflare-managed:agent-policy');
  const uncertain = [];
  const recorded = RECORDED_AGENT_TOKENS.filter((t) => disallowed(rulesFor(groups, t)));
  for (const t of UNCERTAIN_AGENT_TOKENS) {
    if (disallowed(rulesFor(groups, t, (g) => !inTrainingSection(g)))) uncertain.push(t);
    else if (disallowed(rulesFor(groups, t))) recorded.push(`${t} (managed training section)`);
  }
  return { applicable: applicable.sort(), uncertain: uncertain.sort(), recorded: recorded.sort(), signals };
}

/** Tokens / signals that stop a read under D-030 (applicable + uncertain). */
export function aiAgentOptOut(text, pathWithQuery) {
  const p = agentPolicy(text, pathWithQuery);
  return [...p.applicable, ...p.uncertain].sort();
}

/** @returns {{ allowed: boolean, note: string, notBinding?: string[] }} */
export function robotsVerdict(text, pathWithQuery) {
  const p = agentPolicy(text, pathWithQuery);
  const notBinding = p.recorded.length ? { notBinding: p.recorded } : {};
  if (p.applicable.length) {
    return { allowed: false, note: `AI-agent opt-out (${p.applicable.join(', ')}: disallows ${pathWithQuery}; applicable, D-030)`, ...notBinding };
  }
  if (p.uncertain.length) {
    return {
      allowed: false,
      note: `legacy Anthropic group (${p.uncertain.join(', ')}) disallows ${pathWithQuery}; applicability undocumented, restriction kept (D-030, Q-O08)`,
      ...notBinding,
    };
  }
  const match = bestMatch(rulesFor(parseGroups(text), '*'), pathWithQuery);
  return { allowed: !match || match.allow, note: match ? `${match.allow ? 'Allow' : 'Disallow'}: ${match.path}` : 'no matching rule', ...notBinding };
}
