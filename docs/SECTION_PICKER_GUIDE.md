# Section Picker – User Guide

**Feature:** Process specific sections of your document (like Word's Outline view)  
**Version:** 2.2.1  
**Date:** November 2, 2025

## Overview

The Section Picker allows you to selectively process only specific chapters, sections, or subsections of your document. This is especially useful for:

- **Large documents** where you only need to fix one chapter
- **Incremental processing** (process Chapter 1, review, then process Chapter 2)
- **Targeted fixes** (only run header depth correction on Appendix A)
- **Faster iteration** during editing

## How It Works

The Section Picker extracts your document's outline (all markdown headers) and lets you check/uncheck which sections to process. When you run a Quick Tool, it processes **only the selected sections**, creating a temporary file behind the scenes.

## Step-by-Step Guide

### 1. Load Your Document
- Click **Browse...** in the sidebar
- Select your markdown file
- The app loads and displays the content

### 2. Open Quick Tools
- Click **⚡ Quick Tools** button (top-right header)
- The Quick Tools modal opens showing available tools

### 3. Open Section Picker
- At the top of the Quick Tools modal, you'll see a blue tip box
- Click **"Select Sections..."** link
- The Section Picker modal opens

### 4. Review Document Outline
The picker shows your document structure with:
- **Indentation** matching header levels (H1, H2, H3, etc.)
- **Icons** indicating nesting (📄 for H1, 📄📄 for H2, etc.)
- **Line ranges** showing where each section begins/ends
- **Checkboxes** to select/deselect sections

Example outline:
```
☐ 📄 CHAPTER 1: INTRODUCTION (lines 1-45)
  ☐ 📄📄 Background (lines 5-20)
  ☐ 📄📄 Scope and Purpose (lines 21-45)
☐ 📄 CHAPTER 2: METHODS (lines 46-120)
  ☐ 📄📄 Research Approach (lines 50-85)
  ☐ 📄📄 Data Collection (lines 86-120)
☐ 📄 APPENDIX A (lines 121-150)
```

### 5. Select Sections
**Option A: Select specific sections**
- Click checkboxes for the sections you want to process
- Each section can be toggled independently

**Option B: Quick selection**
- Click **"✓ Select All"** to check everything
- Click **"✗ Deselect All"** to uncheck everything
- Then manually adjust individual selections

### 6. Apply Selection
- The footer shows: "X of Y sections selected"
- Click **"Apply Selection"** button
- The picker closes and Quick Tools modal reopens
- A log entry confirms your selection: "Section selection applied: X sections"

### 7. Run a Quick Tool
- Choose one of the tools (Header Depth Corrector, Long Line Detector, etc.)
- The modal closes immediately
- Progress spinner shows while processing
- The tool runs **only on your selected sections**

### 8. Review Results
- Check the Log tab to see processing details
- The Change Log shows: "Ran [tool] on X sections"
- Output files are saved with the standard suffix (e.g., `_cleaned`)

## What Gets Processed

### Full Document (Default)
If you **don't** use the Section Picker, or if you select all sections, the entire document is processed normally.

### Selected Sections Only
If you select specific sections:
1. The app extracts content for those sections (including their full line ranges)
2. Creates a temporary file with just that content
3. Passes the temp file to the Python tool
4. The tool processes only those sections
5. Temp file is automatically deleted after processing

**Important:** Section boundaries are determined by headers. Content between headers belongs to that section.

## Practical Examples

### Example 1: Fix Headers in One Chapter
**Scenario:** Your book has 10 chapters, but Chapter 5 has header depth issues.

**Steps:**
1. Load document
2. Quick Tools → Select Sections
3. Uncheck all sections except "CHAPTER 5: ..."
4. Apply Selection → Run "Header Depth Corrector"
5. Only Chapter 5 is processed

### Example 2: Process Multiple Appendices
**Scenario:** You have Appendices A-E and want to run long line detection on just A and C.

**Steps:**
1. Load document
2. Quick Tools → Select Sections
3. Check only "APPENDIX A" and "APPENDIX C"
4. Apply Selection → Run "Long Line Detector"
5. Only those two appendices are analyzed

### Example 3: Incremental Spell Check
**Scenario:** 300-page manuscript, want to spell-check chapter by chapter to avoid overwhelming output.

**Steps:**
1. Load document
2. Quick Tools → Select Sections
3. Check only "CHAPTER 1"
4. Apply Selection → Run "Spell Check"
5. Review results, fix issues
6. Repeat for Chapter 2, 3, etc.

## Technical Details

### Section Detection
- **Markdown headers** (lines starting with `#`, `##`, `###`, etc.) define sections
- **Section boundaries** extend from one header to the line before the next header
- **Nested sections** (H2 under H1) are shown with indentation but tracked separately

### Content Extraction
When you select sections:
```
Selected: Chapter 2 (lines 46-120), Appendix A (lines 121-150)

Extracted content:
  Lines 46-120 (Chapter 2 full text)
  Lines 121-150 (Appendix A full text)

Not included:
  Lines 1-45 (Chapter 1)
  Lines 151+ (Appendix B onwards)
```

### Temporary Files
- Created in same directory as source file
- Named: `filename_temp_sections_cleaned.md` (or similar)
- Automatically deleted after tool completes
- Only exist during processing (< 1 second typically)

## Limitations

### Current Version (2.2.1)
- ✅ **Works with:** Header Depth Corrector, Long Line Detector, Paragraph Break Detector, Spell Check
- ⚠️ **Limited support:** TOC Fixer (processes selected sections but may create incomplete TOC)
- ❌ **Not supported:** Full Pipeline (pipeline requires complete document)

### Section Granularity
- Selection is **header-based** (you can't select line 50-75 arbitrarily)
- If you need finer control, edit the document to add more headers
- Minimum selection: one full section

### Output Files
- Processed sections are saved to a new file (e.g., `document_cleaned.md`)
- **Note:** The output contains only the processed sections, not the entire document
- To merge back: copy processed sections into original file manually

## Workflow Recommendations

### Best Practice: Section-by-Section Processing
For large documents (100+ pages):
1. **First pass:** Process one chapter to test tool settings
2. **Review:** Check output quality, adjust threshold/options if needed
3. **Batch process:** Select multiple chapters, process, review
4. **Final pass:** Run on entire document for consistency

### Preserving Context
Some tools benefit from full document context:
- **Header Depth Corrector:** Works well per-section
- **Long Line Detector:** Works well per-section
- **Spell Check:** Better with full document (catches repeated misspellings)
- **Paragraph Break Detector:** Better with full document (detects patterns)

### Combining with Document Comparator
After section-specific processing:
1. Save original file
2. Process selected sections
3. Use Document Comparator to verify changes affect only intended sections

## Troubleshooting

### "No headers found in document"
- **Cause:** Document has no markdown headers (`#`, `##`, etc.)
- **Fix:** Add headers to structure your document, or process entire file without section picker

### "0 sections selected"
- **Cause:** You clicked Apply without checking any sections
- **Fix:** Click at least one checkbox before applying

### Section selection not applying
- **Cause:** Closed modal without clicking "Apply Selection"
- **Fix:** Reopen Section Picker, make selection, click "Apply Selection" (not Cancel or X)

### Tool processed entire document instead of sections
- **Cause:** All sections were selected (default behavior)
- **Fix:** Deselect some sections before applying

### Output file missing content
- **Expected:** Output contains only processed sections
- **Solution:** This is intentional - manually merge processed sections back into original

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Open Quick Tools | Click ⚡ button |
| Close any modal | Esc (standard) |
| Toggle checkbox | Spacebar (when focused) |

## Future Enhancements

Potential features for future versions:
- **Range selection:** Click-drag to select Chapter 3-7
- **Search/filter:** Find sections by keyword
- **Hierarchical selection:** Check H1 to auto-select all child H2/H3
- **Section tagging:** Name selection sets for reuse
- **Merge assistant:** Auto-merge processed sections back into original

---

**Questions?** Check the [Electron App Quick Start Guide](./ELECTRON_APP_QUICK_START.md) for general app usage.
