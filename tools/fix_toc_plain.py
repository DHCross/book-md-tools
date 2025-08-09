#!/usr/bin/env python3
"""
Fix Table of Contents (Plain Text)
=================================

Normalizes a plain-text Table of Contents section that lacks dotted leaders.
- Detects the TOC block starting with "Table Of Contents" (with or without markdown header)
- Standardizes entries to `Title .... page` with consistent width
- Repairs minor numbering spacing like `1.Townbridge` -> `1. Townbridge`, `90:` -> `90:`
- Skips stray isolated page numbers on their own line
- Leaves non-matching lines unchanged

Provides a function API for use in the pipeline, and a simple CLI.
"""

from __future__ import annotations
import re
import sys
import argparse
from pathlib import Path
from typing import Tuple

START_MARKERS = {
    "## Table Of Contents",
    "# Table Of Contents",
    "Table Of Contents",
}

END_HINT_PREFIXES = (
    "The Table of Contents will likely",  # explicit note appearing after TOC
)

# Heuristics to detect the beginning of main content after TOC if no explicit hint
POSSIBLE_CONTENT_STARTS = (
    "Castles Zagyg:",
    "Foreword",
    "Part I",
    "Introduction",
)

def _standardize_numbering(title: str) -> str:
    # Fix patterns like '1.Townbridge' -> '1. Townbridge'
    title = re.sub(r'^(\d+)\.(\S)', r"\1. \2", title)
    # Fix patterns like '90:' ensure space after colon only if followed by word
    title = re.sub(r'^(\d+):\s*(\S)', r"\1: \2", title)
    return title


def _format_entry(title: str, page: str, total_width: int = 70) -> str:
    title = _standardize_numbering(title.strip())
    page = page.strip()
    # Limit extremes
    if len(title) > total_width - 10:
        title = title[: total_width - 10].rstrip()
    dots_needed = total_width - len(title) - len(page) - 2  # spaces around dots
    if dots_needed < 5:
        dots_needed = 5
    elif dots_needed > 50:
        dots_needed = 50
    dots = "." * dots_needed
    return f"{title} {dots} {page}"


def fix_toc_plain(content: str) -> Tuple[str, int]:
    lines = content.splitlines()
    n = len(lines)

    # Find start
    start_idx = -1
    for i, ln in enumerate(lines):
        if ln.strip() in START_MARKERS:
            start_idx = i
            break
    if start_idx == -1:
        # Try looser match
        for i, ln in enumerate(lines):
            if ln.strip().lower() == "table of contents":
                start_idx = i
                break
    if start_idx == -1:
        return content, 0

    # Find end
    end_idx = -1
    for j in range(start_idx + 1, n):
        s = lines[j].strip()
        if any(s.startswith(pfx) for pfx in END_HINT_PREFIXES):
            end_idx = j
            break
        # Heuristic: stop when we hit a likely content header after a blank line
        if s and any(s.startswith(p) for p in POSSIBLE_CONTENT_STARTS):
            end_idx = j
            break
    if end_idx == -1:
        # If we never found an end, bail to avoid corrupting content
        return content, 0

    # Build new TOC block
    raw_block = lines[start_idx + 1:end_idx]
    fixed_entries = []
    changes = 0

    for raw in raw_block:
        s = raw.strip()
        if not s:
            continue
        # Skip isolated page numbers like '2'
        if re.fullmatch(r"\d{1,3}", s):
            # Only skip when previous entry seems complete already
            continue

        # Collapse internal spacing
        s_norm = re.sub(r"\s+", " ", s)
        # Detect title + page at end
        m = re.match(r"^(.*?\S)\s+(\d{1,3})$", s_norm)
        if m:
            title, page = m.group(1), m.group(2)
            fixed_entries.append(_format_entry(title, page))
            if s != fixed_entries[-1]:
                changes += 1
            continue

        # No trailing page number; keep as-is, but clean numbering spacing
        std_title = _standardize_numbering(s_norm)
        fixed_entries.append(std_title)
        if std_title != s:
            changes += 1

    # Compose new content
    new_lines = list(lines)
    # Replace the start marker with a Markdown H2 to be consistent
    new_lines[start_idx] = "## Table Of Contents"
    # Splice the fixed TOC block
    new_lines[start_idx + 1:end_idx] = fixed_entries + [""]

    return "\n".join(new_lines), changes


def main():
    ap = argparse.ArgumentParser(description="Normalize plain-text Table of Contents in a document")
    ap.add_argument("input", type=Path)
    ap.add_argument("output", type=Path, nargs="?")
    args = ap.parse_args()

    input_path = args.input
    output_path = args.output or input_path.with_name(f"{input_path.stem}_toc{input_path.suffix}")

    text = input_path.read_text(encoding="utf-8")
    new_text, changes = fix_toc_plain(text)
    output_path.write_text(new_text, encoding="utf-8")
    print(f"✅ TOC normalization complete. Changes: {changes}")
    print(f"📁 Output: {output_path}")


if __name__ == "__main__":
    sys.exit(main())
