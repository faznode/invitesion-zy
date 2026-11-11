#!/usr/bin/env python3
"""Reference integrity for the living research documents: evidence IDs resolve, cross-document IDs exist, links work.

    python3 -B invitation-research/_tools/safety/check-references.py            # report + exit 1 on any unresolved item
    python3 -B invitation-research/_tools/safety/check-references.py --summary  # counts only

Scope: living documents only (masterplan, analysis folders, dossiers, Tier-B profiles, flows, benchmark pack, audit,
handoff entry points, READMEs). Session logs and dated reviews are append-only history and may cite retired paths, so they
are not checked. ID families and where each must resolve:
  S-/H-/P-/B-<CODE>-NNN, V-REA-NNN, D-<CODE> -> _evidence-index.md      C-<CODE>-NNN -> raw/_captures.csv or raw/*/<id>.json
  D-NNN -> _progress.md       F-NNN -> 01-codebase-audit/feature-inventory.csv    FM-NNN -> 05-feature-matrix/feature-matrix.csv
  G-NNN -> 06-gap-analysis/upgrade-map.csv   QA-NNN -> 01-codebase-audit/quality-audit.md   M-NNN -> 01-codebase-audit/module-map.md
  B-NNN[a] -> 09-masterplan/06-backlog.md     I-NN -> 07-ideation/ideas.csv     ADR-* -> 09-masterplan/12-decision-log.md
  E-NNN -> _handoff/IMPLEMENTATION-LOG.md     Q-O0N / Q-DNN -> _open-questions.md    RQ-* -> _handoff/acceptance-matrix.md
Ranges written as "S-VID-001…006" or "C-ENV-111…123" are expanded. Relative Markdown links must point to existing files.
Repository paths quoted in backticks or listed on a `> DEPS:` header line (anything containing "/" with a file extension or
a trailing "/") must exist relative to the document, `invitation-research/` or the repository root; `{a,b}` braces and `*`
globs are expanded. Paths that are absent on purpose (git-ignored or owner-removed) are listed in INTENTIONALLY_ABSENT;
the "Old path" / "Original path" column of a path-map table names retired paths by design and is not checked.
"""
import argparse
import fnmatch
import glob
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
RESEARCH = os.path.normpath(os.path.join(HERE, '..', '..'))
ROOT = os.path.normpath(os.path.join(RESEARCH, '..'))

# 02-competitor-discovery/*.md added s13: the s12 robots-applicability audit defines D-030 / D-031 and cites Q-O09, Q-O10 and
# S-ENV-004, none of which were registered, and the old scope never checked that folder.
LIVING = [
    '02-competitor-discovery/*.md',
    '09-masterplan/*.md', '05-feature-matrix/*.md', '06-gap-analysis/*.md', '07-ideation/*.md', '08-backend-rust-plan/README.md',
    '08-backend-rust-plan/spike/README.md', '03-teardowns/*/dossier.md', '03-teardowns/tier-b-profiles.md', '03-teardowns/_flows/*.md',
    '04-template-benchmarks/*.md', '01-codebase-audit/*.md', '_handoff/LATEST.md', '_handoff/acceptance-matrix.md',
    '_handoff/IMPLEMENTATION-LOG.md', 'README.md',
]
ROOT_DOCS = ['README.md', 'archive/README.md']

# Absent by design: git-ignored private/scratch locations and owner-removed folders that docs name only to forbid them.
# `.clerk` (root `.gitignore`: `/.clerk/`) is written at runtime by Clerk's keyless dev mode and must never be committed.
INTENTIONALLY_ABSENT = {
    'invitation-research/_private', 'invitation-research/_handoff/briefs', 'invitation-research/_handoff/logs',
    'tools/template-harness/.out', 'storage', '.env', '.env.local', '.clerk',
}
# Path-map tables record moves: cells under these headers name retired paths on purpose; every other column is checked.
RETIRED_PATH_COLUMNS = ('old path', 'original path', 'previous path')
PATH_EXT = r'(?:md|csv|py|mjs|js|sh|ts|tsx|json|jsonl|tsv|sql|css|txt|html|webp|png|jpg|gltf|wav|woff2|yaml|yml|toml|lock)'
PATH_TOKEN = re.compile(r'^(?:\.{1,2}/)?[\w@.\-\[\]()]+(?:/[\w@.\-\[\]()*{},]+)*(?:\.' + PATH_EXT + r'|/)$')


def braces(token):
    """Expand one level of `{a,b}` (repeatedly, left to right)."""
    m = re.search(r'\{([^{}]*)\}', token)
    if not m:
        return [token]
    return [x for part in m.group(1).split(',') for x in braces(token[:m.start()] + part + token[m.end():])]


def without_retired_path_cells(text):
    """Blank the cells of path-map columns ("Old path", "Original path"); the header row of each table decides."""
    out, skip = [], None
    for line in text.split('\n'):
        stripped = line.strip()
        if not stripped.startswith('|'):
            skip = None
            out.append(line)
            continue
        cells = stripped.strip('|').split('|')
        if skip is None:
            skip = {i for i, cell in enumerate(cells) if cell.strip().lower().startswith(RETIRED_PATH_COLUMNS)}
        elif skip:
            line = '|' + '|'.join('' if i in skip else cell for i, cell in enumerate(cells)) + '|'
        out.append(line)
    return '\n'.join(out)


def path_candidates(text):
    """Backticked path tokens plus the comma-separated entries of `> DEPS:` lines.

    Skipped: a path introduced as proposed ("new `x`", "new client island `x`"), host names (`example.com/robots.txt`) and
    package paths (`pkg@6/dist/x.js`)."""
    found = set()
    for m in re.finditer(r'`([^`\s]+)`', text):
        if re.search(r'\bnew(?:\s+[\w-]+){0,3}\s*$', text[max(0, m.start() - 40):m.start()], re.I):
            continue
        found.add(m.group(1))
    for line in re.findall(r'^> DEPS:(.*)$', text, re.M):
        for part in re.split(r',\s+(?![^{]*\})', line):
            token = part.strip().split(' ', 1)[0].rstrip('.;:')
            if token:
                found.add(token)
    out = set()
    for token in found:
        token = re.sub(r'(#[\w\-.]*|:\d+(?:-\d+)?)$', '', token).rstrip('.,;:')
        if '/' not in token or re.search(r'[<>$…|?]|\.\.\.|^\w+://|^/|^~', token):
            continue
        first = token.split('/', 1)[0]
        if '@' in first or re.match(r'^[\w-]+(\.[\w-]+)*\.(com|net|org|id|co|io|app|dev|kr|vn|my|in|jp)$', first):
            continue
        if PATH_TOKEN.match(token):
            out.add(token)
    return out


_TREE = None


def repo_tree():
    """Every file and directory under the repository (relative, '/'-separated), without dependencies or build output."""
    global _TREE
    if _TREE is None:
        entries = set()
        for dirpath, dirnames, filenames in os.walk(ROOT):
            dirnames[:] = [d for d in dirnames if d not in ('node_modules', '.next', '.git')]
            rel = os.path.relpath(dirpath, ROOT).replace(os.sep, '/')
            if rel != '.':
                entries.add(rel + '/')
            entries.update(f if rel == '.' else f'{rel}/{f}' for f in filenames)
        _TREE = entries
    return _TREE


def path_exists(token, doc_dir):
    for variant in braces(token):
        for base in (doc_dir, RESEARCH, ROOT):
            candidate = os.path.normpath(os.path.join(base, variant))
            rel = os.path.relpath(candidate, ROOT).rstrip('/')
            if rel in INTENTIONALLY_ABSENT or any(rel.startswith(a + '/') for a in INTENTIONALLY_ABSENT):
                break
            if ('*' in variant and glob.glob(candidate)) or os.path.exists(candidate):
                break
        else:
            # In-context shorthand ("`spike/results/`", "`edit/page.tsx`") resolves when some repository path ends with it.
            tail = variant.lstrip('./')
            if '*' in tail:
                if not any(fnmatch.fnmatchcase(entry, tail) or fnmatch.fnmatchcase(entry, '*/' + tail) for entry in repo_tree()):
                    return False
            elif not any(entry == tail or entry.endswith('/' + tail) for entry in repo_tree()):
                return False
    return True


def read(rel, base=RESEARCH):
    path = os.path.join(base, rel)
    return open(path, encoding='utf-8').read() if os.path.exists(path) else ''


def expand(text):
    """Yield every ID token, expanding "X-NNN…MMM" / "X-NNN...MMM" ranges."""
    for m in re.finditer(r'\b((?:[A-Z]-[A-Z]{3}|V-REA|FM|QA|[CSHPBFGMEDI])-)(\d{2,3})(a?)(?:\s?(?:…|\.\.\.)\s?(\d{2,3}))?', text):
        prefix, start, suffix, end = m.group(1), m.group(2), m.group(3), m.group(4)
        width = len(start)
        if end and len(end) == width and int(end) >= int(start) and int(end) - int(start) < 200:
            for n in range(int(start), int(end) + 1):
                yield f'{prefix}{n:0{width}d}'
        else:
            yield f'{prefix}{start}{suffix}'


def known_ids():
    evidence = read('_evidence-index.md')
    captures = read('raw/_captures.csv') + ' '.join(os.path.basename(p)[:-5] for p in glob.glob(os.path.join(RESEARCH, 'raw', '*', 'C-*.json')))
    captures += ' '.join(os.path.basename(p) for p in glob.glob(os.path.join(RESEARCH, 'raw', 'invitesion', 'C-*')))
    tables = {
        'evidence': set(expand(evidence)) | set(re.findall(r'\bD-[A-Z]{3}\b', evidence)),
        'capture': set(re.findall(r'C-[A-Z]{3}-\d{3}', captures)),
        'D': set(re.findall(r'\bD-\d{3}\b', read('_progress.md'))),
        'F': set(re.findall(r'^(F-\d{3}),', read('01-codebase-audit/feature-inventory.csv'), re.M)),
        'FM': set(re.findall(r'^(FM-\d{3}),', read('05-feature-matrix/feature-matrix.csv'), re.M)),
        'G': set(re.findall(r'^(G-\d{3}),', read('06-gap-analysis/upgrade-map.csv'), re.M)),
        'QA': set(re.findall(r'\bQA-\d{3}\b', read('01-codebase-audit/quality-audit.md') + read('09-masterplan/04-current-state.md'))),
        'M': set(re.findall(r'\bM-\d{3}\b', read('01-codebase-audit/module-map.md'))),
        'B': set(re.findall(r'\bB-\d{3}a?\b', read('09-masterplan/06-backlog.md'))),
        'I': set(re.findall(r'^(I-\d{2}),', read('07-ideation/ideas.csv'), re.M)),
        'ADR': set(re.findall(r'\bADR-[A-Z0-9]+\b', read('09-masterplan/12-decision-log.md'))),
        'E': set(re.findall(r'### (E-\d{3})', read('_handoff/IMPLEMENTATION-LOG.md'))),
        'Q': set(re.findall(r'\bQ-[OD]\d{2}\b', read('_open-questions.md'))),
        'RQ': set(re.findall(r'\bRQ-[A-Z]+-\d{2}\b', read('_handoff/acceptance-matrix.md'))),
    }
    return tables


def classify(token):
    if re.match(r'^[SHPB]-[A-Z]{3}-\d{3}$', token) or token.startswith('V-REA-'):
        return 'evidence'
    if re.match(r'^C-[A-Z]{3}-\d{3}$', token):
        return 'capture'
    for prefix in ('FM', 'QA'):
        if token.startswith(prefix + '-'):
            return prefix
    if re.match(r'^B-\d{3}a?$', token):
        return 'B'
    if re.match(r'^I-\d{2}$', token):
        return 'I'
    m = re.match(r'^([DFGME])-\d{3}$', token)  # 2-digit D-01… are local finding ids (data-model.md); M-013a is an example suffix
    return m.group(1) if m else None


def check(summary=False):
    tables = known_ids()
    problems = []
    files = sorted({p for pat in LIVING for p in glob.glob(os.path.join(RESEARCH, pat))})
    files += [os.path.join(ROOT, d) for d in ROOT_DOCS if os.path.exists(os.path.join(ROOT, d))]
    n_ids = n_links = n_paths = 0
    for path in files:
        text = open(path, encoding='utf-8').read()
        rel = os.path.relpath(path, ROOT)
        for token in sorted(path_candidates(without_retired_path_cells(text))):
            n_paths += 1
            if not path_exists(token, os.path.dirname(path)):
                problems.append((rel, f'missing path {token}'))
        for token in set(expand(text)):
            family = classify(token)
            if not family:
                continue
            if family == 'I' and not re.match(r'^I-\d{2}$', token):
                continue
            n_ids += 1
            if token not in tables[family]:
                problems.append((rel, f'unresolved {family} id {token}'))
        for token in set(re.findall(r'\bADR-[A-Z0-9]+\b', text)):
            n_ids += 1
            if token not in tables['ADR'] and token != 'ADR-STYLE-001':
                problems.append((rel, f'unresolved ADR {token}'))
        for token in set(re.findall(r'\bQ-[OD]\d{2}\b', text)):
            n_ids += 1
            if token not in tables['Q']:
                problems.append((rel, f'unresolved question {token}'))
        for token in set(re.findall(r'\bRQ-[A-Z]+-\d{2}\b', text)):
            n_ids += 1
            if token not in tables['RQ']:
                problems.append((rel, f'unresolved requirement {token}'))
        for target in re.findall(r'\]\(([^)\s]+)\)', text):
            if re.match(r'^(https?:|mailto:|#)', target):
                continue
            n_links += 1
            local = target.split('#', 1)[0]
            if local and not os.path.exists(os.path.normpath(os.path.join(os.path.dirname(path), local))):
                problems.append((rel, f'broken link {target}'))
    print(f'check-references: {len(files)} files, {n_ids} id references, {n_links} relative links, {n_paths} quoted paths, {len(problems)} unresolved')
    if not summary:
        for rel, msg in sorted(problems):
            print(f'  {rel}: {msg}')
    return 1 if problems else 0


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--summary', action='store_true')
    sys.exit(check(ap.parse_args().summary))
