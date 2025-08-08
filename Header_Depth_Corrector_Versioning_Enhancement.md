# Header Depth Corrector - Versioning Enhancement Summary

## Update Overview
Enhanced the `markdown_header_depth_corrector.py` script with automatic versioning capabilities to help track multiple runs and identify the latest output files.

## Version Update
- **Previous Version**: 1.0.0 (2024-12-19)
- **Current Version**: 1.1.0 (2025-08-07)

## New Features Added

### 1. **Automatic Versioning System**
- Output files now include version numbers: `filename_header_corrected_v1.md`, `v2.md`, etc.
- Report files also versioned: `filename_header_corrected_report_v1.md`
- Automatically detects existing versions and increments accordingly
- No more overwriting previous runs

### 2. **Smart Version Detection**
- Scans directory for existing versioned files
- Finds highest version number and increments by 1
- Works with any input filename pattern
- Handles gaps in version numbers (e.g., if v2 is deleted, next run becomes v4)

### 3. **Flexible Output Control**
- **Auto-versioning**: When no output file specified (default behavior)
- **Manual naming**: When specific output file provided (bypasses versioning)
- Backward compatible with existing workflows

## Usage Examples

### Automatic Versioning (New Default)
```bash
# First run creates: document_header_corrected_v1.md
python3 markdown_header_depth_corrector.py document.md

# Second run creates: document_header_corrected_v2.md  
python3 markdown_header_depth_corrector.py document.md

# Third run creates: document_header_corrected_v3.md
python3 markdown_header_depth_corrector.py document.md
```

### Manual Output (Bypasses Versioning)
```bash
# Creates specific filename (no versioning)
python3 markdown_header_depth_corrector.py document.md final_output.md
```

## File Naming Pattern

### Output Files
- **Pattern**: `{input_name}_header_corrected_v{N}.md`
- **Example**: `Yggsburgh-final_header_corrected_v1.md`

### Report Files  
- **Pattern**: `{input_name}_header_corrected_report_v{N}.md`
- **Example**: `Yggsburgh-final_header_corrected_report_v1.md`

## Benefits

### ✅ **Version Control**
- Never accidentally overwrite previous work
- Easy to compare different runs
- Clear progression of document improvements

### ✅ **Workflow Efficiency**
- Quickly identify latest version by highest number
- Safe to experiment with different settings
- Maintain audit trail of processing history

### ✅ **Backward Compatibility**
- Existing command-line options unchanged
- Manual output filename still supported
- No breaking changes to workflow

## Implementation Details

### Code Changes
1. **Added version detection method**: `get_next_version()`
2. **Added filename generation**: `generate_versioned_filename()`
3. **Enhanced report naming**: Matches output file version
4. **Updated command-line help**: Reflects new versioning behavior

### Testing Verified
- ✅ Sequential versioning (v1 → v2 → v3)
- ✅ Version gap handling
- ✅ Manual filename override
- ✅ Report file version matching
- ✅ Cross-platform compatibility

## Documentation Updated
- **TLG_Python_Tools_Documentation.md**: Enhanced with versioning details
- **Script header**: Updated version and date
- **Command-line help**: Includes versioning examples

## Future Considerations
- Optional: Add `--version-prefix` flag for custom version naming
- Optional: Add `--list-versions` command to show existing versions
- Optional: Add `--clean-versions` command to remove old versions

---

**Status**: ✅ **COMPLETE** - Versioning system fully implemented and tested  
**Impact**: Improved workflow efficiency and version management  
**Compatibility**: Fully backward compatible with existing usage
