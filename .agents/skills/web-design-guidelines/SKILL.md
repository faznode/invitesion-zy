---
name: web-design-guidelines
description: Review UI code for Web Interface Guidelines compliance. Use when asked to "review my UI", "check accessibility", "audit design", "review UX", or "check my site against best practices".
metadata:
  author: vercel
  version: "1.0.0"
  argument-hint: <file-or-pattern>
---

# Web Interface Guidelines

Review files for compliance with Web Interface Guidelines.

## How It Works

1. Read the pinned guidelines in `references/web-interface-guidelines.md`
2. Read the specified files (or prompt user for files/pattern)
3. Check against all rules in the guidelines
4. Output findings in the terse `file:line` format

## Guidelines Source

Invitesion vetting change (SKILLS-LOCK.md): the upstream skill fetched
`vercel-labs/web-interface-guidelines` from the unpinned `main` branch on every
run, which turns a remote file into live agent instructions. The rules are
vendored instead, pinned to commit `434b7f91364665f2f733b310ec54809bf8f37937`
(MIT). Do not fetch the remote copy; refresh the vendored file only through a
re-vetted SKILLS-LOCK.md update.

## Usage

When a user provides a file or pattern argument:
1. Read `references/web-interface-guidelines.md`
2. Read the specified files
3. Apply all rules from the guidelines
4. Output findings using the format specified in the guidelines

If no files specified, ask the user which files to review.
