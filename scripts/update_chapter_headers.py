#!/usr/bin/env python3
"""
Update chapter headers in markdown files.
Converts H2 (##) chapter headers to H1 (#) format.
"""
import re
import sys
from pathlib import Path

def update_chapter_headers(content):
    """Convert H2 chapter headers to H1."""
    # Pattern to match ## Chapter X: Chapter Name
    pattern = r'^(##\s+Chapter\s+\d+:.*)$'
    
    def replace_header(match):
        # Remove one # from the match
        return match.group(1)[1:]
    
    # Use re.MULTILINE to match start of each line
    updated_content = re.sub(pattern, replace_header, content, flags=re.MULTILINE)
    return updated_content

def process_file(file_path):
    """Process a single markdown file."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        updated_content = update_chapter_headers(content)
        
        # Only write if changes were made
        if updated_content != content:
            # Create backup
            backup_path = str(file_path) + '.bak'
            with open(backup_path, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f"Created backup at: {backup_path}")
            
            # Write updated content
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(updated_content)
            
            print(f"Updated chapter headers in: {file_path}")
            return True
        else:
            print(f"No chapter headers needed updating in: {file_path}")
            return False
            
    except Exception as e:
        print(f"Error processing {file_path}: {str(e)}")
        return False

def main():
    if len(sys.argv) != 2:
        print("Usage: python update_chapter_headers.py <markdown_file>")
        print("  This will create a backup with .bak extension before making changes.")
        sys.exit(1)
    
    file_path = Path(sys.argv[1])
    if not file_path.exists():
        print(f"Error: File not found: {file_path}")
        sys.exit(1)
    
    process_file(file_path)

if __name__ == "__main__":
    main()
