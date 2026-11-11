#!/usr/bin/env python3
"""html-structure-diff.py — compare the <main> element of rendered pages by elements, attributes and text.

    python3 -B invitation-research/_tools/ops/html-structure-diff.py BEFORE.html AFTER.html [--ignore-attr class ...]

Prints one line per element (tag plus sorted attributes) and per text node, indented by depth, for both documents and
exits 0 when they match, 1 with a unified diff otherwise. Built for B-030: the legacy layout must keep its elements,
attributes and text when the renderer is split into shared blocks. Ignore `class` and `style` only when a separate,
tested change accounts for them (B-016 palette tokens); scripts, the RSC payload and everything outside <main> are
not compared.
"""
import argparse
import difflib
import sys
from html.parser import HTMLParser

VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'}


class MainOutline(HTMLParser):
    def __init__(self, ignored):
        super().__init__(convert_charrefs=True)
        self.ignored = set(ignored)
        self.inside = False
        self.depth = 0
        self.lines = []

    def handle_starttag(self, tag, attrs):
        if tag == 'main' and not self.inside:
            self.inside, self.depth = True, 0
        if not self.inside:
            return
        kept = ' '.join(f'{name}="{value}"' for name, value in sorted(attrs) if name not in self.ignored)
        self.lines.append('  ' * self.depth + f'<{tag}{" " + kept if kept else ""}>')
        if tag not in VOID:
            self.depth += 1

    def handle_endtag(self, tag):
        if not self.inside or tag in VOID:
            return
        self.depth -= 1
        if tag == 'main' and self.depth == 0:
            self.inside = False

    def handle_data(self, data):
        if self.inside and data.strip():
            self.lines.append('  ' * self.depth + ' '.join(data.split()))


def outline(path, ignored):
    parser = MainOutline(ignored)
    with open(path, encoding='utf-8') as handle:
        parser.feed(handle.read())
    if not parser.lines:
        sys.exit(f'{path}: no <main> element')
    return parser.lines


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('before')
    parser.add_argument('after')
    parser.add_argument('--ignore-attr', action='append', default=[], help='attribute to leave out of the comparison (repeatable)')
    args = parser.parse_args()
    before, after = outline(args.before, args.ignore_attr), outline(args.after, args.ignore_attr)
    diff = list(difflib.unified_diff(before, after, args.before, args.after, lineterm='', n=2))
    if diff:
        print('\n'.join(diff))
        return 1
    print(f'match: {len(before)} outline lines (ignored attributes: {", ".join(args.ignore_attr) or "none"})')
    return 0


if __name__ == '__main__':
    sys.exit(main())
