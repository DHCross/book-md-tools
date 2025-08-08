#!/usr/bin/env python3
"""
Markdown Header Hierarchy Fixer

This script fixes common markdown header structure issues including:
1. Spurious footer/header artifacts (e.g., "###### Castles Zagyg: Yggsburgh")
2. Inconsistent header hierarchy levels
3. Logical structure problems based on Table of Contents

Features:
- Remove footer/header artifacts
- Fix header hierarchy to match logical document structure
- Preserve legitimate headers while fixing broken ones
- Generate before/after reports
- Backup original file

Usage:
    python3 markdown_header_fixer.py <file.md> [--dry-run] [--verbose]
"""

import re
import argparse
import sys
from pathlib import Path
from typing import List, Tuple, Dict
from dataclasses import dataclass
from datetime import datetime

@dataclass
class HeaderIssue:
    line_num: int
    original: str
    suggested: str
    issue_type: str
    confidence: str

class MarkdownHeaderFixer:
    def __init__(self, verbose: bool = False):
        self.verbose = verbose
        self.issues: List[HeaderIssue] = []
        
        # Common footer/header artifacts to remove
        self.footer_patterns = [
            r'^#{1,6}\s+Castles Zagyg:\s*Yggsburgh\s*$',
            r'^#{1,6}\s+Setting,\s*History\s*and\s*Culture\s*$',
            r'^#{1,6}\s+Part\s+[IVX]+\s*$',  # Standalone part headers without content
        ]
        
        # Header level mappings based on common document structures
        self.structure_patterns = {
            # Main document parts
            r'^#{1,6}\s+(Part\s+[IVX]+:?\s*.+)$': 1,
            r'^#{1,6}\s+(Chapter\s+\d+:?\s*.+)$': 1,
            r'^#{1,6}\s+(Appendix\s+[A-Z]:?\s*.+)$': 1,
            
            # Major sections
            r'^#{1,6}\s+(Introduction|Background|Overview|History|Culture|Geography|Conclusion)(\s+.*)?$': 2,
            r'^#{1,6}\s+(Foreword|Preface|Notes?\s+for\s+.+|Table\s+of\s+Contents)$': 2,
            
            # Subsections (Population, Social Classes, etc.)
            r'^#{1,6}\s+(Population|Social\s+Classes|Dress[,\s]+Style.+|Common\s+Names|Coin\s+of\s+.+|Town\s+Revenues)$': 3,
            r'^#{1,6}\s+(The\s+Culture\s+of|Local\s+.+\s+Nobles|Elites\s+and\s+Administration)$': 2,
            
            # Geographic features (typically subsections)
            r'^#{1,6}\s+([A-Z][a-z]+\s+(Hills|Forest|River|Lake|Valley|Mountains?|Woods?))$': 3,
            
            # Sub-subsections (Males, Females, etc.)
            r'^#{1,6}\s+(Males?|Females?|Human\s+.+\s+Names|Demi-human\s+Names)$': 4,
        }

    def log(self, message: str):
        """Print verbose logging messages."""
        if self.verbose:
            print(f"🔍 {message}")

    def is_footer_artifact(self, line: str) -> bool:
        """Check if a line is a footer/header artifact that should be removed."""
        for pattern in self.footer_patterns:
            if re.match(pattern, line.strip(), re.IGNORECASE):
                return True
        return False

    def get_suggested_header_level(self, line: str) -> int:
        """Suggest appropriate header level based on content patterns."""
        for pattern, level in self.structure_patterns.items():
            if re.match(pattern, line.strip(), re.IGNORECASE):
                return level
        
        # Default: keep existing level if no pattern matches
        match = re.match(r'^(#{1,6})\s+', line)
        if match:
            return len(match.group(1))
        
        return 2  # Default fallback

    def analyze_headers(self, lines: List[str]) -> List[HeaderIssue]:
        """Analyze markdown headers and identify issues."""
        issues = []
        
        for line_num, line in enumerate(lines, 1):
            if not line.strip().startswith('#'):
                continue
                
            header_match = re.match(r'^(#{1,6})\s+(.+)$', line.strip())
            if not header_match:
                continue
                
            current_level = len(header_match.group(1))
            header_text = header_match.group(2)
            
            # Check for footer artifacts
            if self.is_footer_artifact(line):
                issues.append(HeaderIssue(
                    line_num=line_num,
                    original=line.strip(),
                    suggested="[REMOVE - Footer artifact]",
                    issue_type="footer_artifact",
                    confidence="high"
                ))
                continue
            
            # Check for hierarchy issues
            suggested_level = self.get_suggested_header_level(line)
            if current_level != suggested_level:
                new_header = '#' * suggested_level + ' ' + header_text
                issues.append(HeaderIssue(
                    line_num=line_num,
                    original=line.strip(),
                    suggested=new_header,
                    issue_type="hierarchy_fix",
                    confidence="medium" if abs(current_level - suggested_level) <= 2 else "low"
                ))
        
        return issues

    def fix_headers(self, lines: List[str], issues: List[HeaderIssue]) -> List[str]:
        """Apply header fixes to the document."""
        fixed_lines = lines.copy()
        
        # Process issues in reverse order to maintain line numbers
        for issue in sorted(issues, key=lambda x: x.line_num, reverse=True):
            line_idx = issue.line_num - 1
            
            if issue.issue_type == "footer_artifact":
                # Remove the line entirely
                fixed_lines.pop(line_idx)
                self.log(f"Removed footer artifact at line {issue.line_num}: {issue.original}")
            
            elif issue.issue_type == "hierarchy_fix" and issue.confidence in ["high", "medium"]:
                # Replace with fixed header
                fixed_lines[line_idx] = issue.suggested + '\n' if not issue.suggested.endswith('\n') else issue.suggested
                self.log(f"Fixed header at line {issue.line_num}: {issue.original} → {issue.suggested}")
        
        return fixed_lines

    def generate_report(self, issues: List[HeaderIssue]) -> str:
        """Generate a detailed report of header issues found."""
        report = []
        report.append("# Markdown Header Analysis Report")
        report.append(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        report.append(f"Total issues found: {len(issues)}")
        report.append("")
        
        # Group by issue type
        by_type = {}
        for issue in issues:
            if issue.issue_type not in by_type:
                by_type[issue.issue_type] = []
            by_type[issue.issue_type].append(issue)
        
        for issue_type, type_issues in by_type.items():
            report.append(f"## {issue_type.replace('_', ' ').title()} ({len(type_issues)} issues)")
            report.append("")
            
            for issue in type_issues:
                report.append(f"**Line {issue.line_num}** (Confidence: {issue.confidence})")
                report.append(f"- **Original:** `{issue.original}`")
                report.append(f"- **Suggested:** `{issue.suggested}`")
                report.append("")
        
        return '\n'.join(report)

    def process_file(self, file_path: Path, dry_run: bool = False) -> Tuple[int, str]:
        """Process a markdown file and fix header issues."""
        self.log(f"Processing file: {file_path}")
        
        # Read the file
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                lines = f.readlines()
        except Exception as e:
            return 0, f"Error reading file: {e}"
        
        # Analyze headers
        self.log("Analyzing headers...")
        issues = self.analyze_headers(lines)
        
        if not issues:
            return 0, "No header issues found."
        
        # Generate report
        report = self.generate_report(issues)
        
        if dry_run:
            print("🔍 DRY RUN - No changes made")
            print(report)
            return len(issues), "Dry run completed - no changes made."
        
        # Apply fixes
        self.log("Applying fixes...")
        fixed_lines = self.fix_headers(lines, issues)
        
        # Backup original file
        backup_path = file_path.with_suffix(file_path.suffix + '.header-backup')
        try:
            with open(backup_path, 'w', encoding='utf-8') as f:
                f.writelines(lines)
            self.log(f"Created backup: {backup_path}")
        except Exception as e:
            return 0, f"Error creating backup: {e}"
        
        # Write fixed file
        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.writelines(fixed_lines)
        except Exception as e:
            return 0, f"Error writing fixed file: {e}"
        
        # Write report
        report_path = file_path.with_suffix('.header-report.md')
        try:
            with open(report_path, 'w', encoding='utf-8') as f:
                f.write(report)
            self.log(f"Generated report: {report_path}")
        except Exception as e:
            self.log(f"Warning: Could not write report file: {e}")
        
        return len(issues), f"Fixed {len(issues)} header issues. Backup saved to {backup_path}"

def main():
    parser = argparse.ArgumentParser(
        description="Fix markdown header hierarchy issues",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    python3 markdown_header_fixer.py document.md
    python3 markdown_header_fixer.py document.md --dry-run --verbose
    
Common fixes:
    - Remove footer artifacts like '###### Castles Zagyg: Yggsburgh'
    - Fix header hierarchy (Part I should be #, major sections ##, etc.)
    - Ensure logical document structure based on content patterns
        """
    )
    
    parser.add_argument('file', type=Path, help='Markdown file to process')
    parser.add_argument('--dry-run', action='store_true', 
                       help='Show what would be changed without making changes')
    parser.add_argument('--verbose', '-v', action='store_true',
                       help='Enable verbose output')
    
    args = parser.parse_args()
    
    if not args.file.exists():
        print(f"❌ Error: File '{args.file}' not found")
        sys.exit(1)
    
    if not args.file.suffix.lower() in ['.md', '.markdown']:
        print(f"⚠️  Warning: '{args.file}' doesn't appear to be a markdown file")
    
    fixer = MarkdownHeaderFixer(verbose=args.verbose)
    
    try:
        issues_count, message = fixer.process_file(args.file, dry_run=args.dry_run)
        
        if issues_count > 0:
            print(f"✅ {message}")
        else:
            print(f"ℹ️  {message}")
            
    except KeyboardInterrupt:
        print("\n❌ Operation cancelled by user")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
