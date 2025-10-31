#!/usr/bin/env python3
"""
DEPRECATED: This script has been consolidated into fix_formatting.py

Please update your scripts to use:
    python scripts/fix_formatting.py [options] input_file.md

For backward compatibility, this script will still work but will use the new implementation.
"""

import sys
import os
from pathlib import Path

def main():
    """Redirect to the new implementation in fix_formatting.py"""
    print("""
    ===================================================================
    WARNING: normalize_markdown_paragraphs.py is deprecated.
    
    This functionality has been moved to fix_formatting.py for better
    maintainability and feature integration.
    
    Please update your scripts to use:
        python scripts/fix_formatting.py [options] input_file.md
        
    For more information, run:
        python scripts/fix_formatting.py --help
    ===================================================================
    """, file=sys.stderr)
    
    # Import the fix_formatting module
    try:
        from fix_formatting import main as fix_formatting_main
    except ImportError:
        print("Error: Could not import fix_formatting.py. Make sure it's in the same directory.", file=sys.stderr)
        return 1
    
    # Add --normalize-paragraphs to ensure the same behavior
    if '--' in sys.argv:
        # If there's a -- in args, insert before it
        idx = sys.argv.index('--')
        sys.argv.insert(idx, '--normalize-paragraphs')
    else:
        sys.argv.append('--normalize-paragraphs')
    
    # Call the new implementation
    return fix_formatting_main()

if __name__ == "__main__":
    sys.exit(main())


def compile_regex_patterns() -> Dict[str, Pattern]:
    """Compile and return all regex patterns used in the script."""
    return {
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
        'blockquote': re.compile(r'^\s*>')
    }


def is_structural_line(line: str, patterns: Dict[str, Pattern]) -> bool:
    """Check if a line is a structural Markdown element."""
    stripped = line.strip()
    if not stripped:
        return True
    return any(
        pattern.search(stripped)
        for pattern in [
            patterns['list_item'],
            patterns['code_fence'],
            patterns['header'],
            patterns['blockquote']
        ]
    ) or stripped.startswith(STRUCTURAL_PREFIXES)


def merge_wrapped_lines(text: str, patterns: Dict[str, Pattern]) -> str:
    """Merge lines that are part of the same logical paragraph."""
    lines = text.split("\n")
    merged_lines = []
    buffer = []
    in_code_block = False
    in_html_block = False
    html_tag_stack = []

    for line in lines:
        stripped = line.strip()
        original_indent = line[:len(line) - len(line.lstrip())] if line else ""

        # Handle code blocks
        if patterns['code_fence'].match(line):
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
            # Fall through to add the line
        
        if in_html_block:
            # Simple HTML tag stack tracking
            for char in line:
                if char == '<':
                    if line[line.find('<') + 1] != '/':  # Opening tag
                        tag = line[line.find('<') + 1:line.find('>')].split()[0]
                        html_tag_stack.append(tag)
                elif char == '>':
                    if html_tag_stack and line[line.find('>') - 1] == '/':
                        # Self-closing tag
                        html_tag_stack.pop()
                    elif html_tag_stack and line[line.find('<') + 1] == '/':
                        # Closing tag
                        html_tag_stack.pop()
            
            if not html_tag_stack:
                in_html_block = False
            
            merged_lines.append(line)
            continue

        # Blank line: finalize current paragraph and preserve separator
        if not stripped:
            if buffer:
                merged_lines.append(" ".join(buffer).strip())
                buffer = []
            merged_lines.append("")
            continue

        # Preserve structural Markdown lines without merging
        if is_structural_line(line, patterns):
            if buffer:
                merged_lines.append(" ".join(buffer).strip())
                buffer = []
            merged_lines.append(line)
            continue

        # Handle list continuations (lines that start with indentation after a list item)
        if buffer and (line.startswith("  ") or line.startswith("\t")):
            buffer.append(stripped)
            continue

        # Otherwise treat as part of current paragraph buffer
        buffer.append(stripped)

    if buffer:
        merged_lines.append(" ".join(buffer).strip())

    return "\n".join(merged_lines)


def split_long_paragraphs(text: str, max_length: int, patterns: Dict[str, Pattern]) -> str:
    """Split paragraphs longer than max_length at sentence boundaries."""
    if max_length <= 0:
        return text

    lines = text.split("\n")
    result = []
    current_paragraph = []
    in_code_block = False

    for line in lines:
        # Toggle code block state
        if patterns['code_fence'].match(line):
            in_code_block = not in_code_block
            if current_paragraph:
                result.append(" ".join(current_paragraph))
                current_paragraph = []
            result.append(line)
            continue

        # Skip processing inside code blocks
        if in_code_block:
            result.append(line)
            continue

        # Handle non-empty lines
        if line.strip():
            # Check if this is a structural line that should start a new paragraph
            if is_structural_line(line, patterns):
                if current_paragraph:
                    result.append(" ".join(current_paragraph).strip())
                    current_paragraph = []
                result.append(line)
            else:
                # Add line to current paragraph
                current_paragraph.append(line.strip())
        else:
            # Empty line - finalize current paragraph
            if current_paragraph:
                result.append(" ".join(current_paragraph).strip())
                current_paragraph = []
            result.append("")

    # Add any remaining content in the buffer
    if current_paragraph:
        result.append(" ".join(current_paragraph).strip())

    # Now process each paragraph to split if too long
    final_result = []
    for para in result:
        if len(para) <= max_length or is_structural_line(para, patterns) or not para.strip():
            final_result.append(para)
            continue

        # Split at sentence boundaries
        sentences = []
        current_sentence = []
        words = para.split()
        
        for i, word in enumerate(words):
            current_sentence.append(word)
            # Check for sentence-ending punctuation followed by space
            if any(word.endswith(punct) for punct in ['.', '!', '?']):
                # Check if the next word starts with a capital letter
                if (i + 1 < len(words) and 
                    words[i + 1] and 
                    words[i + 1][0].isupper() and 
                    not any(words[i + 1].startswith(p) for p in ['"', '(', '[', "'"])):
                    sentences.append(" ".join(current_sentence))
                    current_sentence = []
        
        # Add the last sentence if not empty
        if current_sentence:
            sentences.append(" ".join(current_sentence))
        
        # If no good break points found, split at spaces
        if len(sentences) <= 1 and len(para) > max_length * 1.5:
            words = para.split()
            chunks = []
            current_chunk = []
            current_length = 0
            
            for word in words:
                if current_length + len(word) + len(current_chunk) > max_length and current_chunk:
                    chunks.append(" ".join(current_chunk))
                    current_chunk = [word]
                    current_length = len(word)
                else:
                    current_chunk.append(word)
                    current_length += len(word)
            
            if current_chunk:
                chunks.append(" ".join(current_chunk))
            
            final_result.extend(chunks)
        else:
            final_result.extend(sentences)

    return "\n".join(final_result)


def normalize_markdown(
    file_path: Path,
    max_paragraph_length: int = DEFAULT_MAX_PARAGRAPH_LENGTH,
    output_suffix: str = DEFAULT_OUTPUT_SUFFIX,
    in_place: bool = False
) -> Path:
    """Normalize paragraphs and return path to cleaned output file.
    
    Args:
        file_path: Path to the input Markdown file
        max_paragraph_length: Maximum allowed paragraph length before splitting
        output_suffix: Suffix to add to the output filename
        in_place: If True, overwrite the input file
        
    Returns:
        Path to the cleaned output file
    """
    try:
        # Read input file with error handling
        try:
            text = file_path.read_text(encoding="utf-8")
        except UnicodeDecodeError as e:
            logger.error(f"Failed to read {file_path}: {e}")
            # Try with error handling for malformed files
            text = file_path.read_text(encoding="utf-8", errors="replace")
            logger.warning(f"Read file with replacement of invalid characters")
        
        logger.info(f"Processing {file_path} ({(len(text) / 1024):.1f} KB)")
        
        # Compile regex patterns once for performance
        patterns = compile_regex_patterns()
        
        # Step 1: normalize newlines to LF
        text = text.replace("\r\n", "\n").replace("\r", "\n")
        
        # Step 1.5: eliminate ghost blank lines that split paragraphs
        def _join_interior_blank(match: Match[str]) -> str:
            return f"{match.group(1)} {match.group(2).lstrip()}"
        
        text = patterns['ghost_blank'].sub(_join_interior_blank, text)
        
        # Step 2: merge wrapped lines inside paragraphs
        text = merge_wrapped_lines(text, patterns)
        
        # Step 3: ensure exactly one blank line between paragraphs
        text = patterns['multi_newline'].sub("\n\n", text)
        
        # Step 4: apply specific fixes (like TOC formatting)
        text = patterns['toc_fix'].sub(r"\1\n\n\2\n\n\3", text)
        
        # Step 5: split long paragraphs
        if max_paragraph_length > 0:
            text = split_long_paragraphs(text, max_paragraph_length, patterns)
        
        # Determine output path
        if in_place:
            output_path = file_path
            backup_path = file_path.with_name(f"{file_path.stem}.bak{file_path.suffix}")
            import shutil
            shutil.copy2(file_path, backup_path)
            logger.info(f"Created backup at {backup_path}")
        else:
            output_path = file_path.with_name(f"{file_path.stem}{output_suffix}{file_path.suffix}")
        
        # Write output file with error handling
        try:
            output_path.write_text(text, encoding="utf-8")
            logger.info(f"Successfully wrote {output_path} ({(len(text) / 1024):.1f} KB)")
        except IOError as e:
            logger.error(f"Failed to write {output_path}: {e}")
            raise
        
        return output_path
        
    except Exception as e:
        logger.error(f"Error processing {file_path}: {e}", exc_info=True)
        raise


def parse_args() -> argparse.Namespace:
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description="Normalize Markdown paragraphs and fix common formatting issues.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter
    )
    
    parser.add_argument(
        "files",
        nargs="+",
        help="Markdown files to process (supports wildcards in shell)",
    )
    
    parser.add_argument(
        "-m", "--max-length",
        type=int,
        default=DEFAULT_MAX_PARAGRAPH_LENGTH,
        help="Maximum paragraph length before splitting (0 to disable)",
    )
    
    parser.add_argument(
        "-s", "--suffix",
        default=DEFAULT_OUTPUT_SUFFIX,
        help="Suffix to add to output filenames (ignored with --in-place)",
    )
    
    parser.add_argument(
        "-i", "--in-place",
        action="store_true",
        help="Modify files in place (makes backup with .bak extension)",
    )
    
    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Enable verbose output",
    )
    
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be done without making changes",
    )
    
    return parser.parse_args()


def expand_file_patterns(patterns: List[str]) -> List[Path]:
    """Expand file patterns to actual file paths."""
    import glob
    files = []
    for pattern in patterns:
        # Handle ~ in paths
        expanded_pattern = str(Path(pattern).expanduser())
        # Use glob to expand wildcards
        matched_files = glob.glob(expanded_pattern, recursive=True)
        if not matched_files:
            logger.warning(f"No files match pattern: {pattern}")
        for file in matched_files:
            path = Path(file)
            if path.is_file():
                files.append(path.resolve())
    return files


def main() -> None:
    """Main entry point for the script."""
    args = parse_args()
    
    # Configure logging level
    log_level = logging.DEBUG if args.verbose else logging.INFO
    logging.getLogger().setLevel(log_level)
    
    # Expand file patterns and get absolute paths
    try:
        files = expand_file_patterns(args.files)
        if not files:
            logger.error("No valid files to process")
            sys.exit(1)
    except Exception as e:
        logger.error(f"Error expanding file patterns: {e}")
        sys.exit(1)
    
    # Process each file
    success_count = 0
    for file_path in files:
        try:
            if args.dry_run:
                logger.info(f"[DRY RUN] Would process: {file_path}")
                success_count += 1
                continue
                
            logger.info(f"Processing: {file_path}")
            output_path = normalize_markdown(
                file_path,
                max_paragraph_length=args.max_length,
                output_suffix=args.suffix,
                in_place=args.in_place
            )
            
            if output_path:
                success_count += 1
                if not args.in_place:
                    logger.info(f"Created: {output_path}")
            
        except Exception as e:
            logger.error(f"Failed to process {file_path}: {e}", exc_info=args.verbose)
    
    # Print summary
    total_files = len(files)
    if args.dry_run:
        logger.info(f"[DRY RUN] Would process {total_files} files")
    else:
        logger.info(f"Processed {success_count} of {total_files} files successfully")
        if success_count < total_files:
            logger.warning(f"Failed to process {total_files - success_count} files")
    
    sys.exit(0 if success_count > 0 else 1)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        logger.info("Operation cancelled by user")
        sys.exit(1)
    except Exception as e:
        logger.critical(f"Unhandled error: {e}", exc_info=True)
        sys.exit(1)
