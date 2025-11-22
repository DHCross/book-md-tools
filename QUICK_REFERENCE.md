# ⚡ QUICK REFERENCE CARD

**For implementation during active coding**

---

## 🔴 PHASE 1: formatTextBtn → runSafeTool (40 min)

### What to Change

**Location 1:** `electron/src/renderer.js` line ~950
```diff
- document.getElementById('formatTextBtn')?.addEventListener('click', async () => {
-   if (!currentFilePath) { log('Please select file'); return; }
-   const result = await window.electronAPI.formatText(currentFilePath, outputSuffix);
+ document.getElementById('formatTextBtn')?.addEventListener('click', async () => {
+   if (!currentContent && !currentFilePath) { log('No content'); return; }
+   await runSafeTool('Format Text', async (content) => {
+     const result = await window.electronAPI.formatText(content, outputSuffix);
+     if (!result.success) throw new Error(result.message);
+     return result.content;
+   });
```

**Location 2:** `electron/main.js` line ~312
```diff
- ipcMain.handle('format-text', async (event, inputPath, outputSuffix) => {
+ ipcMain.handle('format-text', async (event, content, outputSuffix) => {
-   const content = fs.readFileSync(inputPath, 'utf-8');
-   // ... run tool ...
+   // Create temp files
+   const tempInputPath = `.tmp-format-${Date.now()}.md`;
+   fs.writeFileSync(tempInputPath, content, 'utf-8');
+   // ... run tool on temp file ...
+   const result = fs.readFileSync(tempOutputPath, 'utf-8');
-   return { success: true, output: outputPath };
+   return { success: true, content: result };
```

### Test It
- Load file → Format Text → Should show diff preview
- Blank doc → Format Text → Should work (no "please load file" error)
- Undo after → Should restore original

---

## 🟠 PHASE 2: Remove File Checks (1.5 hrs)

### Pattern for All 6 Tools

1. **Find:** `if (!currentFilePath) { ... return; }`
2. **Replace with:** `if (!currentContent) { ... return; }`
3. **Wrap in:** `await runSafeTool('Tool Name', async (content) => { ... })`
4. **Update IPC:** Accept content instead of path

### Tools to Fix
- [ ] fixTOCBtn (renderer.js ~977)
- [ ] injectTagsBtn (renderer.js ~1014)
- [ ] stripTagsBtn (renderer.js ~1047)
- [ ] buildHeadersBtn (renderer.js ~1225)
- [ ] runQuickTool (renderer.js ~1365)
- [ ] runPipeline (main.js ~280)

### Quick Template

**In renderer.js:**
```javascript
await runSafeTool('Tool Display Name', async (content) => {
  const result = await window.electronAPI.toolName(content, ...args);
  if (!result.success) throw new Error(result.message);
  return result.content;
});
```

**In main.js:**
```javascript
ipcMain.handle('tool-name', async (event, content, ...args) => {
  const tempId = `${Date.now()}-${Math.random().toString(36).substr(2,9)}`;
  const tempIn = `.tmp-tool-${tempId}.md`;
  const tempOut = `.tmp-tool-${tempId}.out`;
  
  try {
    fs.writeFileSync(tempIn, content, 'utf-8');
    // ... run tool on temp files ...
    const output = fs.readFileSync(tempOut, 'utf-8');
    return { success: true, content: output };
  } finally {
    try { fs.unlinkSync(tempIn); } catch (e) {}
    try { fs.unlinkSync(tempOut); } catch (e) {}
  }
});
```

---

## 🟡 PHASE 3: Compare & Tables (1 hr)

### compareDocuments Fix

**Location:** `electron/src/renderer.js` line ~1569

```javascript
// OLD (paths):
const result = await window.electronAPI.compareDocuments(currentFilePath, filePath2);

// NEW (content):
const content1 = currentContent;
const content2 = await window.electronAPI.readFile(filePath2);
const result = await window.electronAPI.compareDocuments(content1, content2, {
  doc1Name: currentFileName || 'Current',
  doc2Name: filePath2.split('/').pop()
});
```

### Table Converter Fix

**Location:** `electron/src/renderer.js` line ~1864

```javascript
// OLD (file-based):
const result = await window.electronAPI.convertMdTableToTsv(currentFilePath);

// NEW (content-based):
await runSafeTool('Convert Tables to TSV', async (content) => {
  const result = await window.electronAPI.convertMdTableToTsv(content);
  if (!result.success) throw new Error(result.message);
  displayToolOutput('TSV Output', result.content);
  return content; // Return unchanged
});
```

---

## 🧪 Validation Commands

```bash
# Check for remaining file-blocking checks
grep -n "if (!currentFilePath)" electron/src/renderer.js

# Verify all IPC handlers accept content (not paths)
grep -A2 "ipcMain.handle" electron/main.js | grep -E "event, (content|inputPath)"

# Check temp files cleaned up
grep -B5 "finally {" electron/main.js | grep "unlinkSync"

# Test in Electron console
console.log(currentContent);     // Should have content
console.log(currentFilePath);    // May be null (OK)
console.log(hasUnsavedChanges()) // Should be true if typed
```

---

## 🐛 When Things Break

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Tool blocked" | Still has `if (!currentFilePath)` check | Change to `if (!currentContent)` |
| IPC returns undefined | Handler not returning `{ success: true, content: ... }` | Add return statement |
| Temp files pile up | finally block not executing | Wrap in try/catch/finally |
| Diff preview missing | Tool not wrapped in runSafeTool | Wrap with `await runSafeTool()` |
| Undo doesn't work | undoStack not being populated | Check applyToolOutput calling undoStack.push |
| "currentContent undefined" | Editor update not firing | Check `editor.addEventListener('input', ...)` exists |

---

## 📋 Commit Messages

After each phase, commit with:

```bash
# Phase 1
git commit -m "Phase 1: Wrap format tools in safety system and enable content-based IPC"

# Phase 2
git commit -m "Phase 2: Enable blank document support across all tools"

# Phase 3
git commit -m "Phase 3: Complete editor-as-source-of-truth architecture"
```

---

## ✅ Success Check Per Phase

### Phase 1 Complete When
- [ ] formatTextBtn shows diff preview
- [ ] Blank docs can be formatted
- [ ] Undo restores content
- [ ] No "please load file" errors for content-based operations

### Phase 2 Complete When
- [ ] All 6 tools work with blank documents
- [ ] No `if (!currentFilePath)` checks in renderer.js (except file load error)
- [ ] All IPC handlers return `content` (not `output`)
- [ ] Temp files cleaned up after each tool

### Phase 3 Complete When
- [ ] compareDocuments shows current editor content
- [ ] Table converters work with blank docs
- [ ] All 9 tools support undo
- [ ] Zero file writes except on Save

---

## 🎯 Line Numbers Quick Reference

| Component | File | Lines | Status |
|-----------|------|-------|--------|
| formatTextBtn | renderer.js | 949-970 | Phase 1 |
| formatText IPC | main.js | 312-325 | Phase 1 |
| fixTOCBtn | renderer.js | 977 | Phase 2 |
| fixTOC IPC | main.js | 327-340 | Phase 2 |
| injectTagsBtn | renderer.js | 1014 | Phase 2 |
| injectTags IPC | main.js | 342-365 | Phase 2 |
| stripTagsBtn | renderer.js | 1047 | Phase 2 |
| stripTags IPC | main.js | 367-390 | Phase 2 |
| buildHeadersBtn | renderer.js | 1225 | Phase 2 |
| runQuickTool | renderer.js | 1365-1425 | Phase 2 |
| runQuickTool IPC | main.js | 392-465 | Phase 2 |
| runPipeline IPC | main.js | 280-310 | Phase 2 |
| compareBtn | renderer.js | 1569-1620 | Phase 3 |
| compare IPC | main.js | (varies) | Phase 3 |
| Table converters | renderer.js | 1864-1912 | Phase 3 |

---

## 📌 Key Pattern Reminder

### OLD (Don't Do This)
```javascript
❌ read from disk
❌ run tool on file path
❌ return file path to renderer
❌ renderer reads file again
❌ tools block on missing files
❌ blank documents not supported
```

### NEW (Do This Instead)
```javascript
✅ accept content from renderer
✅ write content to temp file
✅ run tool on temp file
✅ read result from temp file
✅ return content to renderer
✅ clean up temp files
✅ blank documents supported
```

---

## 🚀 Start Now

1. Read `FULL_CODE_AUDIT_REPORT.md` (15 min)
2. Open `PHASE_1_IMPLEMENTATION_GUIDE.md`
3. Implement Task 1.1 (formatTextBtn)
4. Implement Task 1.2 (formatText IPC)
5. Test and commit
6. Continue to Phase 2

**Total Time: 4-6 hours**  
**Difficulty: Medium**  
**Result: Production-ready application**

---

**Last Updated:** Today  
**Version:** 1.0

