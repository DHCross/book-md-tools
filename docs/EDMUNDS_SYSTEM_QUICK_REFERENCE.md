# Edmunds System Quick Reference

## What is it?

The **Edmunds System Bridge** automates the insertion and removal of numeric hierarchy tags used in professional layout workflows. Named after layout artist Bill Edmunds, this system eliminates manual tagging while preserving header hierarchy through document conversions.

## Quick Start

### Prepare for Layout (Inject Tags)

```bash
# Basic usage (backticked tags for renderer safety)
python scripts/inject_numeric_tags.py manuscript.md -o bridge.txt

# Raw tags for Word/InDesign import
python scripts/inject_numeric_tags.py manuscript.md --form raw -o bridge.txt

# HTML comment tags (invisible in most renderers)
python scripts/inject_numeric_tags.py manuscript.md --form comment -o bridge.txt

# Bracket tags (for systems that sanitize angle brackets)
python scripts/inject_numeric_tags.py manuscript.md --form bracket -o bridge.txt

# Cap heading depth at H4
python scripts/inject_numeric_tags.py manuscript.md --max-level 4 -o bridge.txt
```

### Restore After Layout (Strip Tags)

```bash
# Remove all tags
python scripts/strip_numeric_tags.py bridge.txt -o clean.md

# In-place modification
python scripts/strip_numeric_tags.py -i bridge.txt

# From stdin
cat bridge.txt | python scripts/strip_numeric_tags.py > clean.md
```

## Tag Formats

| Format | Example | Use Case |
|--------|---------|----------|
| **Backtick** (default) | `` # `<1>` Title `` | GitHub, PyPI, ReadTheDocs safety |
| **Raw** | `# <1> Title` | Word/InDesign search/replace |
| **Comment** | `# <!--1--> Title` | Invisible rendering |
| **Bracket** | `# [1] Title` | Systems sanitizing `<>` |

## Example: Before and After

### Before (Clean Markdown)
```markdown
# Chapter Title

## Section Title
Some paragraph text.

### Subsection Title
More text.
```

### After Injection (Backtick Form)
```markdown
# `<1>` Chapter Title

## `<2>` Section Title
Some paragraph text.

### `<3>` Subsection Title
More text.
```

### After Injection (Raw Form)
```markdown
# <1> Chapter Title

## <2> Section Title
Some paragraph text.

### <3> Subsection Title
More text.
```

## InDesign Workflow

1. **Inject tags** into your clean Markdown:
   ```bash
   python scripts/inject_numeric_tags.py book.md --form raw -o book_bridge.txt
   ```

2. **Convert to Word** (or open in IA Writer and export)

3. **Import to InDesign**

4. **Find/Change** in InDesign:
   - Find: `<1>` → Apply paragraph style: `H1_Main` → Delete tag
   - Find: `<2>` → Apply paragraph style: `H2_Section` → Delete tag
   - Find: `<3>` → Apply paragraph style: `H3_Subsection` → Delete tag

5. **After layout is complete**, strip tags from your source:
   ```bash
   python scripts/strip_numeric_tags.py book_bridge.txt -o book_final.md
   ```

## Round-Trip Testing

Verify determinism before production use:

```bash
# Test file
echo "# Chapter
## Section
Text here" > test.md

# Inject tags
python scripts/inject_numeric_tags.py test.md > tagged.md

# Strip tags
python scripts/strip_numeric_tags.py tagged.md > restored.md

# Compare
diff test.md restored.md
# Should output nothing (files identical)
```

## Common Use Cases

### Case 1: Preparing Multiple Chapters
```bash
for file in chapters/*.md; do
  python scripts/inject_numeric_tags.py "$file" \
    --form raw \
    -o "bridge/$(basename "$file" .md)_bridge.txt"
done
```

### Case 2: IA Writer Workflow
```bash
# Use backtick form for IA Writer compatibility
python scripts/inject_numeric_tags.py manuscript.md \
  --form backtick \
  -o manuscript_tagged.md

# Open in IA Writer, export to Word
# After layout, strip tags:
python scripts/strip_numeric_tags.py manuscript_tagged.md -o manuscript_final.md
```

### Case 3: Nation Builder Example
```bash
# Prepare Nation Builder for layout
python scripts/inject_numeric_tags.py \
  "Nation Builder Edmunds System/Nation Builder Edited_Pre_Edmunds_Syntax.md" \
  --form raw \
  --max-level 4 \
  -o "Nation Builder Edmunds System/Nation_Builder_Bridge.txt"
```

## Flags Reference

### inject_numeric_tags.py

| Flag | Options | Default | Description |
|------|---------|---------|-------------|
| `--form` | backtick, raw, comment, bracket | backtick | Tag representation |
| `--max-level` | 1-6 | None | Cap heading depth |
| `-o, --output` | filename | stdout | Output file |

### strip_numeric_tags.py

| Flag | Options | Default | Description |
|------|---------|---------|-------------|
| `-o, --output` | filename | stdout | Output file |
| `-i, --in-place` | flag | false | Modify input file |

## Safety Features

- ✅ **Idempotent**: Safe to run multiple times
- ✅ **Non-destructive**: Body text and code blocks untouched
- ✅ **Deterministic**: Round-trip testing confirms accuracy
- ✅ **Encoding-safe**: Handles UTF-8 correctly
- ✅ **Format-flexible**: Multiple tag representations

## Troubleshooting

### Tags appear as HTML in GitHub
**Problem**: Using raw `<1>` tags  
**Solution**: Use `--form backtick` for Markdown rendering

### IA Writer strips angle brackets
**Problem**: `<1>` tags disappear during export  
**Solution**: Use `--form comment` or `--form bracket`

### Tags duplicated after rerun
**Problem**: Script run twice on same file  
**Solution**: Scripts are idempotent; check input file. Use strip first if needed.

### Code block headers get tagged
**Problem**: `#` inside ``` blocks treated as headers  
**Solution**: Scripts skip fenced code blocks automatically. Check fence markers.

## Integration with Existing Tools

The Edmunds System works alongside all book-md-tools scripts:

```bash
# Standard cleanup pipeline
python scripts/fix_formatting.py manuscript.md -o clean.md
python scripts/fix-headers clean.md --max-depth 4
python scripts/long_line_detector.py clean.md --fix

# Add Edmunds bridge step
python scripts/inject_numeric_tags.py clean.md --form raw -o bridge.txt

# Send bridge.txt to layout
# ... layout work happens ...

# Restore clean markdown
python scripts/strip_numeric_tags.py bridge.txt -o final.md
```

## Next Steps

- 📖 Read full specification: [`docs/EDMUNDS_SYSTEM_MODULE.md`](EDMUNDS_SYSTEM_MODULE.md)
- 🖥️ Try the GUI workbench module (coming soon)
- 🎥 Watch video tutorial: "3 Minutes to Your First Bridge File" (planned)
- 💬 Share feedback on GitHub Issues

## Credits

Documentation and workflow derived from Gygax Archive editorial standards (Troll Lord Games, 2025).

Named after Bill Edmunds, whose manual tagging process inspired this automation.

---

**Version**: 1.0  
**Updated**: 2025-11-01  
**Part of**: book-md-tools suite
