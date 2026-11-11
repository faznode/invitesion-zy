#!/usr/bin/env python3
"""Flatten capture summaries (raw/<competitor>/C-*.json) into one CSV row per capture, with benchmark eligibility.

    python3 -B invitation-research/_tools/capture/summarize-captures.py              # all captures -> captures-summary.csv
    python3 -B .../summarize-captures.py --competitor invi --print                   # one competitor, table to stdout
    python3 -B .../summarize-captures.py --strict                                    # exit 1 if the exclusion register has errors
    -> invitation-research/04-template-benchmarks/captures-summary.csv (generated; feeds blueprints, dossiers, tier aggregates)

Every capture stays in the CSV (raw evidence is never dropped); `coldload_eligible` / `structure_eligible` and
`eligibility_reasons` say what it may support in the unconditional population (eligibility.py, brief 05 B1);
`provisional` + `*_eligible_sensitivity` describe the sensitivity population that also admits provisional evidence
(eligibility.py rule 7, D-031). `measurement_population` (profile, plus `own@<build>` for our own pages) and `own_build`
name the population a row may be pooled with (eligibility.py rule 8, s14). Measurement sources are never mixed (B2):
  lh_*          Lighthouse cold load (12.8.2, simulated Slow 4G + 4x CPU, 412x915, own cold Chrome; Lighthouse never clicks)
  cdp_visit_*   our CDP session over the whole visit: load + REA scenario + cover click + scroll (unthrottled)
  *_bytes       exact bytes; *_kib = bytes / 1024, rounded (older dossiers wrote "KB" for these KiB values)
Cover facts are separate columns: cover_detected, click_attempted, click_method, gate_opening, audio_playback.
Schema v2 (s08) renamed: requests -> cdp_visit_requests, kb_total -> cdp_visit_kib, kb_<type> -> cdp_visit_kib_<type>,
third_party_hosts -> cdp_third_party_hosts, font_files -> cdp_font_files, wrapper -> wrapper_heuristic,
cover_clicked -> click_attempted + click_method + click_landing; `features` no longer infers coverGate from the click.

Only measurements and structure leave raw/: no page copy, no names (R1/R2).
"""
import argparse
import csv
import os
import sys

import eligibility

RESEARCH = eligibility.RESEARCH
COLUMNS = ['id', 'competitor', 'population', 'measurement_population', 'own_build', 'kind', 'page_class', 'page_class_source', 'url', 'theme_key',
           'theme_attempt', 'theme_attempts', 'captured_at', 'visit_driver',
           'coldload_eligible', 'structure_eligible', 'exclusion_scope', 'exclusion_decision', 'eligibility_reasons',
           'provisional', 'provisional_decision', 'coldload_eligible_sensitivity', 'structure_eligible_sensitivity',
           'lh_ok', 'lh_version', 'perf', 'a11y', 'best_practices', 'seo', 'fcp_ms', 'lcp_ms', 'tbt_ms', 'cls', 'si_ms',
           'lh_requests', 'lh_bytes', 'lh_kib', 'lh_kib_script', 'lh_kib_image', 'lh_kib_font', 'lh_kib_css',
           'lh_kib_media', 'lh_kib_third_party',
           'cdp_visit_requests', 'cdp_visit_bytes', 'cdp_visit_kib', 'cdp_visit_kib_script', 'cdp_visit_kib_image',
           'cdp_visit_kib_font', 'cdp_visit_kib_css', 'cdp_visit_kib_media', 'cdp_third_party_hosts', 'cdp_font_files',
           'libs', 'sections', 'features', 'og_image', 'reduced_motion_css', 'dom_nodes', 'wrapper_heuristic',
           'cover_detected', 'click_attempted', 'click_method', 'click_landing', 'gate_opening',
           'audio_elements', 'audio_autoplay_attr', 'audio_playback',
           # s13, protocol v2 (capture-profile.mjs): empty for v1.2 captures, which predate the probes.
           'profile', 'protocol', 'viewport_w', 'viewport_h', 'device_scale_factor', 'reduced_motion', 'emulation_verified',
           'layout_overflow_px', 'layout_overflowing_elements', 'layout_small_text', 'layout_small_targets', 'layout_targets',
           'motion_running_before', 'motion_running_after', 'motion_infinite_after', 'motion_gsap_active_after',
           'motion_reduce_matched']
CDP_TYPES = {'script': 'Script', 'image': 'Image', 'font': 'Font', 'css': 'Stylesheet', 'media': 'Media'}
LH_TYPES = {'script': 'script', 'image': 'image', 'font': 'font', 'css': 'stylesheet', 'media': 'media',
            'third_party': 'third-party'}


def kib(value):
    return round(value / 1024) if isinstance(value, (int, float)) else None


def row(d, ev):
    net = d.get('network') or {}
    cdp_types = net.get('byType') or {}
    lh = d.get('lighthouse') or {}
    lh_types = lh.get('byType') or {}
    scores = lh.get('scores') or {}
    metrics = lh.get('metrics') or {}
    after = (d.get('structure') or {}).get('afterOpen') or {}
    flags = {k: v for k, v in (after.get('features') or {}).items() if k != 'coverGate'}
    reasons = [f'cold-load: {r}' for r in ev['coldload_reasons']] + [f'structure: {r}' for r in ev['structure_reasons']]
    out = {
        'id': d.get('id'), 'competitor': d.get('competitor'), 'population': ev['population'],
        'measurement_population': ev['measurement_population'], 'own_build': ev['own_build'], 'kind': d.get('kind'),
        'page_class': ev['page_class'], 'page_class_source': ev['page_class_source'], 'url': d.get('url'),
        'theme_key': ev['theme_key'], 'theme_attempt': ev['theme_attempt'], 'theme_attempts': ev['theme_attempts'],
        'captured_at': d.get('capturedAt') or d.get('captured_at') or '', 'visit_driver': ev['visit_driver'],
        'coldload_eligible': ev['coldload_eligible'], 'structure_eligible': ev['structure_eligible'],
        'exclusion_scope': ev['exclusion_scope'], 'exclusion_decision': ev['exclusion_decision'],
        'eligibility_reasons': '; '.join(reasons),
        'provisional': ev['provisional'], 'provisional_decision': ev['provisional_decision'],
        'coldload_eligible_sensitivity': ev['coldload_eligible_sensitivity'],
        'structure_eligible_sensitivity': ev['structure_eligible_sensitivity'],
        'lh_ok': bool(lh.get('ok')), 'lh_version': lh.get('lighthouseVersion') or '',
        'perf': scores.get('performance'), 'a11y': scores.get('accessibility'),
        'best_practices': scores.get('best-practices'), 'seo': scores.get('seo'),
        'fcp_ms': metrics.get('fcpMs'), 'lcp_ms': metrics.get('lcpMs'), 'tbt_ms': metrics.get('tbtMs'),
        'cls': metrics.get('cls'), 'si_ms': metrics.get('siMs'),
        'lh_requests': lh.get('requests'), 'lh_bytes': lh.get('totalBytes'), 'lh_kib': kib(lh.get('totalBytes')),
        'cdp_visit_requests': net.get('requests'), 'cdp_visit_bytes': net.get('bytes'), 'cdp_visit_kib': kib(net.get('bytes')),
        'cdp_third_party_hosts': len(net.get('thirdPartyHosts') or []), 'cdp_font_files': len(net.get('fontFiles') or []),
        'libs': ' '.join(sorted(k for k, v in (after.get('libs') or {}).items() if v)),
        'sections': after.get('sectionCount'), 'features': ' '.join(sorted(k for k, v in flags.items() if v)),
        'og_image': (after.get('og') or {}).get('image'), 'reduced_motion_css': after.get('reducedMotionCss'),
        'dom_nodes': after.get('domNodes'), 'wrapper_heuristic': ev['wrapper_heuristic'],
    }
    for column, name in LH_TYPES.items():
        out[f'lh_kib_{column}'] = kib((lh_types.get(name) or {}).get('bytes')) if lh.get('ok') else None
    for column, name in CDP_TYPES.items():
        out[f'cdp_visit_kib_{column}'] = kib((cdp_types.get(name) or {}).get('bytes') or 0)
    for column in ('cover_detected', 'click_attempted', 'click_method', 'click_landing', 'gate_opening',
                   'audio_elements', 'audio_autoplay_attr', 'audio_playback'):
        out[column] = ev[column]
    m = d.get('measurement') or {}
    viewport = m.get('viewport') or {}
    layout, motion_after = after.get('layout') or {}, after.get('motion') or {}
    motion_before = ((d.get('structure') or {}).get('beforeOpen') or {}).get('motion') or {}
    out.update({
        'profile': ev['profile'], 'protocol': m.get('protocol') or 'v1.2', 'viewport_w': viewport.get('width'),
        'viewport_h': viewport.get('height'), 'device_scale_factor': viewport.get('device_scale_factor'),
        'reduced_motion': m.get('reduced_motion'), 'emulation_verified': m.get('emulation_verified'),
        'layout_overflow_px': layout.get('horizontalOverflowPx'), 'layout_overflowing_elements': layout.get('overflowingElements'),
        'layout_small_text': layout.get('smallTextElements'), 'layout_small_targets': layout.get('smallTargets'),
        'layout_targets': layout.get('interactiveTargets'), 'motion_running_before': motion_before.get('running'),
        'motion_running_after': motion_after.get('running'), 'motion_infinite_after': motion_after.get('runningInfinite'),
        'motion_gsap_active_after': motion_after.get('gsapActiveTweens'), 'motion_reduce_matched': motion_after.get('reducedMotionMatches'),
    })
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--competitor', default='*')
    ap.add_argument('--out', default=os.path.join(RESEARCH, '04-template-benchmarks', 'captures-summary.csv'))
    ap.add_argument('--register', default=eligibility.REGISTER_PATH)
    ap.add_argument('--print', action='store_true')
    ap.add_argument('--strict', action='store_true', help='exit 1 when the exclusion register or a capture has errors')
    a = ap.parse_args()
    captures = eligibility.load_captures()
    register = eligibility.load_register(a.register, known_ids={c['id'] for c in captures})
    results = eligibility.evaluate_all(captures, register)
    problems = eligibility.all_problems(register, captures, results)
    selected = [c for c in captures if a.competitor in ('*', c.get('competitor'))]
    rows = [row(c, results[c['id']]) for c in selected]
    if a.competitor == '*':
        with open(a.out, 'w', newline='') as fh:
            w = csv.DictWriter(fh, fieldnames=COLUMNS)
            w.writeheader()
            w.writerows(rows)
        cold = sum(r['coldload_eligible'] for r in rows)
        struct = sum(r['structure_eligible'] for r in rows)
        cold_s = sum(r['coldload_eligible_sensitivity'] for r in rows)
        struct_s = sum(r['structure_eligible_sensitivity'] for r in rows)
        print(f'{len(rows)} captures -> {os.path.relpath(a.out, RESEARCH)} '
              f'(unconditional: cold-load eligible {cold}, structure eligible {struct}; sensitivity incl. provisional: '
              f'{cold_s} / {struct_s}; register {register.rows} rows, provisional {register.provisional_rows} rows)')
    if a.print or a.competitor != '*':
        for r in rows:
            print(f"{r['id']:10} {r['page_class']:10} cold={'Y' if r['coldload_eligible'] else 'n'} "
                  f"struct={'Y' if r['structure_eligible'] else 'n'} perf={r['perf']} lcp={r['lcp_ms']} tbt={r['tbt_ms']} "
                  f"lh={r['lh_kib']}KiB/{r['lh_requests']}req cdp-visit={r['cdp_visit_kib']}KiB/{r['cdp_visit_requests']}req "
                  f"opening={r['gate_opening']} theme={r['theme_key']} [{r['theme_attempt']}/{r['theme_attempts']}]"
                  f"{'  -- ' + r['eligibility_reasons'] if r['eligibility_reasons'] else ''}")
    errors = [p for p in problems if p[0] == 'error']
    for level, cid, message in problems:
        if level != 'note':
            print(f'{level.upper():7} {cid:10} {message}', file=sys.stderr)
    return 1 if (a.strict and errors) else 0


if __name__ == '__main__':
    sys.exit(main())
