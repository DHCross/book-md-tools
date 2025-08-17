#!/usr/bin/env python3
"""
Markdown Header Depth Corrector
===============================

A tool to fix excessive header depth in Markdown documents, designed for the TLG workflow.

This script:
1. Analyzes the current header structure throughout the document
2. Converts headers deeper than H4 (##### and beyond) to bolded inline text
3. Validates and reports on semantic hierarchy issues
4. Creates a corrected version with proper header depth limits

Features:
- Maintains semantic meaning by converting deep headers to **bold text**
- Logs all header transformations and hierarchy issues
- Preserves document structure and formatting
- Creates backup and reports for review

Usage:
    python markdown_header_depth_corrector.py input_file.md [output_file.md]

Author: TLG Python Tools
Version: 1.1.0
Date: 2025-08-07
"""

import re
import argparse
import logging
from pathlib import Path
from typing import List, Tuple, Dict
from datetime import datetime

class HeaderCorrector:
    """Main class for correcting Markdown header depth."""
    
    def __init__(self, max_depth: int = 4, fix_hierarchy: bool = True):
        """
        Initialize the header corrector.
        
        Args:
            max_depth: Maximum allowed header depth (default: 4 for H4)
            fix_hierarchy: Whether to automatically fix hierarchy issues (default: True)
        """
        self.max_depth = max_depth
        self.fix_hierarchy = fix_hierarchy
        self.corrections_made = 0
        self.hierarchy_corrections = 0
        self.hierarchy_issues = []
        self.header_log = []
        self.version_counter = 1
        
        # Setup logging
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s - %(message)s'
        )
        self.logger = logging.getLogger(__name__)
    
    def analyze_headers(self, content: str) -> Dict:
        """
        Analyze the header structure in the document.
        
        Args:
            content: The markdown content to analyze
            
        Returns:
            Dictionary with analysis results
        """
        header_pattern = r'^(#{1,10})\s+(.+)$'
        headers = []
        
        for line_num, line in enumerate(content.split('\n'), 1):
            match = re.match(header_pattern, line)
            if match:
                level = len(match.group(1))
                text = match.group(2).strip()
                headers.append({
                    'line': line_num,
                    'level': level,
                    'text': text,
                    'original': line
                })
        
        # Analyze depth distribution
        depth_counts = {}
        excessive_headers = []
        
        for header in headers:
            level = header['level']
            depth_counts[level] = depth_counts.get(level, 0) + 1
            
            if level > self.max_depth:
                excessive_headers.append(header)
        
        return {
            'total_headers': len(headers),
            'depth_distribution': depth_counts,
            'excessive_headers': excessive_headers,
            'max_depth_found': max(h['level'] for h in headers) if headers else 0,
            'all_headers': headers
        }
    
    def validate_hierarchy(self, headers: List[Dict]) -> List[str]:
        """
        Validate the semantic hierarchy of headers.
        
        Args:
            headers: List of header dictionaries
            
        Returns:
            List of hierarchy issues found
        """
        issues = []
        
        for i, header in enumerate(headers):
            if i == 0:
                continue
                
            current_level = min(header['level'], self.max_depth)
            prev_level = min(headers[i-1]['level'], self.max_depth)
            
            # Check for skipped levels (jumping more than 1 level down)
            if current_level > prev_level + 1:
                # Only report as issue if not being automatically fixed
                if not self.fix_hierarchy or header.get('hierarchy_corrected', False):
                    issues.append(
                        f"Line {header['line']}: Header jumps from H{prev_level} to H{current_level} "
                        f"(skipped level). Consider using H{prev_level + 1} instead."
                    )
        
        return issues
    
    def correct_header_depth(self, content: str, corrected_headers: List[Dict] = None) -> str:
        """
        Correct excessive header depth in the content.
        
        Args:
            content: Original markdown content
            corrected_headers: Optional list of headers with corrected levels
            
        Returns:
            Corrected markdown content
        """
        lines = content.split('\n')
        corrected_lines = []
        
        header_pattern = r'^(#{1,10})\s+(.+)$'
        header_index = 0
        
        for line_num, line in enumerate(lines, 1):
            match = re.match(header_pattern, line)
            
            if match:
                level = len(match.group(1))
                text = match.group(2).strip()
                
                # Use corrected header level if available
                if corrected_headers and header_index < len(corrected_headers):
                    header_info = corrected_headers[header_index]
                    if header_info['line'] == line_num:
                        level = header_info['level']
                        header_index += 1
                
                if level > self.max_depth:
                    # Convert to bold text
                    corrected_line = f"**{text}**"
                    self.corrections_made += 1
                    
                    # Log the transformation
                    log_entry = {
                        'line': line_num,
                        'original_level': len(match.group(1)),
                        'text': text,
                        'action': 'converted_to_bold',
                        'new_content': corrected_line
                    }
                    self.header_log.append(log_entry)
                    
                    self.logger.info(
                        f"Line {line_num}: Converted H{len(match.group(1))} '{text}' to bold text"
                    )
                    
                    corrected_lines.append(corrected_line)
                else:
                    # Keep as header, but possibly with corrected level
                    header_prefix = '#' * level
                    corrected_line = f"{header_prefix} {text}"
                    
                    # Log hierarchy correction if level was changed
                    if level != len(match.group(1)):
                        self.logger.info(
                            f"Line {line_num}: Header level corrected H{len(match.group(1))} → H{level} "
                            f"for '{text}'"
                        )
                    
                    corrected_lines.append(corrected_line)
            else:
                # Non-header line, keep as-is
                corrected_lines.append(line)
        
        return '\n'.join(corrected_lines)
    
    def fix_header_hierarchy(self, headers: List[Dict]) -> List[Dict]:
        """
        Fix hierarchy issues by adjusting header levels.
        
        Args:
            headers: List of header dictionaries
            
        Returns:
            List of headers with corrected hierarchy
        """
        if not self.fix_hierarchy or not headers:
            return headers
        
        corrected_headers = []
        
        for i, header in enumerate(headers):
            corrected_header = header.copy()
            
            if i == 0:
                # First header stays as-is
                corrected_headers.append(corrected_header)
                continue
            
            current_level = header['level']
            prev_level = corrected_headers[i-1]['level']
            
            # Check for skipped levels (jumping more than 1 level down)
            if current_level > prev_level + 1:
                # Adjust to be one level deeper than previous
                new_level = prev_level + 1
                
                # Don't exceed max depth for hierarchy corrections
                if new_level <= self.max_depth:
                    corrected_header['level'] = new_level
                    corrected_header['hierarchy_corrected'] = True
                    
                    self.hierarchy_corrections += 1
                    
                    # Log the hierarchy correction
                    hierarchy_log = {
                        'line': header['line'],
                        'original_level': current_level,
                        'corrected_level': new_level,
                        'text': header['text'],
                        'action': 'hierarchy_corrected'
                    }
                    self.header_log.append(hierarchy_log)
                    
                    self.logger.info(
                        f"Line {header['line']}: Hierarchy corrected H{current_level} → H{new_level} "
                        f"for '{header['text']}'"
                    )
                else:
                    # If correction would exceed max depth, keep original but note the issue
                    issue = (
                        f"Line {header['line']}: Header would jump from H{prev_level} to H{current_level} "
                        f"(skipped level), but correction to H{new_level} exceeds max depth {self.max_depth}"
                    )
                    self.hierarchy_issues.append(issue)
            
            corrected_headers.append(corrected_header)
        
        return corrected_headers

    def generate_report(self, analysis: Dict, output_file: Path) -> str:
        """
        Generate a detailed report of the corrections made.
        
        Args:
            analysis: Analysis results from analyze_headers()
            output_file: Path to the output file
            
        Returns:
            Report content as string
        """
        report_lines = [
            "# Markdown Header Depth Correction Report",
            f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
            f"Input file analyzed with {analysis['total_headers']} total headers",
            "",
            "## Summary",
            f"- Total headers found: {analysis['total_headers']}",
            f"- Maximum depth found: H{analysis['max_depth_found']}",
            f"- Headers corrected: {self.corrections_made}",
            f"- Hierarchy corrections: {self.hierarchy_corrections}",
            f"- Hierarchy issues detected: {len(self.hierarchy_issues)}",
            "",
            "## Header Depth Distribution (Before Correction)",
        ]
        
        for level in sorted(analysis['depth_distribution'].keys()):
            count = analysis['depth_distribution'][level]
            status = " (EXCESSIVE)" if level > self.max_depth else ""
            report_lines.append(f"- H{level}: {count} headers{status}")
        
        if analysis['excessive_headers']:
            report_lines.extend([
                "",
                "## Excessive Headers Corrected",
                f"The following {len(analysis['excessive_headers'])} headers were converted to bold text:",
                ""
            ])
            
            for header in analysis['excessive_headers']:
                report_lines.append(
                    f"- Line {header['line']}: H{header['level']} '{header['text']}'"
                )
        
        if self.hierarchy_issues:
            report_lines.extend([
                "",
                "## Hierarchy Issues Detected",
                "The following potential hierarchy issues were found:",
                ""
            ])
            
            for issue in self.hierarchy_issues:
                report_lines.append(f"- {issue}")
        
        if self.header_log:
            report_lines.extend([
                "",
                "## Detailed Transformation Log",
                ""
            ])
            
            for entry in self.header_log:
                report_lines.append(
                    f"Line {entry['line']}: H{entry['original_level']} "
                    f"'{entry.get('text', entry.get('original_text', 'unknown'))}' → {entry['action']}"
                )
        
        if self.hierarchy_corrections > 0:
            hierarchy_corrections = [entry for entry in self.header_log if entry.get('action') == 'hierarchy_corrected']
            if hierarchy_corrections:
                report_lines.extend([
                    "",
                    "## Hierarchy Corrections Made",
                    f"The following {len(hierarchy_corrections)} headers had their hierarchy corrected:",
                    ""
                ])
                
                for entry in hierarchy_corrections:
                    report_lines.append(
                        f"- Line {entry['line']}: H{entry['original_level']} → H{entry['corrected_level']} "
                        f"'{entry['text']}'"
                    )

        report_lines.extend([
            "",
            "## Recommendations",
            "1. Review the corrected document to ensure semantic meaning is preserved",
            "2. Consider restructuring sections with many converted headers",
            "3. Use consistent header hierarchy throughout the document", 
            "4. Limit header depth to H4 maximum for better readability",
            "5. Verify that hierarchy corrections maintain logical document flow",
            "",
            f"Corrected file saved as: {output_file.name}"
        ])
        
        return '\n'.join(report_lines)
    
    def process_file(self, input_file: Path, output_file: Path = None) -> Tuple[Path, Path]:
        """
        Process a markdown file to correct header depth.
        
        Args:
            input_file: Path to input markdown file
            output_file: Path to output file (optional)
            
        Returns:
            Tuple of (output_file_path, report_file_path)
        """
        if not input_file.exists():
            raise FileNotFoundError(f"Input file not found: {input_file}")
        
        # Set default output file if not provided
        if output_file is None:
            output_file = self.generate_versioned_filename(input_file)
        
        self.logger.info(f"Processing: {input_file}")
        
        # Read input file
        try:
            with open(input_file, 'r', encoding='utf-8') as f:
                content = f.read()
        except UnicodeDecodeError:
            # Try with different encoding
            with open(input_file, 'r', encoding='latin-1') as f:
                content = f.read()
        
        # Analyze headers
        self.logger.info("Analyzing header structure...")
        analysis = self.analyze_headers(content)
        
        # Fix hierarchy issues first
        corrected_headers = None
        if self.fix_hierarchy:
            self.logger.info("Fixing header hierarchy...")
            corrected_headers = self.fix_header_hierarchy(analysis['all_headers'])
        
        # Validate hierarchy (after corrections)
        self.logger.info("Validating header hierarchy...")
        headers_to_validate = corrected_headers if corrected_headers else analysis['all_headers']
        self.hierarchy_issues = self.validate_hierarchy(headers_to_validate)
        
        # Correct header depth
        self.logger.info("Correcting header depth...")
        corrected_content = self.correct_header_depth(content, corrected_headers)
        
        # Write corrected file
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(corrected_content)
        
        self.logger.info(f"Corrected file saved: {output_file}")
        
        # Generate and save report
        # Create versioned report filename to match output file
        if "_v" in output_file.stem:
            # Extract version from output filename
            version_match = re.search(r'_v(\d+)$', output_file.stem)
            if version_match:
                version = version_match.group(1)
                report_base = output_file.stem.replace(f"_v{version}", "")
                report_file = output_file.parent / f"{report_base}_report_v{version}.md"
            else:
                report_file = output_file.parent / f"{output_file.stem}_report.md"
        else:
            report_file = output_file.parent / f"{output_file.stem}_report.md"
        report_content = self.generate_report(analysis, output_file)
        
        with open(report_file, 'w', encoding='utf-8') as f:
            f.write(report_content)
        
        self.logger.info(f"Report saved: {report_file}")
        
        # Print summary
        print(f"\n=== Header Correction Complete ===")
        print(f"Input file: {input_file}")
        print(f"Output file: {output_file}")
        print(f"Report file: {report_file}")
        print(f"Headers corrected: {self.corrections_made}")
        print(f"Hierarchy corrections: {self.hierarchy_corrections}")
        print(f"Hierarchy issues remaining: {len(self.hierarchy_issues)}")
        
        return output_file, report_file

    def process_content(self, content: str) -> Tuple[str, str]:
        """
        Process markdown content in-memory to correct header depth.

        Args:
            content: The markdown content as a string.

        Returns:
            Tuple of (corrected_content_string, report_string)
        """
        self.logger.info("Processing content in-memory...")

        # Analyze headers
        analysis = self.analyze_headers(content)

        # Fix hierarchy issues first
        corrected_headers = None
        if self.fix_hierarchy:
            self.logger.info("Fixing header hierarchy...")
            corrected_headers = self.fix_header_hierarchy(analysis['all_headers'])

        # Validate hierarchy (after corrections)
        self.logger.info("Validating header hierarchy...")
        headers_to_validate = corrected_headers if corrected_headers else analysis['all_headers']
        self.hierarchy_issues = self.validate_hierarchy(headers_to_validate)

        # Correct header depth
        self.logger.info("Correcting header depth...")
        corrected_content = self.correct_header_depth(content, corrected_headers)

        # Generate report
        # We don't have a real output file path, so we'll use a placeholder.
        report_content = self.generate_report(analysis, Path("in-memory-output.md"))

        self.logger.info("In-memory processing complete.")

        return corrected_content, report_content

    def get_next_version(self, base_path: Path, suffix: str = "_header_corrected") -> int:
        """
        Determine the next version number based on existing files.
        
        Args:
            base_path: Base path for the file (without extension)
            suffix: Suffix to look for in existing files
            
        Returns:
            Next version number to use
        """
        version = 1
        parent_dir = base_path.parent
        base_name = base_path.stem
        
        # Look for existing versioned files
        pattern = f"{base_name}{suffix}_v*.md"
        existing_files = list(parent_dir.glob(pattern))
        
        if existing_files:
            # Extract version numbers from existing files
            versions = []
            for file in existing_files:
                # Extract version from filename like "filename_header_corrected_v2.md"
                match = re.search(r'_v(\d+)\.md$', file.name)
                if match:
                    versions.append(int(match.group(1)))
            
            if versions:
                version = max(versions) + 1
        
        return version
    
    def generate_versioned_filename(self, input_file: Path, output_file: Path = None, suffix: str = "_header_corrected") -> Path:
        """
        Generate a versioned filename for output.
        
        Args:
            input_file: Original input file path
            output_file: Requested output file (optional)
            suffix: Suffix to add to filename
            
        Returns:
            Versioned output file path
        """
        if output_file:
            # If user provided specific output file, use it as-is
            return output_file
        
        # Auto-generate versioned filename
        base_name = input_file.stem
        version = self.get_next_version(input_file, suffix)
        versioned_name = f"{base_name}{suffix}_v{version}.md"
        
        return input_file.parent / versioned_name

def main():
    """Main function for command-line usage."""
    parser = argparse.ArgumentParser(
        description="Correct excessive header depth in Markdown documents",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python markdown_header_depth_corrector.py document.md
  python markdown_header_depth_corrector.py input.md output.md
  python markdown_header_depth_corrector.py document.md --max-depth 3
  
Output files will be automatically versioned (e.g., document_header_corrected_v1.md, 
document_header_corrected_v2.md) unless a specific output filename is provided.
        """
    )
    
    parser.add_argument(
        'input_file',
        type=Path,
        help='Input Markdown file to process'
    )
    
    parser.add_argument(
        'output_file',
        type=Path,
        nargs='?',
        help='Output file path (optional, defaults to input_file_header_corrected_v[N].md)'
    )
    
    parser.add_argument(
        '--max-depth',
        type=int,
        default=4,
        help='Maximum allowed header depth (default: 4 for H4)'
    )
    
    parser.add_argument(
        '--no-fix-hierarchy',
        action='store_true',
        help='Disable automatic hierarchy correction'
    )
    
    args = parser.parse_args()
    
    # Create corrector instance
    corrector = HeaderCorrector(
        max_depth=args.max_depth,
        fix_hierarchy=not args.no_fix_hierarchy
    )
    
    try:
        # Process the file
        output_file, report_file = corrector.process_file(args.input_file, args.output_file)
        
        print(f"\nSuccess! Files created:")
        print(f"  Corrected document: {output_file}")
        print(f"  Detailed report: {report_file}")
        
    except Exception as e:
        print(f"Error: {e}")
        return 1
    
    return 0

if __name__ == '__main__':
    exit(main())
