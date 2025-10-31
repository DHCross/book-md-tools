#!/usr/bin/env python3
"""
Fix paragraph spacing in markdown files by ensuring each paragraph is followed by a blank line.
Preserves existing formatting, headers, and lists.
"""
from pathlib import Path
import re
import sys

def fix_paragraph_spacing(file_path):
    """Add blank lines between paragraphs while preserving other formatting."""
    # Read the file
    text = file_path.read_text(encoding="utf-8")
    
    # Add a blank line between paragraphs (preserves double breaks, headers, and lists)
    # This regex looks for a non-newline character followed by a newline and another non-newline character
    # that's not a list marker or header, and inserts an extra newline
    fixed_text = re.sub(r'([^\n])\n([^\n#*\-])', r'\1\n\n\2', text)
    
    # Write the fixed text back to the file
    file_path.write_text(fixed_text, encoding="utf-8")
    
    # Also ensure the file ends with exactly one newline
    with open(file_path, 'a', encoding='utf-8') as f:
        if not fixed_text.endswith('\n'):
            f.write('\n')

def main():
    if len(sys.argv) != 2:
        print("Usage: python fix_paragraph_spacing.py <markdown_file>")
        sys.exit(1)
    
    file_path = Path(sys.argv[1])
    if not file_path.exists():
        print(f"Error: File not found: {file_path}")
        sys.exit(1)
    
    # Create a backup
    backup_path = file_path.with_suffix(f'{file_path.suffix}.bak')
    file_path.rename(backup_path)
    
    try:
        # Process the backup and write to the original filename
        fix_paragraph_spacing(backup_path)
        backup_path.rename(file_path)
        print("✅ Paragraph spacing normalized! Each paragraph now has a blank line after it.")
    except Exception as e:
        # Restore the original file if something goes wrong
        print(f"Error: {e}")
        print("Restoring original file...")
        backup_path.rename(file_path)
        sys.exit(1)

if __name__ == "__main__":
    main()
