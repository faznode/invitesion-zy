#!/usr/bin/env python3
"""Replace identifying URL slugs in committed research files with stable tokens (new instructions Step 2, Q-O07).

    python3 -B invitation-research/_tools/safety/pseudonymize-slugs.py            # rewrite affected files in place
    python3 -B invitation-research/_tools/safety/pseudonymize-slugs.py --check    # exit 1 if any slug is left

Rules: slug-rules.json (shared with pseudonymize.mjs, used by discovery and capture so new files are written
already tokenized). Token = "rdct-" + first 10 hex of sha256(lower-case slug): stable across runs and tools,
but a pseudonym, not a secret (a guessed name can be hashed and compared). The token -> slug map is merged
into $INVITESION_PRIVATE_DIR/redaction-map.json (never committed) so queued pages stay capturable.
Scope: every text file under invitation-research/ except _private/. Idempotent.
"""
import argparse
import hashlib
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
RESEARCH = os.path.normpath(os.path.join(HERE, '..', '..'))
RULES = json.load(open(os.path.join(HERE, 'slug-rules.json'), encoding='utf-8'))
PRIVATE = os.environ.get('INVITESION_PRIVATE_DIR') or os.path.join(RESEARCH, '_private')
MAP_PATH = os.path.join(PRIVATE, 'redaction-map.json')
TEXT_EXT = ('.json', '.csv', '.tsv', '.md', '.txt', '.jsonl', '.log')
SELF = {'slug-rules.json', 'pseudonymize.mjs', 'pseudonymize-slugs.py'}


def token_for(slug):
    digest = hashlib.sha256(slug.lower().encode('utf-8')).hexdigest()
    return RULES['tokenPrefix'] + digest[:RULES['tokenHexLength']]


def files():
    for root, dirs, names in os.walk(RESEARCH):
        dirs[:] = [d for d in dirs if d not in ('_private', 'node_modules', '__pycache__')]
        for name in names:
            if name.endswith(TEXT_EXT) and name not in SELF:
                yield os.path.join(root, name)


def rule_pass(text, mapping):
    hits = 0
    for rule in RULES['rules']:
        def repl(m, rule_id=rule['id']):
            token = token_for(m.group(0))
            mapping.setdefault(token, {'label': m.group(0).lower(), 'rule': rule_id})
            return token
        text, n = re.subn(rule['pattern'], repl, text, flags=re.I)
        hits += n
    return text, hits


def exact_pass(text, mapping):
    hits = 0
    for token, entry in mapping.items():
        label = entry['label']
        if len(label) < RULES['exactLabelMinLength']:
            continue
        text, n = re.subn(r'(?<![A-Za-z0-9-])' + re.escape(label) + r'(?![A-Za-z0-9-])', token, text, flags=re.I)
        hits += n
    return text, hits


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--check', action='store_true')
    a = ap.parse_args()
    mapping = json.load(open(MAP_PATH, encoding='utf-8')) if os.path.exists(MAP_PATH) else {}
    texts = {}
    for path in files():
        try:
            texts[path] = open(path, encoding='utf-8').read()
        except (UnicodeDecodeError, OSError):
            continue
    changed = {}
    for path, text in texts.items():
        new, hits = rule_pass(text, mapping)
        if hits:
            changed[path] = [new, hits]
    for path, text in texts.items():
        current = changed[path][0] if path in changed else text
        new, hits = exact_pass(current, mapping)
        if hits:
            changed.setdefault(path, [current, 0])
            changed[path] = [new, changed[path][1] + hits]
    for path, (new, hits) in sorted(changed.items()):
        rel = os.path.relpath(path, RESEARCH)
        if a.check:
            print(f'{rel}: {hits} identifying slug(s)')
            continue
        with open(path, 'w', encoding='utf-8') as fh:
            fh.write(new)
        print(f'{rel}: {hits} replaced')
    if not a.check and changed:
        os.makedirs(PRIVATE, exist_ok=True)
        with open(MAP_PATH, 'w', encoding='utf-8') as fh:
            json.dump(mapping, fh, indent=1)
        print(f'map: {len(mapping)} token(s) in $INVITESION_PRIVATE_DIR/redaction-map.json')
    if not changed:
        print('no identifying slugs found')
    if a.check and changed:
        sys.exit(1)


if __name__ == '__main__':
    main()
