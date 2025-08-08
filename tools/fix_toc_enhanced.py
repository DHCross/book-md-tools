#!/usr/bin/env python3
"""
Fix Table of Contents Formatting - Enhanced Version
=================================================

This script standardizes the spacing and dotted lines in table of contents entries
to create a uniform, professional appearance. Handles multiple entries per line and
various formatting inconsistencies.

Usage:
    python fix_toc_enhanced.py input_file.md output_file.md
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
            elif in_toc and stripped.startswith("The Table of Contents will likely"):
                in_toc = False
                fixed_lines.append(line)
                continue
            
            # Process TOC entries if we're in the table of contents
            if in_toc and ('..................' in line):
                # Handle lines that might have multiple entries
                # Split by common patterns and process each entry
                
                # First, try to identify if there are multiple entries on one line
                # Pattern: "Entry1 ............ 123 Entry2 ............ 456"
                
                processed_line = line.strip()
                
                # Find all potential TOC entries using regex
                # Look for: text followed by dots followed by numbers
                pattern = r'([^.]+?)\.{3,}\s*(\d+)'
                matches = re.findall(pattern, processed_line)
                
                if matches:
                    # Process each match and create separate lines
                    new_lines = []
                    for title, page_num in matches:
                        title = title.strip()
                        page_num = page_num.strip()
                        
                        # Skip if title is empty or just whitespace
                        if not title:
                            continue
                            
                        # Create standardized entry
                        total_width = 70  # Target total line width
                        dots_needed = total_width - len(title) - len(page_num) - 2  # 2 for spaces
                        
                        # Ensure reasonable number of dots
                        if dots_needed < 5:
                            dots_needed = 5
                        elif dots_needed > 50:
                            dots_needed = 50
                        
                        dots = '.' * dots_needed
                        fixed_line = f"{title} {dots} {page_num}  \n"
                        new_lines.append(fixed_line)
                        fixes_made += 1
                    
                    # Add all the new lines
                    fixed_lines.extend(new_lines)
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
