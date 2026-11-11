#!/usr/bin/env python3
"""check-dispositions.py: validate dispositions-s26.csv against its sources and the upgrade order (s26, B-020).

    python3 -B invitation-research/06-gap-analysis/check-dispositions.py      # exit 0 valid, 1 errors

Checks (stdlib only, read-only):
- the header and one row per id; the kind matches the id (G- gap, I- idea, B- backlog);
- the gap ids equal upgrade-map.csv's and the idea ids equal ../07-ideation/ideas.csv's (no omission, no extra);
- disposition and phase come from the closed vocabularies below;
- disposition and phase agree: done <-> a DONE state; adopt now / adopt later carry a phase; investigate further and
  reject carry none;
- every phase is reflected in ../09-masterplan/06-backlog.md "Upgrade order (s26)": a U-phase row names the id or one
  of its backlog items; a continuous id is on the Continuous row; investigate further on the Investigate row; reject
  on the Rejected row.
"""
import csv
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
RESEARCH = HERE.parent
CSV = HERE / 'dispositions-s26.csv'
UPGRADE_MAP = HERE / 'upgrade-map.csv'
IDEAS = RESEARCH / '07-ideation' / 'ideas.csv'
BACKLOG = RESEARCH / '09-masterplan' / '06-backlog.md'

HEADER = ['id', 'kind', 'title', 'priority', 'backlog', 'state_s26', 'disposition', 'phase', 'reason']
DISPOSITIONS = {'adopt now', 'adopt later', 'investigate further', 'reject'}
PHASES = {'done', 'continuous', '—'} | {f'U{n}' for n in range(1, 8)}
KIND_PREFIX = {'gap': 'G-', 'idea': 'I-', 'backlog': 'B-'}


def read_csv(path):
    with path.open(newline='', encoding='utf-8') as handle:
        reader = csv.DictReader(handle)
        return reader.fieldnames, list(reader)


def upgrade_rows(text):
    start = text.index('## Upgrade order (s26')
    end = text.index('### Chains for the new items', start)
    rows = {}
    for line in text[start:end].splitlines():
        phase = re.match(r'\| \*\*(U\d) ', line)
        if phase:
            rows[phase.group(1)] = line
            continue
        for name in ('Continuous', 'Investigate', 'Rejected'):
            if line.startswith(f'| {name}'):
                rows[name] = line
    return rows


def names(cell, ids):
    return any(re.search(rf'(?<![\w-]){re.escape(item)}(?![\w-])', cell) for item in ids)


def main():
    errors = []
    header, rows = read_csv(CSV)
    if header != HEADER:
        errors.append(f'header is {header}, expected {HEADER}')
        return report(errors, rows)

    seen = set()
    for row in rows:
        rid = row['id']
        if rid in seen:
            errors.append(f'{rid}: duplicate row')
        seen.add(rid)
        prefix = KIND_PREFIX.get(row['kind'])
        if prefix is None or not rid.startswith(prefix):
            errors.append(f'{rid}: kind {row["kind"]!r} does not match the id')
        if row['disposition'] not in DISPOSITIONS:
            errors.append(f'{rid}: unknown disposition {row["disposition"]!r}')
        if row['phase'] not in PHASES:
            errors.append(f'{rid}: unknown phase {row["phase"]!r}')

    _, gaps = read_csv(UPGRADE_MAP)
    _, ideas = read_csv(IDEAS)
    expected = {
        'gap': {row['gap_id'] for row in gaps if row['gap_id'].startswith('G-')},
        'idea': {row['idea_id'] for row in ideas},
    }
    for kind, ids in expected.items():
        have = {row['id'] for row in rows if row['kind'] == kind}
        for missing in sorted(ids - have):
            errors.append(f'{missing}: in the source but has no disposition')
        for extra in sorted(have - ids):
            errors.append(f'{extra}: has a disposition but is not in the source')

    for row in rows:
        rid, disposition, phase, state = row['id'], row['disposition'], row['phase'], row['state_s26']
        if (phase == 'done') != state.startswith('DONE'):
            errors.append(f'{rid}: phase {phase!r} disagrees with state {state!r}')
        if disposition in ('adopt now', 'adopt later') and phase == '—':
            errors.append(f'{rid}: {disposition} without a phase')
        if disposition in ('investigate further', 'reject') and phase != '—':
            errors.append(f'{rid}: {disposition} must not carry phase {phase!r}')

    phase_rows = upgrade_rows(BACKLOG.read_text(encoding='utf-8'))
    for needed in [f'U{n}' for n in range(1, 8)] + ['Continuous', 'Investigate', 'Rejected']:
        if needed not in phase_rows:
            errors.append(f'06-backlog.md: upgrade order has no {needed} row')
    for row in rows:
        rid, disposition, phase = row['id'], row['disposition'], row['phase']
        backlog_ids = re.findall(r'B-\d{3}', row['backlog'])
        if phase.startswith('U'):
            target, ids = phase, [rid, *backlog_ids]
        elif phase == 'continuous':
            target, ids = 'Continuous', [rid]
        elif disposition == 'investigate further':
            target, ids = 'Investigate', [rid]
        elif disposition == 'reject':
            target, ids = 'Rejected', [rid]
        else:
            continue
        if target in phase_rows and not names(phase_rows[target], ids):
            errors.append(f'{rid}: phase {phase!r} / {disposition!r}, but the 06 {target} row names none of {ids}')

    return report(errors, rows)


def report(errors, rows):
    for error in errors:
        print(f'ERROR {error}')
    counts = {}
    for row in rows:
        counts[row['kind']] = counts.get(row['kind'], 0) + 1
    summary = ', '.join(f'{kind} {count}' for kind, count in sorted(counts.items()))
    print(f'check-dispositions: {len(rows)} rows ({summary}), {len(errors)} errors')
    return 1 if errors else 0


if __name__ == '__main__':
    sys.exit(main())
