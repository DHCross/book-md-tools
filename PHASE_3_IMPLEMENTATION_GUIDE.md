# 🎯 PHASE 3 IMPLEMENTATION GUIDE: Fix Comparison & Table Tools

**Objective:** Enable content-based comparison and table conversion tools  
**Estimated Duration:** 1 hour  
**Dependencies:** Phase 1 & Phase 2 must be complete  
**Starting Point:** Only 2 tool systems remain file-based

---

## Overview: What We're Fixing

These 2 tool systems still require file paths:

1. **Compare Documents** - Side-by-side comparison of markdown files
2. **Table Converters** - Convert between markdown tables and other formats

Current problem:
```javascript
// Current (FILE-BASED):
const doc1 = await readFile(path1);
const doc2 = await readFile(path2);
const diff = compare(path1, path2);  // ← Uses paths

// After Phase 3 (CONTENT-BASED):
const diff = compare(content1, content2);  // ← Uses strings
```

---

## TASK 3.1: Fix compareDocuments Function

### Current Location
**File:** `electron/src/renderer.js` lines ~1569-1620

### Current Implementation (FILE-BASED)
```javascript
// Shows file picker, loads two files, compares by path
document.getElementById('compareBtn')?.addEventListener('click', async () => {
  if (!currentFilePath) {
    log('Please load a file first', 'error');
    return;
  }
  
  // File picker for second document
  const filePath2 = await window.electronAPI.selectFile();
  if (!filePath2) return;
  
  // Compare files by path
  const result = await window.electronAPI.compareDocuments(currentFilePath, filePath2);
  
  // Display diff...
});
```

### Fixed Implementation (CONTENT-BASED)
```javascript
document.getElementById('compareBtn')?.addEventListener('click', async () => {
  // CHANGE: Accept either file or current editor content
  if (!currentContent && !currentFilePath) {
    log('No content to compare', 'error');
    return;
  }
  
  // Get content from current editor (or file if unsaved)
  const content1 = currentContent;
  
  // File picker for second document
  const filePath2 = await window.electronAPI.selectFile();
  if (!filePath2) return;
  
  // NEW: Read second file's content
  const content2 = await window.electronAPI.readFile(filePath2);
  if (!content2) {
    log('Failed to read comparison file', 'error');
    return;
  }
  
  // CHANGE: Compare content strings (not file paths)
  const result = await window.electronAPI.compareDocuments(content1, content2, {
    doc1Name: currentFileName || 'Current Document',
    doc2Name: filePath2.split('/').pop() || 'Selected File'
  });
  
  if (!result.success) {
    log(`Comparison failed: ${result.message}`, 'error');
    return;
  }
  
  // Display diff in comparison tab
  displayComparisonResult(result, {
    doc1: currentFileName || 'Current Document',
    doc2: filePath2.split('/').pop()
  });
});
```

### Update IPC Handler
**File:** `electron/main.js`

Current (file-path based):
```javascript
ipcMain.handle('compare-documents', async (event, path1, path2) => {
  try {
    const content1 = fs.readFileSync(path1, 'utf-8');
    const content2 = fs.readFileSync(path2, 'utf-8');
    
    // Compare logic
    const diff = computeDiff(content1, content2);
    
    return { success: true, diff: diff };
  } catch (err) {
    return { success: false, message: err.message };
  }
});
```

New (content-based):
```javascript
ipcMain.handle('compare-documents', async (event, content1, content2, options = {}) => {
  try {
    // Content passed directly - no file I/O needed
    
    // Compute line-by-line diff
    const lines1 = content1.split('\n');
    const lines2 = content2.split('\n');
    
    const diffs = computeLineDiff(lines1, lines2);
    
    // Create comparison result
    const result = {
      doc1Name: options.doc1Name || 'Document 1',
      doc2Name: options.doc2Name || 'Document 2',
      content1: content1,
      content2: content2,
      diffs: diffs,
      stats: {
        added: diffs.filter(d => d.type === 'add').length,
        removed: diffs.filter(d => d.type === 'remove').length,
        modified: diffs.filter(d => d.type === 'modify').length
      }
    };
    
    return { 
      success: true, 
      ...result
    };
  } catch (err) {
    return { success: false, message: err.message };
  }
});

// Helper function (add to main.js if not exists)
function computeLineDiff(lines1, lines2) {
  const diffs = [];
  const maxLines = Math.max(lines1.length, lines2.length);
  
  for (let i = 0; i < maxLines; i++) {
    const line1 = lines1[i] || '';
    const line2 = lines2[i] || '';
    
    if (line1 !== line2) {
      if (i >= lines1.length) {
        diffs.push({ type: 'add', line: i, content: line2 });
      } else if (i >= lines2.length) {
        diffs.push({ type: 'remove', line: i, content: line1 });
      } else {
        diffs.push({ type: 'modify', line: i, before: line1, after: line2 });
      }
    }
  }
  
  return diffs;
}
```

### Update Display Function
Update `displayComparisonResult()` in renderer.js to show file names:

```javascript
function displayComparisonResult(result, fileNames) {
  // Clear previous comparison
  comparisonTabContent.innerHTML = '';
  
  // Show comparison stats
  const statsDiv = document.createElement('div');
  statsDiv.className = 'comparison-stats';
  statsDiv.innerHTML = `
    <h3>Comparison: ${fileNames.doc1} ↔ ${fileNames.doc2}</h3>
    <p>Added: <span class="stat-added">${result.stats?.added || 0}</span> | 
       Removed: <span class="stat-removed">${result.stats?.removed || 0}</span> | 
       Modified: <span class="stat-modified">${result.stats?.modified || 0}</span></p>
  `;
  comparisonTabContent.appendChild(statsDiv);
  
  // Show diffs
  const diffDiv = document.createElement('div');
  diffDiv.className = 'comparison-diffs';
  
  result.diffs.forEach(diff => {
    const diffLine = document.createElement('div');
    diffLine.className = `diff-line diff-${diff.type}`;
    
    if (diff.type === 'add') {
      diffLine.innerHTML = `<span class="line-num">${diff.line}</span><span class="content">+ ${escapeHtml(diff.content)}</span>`;
    } else if (diff.type === 'remove') {
      diffLine.innerHTML = `<span class="line-num">${diff.line}</span><span class="content">- ${escapeHtml(diff.content)}</span>`;
    } else {
      diffLine.innerHTML = `
        <span class="line-num">${diff.line}</span>
        <div class="content">
          <div class="before">- ${escapeHtml(diff.before)}</div>
          <div class="after">+ ${escapeHtml(diff.after)}</div>
        </div>
      `;
    }
    
    diffDiv.appendChild(diffLine);
  });
  
  comparisonTabContent.appendChild(diffDiv);
  
  // Switch to comparison tab
  switchTab('comparison');
}
```

### Testing compareDocuments
- [ ] Open file → Compare with another file → Works
- [ ] Open file with unsaved edits → Compare shows unsaved version
- [ ] Blank document → Compare → Works
- [ ] Comparison stats accurate
- [ ] Added/removed lines highlighted correctly

---

## TASK 3.2: Fix Table Converter Tools

### Tool 1: convertMdTableToTsv

**Current Location:** `electron/src/renderer.js` line ~1864

**Current Implementation (FILE-BASED):**
```javascript
document.getElementById('convertMdTableToTsvBtn')?.addEventListener('click', async () => {
  if (!currentFilePath) {
    log('Please load a file first', 'error');
    return;
  }
  
  const result = await window.electronAPI.convertMdTableToTsv(currentFilePath);
  
  if (result.success) {
    log('Conversion complete', 'success');
    const outputPath = result.output;
    // Open file explorer showing output file
  }
});
```

**Fixed Implementation (CONTENT-BASED):**
```javascript
document.getElementById('convertMdTableToTsvBtn')?.addEventListener('click', async () => {
  // CHANGE: Accept blank documents
  if (!currentContent) {
    log('No content to convert', 'error');
    return;
  }
  
  await runSafeTool('Convert Markdown Table to TSV', async (content) => {
    const result = await window.electronAPI.convertMdTableToTsv(content);
    
    if (!result.success) {
      throw new Error(result.message);
    }
    
    // For table converters, typically show result in output tab
    // instead of replacing editor content
    displayToolOutput('TSV Output', result.content);
    
    addChangeLogEntry('Convert MD Table to TSV', 'Converted markdown tables to TSV format');
    
    return content; // Return unchanged (output shown separately)
  });
});
```

### Tool 2: convertNamesToColumns

**Current Location:** `electron/src/renderer.js` line ~1878

**Current Implementation (FILE-BASED):**
```javascript
document.getElementById('convertNamesToColumnsBtn')?.addEventListener('click', async () => {
  if (!currentFilePath) {
    log('Please load a file first', 'error');
    return;
  }
  
  const result = await window.electronAPI.convertNamesToColumns(currentFilePath);
  
  if (result.success) {
    log('Conversion complete', 'success');
    // Similar to above - file-based output
  }
});
```

**Fixed Implementation (CONTENT-BASED):**
```javascript
document.getElementById('convertNamesToColumnsBtn')?.addEventListener('click', async () => {
  // CHANGE: Accept blank documents
  if (!currentContent) {
    log('No content to convert', 'error');
    return;
  }
  
  await runSafeTool('Convert Names to Tab-Delimited Columns', async (content) => {
    const result = await window.electronAPI.convertNamesToColumns(content);
    
    if (!result.success) {
      throw new Error(result.message);
    }
    
    // Show result in output area
    displayToolOutput('Columns Output', result.content);
    
    addChangeLogEntry('Convert Names to Columns', 'Converted names to tab-delimited columns');
    
    return content; // Return unchanged
  });
});
```

### Update IPC Handlers

**File:** `electron/main.js` (search for current table converter handlers)

Pattern for each converter:
```javascript
ipcMain.handle('convert-md-table-to-tsv', async (event, content) => {
  let tempInputPath, tempOutputPath;
  try {
    const tempId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    tempInputPath = path.join(REPO_ROOT, `.tmp-mdtable-input-${tempId}.md`);
    tempOutputPath = path.join(REPO_ROOT, `.tmp-mdtable-output-${tempId}.tsv`);
    
    fs.writeFileSync(tempInputPath, content, 'utf-8');
    
    // Run conversion Python script
    const result = await runPythonScript(
      path.join(TOOLS_DIR, 'convert_md_to_tsv.py'),
      [tempInputPath, tempOutputPath]
    );
    
    if (result.error) {
      return { success: false, message: result.error };
    }
    
    const outputContent = fs.readFileSync(tempOutputPath, 'utf-8');
    
    return { 
      success: true, 
      content: outputContent  // Return converted content
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

### Add displayToolOutput Function

If not already exists, add to renderer.js:

```javascript
function displayToolOutput(title, content) {
  // Show output in a modal or output pane
  const outputModal = document.createElement('div');
  outputModal.className = 'tool-output-modal';
  outputModal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3>${title}</h3>
        <button class="close-btn" onclick="this.closest('.tool-output-modal').remove()">×</button>
      </div>
      <div class="modal-body">
        <pre>${escapeHtml(content)}</pre>
      </div>
      <div class="modal-footer">
        <button onclick="copyToClipboard(this.closest('.tool-output-modal').querySelector('pre').textContent)">
          Copy to Clipboard
        </button>
        <button onclick="this.closest('.tool-output-modal').remove()">Close</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(outputModal);
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    log('Copied to clipboard', 'success');
  });
}
```

### Testing Table Converters
- [ ] Load file with tables → Convert to TSV → Works
- [ ] Blank doc → Convert to TSV → Works
- [ ] Convert Names → Convert to Columns → Works
- [ ] Output shown correctly
- [ ] Copy to clipboard works

---

## PHASE 3 CHECKLIST

- [ ] compareDocuments accepts blank documents
- [ ] compareDocuments IPC handler content-based
- [ ] compareDocuments display updated (shows file names)
- [ ] convertMdTableToTsv content-based
- [ ] convertNamesToColumns content-based
- [ ] All table converter IPC handlers updated
- [ ] displayToolOutput function working
- [ ] Undo works for all tools (if modifying editor)
- [ ] No regressions from Phase 1 & 2
- [ ] All file-based blocking removed

---

## FINAL ARCHITECTURE VERIFICATION

After Phase 3, verify complete architecture:

```javascript
// ✅ CORRECT ARCHITECTURE:
1. Editor loads content → currentContent = content
2. User edits → currentContent updated in real-time
3. User clicks tool → runSafeTool() called
4. Tool runs on currentContent in-memory
5. Tool shows diff preview
6. User accepts → applyToolOutput() updates editor
7. User saves → content written to disk ONLY
8. Undo restores from undoStack (never disk)

// ❌ OLD ARCHITECTURE (should be gone):
1. User clicks tool
2. Content read from disk
3. Tool runs on file
4. Output file created
5. Output read from disk back into editor
```

---

## SUCCESS CRITERIA

✅ All 2 comparison/table tools accept blank documents  
✅ All IPC handlers content-based (not file-based)  
✅ Compare shows unsaved editor changes  
✅ Table converters work with blank documents  
✅ All temp files properly cleaned  
✅ Zero file writes except on user Save  
✅ Complete source-of-truth architecture  
✅ All 9 tools fully functional with blank docs  

---

## TESTING ALL PHASES TOGETHER

After Phase 3, run comprehensive end-to-end test:

```
BLANK DOCUMENT WORKFLOW:
1. Open TRPG MD Workbench (no file)
2. Type markdown content
3. Run Format Text → Accept
4. Run Fix TOC → Accept
5. Run Inject Tags → Accept
6. Run Strip Tags → Accept
7. Run Header Depth → Accept
8. Run Long Line Detector → Accept
9. Compare with another file → Works
10. Convert Tables to TSV → Works
11. Undo all 10 operations → Back to original
12. Close without save → "Discard unsaved changes?"
13. Re-open app → No content persisted (correct)
```

All steps should work without any file ever being saved or read from disk except on explicit Save action.

---

## FINAL CHECKLIST BEFORE PRODUCTION

- [ ] All 3 phases complete and tested
- [ ] No console errors
- [ ] No file-based operations outside IPC handlers
- [ ] All temp files cleaned up
- [ ] Undo works for all tools
- [ ] Diff preview for all tools
- [ ] Blank documents fully supported
- [ ] File-based workflows still work (regression tested)
- [ ] Git history clean (3 commits: Phase 1, 2, 3)
- [ ] Code reviewed
- [ ] Ready for production deployment

---

## SUMMARY OF ALL CHANGES

| System | Before | After |
|--------|--------|-------|
| formatText | File-based, no safety | Content-based, runSafeTool wrapped |
| fixTOC | File-based, file required | Content-based, blank docs supported |
| injectTags | File-based, file required | Content-based, blank docs supported |
| stripTags | File-based, file required | Content-based, blank docs supported |
| Quick Tools (6x) | File-based, file required | Content-based, blank docs supported |
| Pipeline | File-based, file required | Content-based, blank docs supported |
| Compare Docs | Path-based | Content-based |
| Table Converters | File-based | Content-based |
| **Result** | **Disk-centric** | **Editor-centric (source of truth)** |

---

**Congratulations! After Phase 3, TRPG MD Workbench is production-ready.**

