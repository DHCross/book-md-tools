#!/usr/bin/env python3
"""
Markdown formatting repair tool for Essential Places drafts.

This utility focuses on two issues discovered after the automated
conversion pipeline:

1. Words that were merged together (missing spaces or hyphenation).
2. Chapter headings that lost their markdown level indicators.

The script is intentionally conservative: it skips fenced code blocks,
inline code, URLs, and other segments likely to be adversely affected by
simple search/replace operations. All changes are logged so the caller
can review the first few adjustments performed.
"""
from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

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
    line_number: int
    original: str
    new: str
    
    def __str__(self) -> str:
        return f"Line {self.line_number}: {self.original!r} -> {self.new!r}"


class MarkdownFormattingFixer:
    """
    Comprehensive Markdown formatter that combines multiple formatting tools:
    - Merged words and spacing fixes
    - Chapter/section header normalization
    - Paragraph and line break fixes
    - Header depth correction
    - Advanced break fixing (mid-word, hyphenated words, etc.)
    - Markdown cleanup and validation
    """
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        """
        Initialize the formatter with optional configuration.
        
        Args:
            config: Configuration dictionary with options like:
                - max_header_depth: Maximum header depth to allow (default: 4)
                - fix_hierarchy: Whether to fix header hierarchy (default: True)
                - enable_break_fixing: Whether to enable advanced break fixing (default: True)
                - enable_cleanup: Whether to enable markdown cleanup (default: True)
        """
        self.changes: List[ChangeRecord] = []
        self.config = config or {}
        
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
        self.changes.clear()
        lines = content.splitlines()
        fixed_lines = [self.process_line(line, idx + 1) for idx, line in enumerate(lines)]
        return "\n".join(fixed_lines)

    # ------------------------------------------------------------------
    def _apply_keyword_breaks(self, line: str) -> str:
        updated = line
        for pattern, replacement in KEYWORD_BREAK_RULES:
            updated = pattern.sub(replacement, updated)
        return updated

    # ------------------------------------------------------------------
    def _apply_uppercase_section_breaks(self, line: str) -> str:
        def repl(match: re.Match[str]) -> str:
            punctuation = match.group(1)
            heading = match.group(2).strip()
            title = heading.title()
            return f"{punctuation}\n\n### {title}\n\n"

        return UPPERCASE_SECTION_PATTERN.sub(repl, line)

    # ------------------------------------------------------------------
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

    # ------------------------------------------------------------------
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

    # ------------------------------------------------------------------
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

def run_formatter(input_path: Path, output_path: Optional[Path]) -> None:
    fixer = MarkdownFormattingFixer()

    text = input_path.read_text(encoding="utf-8")
    fixed_text = fixer.fix_content(text)

    destination = output_path or input_path
    destination.write_text(fixed_text, encoding="utf-8")

    print(f"Processed {input_path} -> {destination}")
    if fixer.changes:
        print("First 10 changes:")
        for record in fixer.changes[:10]:
            before = record.original.strip()
            after = record.new.strip()
            print(f"  Line {record.line_number}: '{before}' -> '{after}'")
        if len(fixer.changes) > 10:
            remaining = len(fixer.changes) - 10
            print(f"  ... {remaining} additional changes")
    else:
        print("No formatting changes were required.")


def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fix merged words and chapter headers in markdown files.")
    parser.add_argument("input", type=Path, help="Input markdown file")
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        help="Optional output path (if omitted, the input file is modified in place)",
    )
    return parser.parse_args(argv)


def main(argv: Optional[List[str]] = None) -> int:
    args = parse_args(argv)

    if not args.input.exists():
        print(f"Error: input file not found: {args.input}", file=sys.stderr)
        return 1

    output_path = args.output
    if output_path is not None:
        output_path.parent.mkdir(parents=True, exist_ok=True)

    run_formatter(args.input, output_path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
