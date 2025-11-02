# Book MD Workbench – Quick Start Guide

**Version:** 2.2.0  
**Updated:** November 2, 2025

## Launch the App

```bash
cd electron
npm start
```

Or from the workspace root:

```bash
npm --prefix electron start
```

---

## Understanding the Interface

### Main Workflow (Tabs 1-4)

These tabs work with **a single loaded markdown file**:

| Tab | Purpose | When to Use |
|-----|---------|-------------|
| **Preview** | Raw markdown text | See exact file content, verify load |
| **Rendered** | HTML rendered view | Preview how markdown will look |
| **Summary** | Document statistics | Check word count, headers, structure |
| **Comparison** | Compare two versions | Detect missing content, structural breaks |

**How it works:**
1. Click "Browse..." in the sidebar
2. Select your markdown file
3. App **automatically switches to Preview tab** to show loaded content
4. Switch between Preview/Rendered/Summary to inspect the file
5. Use "Run Full Pipeline" or other tools to process it

---

### Table Tools (Tab 5) – Independent Workflow

**Table Tools is completely independent** — you don't need to load a main file first!

| Tool | Input | Output | Use Case |
|------|-------|--------|----------|
| **Markdown → TSV** | `.md` file with pipe tables | `.txt` with real tabs | InDesign table import |
| **Names → Columns** | `.txt` with comma lists | Multi-column `.txt` | Book of Names layout |
| **Multi-Format** | Paste text directly | TSV/CSV/Markdown | Convert messy OCR tables |

**How each tool works:**

#### Tool 1: Markdown → TSV
1. Click "Markdown → TSV" at the top
2. Browse for a `.md` file containing pipe tables
3. (Optional) Check "Skip header comments" if you don't want `# Part 1` lines
4. Click "Convert to TSV"
5. Preview the result, then click "Copy to Clipboard"
6. Paste into InDesign (File → Place, or ⌘D)

#### Tool 2: Names → Columns
1. Click "Names → Columns" at the top
2. Browse for a `.txt` file with comma-separated names
3. Set number of columns (default: 4)
4. Click "Convert to Columns"
5. Preview the result, then click "Copy to Clipboard"
6. Paste into InDesign text frame

#### Tool 3: Multi-Format Converter
1. Click "Multi-Format Converter" at the top
2. **No file needed!** Just paste messy table text into the text area
3. Choose output format: TSV, CSV, or Markdown
4. Click "Convert"
5. Review any orphaned lines (unpaired descriptors/values)
6. Click "Copy to Clipboard" and paste wherever needed

---

## Common Workflows

### Workflow A: Process a Book Manuscript
1. Load main file → Preview tab shows content
2. Click "Run Full Pipeline" → processes file
3. Switch to Rendered tab → see formatted result
4. Check Summary tab → verify structure
5. Export or open output folder

### Workflow B: Compare Two Versions
1. Load main file (or skip this step)
2. Click "🔍 Compare Documents" in sidebar
3. Select baseline and comparison files
4. Adjust threshold if needed (default 15%)
5. Click "Run Comparison"
6. App switches to Comparison tab → shows results

### Workflow C: Convert Tables for InDesign
1. Click "📊 Table Converters" in sidebar → switches to Table Tools tab
2. Choose appropriate tool (Markdown → TSV, Names → Columns, or Multi-Format)
3. Follow tool-specific steps (see above)
4. Copy result to clipboard
5. Import into InDesign

**Key Point:** Table Tools doesn't need the main file loaded. It's completely independent!

---

## Troubleshooting

### "Loaded: filename.md" but I don't see anything
- **Cause:** App says "Loaded" but you're on a different tab (e.g., Table Tools)
- **Fix:** Click the **Preview** tab to see raw content, or **Rendered** tab to see HTML

### I want to use Table Tools but loaded a main file first
- **No problem!** Table Tools works independently
- Just click "Table Tools" tab and use any converter
- Your main file stays loaded in the background

### Where's the output file?
- **Pipeline tools:** Output saved in same folder as input, with suffix (e.g., `_cleaned`)
- **Table converters:** You specify output path, or copy to clipboard
- Click "📂 Open Output Folder" to see generated files

### App won't start
- Check `electron/node_modules` exists: `ls electron/node_modules`
- If missing: `cd electron && npm install`
- Try: `npm --prefix electron start`

---

## Tips

- **Auto-switch to Preview:** When you load a file, the app now automatically shows it in Preview tab
- **Independent tools:** Table Tools, Document Comparator, Quick Tools all work independently
- **Copy to clipboard:** All Table Tools have "Copy to Clipboard" buttons for quick InDesign import
- **Real tabs matter:** TSV output uses real `\t` characters, not spaces—critical for InDesign

---

## Interface Reference

### Sidebar Sections

```
Input File
  ├─ Browse... (loads main file)
  └─ Output Suffix (for pipeline)

Pipeline
  ├─ Run Full Pipeline
  ├─ Format Text
  └─ Fix TOC

Edmunds Tagging
  ├─ Inject Tags
  └─ Strip Tags

Document Comparator
  └─ Compare Documents (opens modal)

Table Tools
  └─ Table Converters (switches to Table Tools tab)

File Actions
  ├─ Export Markdown
  └─ Open Output Folder
```

### Top Tabs

```
Preview    → Raw markdown (main file)
Rendered   → HTML view (main file)
Summary    → Stats (main file)
Comparison → Comparison results
Table Tools → Independent converters (3 tools)
Log        → Operation history
Change Log → File modifications
```

---

## Next Steps

- **Explore Table Tools:** Try pasting sample text into Multi-Format Converter
- **Compare documents:** Use Document Comparator on two versions of a file
- **Process a book:** Load a full manuscript and run the pipeline
- **Check docs:** See `docs/TABLE_TOOLS_MODULE.md` for detailed Table Tools guide

---

**Questions or issues?** Check the full documentation in `docs/` or open Developer Tools (View → Toggle Developer Tools) to see console errors.
