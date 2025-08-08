#!/usr/bin/env python3
"""
Fix Table of Contents Formatting
===============================

This script standardizes the spacing and dotted lines in table of contents entries
to create a uniform, professional appearance.

Usage:
    python fix_table_of_contents.py input_file.md output_file.md
"""

import sys
import argparse
import re
from pathlib import Path

def fix_table_of_contents(input_file, output_file):
    """Fix table of contents formatting for uniform appearance."""
    
    try:
        # Read the input file
        with open(input_file, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        
        fixed_lines = []
        fixes_made = 0
        in_toc = False
        
        for line in lines:
            stripped = line.strip()
            
            # Detect start and end of table of contents
            if stripped == "## Table Of Contents":
                in_toc = True
                fixed_lines.append(line)
                continue
            elif in_toc and stripped.startswith("# Part I:"):
                in_toc = False
                fixed_lines.append(line)
                continue
            elif in_toc and stripped == "Castles Zagyg: Yggsburgh":
                in_toc = False
                fixed_lines.append(line)
                continue
            
            # Process TOC entries if we're in the table of contents
            if in_toc and ('..................' in line or '............' in line or line.strip().endswith(tuple('0123456789'))):
                # Look for any pattern with dots and a number at the end
                # Match entries like "Title ................... 123" or "Title ............. 45"
                
                # Use regex to find entries with dots and trailing numbers
                pattern = r'^(.+?)\s+\.{3,}\s+(\d+)\s*$'
                match = re.match(pattern, line.strip())
                
                if match:
                    title = match.group(1).strip()
                    page_num = match.group(2).strip()
                    
                    # Create standardized entry with consistent spacing
                    # Calculate dots needed for uniform appearance
                    total_width = 80  # Target total line width
                    dots_needed = total_width - len(title) - len(page_num) - 2  # 2 for spaces
                    
                    # Ensure minimum and maximum number of dots
                    if dots_needed < 3:
                        dots_needed = 3
                    elif dots_needed > 60:
                        dots_needed = 60
                    
                    dots = '.' * dots_needed
                    fixed_line = f"{title} {dots} {page_num}\n"
                    fixed_lines.append(fixed_line)
                    fixes_made += 1
                    continue
            
            # For non-TOC lines or TOC lines without dots, keep as-is
            fixed_lines.append(line)
        
        # Write to output file
        with open(output_file, 'w', encoding='utf-8') as f:
            f.writelines(fixed_lines)
        
        print(f"✅ Successfully standardized {fixes_made} table of contents entries")
        print(f"📁 Input:  {input_file}")
        print(f"📁 Output: {output_file}")
        
        return True
        
    except FileNotFoundError:
        print(f"❌ Error: Input file '{input_file}' not found.")
        return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def main():
    parser = argparse.ArgumentParser(description='Fix table of contents formatting in Markdown files')
    parser.add_argument('input_file', help='Input Markdown file')
    parser.add_argument('output_file', nargs='?', help='Output Markdown file (optional)')
    
    args = parser.parse_args()
    
    input_path = Path(args.input_file)
    
    # If no output file specified, create one with "_toc_fixed" suffix
    if args.output_file:
        output_path = Path(args.output_file)
    else:
        output_path = input_path.parent / f"{input_path.stem}_toc_fixed{input_path.suffix}"
    
    if fix_table_of_contents(input_path, output_path):
        print("\n🎉 Table of contents formatting complete!")
    else:
        sys.exit(1)

if __name__ == "__main__":
    main()
