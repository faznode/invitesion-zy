#!/usr/bin/env python3
"""Per-second CPU % (of one core) and RSS for process groups, plus host-wide busy and steal CPU, from /proc deltas.

    python3 -B sample-proc.py --out run.json --until-file /tmp/k6.done --seconds 120 \
        --group server=cwd:/vercel/share/work/app --group postgres=postgres --group platform-dev=cwd:/vercel/share/v0-project

A group matches every process whose command line contains its pattern, or, for `cwd:/path`, every process whose working
directory is exactly /path (two `next-server` processes with identical command lines are told apart this way).

Session 09 correctness fixes (the s08 version summed group ticks and subtracted totals, so a process that exited between
two samples produced negative CPU and a process that appeared was charged its whole lifetime):
- deltas are per PID; a PID first seen in an interval is charged only if it started inside that interval;
- ticks of a process that exits inside an interval are lost (small undercount, never negative);
- host busy/steal % come from /proc/stat, so contention from unmatched processes is visible;
- sampling stops when --until-file appears (the runner touches it when k6 exits) or after --seconds;
- implausible values (CPU < 0 or above the core count) are listed under "warnings" and the exit code is 3.
"""
import argparse
import json
import os
import time

TICKS = os.sysconf('SC_CLK_TCK')
PAGE_KB = os.sysconf('SC_PAGE_SIZE') // 1024
CORES = os.cpu_count() or 1


def uptime_ticks():
    with open('/proc/uptime') as handle:
        return float(handle.read().split()[0]) * TICKS


def host_cpu():
    with open('/proc/stat') as handle:
        fields = [int(v) for v in handle.readline().split()[1:]]
    idle = fields[3] + fields[4]
    steal = fields[7] if len(fields) > 7 else 0
    total = sum(fields[:8])
    return total, idle, steal


def processes():
    for pid in os.listdir('/proc'):
        if not pid.isdigit():
            continue
        try:
            with open(f'/proc/{pid}/cmdline', 'rb') as handle:
                cmd = handle.read().replace(b'\0', b' ').decode(errors='replace').strip()
            with open(f'/proc/{pid}/stat') as handle:
                fields = handle.read().rsplit(')', 1)[1].split()
            ticks = int(fields[11]) + int(fields[12])
            start = int(fields[19])
            rss_kb = int(fields[21]) * PAGE_KB
            try:
                cwd = os.readlink(f'/proc/{pid}/cwd')
            except OSError:
                cwd = ''
            yield int(pid), cmd, cwd, ticks, start, rss_kb
        except (FileNotFoundError, ProcessLookupError, IndexError, ValueError, PermissionError):
            continue


def matches(pattern, cmd, cwd):
    return cwd == pattern[4:] if pattern.startswith('cwd:') else pattern in cmd


def snapshot(groups):
    found = {name: {} for name in groups}
    for pid, cmd, cwd, ticks, start, rss in processes():
        if 'sample-proc.py' in cmd:
            continue
        for name, pattern in groups.items():
            if matches(pattern, cmd, cwd):
                found[name][pid] = (ticks, start, rss)
    return found


def pct(values, q):
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int(round(q * (len(ordered) - 1))))] if ordered else 0


def stats(values):
    return {'mean': round(sum(values) / len(values), 1) if values else 0, 'p95': pct(values, 0.95), 'max': max(values or [0])}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', required=True)
    parser.add_argument('--seconds', type=int, default=60, help='upper bound on sampling time')
    parser.add_argument('--until-file', help='stop as soon as this file exists')
    parser.add_argument('--group', action='append', default=[], help='name=pattern')
    args = parser.parse_args()
    groups = dict(g.split('=', 1) for g in args.group)
    series = {name: {'cpu_pct': [], 'rss_mb': [], 'pids': []} for name in groups}
    host = {'busy_pct': [], 'steal_pct': []}
    previous, prev_up, prev_host, last = snapshot(groups), uptime_ticks(), host_cpu(), time.monotonic()
    started = time.time()
    for _ in range(args.seconds):
        time.sleep(1)
        current, now_up, now_host, now = snapshot(groups), uptime_ticks(), host_cpu(), time.monotonic()
        elapsed = now - last
        for name in groups:
            delta = 0
            for pid, (ticks, start, _rss) in current[name].items():
                if pid in previous[name] and previous[name][pid][1] == start:
                    delta += max(0, ticks - previous[name][pid][0])
                elif start >= prev_up:
                    delta += ticks
            series[name]['cpu_pct'].append(round(100 * delta / TICKS / elapsed, 1))
            series[name]['rss_mb'].append(round(sum(v[2] for v in current[name].values()) / 1024, 1))
            series[name]['pids'].append(len(current[name]))
        total, idle, steal = (now_host[i] - prev_host[i] for i in range(3))
        if total > 0:
            host['busy_pct'].append(round(100 * CORES * (total - idle) / total, 1))
            host['steal_pct'].append(round(100 * CORES * steal / total, 1))
        previous, prev_up, prev_host, last = current, now_up, now_host, now
        if args.until_file and os.path.exists(args.until_file):
            break
    warnings = []
    summary = {}
    for name, data in series.items():
        cpu, rss = data['cpu_pct'], data['rss_mb']
        bad = [v for v in cpu if v < 0 or v > 100 * CORES * 1.05]
        if bad:
            warnings.append(f'{name}: {len(bad)} implausible CPU samples {bad[:5]}')
        if not any(data['pids']):
            warnings.append(f'{name}: pattern {groups[name]!r} matched no process')
        cpu_stats = stats(cpu)
        summary[name] = {'cpu_mean': cpu_stats['mean'], 'cpu_p95': cpu_stats['p95'], 'cpu_max': cpu_stats['max'],
                         'rss_mean_mb': stats(rss)['mean'], 'rss_max_mb': max(rss or [0]), 'max_pids': max(data['pids'] or [0])}
    busy, steal = stats(host['busy_pct']), stats(host['steal_pct'])
    summary['host'] = {'cores': CORES, 'busy_mean': busy['mean'], 'busy_p95': busy['p95'], 'busy_max': busy['max'],
                       'steal_mean': steal['mean'], 'steal_max': steal['max']}
    record = {'groups': groups, 'samples': len(host['busy_pct']), 'seconds': round(time.time() - started, 1),
              'stopped_by_file': bool(args.until_file and os.path.exists(args.until_file)),
              'summary': summary, 'warnings': warnings, 'series': series, 'host_series': host}
    with open(args.out, 'w') as handle:
        json.dump(record, handle, indent=1)
    for name, values in summary.items():
        if name == 'host':
            print(f'host: busy mean {values["busy_mean"]} % p95 {values["busy_p95"]} % max {values["busy_max"]} % of {CORES * 100} % | steal mean {values["steal_mean"]} % max {values["steal_max"]} %')
        else:
            print(f'{name}: cpu mean {values["cpu_mean"]} % p95 {values["cpu_p95"]} % max {values["cpu_max"]} % | rss mean {values["rss_mean_mb"]} MB max {values["rss_max_mb"]} MB | pids {values["max_pids"]}')
    for warning in warnings:
        print(f'WARNING {warning}')
    print(f'samples {record["samples"]} over {record["seconds"]} s (stopped by k6 end: {record["stopped_by_file"]})')
    raise SystemExit(3 if any('implausible' in w for w in warnings) else 0)


if __name__ == '__main__':
    main()
