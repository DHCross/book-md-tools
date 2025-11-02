#!/usr/bin/env python3
"""
Strip leading numeric tags like <1>, <2>, <3> in multiple representations from the start of lines.

- Removes backticked tags: `'<n>'`
- Removes raw tags: <n>
- Removes HTML comment tags: <!--n-->
- Removes bracket tags: [n]
- Safe to run multiple times (idempotent)
- Applies to any line start, including headings (e.g., "# <2> Title")

Usage:
  python scripts/strip_numeric_tags.py input.txt -o clean.txt
  python scripts/strip_numeric_tags.py -i input.txt   # in place
  cat input.txt | python scripts/strip_numeric_tags.py > clean.txt
"""
from __future__ import annotations
import argparse
import re
import sys
from pathlib import Path

TAG_START_RE = re.compile(r"^\s*(?:`?<\d+>`?|<!--\s*\d+\s*-->|\[\d+\])\s*")
# Match a tag immediately following ATX heading markers, e.g., '# <2> Title' or '## `<2>` Title'
TAG_AFTER_ATX_RE = re.compile(r"^(?P<Hashes>#{1,6})\s*(?:`?<\d+>`?|<!--\s*\d+\s*-->|\[\d+\])\s*(?P<Rest>.*)$")


def strip_stream(lines: list[str]) -> list[str]:
    out: list[str] = []
    for raw in lines:
        line = raw.rstrip("\n")
        # First, remove tag at absolute line start (plain text lines)
        tmp = TAG_START_RE.sub("", line, count=1)
        # Then, if it's an ATX heading with a tag right after hashes, remove that
        m = TAG_AFTER_ATX_RE.match(tmp)
        if m:
            # Preserve trailing whitespace from Rest
            rest = m.group('Rest')
            tmp = f"{m.group('Hashes')} {rest}"
        out.append(tmp + "\n")
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description="Strip leading numeric tags (<n>) from lines.")
    ap.add_argument("input", nargs="?", help="Input file (default: stdin)")
    ap.add_argument("-o", "--output", help="Output file (default: stdout)")
    ap.add_argument("-i", "--in-place", action="store_true", help="Modify the input file in place")
    args = ap.parse_args()

    if args.in_place and not args.input:
        ap.error("--in-place requires an input file")

    data: list[str]
    if args.input:
        data = Path(args.input).read_text(encoding="utf-8", errors="ignore").splitlines(True)
    else:
        data = sys.stdin.read().splitlines(True)

    cleaned = strip_stream(data)

    if args.in_place and args.input:
        Path(args.input).write_text("".join(cleaned), encoding="utf-8")
    elif args.output:
        Path(args.output).write_text("".join(cleaned), encoding="utf-8")
    else:
        sys.stdout.write("".join(cleaned))


if __name__ == "__main__":
    main()
