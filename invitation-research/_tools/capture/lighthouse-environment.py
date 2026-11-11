#!/usr/bin/env python3
"""Lighthouse host environment per capture: benchmarkIndex and the slow-CPU run warning (session 13).

    python3 -B invitation-research/_tools/capture/lighthouse-environment.py          # update the snapshot CSV
    python3 -B invitation-research/_tools/capture/lighthouse-environment.py --print  # summary per session day

Lighthouse's simulated throttling scales the CPU time it observes, so a slower host inflates TBT and LCP. Lighthouse
records the host's speed as `environment.benchmarkIndex` (higher = faster) and adds a run warning when the host looks
slower than its CPU multiplier assumes. Capture summaries did not keep either value before s13, so this script reads them
from the full reports: own pages from `raw/invitesion/<id>/lighthouse.json` (committed), competitors from
`$INVITESION_PRIVATE_DIR/lh/<id>.json` (private, present only in the sandbox that captured them).

The CSV is a merged snapshot: a capture whose report is not available keeps its previously recorded values, or gets
`report not retained` if it never had any, so re-running in a later sandbox can only add values, never erase them.
"""
import csv
import glob
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
RESEARCH = os.path.normpath(os.path.join(HERE, '..', '..'))
PRIVATE = os.environ.get('INVITESION_PRIVATE_DIR') or os.path.join(RESEARCH, '_private')
OUT = os.path.join(RESEARCH, '04-template-benchmarks', 'viewport', 'lighthouse-environment.csv')
FIELDS = ['capture_id', 'competitor', 'profile', 'lighthouse_fetch_time_utc', 'benchmark_index', 'slow_cpu_warning', 'report_source']
SLOW_CPU_MARKER = 'slower CPU than'
NOT_RETAINED = 'report not retained'


def report_path(capture):
    if capture.get('competitor') == 'invitesion':
        return os.path.join(RESEARCH, 'raw', 'invitesion', capture['id'], 'lighthouse.json'), 'own report (committed)'
    return os.path.join(PRIVATE, 'lh', f"{capture['id']}.json"), 'private report'


def environment_row(capture, previous):
    profile = (capture.get('measurement') or {}).get('profile') or 'v1-412'
    base = {'capture_id': capture['id'], 'competitor': capture.get('competitor', ''), 'profile': profile}
    path, source = report_path(capture)
    if os.path.exists(path):
        with open(path, encoding='utf-8') as handle:
            report = json.load(handle)
        warnings = report.get('runWarnings') or []
        index = (report.get('environment') or {}).get('benchmarkIndex')
        return dict(base, lighthouse_fetch_time_utc=(report.get('fetchTime') or '')[:19],
                    benchmark_index='' if index is None else f'{index:g}',
                    slow_cpu_warning=str(any(SLOW_CPU_MARKER in w for w in warnings)), report_source=source)
    if previous and previous.get('report_source') != NOT_RETAINED:
        return dict(previous, **base)
    return dict(base, lighthouse_fetch_time_utc='', benchmark_index='', slow_cpu_warning='', report_source=NOT_RETAINED)


def load_previous():
    if not os.path.exists(OUT):
        return {}
    with open(OUT, encoding='utf-8', newline='') as handle:
        return {row['capture_id']: row for row in csv.DictReader(handle)}


def build():
    previous = load_previous()
    rows = []
    for path in sorted(glob.glob(os.path.join(RESEARCH, 'raw', '*', 'C-*.json'))):
        with open(path, encoding='utf-8') as handle:
            capture = json.load(handle)
        if (capture.get('lighthouse') or {}).get('ok'):
            rows.append(environment_row(capture, previous.get(capture['id'])))
    return rows


def write(rows):
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8', newline='') as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS, lineterminator='\n')
        writer.writeheader()
        writer.writerows(rows)


def summary(rows):
    by_day = {}
    for row in rows:
        if row['benchmark_index']:
            by_day.setdefault(row['lighthouse_fetch_time_utc'][:10], []).append(row)
    lines = ['| Day (UTC) | Reports | benchmarkIndex min / median / max | Slow-CPU warnings |', '|---|---|---|---|']
    for day, items in sorted(by_day.items()):
        values = sorted(float(r['benchmark_index']) for r in items)
        median = values[len(values) // 2] if len(values) % 2 else (values[len(values) // 2 - 1] + values[len(values) // 2]) / 2
        warned = sum(1 for r in items if r['slow_cpu_warning'] == 'True')
        lines.append(f'| {day} | {len(items)} | {values[0]:g} / {median:g} / {values[-1]:g} | {warned} |')
    missing = sum(1 for r in rows if r['report_source'] == NOT_RETAINED)
    lines.append(f'\n{len(rows)} captures with a successful Lighthouse run; {missing} without a retained report.')
    return '\n'.join(lines)


def main():
    rows = build()
    if '--print' in sys.argv:
        print(summary(rows))
        return 0
    write(rows)
    print(f'lighthouse-environment: {len(rows)} rows -> {os.path.relpath(OUT, RESEARCH)}')
    print(summary(rows))
    return 0


if __name__ == '__main__':
    sys.exit(main())
