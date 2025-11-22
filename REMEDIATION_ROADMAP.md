# 📋 COMPLETE REMEDIATION ROADMAP

**Status:** Ready for Implementation  
**Total Effort:** 4-6 hours  
**Risk Level:** High Impact → Low Risk (systematic approach)  
**Objective:** Transform TRPG MD Workbench from disk-centric to editor-centric architecture

---

## 📚 Documentation Suite

This remediation is documented in 4 detailed guides:

1. **`FULL_CODE_AUDIT_REPORT.md`** ← Start here
   - Identifies all 11 critical architectural violations
   - Explains what's broken and why
   - Shows specific code locations
   - Documents risk assessment for each issue

2. **`CODE_FIX_IMPLEMENTATION_PLAN.md`** ← Overview & strategy
   - High-level fix strategy
   - Organized by phase with time estimates
   - Risk mitigation guidance
   - Success criteria for each phase

3. **`PHASE_1_IMPLEMENTATION_GUIDE.md`** ← Task 1: 40 minutes
   - Block dangerous operations
   - Wrap formatTextBtn in safety system
   - Convert formatText to content-based
   - Detailed step-by-step implementation

4. **`PHASE_2_IMPLEMENTATION_GUIDE.md`** ← Task 2: 1.5 hours
   - Enable blank document support
   - Remove file-path requirements
   - Update 6+ remaining tools
   - Support content-only workflows

5. **`PHASE_3_IMPLEMENTATION_GUIDE.md`** ← Task 3: 1 hour
   - Fix comparison tools
   - Fix table converters
   - Complete source-of-truth architecture
   - Production readiness

**This Document** ← You are here
   - Quick reference for entire remediation
   - Command sequences for quick execution
   - Validation checklist
   - Troubleshooting guide

---

## 🎯 Quick Summary

### Problem
Currently, tools can overwrite unsaved work, blank documents are blocked, and architecture violates "Editor as Source of Truth" principle.

### Solution
Implement 3-phase systematic fix:
1. **Phase 1:** Make formatTextBtn safe (40 min)
2. **Phase 2:** Enable blank documents (1.5 hrs)
3. **Phase 3:** Fix remaining tools (1 hr)

### Result
Production-ready TRPG MD Workbench that:
- ✅ Never loses unsaved work
- ✅ Supports blank document workflows
- ✅ Uses editor as sole source of truth
- ✅ All tools wrapped in safety system
- ✅ Zero file writes except on Save

---

## 🚀 Quick Start

### Prerequisites
- Git repository set up
- Electron app can run locally
- Working knowledge of renderer.js and main.js

### Before You Begin

1. **Create feature branch:**
   ```bash
   cd /Users/dancross/Documents/GitHub/book-md-tools
   git checkout -b fix/editor-source-of-truth
   ```

2. **Backup current state:**
   ```bash
   git stash  # or make backup branch
   ```

3. **Read the audit report:**
   - Open `FULL_CODE_AUDIT_REPORT.md`
   - Understand the 11 violations
   - Note the high-risk areas

4. **Review Phase 1 guide:**
   - Open `PHASE_1_IMPLEMENTATION_GUIDE.md`
   - Follow step-by-step implementation
   - Run tests after each change

---

## 📍 File Locations Reference

**Key Files to Modify:**

| File | Purpose | Phase |
|------|---------|-------|
| `electron/src/renderer.js` | UI logic, tool handlers | 1, 2, 3 |
| `electron/main.js` | IPC handlers | 1, 2, 3 |
| `electron/src/index.html` | UI structure | - (already done) |
| `electron/src/styles.css` | UI styles | - (already done) |

**Key Functions to Update:**

| Function | Location | Phase |
|----------|----------|-------|
| formatTextBtn listener | renderer.js ~950 | 1 |
| fixTOCBtn listener | renderer.js ~977 | 2 |
| injectTagsBtn listener | renderer.js ~1014 | 2 |
| stripTagsBtn listener | renderer.js ~1047 | 2 |
| buildHeadersBtn listener | renderer.js ~1225 | 2 |
| runQuickTool | renderer.js ~1365 | 2 |
| compareBtn listener | renderer.js ~1569 | 3 |
| Table converters | renderer.js ~1864 | 3 |
| format-text IPC | main.js ~312 | 1 |
| fix-toc IPC | main.js ~327 | 2 |
| inject-tags IPC | main.js ~342 | 2 |
| strip-tags IPC | main.js ~367 | 2 |
| run-quick-tool IPC | main.js ~392 | 2 |
| run-pipeline IPC | main.js ~280 | 2 |
| compare-documents IPC | main.js (varies) | 3 |
| table converters IPC | main.js (varies) | 3 |

---

## 🔄 Implementation Sequence

### Phase 1: Block Dangerous Operations (40 minutes)

**Objective:** Make formatTextBtn safe immediately

**Tasks:**
1. ✅ Wrap formatTextBtn in runSafeTool()
2. ✅ Update formatText IPC handler to accept content
3. ✅ Repeat for fixTOC, injectTags, stripTags
4. ✅ Test with blank documents and undo

**Commits:**
```bash
git add electron/src/renderer.js electron/main.js
git commit -m "Phase 1: Wrap format tools in safety system and enable content-based IPC"
```

**Success Indicators:**
- [ ] formatTextBtn shows diff preview before applying changes
- [ ] Blank documents can be formatted
- [ ] Undo restores original content
- [ ] No file-path blocking errors

---

### Phase 2: Enable Blank Documents (1.5 hours)

**Objective:** Remove file-path requirements from all tools

**Tasks:**
1. ✅ Remove `if (!currentFilePath) abort` from 6+ tools
2. ✅ Update remaining IPC handlers to content-based
3. ✅ Support blank documents in all tool systems
4. ✅ Comprehensive testing

**Commits:**
```bash
git add electron/src/renderer.js electron/main.js
git commit -m "Phase 2: Enable blank document support across all tools"
```

**Success Indicators:**
- [ ] All 7 tools work with blank documents
- [ ] No file-based blocking checks remaining
- [ ] All IPC handlers return content (not paths)
- [ ] All temp files cleaned up

---

### Phase 3: Complete Architecture (1 hour)

**Objective:** Fix remaining file-based tools

**Tasks:**
1. ✅ Update compareDocuments to accept content
2. ✅ Update table converters to accept content
3. ✅ Complete source-of-truth implementation
4. ✅ Final validation

**Commits:**
```bash
git add electron/src/renderer.js electron/main.js
git commit -m "Phase 3: Complete editor-as-source-of-truth architecture"
```

**Success Indicators:**
- [ ] Compare accepts current editor content
- [ ] Table converters work with blank documents
- [ ] Zero file writes except on Save
- [ ] All 9 tools fully functional

---

## 🧪 Testing Checklist

### Phase 1 Tests

**Test 1: Load File → Format Text**
```
1. Load any markdown file
2. Click "Format Text"
3. Verify diff preview appears
4. Accept changes
5. Verify content updated
✅ Should work
```

**Test 2: Blank Document → Format Text**
```
1. Close any open files (blank)
2. Type markdown in editor
3. Click "Format Text"
4. Verify NO "please load file" error
✅ Should work
```

**Test 3: Format → Undo**
```
1. Format a file
2. Press Ctrl+Z
3. Verify original content restored
✅ Should work
```

### Phase 2 Tests (repeat for each tool)

**Test 4: Tool + Blank Document**
```
For each tool (fixTOC, injectTags, stripTags, buildHeaders):
1. Blank document (no file)
2. Type content
3. Click tool button
4. Verify works (no file-loading errors)
✅ Should work
```

**Test 5: Tool + Undo**
```
1. Load file
2. Click tool
3. Undo (Ctrl+Z)
4. Verify original restored
✅ Should work
```

### Phase 3 Tests

**Test 6: Compare + Unsaved Changes**
```
1. Load file A
2. Make unsaved edits
3. Compare with file B
4. Verify unsaved edits included in comparison
✅ Should work
```

**Test 7: Table Converter + Blank**
```
1. Blank document
2. Type markdown table
3. Click "Convert to TSV"
4. Verify works without file
✅ Should work
```

### Regression Tests (all phases)

**Test 8: File-Based Workflow Still Works**
```
1. Load file normally
2. Apply multiple tools
3. Save file
4. Verify file contents correct
5. Re-open file → content unchanged
✅ Should work
```

---

## 🔍 Validation Commands

### Check for remaining file-based issues

```bash
# Search for file-based blocking checks
grep -n "if (!currentFilePath)" electron/src/renderer.js

# Result should be EMPTY after Phase 2
# (only grep match should be editor load error handling)
```

### Verify content-based IPC handlers

```bash
# Check all IPC handlers accept content parameter
grep -n "ipcMain.handle" electron/main.js | head -20

# Each should show: async (event, content, ...)
# NOT: async (event, inputPath, ...)
```

### Verify temp file cleanup

```bash
# Check for finally blocks with cleanup
grep -n "finally {" electron/main.js

# Should see cleanup for each handler:
# fs.unlinkSync(tempInputPath);
# fs.unlinkSync(tempOutputPath);
```

### Test blank document workflow

```bash
# In Electron console:
console.log(currentContent);     // Should show content
console.log(currentFilePath);    // May be null (OK for blank)
console.log(hasUnsavedChanges()) // Should return true if typed
```

---

## ⚠️ Common Issues & Fixes

### Issue: "ReferenceError: runSafeTool is not defined"
**Cause:** Tool handler references runSafeTool before it's defined
**Fix:** Verify runSafeTool function defined before line 950

### Issue: "IPC handler never returns"
**Cause:** Promise not awaiting or rejected
**Fix:** Add try/catch and return statement in finally block

### Issue: "Temp files accumulate in repo"
**Cause:** fs.unlinkSync not called or errors silenced
**Fix:** Add error logging in finally block:
```javascript
} finally {
  try {
    if (tempInputPath && fs.existsSync(tempInputPath)) {
      fs.unlinkSync(tempInputPath);
    }
  } catch (e) {
    console.error('Temp cleanup failed:', e);  // Add logging
  }
}
```

### Issue: "Blank documents still blocked"
**Cause:** `if (!currentFilePath)` check still present
**Fix:** Change to `if (!currentContent)`

### Issue: "Undo doesn't restore original"
**Cause:** applyToolOutput not pushing to undoStack
**Fix:** Verify undoStack.push() called with original content

---

## 📊 Progress Tracking

Use this table to track Phase completion:

### Phase 1 Checklist
- [ ] formatTextBtn wrapped in runSafeTool
- [ ] formatText IPC handler content-based
- [ ] fixTOC IPC handler content-based
- [ ] injectTags IPC handler content-based
- [ ] stripTags IPC handler content-based
- [ ] All Phase 1 tests passing
- [ ] Git commit made

### Phase 2 Checklist
- [ ] fixTOCBtn accepts blank documents
- [ ] injectTagsBtn accepts blank documents
- [ ] stripTagsBtn accepts blank documents
- [ ] buildHeadersBtn accepts blank documents
- [ ] runQuickTool accepts blank documents (all 6 sub-tools)
- [ ] runPipeline accepts blank documents
- [ ] All IPC handlers content-based
- [ ] All Phase 2 tests passing
- [ ] Git commit made

### Phase 3 Checklist
- [ ] compareDocuments content-based
- [ ] convertMdTableToTsv content-based
- [ ] convertNamesToColumns content-based
- [ ] displayToolOutput function working
- [ ] All Phase 3 tests passing
- [ ] All regression tests passing
- [ ] Git commit made

---

## 🎬 Final Deployment

After all 3 phases complete:

1. **Create pull request:**
   ```bash
   git push origin fix/editor-source-of-truth
   # Create PR on GitHub
   ```

2. **Code review checklist:**
   - [ ] All file-based operations in IPC handlers only
   - [ ] All IPC handlers accept content (not paths)
   - [ ] All tool handlers use runSafeTool wrapper
   - [ ] All temp files cleaned up
   - [ ] No console errors
   - [ ] All tests passing

3. **Merge to main:**
   ```bash
   # After approval
   git checkout main
   git merge fix/editor-source-of-truth
   git push origin main
   ```

4. **Update version:**
   - Bump to new version (e.g., v2.5.0)
   - Update CHANGELOG.md
   - Commit: `git commit -m "Release v2.5.0: Editor source-of-truth architecture"`

5. **Deploy:**
   - Build Electron app
   - Create release
   - Announce to users

---

## 📚 Documentation Hierarchy

Read in this order:

1. **This document** (overview)
2. **FULL_CODE_AUDIT_REPORT.md** (understand problems)
3. **CODE_FIX_IMPLEMENTATION_PLAN.md** (understand strategy)
4. **PHASE_1_IMPLEMENTATION_GUIDE.md** (implement task 1)
5. **PHASE_2_IMPLEMENTATION_GUIDE.md** (implement task 2)
6. **PHASE_3_IMPLEMENTATION_GUIDE.md** (implement task 3)

---

## 🏆 Success Criteria - Complete Checklist

### Architectural Requirements
- ✅ Editor (currentContent) is sole source of truth
- ✅ Tools operate on currentContent in-memory
- ✅ No tool reads/writes disk directly (only via IPC)
- ✅ All tool outputs wrapped in safety system (runSafeTool)
- ✅ Blank documents fully supported
- ✅ Zero file writes except explicit user Save

### Safety Requirements
- ✅ All tools show diff preview before applying
- ✅ User can decline any tool output
- ✅ Undo restores original content
- ✅ formatTextBtn has safety wrapper
- ✅ No tool can overwrite unsaved work

### Feature Requirements
- ✅ Load files → tools work
- ✅ Blank documents → tools work
- ✅ Format text, fix TOC, inject tags, etc. all working
- ✅ Compare documents with unsaved content
- ✅ Table converters accept content

### Quality Requirements
- ✅ No console errors
- ✅ No temp file accumulation
- ✅ Performance <500ms per tool
- ✅ No memory leaks
- ✅ All tests passing

### Production Requirements
- ✅ Code reviewed
- ✅ Git history clean
- ✅ Documentation complete
- ✅ Ready for deployment

---

## 📞 Quick Reference

**When stuck:**
1. Check relevant Phase guide
2. Search FULL_CODE_AUDIT_REPORT.md for issue
3. Check Troubleshooting section above
4. Review specific function in guide

**When need to verify:**
1. Use Validation Commands section
2. Run tests from Testing Checklist
3. Check Progress Tracking table

**When need context:**
1. Read CODE_FIX_IMPLEMENTATION_PLAN.md
2. Review specific Phase guide
3. Check the detailed comments in code

---

## ✅ Ready to Begin

All documentation prepared. Follow Phase guides in sequence:

1. **START:** `PHASE_1_IMPLEMENTATION_GUIDE.md` (40 min)
2. **NEXT:** `PHASE_2_IMPLEMENTATION_GUIDE.md` (1.5 hrs)
3. **FINAL:** `PHASE_3_IMPLEMENTATION_GUIDE.md` (1 hr)

**Total Time:** 4-6 hours  
**Expected Result:** Production-ready TRPG MD Workbench

---

**Last Updated:** Today  
**Status:** Ready for Implementation  
**Version:** 1.0

