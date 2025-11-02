#!/usr/bin/env python3
"""
Convert Nation Builder bold headings to proper ATX Markdown hierarchy.

Pattern detection:
- H1: Existing "# CHAPTER ..." (leave as-is)
- H2: **ALL_CAPS_SECTION_HEADING** (convert to ##)
- H3: **Title Case Subsection** (convert to ###)
- H4: **_Example (...)_** or **_Sidebar Label_** (convert to ####)

Detection heuristics:
- All-caps + underscores typically = H2 (e.g., **PLACE_NAMES**, **PHYSICAL_CHARACTERISTICS**)
- Title case with no trailing colon = H2 subsection label (e.g., **Cities**, **Walls**)
- Title case + colon = H3 (e.g., **Access to Resources:**, **Law Enforcement:**)
- Italic markers (_Example_) = H4 (sidebar/example blocks)

Usage:
  python scripts/convert_to_markdown_hierarchy.py input.md -o output.md

Notes:
- Preserves exact formatting except heading conversion
- Idempotent: won't double-convert already converted headings
- Skips lines that are already ATX headings
"""
from __future__ import annotations
import argparse
import re
import sys
from pathlib import Path


# Detect existing ATX headings
ATX_RE = re.compile(r"^#{1,6}\s")

# Match bold text: **text**
BOLD_RE = re.compile(r"^\s*\*\*(.+?)\*\*\s*$")

# Italic indicators (sidebar/example markers)
ITALIC_MARKER_RE = re.compile(r"^\s*\*\*_[^_]+_\*\*")


def detect_heading_level(bold_text: str) -> int | None:
    """
    Detect which heading level a bold line should be based on text patterns.
    Returns 2, 3, 4, or None (if not a heading).
    """
    # H4: Italic markers like _Example (...)_ or _Sidebar_
    if bold_text.startswith("_") and bold_text.endswith("_"):
        return 4
    
    # Check if all caps (H2 section heading)
    # ALL_CAPS with optional underscores and numbers
    if bold_text.isupper() or (
        bold_text.replace("_", "").replace(" ", "").replace("-", "").isupper()
    ):
        # But not if it's a short common word (City, Region, etc.)
        # Length heuristic: major sections tend to be longer
        if len(bold_text) > 5 or "_" in bold_text:
            return 2
    
    # H3: Title case ending with colon (subsection headers like "Access to Resources:")
    if bold_text.endswith(":"):
        return 3
    
    # H3: Title case, common subsection names (Cities, Walls, Gates, Regions, etc.)
    common_h3_names = {
        "Cities", "Regions", "Rivers", "Bodies of Water", "Walls", "Gates", "Towers",
        "Buildings", "Streets", "Troops", "Lighting", "Guards", "Soldiers", "Weapons",
        "Weapon and Spell Restrictions", "Access to Resources", "Law Enforcement",
        "Building Construction", "Special Materials", "Civil Structures", "Military Structures",
        "Religious Structures", "Governmental and Public Buildings and Areas",
        "Buying and Constructing Buildings", "Examples", "Example",
        "Working Animals", "Types of Government", "Primitive Government Forms",
        "Types of State", "Demographics", "Villages and Smaller Communities",
        "Towns", "Cities", "Physical Characteristics of Communities",
        "Above and Beneath the Streets", "Encounter Chart", "Perils of Overland Travel"
    }
    
    if bold_text in common_h3_names or (
        bold_text and
        bold_text[0].isupper() and  # Title case
        not bold_text.isupper() and  # Not ALL_CAPS
        len(bold_text) < 50  # Not too long
    ):
        return 3
    
    # Default: if it's bold and none of the above, treat longer ones as H2, shorter as H3
    if len(bold_text) > 25:
        return 2
    
    return 3


def convert_stream(lines: list[str]) -> list[str]:
    """
    Convert bold markdown headings to ATX hierarchy.
    """
    out: list[str] = []
    
    for raw in lines:
        line = raw.rstrip("\n")
        
        # Skip if already an ATX heading
        if ATX_RE.match(line):
            out.append(line + "\n")
            continue
        
        # Check if it's a bold heading
        m = BOLD_RE.match(line)
        if not m:
            out.append(line + "\n")
            continue
        
        bold_text = m.group(1)
        level = detect_heading_level(bold_text)
        
        if level is None:
            # Not a heading, leave as-is
            out.append(line + "\n")
            continue
        
        # Convert to ATX heading
        hashes = "#" * level
        atx_line = f"{hashes} {bold_text}"
        out.append(atx_line + "\n")
    
    return out


def main() -> None:
    ap = argparse.ArgumentParser(
        description="Convert bold Markdown headings to ATX hierarchy (##, ###, ####)."
    )
    ap.add_argument("input", nargs="?", help="Input file (default: stdin)")
    ap.add_argument("-o", "--output", help="Output file (default: stdout)")
    ap.add_argument(
        "-i", "--in-place", action="store_true", help="Modify input file in place"
    )
    args = ap.parse_args()

    if args.in_place and not args.input:
        ap.error("--in-place requires an input file")

    data: list[str]
    if args.input:
        data = Path(args.input).read_text(encoding="utf-8", errors="ignore").splitlines(
            True
        )
    else:
        data = sys.stdin.read().splitlines(True)

    converted = convert_stream(data)

    if args.in_place and args.input:
        Path(args.input).write_text("".join(converted), encoding="utf-8")
    elif args.output:
        Path(args.output).write_text("".join(converted), encoding="utf-8")
    else:
        sys.stdout.write("".join(converted))


if __name__ == "__main__":
    main()
