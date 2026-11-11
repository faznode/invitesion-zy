<!-- SUMMARY (first 7 lines — greppable) -->
# robots-applicability-s12.md — Q-O08 applicability audit and the D-030 rule
> WHAT: Who actually fetches for this research, which robots.txt groups apply to it and why, the documented rule that replaces D-026's blanket cross-agent reading (D-030), its result for every competitor origin, and Enviory's capture-time versus current evidence (D-031).
> STATUS: s12 (2026-11-04). Rule decided and enforced in both robots matchers; audit run over 58 origins. Open: Canva legacy group (uncertain, restricted), Enviory challenge sequence (Q-O09), declared research token (Q-O10). Independent review pending (RQ-VER-03).
> OWNER: Oracle (research)
> DEPS: ../_tools/discovery/profile-reads.py, ../_tools/capture/robots.mjs, ../_tools/discovery/robots-applicability-audit.py, ../raw/_discovery/robots-applicability-2026-11-04.jsonl, ../_rea-playbook.md, ../_open-questions.md
> GREP: robots, D-030, D-031, Q-O08, Q-O09, anthropic-ai, Claude-Web, Claude-User, ExaUser, Content-Signal, Cloudflare managed, applicability
> UPDATED: 2026-11-04

## 1. The question and the owner's policy
Several competitor robots.txt files disallow `anthropic-ai` and `Claude-Web`, two names Anthropic no longer uses. D-026 (s10) treated any such group, and the groups of other operators' user agents, as an explicit opt-out for this research, whatever the group's purpose. The owner's decision of 2026-11-04 replaces that blanket reading where it overreaches. A legacy crawler group is not automatically a prohibition on every AI agent, and the absence of a current bot name is not permission to ignore a restriction that does apply. Applicability is decided from the actual fetching identity, the applicable groups and paths, provider documentation and the purpose of the access, using RFC 9309 and official sources. Identities, clients and routes are never changed to get around a restriction. Where uncertainty remains, the conservative access restriction stays and the missing evidence is named.

## 2. Who actually fetches
| Client | Used for | Identity it sends | Network origin | robots.txt handling |
|---|---|---|---|---|
| Research scripts: `profile-reads.py`, `probe-homepages.py`, `recheck-robots.py`, `robots-applicability-audit.py` (Python `urllib`) | Static public-page reads, robots re-checks | Generic Android Chrome 156 UA; no crawler product token | Vercel Sandbox egress (AWS; `3.101.53.41` observed 2026-11-04) | Own RFC 9309 matcher + D-030 before every request; redirects followed by hand and checked per hop |
| Browser captures: `capture.mjs`, `discover-demos.mjs`, `rea-*.mjs` (Chrome for Testing via CDP, Lighthouse 12.8.2, REA 6.8.0) | Performance and structure captures of demo pages | Same UA override | Same sandbox | `robots.mjs` (same semantics) before each capture |
| The agent platform's reader (WebFetch) | 10 early evidence rows (S-SMO-001, S-PLO-001, S-ENV-001, S-KAT-003, S-INV-002, S-WEV-001…003, S-WEV-005); S-RSV-002's read is excluded | `Mozilla/5.0 (compatible; ExaUser/1.0; +https://exauser.crawler.exa.ai)`, signed with Web Bot Auth (observed through an echo service, 2026-11-04) | Exa's infrastructure | **None guaranteed.** Exa: "Because fetches are initiated by a user, robots.txt rules may not apply". The identity in use during s01–s07 is [UNKNOWN]; only today's is observed |

The owner directs the work; an Anthropic Claude model carries it out inside Vercel v0 and a Vercel Sandbox. None of these requests come from Anthropic's own bots, which run on Anthropic's infrastructure.

**Transparency gap (finding).** RFC 9309 §2.2.1 says a crawler's product token SHOULD be part of its User-Agent and its identification string SHOULD describe its purpose. The scripts' browser UA does neither. It was chosen at the start for faithful mobile rendering in measurements, not in reaction to any block. Because D-030 decides applicability from the operator's real identity and purpose, not from the UA string, the UA does not widen access under this project's rules. It does mean a site operator cannot address our tools by name. Whether static reads should carry a declared research token is owner question **Q-O10**. Nothing was changed: changing identity in the middle of this audit would muddy the record.

**Process finding.** Because the WebFetch reader does not promise robots compliance, a WebFetch read is only acceptable after this project's own robots check. S-ENV-001 (11:19 WIB) came one minute before Enviory's robots.txt was read (S-ENV-002, 11:20 WIB). Today's file allows that page under D-030, and the same-day record gives no sign that it was disallowed for `*`. Rule from s12: competitor pages are read with `profile-reads.py`, not WebFetch.

## 3. Purpose of the access
User-directed retrieval for the owner's competitive research. Nothing here trains a model, and nothing builds a search index. Page content does enter the AI model's working context so that research notes can be written; in Content Signals terms that is **AI input**. What is kept in the repository: facts, our own measurements, structure blueprints, our own words and source links. Page text, screenshots and robots copies stay in the private directory.

## 4. Sources
| Source | What it establishes | Level |
|---|---|---|
| RFC 9309 §2.2.1, §2.2.2, §2.2.4, §2.3.1 | Groups bind by product token; groups naming the same agent are combined; `*` applies when nothing else matches; longest match, Allow wins a tie; crawlers MAY interpret other records; status-code handling (D-022) | Normative |
| Anthropic Help Center, "Does Anthropic crawl data from the web, and how can site owners block the crawler?" (article dated 2026-04-07, read 2026-11-04) | Three bots: **ClaudeBot**, collection that could contribute to training (restricting it excludes future material from training); **Claude-User**, retrieval when a user asks Claude a question; **Claude-SearchBot**, search indexing. The legacy names are not mentioned | Official |
| Same article, web.archive.org snapshots 2024-05-01 … 2024-10-10 | Mentions ClaudeBot only; never the legacy names. 2025 snapshots hold no readable article text [UNKNOWN] | Official, archived |
| Anthropic spokesperson to 404 Media, update of 2024-07-30 | `anthropic-ai` and `Claude-Web` are "no longer in use"; ClaudeBot, then "our centralized user agent", was configured to respect directives previously set for them | [CLAIMED], second-hand press report, not in the documentation |
| Cloudflare docs, "robots.txt setting" (updated 2026-11-02) | Managed robots.txt is generated by Bot Preference Sync from three site policies: Search, Agent, Training. "To add managed directives for AI training crawlers … For Training, select Disallow"; Search and Agent add their own directives when set to Block; `use=reference` is a content-use extension under test: "Index, excerpt, and link back" | Official (the CDN that wrote the block) |
| contentsignals.org (Cloudflare) | `search`, `ai-input` (content fed into AI models, e.g. grounding or real-time answers), `ai-train`; a missing signal "neither grants nor restricts" | Official |
| Exa, "ExaUser" (updated 2026-11-02) | ExaUser fetches a page live when a user or an application built on Exa asks; "robots.txt rules may not apply"; does not bypass logins, paywalls or CAPTCHAs | Official (the reader's operator) |

## 5. The rule (D-030)
| Class | Members | Basis | Effect |
|---|---|---|---|
| Binding by RFC 9309 | `*`; a group naming the client's own token (`ExaUser` for WebFetch reads) | RFC 9309 §2.2.1 | Obey the rules |
| **Applicable** by identity and purpose | `Claude-User`; `Content-Signal: ai-input=no` or `use=immediate` in a group that binds us; a Cloudflare-managed Agent-policy section (a category-level block of user-directed AI agents, even if our token is not listed) | Anthropic docs; contentsignals.org; Cloudflare docs | Opt-out: no request, origin stopped |
| **Uncertain, restricted** | `anthropic-ai`, `Claude-Web` in any group except the one below | The 2024 mapping to ClaudeBot predates the ClaudeBot / Claude-User / Claude-SearchBot split; whether Claude-User honours the old names is undocumented | No request, labelled "applicability undocumented", Q-O08 residual |
| **Documented training opt-out** | `anthropic-ai`, `Claude-Web` inside the "Training crawlers" section of a `# BEGIN … # END Cloudflare Managed content` block | The block is generated by the site's Training = Disallow policy (Cloudflare docs) and labels the section itself; consistent with Anthropic's 2024 mapping to ClaudeBot, which is the training crawler today | Recorded, not binding. Any site-written group naming the same token is still evaluated |
| Recorded, not binding | Training and search tokens: ClaudeBot, Claude-SearchBot, GPTBot, CCBot, Google-Extended, Bytespider, Amazonbot, Applebot-Extended, meta-externalagent, cohere-ai, … Other operators' agents: ChatGPT-User, Perplexity-User, OAI-SearchBot, PerplexityBot, ExaUser and ExaSearchBot (for the scripts) | Provider descriptions of purpose; RFC token semantics (a group binds the crawler it names) | Noted in the output, never a block |
| Fetch outcome | robots.txt 5xx, 429 or unreachable | RFC 9309 §2.3.1.4, D-022 | Disallow everything |

Process rules that go with it: robots before any read; competitor pages through `profile-reads.py`, not WebFetch; a bot challenge ends the attempt and there is no other client (playbook §5). On `use=reference` origins the repository keeps facts, measurements, our own analysis and links, with no reproduction of copy.

**What changed from D-026.**
- Other operators' user agents no longer bind our Claude agent.
- The legacy names are no longer an "explicit opt-out" by assertion. They are uncertain by default, and a training opt-out where the file documents that.
- Content Signals are read.
- A managed Agent section binds by category.
- The s10 sentence "`Claude-Web` historically identified Anthropic's user-initiated fetches" is not supported by Anthropic's documentation. It rested on press and third-party reports and is corrected to [INFERRED, undocumented].

Enforced in `profile-reads.py` (`agent_policy()`) and `robots.mjs` (`agentPolicy()`). Offline tests: 28 Python and 15 Node. Each of 19 deliberate mutations fails the suites. Examples: other operators' agents made binding again, legacy names relaxed everywhere, the managed exception removed or applied outside a managed block, Content Signals ignored, `ai-train` treated as binding, path scope ignored, the Agent section or `use=immediate` ignored. Two further single-guard mutants of the managed-block check are equivalent, because both guards check the block; removing both is caught.

## 6. Result across every competitor origin (2026-11-04)
`robots-applicability-audit.py`: 58 origins (the whole longlist plus every capture, profile-read and WebFetch origin), 63 robots.txt requests, no page requests. Robots status: 48 with rules, 8 without rules, 2 disallow-all.

| Origin | Vendor | Where the legacy groups sit | Other signals | D-026 status | **D-030 status** |
|---|---|---|---|---|---|
| sitemu.id | STM, Tier A rank 10 | Managed "Training crawlers" section: `anthropic-ai`, `Claude-Web`. The site's own section after the block **allows** `Claude-Web`, `ClaudeBot`, `ChatGPT-User`, `GPTBot`, `Google-Extended` | `search=yes, ai-train=no, use=reference` | Blocked | **Readable** |
| enviory.com | ENV, Tier A | Managed training section (identical block) | same | Policy-contested (D-028) | **Readable today**; capture-time evidence: §7 |
| harikita.id | HRK, Tier B | Managed training section | same | Blocked | **Readable** |
| sonett.kr | SNT, Tier B | Managed training section | same | Blocked | **Readable** |
| www.wedmegood.com | WMG, Tier B | Managed training section | same | Blocked | **Readable** |
| simplora.id | SPL, longlist | Managed training section | same | not checked | Readable (no read planned) |
| www.canva.com | CNV, Tier B | Site-written group `GPTBot, ClaudeBot, CCBot, Applebot-Extended, anthropic-ai, Claude-Web` → `Disallow: /`, `Allow: /create/`, no label. The same file allows `PerplexityBot` and `Perplexity-User` | none | Blocked | **Restricted (uncertain)**. Training intent is likely [INFERRED from the grouping] but not documented |
| levigo.id | LVG, longlist | n/a | robots.txt 502 | n/a | Disallow-all (D-022) |
| studio.viding.co | VID demo host | n/a | robots.txt 500 | Disallow-all | Disallow-all; C-VID-104…106 stay excluded |

The six managed blocks are byte-identical over their first 95 lines (`sha256` prefix `9a2857aaf9e9`), contain one section, "Training crawlers" (33 user-agent lines), and no Search or Agent section. No origin has a `Claude-User` group, an `ai-input=no` signal, a managed Agent section or an `ExaUser` group. Eleven origins disallow training or search tokens, which are recorded and not binding: Bytespider 9, CCBot 9, ClaudeBot 8, GPTBot 8, Amazonbot 7, Applebot-Extended 6, Google-Extended 6, meta-externalagent 6, cohere-ai 5, ChatGPT-User 1. Every recorded read and capture is allowed under D-030 against today's files. The only apparent hit, a Zola path, had been refused at the time and never requested; the audit tool's first version counted it and was fixed.

**Consequences:**
- Sitemu (RQ-COMP-02) and Harikita, Sonett and WedMeGood (RQ-COMP-04) are no longer blocked by robots policy, and were read in s12 with the D-030 tool.
- Canva stays restricted. What would resolve it: a Canva statement of the group's purpose, a labelled section, or groups that name current tokens.

## 7. Enviory: capture-time evidence versus the current file (D-031)
| When | What | Robots evidence at that moment |
|---|---|---|
| 2026-10-29 10:37–10:49 WIB | C-ENV-101…106, preview wrappers (ineligible anyway, D-006) | Capture tool evaluated `*` only: "Allow: /" (stored in each capture JSON) |
| 11:19 WIB | S-ENV-001 homepage through WebFetch | Before the robots read (process deviation, §2) |
| 11:20 WIB | S-ENV-002: robots.txt + one plain fetch of the demo guest page | "`*` Allow, AI training crawlers Disallow" (`anthropic-ai` named). The page answered a **Cloudflare JS challenge (HTTP 403)** |
| 11:41–11:50 WIB | C-ENV-111…116, guest pages, Chrome | `*` "Allow: /"; no challenge served to the browser |
| 2026-10-30 05:06–05:24 WIB | C-ENV-117…123, REA | `*` "Allow: /" |
| 2026-11-04 ≈ 04:50Z | S-ENV-003 (s11) | `anthropic-ai` and `Claude-Web` `Disallow: /` |
| 2026-11-04 (s12) | S-ENV-004 | Both inside the Cloudflare managed "Training crawlers" section; site section adds nothing for them |

**G1, robots applicability: resolved, not applicable.**
- *Today's file:* a documented training opt-out.
- *Capture day:* the file was not preserved and the Wayback Machine has no 2025–2026 copy. The same-day record (S-ENV-002) describes the disallowed AI groups as training crawlers beside a `*` Allow, which is consistent with the managed block. Residual uncertainty, stated:
  - "Training" on 2026-10-29 is the analyst's classification, not a preserved label [INFERRED].
  - Whether `Claude-Web` was in the file then is [UNKNOWN].

**G2, challenge sequence: open (Q-O09).**
- *The sequence:* a plain fetch of the demo guest page met a Cloudflare challenge at 11:20; browser captures of guest pages followed from 11:41 and the next day.
- *The rule:* playbook §5 says "after a bot challenge … no other client". That wording dates from s07, after these captures. S-RSV-002 set the precedent by excluding content read through a second client after a challenge as "too close to a bypass". R1 ("no bypass of bot protection") did apply on the capture day.
- *The difference:* the browser was never challenged (13 of 13), and it was the protocol's designated client for guest pages, not a reaction to the challenge. That is a real difference from S-RSV-002, but the written rule does not draw it.
- *Recommendation:* apply the S-RSV-002 precedent, excluding C-ENV-111…123 from benchmark aggregates and coverage counts while keeping the files, unless the owner or the independent reviewer rules that a protocol-designated browser that is not itself challenged is not a fallback client.

**Status until Q-O09 is answered:** Enviory evidence is **provisional on G2 only**. It is retained with provenance, flagged in the dossier header, and every conclusion that depends on it is reported with and without it; the without-Enviory figure is the unconditional one. No new request goes to Enviory's demo guest pages, because the challenge ended that route. Its public marketing pages are readable under D-030 but are not needed now.

**Same rule, other vendors.** The evidence index records two challenges, S-ENV-002 and S-RSV-002. RSVPify's case was settled in s07. No other capture follows a recorded challenge.

## 8. Established versus uncertain
- **Established:**
  - The identities and network origins of our clients (observed today).
  - ExaUser's own statement that it may not apply robots.txt.
  - Anthropic's current three-bot taxonomy.
  - The legacy names' absence from Anthropic's documentation.
  - The six managed blocks, their single "Training crawlers" section and their signals.
  - Sitemu's own Allow groups.
  - Cloudflare's description of how managed blocks are generated.
- **Claimed:** the 2024 spokesperson mapping of the legacy names to ClaudeBot.
- **Inferred:**
  - Enviory's capture-day block was the same managed training block.
  - Canva's legacy group is meant for training.
- **Unknown:**
  - Whether Claude-User honours the legacy names.
  - The WebFetch identity during s01–s07.
  - `Claude-Web` in Enviory's capture-day file.
  - What the 2025 versions of Anthropic's article said.

## 9. Revisit triggers
- Anthropic documents how the legacy names map to Claude-User. The uncertain class then becomes either applicable or recorded everywhere.
- Canva labels its group or names current tokens.
- Cloudflare changes the managed block's structure or section labels. The tests pin today's markers.
- The owner answers Q-O09 or Q-O10.
- Any site adds `ai-input=no`, an Agent section or a `Claude-User` group. The tools enforce these without code changes.

## 10. Reproduce
```bash
python3 -B invitation-research/_tools/discovery/test_profile_reads.py
node --test invitation-research/_tools/capture/robots.test.mjs
cd invitation-research/_tools/discovery && \
  python3 -B robots-applicability-audit.py --out ../../raw/_discovery/robots-applicability-YYYY-MM-DD.jsonl
```
Robots copies are written to `$INVITESION_PRIVATE_DIR/robots-s12/` and never committed. The committed JSONL holds statuses, token classes, signals, verdicts and a body hash.
