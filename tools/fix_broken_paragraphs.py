#!/usr/bin/env python3
"""
Fix Broken Paragraphs in Markdown Files
======================================

This script identifies and fixes broken paragraphs where text is split
across lines mid-sentence, creating awkward line breaks.

Usage:
    python fix_broken_paragraphs.py input_file.md output_file.md
"""

import sys
import argparse
import re
from pathlib import Path

def fix_broken_paragraphs(input_file, output_file):
    """Fix broken paragraphs by joining lines that shouldn't be split."""
    
    try:
        # Read the input file
        with open(input_file, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        
        fixed_lines = []
        fixes_made = 0
        
        i = 0
        while i < len(lines):
            current_line = lines[i].rstrip()
            
            # Skip if this is a header, empty line, or starts with special characters
            if (current_line.startswith('#') or 
                current_line.strip() == '' or
                current_line.startswith('**') or
                current_line.startswith('*') or
                current_line.startswith('-') or
                current_line.startswith('|') or
                current_line.startswith('>') or
                current_line.startswith('```')):
                fixed_lines.append(lines[i])
                i += 1
                continue
            
            # Check if this line ends in a way that suggests it should continue
            # and the next line doesn't start a new paragraph/section
            if i + 1 < len(lines):
                next_line = lines[i + 1].rstrip()
                
                # Conditions for a broken paragraph:
                # 1. Current line doesn't end with proper sentence endings
                # 2. Next line isn't empty, header, or special formatting
                # 3. Next line starts with lowercase or continues a sentence
                should_join = (
                    current_line.strip() != '' and
                    next_line.strip() != '' and
                    not next_line.startswith('#') and
                    not next_line.startswith('**') and
                    not next_line.startswith('*') and
                    not next_line.startswith('-') and
                    not next_line.startswith('|') and
                    not next_line.startswith('>') and
                    not next_line.startswith('```') and
                    (
                        # Specific broken patterns we've identified
                        current_line.endswith('Thieves\'') or
                        current_line.endswith('(') or
                        current_line.endswith(',') or
                        current_line.endswith(' the') or
                        current_line.endswith(' a') or
                        current_line.endswith(' an') or
                        current_line.endswith(' and') or
                        current_line.endswith(' or') or
                        current_line.endswith(' of') or
                        current_line.endswith(' in') or
                        current_line.endswith(' to') or
                        current_line.endswith(' for') or
                        current_line.endswith(' with') or
                        current_line.endswith(' from') or
                        current_line.endswith(' by') or
                        current_line.endswith(' as') or
                        # Next line starts with what should be continuation
                        next_line.strip().startswith('Guild,') or
                        next_line.strip().startswith('Area ') or
                        next_line.strip().startswith('Street') or
                        next_line.strip().startswith('Avenue') or
                        # General pattern: current line doesn't end with sentence punctuation
                        # and next line starts lowercase (but not a new paragraph)
                        (not current_line.endswith(('.', '!', '?', ':', ';', ')')) and
                         len(next_line.strip()) > 0 and
                         next_line.strip()[0].islower() and
                         not next_line.strip().startswith('see ') and
                         not next_line.strip().startswith('area ') and
                         len(current_line.split()) > 3)  # Avoid joining very short lines
                    )
                )
                
                if should_join:
                    # Join the lines with a space
                    combined_line = current_line + ' ' + next_line.strip() + '\n'
                    fixed_lines.append(combined_line)
                    fixes_made += 1
                    i += 2  # Skip the next line since we've merged it
                    continue
            
            # No joining needed, add the line as-is
            fixed_lines.append(lines[i])
            i += 1
        
        # Write to output file
        with open(output_file, 'w', encoding='utf-8') as f:
            f.writelines(fixed_lines)
        
        print(f"✅ Successfully fixed {fixes_made} broken paragraphs")
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
    parser = argparse.ArgumentParser(description='Fix broken paragraphs in Markdown files')
    parser.add_argument('input_file', help='Input Markdown file')
    parser.add_argument('output_file', nargs='?', help='Output Markdown file (optional)')
    
    args = parser.parse_args()
    
    input_path = Path(args.input_file)
    
    # If no output file specified, create one with "_fixed_paragraphs" suffix
    if args.output_file:
        output_path = Path(args.output_file)
    else:
        output_path = input_path.parent / f"{input_path.stem}_fixed_paragraphs{input_path.suffix}"
    
    if fix_broken_paragraphs(input_path, output_path):
        print("\n🎉 Broken paragraph fixing complete!")
    else:
        sys.exit(1)

if __name__ == "__main__":
    main()
