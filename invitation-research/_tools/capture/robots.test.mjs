// node --test invitation-research/_tools/capture/robots.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agentPolicy, aiAgentOptOut, normalize, robotsStatusVerdict, robotsUnreachable, robotsVerdict } from './robots.mjs';

test('fetch status: 2xx parses, 4xx allows, 429/5xx and network failures disallow (RFC 9309, D-022)', () => {
  assert.equal(robotsStatusVerdict(200), null);
  assert.equal(robotsStatusVerdict(404).allowed, true);
  assert.equal(robotsStatusVerdict(410).allowed, true);
  assert.equal(robotsStatusVerdict(429).allowed, false);
  assert.equal(robotsStatusVerdict(500).allowed, false);
  assert.equal(robotsStatusVerdict(503).allowed, false);
  assert.equal(robotsUnreachable('TimeoutError').allowed, false);
});

test('wildcard rules no longer swallow every path (session-03 false positive)', () => {
  const txt = 'User-agent: *\nAllow: /\nDisallow: /*?sort=\nDisallow: /account/\n';
  assert.equal(robotsVerdict(txt, '/').allowed, true);
  assert.equal(robotsVerdict(txt, '/demo/serein').allowed, true);
  assert.equal(robotsVerdict(txt, '/cards?sort=new').allowed, false);
  assert.equal(robotsVerdict(txt, '/account/settings').allowed, false);
});

test('only * groups apply; multi-agent groups are kept together', () => {
  const txt = 'User-agent: GPTBot\nUser-agent: CCBot\nDisallow: /\n\nUser-agent: *\nDisallow: /admin\n';
  assert.equal(robotsVerdict(txt, '/').allowed, true);
  assert.equal(robotsVerdict(txt, '/admin/x').allowed, false);
});

test('a * agent listed next to others still receives the group rules', () => {
  const txt = 'User-agent: *\nUser-agent: Bingbot\nDisallow: /private\n';
  assert.equal(robotsVerdict(txt, '/private/a').allowed, false);
});

test('$ anchor, longest match, tie goes to Allow', () => {
  const txt = 'User-agent: *\nDisallow: /*.pdf$\nDisallow: /tema\nAllow: /tema/\n';
  assert.equal(robotsVerdict(txt, '/file.pdf').allowed, false);
  assert.equal(robotsVerdict(txt, '/file.pdf?x=1').allowed, true);
  assert.equal(robotsVerdict(txt, '/tema/aurelia').allowed, true);
  assert.equal(robotsVerdict(txt, '/tema').allowed, false);
  assert.equal(robotsVerdict('User-agent: *\nDisallow: /x\nAllow: /x\n', '/x').allowed, true);
});

test('D-030: a Claude-User opt-out is applicable and honoured', () => {
  const v = robotsVerdict('User-agent: *\nAllow: /\n\nUser-agent: Claude-User\nDisallow: /\n', '/');
  assert.equal(v.allowed, false);
  assert.match(v.note, /AI-agent opt-out \(claude-user.*applicable, D-030/);
});

test('D-030: other operators\' user agents are recorded, not binding (D-026 overreach removed)', () => {
  const txt = 'User-agent: *\nAllow: /\n\nUser-agent: ChatGPT-User\nUser-agent: Perplexity-User\nDisallow: /\n';
  const v = robotsVerdict(txt, '/');
  assert.equal(v.allowed, true);
  assert.deepEqual(v.notBinding, ['chatgpt-user', 'perplexity-user']);
});

test('D-030: legacy Anthropic tokens keep the restriction, labelled uncertain; training and search tokens do not bind', () => {
  const legacy = 'User-agent: *\nAllow: /\n\nUser-agent: Claude-Web\nDisallow: /\n\nUser-agent: anthropic-ai\nDisallow: /\n';
  const v = robotsVerdict(legacy, '/product');
  assert.equal(v.allowed, false);
  assert.match(v.note, /legacy Anthropic group \(anthropic-ai, claude-web\).*undocumented.*Q-O08/);
  const trainingOnly = 'User-agent: *\nAllow: /\n\nUser-agent: ClaudeBot\nUser-agent: GPTBot\nUser-agent: Claude-SearchBot\nDisallow: /\n';
  const t = robotsVerdict(trainingOnly, '/');
  assert.equal(t.allowed, true);
  assert.deepEqual(t.notBinding, ['claude-searchbot', 'claudebot', 'gptbot']);
});

test('D-030: Content-Signal ai-input=no in a binding group stops the read; ai-train / search do not', () => {
  assert.equal(robotsVerdict('User-agent: *\nContent-Signal: ai-train=no, search=yes, ai-input=no\nAllow: /\n', '/').allowed, false);
  assert.match(robotsVerdict('User-agent: *\nContent-Signal: ai-input=no\nAllow: /\n', '/').note, /content-signal:ai-input=no/);
  assert.equal(robotsVerdict('User-agent: *\nContent-Signal: search=yes, ai-train=no\nAllow: /\n', '/').allowed, true);
  assert.equal(robotsVerdict('User-agent: GPTBot\nContent-Signal: ai-input=no\nAllow: /\n', '/').allowed, true, 'signal in a group that does not bind us');
  const scoped = 'User-agent: *\nContent-Signal: ai-input=no\nContent-Signal: /about ai-input=yes\nAllow: /\n';
  assert.equal(robotsVerdict(scoped, '/about/team').allowed, true, 'longest path-scoped signal wins');
  assert.equal(robotsVerdict(scoped, '/harga').allowed, false);
});

const MANAGED = '# As a condition of accessing this website, you agree to abide by the following\n'
  + '# BEGIN Cloudflare Managed content\nUser-agent: *\nContent-Signal: search=yes,ai-train=no,use=reference\nAllow: /\n'
  + '# Training crawlers\nUser-agent: ClaudeBot\nDisallow: /\nUser-agent: anthropic-ai\nDisallow: /\nUser-agent: Claude-Web\nDisallow: /\n'
  + '# END Cloudflare Managed Content\nUser-Agent: *\nAllow: /\nDisallow: /api/\n';

test('D-030: legacy tokens inside a Cloudflare-managed Training section are a documented training opt-out', () => {
  const p = agentPolicy(MANAGED, '/');
  assert.deepEqual([p.applicable, p.uncertain], [[], []]);
  assert.deepEqual(p.recorded, ['anthropic-ai (managed training section)', 'claude-web (managed training section)', 'claudebot']);
  assert.deepEqual(p.signals, { search: true, 'ai-train': false, use: 'reference' });
  assert.equal(robotsVerdict(MANAGED, '/harga').allowed, true);
  assert.equal(robotsVerdict(MANAGED, '/api/x').allowed, false, 'the site-authored * section still binds');
});

test('D-030: a legacy group written by the site itself, or a training label outside a managed block, stays uncertain', () => {
  assert.deepEqual(agentPolicy(`${MANAGED}User-agent: anthropic-ai\nDisallow: /\n`, '/').uncertain, ['anthropic-ai']);
  assert.deepEqual(agentPolicy('# Training crawlers\nUser-agent: Claude-Web\nDisallow: /\n', '/').uncertain, ['claude-web']);
  const sitemu = `${MANAGED}User-Agent: Claude-Web\nAllow: /\n`;
  assert.deepEqual(agentPolicy(sitemu, '/').recorded.filter((t) => t.startsWith('claude-web')), [], 'site Allow ties the managed Disallow');
});

test('D-030: a managed Agent section and use=immediate are applicable opt-outs', () => {
  const agents = '# BEGIN Cloudflare Managed content\n# AI agents\nUser-agent: ChatGPT-User\nDisallow: /\n# END Cloudflare Managed Content\n';
  assert.deepEqual(agentPolicy(agents, '/').applicable, ['cloudflare-managed:agent-policy']);
  assert.equal(robotsVerdict('User-agent: *\nContent-Signal: use=immediate\nAllow: /\n', '/').allowed, false);
});

test('empty Disallow allows everything', () => {
  assert.equal(robotsVerdict('User-agent: *\nDisallow:\n', '/anything').allowed, true);
});

test('s11: AI-agent groups use the full matcher (path-specific, wildcard, combined groups, tie → Allow)', () => {
  const pathOnly = 'User-agent: *\nAllow: /\n\nUser-agent: Claude-User\nDisallow: /demo/\n';
  assert.equal(robotsVerdict(pathOnly, '/demo/aurora').allowed, false, 'a path-specific AI disallow binds that path');
  assert.equal(robotsVerdict(pathOnly, '/').allowed, true);
  assert.equal(robotsVerdict('User-agent: Claude-Web\nDisallow: /*\n', '/x').allowed, false, 'Disallow: /* restricts too');
  const sitemuShape = 'User-agent: anthropic-ai\nDisallow: /\n\nUser-agent: Claude-Web\nDisallow: /\n\nUser-agent: Claude-Web\nAllow: /\n';
  assert.deepEqual(aiAgentOptOut(sitemuShape, '/'), ['anthropic-ai'], 'two Claude-Web groups combine into a tie that Allow wins');
  assert.equal(robotsVerdict(sitemuShape, '/').allowed, false, 'the anthropic-ai group keeps the restriction (D-030 uncertain)');
});

test('s11: percent-encoding normalisation, literal %2A, /robots.txt always allowed', () => {
  assert.equal(robotsVerdict('User-agent: *\nDisallow: /%7Ejoe/\n', '/~joe/a').allowed, false);
  assert.equal(robotsVerdict('User-agent: *\nDisallow: /foo/ツ\n', '/foo/%E3%83%84').allowed, false);
  assert.equal(robotsVerdict('User-agent: *\nDisallow: /f-%2A.html\n', '/f-x.html').allowed, true);
  assert.equal(robotsVerdict('User-agent: *\nDisallow: /f-%2A.html\n', '/f-*.html').allowed, false);
  assert.equal(robotsVerdict('User-agent: *\nDisallow: /\n', '/robots.txt').allowed, true);
  assert.equal(normalize('/a b'), '/a%20b');
});
