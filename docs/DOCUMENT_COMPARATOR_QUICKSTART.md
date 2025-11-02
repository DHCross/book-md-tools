# Document Comparator - Quick Start Guide

## What is it?

The Document Comparator is an automated quality control tool that detects content loss, structural breaks, and sequence discontinuities between two versions of a document. It's specifically designed for editorial workflows where you need to verify that nothing was lost during conversion, editing, or processing.

## When to use it

- **After document conversion** (PDF → Markdown, DOCX → Markdown)
- **After running the book pipeline** (verify no content was lost)
- **During editorial review** (compare draft versions)
- **For archive verification** (check completeness of recovered documents)
- **Quality control** (regular checks during large projects)

## Quick Examples

### 1. Basic comparison
```bash
python3 tools/document_comparator.py original.md edited.md
```

### 2. After conversion validation
```bash
# Convert document
pandoc source.pdf -o converted.md

# Verify conversion
python3 tools/document_comparator.py reference.md converted.md \
  --output conversion-report.md \
  --format markdown
```

### 3. Pipeline validation
```bash
# Run pipeline
python3 scripts/book_pipeline.py book.md --out-suffix _cleaned

# Compare before/after
python3 tools/document_comparator.py book.md book_cleaned.md
```

## What it catches

### ✅ Content Loss
- Missing chapters, sections, or subsections
- Missing tables or table parts
- Significant paragraph deletions
- Missing appendices or references

### ✅ Sequence Problems
- Gaps in numbering (Chapter 1, 2, 4 - missing 3)
- Missing "Part 2" of multi-part content
- Incomplete table series (Table 2A, 2C - missing 2B)
- Orphaned references

### ✅ Structural Issues
- Broken tables (inconsistent columns)
- Unbalanced HTML tags
- Incomplete lists
- Malformed markdown

### ✅ Volume Changes
- Sections that shrunk/grew by >15% (configurable)
- Overall document size changes
- Missing or extra sections

## Reading the report

Reports are organized by severity:

- **CRITICAL** - Major content loss, broken structure, missing continuations
- **MAJOR** - Missing sequences, significant content differences
- **MODERATE** - Formatting issues, minor gaps
- **MINOR** - Potential issues that may be intentional

Each issue shows:
- Check type (which of the 4 checks caught it)
- Description of the problem
- Location in both documents (line numbers)
- Details (specific data about the issue)

## Common scenarios

### Scenario: Too many false positives

**Problem:** Tool reports many issues but they're intentional edits

**Solution:** Increase the volume threshold
```bash
# More permissive: only flag 25%+ changes
python3 tools/document_comparator.py doc1.md doc2.md --threshold 0.25
```

### Scenario: Need to check multiple files

**Problem:** Have a directory of chapters to verify

**Solution:** Use a loop
```bash
for chapter in chapters/*.md; do
    name=$(basename "$chapter")
    python3 tools/document_comparator.py \
        "reference/$name" \
        "$chapter" \
        --quiet >> batch-report.txt
done
```

### Scenario: Want detailed report for stakeholders

**Problem:** Need a formatted report to share

**Solution:** Use markdown format
```bash
python3 tools/document_comparator.py original.md final.md \
  --format markdown \
  --output QA-Report.md
```

## The Four Checks Explained

### 1. Symmetry & Sequence Check
Looks for numbered sequences (chapters, parts, tables, sections) and flags gaps or missing elements.

**Example:** If doc has "Part 1" but no "Part 2", this catches it.

### 2. Structural Parity Check
Inspects tables and lists for completeness and balance. Checks for hanging columns, missing headers, unbalanced tags.

**Example:** A table with 4 columns in header but 3 in data rows.

### 3. Content Volume Comparison
Measures content density (lines, words, paragraphs) and flags significant differences.

**Example:** "Geography" section has 150 lines in original but only 80 in revised (47% loss).

### 4. Cross-Reference Check
Verifies multi-part content continuations exist. When it sees "Part 1" with cultural identifiers (Ottoman, Indian, etc.), it looks for "Part 2".

**Example:** Table titled "Aristocratic Titles - Part 1" with Ottoman/Indian columns but no "Part 2" found.

## Tips

1. **Start with defaults** - The 15% threshold works well for most cases
2. **Review reports carefully** - Not all flagged issues are errors
3. **Use markdown output** - Easier to read and share
4. **Run after major changes** - Great safety net for pipeline operations
5. **Combine with other QC tools** - Use alongside spell-check and long-line detection

## Exit codes

- `0` = Success, no critical/major issues
- `1` = Critical or major issues found

Great for scripts:
```bash
if python3 tools/document_comparator.py doc1.md doc2.md --quiet; then
    echo "Validation passed"
else
    echo "Issues found - check report"
fi
```

## Need more help?

See the full documentation: [docs/DOCUMENT_COMPARATOR.md](../docs/DOCUMENT_COMPARATOR.md)
