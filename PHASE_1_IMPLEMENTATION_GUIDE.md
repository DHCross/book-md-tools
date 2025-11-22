# 🎯 PHASE 1 IMPLEMENTATION GUIDE: Block Dangerous Operations

**Objective:** Make formatTextBtn safe and enable content-based tool architecture  
**Estimated Duration:** 40 minutes  
**Risk Level:** HIGH → After this phase: LOW  
**Starting Point:** Current code violates safety (formatTextBtn has no runSafeTool wrapper)

---

## TASK 1.1: Examine Current Unsafe Code

### Location
**File:** `electron/src/renderer.js`  
**Lines:** 949-970

### What to Look For
- `addEventListener('click', async () => { ... })`
- Direct `window.electronAPI.formatText()` call
- No `runSafeTool()` wrapper
- No safety checks before tool runs
- Saves directly to disk without user confirmation

### What This Means
```
User clicks Format Button
            ↓
❌ NO safety check
            ↓
❌ NO diff preview
            ↓
❌ NO undo tracking
            ↓
Directly overwrites file
            ↓
User loses unsaved edits if tool fails
```

---

## TASK 1.2: Examine Safe Pattern (Reference)

### Location
**File:** `electron/src/renderer.js`  
**Lines:** 975-1010 (fixTOCBtn - this is the GOOD pattern)

### What to Look For
- `runSafeTool('Tool Name', async (content) => { ... })`
- Takes content as parameter
- Calls IPC handler with content
- Returns transformed content
- No direct disk writes
- Automatically wrapped in safety system

### What This Means
```
User clicks Fix TOC Button
            ↓
✅ runSafeTool wrapper
            ↓
✅ Diff preview shown
            ↓
✅ Undo tracking active
            ↓
User accepts/rejects changes
            ↓
Editor updated safely
            ↓
User sees unsaved indicator
```

**Study the fixTOCBtn code carefully - you'll copy this pattern!**

---

## TASK 1.3: Apply Safety Wrapper to formatTextBtn

### Step 1: Read the old formatTextBtn code
Review lines 949-970 to understand exact current implementation

### Step 2: Read the safe fixTOCBtn code
Review lines 975-1010 to see how runSafeTool is used correctly

### Step 3: Replace formatTextBtn code

**BEFORE (lines 949-970):**
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

**AFTER (same lines should become):**
```javascript
document.getElementById('formatTextBtn')?.addEventListener('click', async () => {
  // Support blank documents - allow formatting with just content
  if (!currentContent && !currentFilePath) {
    log('No content to format', 'error');
    return;
  }
  
  const outputSuffix = document.getElementById('outputSuffix')?.value || config.defaultOutputSuffix;
  
  // Use safety wrapper like fixTOCBtn
  await runSafeTool('Format Text', async (content) => {
    log('Formatting text...', 'info');
    
    // Pass content directly to IPC handler (not file path)
    const result = await window.electronAPI.formatText(content, outputSuffix);
    
    if (!result.success) {
      throw new Error(result.message);
    }
    
    // Record action in changelog
    addChangeLogEntry('Format Text', `Applied formatting with suffix: ${outputSuffix}`);
    
    // Return transformed content (runSafeTool handles the rest)
    return result.content;
  });
});
```

**Key Changes:**
1. ✅ Removed direct file path check - allows blank docs
2. ✅ Wrapped in `runSafeTool()` - enables safety system
3. ✅ Pass `content` to IPC handler instead of path
4. ✅ Throw errors (runSafeTool catches them)
5. ✅ Return transformed content (runSafeTool applies to editor)

---

## TASK 1.4: Update IPC Handler - formatText

### Location
**File:** `electron/main.js`  
**Lines:** 312-325

### Current Handler (FILE-BASED)
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

### New Handler (CONTENT-BASED)
```javascript
ipcMain.handle('format-text', async (event, content, outputSuffix) => {
  let tempInputPath, tempOutputPath;
  try {
    // Create unique temp file names (using timestamp + random)
    const tempId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    tempInputPath = path.join(REPO_ROOT, `.tmp-format-input-${tempId}.md`);
    tempOutputPath = path.join(REPO_ROOT, `.tmp-format-output-${tempId}.md`);
    
    // Write content to temp input file
    fs.writeFileSync(tempInputPath, content, 'utf-8');
    
    // Run Python tool
    const result = await runPythonScript(
      path.join(TOOLS_DIR, 'format_text.py'),
      [tempInputPath, tempOutputPath]
    );
    
    if (result.error) {
      return { success: false, message: result.error };
    }
    
    // Read transformed content from output file
    const transformedContent = fs.readFileSync(tempOutputPath, 'utf-8');
    
    // Return CONTENT (not path!)
    return { 
      success: true, 
      content: transformedContent  // ← KEY CHANGE: Return content, not path
    };
    
  } catch (err) {
    return { success: false, message: err.message };
  } finally {
    // Always clean up temp files
    try {
      if (tempInputPath && fs.existsSync(tempInputPath)) {
        fs.unlinkSync(tempInputPath);
      }
      if (tempOutputPath && fs.existsSync(tempOutputPath)) {
        fs.unlinkSync(tempOutputPath);
      }
    } catch (cleanupErr) {
      console.error('Temp file cleanup error:', cleanupErr);
    }
  }
});
```

**Key Changes:**
1. ✅ Accept `content` parameter instead of `inputPath`
2. ✅ Create temp files internally (not visible to renderer)
3. ✅ Use unique names to prevent collisions
4. ✅ Write content to temp input file
5. ✅ Run Python tool on temp files
6. ✅ Read transformed content from temp output file
7. ✅ Return `content` in response (not path)
8. ✅ Clean up temp files in finally block
9. ✅ Handle cleanup errors gracefully

---

## TASK 1.5: Test Phase 1.1-1.2 Changes

### Pre-Testing Checklist
- [ ] Saved all changes to renderer.js
- [ ] Saved all changes to main.js
- [ ] Restarted Electron app (if running)

### Test Case 1: Load File → Format Text

**Steps:**
1. Open TRPG MD Workbench
2. Load any markdown file
3. Click "Format Text" button
4. Verify diff preview appears
5. Click "Accept" to apply changes
6. Verify content updated in editor
7. Verify "unsaved" indicator appears

**Expected Result:** ✅ Diff preview shown before applying changes

**If Failed:** 
- Check browser console for errors
- Check main.js console output
- Verify temp files created/deleted

---

### Test Case 2: Blank Document → Format Text

**Steps:**
1. Open TRPG MD Workbench
2. Do NOT load a file (keep blank)
3. Type some markdown content in editor
4. Click "Format Text" button
5. Verify diff preview appears (even though no file loaded)
6. Accept changes

**Expected Result:** ✅ Format works without loaded file

**If Failed:** 
- Check if blank doc check is working
- Verify `if (!currentContent && !currentFilePath)` condition

---

### Test Case 3: Format → Decline

**Steps:**
1. Load file with content
2. Click "Format Text"
3. Diff preview appears
4. Click "Cancel"
5. Verify content unchanged
6. Verify no "unsaved" indicator

**Expected Result:** ✅ Canceling changes doesn't apply modification

**If Failed:**
- runSafeTool may not be handling cancellation
- Check if applyToolOutput is still being called

---

### Test Case 4: Format → Undo

**Steps:**
1. Load file
2. Format Text → Accept changes
3. Press Ctrl+Z to undo
4. Verify original content restored

**Expected Result:** ✅ Undo restores pre-format content

**If Failed:**
- Undo stack may not be tracking tool operations
- Verify undoStack is being populated in applyToolOutput

---

## TASK 1.6: Repeat Pattern for Other Tools

Once formatText is working, apply the SAME pattern to:

1. **fixTOC** (lines 327-340 in main.js)
2. **injectTags** (lines 342-365 in main.js)
3. **stripTags** (lines 367-390 in main.js)

**Steps for each tool:**
1. Update renderer.js handler (change to runSafeTool pattern)
2. Update main.js IPC handler (change to content-based)
3. Test with blank document
4. Test undo
5. Test diff preview

---

## TASK 1.7: Verify No Regressions

### Regression Tests
- [ ] Load existing file → works as before
- [ ] Save file → still works
- [ ] All buttons still visible/clickable
- [ ] Keyboard shortcuts (Ctrl+S, etc.) still work
- [ ] Stat block navigator still updates
- [ ] Tab switching still works
- [ ] Console has no errors

### Performance Check
- [ ] Format text completes in <500ms
- [ ] No memory leaks (check task manager)
- [ ] Rapid tool clicks don't stack operations

---

## PHASE 1 SUCCESS CRITERIA

✅ formatTextBtn wrapped in runSafeTool  
✅ formatText IPC handler accepts content  
✅ formatText IPC handler returns content  
✅ Diff preview shown before changes applied  
✅ Works with blank documents  
✅ Undo restores original content  
✅ No file-based operations in formatter  
✅ fixTOC, injectTags, stripTags also updated  

---

## TROUBLESHOOTING

### Issue: "ReferenceError: runSafeTool is not defined"
- [ ] Verify runSafeTool function exists in renderer.js
- [ ] Check if it's defined before the event listener (line <950)

### Issue: "content is not returned from IPC handler"
- [ ] Check IPC response includes `content` field
- [ ] Verify `result.content` not `result.output`
- [ ] Check temp file is being read correctly

### Issue: "Diff preview never shows"
- [ ] Verify runSafeTool is calling showDiffPreview
- [ ] Check if tool is throwing error
- [ ] Verify formatText handler not throwing

### Issue: "Blank documents still blocked"
- [ ] Check condition: `if (!currentContent && !currentFilePath)`
- [ ] Verify currentContent is being updated in real-time
- [ ] Test by typing in blank editor before format

---

## NEXT PHASE

After Phase 1 completes successfully:

👉 **Phase 2:** Remove currentFilePath requirements from ALL remaining tools

This will enable blank document support across entire application.

---

## CHECKPOINTS

Save progress as you complete each section:

- [ ] **Checkpoint A:** formatTextBtn updated to runSafeTool (renderer.js 949-970)
- [ ] **Checkpoint B:** formatText IPC handler converted to content-based (main.js 312-325)
- [ ] **Checkpoint C:** All basic tests passing (load file, format, undo)
- [ ] **Checkpoint D:** Blank document format working
- [ ] **Checkpoint E:** fixTOC, injectTags, stripTags also updated
- [ ] **Checkpoint F:** All Phase 1 tests passing

Each checkpoint should be committed to git before moving to next phase.

---

**Continue to Phase 2 only after all Phase 1 checkpoints complete.**

