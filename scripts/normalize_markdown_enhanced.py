#!/usr/bin/env python3
"""
Enhanced Markdown Normalizer with Header and Paragraph Handling

This tool provides advanced normalization of Markdown files with special attention to:
- Splitting headers from paragraphs that are on the same line
- Merging wrapped lines into coherent paragraphs
- Preserving Markdown structural elements
- Fixing ghost blank lines
- Maintaining proper spacing between elements
"""
from pathlib import Path
import re
import sys
from typing import Match, List, Tuple, Optional
import argparse
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger(__name__)

# Define structural prefixes that mark a line as "not-a-paragraph"
STRUCTURAL_PREFIXES = (
    "#", "* ", "- ", ">", "|", "{{",
    "1.", "2.", "3.", "4.", "5.", "6.", "7.", "8.", "9.",
)

# Compile regex patterns for better performance
PATTERNS = {
    'toc_header': re.compile(r'^(#{1,6}\s+.*?)(\s*\{\{\s*TOC\s*\}}\s*)(\S.*)?$', re.MULTILINE),
    'header': re.compile(r'^(#{1,6}\s+.*?)(\s+)(\S+.*)$', re.MULTILINE),
    'bold_header': re.compile(r'^(\*\*[^*]+\*\*)(\s+)(\S+.*)$', re.MULTILINE),
    'ghost_blank': re.compile(r'([^\n.!?\"\)\]])\n(?:[ \t]*\n)+([ \t]*[a-z])', re.MULTILINE),
    'multi_newline': re.compile(r'\n{3,}'),
    'trailing_space': re.compile(r'[ \t]+\n'),
    'list_item': re.compile(r'^\s*[-*+]\s+.*$', re.MULTILINE),
    'code_fence': re.compile(r'^```.*?^```', re.MULTILINE | re.DOTALL),
    'html_comment': re.compile(r'<!--.*?-->', re.DOTALL),
    'table': re.compile(r'\|.*\|\s*\n\|[-|\s]*\|\s*(?:\n\|.*\|\s*)*', re.MULTILINE)
}


def fix_broken_chapter_titles(text: str) -> str:
    """Merge multi-line chapter titles back into a single line."""

    def _merge(match: re.Match[str]) -> str:
        return f"**CHAPTER {match.group(1).strip()}**"

    return re.sub(
        r"\*\*CHAPTER\s*\n\s*([IVXLC0-9]+[:\s]+[A-Z][A-Z\s]+)\*\*",
        _merge,
        text,
        flags=re.MULTILINE,
    )


def merge_multiline_headers(text: str) -> str:
    """Join header lines that were split across multiple lines."""

    lines = text.split('\n')
    merged_lines: List[str] = []
    i = 0
    header_pattern = re.compile(r'^\s*#{1,6}\s+')

    while i < len(lines):
        line = lines[i]

        if header_pattern.match(line) and line.count('**') % 2 == 1:
            header = line.rstrip()
            j = i + 1

            while j < len(lines):
                stripped = lines[j].strip()

                if stripped == '':
                    j += 1
                    continue

                header = header.rstrip() + ' ' + stripped
                j += 1

                if header.count('**') % 2 == 0:
                    break

            merged_lines.append(header)
            i = j
            continue

        merged_lines.append(line)
        i += 1

    return '\n'.join(merged_lines)


def fix_broken_bold_titles(text: str) -> str:
    """Merge bold titles that were split across lines without hashes."""

    return re.sub(
        r'\*\*([^\n*]+?)\s*\n\s*([^\n*]+?)\*\*',
        lambda m: f"**{m.group(1).strip()} {m.group(2).strip()}**",
        text,
    )


def is_structural_line(line: str) -> bool:
    """Check if a line is a structural element that should be preserved as-is."""
    stripped = line.lstrip()
    
    # Check for structural prefixes
    if any(stripped.startswith(prefix) for prefix in STRUCTURAL_PREFIXES):
        return True
        
    # Check for bold headers
    if re.match(r'^\*\*(?:[^*]|\*(?!\*))+\*\s*$', stripped):
        return True
        
    # Check for table dividers
    if re.match(r'^[|:\- \t]+$', stripped):
        return True
        
    # Check for code blocks
    if stripped.startswith('```') or stripped.startswith('~~~'):
        return True
        
    # Check for HTML comments
    if stripped.startswith('<!--'):
        return True
        
    return False

def protect_code_blocks(text: str) -> Tuple[str, List[str]]:
    """Protect code blocks from being modified."""
    protected = []
    def replace_match(match):
        protected.append(match.group(0))
        return f'\0\0PROTECTED_CODE_BLOCK_{len(protected)-1:04d}\0\0'
    
    # Protect code fences
    text = PATTERNS['code_fence'].sub(replace_match, text)
    
    # Protect HTML comments
    text = PATTERNS['html_comment'].sub(replace_match, text)
    
    # Protect tables
    text = PATTERNS['table'].sub(replace_match, text)
    
    return text, protected

def restore_protected_blocks(text: str, protected: List[str]) -> str:
    """Restore protected blocks after processing."""
    for i, block in enumerate(protected):
        text = text.replace(f'\0\0PROTECTED_CODE_BLOCK_{i:04d}\0\0', block, 1)
    return text

def split_run_in_headers(text: str) -> str:
    """
    Split headers that are on the same line as their first paragraph.
    
    Handles these cases:
    1. # Header {{TOC}} Text... -> # Header {{TOC}}\n\nText...
    2. ## Header Text... -> ## Header\n\nText...
    3. **Bold Header** Text... -> **Bold Header**\n\nText...
    """
    # Handle TOC headers first
    def handle_toc_header(match):
        prefix = match.group(1) + match.group(2)
        if match.group(3):
            return f"{prefix}\n\n{match.group(3)}"
        return prefix
    
    text = PATTERNS['toc_header'].sub(handle_toc_header, text)
    
    # Handle standard headers
    def handle_header(match):
        return f"{match.group(1)}\n\n{match.group(3)}"
    
    text = PATTERNS['header'].sub(handle_header, text)
    
    # Handle bold headers
    def handle_bold_header(match):
        return f"{match.group(1)}\n\n{match.group(3)}"
    
    text = PATTERNS['bold_header'].sub(handle_bold_header, text)
    
    return text

def merge_wrapped_lines(text: str) -> str:
    """Merge lines that are part of the same logical paragraph."""
    lines = text.split('\n')
    merged_lines = []
    buffer = []
    
    for i, line in enumerate(lines):
        stripped = line.strip()
        
        # Blank line: finalize current paragraph and preserve separator
        if not stripped:
            if buffer:
                merged_lines.append(' '.join(buffer).strip())
                buffer = []
            merged_lines.append('')
            continue
            
        # Check if this is a structural line that shouldn't be merged
        if is_structural_line(line):
            if buffer:
                merged_lines.append(' '.join(buffer).strip())
                buffer = []
            merged_lines.append(line)  # Preserve original indentation
            continue
            
        # Otherwise, treat as part of the current paragraph buffer
        buffer.append(stripped)
    
    # Add any remaining content in the buffer
    if buffer:
        merged_lines.append(' '.join(buffer).strip())
    
    return '\n'.join(merged_lines)

def normalize_markdown(text: str, max_paragraph_length: int = 800) -> str:
    """
    Normalize Markdown text with improved header and paragraph handling.
    
    Args:
        text: Input Markdown text
        max_paragraph_length: Maximum length for paragraphs before splitting
        
    Returns:
        Normalized Markdown text
    """
    # Protect code blocks and other sensitive content
    protected_text, protected_blocks = protect_code_blocks(text)
    
    # Normalize newlines
    protected_text = protected_text.replace('\r\n', '\n').replace('\r', '\n')
    
    # Split run-in headers from their paragraphs
    protected_text = split_run_in_headers(protected_text)
    
    # Merge wrapped lines into paragraphs
    protected_text = merge_wrapped_lines(protected_text)
    
    # Fix ghost blank lines (multiple newlines within paragraphs)
    def fix_ghost_blanks(match):
        return f"{match.group(1)} {match.group(2).lstrip()}"
    
    protected_text = PATTERNS['ghost_blank'].sub(fix_ghost_blanks, protected_text)
    
    # Ensure exactly one blank line between paragraphs/elements
    protected_text = PATTERNS['multi_newline'].sub('\n\n', protected_text)
    
    # Clean up trailing spaces
    protected_text = PATTERNS['trailing_space'].sub('\n', protected_text)
    
    # Restore protected blocks
    result = restore_protected_blocks(protected_text, protected_blocks)

    # Merge headers/bold titles that were split across lines
    result = merge_multiline_headers(result)
    result = fix_broken_bold_titles(result)

    # Merge any multi-line chapter titles that slipped through
    result = fix_broken_chapter_titles(result)

    # Final cleanup of any double newlines that might have been introduced
    result = '\n'.join(line.rstrip() for line in result.split('\n'))
    
    return result

def process_file(input_path: Path, output_path: Optional[Path] = None, in_place: bool = False, 
                backup: bool = False, max_paragraph_length: int = 800) -> None:
    """Process a single Markdown file."""
    if not input_path.exists():
        raise FileNotFoundError(f"Input file not found: {input_path}")
    
    # Set up output path
    if in_place:
        if backup:
            backup_path = input_path.with_suffix(f"{input_path.suffix}.bak")
            backup_path.write_text(input_path.read_text(encoding='utf-8'), encoding='utf-8')
            logger.info(f"Created backup: {backup_path}")
        output_path = input_path
    elif output_path is None:
        output_path = input_path.with_stem(f"{input_path.stem}_normalized")
    
    # Read and process the file
    logger.info(f"Processing: {input_path}")
    original_text = input_path.read_text(encoding='utf-8')
    processed_text = normalize_markdown(original_text, max_paragraph_length)
    
    # Write the result
    output_path.write_text(processed_text, encoding='utf-8')
    logger.info(f"Wrote: {output_path}")

def main():
    parser = argparse.ArgumentParser(description='Normalize Markdown files with improved header and paragraph handling.')
    parser.add_argument('inputs', nargs='+', help='Input Markdown file(s) or directory')
    parser.add_argument('-o', '--output', help='Output file or directory (default: input with _normalized suffix)')
    parser.add_argument('-i', '--in-place', action='store_true', help='Modify files in place')
    parser.add_argument('-b', '--backup', action='store_true', help='Create backup files when using --in-place')
    parser.add_argument('--max-paragraph-length', type=int, default=800,
                       help='Maximum paragraph length before splitting (default: 800)')
    parser.add_argument('-v', '--verbose', action='count', default=0, help='Increase verbosity')
    
    args = parser.parse_args()
    
    # Configure logging level based on verbosity
    if args.verbose >= 2:
        logger.setLevel(logging.DEBUG)
    elif args.verbose == 1:
        logger.setLevel(logging.INFO)
    else:
        logger.setLevel(logging.WARNING)
    
    # Process input files
    input_paths = []
    for pattern in args.inputs:
        path = Path(pattern)
        if path.is_dir():
            input_paths.extend(path.glob('**/*.md'))
            input_paths.extend(path.glob('**/*.markdown'))
        else:
            input_paths.append(path)
    
    if not input_paths:
        logger.error("No Markdown files found in the specified locations.")
        sys.exit(1)
    
    # Process each file
    success_count = 0
    for input_path in input_paths:
        try:
            process_file(
                input_path=input_path,
                output_path=Path(args.output) if args.output else None,
                in_place=args.in_place,
                backup=args.backup,
                max_paragraph_length=args.max_paragraph_length
            )
            success_count += 1
        except Exception as e:
            logger.error(f"Error processing {input_path}: {e}", exc_info=args.verbose > 0)
    
    logger.info(f"Processed {success_count} of {len(input_paths)} files successfully.")
    
    if success_count < len(input_paths):
        sys.exit(1)

if __name__ == "__main__":
    main()
