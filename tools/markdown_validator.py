#!/usr/bin/env python3
"""
Markdown Validator
==================

A tool to perform final validation checks on a Markdown document.

This script checks for:
1. Table integrity (consistent column counts)
2. Excessive blank lines

Author: Jules for TLG Python Tools
Version: 1.0.0
Date: 2025-08-17
"""

import re
from typing import List

class MarkdownValidator:
    """Performs validation checks on Markdown content."""

    def __init__(self):
        self.issues = []

    def analyze_content(self, content: str) -> List[str]:
        """
        Analyzes markdown content for issues.

        Args:
            content: The markdown content as a string.

        Returns:
            A list of issue strings.
        """
        self.issues = []
        lines = content.split('\n')

        self._check_table_integrity(lines)
        self._check_excessive_blank_lines(lines)

        return self.issues

    def _check_table_integrity(self, lines: List[str]):
        """Checks for consistent column counts in tables."""
        in_table = False
        header_cols = 0

        for i, line in enumerate(lines):
            line_num = i + 1
            if not line.strip().startswith('|'):
                in_table = False
                header_cols = 0
                continue

            if not in_table:
                # This is a header row
                in_table = True
                header_cols = len(re.findall(r'\|', line))
                # Check separator line
                if i + 1 < len(lines):
                    separator_line = lines[i+1]
                    if re.match(r'^\s*\|(?:\s*:?-+:?\s*\|)+', separator_line):
                        separator_cols = len(re.findall(r'\|', separator_line))
                        if separator_cols != header_cols:
                            self.issues.append(f"Line {line_num+1}: Table separator has {separator_cols} columns, but header has {header_cols}.")
                else:
                    self.issues.append(f"Line {line_num}: Table header found, but no separator line follows.")
            else:
                # This is a data row
                if not re.match(r'^\s*\|(?:\s*:?-+:?\s*\|)+', line): # ignore separator rows
                    data_cols = len(re.findall(r'\|', line))
                    if data_cols != header_cols:
                        self.issues.append(f"Line {line_num}: Table row has {data_cols} columns, but header has {header_cols}.")

    def _check_excessive_blank_lines(self, lines: List[str]):
        """Checks for more than two consecutive blank lines."""
        blank_line_count = 0
        for i, line in enumerate(lines):
            if not line.strip():
                blank_line_count += 1
            else:
                if blank_line_count > 2:
                    self.issues.append(f"Line {i - blank_line_count + 1}: Found {blank_line_count} consecutive blank lines.")
                blank_line_count = 0

        if blank_line_count > 2:
            self.issues.append(f"Line {len(lines) - blank_line_count + 1}: Found {blank_line_count} consecutive blank lines at end of file.")

def main():
    """Main function for command-line usage."""
    import argparse
    parser = argparse.ArgumentParser(description="Validate a Markdown file.")
    parser.add_argument("file", help="Markdown file to validate")
    args = parser.parse_args()

    try:
        with open(args.file, 'r', encoding='utf-8') as f:
            content = f.read()
    except FileNotFoundError:
        print(f"Error: File '{args.file}' not found.")
        return

    validator = MarkdownValidator()
    issues = validator.analyze_content(content)

    if issues:
        print(f"Found {len(issues)} potential issues in '{args.file}':")
        for issue in issues:
            print(f"- {issue}")
    else:
        print(f"No issues found in '{args.file}'.")

if __name__ == '__main__':
    main()
