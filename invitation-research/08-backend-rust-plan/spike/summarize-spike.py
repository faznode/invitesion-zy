#!/usr/bin/env python3
"""Summarize one spike result set into results/<set>/summary.md (and print it).

    python3 -B invitation-research/08-backend-rust-plan/spike/summarize-spike.py s09-20261103
    python3 -B invitation-research/08-backend-rust-plan/spike/summarize-spike.py s09-20261103 --check   # exit 1 unless every row is valid
    python3 -B invitation-research/08-backend-rust-plan/spike/summarize-spike.py s09-20261103-cache --targets next --check

`--targets` limits the tables and the check to the arms a set was meant to contain (a single-arm experiment is not
"invalid" because the other arms were never run). An optional `variant.json` in the set ({"note": "...",
"labels": {"next": "..."}}) describes a snapshot-only build variant and relabels its rows, so a set stays
self-describing. Platform `next dev` CPU above 5 % of a core during a scenario is listed as contention.

Reads k6 --summary-export JSON, sample-proc.py JSON, db-snapshot JSON and the status file run-spike.sh writes.
Session 09 rules: a row whose status is not ok is printed as FAILED with no numbers; latency, request counts and
bytes come from the op-tagged sub-metrics (setup requests are reported separately, never mixed in); dropped
iterations in the open-model scenario are shown because they mean the target did not sustain the offered rate.
The s08 files in results/s08-20261103-historical/ (Next only, no Rust) are historical and are not read by this script.
"""
import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SCENARIOS = (('read-spike', 'read', 'Read spike: 0→40 VUs, 40 VUs for 40 s, →0 (closed model, no think time)'),
             ('rsvp-burst', 'rsvp', 'RSVP write burst: 0→20 VUs, 20 VUs for 30 s, →0 (POST, redirects not followed)'),
             ('fixed-read', 'read', 'Equal-load read: 10 requests/s for 30 s (open model)'))
TARGETS = (('next', 'Next.js product page (2 loader calls + React SSR)'),
           ('next-min', 'Next.js minimal route (1 loader call + minimal HTML)'),
           ('rust', 'Rust Axum spike (same queries + minimal HTML)'))
PLATFORM_CONTENTION_PCT = 5.0


def load(path):
    if not os.path.exists(path):
        return None
    with open(path) as handle:
        text = handle.read().strip()
    return json.loads(text) if text else None


def tagged(metrics, name, op):
    return metrics.get(f'{name}{{op:{op}}}') or {}


def row(directory, target, scenario, op):
    status = load(os.path.join(directory, f'{target}-{scenario}-status.json'))
    if status is None:
        return {'state': 'not run'}
    if not status.get('ok'):
        return {'state': f"FAILED (k6 exit {status.get('k6_exit')}, sampler exit {status.get('sampler_exit')}, server pids {status.get('server_pids_seen')})"}
    k6 = load(os.path.join(directory, f'{target}-{scenario}-k6.json')) or {}
    proc = load(os.path.join(directory, f'{target}-{scenario}-proc.json')) or {}
    db = load(os.path.join(directory, f'{target}-{scenario}-db.json')) or {}
    metrics = k6.get('metrics') or {}
    reqs = tagged(metrics, 'http_reqs', op)
    duration = tagged(metrics, 'http_req_duration', op)
    # k6 v0.54 does not attach request tags to data_received (the op sub-metric is always 0), so bytes per request use
    # the untagged total over all requests; only the next RSVP run has a setup GET in it (1 of ~10k requests).
    received_total = (metrics.get('data_received') or {}).get('count') or 0
    checks = tagged(metrics, 'checks', op)
    failed = tagged(metrics, 'http_req_failed', op)
    total_reqs = (metrics.get('http_reqs') or {}).get('count', 0)
    summary = proc.get('summary') or {}
    count = reqs.get('count') or 0
    return {
        'state': 'ok', 'reqs': count, 'rate': reqs.get('rate') or 0, 'setup_reqs': total_reqs - count,
        'failed_rate': failed.get('value'), 'checks': f"{checks.get('passes', 0)}/{checks.get('passes', 0) + checks.get('fails', 0)}",
        'dropped': (metrics.get('dropped_iterations') or {}).get('count', 0),
        'kib_per_req': received_total / 1024 / total_reqs if total_reqs else None,
        'med': duration.get('med'), 'p90': duration.get('p(90)'), 'p95': duration.get('p(95)'), 'p99': duration.get('p(99)'), 'max': duration.get('max'),
        'server': summary.get('server', {}), 'postgres': summary.get('postgres', {}), 'platform': summary.get('platform-dev', {}),
        'host': summary.get('host', {}), 'samples': proc.get('samples'), 'warnings': proc.get('warnings') or [],
        'saved': (metrics.get('rsvp_saved') or {}).get('count'), 'db': db,
    }


def fmt(value, digits=1):
    return '–' if value is None else f'{value:,.{digits}f}'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('set', help='result set directory under results/')
    parser.add_argument('--check', action='store_true', help='exit 1 unless every target × scenario row is valid')
    parser.add_argument('--targets', default=','.join(t for t, _ in TARGETS),
                        help='comma-separated arms this set contains (default: all three)')
    args = parser.parse_args()
    directory = os.path.join(HERE, 'results', args.set)
    if not os.path.isdir(directory):
        sys.exit(f'no result set {directory}')
    wanted = [t.strip() for t in args.targets.split(',') if t.strip()]
    unknown = [t for t in wanted if t not in dict(TARGETS)]
    if unknown or not wanted:
        sys.exit(f'unknown --targets {unknown or args.targets}; choose from {", ".join(t for t, _ in TARGETS)}')
    variant = load(os.path.join(directory, 'variant.json')) or {}
    labels = {**dict(TARGETS), **(variant.get('labels') or {})}
    targets = [(t, labels[t]) for t, _ in TARGETS if t in wanted]
    lines = [f'<!-- generated by summarize-spike.py {args.set} --targets {",".join(wanted)}; do not edit by hand -->', f'# Spike results: `{args.set}`', '']
    if variant.get('note'):
        lines += [f"Variant: {variant['note']}", '']
    lines += ['Latency = k6 `http_req_duration` of the measured operation only (ms). CPU = % of ONE core, mean over the sampled '
              'run (host has the core count shown under Host). RSS = max MB of the server process group. "Platform" = the '
              'hosting platform\'s own `next dev` on the same host. Host busy includes every process. KiB/req = bytes received '
              '(headers + body, uncompressed; no Accept-Encoding sent) over all requests of the run, because k6 v0.54 does not tag '
              '`data_received` per request; the next RSVP run includes its one setup GET. Rows marked FAILED have no numbers by design.', '']
    invalid = 0
    for scenario, op, title in SCENARIOS:
        lines += [f'## {title}', '',
                  '| Target | Requests | Req/s | Setup reqs | Failed | Checks | Dropped | KiB/req | p50 | p90 | p95 | p99 | max | Server CPU mean / p95 / max % | Server RSS max MB | Postgres CPU mean % | Platform CPU mean % | Host busy mean % (steal) |',
                  '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|']
        for target, label in targets:
            data = row(directory, target, scenario, op)
            if data['state'] != 'ok':
                invalid += 1
                lines.append(f"| {label} | {data['state']} |" + ' |' * 16)
                continue
            server, host = data['server'], data['host']
            lines.append(
                f"| {label} | {data['reqs']:,} | {fmt(data['rate'])} | {data['setup_reqs']} | {fmt((data['failed_rate'] or 0) * 100, 2)} % | "
                f"{data['checks']} | {data['dropped']} | {fmt(data['kib_per_req'])} | {fmt(data['med'])} | {fmt(data['p90'])} | {fmt(data['p95'])} | "
                f"{fmt(data['p99'])} | {fmt(data['max'])} | {fmt(server.get('cpu_mean'))} / {fmt(server.get('cpu_p95'))} / {fmt(server.get('cpu_max'))} | "
                f"{fmt(server.get('rss_max_mb'))} | {fmt(data['postgres'].get('cpu_mean'))} | {fmt(data['platform'].get('cpu_mean'))} | "
                f"{fmt(host.get('busy_mean'))} ({fmt(host.get('steal_mean'))}) |")
        lines.append('')
        if scenario == 'rsvp-burst':
            lines += ['Write consistency after the burst (database snapshot; RSVP events count every accepted write, repeats included):', '',
                      '| Target | k6 saved (303 + `rsvp=saved`) | RSVP events | Guests with ≥ 1 RSVP | Confirmed guests | Allowance 2 → still 2 | Overwritten to 1 |',
                      '|---|---|---|---|---|---|---|']
            for target, label in targets:
                data = row(directory, target, scenario, op)
                if data['state'] != 'ok':
                    continue
                db = data['db']
                match = 'match' if data['saved'] == db.get('rsvp_events') else 'MISMATCH'
                lines.append(f"| {label} | {data['saved']} | {db.get('rsvp_events')} ({match}) | {db.get('guests_with_rsvp_event')} | "
                             f"{db.get('confirmed_guests')} | {db.get('allowance_2')} | {db.get('allowance_1')} |")
            lines.append('')
        if scenario == 'read-spike':
            lines += ['View tracking after the read spike (30-minute dedupe window; every guest should have exactly one VIEW):', '',
                      '| Target | Guests with a VIEW | VIEW events | Duplicate VIEW events | Guests with duplicates | opened_count sum |',
                      '|---|---|---|---|---|---|']
            for target, label in targets:
                data = row(directory, target, scenario, op)
                if data['state'] != 'ok':
                    continue
                db = data['db']
                lines.append(f"| {label} | {db.get('guests_with_view')} | {db.get('view_events')} | {db.get('duplicate_view_events')} | "
                             f"{db.get('guests_with_duplicate_views')} | {db.get('opened_count_sum')} |")
            lines.append('')
    warnings = []
    for scenario, op, _title in SCENARIOS:
        for target, _label in targets:
            data = row(directory, target, scenario, op)
            for warning in data.get('warnings', []) if data['state'] == 'ok' else []:
                if 'matched no process' in warning and warning.startswith('idle-'):
                    continue
                warnings.append(f'{target}/{scenario}: {warning}')
            platform_cpu = data['platform'].get('cpu_mean') if data['state'] == 'ok' else None
            if platform_cpu is not None and platform_cpu > PLATFORM_CONTENTION_PCT:
                warnings.append(f"{target}/{scenario}: contention, platform `next dev` CPU mean {platform_cpu:.1f} % "
                                f"(p95 {fmt(data['platform'].get('cpu_p95'))} %) while measuring; latency and throughput "
                                f"of this row are not comparable to uncontended runs")
    if warnings:
        lines += ['## Sampler warnings', ''] + [f'- {w}' for w in warnings] + ['']
    with open(os.path.join(directory, 'summary.md'), 'w') as handle:
        handle.write('\n'.join(lines))
    print('\n'.join(lines))
    if args.check and invalid:
        sys.exit(f'{invalid} row(s) not valid')


if __name__ == '__main__':
    main()
