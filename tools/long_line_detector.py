#!/usr/bin/env python3
"""
Long Line Detector and Fixer for Markdown Documents
===================================================

This script identifies and helps fix overly long lines in Markdown documents,
particularly those resulting from paragraph break artifacts during document
conversion (e.g., PDF to DOCX to Markdown).

Author: TLG Document Processing Team
Version: 1.0
Date: August 7, 2025

Features:
- Detects lines exceeding specified length thresholds
- Identifies natural break points (sentences, clauses)
- Suggests paragraph breaks at logical positions
- Provides dry-run mode for safe preview
- Generates detailed reports with line numbers
- Preserves Markdown formatting and structure
- Handles special cases (code blocks, tables, headers)

Usage:
    python3 long_line_detector.py input.md [options]

Options:
    --threshold CHARS    Maximum line length before flagging (default: 150)
    --fix               Apply suggested fixes automatically
    --dry-run           Show proposed changes without applying them
    --output FILE       Write fixed content to specified file
    --report FILE       Generate detailed report file
    --ignore-headers    Skip header lines in analysis
    --ignore-code       Skip code blocks in analysis
    --min-sentence     Minimum sentence length to consider for breaks (default: 40)
"""

import re
import sys
import argparse
from typing import List, Tuple, Dict, Optional
from dataclasses import dataclass

@dataclass
class LongLineIssue:
    """Represents a detected long line issue."""
    line_num: int
    content: str
    length: int
    suggested_breaks: List[int]
    break_reasons: List[str]
    severity: str  # 'minor', 'moderate', 'severe'

class LongLineDetector:
    """Detects and fixes overly long lines in Markdown documents."""
    
    def __init__(self, threshold: int = 150, min_sentence_length: int = 40):
        self.threshold = threshold
        self.min_sentence_length = min_sentence_length
        self.issues = []
        
        # Patterns for detecting natural break points
        self.sentence_endings = re.compile(r'[.!?]\s+[A-Z]')
        self.clause_breaks = re.compile(r'[,;]\s+(?:and|but|or|however|therefore|thus|hence|moreover|furthermore|nevertheless|nonetheless)\s+')
        self.parenthetical = re.compile(r'\([^)]{20,}\)')
        self.em_dash_breaks = re.compile(r'---?\s+')
        
        # Markdown structure patterns
        self.header_pattern = re.compile(r'^#{1,6}\s+')
        self.code_block_pattern = re.compile(r'^```')
        self.table_pattern = re.compile(r'^\|.*\|$')
        self.list_pattern = re.compile(r'^\s*[-*+]\s+')
        self.blockquote_pattern = re.compile(r'^>\s*')
        
    def is_special_line(self, line: str, ignore_headers: bool = False, ignore_code: bool = False) -> bool:
        """Check if line should be ignored (headers, code, tables, etc.)."""
        line = line.strip()
        
        if not line:
            return True
            
        if ignore_headers and self.header_pattern.match(line):
            return True
            
        if ignore_code and line.startswith('```'):
            return True
            
        if self.table_pattern.match(line):
            return True
            
        # Skip horizontal rules
        if re.match(r'^[-*_]{3,}$', line):
            return True
            
        return False
    
    def find_sentence_breaks(self, text: str) -> List[Tuple[int, str]]:
        """Find natural sentence break points in text."""
        breaks = []
        
        # Find sentence endings
        for match in self.sentence_endings.finditer(text):
            pos = match.start() + 1  # After the punctuation
            if pos > self.min_sentence_length:
                breaks.append((pos, "sentence ending"))
        
        # Find clause breaks with conjunctions
        for match in self.clause_breaks.finditer(text):
            pos = match.start()
            if pos > self.min_sentence_length:
                breaks.append((pos, "clause break"))
        
        # Find em-dash breaks
        for match in self.em_dash_breaks.finditer(text):
            pos = match.start()
            if pos > self.min_sentence_length:
                breaks.append((pos, "em-dash break"))
                
        return sorted(breaks, key=lambda x: x[0])
    
    def find_optimal_breaks(self, text: str) -> List[Tuple[int, str]]:
        """Find optimal break points for a long line."""
        if len(text) <= self.threshold:
            return []
        
        breaks = self.find_sentence_breaks(text)
        optimal_breaks = []
        
        last_break = 0
        for pos, reason in breaks:
            # If we're past the threshold from the last break point
            if pos - last_break > self.threshold:
                optimal_breaks.append((pos, reason))
                last_break = pos
        
        # If no good breaks found, look for word boundaries near threshold
        if not optimal_breaks:
            words = text.split()
            current_pos = 0
            word_pos = 0
            
            for i, word in enumerate(words):
                if current_pos > self.threshold:
                    optimal_breaks.append((word_pos, "word boundary"))
                    current_pos = 0
                    word_pos = sum(len(w) + 1 for w in words[:i])
                current_pos += len(word) + 1
                word_pos = sum(len(w) + 1 for w in words[:i+1])
        
        return optimal_breaks
    
    def analyze_line(self, line_num: int, content: str) -> Optional[LongLineIssue]:
        """Analyze a single line for length issues."""
        if len(content) <= self.threshold:
            return None
        
        # Determine severity
        if len(content) > self.threshold * 2:
            severity = "severe"
        elif len(content) > self.threshold * 1.5:
            severity = "moderate"
        else:
            severity = "minor"
        
        breaks = self.find_optimal_breaks(content)
        break_positions = [pos for pos, _ in breaks]
        break_reasons = [reason for _, reason in breaks]
        
        return LongLineIssue(
            line_num=line_num,
            content=content,
            length=len(content),
            suggested_breaks=break_positions,
            break_reasons=break_reasons,
            severity=severity
        )
    
    def analyze_file(self, file_path: str, ignore_headers: bool = False, ignore_code: bool = False) -> List[LongLineIssue]:
        """Analyze entire file for long line issues."""
        self.issues = []
        in_code_block = False
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                lines = f.readlines()
        except Exception as e:
            print(f"Error reading file: {e}")
            return []
        
        for i, line in enumerate(lines, 1):
            # Track code blocks
            if self.code_block_pattern.match(line.strip()):
                in_code_block = not in_code_block
                continue
            
            # Skip lines inside code blocks if requested
            if ignore_code and in_code_block:
                continue
            
            # Skip special lines
            if self.is_special_line(line, ignore_headers, ignore_code):
                continue
            
            # Analyze line
            issue = self.analyze_line(i, line.rstrip())
            if issue:
                self.issues.append(issue)
        
        return self.issues
    
    def apply_breaks(self, text: str, break_positions: List[int]) -> str:
        """Apply paragraph breaks at specified positions."""
        if not break_positions:
            return text
        
        # Detect if this is a blockquote line
        original_text = text
        is_blockquote = text.strip().startswith('>')
        blockquote_prefix = ''
        content_start_pos = 0
        
        if is_blockquote:
            # Extract the blockquote prefix and any indentation
            stripped = text.lstrip()
            blockquote_prefix = text[:len(text) - len(stripped)]
            if stripped.startswith('>'):
                blockquote_prefix += '> '
                content_start_pos = len(text) - len(stripped) + 1
                # Skip any spaces after the >
                while content_start_pos < len(text) and text[content_start_pos] == ' ':
                    content_start_pos += 1
                text = text[content_start_pos:]  # Extract just the content
                # Adjust break positions to account for removed prefix
                break_positions = [pos - content_start_pos for pos in break_positions if pos > content_start_pos]
        
        result = []
        last_pos = 0
        
        for pos in sorted(break_positions):
            if pos > 0 and pos < len(text):
                chunk = text[last_pos:pos].strip()
                if chunk:
                    if is_blockquote:
                        result.append(blockquote_prefix + chunk)
                    else:
                        result.append(chunk)
                last_pos = pos
        
        # Add remaining text
        if last_pos < len(text):
            chunk = text[last_pos:].strip()
            if chunk:
                if is_blockquote:
                    result.append(blockquote_prefix + chunk)
                else:
                    result.append(chunk)
        
        # If no valid breaks were made, return original text
        if not result:
            return original_text
        
        # Join with double newlines (paragraph breaks)
        return '\n\n'.join(part for part in result if part.strip())
    
    def fix_file(self, input_path: str, output_path: str = None, dry_run: bool = False) -> bool:
        """Fix long lines in file."""
        try:
            with open(input_path, 'r', encoding='utf-8') as f:
                lines = f.readlines()
        except Exception as e:
            print(f"Error reading file: {e}")
            return False
        
        fixed_lines = []
        changes_made = 0
        
        for i, line in enumerate(lines):
            line_num = i + 1
            stripped_line = line.rstrip()
            
            # Find if this line has issues
            issue = None
            for iss in self.issues:
                if iss.line_num == line_num:
                    issue = iss
                    break
            
            if issue and issue.suggested_breaks:
                # Apply breaks
                fixed_text = self.apply_breaks(stripped_line, issue.suggested_breaks)
                fixed_lines.append(fixed_text + '\n')
                changes_made += 1
                
                if dry_run:
                    print(f"Line {line_num}: Would break into {len(issue.suggested_breaks) + 1} paragraphs")
            else:
                fixed_lines.append(line)
        
        if dry_run:
            print(f"Dry run complete. Would make {changes_made} changes.")
            return True
        
        # Write fixed content
        output_file = output_path or input_path
        try:
            with open(output_file, 'w', encoding='utf-8') as f:
                f.writelines(fixed_lines)
            print(f"Fixed {changes_made} long lines. Output written to: {output_file}")
            return True
        except Exception as e:
            print(f"Error writing file: {e}")
            return False
    
    def generate_report(self, output_path: str = None) -> str:
        """Generate detailed report of long line issues."""
        if not self.issues:
            return "No long line issues detected."
        
        report_lines = [
            "Long Line Analysis Report",
            "=" * 50,
            f"Analysis Date: {sys.argv[0]} run on {', '.join(sys.argv[1:])}",
            f"Total Issues Found: {len(self.issues)}",
            "",
            "Issue Summary:",
            f"  Severe (>{self.threshold * 2} chars): {sum(1 for i in self.issues if i.severity == 'severe')}",
            f"  Moderate ({self.threshold * 1.5}-{self.threshold * 2} chars): {sum(1 for i in self.issues if i.severity == 'moderate')}",
            f"  Minor ({self.threshold}-{self.threshold * 1.5} chars): {sum(1 for i in self.issues if i.severity == 'minor')}",
            "",
            "Detailed Issues:",
            "-" * 30
        ]
        
        for issue in self.issues:
            report_lines.extend([
                f"Line {issue.line_num}: {issue.severity.upper()} ({issue.length} characters)",
                f"  Break suggestions: {len(issue.suggested_breaks)} positions",
                f"  Break reasons: {', '.join(issue.break_reasons)}",
                f"  Preview: {issue.content[:100]}{'...' if len(issue.content) > 100 else ''}",
                ""
            ])
        
        report_text = '\n'.join(report_lines)
        
        if output_path:
            try:
                with open(output_path, 'w', encoding='utf-8') as f:
                    f.write(report_text)
                print(f"Report written to: {output_path}")
            except Exception as e:
                print(f"Error writing report: {e}")
        
        return report_text

def main():
    """Main function for command-line usage."""
    parser = argparse.ArgumentParser(
        description="Detect and fix overly long lines in Markdown documents",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    
    parser.add_argument('input_file', help='Input Markdown file to analyze')
    parser.add_argument('--threshold', type=int, default=150,
                        help='Maximum line length before flagging (default: 150)')
    parser.add_argument('--fix', action='store_true',
                        help='Apply suggested fixes automatically')
    parser.add_argument('--dry-run', action='store_true',
                        help='Show proposed changes without applying them')
    parser.add_argument('--output', help='Output file for fixed content')
    parser.add_argument('--report', help='Generate detailed report file')
    parser.add_argument('--ignore-headers', action='store_true',
                        help='Skip header lines in analysis')
    parser.add_argument('--ignore-code', action='store_true',
                        help='Skip code blocks in analysis')
    parser.add_argument('--min-sentence', type=int, default=40,
                        help='Minimum sentence length to consider for breaks (default: 40)')
    
    args = parser.parse_args()
    
    # Create detector
    detector = LongLineDetector(
        threshold=args.threshold,
        min_sentence_length=args.min_sentence
    )
    
    # Analyze file
    print(f"Analyzing {args.input_file} for lines longer than {args.threshold} characters...")
    issues = detector.analyze_file(
        args.input_file,
        ignore_headers=args.ignore_headers,
        ignore_code=args.ignore_code
    )
    
    if not issues:
        print("No long line issues detected!")
        return 0
    
    print(f"Found {len(issues)} long line issues:")
    
    # Show summary
    severe = sum(1 for i in issues if i.severity == 'severe')
    moderate = sum(1 for i in issues if i.severity == 'moderate')
    minor = sum(1 for i in issues if i.severity == 'minor')
    
    print(f"  Severe: {severe}, Moderate: {moderate}, Minor: {minor}")
    
    # Generate report if requested
    if args.report:
        detector.generate_report(args.report)
    
    # Apply fixes if requested
    if args.fix or args.dry_run:
        detector.fix_file(args.input_file, args.output, dry_run=args.dry_run)
    
    # Show some example issues
    print("\nSample issues:")
    for i, issue in enumerate(issues[:3]):
        print(f"  Line {issue.line_num}: {issue.length} chars ({issue.severity})")
        print(f"    {issue.content[:80]}{'...' if len(issue.content) > 80 else ''}")
    
    if len(issues) > 3:
        print(f"  ... and {len(issues) - 3} more issues")
    
    return 0

if __name__ == "__main__":
    sys.exit(main())
