#!/usr/bin/env python3
"""Redact demo-couple display names in competitor demo captures (D-017 tokenized demos; widened by D-021, session 07).

    python3 -B invitation-research/_tools/safety/redact-demo-names.py           # rewrite affected summaries in place
    python3 -B invitation-research/_tools/safety/redact-demo-names.py --check   # exit 1 if a demo capture shows names

D-021: scope = every summary whose URL carries a token plus every competitor capture of kind "demo" (a page alone cannot
prove its couple is a placeholder); generic role words ("Wanita & Pria", "Groom & Bride") are not names and stay.

Why: D-015 tokenizes identifying URL slugs (Katsudoto per-couple subdomains, the Enviory full-preview couple slug,
Invitato portfolio templates), but the same summaries kept the couple's names in `structure.afterOpen.title` and in
section headings, which undid the pseudonym. Rule: a summary whose `url` carries an `rdct-` token is a pseudonymized
demo. Its name words are the runs of Capitalized words directly left and right of the "&" in the page title (before
" — ", " | ", " – " or " - "), so "The Wedding of A & B by Vendor" yields only A and B. They become "[name]" in the
title, every section heading and both button lists, and any @handle containing one of them becomes "@[handle]".
Structural words ("Save the Date", "Akad Nikah") stay, so section sequences remain usable. Idempotent. Mirrored for new
captures by `redactDemoNames` in pseudonymize.mjs (capture.mjs calls it when a token was resolved): keep both in step.
Limit: names are derived from the page's own title; a name that never appears in the title is not detected.
"""
import argparse
import glob
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
RESEARCH = os.path.normpath(os.path.join(HERE, '..', '..'))
TOKEN = re.compile(r'rdct-[0-9a-f]{10}')
TITLE_SPLIT = re.compile(r'\s+[—|–-]\s+')
NAME = re.compile(r"[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ'’]+")
HANDLE = re.compile(r'@[A-Za-z0-9_.]+')
LETTER = "A-Za-zÀ-ÖØ-öø-ÿ"
MARK = '[name]'
OWN_PRODUCT = 'invitesion'
GENERIC_ROLE_WORDS = {'pria', 'wanita', 'groom', 'bride', 'mempelai', 'nama', 'tamu', 'putra', 'putri', 'perempuan', 'mr', 'mrs', 'miss'}


def in_scope(summary):
    """D-017: tokenized (pseudonymized) captures. D-021: also every competitor demo, because a page alone cannot prove
    that its couple is a placeholder. Marketing/catalog pages and our own product's captures are left as captured."""
    if TOKEN.search(str(summary.get('url') or '')):
        return True
    return summary.get('kind') == 'demo' and summary.get('competitor') != OWN_PRODUCT


def name_words(title):
    head = TITLE_SPLIT.split(title or '', maxsplit=1)[0]
    if '&' not in head:
        return []
    left, right = head.split('&', 1)
    names = []
    for word in reversed(left.split()):
        if not NAME.fullmatch(word):
            break
        names.append(word)
    for word in right.split():
        if not NAME.fullmatch(word):
            break
        names.append(word)
    return sorted({w for w in names if w.lower() not in GENERIC_ROLE_WORDS}, key=len, reverse=True)


def redact(text, words):
    if not isinstance(text, str):
        return text
    for word in words:
        text = re.sub(rf'(?<![{LETTER}]){re.escape(word)}(?![{LETTER}])', MARK, text, flags=re.I)
    lowered = [w.lower() for w in words if len(w) >= 3]
    return HANDLE.sub(lambda m: '@[handle]' if any(w in m.group(0).lower() for w in lowered) else m.group(0), text)


def redact_summary(summary):
    """Redact in place; return the (old, new) string pairs that changed."""
    structure = summary.get('structure') or {}
    after = structure.get('afterOpen') or {}
    before = structure.get('beforeOpen') or {}
    words = name_words(after.get('title'))
    pairs = []
    if not words:
        return pairs

    def apply(value):
        new = redact(value, words)
        if new != value:
            pairs.append((value, new))
        return new

    after['title'] = apply(after.get('title'))
    for section in after.get('sections') or []:
        section['heading'] = apply(section.get('heading'))
    for block in (after, before):
        if isinstance(block.get('buttons'), list):
            block['buttons'] = [apply(b) for b in block['buttons']]
    return pairs


def rewrite_text(text, pairs, expected):
    """Swap the changed JSON string literals in the original text, so the capture's own serialization (number formats,
    key order) is untouched; refuse to write unless the result parses to exactly the redacted summary."""
    for old, new in pairs:
        text = text.replace(json.dumps(old, ensure_ascii=False), json.dumps(new, ensure_ascii=False))
    if json.loads(text) != expected:
        raise ValueError('literal replacement did not reproduce the redacted summary')
    return text


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--check', action='store_true')
    a = ap.parse_args()
    flagged = 0
    for path in sorted(glob.glob(os.path.join(RESEARCH, 'raw', '*', 'C-*.json'))):
        with open(path, encoding='utf-8') as fh:
            text = fh.read()
        summary = json.loads(text)
        if not in_scope(summary):
            continue
        rel = os.path.relpath(path, RESEARCH)
        if a.check:
            words = name_words(((summary.get('structure') or {}).get('afterOpen') or {}).get('title'))
            if words:
                flagged += 1
                print(f'{rel}: page title still names the demo couple ({len(words)} name word(s))')
            continue
        pairs = redact_summary(summary)
        if pairs:
            flagged += 1
            with open(path, 'w', encoding='utf-8') as fh:
                fh.write(rewrite_text(text, pairs, summary))
            print(f'{rel}: {len(pairs)} field(s) redacted')
    if not flagged:
        print('no demo names in demo captures')
    if a.check and flagged:
        sys.exit(1)


if __name__ == '__main__':
    main()
