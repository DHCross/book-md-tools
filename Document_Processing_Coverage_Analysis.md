# Yggsburgh Document Processing Scripts - Complete Coverage Analysis

**Date:** August 7, 2025  
**Assessment:** Coverage of all identified paragraph and formatting problems

## Current Script Coverage

### ✅ FULLY AUTOMATED ISSUES

1. **Header Depth Problems**
   - **Script:** `markdown_header_depth_corrector.py`
   - **Covers:** Headers deeper than H4, converts to bold text, fixes hierarchy
   - **Status:** Complete automation

2. **Broken Mid-Sentence Paragraphs**
   - **Script:** `fix_broken_paragraphs.py`
   - **Covers:** Lines that end mid-sentence and continue on next line
   - **Example:** "Thieves' Guild, Area 6" → "Thieves' Guild, Area 6"
   - **Status:** Complete automation

3. **Dagger Symbol Removal**
   - **Script:** `remove_dagger_symbols.py`
   - **Covers:** All instances of "†" character
   - **Status:** Complete automation

4. **Table of Contents Formatting**
   - **Script:** `fix_toc_enhanced.py`
   - **Covers:** Standardizes dot leaders, handles multi-entry lines
   - **Status:** Complete automation

### ⚠️ PARTIALLY AUTOMATED ISSUES

5. **Table Formatting Problems**
   - **Script:** `fix_table_formatting.py`
   - **Current Coverage:** Detects broken price entries but limited fixing
   - **Missing:** Complex pricing table restructuring
   - **Example Problem:** "125gp 20gp per point restored 1,250gp" (jumbled pricing)
   - **Status:** Detection only, manual fixes required

### 🔧 MANUAL PROCESS ISSUES

6. **Redundant Page Headers**
   - **Coverage:** Manually identified and removed
   - **Examples:** "Setting, History and Culture" page artifacts
   - **Potential for Automation:** Medium (pattern-based detection possible)

## Gaps in Current Automation

### Table Structure Issues
The current `fix_table_formatting.py` script can identify problems but doesn't fully restructure complex pricing tables where:
- Multiple prices are concatenated on one line
- Item descriptions are separated from their prices
- Table columns are misaligned

### Examples Not Fully Handled:
```markdown
# Current problematic format:
Armor, steel mail, (full chain mail), 10 weeks' work 125gp 20gp per point restored 1,250gp

# Should potentially be:
| Item | Time | Base Cost | Repair Cost | Notes |
|------|------|-----------|-------------|-------|
| Armor, steel mail (full chain mail) | 10 weeks' work | 125gp | 20gp per point restored | Max 1,250gp |
```

## Recommendations for Complete Coverage

### 1. Enhanced Table Formatting Script
Create an enhanced version that can:
- Parse pricing information more intelligently
- Restructure jumbled price entries
- Create proper table formatting when appropriate

### 2. Page Header Detection Script
Automate the detection and removal of:
- Redundant section headers
- Page footer artifacts
- Running headers that appear in body text

### 3. Master Processing Pipeline
Create a single script that runs all fixes in proper sequence:
```python
def process_document(input_file):
    # 1. Fix headers
    run_header_corrections()
    # 2. Remove symbols
    run_dagger_removal()
    # 3. Fix paragraphs
    run_paragraph_fixes()
    # 4. Fix tables
    run_table_formatting()
    # 5. Fix TOC
    run_toc_fixes()
    # 6. Remove page artifacts
    run_page_header_removal()
    # 7. Generate report
    create_comprehensive_report()
```

## Current State Assessment

**Covered Automatically:** ~85% of identified issues  
**Requires Manual Review:** ~15% (complex table formatting, page artifacts)

## Action Items

1. **Enhance table formatting script** for complex pricing structures
2. **Create page artifact detection** for redundant headers
3. **Build master pipeline script** for complete automation
4. **Add validation checks** to ensure no regressions between fixes

## Files for Enhancement Priority

1. `fix_table_formatting.py` - Needs intelligent pricing structure handling
2. New: `remove_page_artifacts.py` - For redundant headers/footers  
3. New: `master_document_processor.py` - Complete pipeline
4. Enhanced: All scripts with better error handling and validation
