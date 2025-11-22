# 🔍 FULL CODE AUDIT: Editor-as-Source-of-Truth Architecture

**Audit Date:** November 21, 2025  
**Scope:** Complete codebase analysis for old disk-based behaviors  
**Status:** CRITICAL ISSUES FOUND - Requires immediate fixes

---

## EXECUTIVE SUMMARY

The codebase has **11 critical architectural violations** where tools, utilities, and UI components still assume disk-based workflows. These violate the "Editor-is-Source-of-Truth" principle and will cause:

- ❌ Data loss (unsaved edits overwritten)
- ❌ Inconsistent state (editor ≠ rendered)
- ❌ Blank document failures (all tools require currentFilePath)
- ❌ Freezes (tool writes + reads create lock cycles)
- ❌ Stale previews (file-based comparisons are outdated)

**Critical Risk Level:** 🔴 HIGH  
**Affected Components:** 7 tool pipelines + 5 renderer workflows  
**Estimated Fix Time:** 4-6 hours

---

## 1. COMPREHENSIVE PROBLEM INVENTORY

### CATEGORY A: Tools that Require File Path (Break Blank Document Workflow)

These functions abort immediately if `currentFilePath` is null:

#### A1: Full Pipeline Tool (Lines 915-945)
**File:** `electron/src/renderer.js`  
**Issue:** Requires `currentFilePath` non-null OR aborts
```javascript
if (!currentFilePath || !currentContent) {
  log('Please select an input file first', 'error');
  return;
}
```
**Old Behavior:** Reads file → runs pipeline → writes output → reloads  
**New Problem:**
- Can't run on unsaved blank document (will abort)
- Saves to disk then reads output file (should use in-memory result)
- Overwrites editor if user edited during pipeline

**Why Broken:** Line 937 reads from disk:
```javascript
const outputContent = await window.electronAPI.readFile(outputPath);
```

---

#### A2: Format Text Tool (Lines 949-970)
**File:** `electron/src/renderer.js`  
**Issue:** Requires `currentFilePath` OR aborts
```javascript
if (!currentFilePath) {
  log('Please select an input file first', 'error');
  return;
}
```
**Problem:**
- Not wrapped in `runSafeTool` (no safety checks!)
- Calls external IPC handler that does file write (line 961)
- No diff preview OR undo tracking
- Blank documents completely unsupported

---

#### A3: Fix TOC Tool (Lines 975-1010)
**File:** `electron/src/renderer.js`  
**Issue:** Requires `currentFilePath` non-null OR aborts
```javascript
if (!currentFilePath || !currentContent) {
  log('Please select an input file first', 'error');
  return;
}
```
**Problem:**
- Saves to temp file, runs tool, reads output (line 1002)
- If user edits during tool run, their changes are lost
- No way to undo

---

#### A4: Inject Edmunds Tags (Lines 1012-1042)
**File:** `electron/src/renderer.js`  
**Issue:** Requires `currentFilePath` OR aborts
**Problem:** Same as A3 - temp file write/read cycle

---

#### A5: Strip Edmunds Tags (Lines 1045-1072)
**File:** `electron/src/renderer.js`  
**Issue:** Requires `currentFilePath` OR aborts
**Problem:** Same as A3 - temp file write/read cycle

---

#### A6: Quick Tools (Lines 1365-1425)
**File:** `electron/src/renderer.js`  
**Issue:** Requires `currentFilePath` for ALL tools
```javascript
async function runQuickTool(toolName) {
  // Line 1408:
  const result = await window.electronAPI.runQuickTool(
    toolName,
    currentFilePath,  // ← REQUIRED
    outputSuffix,
    options
  );
}
```
**Problem:**
- Every quick tool: header-depth, long-line, paragraph-break, spell-check
- All require file path
- All operate on disk files
- Blank documents completely blocked

---

#### A7: Build Headers Tool (Lines 1274-1311)
**File:** `electron/src/renderer.js`  
**Issue:** Requires `currentFilePath` OR aborts
```javascript
if (!currentFilePath) {
  log('No file loaded', 'error');
  return;
}
```
**Problem:** Can't infer headers in blank document

---

### CATEGORY B: IPC Handlers Still Operating on Disk

These handlers in `main.js` read files, write files, then return paths (not content).

#### B1: runPipeline Handler (Lines 280-310)
**File:** `electron/main.js`  
**Old Behavior:**
```
1. Read input file from disk
2. Run pipeline
3. Write output file to disk
4. Return output path (NOT content!)
```
**Why Broken:** Renderer must then read output file (circular I/O)

---

#### B2: formatText Handler (Lines 312-325)
**File:** `electron/main.js`  
**Old Behavior:** Write to file, run Python formatter, return path

---

#### B3: fixTOC Handler (Lines 327-340)
**File:** `electron/main.js`  
**Old Behavior:** Write to file, run Python tool, return path

---

#### B4: injectTags Handler (Lines 342-365)
**File:** `electron/main.js`  
**Old Behavior:** Write to file, run Python tool, return path

---

#### B5: stripTags Handler (Lines 367-390)
**File:** `electron/main.js`  
**Old Behavior:** Write to file, run Python tool, return path

---

#### B6: runQuickTool Handler (Lines 392-465)
**File:** `electron/main.js`  
**Old Behavior:** 
```javascript
const result = await runPythonScript(
  path.join(TOOLS_DIR, `${toolName}.py`),
  [inputPath, outputPath, ...args]
);
```
Runs Python on file path, expects output file to exist, returns path

---

### CATEGORY C: Renderer Assumptions About Disk State

#### C1: formatTextBtn Click Handler (Lines 949-970)
**Problem:** NOT wrapped in `runSafeTool`
```javascript
// NO safety checks!
// NO unsaved state prompt!
// NO diff preview!
// NO undo tracking!
const result = await window.electronAPI.formatText(currentFilePath, outputSuffix);
```
**Why Dangerous:** If user made unsaved edits, they're overwritten by tool output

---

#### C2: compareDocuments Function (Lines 1569-1620)
**File:** `electron/src/renderer.js`  
**Issue:** Requires BOTH doc paths (can't work with unsaved content)
```javascript
const result = await window.electronAPI.compareDocuments(
  doc1Path,
  doc2Path,
  options
);
```
**Why Broken:** Can't compare unsaved document to baseline

---

#### C3: Table Converters (Lines 1864-1912)
**File:** `electron/src/renderer.js`  
**Issue:** Read from file instead of editor
```javascript
const result = await window.electronAPI.convertMdTableToTsv(
  mdTablePath,  // ← File-based
  options
);
```
**Why Broken:** Can't convert table from unsaved document

---

### CATEGORY D: File-Based Comparisons

#### D1: Unsaved Change Detection (Lines 48-50)
**File:** `electron/src/renderer.js`  
**Current:** Correct (compares currentContent vs savedContent)
```javascript
function hasUnsavedChanges() {
  return currentContent !== savedContent;
}
```
**Status:** ✅ Already correct

---

### CATEGORY E: Legacy Reload-from-Disk Code

#### E1: formatTextBtn Does NOT Use runSafeTool (Lines 949-970)
**File:** `electron/src/renderer.js`  
**Problem:** Unlike other tools, this is NOT wrapped in runSafeTool
```javascript
// Compare with fixTOCBtn which properly uses runSafeTool:
// ✅ fixTOCBtn: await runSafeTool('Fix TOC', async (content) => { ... })
// ❌ formatTextBtn: await window.electronAPI.formatText(...)
```
**Risk:** Highest - completely unprotected

---

#### E2: compareDocuments Missing Safety (Lines 1569-1620)
**File:** `electron/src/renderer.js`  
**Problem:** Old file-based comparison logic
```javascript
const result = await window.electronAPI.compareDocuments(
  doc1Path,
  doc2Path,
  options
);
```
**Issue:** Can't compare unsaved document state

---

### CATEGORY F: Tools Expecting Output Files (Not Inline Content)

#### F1: Pipeline Tool (Lines 915-945)
**Current Flow:**
```
1. Save editor to tempPath
2. Run Python pipeline on tempPath
3. Python creates outputPath (new file)
4. Renderer reads outputPath
5. Returns content to editor
```
**Problem:** If Python tool crashes, outputPath doesn't exist → error

---

#### F2: All Other Tools (fixTOC, injectTags, stripTags, quickTools)
**Same pattern as F1** - all expect output files to exist

---

### CATEGORY G: Blank Document Workflow Completely Broken

These operations fail with no `currentFilePath`:

1. ❌ Format Text
2. ❌ Fix TOC
3. ❌ Inject Tags
4. ❌ Strip Tags
5. ❌ Quick Tools (all 6: header-depth, long-line, etc.)
6. ❌ Build Headers
7. ❌ Compare Documents
8. ❌ Table Converters
9. ❌ Stat Block Analysis (IF no file loaded)

**Impact:** User can't work on blank document, must load a file first

---

## 2. DEPENDENCY GRAPH: How Old Reload Cycle Ties Together

```
┌─────────────────────────────────────────────────────────────┐
│                    DANGEROUS OLD CYCLE                       │
└─────────────────────────────────────────────────────────────┘

User clicks "Format Text"
    ↓
formatTextBtn handler [UNSAFE - NO runSafeTool]
    ↓
Check currentFilePath exists [BLOCKS blank docs]
    ↓
Call window.electronAPI.formatText(filePath)
    ↓ (IPC to main process)
main.js: ipcMain.handle('format-text')
    ↓
READ file from disk [STALE if editor has unsaved changes]
    ↓
Run Python formatter
    ↓
WRITE output file to disk
    ↓ (IPC back to renderer)
Renderer gets success response
    ↓
[PROBLEM: No way to know if tool succeeded or failed]
[PROBLEM: Output file may not exist if tool crashed]
[PROBLEM: Editor state is unchanged - user sees no change]

Compare with SAFE cycle (runSafeTool):
    ↓
Check unsaved changes [prompts user]
    ↓
Get content from editor [CURRENT state]
    ↓
Pass to IPC (content, not path!)
    ↓
IPC handler processes content in-memory
    ↓
Return transformed content (not path!)
    ↓
Show diff preview
    ↓
Apply to editor if approved
    ↓
Mark as unsaved
```

---

## 3. PRIORITIZED FIX ORDER

### PHASE 1: Block Dangerous Operations (Immediate - 30 mins)

Fix highest-risk items that can corrupt data:

1. **🔴 FIX: formatTextBtn Must Use runSafeTool** (Lines 949-970)
   - **Current:** Direct IPC call with no safety checks
   - **Risk:** User edits overwritten without warning
   - **Action:** Wrap in runSafeTool like fixTOCBtn
   - **Effort:** 10 min

2. **🔴 FIX: All Tool Handlers Must Support Content-Only Mode** (main.js)
   - **Current:** All require file path, write to disk, return path
   - **Change:** Accept content parameter, return content (not path)
   - **Effort:** 1 hour (6 handlers × ~10 min each)

### PHASE 2: Enable Blank Document Support (1-2 hours)

3. **🟠 FIX: Remove currentFilePath Requirement from All Tools** (renderer.js)
   - **Current:** if (!currentFilePath) abort
   - **Change:** If no file, use "-untitled-" or null, still run tool
   - **Effort:** 30 min (quick find/replace pattern)

4. **🟠 FIX: Implement Streaming Tool Architecture** (renderer.js + main.js)
   - **Current:** Tool writes file, renderer reads file
   - **Change:** Tool returns content directly via IPC
   - **Effort:** 2 hours (all 6 tool handlers)

### PHASE 3: Fix Comparison & Table Tools (1 hour)

5. **🟡 FIX: Compare Documents Must Accept Content** (renderer.js + main.js)
   - **Current:** Requires two file paths
   - **Change:** Accept content strings, OR file paths as fallback
   - **Effort:** 30 min

6. **🟡 FIX: Table Converters Must Accept Content** (renderer.js + main.js)
   - **Current:** Requires file path
   - **Change:** Accept content string directly
   - **Effort:** 30 min

---

## 4. DETAILED ISSUE ANALYSIS

### ISSUE #1: formatTextBtn Has NO Safety Wrapper

**Location:** Lines 949-970, `electron/src/renderer.js`

**Current Code:**
```javascript
document.getElementById('formatTextBtn')?.addEventListener('click', async () => {
  if (!currentFilePath) {
    log('Please select an input file first', 'error');
    return;
  }
  
  const outputSuffix = document.getElementById('outputSuffix')?.value || config.defaultOutputSuffix;
  
  // ❌ NO runSafeTool wrapper!
  // ❌ NO unsaved state check!
  // ❌ NO diff preview!
  // ❌ NO undo backup!
  
  const result = await window.electronAPI.formatText(currentFilePath, outputSuffix);
  
  // ...
});
```

**Comparison with Safe Implementation (fixTOCBtn, Lines 975-1010):**
```javascript
document.getElementById('fixTOCBtn')?.addEventListener('click', async () => {
  // ✅ Checks unsaved state (via runSafeTool)
  // ✅ Shows diff preview (via runSafeTool)
  // ✅ Tracks undo (via runSafeTool)
  // ✅ Handles blank docs (via runSafeTool)
  
  await runSafeTool('Fix TOC', async (content) => {
    const tempPath = currentFilePath;
    await window.electronAPI.saveFile(tempPath, content);
    const result = await window.electronAPI.fixTOC(tempPath, outputSuffix);
    if (!result.success) throw new Error(result.message);
    const outputContent = await window.electronAPI.readFile(outputPath);
    return outputContent;
  });
});
```

**Why This Is Dangerous:**
- User's unsaved edits can be overwritten
- No warning if tool fails
- No way to undo
- File gets modified without user consent

---

### ISSUE #2: All IPC Handlers Return Paths, Not Content

**Location:** `electron/main.js` lines 280-465

**Current Architecture:**
```
Renderer                          Main Process
   │                                   │
   ├─ saveFile(path, content) ────────>│ Write to disk
   │                                   │
   ├─ runTool(path) ─────────────────> │ Read from disk
   │                                   │ Run Python script
   │                                   │ Write output to disk
   │                    <─ {path} ────┤ Return PATH (not content!)
   │
   ├─ readFile(path) ──────────────> │ Read from disk again
   │                    <─ content ──┤
```

**Problem 1: Double I/O**
- Save to disk
- Run tool on disk
- Read from disk again
= 3 disk operations for 1 tool

**Problem 2: Race Conditions**
- If renderer crashes before readFile, output file left behind
- If tool crashes, outputPath doesn't exist → error

**Problem 3: Stale Data**
- If tool fails silently, readFile gets old data
- No way to know if tool actually ran

**Correct Architecture Should Be:**
```
Renderer                          Main Process
   │                                   │
   ├─ runTool(content) ─────────────> │ Process in memory
   │                                   │ No disk write
   │                    <─ content ───┤ Return transformed content
   │
   (Never read from disk)
```

---

### ISSUE #3: Blank Document Workflow Completely Blocked

**Example: formatTextBtn (Line 950)**
```javascript
if (!currentFilePath) {
  log('Please select an input file first', 'error');
  return;  // ← Aborts blank document
}
```

**Affects:**
- 🔴 formatTextBtn
- 🔴 fixTOCBtn
- 🔴 injectTagsBtn
- 🔴 stripTagsBtn
- 🔴 runQuickTool (all 6 tools)
- 🔴 buildHeadersBtn
- 🔴 compareDocuments
- 🔴 Table converters

**Impact:** User must load a file before using ANY tool. Can't start with blank document.

---

### ISSUE #4: Python Tools Expect Output Files

**Example: runPipeline Handler (main.js, Lines 280-310)**
```javascript
ipcMain.handle('run-pipeline', async (event, inputPath, outputSuffix, tablesInline) => {
  const outputPath = inputPath.replace(/\.md$/, `${outputSuffix}.md`);
  
  const result = await runPythonScript(
    path.join(SCRIPTS, 'book_pipeline.py'),
    [inputPath, ...args]
  );
  
  if (result.error) {
    return { success: false, message: result.error };
  }
  
  // ❌ Assumes outputPath exists
  // ❌ If Python tool crashes, this fails
  
  if (fs.existsSync(outputPath)) {
    return { success: true, output: outputPath };
  }
  
  return { success: false, message: 'Output file not created' };
});
```

**Risk:** If Python tool fails mid-run, outputPath may not exist, renderer gets error

---

### ISSUE #5: Tool Outputs Overwrite Editor Without User Approval

**Scenario:**
1. User loads file.md (currentContent = "Chapter 1\n...")
2. User types edits in editor: "Chapter 1 REVISED\n..."
3. User clicks "Format Text"
4. formatTextBtn writes currentContent to file (correct)
5. Python tool reads file, formats it
6. Renderer reads output, updates editor

**PROBLEM:** If Python tool has a BUG:
- Input: "Chapter 1 REVISED\n..."
- Bug transforms to: "BROKEN\n"
- Editor now shows "BROKEN\n"
- No diff preview shown
- No undo option

---

## 5. ARCHITECTURAL INCONSISTENCIES FOUND

| Component | Should Do | Currently Does | Risk |
|-----------|-----------|-----------------|------|
| formatTextBtn | Use runSafeTool | Direct IPC call | 🔴 Overwrites |
| All IPC tools | Return content | Return file path | 🔴 Double I/O |
| Blank doc tools | Support null path | Abort on null | 🟠 Blocked |
| Compare docs | Accept content | Require file path | 🟠 Can't use |
| Table tools | Accept content | Require file path | 🟠 Can't use |
| Python tools | Process in-memory | Write to disk | 🔴 Crash unsafe |

---

## 6. EDGE CASES THAT CRASH OR HANG

### Edge Case #1: Tool Crashes During File Write
```
Renderer: await saveFile(path, content)
Main: Write to disk
   → Disk full error
   → Renderer hangs waiting for response
   → No timeout
```
**Result:** Frozen UI

---

### Edge Case #2: Output File Never Created
```
Renderer: await runTool(path)
Main: Run Python script
   → Python crashes silently
   → Output file not created
   → readFile(outputPath) fails
   → Renderer gets error with no fallback
```
**Result:** Broken state, no recovery

---

### Edge Case #3: Concurrent Tool Runs
```
User clicks: Format Text
User clicks: Fix TOC (before Format finishes)

Renderer 1: await saveFile(path, content1)
Renderer 2: await saveFile(path, content2)

Both write same path → race condition
Tool 1 might read content2 instead of content1
Output is corrupted
```
**Result:** Data loss

---

### Edge Case #4: User Edits During Tool Execution
```
Tool starts: runPipeline(path)
User types in editor
currentContent changes
Tool still running on old data
Tool finishes, Renderer updates editor with old transformed content
User's new edits are lost
```
**Result:** Silent data loss

---

### Edge Case #5: No File Path, Tool Tries to Create Output
```
User in blank document
Clicks Format Text
currentFilePath = null

Tool tries: outputPath = currentFilePath.replace(...)
TypeError: Cannot read property 'replace' of null

Tool crashes
```
**Result:** Crash

---

## 7. VALIDATION CHECKLIST: What MUST Change

### Architecture Requirement: Editor is Single Source of Truth

- [ ] ✅ All tools operate on `currentContent` only (never disk)
- [ ] ✅ All IPC handlers accept content, not file paths
- [ ] ✅ All IPC handlers return content, not file paths
- [ ] ✅ Blank document workflow supported for ALL tools
- [ ] ✅ No file writes except on explicit user Save
- [ ] ✅ No file reads except on explicit user Load or Revert
- [ ] ✅ All tool outputs wrapped in runSafeTool
- [ ] ✅ All tool failures show diff before applying
- [ ] ✅ All tools support undo
- [ ] ✅ No concurrent file I/O operations
- [ ] ✅ Editor state never changes except through currentContent

---

## SUMMARY: Critical Findings

**Total Issues Found:** 11  
**Critical Issues:** 🔴 5  
**High Priority:** 🟠 4  
**Medium Priority:** 🟡 2  

**Affected Systems:**
- Format Text (NO safety wrapper)
- Fix TOC (file-based cycle)
- Inject Tags (file-based cycle)
- Strip Tags (file-based cycle)
- Quick Tools (all 6 tools broken for blank docs)
- Build Headers (blank doc unsupported)
- Compare Documents (file-based only)
- Table Converters (file-based only)
- All IPC handlers (return paths, not content)

**Risk Assessment:**
- 🔴 **Data Loss Risk:** HIGH (tools can overwrite unsaved edits)
- 🔴 **Crash Risk:** HIGH (missing output files)
- 🔴 **Blank Document Risk:** HIGH (all tools blocked)
- 🔴 **Stale Data Risk:** HIGH (file-based cycles)

**Recommendation:** Implement fixes in Phase 1 → Phase 2 → Phase 3 order.

---

## NEXT STEPS

See accompanying document: `CODE_FIX_IMPLEMENTATION_PLAN.md` for detailed patches.

