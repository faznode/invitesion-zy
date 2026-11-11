#!/usr/bin/env python3
"""Benchmark pack: tier classification, per-tier aggregates and structure blueprints from eligible captures only.

    python3 -B invitation-research/_tools/capture/benchmark-pack.py            # write the three CSVs
    python3 -B invitation-research/_tools/capture/benchmark-pack.py --check    # exit 1 if the files on disk are stale
    python3 -B invitation-research/_tools/capture/benchmark-pack.py --markdown # print the aggregate tables

    python3 -B invitation-research/_tools/capture/benchmark-pack.py --compare  # aggregates that change with provisional evidence
    python3 -B invitation-research/_tools/capture/benchmark-pack.py --viewport-markdown  # protocol v2 tables for benchmark-pack.md §7

Input: 04-template-benchmarks/captures-summary.csv (summarize-captures.py) for the numbers; eligibility is recomputed
with eligibility.py from raw/ and the exclusion register, and the run fails if the summary disagrees (stale summary).
Outputs in 04-template-benchmarks/: tiers.csv (one row per eligible theme), tier-aggregates.csv, blueprints.csv, built
from the UNCONDITIONAL population (provisional evidence excluded, eligibility.py rule 7, D-031). The same three files
built from the SENSITIVITY population (provisional evidence included) go to sensitivity/*-incl-provisional.csv. The two
sets are separate files and are never merged; only the unconditional set supports unconditional claims.

Rules (benchmark-pack.md §2, D-027):
- Cold-load aggregates use Lighthouse columns of cold-load-eligible captures; post-visit aggregates use CDP columns of
  structure-eligible captures. The two sources are never mixed. TBT is reported as TBT, never as INP.
- Theme first: each theme contributes the median of its own eligible captures, so retries never add weight.
- Tier = the template tier our harness would assign from OBSERVED signals (08-template-system-and-harness.md §2–§3):
  signature = scroll-linked or 3D motion (scrollTrigger, three); premium = audio (an <audio> element or a detected
  music control) or a level-2 motion library; basic = none of those signals detected. Absence of a detected signal is
  not proof of absence, so a basic classification carries low confidence. It is not the vendor's price tier.
- Our own captures (population=own) are reported next to the competitor aggregates, never inside them.
- p75 = the value 75 % of themes meet or beat (75th percentile for lower-is-better metrics, 25th for higher-is-better);
  linear interpolation between order statistics. Best-in-class = the best theme value in the metric's direction (best_theme_capture = that theme's first eligible capture).
- Confidence per aggregate: high = >= 10 themes from >= 3 vendors; medium = >= 5 themes from >= 2 vendors; else low.
No parity threshold is derived here; harness budgets stay internal (benchmark-pack.md §5).
"""
import argparse
import csv
import io
import os
import statistics
import sys

import eligibility

RESEARCH = eligibility.RESEARCH
BENCH = os.path.join(RESEARCH, '04-template-benchmarks')
SUMMARY = os.path.join(BENCH, 'captures-summary.csv')
SENSITIVITY_DIR = 'sensitivity'
OUTPUT_NAMES = ('tiers.csv', 'tier-aggregates.csv', 'blueprints.csv')


def output_path(name, sensitivity=False):
    """Relative output path inside 04-template-benchmarks/ for one of OUTPUT_NAMES."""
    return os.path.join(SENSITIVITY_DIR, name.replace('.csv', '-incl-provisional.csv')) if sensitivity else name


def eligibility_keys(sensitivity=False):
    suffix = '_sensitivity' if sensitivity else ''
    return 'coldload_eligible' + suffix, 'structure_eligible' + suffix


def own_label(build):
    return f'own pages, build {build} (not a market sample)'


def viewport_population(row):
    """'competitor', or 'own@<build>': each build of our own page is its own population (eligibility.py rule 8)."""
    if row['population'] != 'own':
        return row['population']
    return f"own@{eligibility.own_build(row['id'], row['competitor']) or eligibility.UNKNOWN_BUILD}"

SIGNATURE_LIBS = {'scrollTrigger', 'three'}
LEVEL2_LIBS = {'gsap', 'aos', 'animateCss', 'lottie', 'anime'}
NON_LATIN_DETECTOR_GAP = {'barunson': 'Korean page: the Indonesian/English feature detector does not apply (dossier §4 manual reading)'}

# (metric, column, direction, source); direction 'low' = lower is better.
METRICS = [
    ('perf', 'perf', 'high', 'lighthouse'), ('a11y', 'a11y', 'high', 'lighthouse'),
    ('best_practices', 'best_practices', 'high', 'lighthouse'), ('seo', 'seo', 'high', 'lighthouse'),
    ('fcp_ms', 'fcp_ms', 'low', 'lighthouse'), ('lcp_ms', 'lcp_ms', 'low', 'lighthouse'),
    ('tbt_ms', 'tbt_ms', 'low', 'lighthouse'), ('cls', 'cls', 'low', 'lighthouse'), ('si_ms', 'si_ms', 'low', 'lighthouse'),
    ('lh_requests', 'lh_requests', 'low', 'lighthouse'), ('lh_kib', 'lh_kib', 'low', 'lighthouse'),
    ('lh_kib_script', 'lh_kib_script', 'low', 'lighthouse'), ('lh_kib_image', 'lh_kib_image', 'low', 'lighthouse'),
    ('lh_kib_font', 'lh_kib_font', 'low', 'lighthouse'), ('lh_kib_third_party', 'lh_kib_third_party', 'low', 'lighthouse'),
    ('cdp_visit_kib', 'cdp_visit_kib', 'low', 'cdp_visit'), ('cdp_visit_requests', 'cdp_visit_requests', 'low', 'cdp_visit'),
    ('cdp_third_party_hosts', 'cdp_third_party_hosts', 'low', 'cdp_visit'), ('cdp_font_files', 'cdp_font_files', 'low', 'cdp_visit'),
]
TIERS = ('basic', 'premium', 'signature')


def number(text):
    try:
        value = float(text)
    except (TypeError, ValueError):
        return None
    return value


def truthy(text):
    return str(text).strip().lower() in ('true', 'y', 'yes', '1')


def classify(row):
    """Return (tier, signals, confidence) from observed libraries, audio elements and the music-control feature."""
    libs = set((row.get('libs') or '').split())
    features = set((row.get('features') or '').split())
    audio = (number(row.get('audio_elements')) or 0) > 0 or 'musicControl' in features
    signals = sorted(libs & (SIGNATURE_LIBS | LEVEL2_LIBS)) + (['audio'] if audio else [])
    if libs & SIGNATURE_LIBS:
        return 'signature', signals, 'medium'
    if audio or libs & LEVEL2_LIBS:
        return 'premium', signals, 'medium'
    return 'basic', signals, 'low'


def percentile(values, q):
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    pos = (len(ordered) - 1) * q
    lo, hi = int(pos), min(int(pos) + 1, len(ordered) - 1)
    return ordered[lo] + (ordered[hi] - ordered[lo]) * (pos - lo)


def confidence(n_themes, n_vendors):
    if n_themes >= 10 and n_vendors >= 3:
        return 'high'
    if n_themes >= 5 and n_vendors >= 2:
        return 'medium'
    return 'low'


def load_rows():
    with open(SUMMARY, encoding='utf-8') as handle:
        rows = list(csv.DictReader(handle))
    register = eligibility.load_register()
    captures = eligibility.load_captures()
    results = eligibility.evaluate_all(captures, register)
    stale = []
    for row in rows:
        ev = results.get(row['id'])
        if ev is None:
            stale.append(f"{row['id']}: in the summary but not in raw/")
            continue
        for key in eligibility_keys() + eligibility_keys(True) + ('provisional',):
            if key not in row:
                stale.append(f"{row['id']}: summary lacks column {key}")
            elif truthy(row[key]) != bool(ev[key]):
                stale.append(f"{row['id']}: {key} summary={row[key]} recomputed={ev[key]}")
        if row.get('measurement_population') != ev['measurement_population']:
            stale.append(f"{row['id']}: measurement_population summary={row.get('measurement_population')!r} "
                         f"recomputed={ev['measurement_population']!r}")
    if len(rows) != len(results):
        stale.append(f'summary has {len(rows)} rows, raw/ has {len(results)} captures')
    return rows, stale


def theme_values(rows, column, eligible_key):
    """{(competitor, theme_key): (median value, [capture ids])} over eligible captures with a number."""
    by_theme = {}
    for row in rows:
        if not truthy(row[eligible_key]):
            continue
        value = number(row.get(column))
        if value is None:
            continue
        by_theme.setdefault((row['competitor'], row['theme_key']), []).append((value, row['id']))
    return {key: (statistics.median(v for v, _ in items), [cid for _, cid in items]) for key, items in by_theme.items()}


def build(rows, sensitivity=False):
    """Tiers, aggregates and blueprints for one population: unconditional (default) or sensitivity (provisional included).
    Only the protocol v1.2 population enters these files (profile v1-412; own pages = the pre-P0 baseline build, see
    eligibility.v12_population); v2 profiles are reported by build_viewport()."""
    rows = [r for r in rows if eligibility.v12_population(r['id'], r['competitor'], r.get('profile'))]
    cold_key, struct_key = eligibility_keys(sensitivity)
    eligible = [r for r in rows if truthy(r[cold_key]) or truthy(r[struct_key])]
    themes = {}
    for row in sorted(eligible, key=lambda r: r['id']):
        key = (row['competitor'], row['theme_key'])
        entry = themes.setdefault(key, {'rows': [], 'population': row['population']})
        entry['rows'].append(row)
    tiers_out, tier_of = [], {}
    for (competitor, theme), entry in sorted(themes.items()):
        first = entry['rows'][0]
        tier, signals, conf = classify(first)
        tiers_seen = {classify(r)[0] for r in entry['rows']}
        if len(tiers_seen) > 1:
            conf = 'low'
        tier_of[(competitor, theme)] = tier
        tiers_out.append({
            'competitor': competitor, 'population': entry['population'], 'theme_key': theme, 'tier': tier,
            'signals': ' '.join(signals) or '-', 'tier_confidence': conf,
            'coldload_captures': ' '.join(r['id'] for r in entry['rows'] if truthy(r[cold_key])) or '-',
            'structure_captures': ' '.join(r['id'] for r in entry['rows'] if truthy(r[struct_key])) or '-',
            'detector_note': NON_LATIN_DETECTOR_GAP.get(competitor, ''),
        })
    aggregates = []
    for population in ('competitor', 'own'):
        for tier in TIERS + ('all',):
            for metric, column, direction, source in METRICS:
                eligible_key = cold_key if source == 'lighthouse' else struct_key
                values = {k: v for k, v in theme_values(rows, column, eligible_key).items()
                          if themes.get(k, {}).get('population') == population and (tier == 'all' or tier_of.get(k) == tier)}
                if not values:
                    continue
                nums = [v for v, _ in values.values()]
                best_key = (min if direction == 'low' else max)(values, key=lambda k: values[k][0])
                vendors = {k[0] for k in values}
                aggregates.append({
                    'population': population, 'tier': tier, 'metric': metric, 'direction': 'lower is better' if direction == 'low' else 'higher is better',
                    'source': source, 'n_themes': len(values), 'n_vendors': len(vendors), 'n_captures': sum(len(c) for _, c in values.values()),
                    'median': round(statistics.median(nums), 3), 'p75': round(percentile(nums, 0.75 if direction == 'low' else 0.25), 3),
                    'best': round(values[best_key][0], 3), 'best_theme_capture': values[best_key][1][0],
                    'confidence': confidence(len(values), len(vendors)) if population == 'competitor' else own_label(eligibility.OWN_BASELINE_BUILD),
                })
    blueprints = []
    for (competitor, theme), entry in sorted(themes.items()):
        structural = [r for r in entry['rows'] if truthy(r[struct_key])]
        if not structural:
            continue
        row = structural[0]
        blueprints.append({
            'competitor': competitor, 'population': entry['population'], 'theme_key': theme, 'capture': row['id'],
            'tier': tier_of[(competitor, theme)], 'libs': row['libs'] or '-',
            'features_detected': row['features'] or '-', 'sections_detected': row['sections'],
            'audio_elements': row['audio_elements'], 'og_image': row['og_image'], 'reduced_motion_css': row['reduced_motion_css'],
            'dom_nodes': row['dom_nodes'], 'cover_detected': row['cover_detected'], 'click_attempted': row['click_attempted'],
            'gate_opening': row['gate_opening'], 'audio_playback': row['audio_playback'],
            'caveats': '; '.join(filter(None, [NON_LATIN_DETECTOR_GAP.get(competitor, ''),
                                               'sectionCount unreliable for div layouts' if row['sections'] in ('0', '1', '2') else '',
                                               'feature list = keywords detected; absence is unknown, not missing'])),
        })
    return tiers_out, aggregates, blueprints


V2_PROFILES = ('v2-412', 'v2-360', 'v2-390', 'v2-412-rm')
V2_CONTROL = 'v2-412'
VIEWPORT_DIR = 'viewport'
# (metric, column, direction, source): Lighthouse metrics need cold-load eligibility, layout / motion probes structure
# eligibility. All come from the same capture, so a theme's four profiles are paired within one session.
VIEWPORT_METRICS = [
    ('perf', 'perf', 'high', 'lighthouse'), ('a11y', 'a11y', 'high', 'lighthouse'), ('lcp_ms', 'lcp_ms', 'low', 'lighthouse'),
    ('tbt_ms', 'tbt_ms', 'low', 'lighthouse'), ('cls', 'cls', 'low', 'lighthouse'), ('lh_kib', 'lh_kib', 'low', 'lighthouse'),
    ('layout_overflow_px', 'layout_overflow_px', 'low', 'layout'), ('layout_small_targets', 'layout_small_targets', 'low', 'layout'),
    ('layout_small_text', 'layout_small_text', 'low', 'layout'), ('motion_running_before', 'motion_running_before', 'low', 'motion'),
    ('motion_running_after', 'motion_running_after', 'low', 'motion'),
]
PROFILE_AGG_FIELDS = ['population', 'profile', 'metric', 'direction', 'source', 'n_themes', 'n_vendors', 'n_captures', 'median',
                      'p75', 'best', 'best_theme_capture', 'confidence']
PAIRED_FIELDS = ['population', 'competitor', 'theme_key', 'metric', 'direction'] + [f'value_{p}' for p in V2_PROFILES] + \
                [f'delta_{p}' for p in V2_PROFILES if p != V2_CONTROL] + ['captures']
PAIRED_SUMMARY_FIELDS = ['population', 'metric', 'direction', 'comparison', 'n_pairs', 'median_delta', 'n_worse', 'n_better', 'n_same']


def build_viewport(rows):
    """Protocol v2 outputs (unconditional population): per-profile aggregates and per-theme paired deltas against the
    same-session v2-412 control. Profiles are never pooled; a delta exists only when both profiles of a theme are eligible.
    Our own rows are labelled `own@<build>` and each build is aggregated on its own."""
    rows = [r for r in rows if r.get('profile') in V2_PROFILES]
    cold_key, struct_key = eligibility_keys()
    profile_aggregates, paired, summary = [], [], []
    for population in sorted({viewport_population(r) for r in rows}, key=lambda p: (p != 'competitor', p)):
        sel = [r for r in rows if viewport_population(r) == population]
        for metric, column, direction, source in VIEWPORT_METRICS:
            key = cold_key if source == 'lighthouse' else struct_key
            per_profile = {p: theme_values([r for r in sel if r['profile'] == p], column, key) for p in V2_PROFILES}
            for profile in V2_PROFILES:
                values = per_profile[profile]
                if not values:
                    continue
                nums = [v for v, _ in values.values()]
                best_key = (min if direction == 'low' else max)(values, key=lambda k: values[k][0])
                vendors = {k[0] for k in values}
                profile_aggregates.append({
                    'population': population, 'profile': profile, 'metric': metric,
                    'direction': 'lower is better' if direction == 'low' else 'higher is better', 'source': source,
                    'n_themes': len(values), 'n_vendors': len(vendors), 'n_captures': sum(len(c) for _, c in values.values()),
                    'median': round(statistics.median(nums), 3), 'p75': round(percentile(nums, 0.75 if direction == 'low' else 0.25), 3),
                    'best': round(values[best_key][0], 3), 'best_theme_capture': values[best_key][1][0],
                    'confidence': confidence(len(values), len(vendors)) if population == 'competitor' else own_label(population.split('@', 1)[1]),
                })
            control = per_profile[V2_CONTROL]
            deltas = {p: [] for p in V2_PROFILES if p != V2_CONTROL}
            for theme in sorted(control):
                record = {'population': population, 'competitor': theme[0], 'theme_key': theme[1], 'metric': metric,
                          'direction': 'lower is better' if direction == 'low' else 'higher is better'}
                captures = []
                for p in V2_PROFILES:
                    value = per_profile[p].get(theme)
                    record[f'value_{p}'] = round(value[0], 3) if value else ''
                    captures += value[1] if value else []
                    if p != V2_CONTROL:
                        delta = round(value[0] - control[theme][0], 3) if value else ''
                        record[f'delta_{p}'] = delta
                        if value:
                            deltas[p].append(delta)
                record['captures'] = ' '.join(captures)
                paired.append(record)
            for p, values in deltas.items():
                if not values:
                    continue
                worse = sum(1 for d in values if (d > 0 if direction == 'low' else d < 0))
                better = sum(1 for d in values if (d < 0 if direction == 'low' else d > 0))
                summary.append({'population': population, 'metric': metric,
                                'direction': 'lower is better' if direction == 'low' else 'higher is better',
                                'comparison': f'{p} vs {V2_CONTROL}', 'n_pairs': len(values),
                                'median_delta': round(statistics.median(values), 3), 'n_worse': worse, 'n_better': better,
                                'n_same': len(values) - worse - better})
    return profile_aggregates, paired, summary


def render(records, fieldnames=None):
    if not records:
        if fieldnames:
            return ','.join(fieldnames) + '\n'
        return ''
    out = io.StringIO()
    writer = csv.DictWriter(out, fieldnames=list(records[0].keys()), lineterminator='\n')
    writer.writeheader()
    writer.writerows(records)
    return out.getvalue()


def markdown(aggregates, metrics=('perf', 'a11y', 'lcp_ms', 'tbt_ms', 'cls', 'lh_kib', 'lh_kib_script', 'lh_kib_font', 'cdp_visit_kib')):
    lines = ['| Population | Tier | Metric (direction) | Source | Themes / vendors / captures | Median | p75 | Best (first capture of that theme) | Confidence |',
             '|---|---|---|---|---|---|---|---|---|']
    for a in aggregates:
        if a['metric'] in metrics:
            lines.append(f"| {a['population']} | {a['tier']} | {a['metric']} ({'↓' if a['direction'].startswith('lower') else '↑'}) | {a['source']} | "
                         f"{a['n_themes']} / {a['n_vendors']} / {a['n_captures']} | {a['median']:g} | {a['p75']:g} | {a['best']:g} ({a['best_theme_capture']}) | {a['confidence']} |")
    return '\n'.join(lines)


def viewport_markdown(profile_aggregates, summary, metrics=('perf', 'lcp_ms', 'tbt_ms', 'cls', 'lh_kib', 'layout_overflow_px',
                                                            'layout_small_targets', 'motion_running_after')):
    """Markdown for benchmark-pack.md §7: per-profile medians (themes in brackets) and paired deltas against v2-412,
    one block per population. Numbers come straight from build_viewport(); nothing is pooled across populations."""
    lines = []
    for population in sorted({a['population'] for a in profile_aggregates}, key=lambda p: (p != 'competitor', p)):
        rows = {(a['metric'], a['profile']): a for a in profile_aggregates if a['population'] == population}
        lines += [f'**{population}**: median per profile (themes)', '',
                  '| Metric (direction) | ' + ' | '.join(V2_PROFILES) + ' |', '|---|' + '---|' * len(V2_PROFILES)]
        for metric in metrics:
            present = [rows[(metric, p)] for p in V2_PROFILES if (metric, p) in rows]
            if not present:
                continue
            cells = [f"{rows[(metric, p)]['median']:g} ({rows[(metric, p)]['n_themes']})" if (metric, p) in rows else '—' for p in V2_PROFILES]
            arrow = '↓' if present[0]['direction'].startswith('lower') else '↑'
            lines.append(f'| {metric} ({arrow}) | ' + ' | '.join(cells) + ' |')
        paired = [s for s in summary if s['population'] == population and s['metric'] in metrics]
        if paired:
            lines += ['', f'**{population}**: paired deltas against the same-session `{V2_CONTROL}` capture of each theme', '',
                      '| Comparison | Metric | Pairs | Median delta | Worse / better / same |', '|---|---|---|---|---|']
            lines += [f"| {s['comparison']} | {s['metric']} | {s['n_pairs']} | {s['median_delta']:g} | {s['n_worse']} / {s['n_better']} / {s['n_same']} |"
                      for s in sorted(paired, key=lambda s: (metrics.index(s['metric']), s['comparison']))]
        lines.append('')
    return '\n'.join(lines)


def compare(unconditional, sensitivity, population='competitor'):
    """Markdown table of the aggregates that differ once provisional evidence is admitted (or exist in only one set)."""
    index = lambda records: {(a['tier'], a['metric']): a for a in records if a['population'] == population}
    left, right = index(unconditional), index(sensitivity)
    cell = lambda a: f"{a['n_themes']} / {a['n_vendors']} · {a['median']:g} · {a['p75']:g} · {a['best']:g} ({a['confidence']})" if a else '—'
    lines = ['| Tier | Metric | Unconditional: themes / vendors · median · p75 · best (confidence) | '
             'Sensitivity incl. provisional: same columns |', '|---|---|---|---|']
    for key in sorted(set(left) | set(right), key=lambda k: (TIERS + ('all',)).index(k[0]) if k[0] in TIERS + ('all',) else 9):
        a, b = left.get(key), right.get(key)
        fields = ('n_themes', 'n_vendors', 'median', 'p75', 'best')
        if a and b and all(a[f] == b[f] for f in fields):
            continue
        lines.append(f'| {key[0]} | {key[1]} | {cell(a)} | {cell(b)} |')
    return '\n'.join(lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--check', action='store_true')
    ap.add_argument('--markdown', action='store_true', help='unconditional aggregate tables (add --sensitivity for the other set)')
    ap.add_argument('--sensitivity', action='store_true', help='with --markdown: the set that includes provisional evidence')
    ap.add_argument('--compare', action='store_true', help='aggregates that change when provisional evidence is admitted')
    ap.add_argument('--viewport-markdown', action='store_true', help='protocol v2 per-profile medians and paired deltas (§7)')
    args = ap.parse_args()
    rows, stale = load_rows()
    if stale:
        print('captures-summary.csv is stale against raw/ + the register; run summarize-captures.py first:', file=sys.stderr)
        for line in stale:
            print('  ' + line, file=sys.stderr)
        return 1
    built = {False: build(rows), True: build(rows, sensitivity=True)}
    files = {output_path(name, sens): render(records)
             for sens, outputs in built.items() for name, records in zip(OUTPUT_NAMES, outputs)}
    v_aggregates, v_paired, v_summary = build_viewport(rows)
    files.update({os.path.join(VIEWPORT_DIR, 'profile-aggregates.csv'): render(v_aggregates, PROFILE_AGG_FIELDS),
                  os.path.join(VIEWPORT_DIR, 'paired-deltas.csv'): render(v_paired, PAIRED_FIELDS),
                  os.path.join(VIEWPORT_DIR, 'paired-summary.csv'): render(v_summary, PAIRED_SUMMARY_FIELDS)})
    tiers_out, aggregates, blueprints = built[False]
    s_tiers, s_aggregates, s_blueprints = built[True]
    if args.markdown:
        print(markdown(s_aggregates if args.sensitivity else aggregates))
        return 0
    if args.compare:
        print(compare(aggregates, s_aggregates))
        return 0
    if args.viewport_markdown:
        print(viewport_markdown(v_aggregates, v_summary))
        return 0
    if args.check:
        bad = [name for name, text in files.items()
               if not os.path.exists(os.path.join(BENCH, name)) or open(os.path.join(BENCH, name), encoding='utf-8').read() != text]
        print(f"benchmark-pack: {'STALE ' + ', '.join(bad) if bad else 'up to date'} "
              f"(unconditional: {len(tiers_out)} themes, {len(aggregates)} aggregates, {len(blueprints)} blueprints; "
              f"sensitivity incl. provisional: {len(s_tiers)} / {len(s_aggregates)} / {len(s_blueprints)})")
        return 1 if bad else 0
    os.makedirs(os.path.join(BENCH, SENSITIVITY_DIR), exist_ok=True)
    os.makedirs(os.path.join(BENCH, VIEWPORT_DIR), exist_ok=True)
    for name, text in files.items():
        with open(os.path.join(BENCH, name), 'w', encoding='utf-8') as handle:
            handle.write(text)
    print(f'benchmark-pack: wrote unconditional tiers.csv ({len(tiers_out)} themes), tier-aggregates.csv ({len(aggregates)} rows), '
          f'blueprints.csv ({len(blueprints)} themes); sensitivity/*-incl-provisional.csv ({len(s_tiers)} / {len(s_aggregates)} / '
          f'{len(s_blueprints)}); viewport/ (protocol v2: {len(v_aggregates)} profile aggregates, {len(v_paired)} paired rows, '
          f'{len(v_summary)} paired summaries)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
