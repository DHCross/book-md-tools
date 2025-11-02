# Document Comparator - Command Reference Card

## Basic Usage

```bash
# Compare two documents
python3 tools/document_comparator.py doc1.md doc2.md

# With markdown report
python3 tools/document_comparator.py doc1.md doc2.md \
  --format markdown \
  --output report.md

# Adjust threshold
python3 tools/document_comparator.py doc1.md doc2.md --threshold 0.10

# Quiet mode (suppress progress)
python3 tools/document_comparator.py doc1.md doc2.md --quiet
```

## Options

| Option | Short | Default | Description |
|--------|-------|---------|-------------|
| `--threshold` | | `0.15` | Volume difference threshold (15%) |
| `--format` | | `text` | Report format: `text` or `markdown` |
| `--output` | `-o` | stdout | Output file path |
| `--quiet` | `-q` | off | Suppress progress messages |

## The Four Checks

| Check | Detects | Example |
|-------|---------|---------|
| **Symmetry & Sequence** | Missing sequential elements | Chapter I, II, IV (missing III) |
| **Structural Parity** | Incomplete tables/lists | Table with inconsistent columns |
| **Content Volume** | Significant content differences | Section shrunk by 45% |
| **Cross-Reference** | Missing continuations | "Part 1" with no "Part 2" |

## Severity Levels

| Level | Meaning | Example |
|-------|---------|---------|
| **CRITICAL** | Major content loss, broken structure | >30% content loss, missing continuation |
| **MAJOR** | Missing sequences, significant changes | Missing chapter, 15-30% content difference |
| **MODERATE** | Formatting issues, minor gaps | Invalid table separator, sequence gap |
| **MINOR** | Potential issues | Unbalanced markup (may be intentional) |

## Exit Codes

- `0` - No critical or major issues
- `1` - Critical or major issues found

## Common Use Cases

### After Conversion
```bash
pandoc source.pdf -o converted.md
python3 tools/document_comparator.py reference.md converted.md
```

### Pipeline Validation
```bash
python3 scripts/book_pipeline.py book.md --out-suffix _cleaned
python3 tools/document_comparator.py book.md book_cleaned.md
```

### Batch Processing
```bash
for file in chapters/*.md; do
    python3 tools/document_comparator.py \
        "reference/$(basename $file)" \
        "$file" --quiet >> batch-report.txt
done
```

### CI/CD Integration
```bash
if python3 tools/document_comparator.py doc1.md doc2.md --quiet; then
    echo "✓ Validation passed"
else
    echo "✗ Issues found"
    exit 1
fi
```

## What Gets Detected

✅ Missing chapters, sections, parts, tables, appendices  
✅ Gaps in numbered sequences  
✅ Incomplete table structures  
✅ Unbalanced HTML/markdown tags  
✅ Content volume differences >threshold  
✅ Orphaned multi-part references  
✅ Missing table continuations  
✅ Structural inconsistencies  

## Threshold Guidelines

| Threshold | When to Use |
|-----------|-------------|
| `0.10` (10%) | Strict validation, minimal acceptable changes |
| `0.15` (15%) | **Default** - Good balance for most cases |
| `0.25` (25%) | Permissive, expect significant editorial changes |
| `0.50` (50%) | Very permissive, only catch major problems |

## Tips

💡 Start with defaults (15% threshold)  
💡 Use markdown format for sharing reports  
💡 Run after major pipeline operations  
💡 Combine with other QC tools (spell-check, long-lines)  
💡 Review reports manually - not all issues are errors  
💡 Lower threshold for conversions, higher for editing  

## Full Documentation

- Comprehensive guide: `docs/DOCUMENT_COMPARATOR.md`
- Quick start: `docs/DOCUMENT_COMPARATOR_QUICKSTART.md`
- Implementation details: `docs/DOCUMENT_COMPARATOR_IMPLEMENTATION.md`
