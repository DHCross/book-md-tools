#!/usr/bin/env python3
"""
Remove isolated page numbers from plain text/Markdown.

This targets lines that contain only a page number (possibly surrounded by dashes or en dashes),
which often come from PDF headers/footers during OCR or conversion.

Conservative heuristics:
- Line must match ONLY a number (optionally wrapped with simple separators like dashes/bullets).
- AND be surrounded by blank lines on both sides (or at file start/end with the present neighbor blank).

Examples removed:
- "\n\n4\n\n"
- "\n\n— 45 —\n\n"
- "\n\n- 7 -\n\n"

Examples NOT removed:
- "1. Introduction"
- "# 2"
- "Table 3"
- "2" when immediately adjacent to text on either side (to avoid false positives)

Returns a tuple: (cleaned_text, removed_count, removed_lines)
"""
from __future__ import annotations
import re
from typing import List, Tuple

# Match lines that are ONLY a number wrapped by optional whitespace and simple wrappers
_PAGE_NUM_RE = re.compile(r"^\s*[\-–—•*_~]*\s*(\d{1,4})\s*[\-–—•*_~]*\s*$")


def _is_blank(s: str) -> bool:
    return s.strip() == ""


def remove_isolated_page_numbers(text: str) -> Tuple[str, int, List[str]]:
    lines = text.splitlines()
    kept: List[str] = []
    removed: List[str] = []

    n = len(lines)
    for i, line in enumerate(lines):
        if _PAGE_NUM_RE.match(line):
            prev_blank = True
            next_blank = True
            if i > 0:
                prev_blank = _is_blank(lines[i - 1])
            if i < n - 1:
                next_blank = _is_blank(lines[i + 1])
            # Only remove when the number is visually isolated between blank lines
            if prev_blank and next_blank:
                removed.append(line)
                continue
        kept.append(line)

    return ("\n".join(kept), len(removed), removed)


if __name__ == "__main__":
    import sys
    data = sys.stdin.read()
    cleaned, n, removed = remove_isolated_page_numbers(data)
    sys.stdout.write(cleaned)
    sys.stderr.write(f"Removed isolated page numbers: {n}\n")
