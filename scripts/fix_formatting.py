#!/usr/bin/env python3
"""
Comprehensive Markdown formatting and normalization tool.

This utility handles a wide range of formatting issues in Markdown files,
including but not limited to:

1. Merged words and spacing fixes
2. Chapter/section header normalization
3. Paragraph and line break fixes
4. Header depth correction
5. Advanced break fixing (mid-word, hyphenated words, etc.)
6. Markdown cleanup and validation
7. Paragraph normalization and wrapping
8. Ghost blank line removal

The script is designed to be safe and conservative, preserving code blocks,
URLs, and other special Markdown constructs while fixing common formatting issues.
"""
from __future__ import annotations

import argparse
import logging
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple, Pattern, Match, Callable, Any, Union, Set

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger(__name__)

# Constants for paragraph handling
STRUCTURAL_PREFIXES = ("#", "*", "-", ">", "|", "{{", "```")
DEFAULT_MAX_PARAGRAPH_LENGTH = 800

# --- Configuration -------------------------------------------------------

# Explicit replacements for known merge errors observed in Chapter 2.
EXPLICIT_REPLACEMENTS: Tuple[Tuple[str, str], ...] = (
    ("implementedstrict", "implemented strict"),
    ("TheAle Hallserves", "The Ale Hall serves"),
    ("thebaiting pits", "the baiting pits"),
    ("sutlers).While", "sutlers). While"),
    ("particularcommunity", "particular community"),
    ("citystate", "city-state"),
    ("city'sinner", "city's inner"),
    ("Yggsburgh'sEntertainment", "Yggsburgh's Entertainment"),
    ("Farthingale,a", "Farthingale, a"),
    ("Exotic Menagerie,a", "Exotic Menagerie, a"),
    ("adventurer con", "adventurer connections"),
    ("system\u202Fneutral", "system-neutral"),
    ("role\u202Fplaying", "role-playing"),
    ("usest_he", "uses the"),
    ("som_e", "some"),
    ("tradesmenprobably", "tradesmen probably"),
    ("Entertainmentplaces", "Entertainment places"),
    ("guildsmight", "guilds might"),
    ("Merchantslikely", "Merchants likely"),
    ("Serviceplaces", "Service places"),
    ("Scholarswill", "Scholars will"),
    ("Themerchant", "The merchant"),
    ("Inthe", "In the"),
)

# Patterns we should not tamper with (URLs, code, markdown emphasis, etc.).
PRESERVE_PATTERNS: Tuple[re.Pattern[str], ...] = (
    re.compile(r"`[^`]+`"),  # inline code
    re.compile(r"```"),  # fenced code blocks markers
    re.compile(r"https?://"),  # URLs
    re.compile(r"\b[A-Z]{2,}\b"),  # acronyms (e.g., "GFW")
)

# Generic regular-expression rules applied after explicit replacements.
GENERIC_FIXES: Tuple[Tuple[re.Pattern[str], str], ...] = (
    # lowercase letter immediately followed by uppercase letter
    (re.compile(r"([a-z])([A-Z])"), r"\1 \2"),
    # lowercase letter followed by digit
    (re.compile(r"([a-z])([0-9])"), r"\1 \2"),
    # digit followed by letter
    (re.compile(r"([0-9])([A-Za-z])"), r"\1 \2"),
    # punctuation immediately followed by letter (missing space)
    (re.compile(r"([.!?])([A-Za-z])"), r"\1 \2"),
    # all-caps word immediately followed by Title Case word
    (re.compile(r"([A-Z]{3,})([A-Z][a-z])"), r"\1 \2"),
)

KEYWORD_BREAK_RULES: Tuple[Tuple[re.Pattern[str], str], ...] = (
    (
        re.compile(r"(?<!\n\n)(General Adventure Hooks[_:]?)", re.IGNORECASE),
        r"\n\n\1\n",
    ),
    (
        re.compile(r"(?<!\n\n)(Specific to [^_\n:]*[_:]?)", re.IGNORECASE),
        r"\n\n\1\n",
    ),
    (
        re.compile(r"(?<!\n\n)(Adventure Hooks for [^_\n:]*[_:]?)", re.IGNORECASE),
        r"\n\n\1\n",
    ),
    (
        re.compile(r"(?<!\n\n)(Adventure Hooks General[_:]?)", re.IGNORECASE),
        r"\n\n\1\n",
    ),
)

UPPERCASE_SECTION_PATTERN = re.compile(
    r"([.!?])\s*([A-Z][A-Z ]{2,})(?=[A-Z][a-z])"
)

CHAPTER_HEADER_PATTERN = re.compile(r"^(##\s+Chapter\s+\d+:\s*.*)$", re.IGNORECASE)


@dataclass
class ChangeRecord:
    """Record of a single change made during formatting."""

    line_number: int
    original: str
    new: str
    change_type: str = "formatting"

    def __str__(self) -> str:
        return f"[{self.change_type.upper()}] Line {self.line_number}: {self.original!r} -> {self.new!r}"


class MarkdownFormattingFixer:
    """Comprehensive Markdown formatter that combines multiple formatting tools:
    - Merged words and spacing fixes
    - Chapter/section header normalization
    - Paragraph and line break fixes
    - Header depth correction
    - Advanced break fixing (mid-word, hyphenated words, etc.)
    - Markdown cleanup and validation
    - Paragraph normalization and wrapping
    - Ghost blank line removal
    """

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        """Initialize the formatter with optional configuration.
        
        Args:
            config: Configuration dictionary with options like:
                - max_header_depth: Maximum header depth to allow (default: 4)
                - fix_hierarchy: Whether to fix header hierarchy (default: True)
                - enable_break_fixing: Whether to enable advanced break fixing (default: True)
                - enable_cleanup: Whether to enable markdown cleanup (default: True)
                - max_paragraph_length: Maximum paragraph length before splitting (default: 800)
                - normalize_paragraphs: Whether to normalize paragraphs (default: True)
                - fix_ghost_blanks: Whether to fix ghost blank lines (default: True)
        """
        self.changes: List[ChangeRecord] = []
        self.config = {
            'max_header_depth': 4,
            'fix_hierarchy': True,
            'enable_break_fixing': True,
            'enable_cleanup': True,
            'max_paragraph_length': 800,
            'normalize_paragraphs': True,
            'fix_ghost_blanks': True,
            'in_place': False,
            **(config or {})
        }
        
        # Initialize regex patterns
        self.patterns = self._compile_patterns()
        
        # Initialize components
        self._init_break_fixer()
        self._init_header_corrector()
        
        # Explicit replacements table (base + optional config overrides)
        self.explicit_map: List[Tuple[str, str]] = list(EXPLICIT_REPLACEMENTS)
        extra_replacements = self.config.get('explicit_replacements', [])
        if isinstance(extra_replacements, dict):
            self.explicit_map.extend(extra_replacements.items())
        elif isinstance(extra_replacements, (list, tuple)):
            self.explicit_map.extend(extra_replacements)
    
    def _compile_patterns(self) -> Dict[str, Pattern]:
        """Compile and return all regex patterns used in the formatter."""
        return {
            # Existing patterns
            'ghost_blank': re.compile(
                r"([^\n.!?\"\'\)\]\-])\n(?:[ \t]*\n)+([ \t]*[a-z])",
                flags=re.MULTILINE | re.IGNORECASE
            ),
            'multi_newline': re.compile(r"\n{3,}"),
            'toc_fix': re.compile(
                r"(# I Table of Contents for Essential Places)\s*(\{\{TOC\}\})\s*(Like everyone)"
            ),
            'sentence_breaks': re.compile(
                r'(?<=[.!?])\s+(?=[A-Z])|(?<=\w\.)\s+(?=[A-Z][a-z])'
            ),
            'list_item': re.compile(r'^\s*[*\-+]\s+'),
            'code_fence': re.compile(r'^\s*```'),
            'header': re.compile(r'^#+\s+'),
            'blockquote': re.compile(r'^\s*>'),
            'html_tag': re.compile(r'<[^>]+>'),
            'link': re.compile(r'\[([^\]]+)\]\([^)]+\)'),
            'image': re.compile(r'!\[([^\]]*)\]\([^)]+\)')
        }

    def _init_break_fixer(self):
        """Initialize the advanced break fixing component."""
        self.enable_break_fixing = self.config.get('enable_break_fixing', True)
        self.break_fixes = []
        
        # Patterns for detecting line breaks that need fixing
        self.break_patterns = [
            # Mid-word breaks (e.g., "tradesmen" / "probably")
            (r'([a-z])([A-Z][a-z])', r'\1 \2'),
            # Hyphenated word splits (e.g., "heavy-" / "handed")
            (r'([a-z])-\s+([a-z])', r'\1-\2'),
            # Lines starting with continuation words
            (r'\n\s*([a-z]+)(?=\s+[a-z])', self._handle_continuation_word)
        ]
        
        # Compile patterns for better performance
        self.compiled_patterns = [(re.compile(pattern[0]), pattern[1]) 
                               for pattern in self.break_patterns]
    
    def _init_header_corrector(self):
        """Initialize the header correction component."""
        self.max_header_depth = self.config.get('max_header_depth', 4)
        self.fix_hierarchy = self.config.get('fix_hierarchy', True)
        
        # Header patterns
        self.header_pattern = re.compile(r'^(#+)\s+(.*)$')
        self.header_levels = []  # Track header levels for hierarchy
        
    def _handle_continuation_word(self, match):
        """Handle lines starting with continuation words."""
        word = match.group(1).lower()
        if word in ['and', 'or', 'but', 'yet', 'so', 'for', 'nor']:
            return f' {word}'
        return f'\n{match.group(1)}'
    
    def _should_skip_line(self, line: str) -> bool:
        """Return True if the line should not be altered."""
        stripped = line.strip()
        if not stripped or stripped.startswith("```"):
            return True
            
        # Skip code blocks, tables, and other special markdown
        for pattern in PRESERVE_PATTERNS:
            if pattern.search(line):
                return True
                
        return False

    # ------------------------------------------------------------------
    def _apply_explicit_replacements(self, line: str) -> str:
        updated = line
        for old, new in self.explicit_map:
            if old in updated:
                updated = updated.replace(old, new)
        return updated

    # ------------------------------------------------------------------
    def _apply_generic_rules(self, line: str) -> str:
        updated = line
        for pattern, replacement in GENERIC_FIXES:
            updated = pattern.sub(replacement, updated)
        return updated

    # ------------------------------------------------------------------
    def _fix_line_breaks(self, text: str) -> str:
        """Fix various line break issues in the text."""
        if not text.strip():
            return text
            
        # Apply all break fix patterns
        for pattern, replacement in self.compiled_patterns:
            if callable(replacement):
                text = pattern.sub(replacement, text)
            else:
                text = pattern.sub(replacement, text)
                
        # Fix hyphenated word splits across lines
        text = re.sub(r'([a-zA-Z])-\s+([a-zA-Z])', r'\1\2', text)
        
        return text
        
    # ------------------------------------------------------------------
    def _correct_headers(self, line: str) -> str:
        """Correct header levels and hierarchy."""
        if not line.startswith('#'):
            return line
            
        match = self.header_pattern.match(line)
        if not match:
            return line
            
        level = len(match.group(1))
        content = match.group(2).strip()
        
        # Enforce maximum header depth
        if level > self.max_header_depth:
            # Convert to bold text instead of header
            return f'**{content}**'
            
        # Track header hierarchy if enabled
        if self.fix_hierarchy:
            while self.header_levels and self.header_levels[-1] >= level:
                self.header_levels.pop()
            self.header_levels.append(level)
            
            # Ensure proper hierarchy (no skipping levels)
            if len(self.header_levels) > 1 and level > self.header_levels[-2] + 1:
                level = self.header_levels[-2] + 1
                
        return f'{"#" * level} {content}'
        
    # ------------------------------------------------------------------
    def _fix_chapter_header(self, line: str) -> Optional[str]:
        """Fix chapter header formatting."""
        match = CHAPTER_HEADER_PATTERN.match(line)
        if not match:
            return None
        original = match.group(1)
        return original[1:]  # Drop one leading '#'

    # ------------------------------------------------------------------
    def process_line(self, line: str, line_number: int) -> str:
        """Process a single line of markdown with all enabled formatters."""
        if self._should_skip_line(line):
            return line
            
        updated = line
        
        # Track original for change detection
        original = line
        
        # Apply explicit replacements
        updated = self._apply_explicit_replacements(updated)
        
        # Apply generic rules
        updated = self._apply_generic_rules(updated)
        
        # Apply advanced break fixing if enabled
        if self.enable_break_fixing:
            updated = self._fix_line_breaks(updated)
            
        # Apply header correction
        updated = self._correct_headers(updated)
        
        # Apply keyword breaks
        updated = self._apply_keyword_breaks(updated)
        
        # Apply uppercase section breaks
        updated = self._apply_uppercase_section_breaks(updated)
        
        # Normalize special labels
        updated = self._normalize_special_labels(updated)
        # Remove stray underscores that leak into prose
        updated = self._strip_extraneous_underscores(updated)
        # Restore missing paragraph breaks caused by OCR artifacts
        updated = self._restore_paragraph_breaks(updated)
        
        # Record changes if any were made
        if updated != original:
            self.changes.append(ChangeRecord(line_number, original, updated))
            
        return updated

    # ------------------------------------------------------------------
    def fix_content(self, content: str) -> str:
        """Apply all formatting fixes to the content."""
        # Track original line count for change reporting
        original_lines = content.splitlines()
        line_map = {i: i+1 for i in range(len(original_lines))}
        
        # Apply fixes in sequence
        result = content
        
        # 1. Merge wrapped lines and fix ghost blanks
        if self.config.get('fix_ghost_blanks', True):
            result = self.merge_wrapped_lines(result)
        
        # 2. Apply explicit replacements
        for original, replacement in self.explicit_map:
            if original in result:
                result = result.replace(original, replacement)
        
        # 3. Apply generic fixes
        for pattern, repl in GENERIC_FIXES:
            result = pattern.sub(repl, result)
        
        # 4. Split long paragraphs
        if self.config.get('normalize_paragraphs', True):
            result = self.split_long_paragraphs(result)
        
        # 5. Process individual lines for line-specific fixes
        lines = result.splitlines()
        processed_lines = []
        
        for i, line in enumerate(lines):
            if not line.strip():
                processed_lines.append("")
                continue
                
            # Skip processing for code blocks and other structural elements
            if self.is_structural_line(line):
                processed_lines.append(line)
                continue
                
            # Apply line-specific processing
            processed_line = self.process_line(line, i+1)
            processed_lines.append(processed_line)
        
        # 6. Ensure proper spacing between sections
        final_lines = []
        for i, line in enumerate(processed_lines):
            if i > 0 and line and processed_lines[i-1] and \
               not any(processed_lines[i-1].strip().startswith(p) for p in STRUCTURAL_PREFIXES) and \
               not any(line.startswith(p) for p in STRUCTURAL_PREFIXES):
                final_lines.append("")
            final_lines.append(line)
        
        return "\n".join(final_lines)

    # ------------------------------------------------------------------
    def is_structural_line(self, line: str) -> bool:
        """Check if a line is a structural Markdown element."""
        stripped = line.strip()
        if not stripped:
            return True
            
        return any(
            pattern.search(stripped)
            for pattern in [
                self.patterns['list_item'],
                self.patterns['code_fence'],
                self.patterns['header'],
                self.patterns['blockquote']
            ]
        ) or stripped.startswith(STRUCTURAL_PREFIXES)
    
    def merge_wrapped_lines(self, text: str) -> str:
        """Merge lines that are part of the same logical paragraph."""
        if not self.config.get('fix_ghost_blanks', True):
            return text
            
        lines = text.split("\n")
        merged_lines = []
        buffer = []
        in_code_block = False
        in_html_block = False
        html_tag_stack = []
        line_number = 1

        for line in lines:
            stripped = line.strip()
            original_indent = line[:len(line) - len(line.lstrip())] if line else ""

            # Handle code blocks
            if self.patterns['code_fence'].match(line):
                in_code_block = not in_code_block
                if buffer:
                    merged_lines.append(" ".join(buffer).strip())
                    buffer = []
                merged_lines.append(line)
                continue

            # Skip processing inside code blocks
            if in_code_block:
                merged_lines.append(line)
                continue

            # Handle HTML blocks
            if '<' in line and '>' in line and not in_html_block:
                in_html_block = True
                html_tag_stack = []
                
            if in_html_block:
                # Track HTML tags to detect block boundaries
                for match in self.patterns['html_tag'].finditer(line):
                    tag = match.group(0)
                    if tag.startswith('</'):
                        if html_tag_stack and html_tag_stack[-1] == tag[2:-1]:
                            html_tag_stack.pop()
                    elif tag.endswith('/>'):
                        continue  # Self-closing tag
                    else:
                        # Extract tag name (handling attributes)
                        tag_name = tag[1:].split(' ')[0].rstrip('>')
                        if tag_name not in ['br', 'hr', 'img', 'meta', 'link']:
                            html_tag_stack.append(tag_name)
                
                if not html_tag_stack:
                    in_html_block = False
                
                if buffer:
                    merged_lines.append(" ".join(buffer).strip())
                    buffer = []
                merged_lines.append(line)
                continue

            # Handle structural lines
            if self.is_structural_line(line):
                if buffer:
                    merged_lines.append(" ".join(buffer).strip())
                    buffer = []
                merged_lines.append(line)
                continue

            # Handle regular text lines
            if not stripped:
                if buffer:
                    merged_lines.append(" ".join(buffer).strip())
                    buffer = []
                merged_lines.append("")
            else:
                buffer.append(stripped)
            
            line_number += 1

        # Add any remaining buffered content
        if buffer:
            merged_lines.append(" ".join(buffer).strip())

        # Join with proper spacing
        result = []
        for i, line in enumerate(merged_lines):
            if i > 0 and line and result and result[-1] and not any(
                result[-1].strip().startswith(prefix) 
                for prefix in STRUCTURAL_PREFIXES
            ) and not line.startswith(STRUCTURAL_PREFIXES):
                result.append("")
            result.append(line)
        
        return "\n".join(result)
    
    def split_long_paragraphs(self, text: str) -> str:
        """Split paragraphs longer than max_length at sentence boundaries."""
        if not self.config.get('normalize_paragraphs', True):
            return text
            
        max_length = self.config.get('max_paragraph_length', 800)
        lines = text.split("\n")
        result = []
        current_para = []
        
        for line in lines:
            stripped = line.strip()
            
            # Skip processing for structural lines
            if self.is_structural_line(line):
                # If we have a paragraph in progress, process it first
                if current_para:
                    result.extend(self._process_paragraph(" ".join(current_para)))
                    current_para = []
                result.append(line)
                continue
                
            # Skip empty lines
            if not stripped:
                if current_para:
                    result.extend(self._process_paragraph(" ".join(current_para)))
                    result.append("")
                    current_para = []
                else:
                    result.append("")
                continue
                
            # Add to current paragraph
            current_para.append(stripped)
        
        # Process any remaining paragraph
        if current_para:
            result.extend(self._process_paragraph(" ".join(current_para)))
        
        return "\n".join(result)
    
    def _process_paragraph(self, text: str) -> List[str]:
        """Process a single paragraph, splitting if necessary."""
        max_length = self.config.get('max_paragraph_length', 800)
        
        # Skip if under length limit
        if len(text) <= max_length:
            return [text]
            
        # Try to split at sentence boundaries
        sentences = self.patterns['sentence_breaks'].split(text)
        if len(sentences) > 1:
            result = []
            current = ""
            
            for i in range(0, len(sentences), 2):
                sentence = sentences[i]
                if i + 1 < len(sentences):
                    sentence += sentences[i+1]
                    
                if len(current) + len(sentence) > max_length and current:
                    result.append(current.strip())
                    current = sentence
                else:
                    if current:
                        current += " " + sentence
                    else:
                        current = sentence
            
            if current:
                result.append(current.strip())
                
            return result if len(result) > 1 else [text]
        
        # If no good sentence breaks, split at spaces
        words = text.split()
        result = []
        current = []
        current_len = 0
        
        for word in words:
            if current_len + len(word) + len(current) > max_length and current:
                result.append(" ".join(current))
                current = [word]
                current_len = len(word)
            else:
                current.append(word)
                current_len += len(word)
        
        if current:
            result.append(" ".join(current))
            
        return result if len(result) > 1 else [text]
    
    def _apply_keyword_breaks(self, line: str) -> str:
        updated = line
        for pattern, replacement in KEYWORD_BREAK_RULES:
            updated = pattern.sub(replacement, updated)
        return updated

    def _apply_uppercase_section_breaks(self, line: str) -> str:
        def repl(match: re.Match[str]) -> str:
            punctuation = match.group(1)
            heading = match.group(2).strip()
            title = heading.title()
            return f"{punctuation}\n\n### {title}\n\n"

        return UPPERCASE_SECTION_PATTERN.sub(repl, line)

    def _normalize_special_labels(self, line: str) -> str:
        if "\n" in line:
            parts = line.split("\n")
            return "\n".join(self._normalize_special_labels(part) for part in parts)

        stripped = line.strip()
        if not stripped:
            return line

        leading_len = len(line) - len(line.lstrip(" \t"))
        trailing_len = len(line.rstrip(" \t"))
        leading = line[:leading_len]
        trailing = line[trailing_len:]

        core = stripped.lstrip("#").strip()
        core = re.sub(r"[_:\s]+$", "", core)

        patterns: Tuple[Tuple[re.Pattern[str], object], ...] = (
            (re.compile(r"^General Adventure Hooks$", re.IGNORECASE), "#### General Adventure Hooks"),
            (re.compile(r"^Adventure Hooks General$", re.IGNORECASE), "#### General Adventure Hooks"),
            (re.compile(r"^Adventure Hooks$", re.IGNORECASE), "#### Adventure Hooks"),
            (
                re.compile(r"^Adventure Hooks for (.+)$", re.IGNORECASE),
                lambda m: f"#### Adventure Hooks for {m.group(1).strip()}",
            ),
            (
                re.compile(r"^Specific to (.+)$", re.IGNORECASE),
                lambda m: f"#### Specific to {m.group(1).strip()}",
            ),
        )

        for pattern, replacement in patterns:
            match = pattern.match(core)
            if not match:
                continue
            new_text = replacement(match) if callable(replacement) else replacement
            return f"{leading}{new_text}{trailing}"

        return line

    def _strip_extraneous_underscores(self, line: str) -> str:
        """Remove stray underscores while preserving intentional emphasis."""
        if "_" not in line:
            return line

        # Strip bold/italic markers entirely
        updated = re.sub(r"__([^_\n]+)__", r"\1", line)
        updated = re.sub(r"_([^_\n]+)_", r"\1", updated)

        # Replace underscores between word characters with a space
        updated = re.sub(r"(?<=\w)_(?=\w)", " ", updated)
        # Drop any remaining underscores
        updated = updated.replace("_", "")

        return updated

    def _restore_paragraph_breaks(self, line: str) -> str:
        """Insert paragraph breaks when OCR merges sentences into one line."""
        if len(line) < 200:
            return line

        # Only operate when the line has sentence terminators followed by uppercase words
        pattern = re.compile(r"([.!?][\"')\]]?)(\s+)([A-Z][A-Za-z0-9\-']+)")

        def _split(match: re.Match[str]) -> str:
            sentence_end = match.group(1)
            next_word = match.group(3)
            # Require at least two words in the segment after the split to avoid false positives
            remainder = line[match.end():].strip()
            if remainder and len(remainder.split()) < 2:
                return match.group(0)
            return f"{sentence_end}\n\n{next_word}"

        updated = pattern.sub(_split, line, count=3)
        return updated


# --- Script entry point --------------------------------------------------

def process_file(input_path: Path, output_path: Optional[Path], config: Dict[str, Any]) -> bool:
    """Process a single file with the given configuration."""
    try:
        content = input_path.read_text(encoding="utf-8")
    except UnicodeDecodeError as e:
        logger.error(f"Error reading {input_path}: {e}")
        return False
    
    if config.get('verbose', 0) > 0:
        logger.info(f"Processing: {input_path}")
    
    # Create fixer with config
    fixer = MarkdownFormattingFixer(config)
    
    try:
        fixed_content = fixer.fix_content(content)
    except Exception as e:
        logger.error(f"Error processing {input_path}: {e}")
        if config.get('verbose', 0) > 1:
            import traceback
            traceback.print_exc()
        return False
    
    # Handle output
    output_path = output_path or input_path
    
    # Create backup if requested
    if config.get('in_place') and config.get('backup') and output_path.exists():
        backup_path = output_path.with_suffix(f"{output_path.suffix}.bak")
        output_path.replace(backup_path)
        if config.get('verbose', 0) > 0:
            logger.info(f"Created backup: {backup_path}")
    
    # Write output
    try:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(fixed_content, encoding="utf-8")
        
        if not config.get('quiet'):
            if config.get('in_place'):
                logger.info(f"Updated: {output_path}")
            else:
                logger.info(f"Wrote: {output_path}")
                
        # Report changes if verbose
        if config.get('verbose', 0) > 1 and fixer.changes:
            logger.info(f"Made {len(fixer.changes)} changes:")
            for change in fixer.changes[:5]:  # Show first 5 changes
                logger.info(f"  {change}")
            if len(fixer.changes) > 5:
                logger.info(f"  ... and {len(fixer.changes) - 5} more changes")
                
        return True
        
    except Exception as e:
        logger.error(f"Error writing {output_path}: {e}")
        return False


def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description="Fix common formatting issues in Markdown files.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter
    )
    
    # Input/output options
    parser.add_argument(
        "inputs",
        nargs="+",
        help="Input Markdown file(s) or directory to process"
    )
    parser.add_argument(
        "-o", "--output",
        help="Output file or directory (default: input with _fixed suffix)"
    )
    parser.add_argument(
        "-i", "--in-place",
        action="store_true",
        help="Modify files in place (make backups with --backup)"
    )
    parser.add_argument(
        "-b", "--backup",
        action="store_true",
        help="Create backup files when using --in-place"
    )
    
    # Processing options
    parser.add_argument(
        "--max-paragraph-length",
        type=int,
        default=800,
        help="Maximum paragraph length before splitting"
    )
    parser.add_argument(
        "--no-normalize-paragraphs",
        action="store_false",
        dest="normalize_paragraphs",
        help="Disable paragraph normalization"
    )
    parser.add_argument(
        "--no-fix-ghost-blanks",
        action="store_false",
        dest="fix_ghost_blanks",
        help="Disable ghost blank line fixing"
    )
    
    # Output options
    parser.add_argument(
        "-v", "--verbose",
        action="count",
        default=0,
        help="Increase verbosity (can be used multiple times)"
    )
    parser.add_argument(
        "-q", "--quiet",
        action="store_true",
        help="Suppress non-error output"
    )
    
    return parser.parse_args(argv)


def expand_file_patterns(patterns: List[str]) -> List[Path]:
    """Expand file patterns to actual file paths."""
    result = []
    for pattern in patterns:
        path = Path(pattern)
        
        # Handle direct file paths
        if path.exists() and path.is_file():
            result.append(path.resolve())
            continue
            
        # Handle directory patterns
        if '*' in pattern or '?' in pattern or '[' in pattern:
            import glob
            for match in glob.glob(pattern, recursive=True):
                match_path = Path(match).resolve()
                if match_path.is_file():
                    result.append(match_path)
        
        # Try to handle non-existent files (might be created later)
        if not result and not path.exists():
            result.append(path.resolve())
    
    return result

def main() -> int:
    """Main entry point."""
    args = parse_args()
    
    # Configure logging
    log_level = logging.WARNING
    if args.verbose > 1:
        log_level = logging.DEBUG
    elif args.verbose > 0:
        log_level = logging.INFO
    elif args.quiet:
        log_level = logging.ERROR
        
    logging.basicConfig(level=log_level, format='%(levelname)s: %(message)s')
    
    # Prepare configuration
    config = {
        'max_paragraph_length': args.max_paragraph_length,
        'normalize_paragraphs': args.normalize_paragraphs,
        'fix_ghost_blanks': args.fix_ghost_blanks,
        'in_place': args.in_place,
        'backup': args.backup,
        'verbose': args.verbose
    }
    
    # Process files
    success_count = 0
    input_paths = expand_file_patterns(args.inputs)
    
    if not input_paths:
        logger.error("No valid input files found")
        return 1
    
    for input_path in input_paths:
        if not input_path.exists():
            logger.warning(f"File not found: {input_path}")
            continue
            
        if input_path.is_dir():
            # Process all markdown files in directory
            for md_file in input_path.rglob("*.md"):
                output_path = None
                if args.output and Path(args.output).is_dir():
                    output_path = Path(args.output) / md_file.name
                success = process_file(md_file, output_path, config)
                if success:
                    success_count += 1
        else:
            # Process single file
            output_path = None
            if args.output:
                output_path = Path(args.output)
                if output_path.is_dir():
                    output_path = output_path / input_path.name
            success = process_file(input_path, output_path, config)
            if success:
                success_count += 1
    
    # Report results
    if not args.quiet:
        total = len(input_paths)
        logger.info(f"Processed {success_count} of {total} files successfully")
    
    return 0 if success_count > 0 else 1


if __name__ == "__main__":
    sys.exit(main())
