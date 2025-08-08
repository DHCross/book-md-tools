#!/usr/bin/env python3
"""
Remove Dagger Symbols (†) from Markdown Files
============================================

This script removes all "†" symbols from a Markdown file and creates a new version.

Usage:
    python remove_dagger_symbols.py input_file.md output_file.md
"""

import sys
import argparse
from pathlib import Path

def remove_dagger_symbols(input_file, output_file):
    """Remove all † symbols from the input file and save to output file."""
    
    try:
        # Read the input file
        with open(input_file, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Count original dagger symbols
        original_count = content.count('†')
        
        # Remove all dagger symbols
        cleaned_content = content.replace('†', '')
        
        # Write to output file
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(cleaned_content)
        
        print(f"✅ Successfully removed {original_count} dagger symbols (†)")
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
    parser = argparse.ArgumentParser(description='Remove dagger symbols (†) from Markdown files')
    parser.add_argument('input_file', help='Input Markdown file')
    parser.add_argument('output_file', nargs='?', help='Output Markdown file (optional)')
    
    args = parser.parse_args()
    
    input_path = Path(args.input_file)
    
    # If no output file specified, create one with "_no_daggers" suffix
    if args.output_file:
        output_path = Path(args.output_file)
    else:
        output_path = input_path.parent / f"{input_path.stem}_no_daggers{input_path.suffix}"
    
    if remove_dagger_symbols(input_path, output_path):
        print("\n🎉 Dagger symbol removal complete!")
    else:
        sys.exit(1)

if __name__ == "__main__":
    main()
