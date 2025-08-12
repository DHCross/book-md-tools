#!/usr/bin/env python3
"""
Promote section titles to Markdown headers, skipping Table of Contents blocks.

- Detects TOC block (from 'Table Of Contents' to first blank line after TOC entries)
- Promotes lines that look like section/part titles to headers, but skips lines inside TOC
- Leaves other lines unchanged

Usage: python3 promote_headers_skip_toc.py <input.md> <output.md>
"""
import sys
import re
from pathlib import Path

def is_section_title(line):
    # Heuristic: Title case, not too long, not all caps, not just a number
    s = line.strip()
    if not s:
        return False
    if len(s) > 80:
        return False
    if s.isupper() or s.islower():
        return False
    if re.match(r"^\d+$", s):
        return False
    # Common section/part/appendix/intro/foreword
    if re.match(r"^(Part [IVX]+|Appendix [A-Z]|Introduction|Foreword|Background|History|Setting, History and Culture|The Culture of Yggsburgh|Local Palatine Nobles|Coin of the Realm|Town Revenues|The Outs|Population|Social Classes|Dress, Style, Appearance and Manners|Common Names in Yggsburgh|Table Of Contents)$", s):
        return True
    # Looks like a title: Title Case, not a sentence
    if s.istitle() and not s.endswith('.'):
        return True
    return False

def promote_headers_skip_toc(lines):
    out = []
    in_toc = False
    for i, line in enumerate(lines):
        s = line.strip()
        # Start TOC block
        if s.lower() == 'table of contents':
            in_toc = True
            out.append(line)
            continue
        # End TOC block: blank line after TOC entries
        if in_toc and not s:
            in_toc = False
            out.append(line)
            continue
        if in_toc:
            out.append(line)
            continue
        # Promote section titles outside TOC
        if is_section_title(line):
            if not s.startswith('#'):
                out.append(f'## {s}\n')
            else:
                out.append(line)
        else:
            out.append(line)
    return out

def main():
    if len(sys.argv) != 3:
        print("Usage: python3 promote_headers_skip_toc.py <input.md> <output.md>")
        sys.exit(1)
    infile, outfile = sys.argv[1:3]
    with open(infile, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    new_lines = promote_headers_skip_toc(lines)
    with open(outfile, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)
    print(f"Promoted headers in {infile} → {outfile}")

if __name__ == "__main__":
    main()
