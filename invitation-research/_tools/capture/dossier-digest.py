#!/usr/bin/env python3
"""Dossier §4/§5 helper: cold-load and post-visit tables with eligible-only medians, plus a structure digest per capture.

    python3 -B invitation-research/_tools/capture/dossier-digest.py --competitor katsudoto C-KAT-101 … C-KAT-106

Reads raw/<competitor>/C-*.json only (measurements and structure: no page copy, no names, R1/R2) and prints
Markdown to stdout for pasting into 03-teardowns/<competitor>/dossier.md.

Every requested capture is listed with its eligibility (eligibility.py, brief 05 B1), but a median only uses captures
eligible for that table: cold-load (Lighthouse) for the first, structure for the second. Medians are taken per theme
first, so a retried theme counts once. The two measurement sources are never mixed (B2): Lighthouse cold load vs our
CDP session over the whole visit (load + scenario + cover click + scroll). KiB = 1,024 bytes.
Rows excluded with `scope=all`, and pages that are not guest pages, print no values unless `--show-excluded` is given,
so a pasted table cannot carry numbers that must not be cited (e.g. C-VID-104…106, D-022).
"""
import argparse
import json
import os
import sys

import eligibility

RESEARCH = eligibility.RESEARCH
COLD_COLUMNS = [('Perf', 'perf', 'raw'), ('A11y', 'a11y', 'raw'), ('BP', 'bp', 'raw'), ('SEO', 'seo', 'raw'),
                ('FCP s', 'fcp', 's'), ('LCP s', 'lcp', 's'), ('TBT ms', 'tbt', 'int'), ('CLS', 'cls', 'cls'),
                ('LH req', 'lh_req', 'int'), ('LH KiB', 'lh_kib', 'int'), ('LH JS KiB', 'lh_js', 'int'),
                ('LH img KiB', 'lh_img', 'int'), ('LH font KiB', 'lh_font', 'int')]
VISIT_COLUMNS = [('CDP req', 'cdp_req', 'int'), ('CDP KiB', 'cdp_kib', 'int'), ('CDP JS KiB', 'cdp_js', 'int'),
                 ('CDP img KiB', 'cdp_img', 'int'), ('CDP font KiB', 'cdp_font', 'int'), ('CDP media KiB', 'cdp_media', 'int'),
                 ('DOM', 'dom', 'int'), ('Sections', 'sec', 'raw')]


def load(competitor, capture_id):
    with open(os.path.join(RESEARCH, 'raw', competitor, f'{capture_id}.json')) as handle:
        return json.load(handle)


def fmt(value, kind):
    if value is None:
        return '–'
    if kind == 's':
        return f'{value / 1000:.2f}'
    if kind == 'cls':
        return f'{value:.3f}'
    if kind == 'int':
        return f'{round(value):,}'
    return str(value)


def measurements(d):
    lh = d.get('lighthouse') or {}
    scores, metrics = lh.get('scores') or {}, lh.get('metrics') or {}
    lh_types = lh.get('byType') or {}
    net = d.get('network') or {}
    cdp_types = net.get('byType') or {}
    after = (d.get('structure') or {}).get('afterOpen') or {}
    lh_kib = lambda name: ((lh_types.get(name) or {}).get('bytes') / 1024) if (lh_types.get(name) or {}).get('bytes') is not None else None
    cdp_kib = lambda name: ((cdp_types.get(name) or {}).get('bytes') or 0) / 1024
    values = {'perf': scores.get('performance'), 'a11y': scores.get('accessibility'), 'bp': scores.get('best-practices'),
              'seo': scores.get('seo'), 'fcp': metrics.get('fcpMs'), 'lcp': metrics.get('lcpMs'), 'tbt': metrics.get('tbtMs'),
              'cls': metrics.get('cls'), 'lh_req': lh.get('requests'),
              'lh_kib': lh.get('totalBytes') / 1024 if lh.get('totalBytes') is not None else None,
              'lh_js': lh_kib('script'), 'lh_img': lh_kib('image'), 'lh_font': lh_kib('font'),
              'cdp_req': net.get('requests'), 'cdp_kib': (net.get('bytes') or 0) / 1024, 'cdp_js': cdp_kib('Script'),
              'cdp_img': cdp_kib('Image'), 'cdp_font': cdp_kib('Font'), 'cdp_media': cdp_kib('Media'),
              'dom': after.get('domNodes'), 'sec': after.get('sectionCount')}
    if not lh.get('ok'):
        for key in ('perf', 'a11y', 'bp', 'seo', 'fcp', 'lcp', 'tbt', 'cls', 'lh_req', 'lh_kib', 'lh_js', 'lh_img', 'lh_font'):
            values[key] = None
    return values


def table(title, columns, items, eligible_key, reasons_key, extra=None):
    extra = extra or []
    print(f'#### {title}')
    print('| Capture | Theme key | Eligible | ' + ' | '.join(c[0] for c in extra + columns) + ' |')
    print('|' + '---|' * (len(extra) + len(columns) + 3))
    for capture_id, d, ev, values in items:
        provisional = f" (provisional: {ev['provisional_decision']})" if ev.get('provisional') else ''
        mark = 'yes' + provisional if ev[eligible_key] else 'no: ' + '; '.join(ev[reasons_key])
        if ev.get('masked'):
            cells = ['·'] * (len(extra) + len(columns))
        else:
            cells = [str(e[1](d, ev)) for e in extra] + [fmt(values[c[1]], c[2]) for c in columns]
        print(f"| {capture_id} | `{ev['theme_key']}` | {mark} | " + ' | '.join(cells) + ' |')
    eligible = [(ev['theme_key'], values) for _, _, ev, values in items if ev[eligible_key]]
    cells, counts = [], set()
    for _, key, kind in columns:
        median, themes, captures = eligibility.theme_median(eligible, lambda v, k=key: v[k])
        counts.add((themes, captures))
        cells.append(f"**{fmt(median, kind if kind != 'raw' else 'int')}**" if median is not None else '')
    themes, captures = max(counts) if counts else (0, 0)
    label = f'**Median of {themes} theme(s), {captures} eligible capture(s)**' if eligible else '**No eligible capture: no median**'
    print(f'| {label} | | | ' + ' | '.join([''] * len(extra) + cells) + ' |')
    print()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--competitor', required=True)
    parser.add_argument('--register', default=eligibility.REGISTER_PATH)
    parser.add_argument('--show-excluded', action='store_true',
                        help='print values of scope=all and non-guest-page rows (never feed them into a dossier median)')
    parser.add_argument('--sensitivity', action='store_true',
                        help='admit provisional evidence (eligibility.py rule 7); every table is labelled SENSITIVITY')
    parser.add_argument('ids', nargs='+')
    args = parser.parse_args()

    known = {c['id'] for c in eligibility.load_captures()}
    register = eligibility.load_register(args.register, known_ids=known)
    for level, cid, message in register.problems:
        print(f'{level.upper()} {cid} {message}', file=sys.stderr)
    captures = [load(args.competitor, capture_id) for capture_id in args.ids]
    populations = sorted({eligibility.measurement_population(c['id'], c.get('competitor'), eligibility.capture_profile(c))
                          for c in captures})
    if len(populations) > 1:
        print(f'ERROR: the captures span measurement populations {", ".join(populations)}; a median pools one profile and, '
              'for our own pages, one product build (D-032, eligibility.py rule 8). Run once per population.', file=sys.stderr)
        return 2
    profile = eligibility.capture_profile(captures[0])
    screen = eligibility.PROFILES.get(profile, eligibility.PROFILES[eligibility.V1_PROFILE])
    viewport = f"{screen['width']}×{screen['height']}" + (', prefers-reduced-motion: reduce' if screen['motion'] == 'reduce' else '')
    results = eligibility.evaluate_all(captures, register)
    for ev in results.values():
        if args.sensitivity:
            for key in ('coldload', 'structure'):
                ev[f'{key}_eligible'] = ev[f'{key}_eligible_sensitivity']
                ev[f'{key}_reasons'] = ev[f'{key}_reasons_sensitivity']
        hidden = ev['exclusion_scope'] == 'all' or ev['page_class'] != 'guest_page' or (ev['provisional'] and not args.sensitivity)
        ev['masked'] = not args.show_excluded and hidden
    items = [(d['id'], d, results[d['id']], measurements(d)) for d in captures]
    for capture_id, _, ev, _ in items:
        for level, message in ev['findings']:
            print(f'{level.upper()} {capture_id} {message}', file=sys.stderr)

    cold_n = sum(ev['coldload_eligible'] for _, _, ev, _ in items)
    struct_n = sum(ev['structure_eligible'] for _, _, ev, _ in items)
    population = 'SENSITIVITY population (provisional evidence admitted; never quote as unconditional)' if args.sensitivity \
        else 'unconditional population (provisional evidence excluded)'
    print(f'<!-- dossier-digest.py: {args.competitor} {len(items)} capture(s); measurement population {populations[0]}; '
          f'{population}; cold-load eligible {cold_n}, '
          f'structure eligible {struct_n}; register {os.path.relpath(args.register, RESEARCH)} ({register.rows} rows, '
          f'provisional {register.provisional_rows} rows) -->')
    if args.sensitivity:
        print('> **SENSITIVITY RESULT.** Includes provisional evidence (eligibility.py rule 7). Not an unconditional figure.\n')
    table(f'Cold load (Lighthouse 12.8.2, simulated Slow 4G + 4× CPU, {viewport}, cold cache; Lighthouse never clicks)',
          COLD_COLUMNS, items, 'coldload_eligible', 'coldload_reasons')
    table('After the visit (our CDP session, unthrottled: load + scenario + cover click + scroll; not Lighthouse)',
          VISIT_COLUMNS, items, 'structure_eligible', 'structure_reasons',
          extra=[('Driver', lambda d, ev: ev['visit_driver']), ('Cover', lambda d, ev: 'yes' if ev['cover_detected'] else 'not detected'),
                 ('Click', lambda d, ev: ev['click_method'] or 'none'), ('Opening', lambda d, ev: ev['gate_opening']),
                 ('Audio el. / playback', lambda d, ev: f"{ev['audio_elements']} / {ev['audio_playback']}")])
    for capture_id, d, ev, _ in items:
        if ev['masked']:
            print(json.dumps({'id': capture_id, 'masked': '; '.join(ev['coldload_reasons'] or ev['structure_reasons'])}))
            continue
        lh = d.get('lighthouse') or {}
        net = d.get('network') or {}
        after = (d.get('structure') or {}).get('afterOpen') or {}
        media = after.get('media') or {}
        viewport = (after.get('viewport') or '').replace(' ', '')
        print(json.dumps({
            'id': capture_id, 'coldLoad': ev['coldload_eligible'], 'structure': ev['structure_eligible'],
            'gateOpening': ev['gate_opening'], 'driver': ev['visit_driver'], 'lang': after.get('lang'),
            'zoom': 'blocked' if 'user-scalable=no' in viewport or 'maximum-scale=1' in viewport else 'allowed',
            'og': ''.join(k[0] for k, v in (after.get('og') or {}).items() if v), 'reducedMotionCss': after.get('reducedMotionCss'),
            'generator': (after.get('generator') or '')[:30], 'fonts': (after.get('fontsUsed') or [])[:6],
            'audio': [f"{'autoplay ' if a.get('autoplay') else ''}{'loop ' if a.get('loop') else ''}{a.get('type')}" for a in (media.get('audio') or [])][:2],
            'video': media.get('video'), 'iframes': sorted(set(media.get('iframes') or []))[:4], 'lazyImages': f"{media.get('lazyImages')}/{media.get('images')}",
            'forms': [len(f.get('fields') or []) for f in (after.get('forms') or [])][:4],
            'tz': (after.get('features') or {}).get('timezoneLabel'), 'docHeight': after.get('docHeight'),
            'lhA11yFailures': lh.get('a11yFailures') or [], 'lhUnusedJsKiB': round((lh.get('unusedJsBytes') or 0) / 1024),
            'lhThirdParties': [f"{t.get('entity')} {round((t.get('bytes') or 0) / 1024)} KiB/{round(t.get('blockingMs') or 0)} ms" for t in (lh.get('thirdParties') or [])[:5]],
            'lhFontDisplayIssues': lh.get('fontDisplayIssues'), 'cdpProtocols': net.get('protocols'),
        }, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.exit(main())
