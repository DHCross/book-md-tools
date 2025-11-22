# 🎯 PHASE 2 IMPLEMENTATION GUIDE: Enable Blank Document Support

**Objective:** Remove file path requirements from all tools  
**Estimated Duration:** 1.5-2 hours  
**Dependencies:** Phase 1 must be complete first  
**Starting Point:** All basic tools now accept content; remaining tools still file-based

---

## Overview: What We're Fixing

Current problem:
```javascript
// Current (BLOCKS BLANK DOCS):
if (!currentFilePath) {
  log('Please select an input file first', 'error');
  return;
}

// After Phase 2 (ALLOWS BLANK DOCS):
if (!currentContent) {
  log('No content to process', 'error');
  return;
}
```

This unlocks:
- ✅ Blank document workflows
- ✅ Content-only operations
- ✅ Better error messages
- ✅ Consistent behavior across all tools

---

## TASK 2.1: Fix fixTOC Handler

### Current Location & Pattern
**File:** `electron/src/renderer.js` line 977 (NOT wrapped in runSafeTool!)

### Issue
```javascript
// Current - blocking blank docs:
document.getElementById('fixTOCBtn')?.addEventListener('click', async () => {
  if (!currentFilePath) {
    log('Please select an input file first', 'error');
    return;
  }
  // ... rest of handler
});
```

### Fix

**Step 1: Update renderer.js (line 977)**
```javascript
document.getElementById('fixTOCBtn')?.addEventListener('click', async () => {
  // CHANGE: Support blank documents
  if (!currentContent) {
    log('No content to process', 'error');
    return;
  }
  
  // CHANGE: Wrap in safety wrapper (if not already done)
  await runSafeTool('Fix Table of Contents', async (content) => {
    const result = await window.electronAPI.fixTOC(content);
    
    if (!result.success) {
      throw new Error(result.message);
    }
    
    addChangeLogEntry('Fix TOC', 'Generated/verified table of contents');
    return result.content;
  });
});
```

**Step 2: Update main.js IPC handler (line 327-340)**

Current (file-based):
```javascript
ipcMain.handle('fix-toc', async (event, inputPath) => {
  try {
    const outputPath = inputPath.replace(/\.md$/, '-toc-fixed.md');
    
    const result = await runPythonScript(
      path.join(SCRIPTS_DIR, 'fix_toc.py'),
      [inputPath, outputPath]
    );
    
    if (result.error) {
      return { success: false, message: result.error };
    }
    
    const outputContent = fs.readFileSync(outputPath, 'utf-8');
    return { success: true, output: outputPath };
  } catch (err) {
    return { success: false, message: err.message };
  }
});
```

New (content-based):
```javascript
ipcMain.handle('fix-toc', async (event, content) => {
  let tempInputPath, tempOutputPath;
  try {
    const tempId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    tempInputPath = path.join(REPO_ROOT, `.tmp-toc-input-${tempId}.md`);
    tempOutputPath = path.join(REPO_ROOT, `.tmp-toc-output-${tempId}.md`);
    
    fs.writeFileSync(tempInputPath, content, 'utf-8');
    
    const result = await runPythonScript(
      path.join(SCRIPTS_DIR, 'fix_toc.py'),
      [tempInputPath, tempOutputPath]
    );
    
    if (result.error) {
      return { success: false, message: result.error };
    }
    
    const transformedContent = fs.readFileSync(tempOutputPath, 'utf-8');
    
    return { 
      success: true, 
      content: transformedContent
    };
  } catch (err) {
    return { success: false, message: err.message };
  } finally {
    try {
      if (tempInputPath && fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath);
      if (tempOutputPath && fs.existsSync(tempOutputPath)) fs.unlinkSync(tempOutputPath);
    } catch (e) {
      console.error('Cleanup error:', e);
    }
  }
});
```

**Test:**
- [ ] Load file → Fix TOC → Works
- [ ] Blank doc → Fix TOC → Works
- [ ] Undo after fix → Original restored

---

## TASK 2.2: Fix injectTags Handler

### Locations
- **Renderer:** Line ~1014 in renderer.js
- **Main:** Lines 342-365 in main.js

### Pattern (Same as fixTOC)
1. Change `if (!currentFilePath)` → `if (!currentContent)`
2. Wrap in `runSafeTool()`
3. Update IPC handler to content-based
4. Clean up temp files in finally block

### Testing
- [ ] Load file → Inject Tags → Works
- [ ] Blank doc → Inject Tags → Works

---

## TASK 2.3: Fix stripTags Handler

### Locations
- **Renderer:** Line ~1047 in renderer.js
- **Main:** Lines 367-390 in main.js

### Pattern (Same as fixTOC)
1. Change condition check
2. Wrap in runSafeTool()
3. Update IPC handler
4. Clean up temp files

### Testing
- [ ] Load file → Strip Tags → Works
- [ ] Blank doc → Strip Tags → Works

---

## TASK 2.4: Fix buildHeadersBtn

### Location
**File:** `electron/src/renderer.js` line ~1225

### Current (Blocking blank docs)
```javascript
document.getElementById('buildHeadersBtn')?.addEventListener('click', async () => {
  if (!currentFilePath) {
    log('Please load a file first', 'error');
    return;
  }
  // ... builds headers using currentFilePath
});
```

### Issue
This tool doesn't use external Python script, but still requires file path to build headers.

### Fix
```javascript
document.getElementById('buildHeadersBtn')?.addEventListener('click', async () => {
  // CHANGE: Support blank documents
  if (!currentContent) {
    log('No content to build headers from', 'error');
    return;
  }
  
  await runSafeTool('Build Headers', async (content) => {
    // Generate headers from markdown content
    const headers = extractHeadersFromContent(content);
    
    if (headers.length === 0) {
      throw new Error('No headers found in document');
    }
    
    // Format as markdown header list
    const headerContent = headers
      .map(h => `${'  '.repeat(h.level - 1)}- [${h.text}](#${slugify(h.text)})`)
      .join('\n');
    
    addChangeLogEntry('Build Headers', `Generated ${headers.length} header links`);
    
    return headerContent;
  });
});
```

### Testing
- [ ] Blank doc with headers → Build Headers → Works
- [ ] Generated headers insertable

---

## TASK 2.5: Fix runQuickTool Handler

### Location
**File:** `electron/src/renderer.js` lines ~1365-1425

### Problem
```javascript
// Current - blocks ALL 6 quick tools on blank docs:
async function runQuickTool(toolName, toolScript) {
  if (!currentFilePath) {
    log('Please load a file first', 'error');
    return;
  }
  // ...
}
```

### Fix
```javascript
async function runQuickTool(toolName, toolScript) {
  // CHANGE: Support blank documents
  if (!currentContent) {
    log('No content to process', 'error');
    return;
  }
  
  // Determine tool nicename for UI
  const toolNiceName = {
    'header-depth': 'Correct Header Depth',
    'long-line': 'Detect Long Lines',
    'paragraph-break': 'Detect Paragraph Breaks',
    // ... etc
  }[toolScript] || toolName;
  
  await runSafeTool(toolNiceName, async (content) => {
    const result = await window.electronAPI.runQuickTool(toolScript, content);
    
    if (!result.success) {
      throw new Error(result.message);
    }
    
    // Some tools return report-only (like long-line detector)
    // Only update editor if content was transformed
    if (result.content && result.content !== content) {
      addChangeLogEntry(toolNiceName, result.message || 'Applied tool');
      return result.content;
    } else {
      // For report-only tools, show result in log instead
      log(result.message || 'Tool completed', 'info');
      return content; // Return unchanged
    }
  });
}
```

### Update IPC Handler (main.js lines 392-465)
Current pattern:
```javascript
ipcMain.handle('run-quick-tool', async (event, toolName, inputPath) => {
  const outputPath = inputPath.replace(/\.md$/, `.${toolName}-output.md`);
  // ... read file, run tool, write output, return path
});
```

New pattern:
```javascript
ipcMain.handle('run-quick-tool', async (event, toolName, content) => {
  let tempInputPath, tempOutputPath;
  try {
    const tempId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    tempInputPath = path.join(REPO_ROOT, `.tmp-${toolName}-input-${tempId}.md`);
    tempOutputPath = path.join(REPO_ROOT, `.tmp-${toolName}-output-${tempId}.txt`);
    
    fs.writeFileSync(tempInputPath, content, 'utf-8');
    
    const result = await runPythonScript(
      path.join(TOOLS_DIR, `${toolName}.py`),
      [tempInputPath, '--report', tempOutputPath]
    );
    
    if (result.error) {
      return { success: false, message: result.error };
    }
    
    // Read report/output
    const output = fs.readFileSync(tempOutputPath, 'utf-8');
    
    return { 
      success: true, 
      content: output,  // Return report content
      message: `${toolName} completed`
    };
  } catch (err) {
    return { success: false, message: err.message };
  } finally {
    // Cleanup
    try {
      if (tempInputPath && fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath);
      if (tempOutputPath && fs.existsSync(tempOutputPath)) fs.unlinkSync(tempOutputPath);
    } catch (e) {
      console.error('Cleanup error:', e);
    }
  }
});
```

### Testing
- [ ] Blank doc → Long Line Detector → Works
- [ ] Blank doc → Header Depth → Works
- [ ] Blank doc → Paragraph Breaks → Works
- [ ] All 6 quick tools functional

---

## TASK 2.6: Fix runPipeline Handler

### Location
**File:** `electron/main.js` lines 280-310

### Current (File-based)
```javascript
ipcMain.handle('run-pipeline', async (event, inputPath, options) => {
  const outputPath = inputPath.replace(/\.md$/, '_progress_pipeline.md');
  // ... runs Python pipeline on file
});
```

### New (Content-based)
```javascript
ipcMain.handle('run-pipeline', async (event, content, options) => {
  let tempInputPath, tempOutputPath;
  try {
    const tempId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    tempInputPath = path.join(REPO_ROOT, `.tmp-pipeline-input-${tempId}.md`);
    tempOutputPath = path.join(REPO_ROOT, `.tmp-pipeline-output-${tempId}.md`);
    
    fs.writeFileSync(tempInputPath, content, 'utf-8');
    
    // Build pipeline arguments
    const pipelineArgs = [tempInputPath, '--out-suffix', '.tmp-pipeline-output'];
    if (options?.tablesInline) pipelineArgs.push('--tables-inline');
    
    const result = await runPythonScript(
      path.join(SCRIPTS_DIR, 'book_pipeline.py'),
      pipelineArgs
    );
    
    if (result.error) {
      return { success: false, message: result.error };
    }
    
    const transformedContent = fs.readFileSync(tempOutputPath, 'utf-8');
    
    return { 
      success: true, 
      content: transformedContent
    };
  } catch (err) {
    return { success: false, message: err.message };
  } finally {
    try {
      if (tempInputPath && fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath);
      if (tempOutputPath && fs.existsSync(tempOutputPath)) fs.unlinkSync(tempOutputPath);
    } catch (e) {
      console.error('Cleanup error:', e);
    }
  }
});
```

### Update Renderer Call
Find pipeline call in renderer.js and update to content-based:
```javascript
const result = await window.electronAPI.runPipeline(content, { tablesInline: true });
```

### Testing
- [ ] Blank doc → Run Pipeline → Works
- [ ] File with tables → Pipeline → Works

---

## PHASE 2 CHECKLIST

- [ ] fixTOCBtn accepts blank documents
- [ ] injectTagsBtn accepts blank documents
- [ ] stripTagsBtn accepts blank documents
- [ ] buildHeadersBtn accepts blank documents
- [ ] All 6 quick tools accept blank documents
- [ ] runPipeline accepts blank documents
- [ ] All IPC handlers content-based (not file-based)
- [ ] All temp files cleaned up
- [ ] Undo works for all tools
- [ ] Diff preview shown for all tools
- [ ] No errors in console
- [ ] No regression in file-based workflows

---

## Testing Strategy

### Test Every Tool with Blank Document

For each tool:
1. Close any open files (blank doc)
2. Type sample markdown in editor
3. Click tool button
4. Verify:
   - [ ] No "Please load a file" error
   - [ ] Diff preview appears
   - [ ] Changes apply correctly
   - [ ] Unsaved indicator appears
   - [ ] Undo restores original

### Integration Test

```
1. Open blank document
2. Type markdown content
3. Run Format Text → Accept
4. Run Fix TOC → Accept
5. Run Inject Tags → Accept
6. Run Pipeline → Accept
7. Run Header Depth → Accept
8. Undo 5x → Verify original restored
9. No file saved to disk (verify with file explorer)
```

---

## SUCCESS CRITERIA

✅ All 7 tools accept blank documents  
✅ No file-based blocking checks  
✅ All IPC handlers content-based  
✅ All temp files properly cleaned  
✅ Undo works for all tools  
✅ Diff preview for all tools  
✅ Zero regressions in file workflows  
✅ Editor is sole source of truth  

---

## TROUBLESHOOTING

### Issue: "Tool blocked with 'Please load a file' error"
- [ ] Check if `if (!currentContent)` condition is still in code
- [ ] Verify currentContent is being updated in real-time
- [ ] Test with actual typing (not just pasted text)

### Issue: "IPC handler returns path instead of content"
- [ ] Check if returning `{ success: true, output: path }`
- [ ] Should return `{ success: true, content: text }`
- [ ] Verify fs.readFileSync(output) is reading result

### Issue: "Temp files not being cleaned up"
- [ ] Check finally block is executing
- [ ] Verify fs.unlinkSync() called for both input and output
- [ ] Check for errors in cleanup (may be silenced)

### Issue: "Blank document unchanged after tool"
- [ ] Check if tool handler is throwing error
- [ ] Verify content parameter is passing through
- [ ] Check temp input file has content

---

## NEXT PHASE

After Phase 2 completes successfully:

👉 **Phase 3:** Fix Comparison and Table Tools

This will complete blank document support for remaining features.

---

## CHECKLIST FOR PHASE 2 COMPLETION

Before moving to Phase 3:

- [ ] All 7 tools tested with blank documents
- [ ] No file-based checks remaining
- [ ] All IPC handlers return content (not paths)
- [ ] All temp files cleaned up properly
- [ ] Git commit made with message "Phase 2: Enable blank document support"
- [ ] No console errors observed
- [ ] No regression from Phase 1

