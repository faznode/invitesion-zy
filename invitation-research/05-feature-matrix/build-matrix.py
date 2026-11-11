#!/usr/bin/env python3
"""Feature matrix builder (brief 03 §15, brief 05 §15): evidence-linked cells -> feature-matrix.csv.

    python3 -B invitation-research/05-feature-matrix/build-matrix.py           # validate, then write the outputs
    python3 -B invitation-research/05-feature-matrix/build-matrix.py --check   # validate + compare with the files on disk; exit 1 on any error or stale file

Inputs
  features.csv                  stable row definitions FM-001... with Full/Partial/None criteria
  assessments/<column>.csv      curated cells: feature_id,status,basis,evidence,note (one file per column)
  ../raw/<competitor>/C-*.json  capture summaries; measured cells use eligible captures only (../_tools/capture/eligibility.py)
Outputs
  feature-matrix.csv            wide: Invitesion today + one column per Tier-A competitor, plus compact evidence
  feature-matrix-long.csv       every cell that is not Unknown, with basis, evidence, note and source (curated / derived)
  coverage-summary.md           counts per column and family, derived-vs-curated disagreements

Rules
  * Status is Full, Partial, None or Unknown. A missing cell is Unknown, and Unknown is never turned into None.
  * Every Full / Partial / None cell cites at least one evidence ID that resolves: S-/C-/D-/H-/P-/B- IDs from
    ../_evidence-index.md or ../04-template-benchmarks/captures-summary.csv, LONGLIST:<CODE> rows of the longlist; our own
    column may also cite F-/M-/QA- IDs from ../01-codebase-audit/, E- entries of ../_handoff/IMPLEMENTATION-LOG.md, or
    REPO@<BASELINE or CURRENT>. Since s26 the curated own column describes CURRENT; baseline/ keeps the pre-switch files.
  * Derived cells: Lighthouse rows from cold-load-eligible captures (median per theme first), page rows from
    structure-eligible captures. Keyword features only ever derive "Full" (seen in at least one eligible theme): the detector
    reads Indonesian/English text, so no detection says nothing (Korean pages are read by hand).
  * A curated cell wins over a derived one. Disagreements are listed in coverage-summary.md for a human to review.
"""
import argparse
import csv
import os
import re
import statistics
import sys
from collections import Counter, defaultdict
from urllib.parse import urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
RESEARCH = os.path.normpath(os.path.join(HERE, '..'))
sys.path.insert(0, os.path.join(RESEARCH, '_tools', 'capture'))
import eligibility  # noqa: E402

BASELINE = '2c94140'
# s26: the curated own column describes this checkpoint; the pre-switch column is frozen in baseline/ and derived own
# cells stay on the v1.2 population of the pre-P0 build (their notes say so).
CURRENT = '2a6015f'
OWN_MEASURED_POPULATION = 'pre-P0 own build 22ed99e (v1.2 population), not the current build'
STATUSES = ('Full', 'Partial', 'None', 'Unknown')
BASES = ('CODE', 'MEASURED', 'OBSERVED', 'CLAIMED', 'INFERRED')
COLUMNS = ['invitesion', 'IDI', 'PLO', 'SMO', 'WEV', 'VID', 'ENV', 'IVT', 'INV', 'KAT', 'STM', 'BRN', 'PPO', 'RSV', 'JOY', 'PTF']
LABELS = {'invitesion': f'Invitesion ({CURRENT})', 'IDI': 'Indoinvite', 'PLO': 'PALEO', 'SMO': 'Satu Momen', 'WEV': 'Wevitation',
          'VID': 'Viding', 'ENV': 'Enviory', 'IVT': 'Invitato', 'INV': 'INVI.ID', 'KAT': 'Katsudoto', 'STM': 'Sitemu',
          'BRN': 'Barunson', 'PPO': 'Paperless Post', 'RSV': 'RSVPify', 'JOY': 'Joy', 'PTF': 'Partiful'}
RAW_DIRS = {'invitesion': 'invitesion', 'IDI': 'indoinvite', 'WEV': 'wevitation', 'VID': 'viding', 'ENV': 'enviory',
            'IVT': 'invitato', 'INV': 'invi', 'KAT': 'katsudoto', 'BRN': 'barunson'}
OWN_ENTITY_HINTS = {'invitesion': ('invitesion',), 'WEV': ('wevitation',), 'VID': ('viding',), 'ENV': ('enviory',),
                    'IVT': ('invitato',), 'INV': ('invi.id', 'invi'), 'KAT': ('katsudoto',), 'BRN': ('barunson',)}

KEYWORD_ROWS = {'coverGate': 'FM-003', 'toGuest': 'FM-002', 'countdown': 'FM-008', 'rsvp': 'FM-022', 'wishes': 'FM-030',
                'gift': 'FM-032', 'copyButton': 'FM-033', 'maps': 'FM-019', 'calendar': 'FM-021', 'livestream': 'FM-039',
                'loveStory': 'FM-013', 'gallery': 'FM-014', 'dressCode': 'FM-041', 'quranVerse': 'FM-010',
                'instagramFilter': 'FM-044', 'musicControl': 'FM-005'}
MOTION_LIBS = ('aos', 'scrollTrigger', 'wow', 'animateCss')
EVIDENCE_TOKEN = re.compile(r'^(?:[SCDHPB]-[A-Z]{2,4}(?:-\d{3})?|V-REA-\d{3}|F-\d{3}|M-\d{3}[a-z]?|QA-\d{3}|E-\d{3}|LONGLIST:[A-Z]{3}|REPO@[0-9a-f]{7,40})$')


def read_csv(path):
    with open(path, newline='', encoding='utf-8') as handle:
        return list(csv.DictReader(handle))


def expand_ranges(text):
    """IDs written as ranges in the index: `S-IVT-001…005`, `C-INV-111...116`, `S-PLO-001/002/003`."""
    ids = set()
    for prefix, first, last in re.findall(r'\b([SCDHPB]-[A-Z]{2,4})-(\d{3})(?:…|\.\.\.|–)(\d{3})\b', text):
        ids.update(f'{prefix}-{n:03d}' for n in range(int(first), int(last) + 1))
    for prefix, first, rest in re.findall(r'\b([SCDHPB]-[A-Z]{2,4})-(\d{3})((?:/\d{3})+)', text):
        ids.update(f'{prefix}-{n}' for n in [first] + rest.strip('/').split('/'))
    return ids


def known_ids():
    ids = set()
    with open(os.path.join(RESEARCH, '_evidence-index.md'), encoding='utf-8') as handle:
        text = handle.read()
    ids.update(re.findall(r'\b(?:[SCDHPB]-[A-Z]{2,4}(?:-\d{3})?|V-REA-\d{3})\b', text))
    ids.update(expand_ranges(text))
    ids.update(row['id'] for row in read_csv(os.path.join(RESEARCH, '04-template-benchmarks', 'captures-summary.csv')))
    audit = os.path.join(RESEARCH, '01-codebase-audit')
    ids.update(row['id'] for row in read_csv(os.path.join(audit, 'feature-inventory.csv')))
    for name, pattern in (('module-map.md', r'\bM-\d{3}[a-z]?\b'), ('quality-audit.md', r'\bQA-\d{3}\b')):
        with open(os.path.join(audit, name), encoding='utf-8') as handle:
            ids.update(re.findall(pattern, handle.read()))
    with open(os.path.join(RESEARCH, '_handoff', 'IMPLEMENTATION-LOG.md'), encoding='utf-8') as handle:
        ids.update(re.findall(r'^#{2,4} *(E-\d{3})\b', handle.read(), re.M))
    with open(os.path.join(RESEARCH, '02-competitor-discovery', 'competitor-longlist.csv'), encoding='utf-8') as handle:
        longlist = handle.read()
    return ids, longlist


def resolve(token, column, ids, longlist):
    if not EVIDENCE_TOKEN.match(token):
        return f'malformed evidence token {token!r}'
    if token.startswith('LONGLIST:'):
        return None if re.search(rf'(^|,){token[9:]}(,|$)', longlist, re.M) else f'{token}: code not in the longlist'
    if token.startswith('REPO@'):
        known = column == 'invitesion' and any(commit.startswith(token[5:12]) for commit in (BASELINE, CURRENT))
        return None if known else f'{token}: only for our column at {BASELINE} or {CURRENT}'
    if re.match(r'^(F|M|QA|E)-', token) and column != 'invitesion':
        return f'{token}: codebase IDs describe our product, not {column}'
    return None if token in ids else f'{token}: not in the evidence index, captures summary or audit files'


def load_curated(features, ids, longlist, errors):
    cells = {}
    for column in COLUMNS:
        path = os.path.join(HERE, 'assessments', f'{column}.csv')
        if not os.path.exists(path):
            errors.append(f'assessments/{column}.csv missing (an empty file with the header is fine)')
            continue
        seen = set()
        for line, row in enumerate(read_csv(path), start=2):
            where = f'assessments/{column}.csv:{line}'
            fid, status, basis = row.get('feature_id', ''), row.get('status', ''), row.get('basis', '')
            if fid not in features:
                errors.append(f'{where}: unknown feature_id {fid!r}')
                continue
            if fid in seen:
                errors.append(f'{where}: duplicate cell for {fid}')
            seen.add(fid)
            if status not in STATUSES:
                errors.append(f'{where}: status {status!r} not in {STATUSES}')
            if basis not in BASES:
                errors.append(f'{where}: basis {basis!r} not in {BASES}')
            if basis == 'CODE' and column != 'invitesion':
                errors.append(f'{where}: basis CODE is only for our own column')
            evidence = [t for t in (row.get('evidence') or '').split(';') if t]
            if status != 'Unknown' and not evidence:
                errors.append(f'{where}: {status} needs evidence')
            for token in evidence:
                problem = resolve(token, column, ids, longlist)
                if problem:
                    errors.append(f'{where}: {problem}')
            cells[(fid, column)] = {'status': status, 'basis': basis, 'evidence': evidence,
                                    'note': row.get('note', ''), 'source': 'curated'}
    return cells


def band(value, full_max, partial_max, higher_is_better=False):
    if value is None:
        return None
    if higher_is_better:
        return 'Full' if value >= full_max else 'Partial' if value >= partial_max else 'None'
    return 'Full' if value <= full_max else 'Partial' if value <= partial_max else 'None'


def own_entity(column, entity):
    name = (entity or '').lower()
    return any(hint in name for hint in OWN_ENTITY_HINTS.get(column, ()))


def zoom_blocked(viewport):
    text = (viewport or '').replace(' ', '').lower()
    return 'user-scalable=no' in text or 'user-scalable=0' in text or re.search(r'maximum-scale=1(\.0*)?(,|$)', text) is not None


def derive(columns_with_raw, sensitivity=False):
    """Measured cells from eligible captures: the unconditional population by default, or the sensitivity population that
    also admits provisional evidence (eligibility.py rule 7). Only the unconditional cells enter the matrix files."""
    register = eligibility.load_register()
    suffix = '_sensitivity' if sensitivity else ''
    derived, stats = {}, {}
    for column in columns_with_raw:
        # The matrix is defined on the v1.2 population (412 × 915, pre-P0 own build): v2 profiles and later own builds
        # are separate populations (D-032) and never enter a matrix median.
        captures = [c for c in eligibility.load_captures(os.path.join(RESEARCH, 'raw', RAW_DIRS[column], 'C-*.json'))
                    if eligibility.v12_population(c['id'], c.get('competitor'), eligibility.capture_profile(c))]
        if not captures:
            continue
        results = eligibility.evaluate_all(captures, register)
        cold = [(results[c['id']]['theme_key'], c) for c in captures if results[c['id']]['coldload_eligible' + suffix]]
        page = [(results[c['id']]['theme_key'], c) for c in captures if results[c['id']]['structure_eligible' + suffix]]
        stats[column] = {'cold': len(cold), 'cold_themes': len({k for k, _ in cold}),
                         'page': len(page), 'page_themes': len({k for k, _ in page})}

        def put(fid, status, ids, note):
            if status:
                if column == 'invitesion':
                    note = f'{note} · {OWN_MEASURED_POPULATION}'
                derived[(fid, column)] = {'status': status, 'basis': 'MEASURED', 'evidence': sorted(ids)[:6],
                                          'note': note, 'source': 'derived'}

        def lh(capture):
            return capture.get('lighthouse') or {}

        cold_ids = [c['id'] for _, c in cold]
        metrics = (('FM-156', lambda c: (lh(c).get('scores') or {}).get('performance'), (90, 50, True), 'score'),
                   ('FM-163', lambda c: (lh(c).get('scores') or {}).get('accessibility'), (90, 50, True), 'score'),
                   ('FM-157', lambda c: (lh(c).get('metrics') or {}).get('lcpMs'), (2500, 4000, False), 'ms'),
                   ('FM-158', lambda c: (lh(c).get('metrics') or {}).get('tbtMs'), (200, 600, False), 'ms'),
                   ('FM-159', lambda c: (lh(c).get('metrics') or {}).get('cls'), (0.1, 0.25, False), ''),
                   ('FM-160', lambda c: (lh(c).get('totalBytes') or 0) / 1024 if lh(c).get('totalBytes') else None,
                    (2667, 4000, False), 'KiB'),
                   ('FM-179', lambda c: sum(1 for e in (lh(c).get('thirdParties') or []) if not own_entity(column, e.get('entity'))),
                    (0, 3, False), 'entities'))
        for fid, getter, (full, partial, higher), unit in metrics:
            median, themes, n = eligibility.theme_median(cold, getter)
            if median is None:
                continue
            shown = f'{median:,.0f}' if unit in ('ms', 'KiB', 'score', 'entities') else f'{median:.3f}'
            put(fid, band(median, full, partial, higher), cold_ids,
                f'median {shown} {unit}'.strip() + f' over {themes} theme(s) / {n} cold-load-eligible capture(s)')

        if not page:
            continue
        page_ids = [c['id'] for _, c in page]
        themes = defaultdict(list)
        for key, capture in page:
            themes[key].append(capture)
        n_themes = len(themes)

        def after(capture):
            return (capture.get('structure') or {}).get('afterOpen') or {}

        def before(capture):
            return (capture.get('structure') or {}).get('beforeOpen') or {}

        for flag, fid in KEYWORD_ROWS.items():
            hit_themes = [k for k, caps in themes.items()
                          if any((after(c).get('features') or {}).get(flag) or (before(c).get('features') or {}).get(flag)
                                 for c in caps)]
            if hit_themes:
                hits = [c['id'] for k in hit_themes for c in themes[k]]
                put(fid, 'Full', hits, f'keyword detector: {len(hit_themes)}/{n_themes} structure-eligible theme(s)')
        tz_hits = [k for k, caps in themes.items() if any((after(c).get('features') or {}).get('timezoneLabel') for c in caps)]
        if tz_hits:
            put('FM-018', 'Full', [c['id'] for k in tz_hits for c in themes[k]],
                f'zone label present on {len(tz_hits)}/{n_themes} theme(s); correctness for WITA/WIT not verifiable')
        audio = [k for k, caps in themes.items() if any((after(c).get('media') or {}).get('audio') for c in caps)]
        if audio:
            put('FM-004', 'Full', [c['id'] for k in audio for c in themes[k]],
                f'audio element on {len(audio)}/{n_themes} theme(s); playback is never measured')
        video = [k for k, caps in themes.items() if any(((after(c).get('media') or {}).get('video') or 0) > 0 for c in caps)]
        if video:
            put('FM-016', 'Full', [c['id'] for k in video for c in themes[k]], f'video element on {len(video)}/{n_themes} theme(s)')
        motion = [k for k, caps in themes.items() if any(any((after(c).get('libs') or {}).get(lib) for lib in MOTION_LIBS) for c in caps)]
        if motion:
            put('FM-052', 'Full', [c['id'] for k in motion for c in themes[k]],
                f'scroll-animation library on {len(motion)}/{n_themes} theme(s)')
        three = [k for k, caps in themes.items() if any((after(c).get('libs') or {}).get('three') for c in caps)]
        if three:
            put('FM-054', 'Partial', [c['id'] for k in three for c in themes[k]], 'three.js present; fallback not verified')
        og_image = [k for k, caps in themes.items() if any((after(c).get('og') or {}).get('image') for c in caps)]
        og_title = [k for k, caps in themes.items() if any((after(c).get('og') or {}).get('title') for c in caps)]
        put('FM-047', 'Full' if og_image else 'Partial' if og_title else 'None', page_ids,
            f'og:image on {len(og_image)}/{n_themes} theme(s), og:title on {len(og_title)}/{n_themes}')
        reduced = [k for k, caps in themes.items() if any(after(c).get('reducedMotionCss') for c in caps)]
        put('FM-055', 'Full' if reduced else 'None', page_ids,
            f'prefers-reduced-motion CSS on {len(reduced)}/{n_themes} theme(s) (CSS rules only; JS checks not detected)')
        blocked = [k for k, caps in themes.items() if any(zoom_blocked(after(c).get('viewport')) for c in caps)]
        put('FM-164', 'Full' if not blocked else 'None' if len(blocked) == n_themes else 'Partial', page_ids,
            f'zoom blocked on {len(blocked)}/{n_themes} theme(s)')
        with_images = [(k, c) for k, caps in themes.items() for c in caps if ((after(c).get('media') or {}).get('images') or 0) > 0]
        if with_images:
            lazy_themes = {k for k, c in with_images if ((after(c).get('media') or {}).get('lazyImages') or 0) > 0}
            all_themes = {k for k, _ in with_images}
            put('FM-162', 'Full' if lazy_themes == all_themes else 'Partial' if lazy_themes else 'None',
                [c['id'] for _, c in with_images], f'lazy images on {len(lazy_themes)}/{len(all_themes)} theme(s) with images')
    return derived, stats


def merge(features, curated, derived):
    merged, disagreements = {}, []
    for fid in features:
        for column in COLUMNS:
            cur, der = curated.get((fid, column)), derived.get((fid, column))
            if cur and der:
                if cur['status'] != der['status'] and cur['status'] != 'Unknown':
                    disagreements.append((fid, column, cur['status'], der['status'], der['note']))
                cell = dict(cur)
                if cur['status'] == 'Unknown':
                    cell = dict(der)
                    cell['note'] = f"{der['note']}; curated note: {cur['note']}".strip('; ')
                cell['evidence'] = list(dict.fromkeys(cell['evidence'] + [e for e in der['evidence'] if e not in cell['evidence']]))
                merged[(fid, column)] = cell
            elif cur or der:
                merged[(fid, column)] = dict(cur or der)
    return merged, disagreements


def render_outputs(features, order, merged, disagreements, stats, sensitivity_changes):
    """Return {file name: text} for the three outputs, so --check can compare them with the files on disk."""
    import io
    wide = io.StringIO()
    writer = csv.writer(wide, lineterminator='\n')
    writer.writerow(['feature_id', 'family', 'area', 'feature', 'ours_ref'] + COLUMNS + ['evidence'])
    for fid in order:
        row = features[fid]
        statuses = [merged.get((fid, c), {}).get('status', 'Unknown') for c in COLUMNS]
        evidence = '; '.join(f"{c}={'+'.join(merged[(fid, c)]['evidence'][:3])}" for c in COLUMNS
                             if (fid, c) in merged and merged[(fid, c)]['status'] != 'Unknown' and merged[(fid, c)]['evidence'])
        writer.writerow([fid, row['family'], row['area'], row['feature'], row['ours_ref']] + statuses + [evidence])
    long_ = io.StringIO()
    writer = csv.writer(long_, lineterminator='\n')
    writer.writerow(['feature_id', 'column', 'status', 'basis', 'source', 'evidence', 'note'])
    for fid in order:
        for column in COLUMNS:
            cell = merged.get((fid, column))
            if cell and cell['status'] != 'Unknown':
                writer.writerow([fid, column, cell['status'], cell['basis'], cell['source'], ';'.join(cell['evidence']), cell['note']])

    families = sorted({features[f]['family'] for f in order}, key=['guest', 'host', 'business', 'platform'].index)
    lines = ['<!-- generated by build-matrix.py; do not edit by hand -->',
             '# coverage-summary.md: feature matrix counts per column', '',
             f'{len(order)} rows ({", ".join(f"{fam} {sum(1 for f in order if features[f][chr(102)+"amily"] == fam)}" for fam in families)}); '
             f'{len(COLUMNS)} columns (Invitesion today + 15 Tier-A competitors). Statuses: Full / Partial / None / Unknown; '
             'Unknown is never counted as None.', '',
             '| Column | Full | Partial | None | Unknown | Known cells | Measured (derived) cells | Eligible captures (cold-load / page) |',
             '|---|---|---|---|---|---|---|---|']
    for column in COLUMNS:
        counts = Counter(merged.get((f, column), {}).get('status', 'Unknown') for f in order)
        derived_n = sum(1 for f in order if merged.get((f, column), {}).get('source') == 'derived')
        st = stats.get(column)
        caps = f"{st['cold']} ({st['cold_themes']} themes) / {st['page']} ({st['page_themes']} themes)" if st else '0 / 0'
        known = len(order) - counts['Unknown']
        lines.append(f"| {LABELS[column]} (`{column}`) | {counts['Full']} | {counts['Partial']} | {counts['None']} | "
                     f"{counts['Unknown']} | {known} | {derived_n} | {caps} |")
    lines += ['', '## Known cells per family', '', '| Column | ' + ' | '.join(families) + ' |', '|---|' + '---|' * len(families)]
    for column in COLUMNS:
        cells = []
        for fam in families:
            rows = [f for f in order if features[f]['family'] == fam]
            known = sum(1 for f in rows if merged.get((f, column), {}).get('status', 'Unknown') != 'Unknown')
            cells.append(f'{known}/{len(rows)}')
        lines.append(f'| {LABELS[column]} | ' + ' | '.join(cells) + ' |')
    lines += ['', '## Curated vs derived disagreements (curated cell kept; review these)', '']
    if disagreements:
        lines += ['| Row | Column | Curated | Derived | Derived basis |', '|---|---|---|---|---|']
        lines += [f'| {f} | {c} | {a} | {b} | {n} |' for f, c, a, b, n in disagreements]
    else:
        lines.append('None.')
    lines += ['', '## Sensitivity: cells that change when provisional evidence is admitted (D-031, not in the matrix files)', '',
              'The matrix files above use the unconditional population. These rows show what the measured cells would be '
              'with the provisional captures of `../04-template-benchmarks/benchmark-provisional.csv` admitted. They are a '
              'sensitivity result only and must not be quoted as matrix cells.', '']
    if sensitivity_changes:
        lines += ['| Row | Column | Unconditional | With provisional evidence | Basis with provisional evidence |', '|---|---|---|---|---|']
        lines += [f'| {f} | {c} | {a} | {b} | {n} |' for f, c, a, b, n in sensitivity_changes]
    else:
        lines.append('None.')
    lines.append('')
    return {'feature-matrix.csv': wide.getvalue(), 'feature-matrix-long.csv': long_.getvalue(),
            'coverage-summary.md': '\n'.join(lines)}


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--check', action='store_true', help='validate only; exit 1 on errors')
    args = parser.parse_args()
    errors = []
    rows = read_csv(os.path.join(HERE, 'features.csv'))
    order = [r['feature_id'] for r in rows]
    features = {r['feature_id']: r for r in rows}
    if len(features) != len(order):
        errors.append('duplicate feature_id in features.csv')
    for fid in order:
        if not re.match(r'^FM-\d{3}$', fid):
            errors.append(f'malformed feature_id {fid!r}')
        if features[fid]['family'] not in ('guest', 'host', 'business', 'platform'):
            errors.append(f'{fid}: unknown family {features[fid]["family"]!r}')
    if len(order) < 150:
        errors.append(f'only {len(order)} rows; brief 03 §15 requires at least 150')
    ids, longlist = known_ids()
    curated = load_curated(features, ids, longlist, errors)
    missing_ours = [f for f in order if (f, 'invitesion') not in curated and f not in
                    ('FM-156', 'FM-157', 'FM-158', 'FM-159', 'FM-160', 'FM-162', 'FM-163', 'FM-164', 'FM-179')]
    if missing_ours:
        errors.append(f'our own column has no curated cell for {len(missing_ours)} row(s): {", ".join(missing_ours[:12])}')
    raw_columns = [c for c in COLUMNS if c in RAW_DIRS]
    derived, stats = derive(raw_columns)
    merged, disagreements = merge(features, curated, derived)
    merged_s, _ = merge(features, curated, derive(raw_columns, sensitivity=True)[0])
    sensitivity_changes = []
    for fid in order:
        for column in COLUMNS:
            a, b = merged.get((fid, column), {}), merged_s.get((fid, column), {})
            if (a.get('status', 'Unknown'), a.get('note', '')) != (b.get('status', 'Unknown'), b.get('note', '')):
                sensitivity_changes.append((fid, column, a.get('status', 'Unknown'), b.get('status', 'Unknown'), b.get('note', '')))
    unknown_ours = [f for f in order if merged.get((f, 'invitesion'), {}).get('status', 'Unknown') == 'Unknown']
    if unknown_ours:
        errors.append(f'our own column is Unknown for {", ".join(unknown_ours)}: we can read our code')
    for message in errors:
        print(f'ERROR {message}')
    known = sum(1 for (f, c), cell in merged.items() if cell['status'] != 'Unknown' and c != 'invitesion')
    print(f'feature matrix: {len(order)} rows x {len(COLUMNS)} columns; competitor cells known {known}/{len(order) * (len(COLUMNS) - 1)}; '
          f'derived cells {sum(1 for c in merged.values() if c["source"] == "derived")}; disagreements {len(disagreements)}; '
          f'sensitivity changes {len(sensitivity_changes)}; errors {len(errors)}')
    if errors:
        return 1
    outputs = render_outputs(features, order, merged, disagreements, stats, sensitivity_changes)
    if args.check:
        stale = [name for name, text in outputs.items()
                 if not os.path.exists(os.path.join(HERE, name)) or open(os.path.join(HERE, name), encoding='utf-8').read() != text]
        if stale:
            print(f'STALE {", ".join(stale)}: re-run build-matrix.py')
            return 1
        return 0
    for name, text in outputs.items():
        with open(os.path.join(HERE, name), 'w', newline='', encoding='utf-8') as handle:
            handle.write(text)
    print('wrote feature-matrix.csv, feature-matrix-long.csv, coverage-summary.md')
    return 0


if __name__ == '__main__':
    sys.exit(main())
