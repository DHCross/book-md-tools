# The Edmunds System: Core Protocol

## What It Is

The Edmunds System is a **human-readable bridge protocol** between editorial text and professional layout. It consists of three operations and three guarantees—nothing more, nothing less.

## The Three Operations

### 1. Tag Injection
Insert numeric hierarchy markers at Markdown heading positions:
```markdown
# Chapter Title     →    # <1> Chapter Title
## Section Title    →    ## <2> Section Title
### Subsection      →    ### <3> Subsection
```

### 2. Tag Removal
Symmetrically remove all numeric tags, restoring clean Markdown:
```markdown
# <1> Chapter Title    →    # Chapter Title
## <2> Section Title   →    ## Section Title
### <3> Subsection     →    ### Subsection
```

### 3. Round-Trip Verification
Prove that inject→strip→compare = identical:
```bash
original.md → inject → tagged.md → strip → restored.md
diff original.md restored.md  # no differences
```

## The Three Guarantees

### 1. Unambiguous Hierarchy
Numeric tags replace visual formatting as the single source of truth for heading levels. Layout tools can map `<1>` → `H1_Main`, `<2>` → `H2_Section` without ambiguity.

### 2. Safe Interchange
Tags survive any renderer or export stage:
- `<1>` for direct layout import
- `` `<1>` `` for Markdown rendering safety
- `<!--1-->` for invisible HTML comments
- `[1]` for angle-bracket sanitization

### 3. Reversibility
A clean restore path ensures manuscripts remain canonical. No matter what happens in layout, the source file can be recovered.

## That's It

Everything else is context:
- **Why** we do it: preserve structure through lossy conversions
- **Where** it happens: post-Word export, pre-InDesign import
- **How** it integrates: InDesign Find/Change or GREP style mapping

The Edmunds System was never complex software. It's a **manual convention encoded as a reproducible algorithm**.

## Implementation

Two scripts, two functions each:

**inject_numeric_tags.py**
```python
def detect_heading(line) → (level, text)
def insert_tag(level, text, form) → tagged_line
```

**strip_numeric_tags.py**
```python
def detect_tag(line) → (tag, rest)
def remove_tag(line) → clean_line
```

Total core logic: ~100 lines of regex-anchored Python.

## Usage

```bash
# Prepare for layout
python scripts/inject_numeric_tags.py manuscript.md -o bridge.txt

# Restore after layout
python scripts/strip_numeric_tags.py bridge.txt -o restored.md

# Verify determinism
diff manuscript.md restored.md
```

## Future Optional Layers

These are enhancements, not requirements:

1. **Setext heading detection** (`===`/`---` style headers)
2. **IA Writer export mode** (default to `<!--n-->` tags)
3. **InDesign GREP generator** (automate Find/Change mapping)
4. **GUI preview module** (before/after visualization)

But the protocol itself is complete.

## Historical Note

Named after Bill Edmunds, whose manual tagging process this automation reproduces. What took minutes per chapter now takes milliseconds per manuscript—but the logic is identical.

## Proof of Correctness

The round-trip test is not just validation—it's the specification:

```python
assert inject(strip(inject(text))) == inject(text)  # idempotent
assert strip(inject(text)) == text                   # reversible
```

If these hold, the system works. If they fail, the system is broken.

That's the entire standard.

---

**Version**: 1.0  
**Status**: Complete  
**Implementation**: [`scripts/inject_numeric_tags.py`](../scripts/inject_numeric_tags.py), [`scripts/strip_numeric_tags.py`](../scripts/strip_numeric_tags.py)  
**Test**: Round-trip verified ✅
