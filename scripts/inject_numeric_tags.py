#!/usr/bin/env python3
"""
Inject numeric hierarchy tags into Markdown ATX headings using robust regex anchors.

- Detects headings starting with one or more '#'
- Inserts a numeric tag that matches the heading depth: <1> for '#', <2> for '##', etc.
- Supports multiple tag representations to survive picky renderers:
  * backtick (default): `'<n>'` e.g., `<1>` inside backticks
  * raw: `<n>`
  * comment: `<!--n-->`
  * bracket: `[n]`
- Idempotent: if a supported tag is already present, it is normalized to the selected form
- Skips fenced code blocks

Usage:
  python scripts/inject_numeric_tags.py input.md -o bridge.txt
  python scripts/inject_numeric_tags.py input.md --form comment -o bridge.txt
  cat input.md | python scripts/inject_numeric_tags.py > bridge.txt

Notes:
- This is intended to create a plain-text/'bridge' file for layout import (Word/InDesign).
- For IA Writer or GitHub rendering safety, prefer --form backtick (default) or --form comment.
"""
from __future__ import annotations
import argparse
import re
import sys
from pathlib import Path

HEADING_RE = re.compile(r"^(?P<hashes>#{1,6})\s*(?P<rest>.*)$")
FENCE_RE = re.compile(r"^\s*(```|~~~)")
# Supported existing tag forms at line start (optionally backticked), e.g. ` <1> ` or <!--1--> or [1]
TAG_PREFIX_RE = re.compile(r"^(?P<tag>\s*(?:`?<\d+>`?|<!--\s*\d+\s*-->|\[\d+\])\s*)")


def make_tag(level: int, form: str) -> str:
    if form == "raw":
        return f"<{level}>"
    if form == "comment":
        return f"<!--{level}-->"
    if form == "bracket":
        return f"[{level}]"
    # default backtick
    return f"`<{level}>`"


def inject_stream(lines: list[str], form: str, max_level: int | None) -> list[str]:
    out: list[str] = []
    in_code = False
    for raw in lines:
        line = raw.rstrip("\n")
        # toggle fenced code blocks
        if FENCE_RE.match(line):
            in_code = not in_code
            out.append(line + "\n")
            continue
        if in_code:
            out.append(line + "\n")
            continue

        m = HEADING_RE.match(line)
        if not m:
            out.append(line + "\n")
            continue

        hashes = m.group("hashes")
        rest = m.group("rest")
        level = len(hashes)
        if max_level is not None:
            level = min(level, max_level)

        # If a tag already exists at start of rest, strip it first (normalize), then re-add in desired form
        rest_stripped = rest.lstrip()
        rest_norm = TAG_PREFIX_RE.sub("", rest_stripped, count=1).rstrip()  # Strip trailing before adding back
        tag = make_tag(level, form)
        # Preserve trailing whitespace from original rest
        trailing = rest[len(rest.rstrip()):]
        # Build new line: hashes, space, tag, space, content, original trailing
        new_line = f"{hashes} {tag} {rest_norm}{trailing}"
        out.append(new_line + "\n")
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description="Inject <n> tags into ATX Markdown headings using regex anchors.")
    ap.add_argument("input", nargs="?", help="Input Markdown file (default: stdin)")
    ap.add_argument("-o", "--output", help="Output file (default: stdout)")
    ap.add_argument("--form", choices=["backtick", "raw", "comment", "bracket"], default="backtick", help="Tag representation to insert (default: backtick)")
    ap.add_argument("--max-level", type=int, default=None, help="Cap heading level at this number (e.g., 4)")
    args = ap.parse_args()

    data: list[str]
    if args.input:
        data = Path(args.input).read_text(encoding="utf-8", errors="ignore").splitlines(True)
    else:
        data = sys.stdin.read().splitlines(True)

    tagged = inject_stream(data, args.form, args.max_level)

    if args.output:
        Path(args.output).write_text("".join(tagged), encoding="utf-8")
    else:
        sys.stdout.write("".join(tagged))


if __name__ == "__main__":
    main()
