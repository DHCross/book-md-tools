#!/usr/bin/env python3
"""
Markdown Cleanup Fixer for TLG Projects

This script fixes artifacts introduced by the long-line detector, specifically:
1. Lines that start with punctuation (commas, periods, conjunctions)
2. Lines that start with lowercase words that should continue previous sentences
3. Orphaned sentence fragments that got broken incorrectly

Author: GitHub Copilot for TLG
Version: 1.0.0
Date: 2024-12-19

Usage:
    python3 markdown_cleanup_fixer.py input.md [--output output.md] [--dry-run]

Options:
    --output: Specify output filename (default: overwrites input)
    --dry-run: Show what would be changed without making changes
    --backup: Create a backup before making changes (default: True)

Examples:
    python3 markdown_cleanup_fixer.py Yggsburgh-final.md --dry-run
    python3 markdown_cleanup_fixer.py Yggsburgh-final.md --output Yggsburgh-fixed.md
"""

import argparse
import re
import shutil
from datetime import datetime
from pathlib import Path

class MarkdownCleanupFixer:
    def __init__(self):
        self.issues_found = []
        self.fixes_applied = []
        
        # Patterns for lines that should be joined with previous line
        self.join_patterns = [
            # Lines starting with punctuation (comma, semicolon, period) with any whitespace
            r'^[\s]*[,;\.]\s+',
            # Lines starting with coordinating conjunctions after comma
            r'^[\s]*(, or|, and|, but|, yet|, so|, nor)\s+',
            # Lines starting with "or" after comma break
            r'^[\s]*or\s+[a-z]',
            # Lines starting with continuation phrases after comma
            r'^[\s]*(or frame|and other|but also|yet still)\s+',
        ]
        
        # Compile patterns for efficiency
        self.compiled_patterns = [re.compile(pattern, re.IGNORECASE) for pattern in self.join_patterns]
    
    def should_join_line(self, line):
        """Check if a line should be joined with the previous line."""
        # Skip empty lines and markdown formatting
        if not line.strip():
            return False
        if line.strip().startswith('#'):
            return False
        if line.strip().startswith('>'):
            # Check the content inside the blockquote
            content = line.strip()[1:].strip()
            if not content:
                return False
            return any(pattern.match(content) for pattern in self.compiled_patterns)
        
        return any(pattern.match(line) for pattern in self.compiled_patterns)
    
    def fix_line_breaks(self, content, dry_run=False):
        """Fix inappropriate line breaks in the markdown content."""
        lines = content.split('\n')
        fixed_lines = []
        i = 0
        
        while i < len(lines):
            current_line = lines[i]
            
            # Check if we have a next line and if it should be joined
            if i + 1 < len(lines):
                next_line = lines[i + 1]
                
                if self.should_join_line(next_line):
                    # Record the issue
                    issue = {
                        'line_num': i + 2,  # +2 because we're looking at next line and 1-indexed
                        'current': current_line,
                        'next': next_line,
                        'type': 'line_break_artifact'
                    }
                    self.issues_found.append(issue)
                    
                    if not dry_run:
                        # Join the lines
                        if current_line.strip().endswith('>'):
                            # If current line is a blockquote, we need to be careful
                            if next_line.strip().startswith('>'):
                                # Both are blockquotes, join them
                                current_content = current_line.rstrip()
                                next_content = next_line.strip()[1:].strip()
                                joined = f"{current_content} {next_content}"
                            else:
                                # Current is blockquote, next is not - unusual case
                                joined = f"{current_line.rstrip()} {next_line.strip()}"
                        elif next_line.strip().startswith('>'):
                            # Next line is blockquote, current is not
                            next_content = next_line.strip()[1:].strip()
                            joined = f"{current_line.rstrip()} {next_content}"
                        else:
                            # Neither is blockquote
                            joined = f"{current_line.rstrip()} {next_line.strip()}"
                        
                        fixed_lines.append(joined)
                        self.fixes_applied.append({
                            'line_num': i + 1,
                            'original_current': current_line,
                            'original_next': next_line,
                            'fixed': joined
                        })
                        
                        # Skip the next line since we've joined it
                        i += 2
                    else:
                        # In dry-run, just add current line
                        fixed_lines.append(current_line)
                        i += 1
                else:
                    fixed_lines.append(current_line)
                    i += 1
            else:
                fixed_lines.append(current_line)
                i += 1
        
        return '\n'.join(fixed_lines)
    
    def generate_report(self, input_file, output_file=None):
        """Generate a detailed report of the fixes applied."""
        report_lines = [
            f"# Markdown Cleanup Report",
            f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
            f"Input file: {input_file}",
            f"Output file: {output_file or input_file}",
            "",
            f"## Summary",
            f"- Issues found: {len(self.issues_found)}",
            f"- Fixes applied: {len(self.fixes_applied)}",
            "",
        ]
        
        if self.issues_found:
            report_lines.extend([
                "## Issues Found",
                "",
            ])
            
            for i, issue in enumerate(self.issues_found[:20], 1):  # Show first 20
                report_lines.extend([
                    f"### Issue {i} (Line {issue['line_num']})",
                    f"**Type:** {issue['type']}",
                    "",
                    f"**Current line:**",
                    f"```",
                    issue['current'],
                    f"```",
                    "",
                    f"**Next line (to be joined):**",
                    f"```",
                    issue['next'],
                    f"```",
                    "",
                ])
            
            if len(self.issues_found) > 20:
                report_lines.append(f"... and {len(self.issues_found) - 20} more issues")
        
        if self.fixes_applied:
            report_lines.extend([
                "",
                "## Sample Fixes Applied",
                "",
            ])
            
            for i, fix in enumerate(self.fixes_applied[:10], 1):  # Show first 10 fixes
                report_lines.extend([
                    f"### Fix {i} (Line {fix['line_num']})",
                    "",
                    f"**Before:**",
                    f"```",
                    fix['original_current'],
                    fix['original_next'],
                    f"```",
                    "",
                    f"**After:**",
                    f"```",
                    fix['fixed'],
                    f"```",
                    "",
                ])
        
        return '\n'.join(report_lines)

def main():
    parser = argparse.ArgumentParser(description='Fix markdown line break artifacts')
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
    
    # Initialize fixer
    fixer = MarkdownCleanupFixer()
    
    # Process content
    fixed_content = fixer.fix_line_breaks(content, dry_run=args.dry_run)
    
    # Report results
    print(f"Markdown Cleanup Results:")
    print(f"- Issues found: {len(fixer.issues_found)}")
    if not args.dry_run:
        print(f"- Fixes applied: {len(fixer.fixes_applied)}")
    
    # Generate detailed report
    output_file = args.output or str(input_path)
    report = fixer.generate_report(str(input_path), output_file)
    
    if args.report:
        with open(args.report, 'w', encoding='utf-8') as f:
            f.write(report)
        print(f"- Report saved to: {args.report}")
    
    if args.dry_run:
        print("\nDry run completed. Use without --dry-run to apply fixes.")
        if fixer.issues_found:
            print("\nFirst few issues found:")
            for issue in fixer.issues_found[:5]:
                print(f"  Line {issue['line_num']}: '{issue['next'][:50]}...'")
        return 0
    
    # Create backup if requested
    if not args.no_backup:
        backup_path = f"{input_path}.cleanup-backup"
        shutil.copy2(input_path, backup_path)
        print(f"- Backup created: {backup_path}")
    
    # Write output
    output_path = Path(args.output) if args.output else input_path
    try:
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(fixed_content)
        print(f"- Fixed content written to: {output_path}")
    except Exception as e:
        print(f"Error writing output file: {e}")
        return 1
    
    return 0

if __name__ == '__main__':
    exit(main())
