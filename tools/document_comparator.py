#!/usr/bin/env python3
"""
Document Comparator - Comparative Document Auditor
===================================================

Implements a four-part diagnostic triad for detecting content loss, structural breaks,
and sequence discontinuities between two versions of a document:

1. Symmetry & Sequence Check - Detects missing sequential elements
2. Structural Parity Check - Identifies incomplete tables, lists, and markup
3. Content Volume Comparison - Measures content density differences
4. Cross-Reference Check - Verifies continuations of multi-part content

Author: Document Processing Tools
Date: 2025-11-02
"""

import argparse
import re
import sys
from pathlib import Path
from typing import List, Dict, Tuple, Set
from dataclasses import dataclass, field
from enum import Enum


class Severity(Enum):
    """Issue severity levels"""
    MINOR = "Minor"
    MODERATE = "Moderate"
    MAJOR = "Major"
    CRITICAL = "Critical"


@dataclass
class ComparisonIssue:
    """Represents a detected issue in document comparison"""
    check_type: str
    severity: Severity
    description: str
    location_doc1: str = ""
    location_doc2: str = ""
    details: Dict = field(default_factory=dict)
    
    def __str__(self):
        loc = ""
        if self.location_doc1 or self.location_doc2:
            loc = f" [Doc1: {self.location_doc1}, Doc2: {self.location_doc2}]"
        return f"[{self.severity.value}] {self.check_type}: {self.description}{loc}"


class DocumentComparator:
    """Main document comparison engine implementing the four diagnostic checks"""
    
    def __init__(self, doc1_path: Path, doc2_path: Path, 
                 volume_threshold: float = 0.15):
        """
        Initialize comparator with two document paths
        
        Args:
            doc1_path: Path to first document (baseline)
            doc2_path: Path to second document (comparison)
            volume_threshold: Percentage threshold for volume comparison (default 15%)
        """
        self.doc1_path = doc1_path
        self.doc2_path = doc2_path
        self.volume_threshold = volume_threshold
        self.issues: List[ComparisonIssue] = []
        
        # Load documents
        with open(doc1_path, 'r', encoding='utf-8') as f:
            self.doc1_content = f.read()
            self.doc1_lines = self.doc1_content.splitlines()
        
        with open(doc2_path, 'r', encoding='utf-8') as f:
            self.doc2_content = f.read()
            self.doc2_lines = self.doc2_content.splitlines()
    
    def run_all_checks(self) -> List[ComparisonIssue]:
        """Execute all four diagnostic checks and return collected issues"""
        print("Running Symmetry & Sequence Check...")
        self.symmetry_sequence_check()
        
        print("Running Structural Parity Check...")
        self.structural_parity_check()
        
        print("Running Content Volume Comparison...")
        self.content_volume_comparison()
        
        print("Running Cross-Reference Check...")
        self.cross_reference_check()
        
        return self.issues
    
    # ========================================================================
    # CHECK 1: Symmetry & Sequence Check
    # ========================================================================
    
    def symmetry_sequence_check(self):
        """
        Scan for sequential identifiers (Part 1/2, Table 2A/2B, Chapter IV/V).
        Flag sequences that stop prematurely or skip expected continuations.
        """
        # Pattern groups for different sequence types
        sequence_patterns = [
            # Part X, Part X/Y
            (r'\bPart\s+(\d+)(?:/(\d+))?\b', 'Part', self._parse_numeric),
            # Chapter with Roman numerals
            (r'\bChapter\s+([IVXLCDM]+)\b', 'Chapter', self._parse_roman),
            # Chapter with Arabic numerals
            (r'\bChapter\s+(\d+)\b', 'Chapter', self._parse_numeric),
            # Table X, Table XA, Table X-Y
            (r'\bTable\s+(\d+)([A-Z]?)\b', 'Table', self._parse_table_id),
            # Section X.Y.Z
            (r'\bSection\s+([\d.]+)\b', 'Section', self._parse_dotted),
            # Appendix A, B, C
            (r'\bAppendix\s+([A-Z])\b', 'Appendix', self._parse_letter),
        ]
        
        for pattern, label, parser in sequence_patterns:
            self._check_sequence_pattern(pattern, label, parser)
    
    def _check_sequence_pattern(self, pattern: str, label: str, parser):
        """Check a specific sequence pattern across both documents"""
        seq1 = self._extract_sequences(self.doc1_content, pattern, parser)
        seq2 = self._extract_sequences(self.doc2_content, pattern, parser)
        
        # Check for missing sequences in doc2 that exist in doc1
        missing_in_doc2 = seq1 - seq2
        if missing_in_doc2:
            for seq in sorted(missing_in_doc2):
                self.issues.append(ComparisonIssue(
                    check_type="Symmetry & Sequence",
                    severity=Severity.MAJOR,
                    description=f"{label} {seq} present in baseline but missing in comparison document",
                    location_doc1=self._find_sequence_location(seq, pattern, self.doc1_lines),
                    location_doc2="Not found",
                    details={'sequence': seq, 'type': label}
                ))
        
        # Check for gaps in sequences
        self._check_sequence_gaps(seq1, label, "Doc1")
        self._check_sequence_gaps(seq2, label, "Doc2")
    
    def _extract_sequences(self, content: str, pattern: str, parser) -> Set:
        """Extract all sequences matching pattern from content"""
        matches = re.finditer(pattern, content, re.IGNORECASE)
        sequences = set()
        for match in matches:
            try:
                parsed = parser(match)
                if parsed:
                    sequences.add(parsed)
            except:
                continue
        return sequences
    
    def _find_sequence_location(self, seq, pattern: str, lines: List[str]) -> str:
        """Find line number where sequence appears"""
        for i, line in enumerate(lines, 1):
            if re.search(pattern, line, re.IGNORECASE):
                return f"Line {i}"
        return "Unknown"
    
    def _check_sequence_gaps(self, sequences: Set, label: str, doc_name: str):
        """Check for gaps in numeric/alphabetic sequences"""
        if not sequences:
            return
        
        # Convert to sortable list
        seq_list = sorted(sequences)
        
        # Check for gaps
        for i in range(len(seq_list) - 1):
            current = seq_list[i]
            next_seq = seq_list[i + 1]
            
            # Try to detect gaps (works for simple numeric sequences)
            if isinstance(current, int) and isinstance(next_seq, int):
                if next_seq - current > 1:
                    missing = list(range(current + 1, next_seq))
                    self.issues.append(ComparisonIssue(
                        check_type="Symmetry & Sequence",
                        severity=Severity.MODERATE,
                        description=f"Gap detected in {label} sequence in {doc_name}: missing {missing}",
                        details={'gap': missing, 'type': label, 'document': doc_name}
                    ))
    
    # Parsers for different sequence types
    def _parse_numeric(self, match) -> int:
        """Parse numeric sequence"""
        return int(match.group(1))
    
    def _parse_roman(self, match) -> int:
        """Parse Roman numeral sequence"""
        roman = match.group(1)
        return self._roman_to_int(roman)
    
    def _parse_table_id(self, match) -> str:
        """Parse table identifier (e.g., 2A, 3B)"""
        num = match.group(1)
        letter = match.group(2) or ''
        return f"{num}{letter}"
    
    def _parse_dotted(self, match) -> str:
        """Parse dotted sequence (e.g., 1.2.3)"""
        return match.group(1)
    
    def _parse_letter(self, match) -> str:
        """Parse letter sequence (A, B, C)"""
        return match.group(1)
    
    @staticmethod
    def _roman_to_int(s: str) -> int:
        """Convert Roman numeral to integer"""
        roman_values = {'I': 1, 'V': 5, 'X': 10, 'L': 50, 'C': 100, 'D': 500, 'M': 1000}
        total = 0
        prev_value = 0
        for char in reversed(s.upper()):
            value = roman_values.get(char, 0)
            if value < prev_value:
                total -= value
            else:
                total += value
            prev_value = value
        return total
    
    # ========================================================================
    # CHECK 2: Structural Parity Check
    # ========================================================================
    
    def structural_parity_check(self):
        """
        Inspect tables and lists for structural completeness.
        Identify hanging/incomplete columns, missing headers, abrupt terminations.
        """
        # Check markdown tables
        self._check_markdown_tables()
        
        # Check HTML tables
        self._check_html_tables()
        
        # Check lists
        self._check_lists()
        
        # Check markup balance
        self._check_markup_balance()
    
    def _check_markdown_tables(self):
        """Check markdown table structure"""
        table_pattern = r'^\|.+\|$'
        
        for doc_name, lines in [("Doc1", self.doc1_lines), ("Doc2", self.doc2_lines)]:
            i = 0
            while i < len(lines):
                line = lines[i].strip()
                if re.match(table_pattern, line):
                    # Found start of table
                    table_start = i + 1
                    table_lines = [line]
                    i += 1
                    
                    # Collect table lines
                    while i < len(lines) and re.match(table_pattern, lines[i].strip()):
                        table_lines.append(lines[i].strip())
                        i += 1
                    
                    # Analyze table structure
                    self._analyze_markdown_table(table_lines, table_start, doc_name)
                else:
                    i += 1
    
    def _analyze_markdown_table(self, table_lines: List[str], line_num: int, doc_name: str):
        """Analyze a markdown table for structural issues"""
        if len(table_lines) < 2:
            self.issues.append(ComparisonIssue(
                check_type="Structural Parity",
                severity=Severity.MAJOR,
                description=f"Incomplete table in {doc_name}: missing header or separator",
                location_doc1=f"Line {line_num}" if doc_name == "Doc1" else "",
                location_doc2=f"Line {line_num}" if doc_name == "Doc2" else "",
                details={'table_lines': len(table_lines)}
            ))
            return
        
        # Check column consistency
        col_counts = [line.count('|') - 1 for line in table_lines]
        expected_cols = col_counts[0]
        
        for i, count in enumerate(col_counts[1:], start=1):
            if count != expected_cols:
                self.issues.append(ComparisonIssue(
                    check_type="Structural Parity",
                    severity=Severity.MAJOR,
                    description=f"Inconsistent column count in {doc_name} table at line {line_num + i}: expected {expected_cols}, got {count}",
                    location_doc1=f"Line {line_num + i}" if doc_name == "Doc1" else "",
                    location_doc2=f"Line {line_num + i}" if doc_name == "Doc2" else "",
                    details={'expected': expected_cols, 'actual': count}
                ))
        
        # Check for separator line
        if len(table_lines) > 1:
            separator = table_lines[1]
            if not re.match(r'^\|[\s\-:]+\|$', separator):
                self.issues.append(ComparisonIssue(
                    check_type="Structural Parity",
                    severity=Severity.MODERATE,
                    description=f"Invalid or missing separator line in {doc_name} table",
                    location_doc1=f"Line {line_num + 1}" if doc_name == "Doc1" else "",
                    location_doc2=f"Line {line_num + 1}" if doc_name == "Doc2" else "",
                ))
    
    def _check_html_tables(self):
        """Check HTML table balance and structure"""
        html_table_pattern = r'<table[^>]*>.*?</table>'
        
        for doc_name, content in [("Doc1", self.doc1_content), ("Doc2", self.doc2_content)]:
            # Find all table tags
            open_tags = len(re.findall(r'<table[^>]*>', content, re.IGNORECASE))
            close_tags = len(re.findall(r'</table>', content, re.IGNORECASE))
            
            if open_tags != close_tags:
                self.issues.append(ComparisonIssue(
                    check_type="Structural Parity",
                    severity=Severity.CRITICAL,
                    description=f"Unbalanced HTML table tags in {doc_name}: {open_tags} opening, {close_tags} closing",
                    details={'open': open_tags, 'close': close_tags}
                ))
    
    def _check_lists(self):
        """Check list structure consistency"""
        for doc_name, lines in [("Doc1", self.doc1_lines), ("Doc2", self.doc2_lines)]:
            i = 0
            while i < len(lines):
                line = lines[i]
                # Check for list item
                list_match = re.match(r'^(\s*)([-*+]|\d+\.)\s+', line)
                if list_match:
                    indent = len(list_match.group(1))
                    list_start = i + 1
                    list_items = [line]
                    i += 1
                    
                    # Collect list items
                    while i < len(lines):
                        next_line = lines[i]
                        if not next_line.strip():
                            i += 1
                            continue
                        if re.match(r'^(\s*)([-*+]|\d+\.)\s+', next_line):
                            list_items.append(next_line)
                            i += 1
                        else:
                            break
                    
                    # Check for abrupt list termination (single item with no content after)
                    if len(list_items) == 1 and i < len(lines) - 1:
                        # Check if next non-empty line looks like it should be part of list
                        next_content = lines[i].strip() if i < len(lines) else ""
                        if next_content and not next_content.startswith('#'):
                            self.issues.append(ComparisonIssue(
                                check_type="Structural Parity",
                                severity=Severity.MINOR,
                                description=f"Possible truncated list in {doc_name}",
                                location_doc1=f"Line {list_start}" if doc_name == "Doc1" else "",
                                location_doc2=f"Line {list_start}" if doc_name == "Doc2" else "",
                            ))
                else:
                    i += 1
    
    def _check_markup_balance(self):
        """Check for balanced markup elements"""
        markup_pairs = [
            (r'\*\*', r'\*\*', 'bold'),
            (r'\*', r'\*', 'italic'),
            (r'`', r'`', 'code'),
            (r'\[', r'\]', 'link'),
        ]
        
        for doc_name, content in [("Doc1", self.doc1_content), ("Doc2", self.doc2_content)]:
            for open_pat, close_pat, name in markup_pairs:
                open_count = len(re.findall(open_pat, content))
                close_count = len(re.findall(close_pat, content))
                
                # For symmetric patterns (like ** or *), count should be even
                if open_pat == close_pat:
                    if open_count % 2 != 0:
                        self.issues.append(ComparisonIssue(
                            check_type="Structural Parity",
                            severity=Severity.MINOR,
                            description=f"Unbalanced {name} markup in {doc_name}: odd count {open_count}",
                            details={'markup': name, 'count': open_count}
                        ))
                else:
                    if open_count != close_count:
                        self.issues.append(ComparisonIssue(
                            check_type="Structural Parity",
                            severity=Severity.MINOR,
                            description=f"Unbalanced {name} markup in {doc_name}: {open_count} open, {close_count} close",
                            details={'markup': name, 'open': open_count, 'close': close_count}
                        ))
    
    # ========================================================================
    # CHECK 3: Content Volume Comparison
    # ========================================================================
    
    def content_volume_comparison(self):
        """
        Measure content density (lines, paragraphs, words) within corresponding sections.
        Flag sections with >threshold deviation without explanation.
        """
        # Overall document comparison
        self._compare_overall_volume()
        
        # Section-by-section comparison
        self._compare_section_volumes()
    
    def _compare_overall_volume(self):
        """Compare overall document metrics"""
        metrics = {
            'lines': (len(self.doc1_lines), len(self.doc2_lines)),
            'words': (len(self.doc1_content.split()), len(self.doc2_content.split())),
            'paragraphs': (
                len([p for p in self.doc1_content.split('\n\n') if p.strip()]),
                len([p for p in self.doc2_content.split('\n\n') if p.strip()])
            ),
            'characters': (len(self.doc1_content), len(self.doc2_content)),
        }
        
        for metric, (val1, val2) in metrics.items():
            if val1 == 0:
                continue
            
            diff_pct = abs(val2 - val1) / val1
            if diff_pct > self.volume_threshold:
                severity = Severity.CRITICAL if diff_pct > 0.30 else Severity.MAJOR
                self.issues.append(ComparisonIssue(
                    check_type="Content Volume",
                    severity=severity,
                    description=f"Large {metric} count difference: Doc1={val1}, Doc2={val2} ({diff_pct*100:.1f}% deviation)",
                    details={'metric': metric, 'doc1': val1, 'doc2': val2, 'deviation': diff_pct}
                ))
    
    def _compare_section_volumes(self):
        """Compare volume metrics section by section"""
        sections1 = self._extract_sections(self.doc1_lines)
        sections2 = self._extract_sections(self.doc2_lines)
        
        # Find common section headings
        headings1 = {s['heading'] for s in sections1}
        headings2 = {s['heading'] for s in sections2}
        
        common = headings1 & headings2
        missing_in_doc2 = headings1 - headings2
        extra_in_doc2 = headings2 - headings1
        
        # Report missing/extra sections
        for heading in missing_in_doc2:
            self.issues.append(ComparisonIssue(
                check_type="Content Volume",
                severity=Severity.MAJOR,
                description=f"Section present in Doc1 but missing in Doc2: '{heading}'",
                details={'heading': heading}
            ))
        
        for heading in extra_in_doc2:
            self.issues.append(ComparisonIssue(
                check_type="Content Volume",
                severity=Severity.MODERATE,
                description=f"Section present in Doc2 but not in Doc1: '{heading}'",
                details={'heading': heading}
            ))
        
        # Compare common sections
        for heading in common:
            sec1 = next(s for s in sections1 if s['heading'] == heading)
            sec2 = next(s for s in sections2 if s['heading'] == heading)
            
            line_count1 = len(sec1['content'])
            line_count2 = len(sec2['content'])
            
            if line_count1 == 0:
                continue
            
            diff_pct = abs(line_count2 - line_count1) / line_count1
            if diff_pct > self.volume_threshold:
                self.issues.append(ComparisonIssue(
                    check_type="Content Volume",
                    severity=Severity.MAJOR,
                    description=f"Section '{heading}' has significant size difference: Doc1={line_count1} lines, Doc2={line_count2} lines ({diff_pct*100:.1f}% deviation)",
                    location_doc1=f"Line {sec1['start_line']}",
                    location_doc2=f"Line {sec2['start_line']}",
                    details={'heading': heading, 'doc1_lines': line_count1, 'doc2_lines': line_count2, 'deviation': diff_pct}
                ))
    
    def _extract_sections(self, lines: List[str]) -> List[Dict]:
        """Extract sections based on headers"""
        sections = []
        current_section = None
        
        for i, line in enumerate(lines, 1):
            # Check for markdown header
            header_match = re.match(r'^(#{1,6})\s+(.+)$', line)
            if header_match:
                # Save previous section
                if current_section:
                    sections.append(current_section)
                
                # Start new section
                level = len(header_match.group(1))
                heading = header_match.group(2).strip()
                current_section = {
                    'heading': heading,
                    'level': level,
                    'start_line': i,
                    'content': []
                }
            elif current_section:
                current_section['content'].append(line)
        
        # Add last section
        if current_section:
            sections.append(current_section)
        
        return sections
    
    # ========================================================================
    # CHECK 4: Cross-Reference Check
    # ========================================================================
    
    def cross_reference_check(self):
        """
        Verify continuations of multi-part content exist.
        When table is titled "Part 1", look for matching keys elsewhere to confirm continuation.
        """
        # Find all "Part X" references
        part_pattern = r'\b(Part\s+\d+)(?:\s+of\s+\d+)?\b'
        
        # Extract multi-part content markers
        self._check_multipart_references()
        
        # Check table continuations
        self._check_table_continuations()
    
    def _check_multipart_references(self):
        """Check for orphaned Part X references"""
        part_pattern = r'\b(Part\s+)(\d+)(?:\s+of\s+(\d+))?\b'
        
        for doc_name, content, lines in [
            ("Doc1", self.doc1_content, self.doc1_lines),
            ("Doc2", self.doc2_content, self.doc2_lines)
        ]:
            parts_found = {}
            
            for match in re.finditer(part_pattern, content, re.IGNORECASE):
                part_num = int(match.group(2))
                total_parts = int(match.group(3)) if match.group(3) else None
                
                if total_parts:
                    if total_parts not in parts_found:
                        parts_found[total_parts] = set()
                    parts_found[total_parts].add(part_num)
            
            # Check for missing parts
            for total, found_parts in parts_found.items():
                expected = set(range(1, total + 1))
                missing = expected - found_parts
                
                if missing:
                    self.issues.append(ComparisonIssue(
                        check_type="Cross-Reference",
                        severity=Severity.MAJOR,
                        description=f"Missing parts in {doc_name}: expected {total} parts, missing {sorted(missing)}",
                        details={'total': total, 'found': sorted(found_parts), 'missing': sorted(missing)}
                    ))
    
    def _check_table_continuations(self):
        """Check for table continuations with cultural/category headers"""
        # Look for tables with "Part 1" and cultural identifiers
        cultural_keywords = [
            'Ottoman', 'Indian', 'Chinese', 'Japanese', 'Arabic', 'Persian',
            'Greek', 'Roman', 'Celtic', 'Norse', 'African', 'Aztec', 'Mayan',
            'European', 'Asian', 'American', 'British', 'French', 'Spanish'
        ]
        
        for doc_name, content, lines in [
            ("Doc1", self.doc1_content, self.doc1_lines),
            ("Doc2", self.doc2_content, self.doc2_lines)
        ]:
            # Find tables with "Part" in heading
            i = 0
            while i < len(lines):
                line = lines[i]
                
                # Check if line contains "Part" and table marker
                if re.search(r'\bPart\s+\d+\b', line, re.IGNORECASE) and '|' in line:
                    # Check if table contains cultural keywords
                    table_content = self._extract_table_content(lines, i)
                    found_keywords = [kw for kw in cultural_keywords 
                                     if kw.lower() in table_content.lower()]
                    
                    if found_keywords:
                        # Check if continuation exists
                        part_match = re.search(r'Part\s+(\d+)', line, re.IGNORECASE)
                        if part_match:
                            part_num = int(part_match.group(1))
                            next_part = f"Part {part_num + 1}"
                            
                            # Look for continuation
                            if next_part.lower() not in content.lower():
                                self.issues.append(ComparisonIssue(
                                    check_type="Cross-Reference",
                                    severity=Severity.CRITICAL,
                                    description=f"Table '{line.strip()[:50]}...' in {doc_name} appears to have continuation (contains {found_keywords}), but '{next_part}' not found",
                                    location_doc1=f"Line {i+1}" if doc_name == "Doc1" else "",
                                    location_doc2=f"Line {i+1}" if doc_name == "Doc2" else "",
                                    details={'part': part_num, 'keywords': found_keywords}
                                ))
                i += 1
    
    def _extract_table_content(self, lines: List[str], start_idx: int, max_lines: int = 50) -> str:
        """Extract table content starting from index"""
        content = []
        for i in range(start_idx, min(start_idx + max_lines, len(lines))):
            line = lines[i].strip()
            if not line or (line and not '|' in line and not re.match(r'^[-:|\s]+$', line)):
                break
            content.append(line)
        return '\n'.join(content)


# ============================================================================
# Report Generation
# ============================================================================

class ReportGenerator:
    """Generate comprehensive comparison reports"""
    
    def __init__(self, issues: List[ComparisonIssue], doc1_path: Path, doc2_path: Path):
        self.issues = issues
        self.doc1_path = doc1_path
        self.doc2_path = doc2_path
    
    def generate_text_report(self) -> str:
        """Generate detailed text report"""
        lines = []
        lines.append("=" * 80)
        lines.append("DOCUMENT COMPARISON REPORT")
        lines.append("=" * 80)
        lines.append(f"Baseline Document:   {self.doc1_path}")
        lines.append(f"Comparison Document: {self.doc2_path}")
        lines.append(f"Total Issues Found:  {len(self.issues)}")
        lines.append("=" * 80)
        lines.append("")
        
        # Group by severity
        by_severity = {}
        for issue in self.issues:
            if issue.severity not in by_severity:
                by_severity[issue.severity] = []
            by_severity[issue.severity].append(issue)
        
        # Report by severity
        for severity in [Severity.CRITICAL, Severity.MAJOR, Severity.MODERATE, Severity.MINOR]:
            if severity not in by_severity:
                continue
            
            issues = by_severity[severity]
            lines.append(f"\n{severity.value.upper()} ISSUES ({len(issues)})")
            lines.append("-" * 80)
            
            for i, issue in enumerate(issues, 1):
                lines.append(f"\n{i}. {issue.check_type}")
                lines.append(f"   {issue.description}")
                if issue.location_doc1:
                    lines.append(f"   Location (Doc1): {issue.location_doc1}")
                if issue.location_doc2:
                    lines.append(f"   Location (Doc2): {issue.location_doc2}")
                if issue.details:
                    lines.append(f"   Details: {issue.details}")
        
        # Summary by check type
        lines.append("\n" + "=" * 80)
        lines.append("SUMMARY BY CHECK TYPE")
        lines.append("=" * 80)
        
        by_check = {}
        for issue in self.issues:
            if issue.check_type not in by_check:
                by_check[issue.check_type] = 0
            by_check[issue.check_type] += 1
        
        for check_type, count in sorted(by_check.items()):
            lines.append(f"{check_type}: {count} issues")
        
        return '\n'.join(lines)
    
    def generate_markdown_report(self) -> str:
        """Generate markdown-formatted report"""
        lines = []
        lines.append("# Document Comparison Report")
        lines.append("")
        lines.append(f"**Baseline Document:** `{self.doc1_path.name}`  ")
        lines.append(f"**Comparison Document:** `{self.doc2_path.name}`  ")
        lines.append(f"**Total Issues Found:** {len(self.issues)}  ")
        lines.append("")
        
        # Group by severity
        by_severity = {}
        for issue in self.issues:
            if issue.severity not in by_severity:
                by_severity[issue.severity] = []
            by_severity[issue.severity].append(issue)
        
        # Report by severity
        for severity in [Severity.CRITICAL, Severity.MAJOR, Severity.MODERATE, Severity.MINOR]:
            if severity not in by_severity:
                continue
            
            issues = by_severity[severity]
            lines.append(f"## {severity.value} Issues ({len(issues)})")
            lines.append("")
            
            for i, issue in enumerate(issues, 1):
                lines.append(f"### {i}. {issue.check_type}")
                lines.append(f"**Description:** {issue.description}  ")
                if issue.location_doc1:
                    lines.append(f"**Location (Doc1):** {issue.location_doc1}  ")
                if issue.location_doc2:
                    lines.append(f"**Location (Doc2):** {issue.location_doc2}  ")
                if issue.details:
                    lines.append(f"**Details:** `{issue.details}`  ")
                lines.append("")
        
        # Summary table
        lines.append("## Summary by Check Type")
        lines.append("")
        lines.append("| Check Type | Issue Count |")
        lines.append("|------------|-------------|")
        
        by_check = {}
        for issue in self.issues:
            if issue.check_type not in by_check:
                by_check[issue.check_type] = 0
            by_check[issue.check_type] += 1
        
        for check_type, count in sorted(by_check.items()):
            lines.append(f"| {check_type} | {count} |")
        
        return '\n'.join(lines)


# ============================================================================
# CLI Interface
# ============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Compare two documents using four-part diagnostic checks",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Compare two versions of a document
  %(prog)s original.md revised.md
  
  # Generate markdown report
  %(prog)s original.md revised.md --format markdown --output report.md
  
  # Adjust volume threshold to 10%%
  %(prog)s original.md revised.md --threshold 0.10
        """
    )
    
    parser.add_argument('doc1', type=Path, help='Baseline document path')
    parser.add_argument('doc2', type=Path, help='Comparison document path')
    parser.add_argument('--threshold', type=float, default=0.15,
                       help='Volume difference threshold (default: 0.15 = 15%%)')
    parser.add_argument('--format', choices=['text', 'markdown'], default='text',
                       help='Report format (default: text)')
    parser.add_argument('--output', '-o', type=Path,
                       help='Output file path (default: print to stdout)')
    parser.add_argument('--quiet', '-q', action='store_true',
                       help='Suppress progress messages')
    
    args = parser.parse_args()
    
    # Validate inputs
    if not args.doc1.exists():
        print(f"Error: Baseline document not found: {args.doc1}", file=sys.stderr)
        return 1
    
    if not args.doc2.exists():
        print(f"Error: Comparison document not found: {args.doc2}", file=sys.stderr)
        return 1
    
    # Run comparison
    if not args.quiet:
        print(f"Comparing documents...")
        print(f"  Baseline:   {args.doc1}")
        print(f"  Comparison: {args.doc2}")
        print()
    
    comparator = DocumentComparator(args.doc1, args.doc2, args.threshold)
    issues = comparator.run_all_checks()
    
    if not args.quiet:
        print(f"\nComparison complete. Found {len(issues)} issues.")
        print()
    
    # Generate report
    reporter = ReportGenerator(issues, args.doc1, args.doc2)
    
    if args.format == 'markdown':
        report = reporter.generate_markdown_report()
    else:
        report = reporter.generate_text_report()
    
    # Output report
    if args.output:
        with open(args.output, 'w', encoding='utf-8') as f:
            f.write(report)
        if not args.quiet:
            print(f"Report written to: {args.output}")
    else:
        print(report)
    
    # Exit with error code if critical/major issues found
    critical_or_major = sum(1 for i in issues 
                           if i.severity in [Severity.CRITICAL, Severity.MAJOR])
    return 1 if critical_or_major > 0 else 0


if __name__ == '__main__':
    sys.exit(main())
