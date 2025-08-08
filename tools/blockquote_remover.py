#!/usr/bin/env python3
"""
Blockquote Remover for TLG Projects

This script removes inappropriate blockquote markers (>) from Markdown documents
where the entire content was incorrectly converted as blockquotes.

Author: GitHub Copilot for TLG
Version: 1.0.0
Date: 2024-12-19

Usage:
    python3 blockquote_remover.py input.md [--output output.md] [--dry-run]

Options:
    --output: Specify output filename (default: overwrites input)
    --dry-run: Show what would be changed without making changes
    --backup: Create a backup before making changes (default: True)

Examples:
    python3 blockquote_remover.py Yggsburgh-final.md --dry-run
    python3 blockquote_remover.py Yggsburgh-final.md --output clean.md
"""

import argparse
import re
import shutil
from datetime import datetime
from pathlib import Path

class BlockquoteRemover:
    def __init__(self):
        self.lines_processed = 0
        self.blockquotes_removed = 0
        self.lines_changed = []
        
    def should_keep_blockquote(self, line):
        """Determine if a line should keep its blockquote marker."""
        # For this document, we're removing ALL blockquotes since they appear to be conversion artifacts
        # The entire document was incorrectly converted as blockquotes by Pandoc
        return False
    
    def remove_blockquotes(self, content, dry_run=False):
        """Remove inappropriate blockquote markers from the content."""
        lines = content.split('\n')
        processed_lines = []
        
        for i, line in enumerate(lines):
            self.lines_processed += 1
            original_line = line
            
            # Check if line starts with blockquote marker
            if line.strip().startswith('>'):
                if not self.should_keep_blockquote(line):
                    # Remove the blockquote marker
                    # Handle various patterns: >, > text, >text
                    if line.strip() == '>':
                        # Just a lone > becomes empty line
                        new_line = ''
                    else:
                        # Remove > and optional following space
                        new_line = re.sub(r'^(\s*)>\s?', r'\1', line)
                    
                    if not dry_run:
                        processed_lines.append(new_line)
                        self.blockquotes_removed += 1
                        self.lines_changed.append({
                            'line_num': i + 1,
                            'original': original_line,
                            'new': new_line
                        })
                    else:
                        processed_lines.append(line)  # Keep original for dry run
                        self.blockquotes_removed += 1
                else:
                    # Keep the blockquote
                    processed_lines.append(line)
            else:
                # Not a blockquote line, keep as-is
                processed_lines.append(line)
        
        return '\n'.join(processed_lines)
    
    def generate_report(self, input_file, output_file=None):
        """Generate a report of the changes made."""
        report_lines = [
            f"# Blockquote Removal Report",
            f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
            f"Input file: {input_file}",
            f"Output file: {output_file or input_file}",
            "",
            f"## Summary",
            f"- Lines processed: {self.lines_processed}",
            f"- Blockquotes removed: {self.blockquotes_removed}",
            f"- Percentage of lines changed: {(self.blockquotes_removed/self.lines_processed*100):.1f}%",
            "",
        ]
        
        if self.lines_changed:
            report_lines.extend([
                "## Sample Changes (first 20)",
                "",
            ])
            
            for i, change in enumerate(self.lines_changed[:20], 1):
                report_lines.extend([
                    f"### Change {i} (Line {change['line_num']})",
                    "",
                    f"**Before:**",
                    f"```",
                    change['original'],
                    f"```",
                    "",
                    f"**After:**",
                    f"```",
                    change['new'],
                    f"```",
                    "",
                ])
            
            if len(self.lines_changed) > 20:
                report_lines.append(f"... and {len(self.lines_changed) - 20} more changes")
        
        return '\n'.join(report_lines)

def main():
    parser = argparse.ArgumentParser(description='Remove inappropriate blockquote markers from Markdown')
    parser.add_argument('input_file', help='Input markdown file')
    parser.add_argument('--output', help='Output file (default: overwrite input)')
    parser.add_argument('--dry-run', action='store_true', help='Show what would be changed')
    parser.add_argument('--no-backup', action='store_true', help='Don\'t create backup')
    parser.add_argument('--report', help='Generate report file')
    
    args = parser.parse_args()
    
    input_path = Path(args.input_file)
    if not input_path.exists():
        print(f"Error: Input file '{args.input_file}' not found")
        return 1
    
    # Read input file
    try:
        with open(input_path, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        print(f"Error reading input file: {e}")
        return 1
    
    # Initialize remover
    remover = BlockquoteRemover()
    
    # Process content
    processed_content = remover.remove_blockquotes(content, dry_run=args.dry_run)
    
    # Report results
    print(f"Blockquote Removal Results:")
    print(f"- Lines processed: {remover.lines_processed}")
    print(f"- Blockquotes removed: {remover.blockquotes_removed}")
    print(f"- Percentage changed: {(remover.blockquotes_removed/remover.lines_processed*100):.1f}%")
    
    # Generate detailed report
    output_file = args.output or str(input_path)
    report = remover.generate_report(str(input_path), output_file)
    
    if args.report:
        with open(args.report, 'w', encoding='utf-8') as f:
            f.write(report)
        print(f"- Report saved to: {args.report}")
    
    if args.dry_run:
        print("\nDry run completed. Use without --dry-run to apply changes.")
        return 0
    
    # Create backup if requested
    if not args.no_backup:
        backup_path = f"{input_path}.blockquote-backup"
        shutil.copy2(input_path, backup_path)
        print(f"- Backup created: {backup_path}")
    
    # Write output
    output_path = Path(args.output) if args.output else input_path
    try:
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(processed_content)
        print(f"- Cleaned content written to: {output_path}")
    except Exception as e:
        print(f"Error writing output file: {e}")
        return 1
    
    return 0

if __name__ == '__main__':
    exit(main())
