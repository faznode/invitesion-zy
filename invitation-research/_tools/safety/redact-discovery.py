#!/usr/bin/env python3
"""Drop customer-showcase links from committed discovery files (Q-O07, decided in session 04).

    python3 invitation-research/_tools/safety/redact-discovery.py           # rewrite raw/*/discovery-*.json in place
    python3 .../redact-discovery.py --check                                        # exit 1 if any file still holds such links

Vendor "result"/showcase pages (e.g. Indoinvite /hasil/<id>?contoh=1) may be real customers' invitations.
They are never captured (R1), so their URLs and labels are not kept either: only a count remains
(`customerShowcaseDropped`, R3 minimization). Same rule as CUSTOMER_SHOWCASE in discover-demos.mjs. Idempotent.
"""
import argparse
import glob
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
RESEARCH = os.path.normpath(os.path.join(HERE, '..', '..'))
CUSTOMER_SHOWCASE = re.compile(r'(/hasil/|[?&]contoh=)', re.I)


def href_of(entry):
    return entry.get('href', '') if isinstance(entry, dict) else str(entry)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--check', action='store_true')
    a = ap.parse_args()
    leftover = 0
    for path in sorted(glob.glob(os.path.join(RESEARCH, 'raw', '*', 'discovery-*.json'))):
        with open(path) as fh:
            data = json.load(fh)
        demos = data.get('demos') or []
        candidates = data.get('catalogCandidates') or []
        drop_demos = [d for d in demos if CUSTOMER_SHOWCASE.search(href_of(d))]
        drop_candidates = [c for c in candidates if CUSTOMER_SHOWCASE.search(href_of(c))]
        found = len(drop_demos) + len(drop_candidates)
        if not found:
            continue
        leftover += found
        if a.check:
            print(f'{os.path.relpath(path, RESEARCH)}: {found} customer-showcase links')
            continue
        data['demos'] = [d for d in demos if d not in drop_demos]
        data['catalogCandidates'] = [c for c in candidates if c not in drop_candidates]
        data['customerShowcaseDropped'] = int(data.get('customerShowcaseDropped') or 0) + found
        with open(path, 'w') as fh:
            json.dump(data, fh, ensure_ascii=False, indent=1)
        print(f'{os.path.relpath(path, RESEARCH)}: dropped {found} ({len(drop_demos)} demos, {len(drop_candidates)} catalog candidates)')
    if a.check and leftover:
        sys.exit(1)
    if not leftover:
        print('no customer-showcase links found')


if __name__ == '__main__':
    main()
