#!/usr/bin/env python3
"""
Clean up markdown formatting in Essential Places document.
Removes strikeout markers (~~) while preserving bold/italic formatting.
"""
import re
import sys
from pathlib import Path

def clean_markdown(content):
    """Remove strikeout markers while preserving other formatting."""
    # Remove all ~~ markers
    cleaned = content.replace('~~', '')
    
    # Fix any instances where we might have left over empty bold/italic markers
    cleaned = re.sub(r'\*\*\s*\*\*', '', cleaned)  # Remove empty bold
    cleaned = re.sub(r'__\s*__', '', cleaned)         # Remove empty bold (alt syntax)
    cleaned = re.sub(r'\*\s*\*', '', cleaned)         # Remove empty italic
    cleaned = re.sub(r'_\s*_', '', cleaned)           # Remove empty italic (alt syntax)
    
    return cleaned

def process_file(file_path):
    """Process a single markdown file."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        cleaned_content = clean_markdown(content)
        
        # Create backup
        backup_path = file_path + '.bak'
        with open(backup_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Created backup at: {backup_path}")
        
        # Write cleaned content
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(cleaned_content)
        
        print(f"Successfully cleaned: {file_path}")
        return True
        
    except Exception as e:
        print(f"Error processing {file_path}: {str(e)}")
        return False

def main():
    if len(sys.argv) != 2:
        print("Usage: python clean_markdown_formatting.py <markdown_file>")
        print("  This will create a backup with .bak extension before making changes.")
        sys.exit(1)
    
    file_path = Path(sys.argv[1])
    if not file_path.exists():
        print(f"Error: File not found: {file_path}")
        sys.exit(1)
    
    process_file(str(file_path))

if __name__ == "__main__":
    main()
