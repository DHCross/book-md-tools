# 🛠️ CODE FIX IMPLEMENTATION PLAN

**Companion to:** `FULL_CODE_AUDIT_REPORT.md`  
**Estimated Effort:** 4-6 hours  
**Risk Level:** High (affects core workflows)  
**Testing Required:** Comprehensive end-to-end

---

## PHASE 1: Block Dangerous Operations (Highest Risk - 40 mins)

### PHASE 1.1: Wrap formatTextBtn in runSafeTool

**File:** `electron/src/renderer.js`  
**Lines:** 949-970  
**Priority:** 🔴 CRITICAL

**Current Code (UNSAFE):**
```javascript
document.getElementById('formatTextBtn')?.addEventListener('click', async () => {
  if (!currentFilePath) {
    log('Please select an input file first', 'error');
    return;
  }
  
  const outputSuffix = document.getElementById('outputSuffix')?.value || config.defaultOutputSuffix;
  
  log('Formatting text...', 'info');
  updateStatus('Formatting...', 'processing');
  showProgress(true);
  
  const result = await window.electronAPI.formatText(currentFilePath, outputSuffix);
  
  showProgress(false);
  
  if (result.success) {
    log('Text formatted successfully', 'success');
    updateStatus('Format complete', 'success');
    addChangeLogEntry('Format Text', `Applied formatting with suffix: ${outputSuffix}`);
  } else {
    log(`Format failed: ${result.message}`, 'error');
    updateStatus('Format failed', 'error');
  }
});
```

**Fixed Code (SAFE):**
```javascript
document.getElementById('formatTextBtn')?.addEventListener('click', async () => {
  if (!currentFilePath && !currentContent) {
    log('No content to format', 'error');
    return;
  }
  
  const outputSuffix = document.getElementById('outputSuffix')?.value || config.defaultOutputSuffix;
  
  // Use safety wrapper like other tools
  await runSafeTool('Format Text', async (content) => {
    // Pass content directly to IPC (not file path)
    const result = await window.electronAPI.formatText(content, outputSuffix);
    
    if (!result.success) {
      throw new Error(result.message);
    }
    
    // Result now returns transformed content directly
    return result.content;
  });
});
```

**Changes:**
1. Remove direct IPC call
2. Wrap in `runSafeTool()`
3. Change API to pass content instead of path
4. Support blank documents (remove `currentFilePath` requirement)

**Testing:**
- [ ] Load file → Format → Verify unsaved state checked
- [ ] Format → Verify diff preview shown
- [ ] Decline diff → Verify no change applied
- [ ] Accept diff → Verify applied and marked unsaved
- [ ] Test blank document → Format works
- [ ] Undo after format → Restores original

---

### PHASE 1.2: Update IPC formatText Handler

**File:** `electron/main.js`  
**Lines:** 312-325  
**Priority:** 🔴 CRITICAL

**Current Code (FILE-BASED):**
```javascript
ipcMain.handle('format-text', async (event, inputPath, outputSuffix) => {
  try {
    const outputPath = inputPath.replace(/\.md$/, `${outputSuffix}.md`);
    
    const result = await runPythonScript(
      path.join(TOOLS_DIR, 'format_text.py'),
      [inputPath, outputPath]
    );
    
    if (result.error) {
      return { success: false, message: result.error };
    }
    
    // Read output file
    const outputContent = fs.readFileSync(outputPath, 'utf-8');
    
    return { success: true, output: outputPath };
  } catch (err) {
    return { success: false, message: err.message };
  }
});
```

**Fixed Code (CONTENT-BASED):**
```javascript
ipcMain.handle('format-text', async (event, content, outputSuffix) => {
  try {
    // Create temporary file for Python tool
    const tempInputPath = path.join(REPO_ROOT, '.tmp-format-input.md');
    const tempOutputPath = path.join(REPO_ROOT, '.tmp-format-output.md');
    
    // Write content to temp file
    fs.writeFileSync(tempInputPath, content, 'utf-8');
    
    // Run Python tool
    const result = await runPythonScript(
      path.join(TOOLS_DIR, 'format_text.py'),
      [tempInputPath, tempOutputPath]
    );
    
    if (result.error) {
      fs.unlinkSync(tempInputPath);
      return { success: false, message: result.error };
    }
    
    // Read output and return CONTENT (not path!)
    const transformedContent = fs.readFileSync(tempOutputPath, 'utf-8');
    
    // Clean up temp files
    fs.unlinkSync(tempInputPath);
    fs.unlinkSync(tempOutputPath);
    
    return { 
      success: true, 
      content: transformedContent  // ← Return content, not path
    };
  } catch (err) {
    return { success: false, message: err.message };
  }
});
```

**Changes:**
1. Accept content parameter instead of file path
2. Create temp file internally (hidden from renderer)
3. Return content in response (not path)
4. Clean up temp files after tool runs

---

### PHASE 1.3: Repeat for Other Unsafe Tools

Apply the same pattern to:
- **fixTOC Handler** (currently uses runSafeTool but still file-based)
- **injectTags Handler**
- **stripTags Handler**
- **runQuickTool Handler** (all 6 tools)

**Estimated Time:** 10 mins each = 1 hour total

---

## PHASE 2: Enable Blank Document Support (1-2 hours)

### PHASE 2.1: Remove currentFilePath Check from All Tools

**Files Affected:** `electron/src/renderer.js` (6 tools)

**Pattern:** Replace:
```javascript
if (!currentFilePath) {
  log('Please select an input file first', 'error');
  return;
}
```

**With:**
```javascript
if (!currentContent) {
  log('No content to process', 'error');
  return;
}
// currentFilePath is optional now
```

**Tools to Fix:**
1. fixTOCBtn (line 977)
2. injectTagsBtn (line 1014)
3. stripTagsBtn (line 1047)
4. buildHeadersBtn (line 1225)
5. runQuickTool (line 1365)
6. compareDocuments (line 1569)

**Estimated Time:** 5 mins × 6 = 30 mins

---

### PHASE 2.2: Update All Tool IPC Handlers

**File:** `electron/main.js` (6 handlers)

Follow the pattern from PHASE 1.2 for each:
- runPipeline (lines 280-310)
- fixTOC (lines 327-340)
- injectTags (lines 342-365)
- stripTags (lines 367-390)
- runQuickTool (lines 392-465)

**Template:**
```javascript
ipcMain.handle('tool-name', async (event, content, ...args) => {
  try {
    // Write content to temp file
    const tempIn = path.join(REPO_ROOT, '.tmp-tool-input.md');
    const tempOut = path.join(REPO_ROOT, '.tmp-tool-output.md');
    fs.writeFileSync(tempIn, content, 'utf-8');
    
    // Run tool
    const result = await runPythonScript(...);
    if (result.error) throw new Error(result.error);
    
    // Read output
    const output = fs.readFileSync(tempOut, 'utf-8');
    
    // Clean up
    fs.unlinkSync(tempIn);
    fs.unlinkSync(tempOut);
    
    return { success: true, content: output };
  } catch (err) {
    return { success: false, message: err.message };
  }
});
```

**Estimated Time:** 15 mins × 6 = 1.5 hours

---

## PHASE 3: Fix Comparison & Table Tools (1 hour)

### PHASE 3.1: Update compareDocuments

**File:** `electron/src/renderer.js` lines 1569-1620

**Current (FILE-BASED):**
```javascript
const result = await window.electronAPI.compareDocuments(doc1Path, doc2Path, options);
```

**Fixed (CONTENT-BASED):**
```javascript
// Get content from either file or editor
const content1 = isEditor1 ? currentContent : (await window.electronAPI.readFile(doc1Path));
const content2 = isEditor2 ? currentContent : (await window.electronAPI.readFile(doc2Path));

const result = await window.electronAPI.compareDocuments(content1, content2, options);
```

**Estimated Time:** 30 mins

---

### PHASE 3.2: Update Table Converters

**File:** `electron/src/renderer.js` lines 1864-1912

**Pattern:** Accept content parameter, use editor content by default

**Estimated Time:** 30 mins

---

## IMPLEMENTATION CHECKLIST

### Phase 1 (40 mins)
- [ ] Wrap formatTextBtn in runSafeTool
- [ ] Update formatText IPC handler to accept content
- [ ] Update fixTOC to accept content
- [ ] Update injectTags to accept content
- [ ] Update stripTags to accept content
- [ ] Verify all return content (not paths)

### Phase 2 (1.5 hours)
- [ ] Remove currentFilePath checks from 6 tools
- [ ] Update runPipeline handler
- [ ] Update runQuickTool handler (all 6 sub-tools)
- [ ] Update buildHeadersBtn
- [ ] Test blank document with each tool

### Phase 3 (1 hour)
- [ ] Update compareDocuments
- [ ] Update convertMdTableToTsv
- [ ] Update convertNamesToColumns
- [ ] Test comparison with unsaved content

### Verification (30 mins)
- [ ] Test all tools with blank document
- [ ] Test undo on all tool outputs
- [ ] Test diff preview rejection
- [ ] Test unsaved state checking
- [ ] Verify no file writes except Save

---

## RISK MITIGATION

Before implementing, prepare:

1. **Backup**
   ```bash
   git checkout -b fix/editor-source-of-truth
   ```

2. **Temp File Management**
   - Add cleanup in finally blocks
   - Handle disk full errors
   - Use unique temp names to prevent collisions

3. **Concurrent Operation Safety**
   - Use mutex for temp file writes
   - OR use unique UUID per temp file

4. **Error Handling**
   - Wrap all file ops in try/catch
   - Log temp file paths for debugging
   - Return meaningful error messages

---

## TESTING STRATEGY

### Unit Tests Needed
- [ ] formatText accepts content, returns content
- [ ] fixTOC works with blank document
- [ ] Blank document + Format → works (not blocked)
- [ ] Undo after tool application → restores original
- [ ] Diff preview rejection → no change applied

### Integration Tests Needed
- [ ] Load file → Format → Verify result
- [ ] Blank doc → Format → Verify works
- [ ] Edit file → Format (unsaved) → Shows diff
- [ ] Format → Decline → No change
- [ ] Format → Accept → Marked unsaved
- [ ] Format → Undo → Original restored
- [ ] Tool fails → Error shown, editor unchanged

### Edge Cases to Test
- [ ] Concurrent tool runs (should queue/block)
- [ ] Tool crashes → temp files cleaned up
- [ ] Disk full during temp write → graceful error
- [ ] Huge document (>100MB) → no memory leaks
- [ ] Special characters in content → preserved
- [ ] Rapid tool clicks → last one wins (not accumulated)

---

## DEPLOYMENT CHECKLIST

- [ ] All fixes implemented
- [ ] All tests passing
- [ ] No console errors
- [ ] Blank document fully functional
- [ ] All tools support undo
- [ ] All tool outputs show diff preview
- [ ] No regression in loaded-file workflows
- [ ] Performance acceptable (<500ms per tool)
- [ ] Code reviewed
- [ ] Ready for production

---

## ROLLBACK PLAN

If issues found after deployment:

1. Revert to previous commit
2. Keep user data (never delete unsaved content)
3. Notify users of regression
4. Fix and re-deploy

---

## SUCCESS CRITERIA

After implementation:

✅ User can work with blank document from start  
✅ All tools support blank documents  
✅ All tool outputs wrapped in safety (runSafeTool)  
✅ No file writes except on Save  
✅ Editor is sole source of truth  
✅ All tools support undo  
✅ Diff preview for all tool outputs  
✅ Zero data loss scenarios  

---

## TIMELINE

| Phase | Duration | Status |
|-------|----------|--------|
| Phase 1 | 40 mins | 🔴 CRITICAL |
| Phase 2 | 1.5 hrs | 🟠 HIGH |
| Phase 3 | 1 hr | 🟡 MEDIUM |
| Testing | 1 hr | Essential |
| **Total** | **4-5 hrs** | **Ready** |

