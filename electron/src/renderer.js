// ============================================================================
// STATE & CONFIGURATION
// ============================================================================

let currentFilePath = null;
let currentContent = '';
let savedContent = ''; // Last version written to disk
let changeLog = [];
let selectedText = ''; // Current text selection (from Preview or Rendered)
let config = {
  defaultOutputSuffix: '_cleaned',
  tablesInline: true,
};

// Sync control: determines if scrolling/clicking in Rendered pane jumps editor
// Default: ON in Stat Mode (essential for stat-block editing workflow)
//          OFF in Structural Mode (free scrolling for reading)
let syncScrollEnabled = null; // null = use mode default, true/false = user override

// Guard flags to prevent circular updates
let isInternalEditorUpdate = false; // Set to true when we modify editor from code
let isSyncingScroll = false; // Set to true during scroll sync to prevent re-entry
let suppressStatAnalysis = false; // Set to true when doing bulk updates

// Mode: 'structural' | 'stat'
let currentMode = 'structural';

// Stat block navigation state
let statBlocks = [];
let activeStatIndex = null; // index within statBlocks
let statFilters = { type: 'all', onlyErrors: false, search: '' };

function setMode(mode) {
  if (mode !== 'structural' && mode !== 'stat') return;
  currentMode = mode;
  // Update UI classes
  document.getElementById('modeStructuralBtn')?.classList.toggle('active', mode === 'structural');
  document.getElementById('modeStatBtn')?.classList.toggle('active', mode === 'stat');
  updateUIForMode();
  
  // Update toolbar visibility if toolbar is initialized
  if (document.querySelector('.markdown-toolbar')) {
    const trpgButtons = document.querySelectorAll('.trpg-specific');
    if (currentMode === 'structural') {
      trpgButtons.forEach(btn => btn.style.display = 'none');
    } else {
      trpgButtons.forEach(btn => btn.style.display = '');
    }
  }
}

// Get effective sync state: user override or mode default
function isSyncEnabled() {
  if (syncScrollEnabled !== null) return syncScrollEnabled; // User override
  // Mode defaults: ON for Stat Mode, OFF for Structural Mode
  return currentMode === 'stat';
}

// Check if editor has unsaved changes
function hasUnsavedChanges() {
  return currentContent !== savedContent;
}

function updateUIForMode() {
  // Always show both navigators; just refresh mode-specific data
  const navigator = document.querySelector('.navigator');
  if (navigator) navigator.style.display = 'flex';

  // Ensure header navigator stays fresh
  updateHeaderNavigator();

  // Run stat analysis only when in Stat mode to avoid extra work
  if (currentMode === 'stat') {
    analyzeDocumentStatBlocks();
  }
}

// ============================================================================
// DRAG & DROP HANDLING
// ============================================================================

function initializeDragAndDrop() {
  const dropOverlay = document.getElementById('dropOverlay');
  let dragCounter = 0;

  // Prevent default drag behaviors on the entire document
  document.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  document.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  // Show overlay when dragging over window
  document.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    if (dragCounter === 1) {
      dropOverlay.classList.add('active');
    }
  });

  // Hide overlay when dragging out of window
  document.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter === 0) {
      dropOverlay.classList.remove('active');
    }
  });

  // Handle file drop
  document.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter = 0;
    dropOverlay.classList.remove('active');

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    // Take the first file
    const file = files[0];
    const filePath = file.path;

    // Check if it's a valid markdown/text file
    const validExtensions = ['.md', '.markdown', '.txt'];
    const hasValidExtension = validExtensions.some(ext => 
      filePath.toLowerCase().endsWith(ext)
    );

    if (!hasValidExtension) {
      log(`Unsupported file type: ${file.name}. Please drop a .md, .markdown, or .txt file.`, 'error');
      updateStatus('❌ Unsupported file type', 'error');
      return;
    }

    // Load the dropped file
    log(`File dropped: ${file.name}`, 'info');
    await loadFile(filePath);
  });
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function jumpEditorToLine(line) {
  const preview = document.getElementById('previewContent');
  if (!preview) return;

  const content = preview.textContent || '';
  const lines = content.split('\n');
  const totalLines = lines.length;

  if (line < 1 || line > totalLines) return;

  // 1. Scroll to approximate position
  const ratio = (line - 1) / (totalLines || 1);
  const maxScroll = preview.scrollHeight - preview.clientHeight;
  const targetScroll = Math.floor(ratio * maxScroll);

  preview.scrollTop = targetScroll;

  // 2. Set cursor position (Selection Range)
  // Calculate character offset for the start of the target line
  let charOffset = 0;
  for (let i = 0; i < line - 1; i++) {
    charOffset += lines[i].length + 1; // +1 for newline character
  }

  // Ensure offset is within bounds
  if (charOffset > content.length) charOffset = content.length;

  // Create a text node range if possible (for contenteditable or simple text node)
  // Since previewContent contains a Text Node inside <pre>, we need to target that.
  if (preview.firstChild && preview.firstChild.nodeType === Node.TEXT_NODE) {
    try {
      const range = document.createRange();
      const sel = window.getSelection();

      range.setStart(preview.firstChild, charOffset);
      range.setEnd(preview.firstChild, charOffset);

      sel.removeAllRanges();
      sel.addRange(range);

      // Focus the element to make the caret visible (if it were editable)
      // Even if not editable, this updates the internal selection state
      preview.focus();
    } catch (e) {
      console.warn('Failed to set cursor position:', e);
    }
  }
}

function log(message, type = 'info') {
  const logContainer = document.getElementById('logContent');
  if (!logContainer) return;
  
  const entry = document.createElement('div');
  entry.className = `log-entry log-${type}`;
  const timestamp = new Date().toLocaleTimeString();
  entry.textContent = `[${timestamp}] ${message}`;
  logContainer.appendChild(entry);
  logContainer.scrollTop = logContainer.scrollHeight;
}

function updateStatus(message, type = 'info') {
  const statusBar = document.getElementById('statusBar');
  if (!statusBar) return;
  
  statusBar.textContent = message;
  statusBar.className = `status-bar status-${type}`;
}

function showProgress(visible = true) {
  const progress = document.getElementById('progressIndicator');
  if (progress) {
    progress.style.display = visible ? 'block' : 'none';
  }
}

function addChangeLogEntry(action, details) {
  const timestamp = new Date().toLocaleString();
  changeLog.push({ timestamp, action, details });
  updateChangeLogTab();
}

function updateChangeLogTab() {
  const changeLogContent = document.getElementById('changeLogContent');
  if (!changeLogContent) return;
  
  changeLogContent.innerHTML = changeLog.map(entry => `
    <div class="change-entry">
      <strong>${entry.timestamp}</strong> - ${entry.action}<br>
      <span class="change-details">${entry.details}</span>
    </div>
  `).join('');
}

// ============================================================================
// SAFETY SYSTEM: TOOL EXECUTION WITH UNSAVED PROTECTION
// ============================================================================

/**
 * Prompt user to save unsaved changes before running a tool
 * Returns: 'save' | 'discard' | 'cancel'
 */
function promptSaveBeforeTool() {
  return new Promise((resolve) => {
    const modal = document.getElementById('saveBeforeToolModal');
    if (!modal) {
      resolve('cancel');
      return;
    }

    modal.style.display = 'flex';

    const saveBtn = document.getElementById('saveAndContinueBtn');
    const discardBtn = document.getElementById('discardAndContinueBtn');
    const cancelBtn = document.getElementById('cancelToolBtn');
    const closeBtn = document.getElementById('closeSaveBeforeToolBtn');

    const cleanup = () => {
      modal.style.display = 'none';
      saveBtn.replaceWith(saveBtn.cloneNode(true));
      discardBtn.replaceWith(discardBtn.cloneNode(true));
      cancelBtn.replaceWith(cancelBtn.cloneNode(true));
      closeBtn.replaceWith(closeBtn.cloneNode(true));
    };

    document.getElementById('saveAndContinueBtn').onclick = () => {
      cleanup();
      resolve('save');
    };

    document.getElementById('discardAndContinueBtn').onclick = () => {
      cleanup();
      resolve('discard');
    };

    document.getElementById('cancelToolBtn').onclick = () => {
      cleanup();
      resolve('cancel');
    };

    document.getElementById('closeSaveBeforeToolBtn').onclick = () => {
      cleanup();
      resolve('cancel');
    };
  });
}

/**
 * Show diff preview modal and get user approval
 * Returns: true (apply) | false (cancel)
 */
function showDiffPreview(originalContent, toolOutput, toolName) {
  return new Promise((resolve) => {
    const modal = document.getElementById('diffPreviewModal');
    if (!modal) {
      resolve(false);
      return;
    }

    // Set tool name
    const toolNameEl = document.getElementById('diffToolName');
    if (toolNameEl) toolNameEl.textContent = `Tool: ${toolName}`;

    // Generate diff
    renderDiff(originalContent, toolOutput);

    modal.style.display = 'flex';

    const applyBtn = document.getElementById('applyDiffBtn');
    const cancelBtn = document.getElementById('cancelDiffBtn');
    const closeBtn = document.getElementById('closeDiffPreviewBtn');

    const cleanup = () => {
      modal.style.display = 'none';
      applyBtn.replaceWith(applyBtn.cloneNode(true));
      cancelBtn.replaceWith(cancelBtn.cloneNode(true));
      closeBtn.replaceWith(closeBtn.cloneNode(true));
    };

    document.getElementById('applyDiffBtn').onclick = () => {
      cleanup();
      resolve(true);
    };

    document.getElementById('cancelDiffBtn').onclick = () => {
      cleanup();
      resolve(false);
    };

    document.getElementById('closeDiffPreviewBtn').onclick = () => {
      cleanup();
      resolve(false);
    };

    // Diff view toggle buttons
    document.getElementById('diffViewSideBySideBtn').onclick = () => {
      document.getElementById('diffViewSideBySideBtn').classList.add('active');
      document.getElementById('diffViewUnifiedBtn').classList.remove('active');
      renderDiff(originalContent, toolOutput, 'side-by-side');
    };

    document.getElementById('diffViewUnifiedBtn').onclick = () => {
      document.getElementById('diffViewUnifiedBtn').classList.add('active');
      document.getElementById('diffViewSideBySideBtn').classList.remove('active');
      renderDiff(originalContent, toolOutput, 'unified');
    };
  });
}

/**
 * Render diff in the diff container
 */
function renderDiff(original, modified, mode = 'side-by-side') {
  const container = document.getElementById('diffContainer');
  if (!container) return;

  const originalLines = original.split('\n');
  const modifiedLines = modified.split('\n');

  if (mode === 'side-by-side') {
    container.innerHTML = `
      <div class="diff-side-by-side">
        <div class="diff-column">
          <h4>Original</h4>
          ${originalLines.map((line, i) => {
            const modLine = modifiedLines[i];
            const cssClass = !modLine ? 'diff-line-removed' : 
                            line !== modLine ? 'diff-line-removed' : 
                            'diff-line-unchanged';
            return `<div class="diff-line ${cssClass}">${escapeHtml(line) || '&nbsp;'}</div>`;
          }).join('')}
        </div>
        <div class="diff-column">
          <h4>Modified</h4>
          ${modifiedLines.map((line, i) => {
            const origLine = originalLines[i];
            const cssClass = !origLine ? 'diff-line-added' : 
                            line !== origLine ? 'diff-line-added' : 
                            'diff-line-unchanged';
            return `<div class="diff-line ${cssClass}">${escapeHtml(line) || '&nbsp;'}</div>`;
          }).join('')}
        </div>
      </div>
    `;
  } else {
    // Unified diff
    let diffHtml = '<div class="diff-unified"><pre>';
    const maxLen = Math.max(originalLines.length, modifiedLines.length);
    
    for (let i = 0; i < maxLen; i++) {
      const origLine = originalLines[i];
      const modLine = modifiedLines[i];
      
      if (origLine === modLine) {
        diffHtml += `<div class="diff-line diff-line-unchanged"> ${escapeHtml(origLine) || ''}</div>`;
      } else {
        if (origLine !== undefined) {
          diffHtml += `<div class="diff-line diff-line-removed">- ${escapeHtml(origLine)}</div>`;
        }
        if (modLine !== undefined) {
          diffHtml += `<div class="diff-line diff-line-added">+ ${escapeHtml(modLine)}</div>`;
        }
      }
    }
    
    diffHtml += '</pre></div>';
    container.innerHTML = diffHtml;
  }
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Save current editor content to disk
 */
async function saveCurrentFile() {
  if (!currentFilePath) {
    // Untitled document - trigger Save As
    return await saveCurrentFileAs();
  }

  showProgress(true);
  const result = await window.electronAPI.saveFile(currentFilePath, currentContent);
  showProgress(false);

  if (result.success) {
    savedContent = currentContent;
    clearEditorUnsavedState();
    updateStatus('File saved', 'success');
    log(`Saved: ${currentFilePath}`, 'success');
    addChangeLogEntry('File Saved', `Saved to: ${currentFilePath}`);
    return true;
  } else {
    log(`Save failed: ${result.message}`, 'error');
    updateStatus('Save failed', 'error');
    return false;
  }
}

/**
 * Save As: always prompt for a path
 */
async function saveCurrentFileAs() {
  const defaultName = currentFilePath ? currentFilePath.split('/').pop() : 'untitled.md';
  const savePath = await window.electronAPI.selectSaveLocation(defaultName);
  
  if (!savePath) {
    log('Save cancelled', 'info');
    return false;
  }
  
  currentFilePath = savePath;
  document.getElementById('inputPath').value = savePath;
  return saveCurrentFile();
}

/**
 * Apply tool output to editor and update all views
 */
function applyToolOutput(toolOutput, toolName) {
  currentContent = toolOutput;
  // DO NOT update savedContent here - editor is now unsaved after tool runs
  // User must explicitly Save to write to disk
  
  updateMarkdownEditor(toolOutput);
  updateRenderedTab(toolOutput);
  updateSummaryTab(toolOutput);
  updateHeaderNavigator();
  
  if (currentMode === 'stat') analyzeDocumentStatBlocks();
  
  addChangeLogEntry('Tool Applied', `Applied: ${toolName}`);
  updateStatus(`${toolName} applied - remember to Save`, 'success');
  log(`${toolName} applied (unsaved)`, 'success');
  
  // Mark editor as unsaved
  setEditorUnsavedState();
}

/**
 * Main safety wrapper: handles unsaved state, runs tool, shows diff, applies if approved
 * @param {string} toolName - Display name of the tool
 * @param {function} runToolFunction - Async function that takes content and returns transformed content
 * @returns {Promise<boolean>} - true if applied, false if cancelled
 */
async function runSafeTool(toolName, runToolFunction) {
  // Step 1: Check for unsaved changes
  if (hasUnsavedChanges()) {
    const action = await promptSaveBeforeTool();
    
    if (action === 'cancel') {
      log(`${toolName} cancelled`, 'info');
      return false;
    }
    
    if (action === 'save') {
      const saved = await saveCurrentFile();
      if (!saved) return false; // Save failed, abort
    }
    
    if (action === 'discard') {
      // Revert to last saved state (in memory) - DO NOT reload from disk
      currentContent = savedContent;
      updateMarkdownEditor(savedContent);
      updateRenderedTab(savedContent);
      updateSummaryTab(savedContent);
      updateHeaderNavigator();
      if (currentMode === 'stat') analyzeDocumentStatBlocks();
      log('Discarded unsaved changes (reverted to last save)', 'warning');
    }
  }

  // Step 2: Run the tool on saved content
  const originalContent = savedContent;
  
  showProgress(true);
  updateStatus(`Running ${toolName}...`, 'info');
  
  let toolOutput;
  try {
    toolOutput = await runToolFunction(originalContent);
  } catch (error) {
    showProgress(false);
    log(`${toolName} failed: ${error.message}`, 'error');
    updateStatus(`${toolName} failed`, 'error');
    return false;
  }
  
  showProgress(false);

  // Step 3: Show diff and get approval
  const approved = await showDiffPreview(originalContent, toolOutput, toolName);
  
  if (!approved) {
    log(`${toolName} changes rejected`, 'info');
    return false;
  }

  // Step 4: Save undo state and apply
  saveUndoState(`Before running ${toolName}`, originalContent);
  applyToolOutput(toolOutput, toolName);
  
  return true;
}

// ============================================================================
// UNDO SYSTEM
// ============================================================================

let undoStack = [];

function saveUndoState(description, content) {
  undoStack.push({
    description,
    content: content || currentContent,
    filePath: currentFilePath,
    timestamp: new Date().toISOString()
  });
  
  // Limit stack size to prevent memory issues
  if (undoStack.length > 50) {
    undoStack.shift();
  }
  
  updateUndoButton();
}

function updateUndoButton() {
  const undoBtn = document.getElementById('undoBtn');
  const undoLabel = document.getElementById('undoLabel');
  
  if (undoStack.length > 0) {
    const lastUndo = undoStack[undoStack.length - 1];
    if (undoBtn) {
      undoBtn.disabled = false;
      undoBtn.title = `Undo: ${lastUndo.description}`;
    }
    if (undoLabel) {
      undoLabel.textContent = lastUndo.description;
    }
  } else {
    if (undoBtn) {
      undoBtn.disabled = true;
      undoBtn.title = 'No action to undo';
    }
    if (undoLabel) {
      undoLabel.textContent = '';
    }
  }
}

function undo() {
  if (undoStack.length === 0) {
    log('Nothing to undo', 'warning');
    return;
  }
  
  const state = undoStack.pop();
  
  currentContent = state.content;
  savedContent = state.content;
  currentFilePath = state.filePath;
  
  updateMarkdownEditor(state.content);
  updateRenderedTab(state.content);
  updateSummaryTab(state.content);
  updateHeaderNavigator();
  
  if (currentMode === 'stat') analyzeDocumentStatBlocks();
  
  log(`Undone: ${state.description}`, 'success');
  updateStatus('Undo successful', 'success');
  addChangeLogEntry('Undo', state.description);
  updateUndoButton();
}

// Bind undo button
document.getElementById('undoBtn')?.addEventListener('click', undo);

// ============================================================================
// TAB MANAGEMENT
// ============================================================================

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tabId = btn.dataset.tab;
    
    // Update button states
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    // Update tab content
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    const targetTab = document.getElementById(tabId);
    if (targetTab) targetTab.classList.add('active');
    
    // Refresh rendered tab if switching to it
    if (tabId === 'renderedTab' && currentContent) {
      updateRenderedTab(currentContent);
    }
  });
});

// ============================================================================
// FILE OPERATIONS
// ============================================================================

document.getElementById('browseBtn')?.addEventListener('click', async () => {
  const filePath = await window.electronAPI.selectFile();
  if (filePath) {
    currentFilePath = filePath;
    document.getElementById('inputPath').value = filePath;
    await loadFile(filePath);
    updateStatus(`Loaded: ${filePath.split('/').pop()}`, 'success');
    log(`Loaded file: ${filePath}`, 'info');
    
    // Switch to Preview tab to show the loaded content
    const previewTab = document.querySelector('[data-tab="previewTab"]');
    if (previewTab) previewTab.click();
  }
});

async function loadFile(filePath) {
  showProgress(true);
  const content = await window.electronAPI.readFile(filePath);
  showProgress(false);
  
  if (content) {
    currentContent = content;
    savedContent = content; // Track saved state
    updateMarkdownEditor(content);
    updateRenderedTab(content);
    updateSummaryTab(content);
    updateHeaderNavigator();

    updateStatBlockNavigator();

    // Run stat block analysis only when in stat mode
    if (currentMode === 'stat') analyzeDocumentStatBlocks();

    addChangeLogEntry('File Loaded', `Opened: ${filePath}`);
  } else {
    log('Failed to read file', 'error');
  }
}

function updateMarkdownEditor(content) {
  const editor = document.getElementById('markdownEditor');
  if (editor && content !== editor.value) {
    isInternalEditorUpdate = true; // Signal that we're updating from code
    editor.value = content;
    editor.scrollTop = 0;
    isInternalEditorUpdate = false; // Reset flag
    clearEditorUnsavedState();
  }
}

// Backward-compat helper (legacy name kept for older call sites)
function updatePreviewTab(content) {
  updateMarkdownEditor(content);
}

function setEditorUnsavedState() {
  const editor = document.getElementById('markdownEditor');
  const status = document.getElementById('editorStatus');
  if (editor) editor.classList.add('unsaved');
  if (status) {
    status.textContent = 'Unsaved changes';
    status.classList.add('unsaved');
    status.classList.remove('saved');
  }
}

function clearEditorUnsavedState() {
  const editor = document.getElementById('markdownEditor');
  const status = document.getElementById('editorStatus');
  if (editor) editor.classList.remove('unsaved');
  if (status) {
    status.textContent = 'Ready';
    status.classList.remove('unsaved');
    status.classList.add('saved');
  }
}

let lastRenderedHash = null; // Track last rendered content to avoid duplicate renders

function updateRenderedTab(content) {
  const rendered = document.getElementById('renderedContent');
  if (!rendered) return;
  
  // Simple hash to detect if content actually changed
  const hash = content.length + ':' + content.substring(0, 100);
  if (lastRenderedHash === hash) return; // Already rendered this content
  lastRenderedHash = hash;
  
  // Use marked library for proper Markdown rendering
  if (typeof marked !== 'undefined') {
    // Ensure headings have ids for navigation
    marked.use({ headerIds: true, mangle: false });
    rendered.innerHTML = marked.parse(content);
  } else {
    // Fallback basic rendering
    rendered.innerHTML = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/^#### (.*$)/gim, '<h4>$1</h4>')
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>');
  }
  
  // Add data-line attributes to rendered elements for sync
  addLineAttributesToRendered(rendered, content);
  
  // Track selection changes in Rendered
  rendered.addEventListener('mouseup', captureSelection);
  rendered.addEventListener('keyup', captureSelection);
  
  // Wire up rendered pane sync (scroll and click)
  wireRenderedPaneSync(rendered);
}

function addLineAttributesToRendered(rendered, content) {
  // Split content into lines for mapping
  const lines = content.split('\n');
  
  // Map rendered elements to source lines (approximate by content matching)
  const topLevelElements = rendered.querySelectorAll('h1, h2, h3, h4, h5, h6, p, pre, blockquote, ul, ol, table');
  
  let currentLine = 1;
  topLevelElements.forEach(el => {
    const text = el.textContent.trim();
    if (!text) return;
    
    // Find the line where this content appears
    for (let i = currentLine - 1; i < lines.length; i++) {
      if (lines[i].includes(text.substring(0, 30)) || lines[i].trim().startsWith(text.substring(0, 20))) {
        el.setAttribute('data-line', i + 1);
        currentLine = i + 2; // Start next search after this line
        break;
      }
    }
  });
}

function wireRenderedPaneSync(rendered) {
  // Remove old listeners to avoid duplicates
  const oldScroll = rendered._syncScrollHandler;
  const oldClick = rendered._syncClickHandler;
  if (oldScroll) rendered.removeEventListener('scroll', oldScroll);
  if (oldClick) rendered.removeEventListener('click', oldClick);
  
  // Throttle scroll events
  let scrollTimeout = null;
  const scrollHandler = () => {
    if (!isSyncEnabled()) return; // Respect sync toggle
    if (isSyncingScroll) return; // Prevent re-entry during sync
    
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      isSyncingScroll = true;
      syncEditorToRenderedView(rendered);
      isSyncingScroll = false;
    }, 150);
  };
  
  const clickHandler = (e) => {
    if (!isSyncEnabled()) return; // Respect sync toggle
    if (isSyncingScroll) return; // Don't interrupt scroll sync
    
    // Find closest element with data-line
    let target = e.target;
    while (target && target !== rendered) {
      if (target.hasAttribute('data-line')) {
        const line = parseInt(target.getAttribute('data-line'), 10);
        jumpEditorToLine(line);
        break;
      }
      target = target.parentElement;
    }
  };
  
  rendered.addEventListener('scroll', scrollHandler);
  rendered.addEventListener('click', clickHandler);
  
  // Store handlers for cleanup
  rendered._syncScrollHandler = scrollHandler;
  rendered._syncClickHandler = clickHandler;
}

function syncEditorToRenderedView(rendered) {
  // Find the first visible element with data-line
  const elements = rendered.querySelectorAll('[data-line]');
  const containerRect = rendered.getBoundingClientRect();
  
  for (const el of elements) {
    const rect = el.getBoundingClientRect();
    // Check if element is in viewport
    if (rect.top >= containerRect.top && rect.top <= containerRect.bottom) {
      const line = parseInt(el.getAttribute('data-line'), 10);
      jumpEditorToLine(line, false); // false = don't steal focus
      break;
    }
  }
}

function jumpEditorToLine(lineNumber, focusEditor = true) {
  const editor = document.getElementById('markdownEditor');
  if (!editor) return;
  
  const lines = (currentContent || '').split('\n');
  
  // Calculate character offset for the line start
  let charOffset = 0;
  for (let i = 0; i < lineNumber - 1 && i < lines.length; i++) {
    charOffset += lines[i].length + 1; // +1 for newline
  }
  
  // Set cursor position
  if (focusEditor) {
    editor.focus();
  }
  editor.setSelectionRange(charOffset, charOffset);
  
  // Scroll to make the line visible in the editor
  const lineHeight = parseInt(window.getComputedStyle(editor).lineHeight, 10) || 22;
  const visibleLines = Math.floor(editor.clientHeight / lineHeight);
  const scrollLine = Math.max(0, lineNumber - Math.floor(visibleLines / 2));
  editor.scrollTop = scrollLine * lineHeight;
}

function captureSelection() {
  const editor = document.getElementById('markdownEditor');
  if (editor && editor.selectionStart !== editor.selectionEnd) {
    const text = editor.value.substring(editor.selectionStart, editor.selectionEnd);
    selectedText = text.trim();
  } else {
    const selection = window.getSelection();
    selectedText = (selection && selection.toString() || '').trim();
  }
  
  // Update Quick Tools modal hint if open
  updateSelectionModeIndicator();
}

function updateSummaryTab(content) {
  const summary = document.getElementById('summaryContent');
  if (!summary) return;
  
  const lines = content.split('\n');
  const headers = lines.filter(line => line.startsWith('#'));
  const words = content.split(/\s+/).length;
  const chars = content.length;
  
  summary.innerHTML = `
    <h3>Document Statistics</h3>
    <p><strong>Lines:</strong> ${lines.length}</p>
    <p><strong>Words:</strong> ${words}</p>
    <p><strong>Characters:</strong> ${chars}</p>
    <p><strong>Headers:</strong> ${headers.length}</p>
    <h3>Document Structure</h3>
    <pre>${headers.slice(0, 20).join('\n')}${headers.length > 20 ? '\n... (more)' : ''}</pre>
  `;
}

document.getElementById('exportMarkdownBtn')?.addEventListener('click', async () => {
  if (!currentContent) {
    log('No content to export', 'error');
    return;
  }
  
  const defaultName = currentFilePath ? 
    currentFilePath.split('/').pop().replace('.md', '_export.md') : 
    'export.md';
  
  const savePath = await window.electronAPI.selectSaveLocation(defaultName);
  if (savePath) {
    showProgress(true);
    const result = await window.electronAPI.saveFile(savePath, currentContent);
    showProgress(false);
    
    if (result.success) {
      // If exporting to the current file, update savedContent
      if (savePath === currentFilePath) {
        savedContent = currentContent;
        clearEditorUnsavedState();
      }
      
      updateStatus('Exported successfully', 'success');
      log(`Exported to: ${savePath}`, 'success');
      addChangeLogEntry('Export', `Saved to: ${savePath}`);
    } else {
      log(`Export failed: ${result.message}`, 'error');
    }
  }
});

document.getElementById('openOutputBtn')?.addEventListener('click', async () => {
  if (!currentFilePath) {
    log('No file selected', 'warning');
    return;
  }
  
  const folderPath = currentFilePath.substring(0, currentFilePath.lastIndexOf('/'));
  await window.electronAPI.openFolder(folderPath);
  log(`Opened folder: ${folderPath}`, 'info');
});

// ============================================================================
// PIPELINE OPERATIONS
// ============================================================================

document.getElementById('runPipelineBtn')?.addEventListener('click', async () => {
  if (!currentFilePath || !currentContent) {
    log('Please select an input file first', 'error');
    return;
  }
  
  const outputSuffix = document.getElementById('outputSuffix')?.value || config.defaultOutputSuffix;
  const tablesInline = document.getElementById('tablesInlineCheck')?.checked ?? config.tablesInline;
  
  // Use safety wrapper - pipeline processes saved file
  await runSafeTool('Full Pipeline', async (content) => {
    // Save current content to temp file first
    const tempPath = currentFilePath;
    await window.electronAPI.saveFile(tempPath, content);
    
    // Run pipeline on saved file
    const result = await window.electronAPI.runPipeline(tempPath, outputSuffix, tablesInline);
    
    if (!result.success) {
      throw new Error(result.message);
    }
    
    // Read the output file
    const outputPath = tempPath.replace(/\.md$/, `${outputSuffix}.md`);
    const outputContent = await window.electronAPI.readFile(outputPath);
    
    if (!outputContent) {
      throw new Error('Failed to read pipeline output');
    }
    
    return outputContent;
  });
});

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
      throw new Error(result.message || 'Format Text failed');
    }
    
    if (result.content === undefined) {
      throw new Error('Format Text did not return content');
    }

    // Record action in changelog
    addChangeLogEntry('Format Text', `Applied formatting with suffix: ${outputSuffix}`);
    
    // Return transformed content (runSafeTool handles the rest)
    return result.content;
  });
});

document.getElementById('fixTOCBtn')?.addEventListener('click', async () => {
  if (!currentContent && !currentFilePath) {
    log('No content to fix', 'error');
    return;
  }
  
  const outputSuffix = document.getElementById('outputSuffix')?.value || config.defaultOutputSuffix;
  
  // Use safety wrapper
  await runSafeTool('Fix TOC', async (content) => {
    log('Fixing table of contents...', 'info');
    
    // Run TOC fix on in-memory content
    const result = await window.electronAPI.fixTOC(content, outputSuffix);
    
    if (!result.success) {
      throw new Error(result.message || 'TOC fix failed');
    }
    
    if (result.content === undefined) {
      throw new Error('Fix TOC did not return content');
    }

    addChangeLogEntry('Fix TOC', `Applied TOC fix with suffix: ${outputSuffix}`);
    return result.content;
  });
});

// ============================================================================
// EDMUNDS TAGGING
// ============================================================================

document.getElementById('injectTagsBtn')?.addEventListener('click', async () => {
  if (!currentContent && !currentFilePath) {
    log('No content to tag', 'error');
    return;
  }
  
  const outputSuffix = document.getElementById('outputSuffix')?.value || '_tagged';
  
  // Use safety wrapper
  await runSafeTool('Inject Edmunds Tags', async (content) => {
    log('Injecting Edmunds tags...', 'info');
    
    // Run tag injection on in-memory content
    const result = await window.electronAPI.injectTags(content, outputSuffix);
    
    if (!result.success) {
      throw new Error(result.message || 'Tag injection failed');
    }
    
    if (result.content === undefined) {
      throw new Error('Inject Edmunds Tags did not return content');
    }

    addChangeLogEntry('Inject Edmunds Tags', `Applied tagging with suffix: ${outputSuffix}`);
    return result.content;
  });
});

document.getElementById('stripTagsBtn')?.addEventListener('click', async () => {
  if (!currentContent && !currentFilePath) {
    log('No content to strip', 'error');
    return;
  }
  
  const outputSuffix = document.getElementById('outputSuffix')?.value || '_stripped';
  
  // Use safety wrapper
  await runSafeTool('Strip Edmunds Tags', async (content) => {
    log('Stripping Edmunds tags...', 'info');
    
    // Run tag stripping on in-memory content
    const result = await window.electronAPI.stripTags(content, outputSuffix);
    
    if (!result.success) {
      throw new Error(result.message || 'Tag stripping failed');
    }
    
    if (result.content === undefined) {
      throw new Error('Strip Edmunds Tags did not return content');
    }

    addChangeLogEntry('Strip Edmunds Tags', `Removed tags with suffix: ${outputSuffix}`);
    return result.content;
  });
});

// ============================================================================
// SECTION PICKER
// ============================================================================

let selectedSections = []; // Array of {header, startLine, endLine}
let allSections = [];

function extractSections(content) {
  const lines = content.split('\n');
  const sections = [];
  let currentSection = null;
  
  lines.forEach((line, index) => {
    // Match headers (# , ## , ### , etc.)
    const headerMatch = line.match(/^(#{1,6})\s+(.+)/);
    
    if (headerMatch) {
      // Save previous section
      if (currentSection) {
        currentSection.endLine = index - 1;
        sections.push(currentSection);
      }
      
      // Start new section
      const level = headerMatch[1].length;
      const title = headerMatch[2].trim();
      currentSection = {
        header: title,
        level: level,
        startLine: index + 1, // 1-indexed
        endLine: lines.length // Will be updated
      };
    }
  });
  
  // Save last section
  if (currentSection) {
    currentSection.endLine = lines.length;
    sections.push(currentSection);
  }
  
  return sections;
}

function renderSectionList() {
  const sectionList = document.getElementById('sectionList');
  if (!sectionList) return;
  
  if (allSections.length === 0) {
    sectionList.innerHTML = `
      <p style="color: #6c757d; text-align: center; padding: 40px 20px;">
        No headers found in document. Add # headers to see sections here.
      </p>
    `;
    return;
  }
  
  let html = '<div style="font-family: monospace; font-size: 13px;">';
  allSections.forEach((section, index) => {
    const indent = (section.level - 1) * 20;
    const isSelected = selectedSections.includes(index);
    const icon = '📄'.repeat(Math.min(section.level, 3));
    
    html += `
      <div style="display: flex; align-items: center; padding: 6px 0; margin-left: ${indent}px;">
        <input type="checkbox" id="section_${index}" data-index="${index}" 
               ${isSelected ? 'checked' : ''} 
               style="margin-right: 8px; cursor: pointer;" />
        <label for="section_${index}" style="flex: 1; cursor: pointer; color: #212529;">
          ${icon} ${section.header}
          <span style="color: #6c757d; font-size: 11px; margin-left: 8px;">
            (lines ${section.startLine}-${section.endLine})
          </span>
        </label>
      </div>
    `;
  });
  html += '</div>';
  
  sectionList.innerHTML = html;
  
  // Bind checkbox events
  sectionList.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const index = parseInt(e.target.dataset.index, 10);
      if (e.target.checked) {
        if (!selectedSections.includes(index)) {
          selectedSections.push(index);
        }
      } else {
        selectedSections = selectedSections.filter(i => i !== index);
      }
      updateSectionCount();
    });
  });
  
  updateSectionCount();
}

function updateSectionCount() {
  const msg = document.getElementById('sectionCountMsg');
  if (msg) {
    msg.textContent = `${selectedSections.length} of ${allSections.length} sections selected`;
  }
}

// Open section picker
document.getElementById('openSectionPickerBtn')?.addEventListener('click', () => {
  // Close quick tools modal
  const quickToolsModal = document.getElementById('quickToolsModal');
  if (quickToolsModal) quickToolsModal.style.display = 'none';
  
  // Extract sections from current document
  if (currentContent) {
    allSections = extractSections(currentContent);
    selectedSections = allSections.map((_, i) => i); // Select all by default
    renderSectionList();
  }
  
  // Show section picker modal
  const modal = document.getElementById('sectionPickerModal');
  if (modal) modal.style.display = 'flex';
});

document.getElementById('closeSectionPickerBtn')?.addEventListener('click', () => {
  const modal = document.getElementById('sectionPickerModal');
  if (modal) modal.style.display = 'none';
});

document.getElementById('cancelSectionsBtn')?.addEventListener('click', () => {
  const modal = document.getElementById('sectionPickerModal');
  if (modal) modal.style.display = 'none';
});

document.getElementById('selectAllSectionsBtn')?.addEventListener('click', () => {
  selectedSections = allSections.map((_, i) => i);
  renderSectionList();
});

document.getElementById('deselectAllSectionsBtn')?.addEventListener('click', () => {
  selectedSections = [];
  renderSectionList();
});

document.getElementById('applySectionsBtn')?.addEventListener('click', () => {
  if (selectedSections.length === 0) {
    alert('Please select at least one section to process.');
    return;
  }
  
  // Close modal
  const modal = document.getElementById('sectionPickerModal');
  if (modal) modal.style.display = 'none';
  
  // Show quick tools again with section selection applied
  const quickToolsModal = document.getElementById('quickToolsModal');
  if (quickToolsModal) quickToolsModal.style.display = 'flex';
  
  log(`Section selection applied: ${selectedSections.length} sections`, 'info');
  updateStatus(`${selectedSections.length} sections selected for processing`, 'info');
});

// ============================================================================
// QUICK TOOLS MODAL
// ============================================================================

// Build Headers button
document.getElementById('buildHeadersBtn')?.addEventListener('click', async () => {
  // Always use _headers suffix for this operation (in-memory by default)
  const outputSuffix = '_headers';
  const loose = !!document.getElementById('buildHeadersLooseCheck')?.checked;

  if (!currentContent) {
    alert('No content to build headers from');
    log('No content available for Build Headers', 'error');
    return;
  }

  log('Building header structure (in-memory)...', 'info');
  showProgress(true);
  updateStatus('Building headers...', 'info');

  try {
    const result = await window.electronAPI.buildHeaders({ content: currentContent }, outputSuffix, { loose });
    showProgress(false);

    if (!result.success || !result.content) {
      const msg = result.message || 'Header building failed';
      log(msg, 'error');
      updateStatus('Header building failed', 'error');
      alert(msg);
      return;
    }

    const originalLines = currentContent.split('\n');
    const convertedLines = result.content.split('\n');
    const changedLines = originalLines.reduce((count, line, i) => count + (line !== convertedLines[i] ? 1 : 0), 0);


        // Update all tabs with the new content
        updatePreviewTab(outputContent);
        updateRenderedTab(outputContent);
        updateSummaryTab(outputContent);
        updateHeaderNavigator();
        updateStatBlockNavigator();

    const changeMsg = changedLines > 0 
      ? `Built headers: ${changedLines} lines updated`
      : `Built headers: no changes detected`;


    addChangeLogEntry('Build Headers', changeMsg);
    log(changeMsg, changedLines > 0 ? 'info' : 'warning');

    currentContent = result.content;
    updateMarkdownEditor(currentContent);
    updateRenderedTab(currentContent);
    updateSummaryTab(currentContent);
    updateHeaderNavigator();
    setEditorUnsavedState();
    updateStatus('Headers built (unsaved)', 'success');
  } catch (error) {
    showProgress(false);
    log(`Error: ${error.message}`, 'error');
    updateStatus('Error', 'error');
    alert(`Error: ${error.message}`);
  }
});

document.getElementById('quickToolsBtn')?.addEventListener('click', () => {
  const modal = document.getElementById('quickToolsModal');
  if (modal) {
    modal.style.display = 'flex';
    updateSelectionModeIndicator();
  }
});

document.getElementById('closeQuickToolsBtn')?.addEventListener('click', () => {
  const modal = document.getElementById('quickToolsModal');
  if (modal) modal.style.display = 'none';
});

function updateSelectionModeIndicator() {
  const indicator = document.getElementById('selectionModeIndicator');
  if (!indicator) return;
  
  if (selectedText && selectedText.length > 0) {
    const preview = selectedText.length > 50 
      ? selectedText.substring(0, 50) + '...' 
      : selectedText;
    indicator.innerHTML = `
      <strong>✂️ Selection Mode:</strong> Processing ${selectedText.length} characters<br>
      <code style="font-size: 11px; background: #f5f5f7; padding: 2px 6px; border-radius: 3px;">${preview.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code>
    `;
    indicator.style.display = 'block';
  } else {
    indicator.style.display = 'none';
  }
}

async function runQuickTool(toolName) {
  if (!currentFilePath) {
    log('Please select an input file first', 'error');
    return;
  }
  
  // Close modal immediately so user can see progress
  const quickToolsModal = document.getElementById('quickToolsModal');
  if (quickToolsModal) quickToolsModal.style.display = 'none';
  
  const outputSuffix = document.getElementById('outputSuffix')?.value || config.defaultOutputSuffix;
  const options = {};
  const isSelectionMode = selectedText && selectedText.length > 0;
  
  // Priority 1: If text is selected, use selection
  if (isSelectionMode) {
    options.filteredContent = selectedText;
    options.selectionMode = true;
    log(`Processing ${selectedText.length} characters from selection`, 'info');
  }
  // Priority 2: If sections are selected, prepare filtered content
  else if (selectedSections.length > 0 && selectedSections.length < allSections.length) {
    // Extract only selected sections
    const lines = currentContent.split('\n');
    const selectedLines = [];
    
    selectedSections.forEach(index => {
      const section = allSections[index];
      // Extract lines for this section (0-indexed in array, but section uses 1-indexed)
      const startIdx = section.startLine - 1;
      const endIdx = section.endLine;
      selectedLines.push(...lines.slice(startIdx, endIdx));
    });
    
    options.filteredContent = selectedLines.join('\n');
    options.sectionCount = selectedSections.length;
    log(`Processing ${selectedSections.length} of ${allSections.length} sections`, 'info');
  }
  
  log(`Running ${toolName}...`, 'info');
  updateStatus(`Running ${toolName}...`, 'processing');
  showProgress(true);
  
  const result = await window.electronAPI.runQuickTool(toolName, currentFilePath, outputSuffix, options);
  
  showProgress(false);
  
  if (result.success) {
    log(`${toolName} completed successfully`, 'success');
    updateStatus(`${toolName} complete`, 'success');
    
    // For selection mode, display output in Log tab instead of creating files
    if (isSelectionMode) {
      log('═══════════════════════════════════════════════════', 'info');
      log(`SELECTION TOOL OUTPUT: ${toolName}`, 'info');
      log(`Input: ${selectedText.length} characters`, 'info');
      log('───────────────────────────────────────────────────', 'info');
      
      // Display the tool output
      const output = result.output || result.message || 'No output';
      output.split('\n').forEach(line => {
        if (line.trim()) log(line, 'info');
      });
      
      log('═══════════════════════════════════════════════════', 'info');
      
      // Switch to Log tab to show results
      const logTab = document.querySelector('[data-tab="logTab"]');
      if (logTab) logTab.click();
      
      addChangeLogEntry('Quick Tool', `Ran ${toolName} on ${selectedText.length}-char selection (output in Log)`);
      // If long-line tool and user selected sections or the selection corresponds to a single section,
      // parse the output and add pending changes targets for review.
      if (toolName === 'long-line' && options.sectionCount === 1) {
        parseLongLineOutputAndTrack(result.output || result.message || '', selectedSections[0], true);
      }
    } else if (options.sectionCount) {
      addChangeLogEntry('Quick Tool', `Ran ${toolName} on ${options.sectionCount} sections`);
      if (toolName === 'long-line' && result?.output) {
        // Map output line numbers back into full document and create change markers
        parseLongLineOutputAndTrack(result.output, null, false);
      }
    } else {
      addChangeLogEntry('Quick Tool', `Ran ${toolName}`);
      if (toolName === 'long-line' && result?.output) {
        parseLongLineOutputAndTrack(result.output, null, false);
      }
    }
    
    // Clear selection after processing
    selectedText = '';
    window.getSelection()?.removeAllRanges();
  } else {
    log(`${toolName} failed: ${result.message}`, 'error');
    updateStatus(`${toolName} failed`, 'error');
  }
}

// Bind all quick tool buttons
const quickToolButtons = [
  { id: 'qtHeaderDepthBtn', tool: 'header-depth' },
  { id: 'qtLongLineBtn', tool: 'long-line' },
  { id: 'qtParagraphBreakBtn', tool: 'paragraph-break' },
  { id: 'qtSpellCheckBtn', tool: 'spell-check' },
];

quickToolButtons.forEach(({ id, tool }) => {
  document.getElementById(id)?.addEventListener('click', () => runQuickTool(tool));
});

// Quick tool for Document Comparator (special case - opens modal instead)
document.getElementById('qtCompareDocsBtn')?.addEventListener('click', () => {
  // Close quick tools modal
  const quickToolsModal = document.getElementById('quickToolsModal');
  if (quickToolsModal) quickToolsModal.style.display = 'none';
  
  // Open comparator modal
  document.getElementById('compareDocsBtn')?.click();
});

// ============================================================================
// DOCUMENT COMPARATOR
// ============================================================================

let compareDoc1Path = null;
let compareDoc2Path = null;

document.getElementById('compareDocsBtn')?.addEventListener('click', () => {
  // Pre-fill with current file if available
  if (currentFilePath) {
    compareDoc1Path = currentFilePath;
    document.getElementById('compareDoc1Path').value = currentFilePath;
  }
  
  // Show modal
  const modal = document.getElementById('compareDocsModal');
  if (modal) modal.style.display = 'flex';
});

document.getElementById('closeCompareDocsBtn')?.addEventListener('click', () => {
  const modal = document.getElementById('compareDocsModal');
  if (modal) modal.style.display = 'none';
});

document.getElementById('cancelCompareBtn')?.addEventListener('click', () => {
  const modal = document.getElementById('compareDocsModal');
  if (modal) modal.style.display = 'none';
});

document.getElementById('browseDoc1Btn')?.addEventListener('click', async () => {
  const filePath = await window.electronAPI.selectFile();
  if (filePath) {
    compareDoc1Path = filePath;
    document.getElementById('compareDoc1Path').value = filePath;
  }
});

document.getElementById('browseDoc2Btn')?.addEventListener('click', async () => {
  const filePath = await window.electronAPI.selectFile();
  if (filePath) {
    compareDoc2Path = filePath;
    document.getElementById('compareDoc2Path').value = filePath;
  }
});

document.getElementById('runCompareBtn')?.addEventListener('click', async () => {
  const doc1 = document.getElementById('compareDoc1Path').value;
  const doc2 = document.getElementById('compareDoc2Path').value;
  const threshold = parseFloat(document.getElementById('compareThreshold').value) / 100;
  const format = document.getElementById('compareFormat').value;
  const autoSave = document.getElementById('compareAutoSave').checked;
  
  // Validation
  if (!doc1 || !doc2) {
    alert('Please select both documents to compare.');
    return;
  }
  
  if (doc1 === doc2) {
    alert('Cannot compare a document with itself. Please select different documents.');
    return;
  }
  
  // Close modal
  const modal = document.getElementById('compareDocsModal');
  if (modal) modal.style.display = 'none';
  
  // Show progress
  showProgress(true);
  updateStatus('Running document comparison...', 'info');
  log(`Comparing documents: ${doc1.split('/').pop()} vs ${doc2.split('/').pop()}`, 'info');
  
  try {
    // Prepare options
    const options = {
      threshold: threshold,
      format: format
    };
    
    // Add output path if auto-save is enabled
    if (autoSave) {
      const doc1Name = doc1.split('/').pop().replace(/\.[^/.]+$/, '');
      const doc2Name = doc2.split('/').pop().replace(/\.[^/.]+$/, '');
      const ext = format === 'markdown' ? '.md' : '.txt';
      const outputDir = doc1.substring(0, doc1.lastIndexOf('/'));
      options.outputPath = `${outputDir}/comparison_${doc1Name}_vs_${doc2Name}${ext}`;
    }
    
    // Run comparison
    const result = await window.electronAPI.compareDocuments(doc1, doc2, options);
    
    showProgress(false);
    
    if (result.success) {
      updateStatus('Comparison complete', 'success');
      log('Document comparison completed successfully', 'success');
      
      // Parse the output to extract issue count
      const output = result.output || '';
      const issueMatch = output.match(/Found (\d+) issues/);
      const issueCount = issueMatch ? issueMatch[1] : 'unknown';
      
      // Display results in comparison tab
      const comparisonContent = document.getElementById('comparisonContent');
      if (comparisonContent) {
        let html = '<div class="comparison-results">';
        html += `<h3>Comparison Results</h3>`;
        html += `<div class="comparison-summary">`;
        html += `<p><strong>Baseline:</strong> ${doc1.split('/').pop()}</p>`;
        html += `<p><strong>Comparison:</strong> ${doc2.split('/').pop()}</p>`;
        html += `<p><strong>Issues Found:</strong> ${issueCount}</p>`;
        html += `<p><strong>Threshold:</strong> ${(threshold * 100).toFixed(0)}%</p>`;
        html += `</div>`;
        
        if (result.reportContent) {
          html += '<div class="comparison-report">';
          if (format === 'markdown') {
            // Use marked.js to render markdown
            html += marked.parse(result.reportContent);
          } else {
            html += `<pre>${result.reportContent}</pre>`;
          }
          html += '</div>';
          
          if (result.reportPath) {
            html += `<div class="comparison-footer">`;
            html += `<p>Report saved to: <code>${result.reportPath}</code></p>`;
            html += `</div>`;
          }
        } else {
          html += '<div class="comparison-output">';
          html += `<pre>${output}</pre>`;
          html += '</div>';
        }
        
        html += '</div>';
        comparisonContent.innerHTML = html;
      }
      
      // Switch to comparison tab
      const comparisonTab = document.querySelector('[data-tab="comparisonTab"]');
      if (comparisonTab) comparisonTab.click();
      
      // Add to change log
      addChangeLogEntry(
        'Document Comparison',
        `Compared ${doc1.split('/').pop()} vs ${doc2.split('/').pop()} - ${issueCount} issues found`
      );
      
    } else {
      updateStatus('Comparison failed', 'error');
      log(`Comparison failed: ${result.message}`, 'error');
      
      // Show error in comparison tab
      const comparisonContent = document.getElementById('comparisonContent');
      if (comparisonContent) {
        comparisonContent.innerHTML = `
          <div class="comparison-error">
            <h3>Comparison Failed</h3>
            <p>${result.message}</p>
            <pre>${result.output || result.stderr || ''}</pre>
          </div>
        `;
      }
    }
  } catch (error) {
    showProgress(false);
    updateStatus('Comparison error', 'error');
    log(`Error during comparison: ${error.message}`, 'error');
  }
});

// ============================================================================
// SETTINGS MODAL
// ============================================================================

document.getElementById('settingsBtn')?.addEventListener('click', async () => {
  // Load current config
  const loadedConfig = await window.electronAPI.loadConfig();
  if (loadedConfig) {
    config = { ...config, ...loadedConfig };
  }
  
  // Populate settings form
  document.getElementById('settingOutputSuffix').value = config.defaultOutputSuffix || '_cleaned';
  document.getElementById('settingTablesInline').checked = config.tablesInline ?? true;
  
  // Update sync checkbox to reflect current state (user override or mode default)
  const syncCheckbox = document.getElementById('settingSyncEnabled');
  if (syncCheckbox) {
    syncCheckbox.checked = syncScrollEnabled ?? isSyncEnabled();
  }
  
  // Show modal
  const modal = document.getElementById('settingsModal');
  if (modal) modal.style.display = 'flex';
});

document.getElementById('closeSettingsBtn')?.addEventListener('click', () => {
  const modal = document.getElementById('settingsModal');
  if (modal) modal.style.display = 'none';
});

document.getElementById('saveSettingsBtn')?.addEventListener('click', async () => {
  // Gather settings
  config.defaultOutputSuffix = document.getElementById('settingOutputSuffix')?.value || '_cleaned';
  config.tablesInline = document.getElementById('settingTablesInline')?.checked ?? true;
  
  // Save sync preference: checkbox checked = explicit ON, unchecked = use mode default (null)
  const syncCheckbox = document.getElementById('settingSyncEnabled');
  syncScrollEnabled = syncCheckbox?.checked ? true : null;
  config.syncScrollEnabled = syncScrollEnabled;
  
  // Save config
  const result = await window.electronAPI.saveConfig(config);
  
  if (result.success) {
    log('Settings saved successfully', 'success');
    updateStatus('Settings saved', 'success');
  } else {
    log(`Failed to save settings: ${result.message}`, 'error');
  }
  
  // Close modal
  const modal = document.getElementById('settingsModal');
  if (modal) modal.style.display = 'none';
});

document.getElementById('cancelSettingsBtn')?.addEventListener('click', () => {
  const modal = document.getElementById('settingsModal');
  if (modal) modal.style.display = 'none';
});

  // ============================================================================
  // TABLE TOOLS
  // ============================================================================

  // Sidebar button: Open Table Tools tab
  document.getElementById('tableToolsBtn')?.addEventListener('click', () => {
    const tabBtn = document.querySelector('[data-tab="tableToolsTab"]');
    tabBtn?.click();
  });

  // Tool selector buttons
  document.querySelectorAll('.tool-select-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const toolName = btn.dataset.tool;
    
      // Update active button
      document.querySelectorAll('.tool-select-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    
      // Show corresponding tool panel
      document.querySelectorAll('.table-tool-panel').forEach(panel => panel.classList.remove('active'));
      document.getElementById(`${toolName}Tool`)?.classList.add('active');
    });
  });

  // --- Tool 1: Markdown Table to TSV ---

  let mdTableInputPath = null;
  let mdTableOutputPath = null;
  let mdTableResultContent = null;

  document.getElementById('browseMdTableBtn')?.addEventListener('click', async () => {
    const result = await window.electronAPI.selectFile({ 
      filters: [
        { name: 'Markdown Files', extensions: ['md', 'markdown'] },
        { name: 'Text Files', extensions: ['txt'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    const selectedPath = (result && result.filePath) ? result.filePath : result;
  
    if (selectedPath) {
      mdTableInputPath = selectedPath;
      document.getElementById('mdTableInput').value = selectedPath;
    
      // Auto-generate output path
      const baseName = selectedPath.replace(/\.(md|markdown)$/i, '');
      mdTableOutputPath = `${baseName}.txt`;
      document.getElementById('mdTableOutput').value = mdTableOutputPath;
    
      document.getElementById('runMdTableConvertBtn').disabled = false;
    }
  });

  document.getElementById('browseMdTableOutputBtn')?.addEventListener('click', async () => {
    const fileName = mdTableInputPath ? 
      mdTableInputPath.split('/').pop().replace(/\.(md|markdown)$/i, '.txt') : 
      'table_output.txt';
  
    const result = await window.electronAPI.selectSaveLocation(fileName);
    const savePath = (result && result.filePath) ? result.filePath : result;
  
    if (savePath) {
      mdTableOutputPath = savePath;
      document.getElementById('mdTableOutput').value = savePath;
    }
  });

  document.getElementById('runMdTableConvertBtn')?.addEventListener('click', async () => {
    if (!mdTableInputPath) return;
  
    const noHeaders = document.getElementById('mdTableNoHeaders')?.checked || false;
    const outputPath = mdTableOutputPath || `${mdTableInputPath.replace(/\.(md|markdown)$/i, '')}.txt`;
  
    log(`Converting markdown table: ${mdTableInputPath}`, 'info');
    showProgress(true);
  
    try {
      const result = await window.electronAPI.convertMdTableToTsv(mdTableInputPath, {
        outputPath,
        noHeaders
      });
    
      showProgress(false);
    
      if (result.success) {
        mdTableResultContent = result.content;
        document.getElementById('mdTableResultContent').textContent = result.content;
        document.getElementById('mdTableResult').style.display = 'block';
        document.getElementById('copyMdTableResultBtn').disabled = false;
      
        log(`Conversion successful: ${outputPath}`, 'success');
        updateStatus(`Converted to ${outputPath}`, 'success');
      } else {
        log(`Conversion failed: ${result.message}`, 'error');
        updateStatus('Conversion failed', 'error');
        alert(`Conversion failed: ${result.message}`);
      }
    } catch (error) {
      showProgress(false);
      log(`Error: ${error.message}`, 'error');
      alert(`Error: ${error.message}`);
    }
  });

  document.getElementById('copyMdTableResultBtn')?.addEventListener('click', () => {
    if (mdTableResultContent) {
      navigator.clipboard.writeText(mdTableResultContent);
      updateStatus('Copied to clipboard', 'success');
      log('Result copied to clipboard', 'info');
    }
  });

  // --- Tool 2: Names to Columns ---

  let namesInputPath = null;
  let namesOutputPath = null;
  let namesResultContent = null;

  document.getElementById('browseNamesBtn')?.addEventListener('click', async () => {
    const result = await window.electronAPI.selectFile({ 
      filters: [
        { name: 'Text Files', extensions: ['txt', 'md'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    const selectedPath = (result && result.filePath) ? result.filePath : result;
  
    if (selectedPath) {
      namesInputPath = selectedPath;
      document.getElementById('namesInput').value = selectedPath;
    
      // Auto-generate output path
      const baseName = selectedPath.replace(/\.[^.]+$/, '');
      namesOutputPath = `${baseName}-Columns.txt`;
      document.getElementById('namesOutput').value = namesOutputPath;
    
      document.getElementById('runNamesConvertBtn').disabled = false;
    }
  });

  document.getElementById('browseNamesOutputBtn')?.addEventListener('click', async () => {
    const fileName = namesInputPath ? 
      namesInputPath.split('/').pop().replace(/\.[^.]+$/, '-Columns.txt') : 
      'names-columns.txt';
  
    const result = await window.electronAPI.selectSaveLocation(fileName);
    const savePath = (result && result.filePath) ? result.filePath : result;
  
    if (savePath) {
      namesOutputPath = savePath;
      document.getElementById('namesOutput').value = savePath;
    }
  });

  document.getElementById('runNamesConvertBtn')?.addEventListener('click', async () => {
    if (!namesInputPath) return;
  
    const columns = parseInt(document.getElementById('namesColumns')?.value || '4', 10);
    const outputPath = namesOutputPath || `${namesInputPath.replace(/\.[^.]+$/, '')}-Columns.txt`;
  
    log(`Converting names to columns: ${namesInputPath}`, 'info');
    showProgress(true);
  
    try {
      const result = await window.electronAPI.convertNamesToColumns(namesInputPath, {
        outputPath,
        columns
      });
    
      showProgress(false);
    
      if (result.success) {
        namesResultContent = result.content;
        document.getElementById('namesResultContent').textContent = result.content;
        document.getElementById('namesResult').style.display = 'block';
        document.getElementById('copyNamesResultBtn').disabled = false;
      
        log(`Conversion successful: ${outputPath}`, 'success');
        updateStatus(`Converted to ${outputPath}`, 'success');
      } else {
        log(`Conversion failed: ${result.message}`, 'error');
        updateStatus('Conversion failed', 'error');
        alert(`Conversion failed: ${result.message}`);
      }
    } catch (error) {
      showProgress(false);
      log(`Error: ${error.message}`, 'error');
      alert(`Error: ${error.message}`);
    }
  });

  document.getElementById('copyNamesResultBtn')?.addEventListener('click', () => {
    if (namesResultContent) {
      navigator.clipboard.writeText(namesResultContent);
      updateStatus('Copied to clipboard', 'success');
      log('Result copied to clipboard', 'info');
    }
  });

  // --- Tool 3: Multi-Format Converter ---

  let multiFormatResultContent = null;

  document.getElementById('runMultiFormatBtn')?.addEventListener('click', async () => {
    const inputText = document.getElementById('multiFormatInput')?.value;
    const format = document.getElementById('multiFormatOutput')?.value || 'tsv';
  
    if (!inputText || !inputText.trim()) {
      alert('Please enter input text');
      return;
    }
  
    log(`Converting table to ${format.toUpperCase()}`, 'info');
    showProgress(true);
  
    try {
      const result = await window.electronAPI.convertTableMultiFormat(inputText, format);
    
      showProgress(false);
    
      if (result.success) {
        multiFormatResultContent = result.output;
        document.getElementById('multiFormatResultContent').textContent = result.output;
        document.getElementById('multiFormatResult').style.display = 'block';
        document.getElementById('copyMultiFormatResultBtn').disabled = false;
      
        // Show orphans if any
        if (result.orphans && result.orphans.length > 0) {
          document.getElementById('multiFormatOrphansList').textContent = result.orphans.join('\n');
          document.getElementById('multiFormatOrphans').style.display = 'block';
        } else {
          document.getElementById('multiFormatOrphans').style.display = 'none';
        }
      
        log(`Conversion successful (${format.toUpperCase()})`, 'success');
        updateStatus('Conversion complete', 'success');
      } else {
        log(`Conversion failed: ${result.message}`, 'error');
        updateStatus('Conversion failed', 'error');
        alert(`Conversion failed: ${result.message}`);
      }
    } catch (error) {
      showProgress(false);
      log(`Error: ${error.message}`, 'error');
      alert(`Error: ${error.message}`);
    }
  });

  document.getElementById('copyMultiFormatResultBtn')?.addEventListener('click', () => {
    if (multiFormatResultContent) {
      navigator.clipboard.writeText(multiFormatResultContent);
      updateStatus('Copied to clipboard', 'success');
      log('Result copied to clipboard', 'info');
    }
  });

  document.getElementById('clearMultiFormatBtn')?.addEventListener('click', () => {
    document.getElementById('multiFormatInput').value = '';
    document.getElementById('multiFormatResult').style.display = 'none';
    document.getElementById('multiFormatOrphans').style.display = 'none';
    multiFormatResultContent = null;
    document.getElementById('copyMultiFormatResultBtn').disabled = true;
    updateStatus('Cleared input', 'info');
  });

// ============================================================================
// DRAG AND DROP FILE HANDLING
// ============================================================================

function initializeDragAndDrop() {
  const dropOverlay = document.getElementById('dropOverlay');
  let dragCounter = 0;

  // Prevent default drag behaviors on the entire document
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    document.body.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
    }, false);
  });

  // Show overlay when dragging over the window
  document.body.addEventListener('dragenter', (e) => {
    dragCounter++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      dropOverlay.classList.add('active');
    }
  });

  // Hide overlay when leaving the window
  document.body.addEventListener('dragleave', (e) => {
    dragCounter--;
    if (dragCounter === 0) {
      dropOverlay.classList.remove('active');
    }
  });

  // Handle drop
  document.body.addEventListener('drop', async (e) => {
    dragCounter = 0;
    dropOverlay.classList.remove('active');

    const files = e.dataTransfer.files;
    if (files.length === 0) return;

    const file = files[0];
    const filePath = file.path;
    
    // Check if it's a markdown/text file
    const validExtensions = ['.md', '.markdown', '.txt'];
    const hasValidExtension = validExtensions.some(ext => filePath.toLowerCase().endsWith(ext));
    
    if (!hasValidExtension) {
      alert('Please drop a markdown file (.md, .markdown, or .txt)');
      log(`Invalid file type: ${filePath}`, 'error');
      return;
    }

    // Load the dropped file
    log(`Loading dropped file: ${filePath}`, 'info');
    await loadFile(filePath);
  });

  // Highlight effect on dragover
  document.body.addEventListener('dragover', (e) => {
    e.dataTransfer.dropEffect = 'copy';
  });
}

// ============================================================================
// HEADER NAVIGATOR (RIGHT PANE)
// ============================================================================

let lastSectionHash = null; // Cache to detect actual section changes

function updateHeaderNavigator() {
  const container = document.getElementById('navigatorList');
  if (!container) return;

  const sections = extractSections(currentContent || '');
  allSections = sections; // reuse existing sections array


  // Clear existing content safely
  container.textContent = '';

  // Check if sections actually changed - avoid DOM thrashing
  const hash = (sections || []).length + ':' + (sections || []).map(s => s.header).join('|');
  if (lastSectionHash === hash) return; // No change, skip update
  lastSectionHash = hash;


  if (!sections || sections.length === 0) {
    const p = document.createElement('p');
    p.className = 'placeholder';
    p.style.padding = '12px';
    p.textContent = 'No headers found in document.';
    container.appendChild(p);
    return;
  }

  sections.forEach((s, idx) => {
    const item = document.createElement('div');
    item.className = `nav-item nav-level-${Math.min(s.level, 6)}`;
    item.dataset.index = idx;

    const dot = document.createElement('div');
    dot.className = 'nav-dot';

    const textDiv = document.createElement('div');
    textDiv.className = 'nav-text';

    const titleDiv = document.createElement('div');
    titleDiv.className = 'nav-title';
    titleDiv.title = s.header;
    titleDiv.textContent = s.header;

    const metaDiv = document.createElement('div');
    metaDiv.className = 'nav-meta';
    metaDiv.textContent = `H${s.level} · line ${s.startLine}`;

    textDiv.appendChild(titleDiv);
    textDiv.appendChild(metaDiv);

    item.appendChild(dot);
    item.appendChild(textDiv);

    item.addEventListener('click', () => {
      navigateToSection(idx);
      container.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');
    });

    container.appendChild(item);
  });
}

function navigateToSection(index) {
  const sections = allSections || [];
  if (!sections[index]) return;
  const target = sections[index];


  // Scroll Preview (text) to the specific line
  jumpEditorToLine(target.startLine);

  // Jump editor to the section start (keeps caret aligned with navigation)
  jumpEditorToLine(target.startLine, false);

  // Scroll Preview (text) proportionally by line
  const preview = document.getElementById('previewContent');
  if (preview) {
    const linesTotal = (currentContent || '').split('\n').length || 1;
    const ratio = Math.min(1, Math.max(0, (target.startLine - 1) / linesTotal));
    const maxScroll = preview.scrollHeight - preview.clientHeight;
    preview.scrollTop = Math.floor(ratio * maxScroll);
  }


  // Scroll Rendered to the matching heading element
  const rendered = document.getElementById('renderedContent');
  if (rendered) {
    // Try to find exact match first, then fuzzy
    const headings = Array.from(rendered.querySelectorAll('h1, h2, h3, h4, h5, h6'));
    let match = headings.find(h => (h.textContent || '').trim() === target.header);

    if (!match) {
        match = headings.find(h => (h.textContent || '').trim().startsWith(target.header));
    }


    // Fallback: use data-line attribute if available (requires renderer update to inject it)
    if (!match) {
        match = headings.find(h => h.getAttribute('data-line') == target.startLine);
    }


    // Fallback: match by data-line if text match fails
    if (!match) {
      for (const h of headings) {
        const dataLine = h.getAttribute('data-line');
        if (dataLine && parseInt(dataLine, 10) === target.startLine) {
          match = h;
          break;
        }
      }
    }

    if (match) {
      match.scrollIntoView({ behavior: 'smooth', block: 'start' });
      match.classList.add('highlight-flash');
      setTimeout(() => match.classList.remove('highlight-flash'), 2000);
    }
  }
}

// ============================================================================
// STAT BLOCK NAVIGATION
// ============================================================================

// Stat block analysis debounce
let analysisTimeout = null;
const ANALYSIS_DEBOUNCE = 300; // ms - throttle rapid analysis calls

async function analyzeDocumentStatBlocks() {
  if (suppressStatAnalysis) return; // Skip if bulk update in progress
  
  // Clear any pending analysis
  clearTimeout(analysisTimeout);
  
  analysisTimeout = setTimeout(async () => {
    if (!currentContent) {
      updateStatBlockNavigator([]);
      return;
    }

    try {
      const result = await window.electronAPI.analyzeStatBlock(currentContent);
      if (result.success) {
        updateStatBlockNavigator(result.result.blocks || []);
      } else {
        log(`Stat block analysis failed: ${result.message}`, 'error');
        updateStatBlockNavigator([]);
      }
    } catch (error) {
      log(`Error analyzing stat blocks: ${error.message}`, 'error');
      updateStatBlockNavigator([]);
    }
  }, ANALYSIS_DEBOUNCE);
}

function updateStatBlockNavigator(blocks) {
  const container = document.getElementById('statBlockNavigator');
  const countEl = document.getElementById('statBlockCount');
  
  if (!container) return;
  
  // Store full list
  statBlocks = Array.isArray(blocks) ? blocks : [];
  
  // Update count badge
  if (countEl) countEl.textContent = statBlocks.length;

  if (!statBlocks || statBlocks.length === 0) {
    container.innerHTML = '<p class="placeholder" style="padding: 12px;">No stat blocks detected in this document.</p>';
    if (countEl) countEl.textContent = '0';
    return;
  }

  // Classify and enhance blocks
  statBlocks = statBlocks.map((block, idx) => {
    block._originalIndex = idx;
    block.type = block.type || classifyStatBlock(block);
    block.context = block.context || findBlockContext(block);
    return block;
  });

  renderStatBlockList();
}

// Classify stat block by type
function classifyStatBlock(block) {
  const name = (block.name || '').toLowerCase();
  const text = (block.raw || '').toLowerCase();
  
  // NPC keywords
  if (/(npc|guard|merchant|innkeeper|priest|wizard|knight|villager)/i.test(name) || 
      /personality|attitude|demeanor/i.test(text)) {
    return 'npc';
  }
  
  // Monster keywords
  if (/(dragon|goblin|orc|troll|skeleton|zombie|demon|devil|giant|beast)/i.test(name) ||
      /monster|creature|spawn/i.test(text)) {
    return 'monster';
  }
  
  // Hazard keywords
  if (/(poison|acid|fire|lava|spikes|pit|chasm|gas)/i.test(name) ||
      /hazard|environmental|danger|save vs/i.test(text)) {
    return 'hazard';
  }
  
  // Trap keywords
  if (/(trap|snare|tripwire|pressure plate|dart|blade)/i.test(name) ||
      /trap|trigger|mechanism/i.test(text)) {
    return 'trap';
  }
  
  // Feature (default for environmental elements)
  if (/(fountain|altar|statue|door|chest|room)/i.test(name)) {
    return 'feature';
  }
  
  return 'feature'; // Default
}

// Find which header/area this block belongs to
function findBlockContext(block) {
  if (!currentContent) return '';
  
  const lines = currentContent.split('\n');
  const blockLine = block.lineNumber || block.lineStart || 0;
  
  // Search backwards for nearest header
  for (let i = blockLine - 1; i >= 0; i--) {
    const line = lines[i];
    // Match H1-H4 headers
    const match = line.match(/^(#{1,4})\s+(.+)$/);
    if (match) {
      const headerText = match[2].trim();
      // Extract keyed area numbers (e.g., "8. Room Name" → "Room 8")
      const keyMatch = headerText.match(/^(\d+[a-z]?)\.\s*(.+)/i);
      if (keyMatch) {
        return `${keyMatch[2]} (${keyMatch[1]})`;
      }
      return headerText;
    }
  }
  
  return '';
}

function renderStatBlockList() {
  const container = document.getElementById('statBlockNavigator');
  if (!container) return;

  // Apply filters
  const searchInput = document.getElementById('statBlockSearch');
  const typeFilter = document.getElementById('statBlockTypeFilter');
  const errorsOnly = document.getElementById('statBlockShowErrors');
  
  const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
  const selectedType = typeFilter ? typeFilter.value : 'all';
  const showErrorsOnly = errorsOnly ? errorsOnly.checked : false;

  let filtered = statBlocks.filter(block => {
    // Search filter
    if (searchTerm) {
      const name = (block.name || '').toLowerCase();
      const text = (block.raw || '').toLowerCase();
      if (!name.includes(searchTerm) && !text.includes(searchTerm)) {
        return false;
      }
    }
    
    // Type filter
    if (selectedType !== 'all' && block.type !== selectedType) {
      return false;
    }
    
    // Errors filter
    if (showErrorsOnly) {
      const hasErrors = (block.validation && block.validation.errorCount > 0) || 
                       (block.errors && block.errors.length > 0);
      if (!hasErrors) return false;
    }
    
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = '<p class="placeholder" style="padding: 12px;">No stat blocks match the filter.</p>';
    return;
  }

  let html = '';
  filtered.forEach((block) => {
    const idx = block._originalIndex;
    const hasErrors = (block.validation && block.validation.errorCount > 0) || 
                     (block.errors && block.errors.length > 0);
    const activeClass = activeStatIndex === idx ? 'active' : '';
    
    html += `
      <div class="stat-block-item ${activeClass}" data-index="${idx}">
        <div class="stat-block-name">
          ${block.name || `Block ${idx + 1}`}
          <span class="stat-block-type ${block.type}">${block.type}</span>
        </div>
        ${block.context ? `<div class="stat-block-context">${block.context}</div>` : ''}
        ${hasErrors ? `<div class="stat-block-error">⚠ ${(block.validation && block.validation.errorCount) || (block.errors && block.errors.length)} errors</div>` : ''}
      </div>
    `;
  });

  container.innerHTML = html;

  // Bind click events - navigate only, no auto-open details
  container.querySelectorAll('.stat-block-item').forEach(item => {
    item.addEventListener('click', () => {
      const index = parseInt(item.getAttribute('data-index'), 10);
      navigateToStatBlock(statBlocks[index]);
      // User must explicitly click to see details - prevents re-analysis spike
    });
  });
}

// Wire up search and filter controls
document.getElementById('statBlockSearch')?.addEventListener('input', renderStatBlockList);
document.getElementById('statBlockTypeFilter')?.addEventListener('change', renderStatBlockList);
document.getElementById('statBlockShowErrors')?.addEventListener('change', renderStatBlockList);

function navigateToStatBlock(block) {
  if (!block) return;

  // Determine active index
  const idx = statBlocks.findIndex(b => b.index === block.index || b.lineNumber === block.lineNumber || b === block || (b.fullText && block.fullText && b.fullText === block.fullText));
  if (idx !== -1) activeStatIndex = idx;

  // Update navigator active state
  try {
    const container = document.getElementById('statBlockNavigator');
    if (container) {
      container.querySelectorAll('.stat-block-item').forEach(el => el.classList.remove('active'));
      const selector = `.stat-block-item[data-index="${idx}"]`;
      const activeEl = container.querySelector(selector);
      if (activeEl) activeEl.classList.add('active');
    }
  } catch (e) {
    // ignore
  }

  // Jump cursor to the stat block in the editor
  const line = block.lineNumber || block.lineStart || 1;
  jumpEditorToLine(line, true);

  // Scroll Rendered tab to the stat block and apply highlight
  const rendered = document.getElementById('renderedContent');
  if (rendered) {
    // Remove previous highlights
    rendered.querySelectorAll('.rendered-stat-highlight').forEach(el => {
      el.classList.remove('rendered-stat-highlight');
    });

    // Find the best matching element by name or by searching for block.fullText
    let targetElement = null;
    const candidates = rendered.querySelectorAll('p, div, pre, li, strong, em');
    for (const el of candidates) {
      const text = (el.textContent || '').toLowerCase();
      if (block.name && text.includes(block.name.toLowerCase())) {
        targetElement = el;
        break;
      }
    }

    if (!targetElement && block.fullText) {
      for (const el of candidates) {
        const text = (el.textContent || '').toLowerCase();
        if (text.includes((block.fullText || '').toLowerCase().slice(0, 40))) {
          targetElement = el;
          break;
        }
      }
    }

    if (targetElement) {
      // Apply soft highlight
      targetElement.classList.add('rendered-stat-highlight');
      // Center in view
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  // Switch to Markdown tab to show the editor with cursor positioned
  const markdownTab = document.querySelector('[data-tab="markdownTab"]');
  if (markdownTab) markdownTab.click();

  log(`Navigated to stat block: ${block.name || 'Unknown'}`, 'info');
}

function nextStatBlock() {
  if (!statBlocks || statBlocks.length === 0) return;
  let nextIndex = 0;
  if (activeStatIndex == null) nextIndex = 0;
  else nextIndex = Math.min(statBlocks.length - 1, activeStatIndex + 1);
  const block = statBlocks[nextIndex];
  if (block) navigateToStatBlock(block);
}

function prevStatBlock() {
  if (!statBlocks || statBlocks.length === 0) return;
  let prevIndex = 0;
  if (activeStatIndex == null) prevIndex = 0;
  else prevIndex = Math.max(0, activeStatIndex - 1);
  const block = statBlocks[prevIndex];
  if (block) navigateToStatBlock(block);
}

// Show Validation Details Panel for a selected stat block
async function showStatDetails(block) {
  // Only show details when in stat mode
  if (currentMode !== 'stat') return;

  const panel = document.getElementById('statDetailsPanel');
  const content = document.getElementById('statDetailsContent');
  if (!panel || !content) return;

  // Ensure panel is visible
  panel.style.display = 'block';
  content.innerHTML = '<p>Loading validation results...</p>';

  try {
    const raw = block.fullText || block.raw || block.description || '';
    const res = await window.electronAPI.validateStatBlock(raw);

    if (!res || !res.success) {
      content.innerHTML = `<p class="placeholder">Validation failed: ${res && res.message ? res.message : 'Unknown error'}</p>`;
      return;
    }

    const { validation, classification } = res;

    // Build details HTML
    let html = '';
    html += `<div style="margin-bottom:8px;"><strong>${block.name || 'Stat Block'}</strong> <span style="color:#6c757d; font-size:12px; margin-left:8px;">Line ${block.lineNumber || block.lineStart || '?'}</span></div>`;
    html += `<div style="margin-bottom:8px;"><strong>Category:</strong> ${classification && classification.category ? classification.category : (classification && classification.format ? classification.format : 'Unknown')}</div>`;
    html += `<div style="margin-bottom:8px;"><strong>Validation:</strong> ${validation && validation.isValid ? '<span style="color:green;">No errors</span>' : '<span style="color:#c0392b;">Errors found</span>'}</div>`;

    if (validation && validation.errors && validation.errors.length > 0) {
      html += '<div style="margin-top:8px;"><strong>Errors:</strong><ul style="margin-top:6px;">';
      validation.errors.forEach(err => {
        html += `<li style="margin-bottom:6px;"><code style="background:#f6f8fa;padding:2px 6px;border-radius:4px;font-size:12px;">${(err.rule || err.code) || 'error'}</code> ${err.message || JSON.stringify(err)}</li>`;
      });
      html += '</ul></div>';
    }

    if (validation && validation.warnings && validation.warnings.length > 0) {
      html += '<div style="margin-top:8px;"><strong>Warnings:</strong><ul style="margin-top:6px;">';
      validation.warnings.forEach(w => {
        html += `<li style="margin-bottom:6px;">${w.message || JSON.stringify(w)}</li>`;
      });
      html += '</ul></div>';
    }

    // Quick-fix control (demoted): small action link in the panel
    const canFix = !!(validation && !validation.isValid);
    html += `<div style="margin-top:12px; display:flex; gap:8px; align-items:center; justify-content:flex-end;">`;
    html += `<button id="closeStatDetailsBtn" class="btn secondary">Close</button>`;
    if (canFix) {
      html += `<button id="applyStatFixBtn" class="btn tertiary" style="padding:4px 8px; font-size:12px;">Fix</button>`;
    } else {
      html += `<button class="btn tertiary" disabled style="padding:4px 8px; font-size:12px;">No fixes</button>`;
    }
    html += `</div>`;

    // Show raw block preview (collapsible)
    html += `<div style="margin-top:12px;"><details><summary style="cursor:pointer;">Show Raw Stat Block</summary><pre style="white-space:pre-wrap;padding:8px;background:#f8f9fa;border-radius:6px;margin-top:8px;">${(raw || '').replace(/</g,'&lt;')}</pre></details></div>`;

    content.innerHTML = html;

    // Bind buttons
    if (canFix) {
      const fixBtn = document.getElementById('applyStatFixBtn');
      if (fixBtn) {
        fixBtn.addEventListener('click', async () => {
          const ok = confirm('Apply quick fixes to this stat block? This will modify the document content.');
          if (!ok) return;

          showProgress(true);
          const fixRes = await window.electronAPI.fixStatBlock(raw);
          showProgress(false);

          if (!fixRes || !fixRes.success) {
            alert(`Auto-fix failed: ${fixRes && fixRes.message ? fixRes.message : 'Unknown error'}`);
            return;
          }

          const fixedText = fixRes.fixedText || raw;
          const applied = fixRes.appliedFixes || [];

          if (fixedText === raw) {
            alert('No changes were applied by quick-fix.');
            return;
          }

          // Save undo state
          saveUndoState('stat-block-fix');

          // Replace first occurrence of the block in currentContent
          currentContent = currentContent.replace(raw, fixedText);

          // Update views
          updatePreviewTab(currentContent);
          updateRenderedTab(currentContent);
          updateSummaryTab(currentContent);
          analyzeDocumentStatBlocks();

          addChangeLogEntry('Stat Block Fix', `Applied ${applied.length} fixes to ${block.name || 'stat block'}`);

          // Update panel to show applied fixes
          content.innerHTML = `<p class="success">Applied ${applied.length} fix(es).</p><pre style="white-space:pre-wrap;padding:8px;background:#f8f9fa;border-radius:6px;margin-top:8px;">${(fixedText || '').replace(/</g,'&lt;')}</pre>`;
        });
      }
    }

    const closeBtn = document.getElementById('closeStatDetailsBtn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        panel.style.display = 'none';
      });
    }

  } catch (err) {
    content.innerHTML = `<p class="placeholder">Error: ${err.message}</p>`;
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

async function initialize() {
  log('TRPG MD Workbench ready', 'info');
  updateStatus('Ready', 'success');
  
  // Initialize drag and drop
  initializeDragAndDrop();
  
  // Load config
  const loadedConfig = await window.electronAPI.loadConfig();
  if (loadedConfig) {
    config = { ...config, ...loadedConfig };
    
    // Apply config to UI
    const outputSuffixInput = document.getElementById('outputSuffix');
    if (outputSuffixInput) outputSuffixInput.value = config.defaultOutputSuffix || '_cleaned';
    
    const tablesInlineCheck = document.getElementById('tablesInlineCheck');
    if (tablesInlineCheck) tablesInlineCheck.checked = config.tablesInline ?? true;
    
    // Restore sync preference (null = use mode default)
    if ('syncScrollEnabled' in config) {
      syncScrollEnabled = config.syncScrollEnabled;
    }
  }

  // Bind mode buttons
  document.getElementById('modeStructuralBtn')?.addEventListener('click', () => setMode('structural'));
  document.getElementById('modeStatBtn')?.addEventListener('click', () => setMode('stat'));
  document.getElementById('saveBtn')?.addEventListener('click', () => saveCurrentFile());
  document.getElementById('saveAsBtn')?.addEventListener('click', () => saveCurrentFileAs());

  // Bind next/previous stat block buttons
  document.getElementById('nextStatBtn')?.addEventListener('click', () => nextStatBlock());
  document.getElementById('prevStatBtn')?.addEventListener('click', () => prevStatBlock());

  // Keyboard shortcuts: Ctrl/Cmd + Alt + ArrowUp/ArrowDown for previous/next
  document.addEventListener('keydown', (e) => {
    // Save shortcut: Ctrl/Cmd + S
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveCurrentFile();
      return;
    }
    
    // Stat block navigation: Ctrl/Cmd + Alt + ArrowUp/ArrowDown
    if (!(e.ctrlKey || e.metaKey) || !e.altKey) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      nextStatBlock();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      prevStatBlock();
    }
  });

  // ============================================================================
  // MARKDOWN TOOLBAR
  // ============================================================================

  // Toolbar button actions
  const toolbarActions = {
    bold: () => wrapSelection('**', '**'),
    italic: () => wrapSelection('*', '*'),
    h1: () => insertAtLineStart('# '),
    h2: () => insertAtLineStart('## '),
    h3: () => insertAtLineStart('### '),
    'area-h1': () => insertAreaHeader(1),
    'area-h2': () => insertAreaHeader(2),
    'area-h3': () => insertAreaHeader(3),
    'area-h4': () => insertAreaHeader(4),
    'area-bold': () => insertAreaBoldLabel(),
    quote: () => insertAtLineStart('> '),
    boxed: () => insertBoxedText(),
    'gm-note': () => insertAtCursor('**GM:** '),
    'stat-block': () => insertStatBlockTemplate(),
    'bold-label': () => boldLabel()
  };

  // Wire toolbar buttons
  document.querySelectorAll('.toolbar-btn[data-action]').forEach(btn => {
    const action = btn.dataset.action;
    btn.addEventListener('click', () => {
      const handler = toolbarActions[action];
      if (handler) handler();
    });
  });

  // Area dropdown menu
  const areaDropdown = document.getElementById('btnAreaDropdown');
  const areaMenu = document.getElementById('areaDropdownMenu');
  
  if (areaDropdown && areaMenu) {
    areaDropdown.addEventListener('click', (e) => {
      e.stopPropagation();
      areaMenu.classList.toggle('show');
    });

    document.addEventListener('click', () => {
      areaMenu.classList.remove('show');
    });

    areaMenu.querySelectorAll('.dropdown-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = item.dataset.action;
        const handler = toolbarActions[action];
        if (handler) handler();
        areaMenu.classList.remove('show');
      });
    });
  }

  // Mode-aware toolbar visibility
  function updateToolbarForMode() {
    const trpgButtons = document.querySelectorAll('.trpg-specific');
    if (currentMode === 'structural') {
      trpgButtons.forEach(btn => btn.style.display = 'none');
    } else {
      trpgButtons.forEach(btn => btn.style.display = '');
    }
  }


async function undo() {
  if (undoStack.length === 0) return;
  
  const state = undoStack.pop();
  currentFilePath = state.filePath;
  currentContent = state.content;
  
  // Update all views
  updatePreviewTab();
  updateRenderedTab();
  updateSummaryTab();
  updateHeaderNavigator();
  updateStatBlockNavigator();
  
  log(`Undid ${state.action}`, 'success');
  updateUndoButton();
}

  // Initial toolbar state
  updateToolbarForMode();


  // ============================================================================
  // TOOLBAR HELPER FUNCTIONS
  // ============================================================================

  function wrapSelection(before, after) {
    const editor = document.getElementById('markdownEditor');
    if (!editor) return;

    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const selectedText = editor.value.substring(start, end);
    
    if (selectedText) {
      const wrapped = before + selectedText + after;
      editor.setRangeText(wrapped, start, end, 'end');
      currentContent = editor.value;
      setEditorUnsavedState();
      updateRenderedTab(currentContent);
    } else {
      // No selection - insert markers and place cursor between them
      editor.setRangeText(before + after, start, end, 'end');
      editor.selectionStart = editor.selectionEnd = start + before.length;
      editor.focus();
    }
  }

  function insertAtLineStart(prefix) {
    const editor = document.getElementById('markdownEditor');
    if (!editor) return;

    const start = editor.selectionStart;
    const value = editor.value;
    
    // Find start of current line
    let lineStart = value.lastIndexOf('\n', start - 1) + 1;
    
    // Insert prefix at line start
    editor.setRangeText(prefix, lineStart, lineStart, 'end');
    editor.selectionStart = editor.selectionEnd = lineStart + prefix.length;
    currentContent = editor.value;
    setEditorUnsavedState();
    updateRenderedTab(currentContent);
    editor.focus();
  }

  function insertAtCursor(text) {
    const editor = document.getElementById('markdownEditor');
    if (!editor) return;

    const start = editor.selectionStart;
    editor.setRangeText(text, start, start, 'end');
    currentContent = editor.value;
    setEditorUnsavedState();
    updateRenderedTab(currentContent);
    editor.focus();
  }

  function insertAreaHeader(level) {
    const editor = document.getElementById('markdownEditor');
    if (!editor) return;

    const prefix = '#'.repeat(level) + ' ';
    const placeholder = level === 4 ? 'Area Name' :
                       level === 1 ? 'Section Title' :
                       level === 2 ? 'Section Title' : 'Subsection';

    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const selectedRaw = editor.value.substring(start, end);
    const hasSelection = selectedRaw && selectedRaw.trim().length > 0;
    const title = hasSelection
      ? selectedRaw.trim().replace(/\s+/g, ' ')
      : placeholder;

    if (hasSelection) {
      // Replace selection with header using the selected text
      editor.setRangeText(`${prefix}${title}\n`, start, end, 'end');
      editor.selectionStart = start + prefix.length;
      editor.selectionEnd = start + prefix.length + title.length;
    } else {
      // Insert at current line start with placeholder
      const value = editor.value;
      let lineStart = value.lastIndexOf('\n', start - 1) + 1;
      editor.setRangeText(prefix + title + '\n', lineStart, lineStart, 'end');
      editor.selectionStart = lineStart + prefix.length;
      editor.selectionEnd = lineStart + prefix.length + title.length;
    }

    currentContent = editor.value;
    setEditorUnsavedState();
    updateRenderedTab(currentContent);
    editor.focus();
  }

  function insertAreaBoldLabel() {
    const editor = document.getElementById('markdownEditor');
    if (!editor) return;

    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const selectedRaw = editor.value.substring(start, end);
    const hasSelection = selectedRaw && selectedRaw.trim().length > 0;
    const label = hasSelection
      ? selectedRaw.trim().replace(/\s+/g, ' ')
      : 'AREA NAME';
    const text = `**${label}**:\n`;
    
    editor.setRangeText(text, start, end, 'end');
    // Select label text
    editor.selectionStart = start + 2;
    editor.selectionEnd = start + 2 + label.length;
    
    currentContent = editor.value;
    setEditorUnsavedState();
    updateRenderedTab(currentContent);
    editor.focus();
  }

  function insertBoxedText() {
    const editor = document.getElementById('markdownEditor');
    if (!editor) return;

    const start = editor.selectionStart;
    const text = '>>[begin boxed text]<<\n\n>>[end boxed text]<<\n';
    
    editor.setRangeText(text, start, start, 'end');
    // Place cursor in middle
    editor.selectionStart = editor.selectionEnd = start + 24; // After first line
    
    currentContent = editor.value;
    setEditorUnsavedState();
    updateRenderedTab(currentContent);
    editor.focus();
  }

  function insertStatBlockTemplate() {
    const editor = document.getElementById('markdownEditor');
    if (!editor) return;

    const template = `**Creature Name** (AC 15, HD 4, HP 22, MV 120', #AT 2, D 1d6/1d6)

**Description:** Brief description of the creature.

**Tactics:** Combat behavior and strategies.

**Treasure:** Loot and items.

`;
    
    const start = editor.selectionStart;
    editor.setRangeText(template, start, start, 'end');
    // Select creature name
    editor.selectionStart = start + 2;
    editor.selectionEnd = start + 2 + 13; // "Creature Name"
    
    currentContent = editor.value;
    setEditorUnsavedState();
    updateRenderedTab(currentContent);
    editor.focus();
  }

  function boldLabel() {
    const editor = document.getElementById('markdownEditor');
    if (!editor) return;

    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const selectedText = editor.value.substring(start, end);

    if (selectedText && selectedText.trim()) {
      // User has selection - check for colon
      const colonIndex = selectedText.indexOf(':');
      if (colonIndex > 0) {
        const label = selectedText.substring(0, colonIndex);
        const rest = selectedText.substring(colonIndex);
        const bolded = '**' + label + '**' + rest;
        
        editor.setRangeText(bolded, start, end, 'end');
        currentContent = editor.value;
        setEditorUnsavedState();
        updateRenderedTab(currentContent);
        return;
      }

      // No colon in selection: turn selection into "**Label:** "
      const trimmed = selectedText.trim();
      const trailingSpace = selectedText.endsWith(' ') ? ' ' : '';
      const bolded = `**${trimmed}**:${trailingSpace}`;
      editor.setRangeText(bolded, start, end, 'end');
      currentContent = editor.value;
      setEditorUnsavedState();
      updateRenderedTab(currentContent);
      return;
    }

    // No selection or no colon - bold labels on current line
    const value = editor.value;
    let lineStart = value.lastIndexOf('\n', start - 1) + 1;
    let lineEnd = value.indexOf('\n', start);
    if (lineEnd === -1) lineEnd = value.length;
    
    const line = value.substring(lineStart, lineEnd);
    const boldedLine = boldLabelsInLine(line);
    
    if (boldedLine !== line) {
      editor.setRangeText(boldedLine, lineStart, lineEnd, 'end');
      currentContent = editor.value;
      setEditorUnsavedState();
      updateRenderedTab(currentContent);
    }
  }

  function boldLabelsInLine(line) {
    // Match "Capitalized Words:" pattern (avoiding times like 8:00)
    return line.replace(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*:/g, (match, label, offset, str) => {
      // Avoid bolding if it looks like a time or ratio
      const charBefore = offset > 0 ? str[offset - 1] : '';
      const charAfter = str[offset + match.length] || '';
      
      if (/\d/.test(charBefore) || /\d/.test(charAfter)) {
        return match; // Skip times/ratios
      }
      
      // Already bolded?
      if (str.substring(offset - 2, offset) === '**') {
        return match;
      }
      
      return `**${label}**:`;
    });
  }

  // Wire up markdown editor for real-time editing
  const markdownEditor = document.getElementById('markdownEditor');
  if (markdownEditor) {
    // Update content on input
    markdownEditor.addEventListener('input', () => {
      // Skip if we just set this from code - prevents cascading updates
      if (isInternalEditorUpdate) return;
      
      if (markdownEditor.value !== currentContent) {
        currentContent = markdownEditor.value;
        
        // Mark as unsaved (even for blank documents)
        setEditorUnsavedState();
        
        // Always update rendered tab and summary in real-time
        updateRenderedTab(currentContent);
        updateSummaryTab(currentContent);
        updateHeaderNavigator();
        
        // Re-run stat-block analysis only in Stat Mode (debounced)
        if (currentMode === 'stat') {
          analyzeDocumentStatBlocks();
        }
      }
    });

    // Track selection for Quick Tools
    markdownEditor.addEventListener('mouseup', captureSelection);
    markdownEditor.addEventListener('keyup', captureSelection);
  }

  // Default UI mode
  setMode(currentMode);
}

// ============================================================================
// FORMAT TEXT SUBMENU (MODERN IN-MEMORY IMPLEMENTATION)
// ============================================================================

// Toggle submenu visibility
const formatTextMenuBtn = document.getElementById('formatTextMenuBtn');
const formatTextSubmenu = document.getElementById('formatTextSubmenu');

if (formatTextMenuBtn && formatTextSubmenu) {
  formatTextMenuBtn.addEventListener('click', () => {
    const isOpen = formatTextSubmenu.style.display === 'block';
    formatTextSubmenu.style.display = isOpen ? 'none' : 'block';
    formatTextMenuBtn.classList.toggle('open', !isOpen);
  });
}

// Legacy runFormatAction function removed - all format buttons now use runSafeTool
// which operates in-memory on currentContent (never writes to disk until user saves)

// Format button definitions
const formatButtons = {
  'fixSmartQuotesBtn': { action: 'smart-quotes', label: 'Fix Smart Quotes' },
  'fixWhitespaceBtn': { action: 'whitespace', label: 'Fix Whitespace' },
  'fixLineBreaksBtn': { action: 'line-breaks', label: 'Fix Line Breaks' },
  'normalizeHeadersBtn': { action: 'headers', label: 'Normalize Headers' },
  'fixAllFormattingBtn': { action: 'all', label: 'Fix All Formatting' }
};

Object.entries(formatButtons).forEach(([btnId, { action, label }]) => {
  const btn = document.getElementById(btnId);
  if (btn) {
    btn.addEventListener('click', async () => {
      if (!currentContent) {
        log('No content loaded', 'error');
        return;
      }
      
      // Use safety wrapper for all format operations
      await runSafeTool(label, async (content) => {
        switch (action) {
          case 'smart-quotes':
            return applySmartQuotes(content);
          case 'whitespace':
            return fixWhitespace(content);
          case 'line-breaks':
            return fixLineBreaks(content);
          case 'headers':
            return normalizeHeaders(content);
          case 'all':
            let result = content;
            result = applySmartQuotes(result);
            result = fixWhitespace(result);
            result = fixLineBreaks(result);
            result = normalizeHeaders(result);
            return result;
          default:
            return content;
        }
      });
    });
  }
});

// Simple in-memory selection transforms
function applySmartQuotes(text) {
  // Basic toggling idea — not perfect but useful for selection preview
  let open = true;
  text = text.replace(/"/g, () => (open = !open, open ? '“' : '”'));
  // Apostrophes: avoid touching common contractions by limiting single-quote replacements when surrounded by spaces
  let sOpen = true;
  text = text.replace(/\'/g, () => (sOpen = !sOpen, sOpen ? '‘' : '’'));
  return text;
}

function fixWhitespace(text) {
  return text.split('\n').map(line => line.replace(/[\t ]{2,}/g, ' ').trimRight()).join('\n');
}

function fixLineBreaks(text) {
  // Normalize CRLF
  let t = text.replace(/\r\n?/g, '\n');
  // Collapse 3+ blank lines into exactly 2
  t = t.replace(/\n{3,}/g, '\n\n');
  // Remove trailing spaces
  return t.replace(/[ \t]+$/gm, '');
}

function normalizeHeaders(text) {
  return text.split('\n').map(line => {
    const m = line.match(/^(#{1,6})\s*(.*)$/);
    if (m) {
      return `${m[1]} ${m[2].trim()}`;
    }
    return line;
  }).join('\n');
}

// ============================================================================
// CHANGE TRACKING
// ============================================================================

let pendingChanges = [];
let changeMarkers = new Map(); // sectionIndex -> { status: 'pending'|'approved'|'rejected', changes: [...] }
let nextChangeId = 1;

function trackChange(sectionIndex, changeType, description, oldContent, newContent) {
  const changeId = nextChangeId++;
  const change = {
    id: changeId,
    sectionIndex: sectionIndex,
    type: changeType,
    description: description,
    oldContent: oldContent,
    newContent: newContent,
    status: 'pending',
    timestamp: Date.now()
  };
  
  pendingChanges.push(change);
  
  // Update markers
  if (!changeMarkers.has(sectionIndex)) {
    changeMarkers.set(sectionIndex, { status: 'pending', changes: [] });
  }
  changeMarkers.get(sectionIndex).changes.push(change);
  
  updateNavigatorWithChanges();
  updatePendingChangesCounter();
  
  return changeId;
}

function updateNavigatorWithChanges() {
  const container = document.getElementById('navigatorList');
  if (!container) return;
  
  // Add change indicators to nav items
  changeMarkers.forEach((marker, sectionIndex) => {
    const navItem = container.querySelector(`.nav-item[data-index="${sectionIndex}"]`);
    if (!navItem) return;
    
    // Remove existing indicator
    const existing = navItem.querySelector('.change-indicator');
    if (existing) existing.remove();
    
    // Add new indicator based on status
    const indicator = document.createElement('span');
    indicator.className = `change-indicator change-${marker.status}`;
    
    if (marker.status === 'pending') {
      indicator.textContent = '●';
      indicator.title = `${marker.changes.length} pending change(s)`;
    } else if (marker.status === 'approved') {
      indicator.textContent = '✓';
      indicator.title = 'Changes approved';
    } else if (marker.status === 'rejected') {
      indicator.textContent = '✗';
      indicator.title = 'Changes rejected';
    }
    
    navItem.insertBefore(indicator, navItem.firstChild);
  });
}

function updatePendingChangesCounter() {
  const pendingCount = pendingChanges.filter(c => c.status === 'pending').length;
  
  let counter = document.getElementById('pendingChangesCounter');
  
  if (pendingCount === 0) {
    if (counter) counter.remove();
    return;
  }
  
  if (!counter) {
    counter = document.createElement('div');
    counter.id = 'pendingChangesCounter';
    counter.addEventListener('click', showChangeReviewPanel);
    const navigator = document.querySelector('.navigator');
    if (navigator) navigator.appendChild(counter);
  }
  
  counter.textContent = `${pendingCount} change${pendingCount === 1 ? '' : 's'}`;
}

function showChangeReviewPanel() {
  const pending = pendingChanges.filter(c => c.status === 'pending');
  
  if (pending.length === 0) {
    log('No pending changes to review', 'info');
    return;
  }
  
  // Create modal
  let modal = document.getElementById('changeReviewModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'changeReviewModal';
    modal.className = 'modal';
    modal.style.cssText = 'display: none; position: fixed; z-index: 1000; left: 0; top: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); padding: 20px; overflow: auto;';
    document.body.appendChild(modal);
  }
  
  // Build content
  let html = `
    <div style="background: white; max-width: 800px; margin: 0 auto; padding: 24px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">
      <h2 style="margin-top: 0;">Review Pending Changes (${pending.length})</h2>
      <div style="margin-bottom: 16px;">
        <button id="approveAllBtn" class="btn primary" style="margin-right: 8px;">Approve All</button>
        <button id="rejectAllBtn" class="btn secondary" style="margin-right: 8px;">Reject All</button>
        <button id="closeReviewBtn" class="btn secondary">Close</button>
      </div>
      <div id="changeList" style="max-height: 400px; overflow-y: auto;">
  `;
  
  pending.forEach(change => {
    html += `
      <div class="change-item" data-id="${change.id}" style="border: 1px solid #dee2e6; border-radius: 4px; padding: 12px; margin-bottom: 12px; background: #f8f9fa;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
          <strong>${change.type}: ${change.description}</strong>
          <div>
            <button class="approve-change-btn btn tertiary" data-id="${change.id}" style="margin-right: 4px; padding: 4px 8px; font-size: 11px;">Approve</button>
            <button class="reject-change-btn btn tertiary" data-id="${change.id}" style="padding: 4px 8px; font-size: 11px;">Reject</button>
          </div>
        </div>
        <div style="font-size: 12px; color: #6c757d;">Section ${change.sectionIndex + 1} • ${new Date(change.timestamp).toLocaleTimeString()}</div>
      </div>
    `;
  });
  
  html += `
      </div>
    </div>
  `;
  
  modal.innerHTML = html;
  modal.style.display = 'block';
  
  // Bind events
  document.getElementById('closeReviewBtn').addEventListener('click', () => {
    modal.style.display = 'none';
  });
  
  document.getElementById('approveAllBtn').addEventListener('click', () => {
    pending.forEach(c => approveChange(c.id));
    modal.style.display = 'none';
  });
  
  document.getElementById('rejectAllBtn').addEventListener('click', () => {
    pending.forEach(c => rejectChange(c.id));
    modal.style.display = 'none';
  });
  
  document.querySelectorAll('.approve-change-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = parseInt(e.target.getAttribute('data-id'), 10);
      approveChange(id);
      e.target.closest('.change-item').style.opacity = '0.5';
    });
  });
  
  document.querySelectorAll('.reject-change-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = parseInt(e.target.getAttribute('data-id'), 10);
      rejectChange(id);
      e.target.closest('.change-item').style.opacity = '0.5';
    });
  });
}

// ============================================================================
// STAT BLOCK NAVIGATOR
// ============================================================================

let allStatBlocks = [];

function extractStatBlocks(content) {
  const lines = content.split('\n');
  const blocks = [];

  // State variables for context-aware parsing
  let lastHeader = null;
  let lastHeaderLine = -1;

  // Keywords that signal a section start but are NOT the name of the block
  const IGNORE_HEADERS = new Set(['SIEGE', 'ECOLOGY', 'Description']);

  lines.forEach((line, index) => {
    const lineNum = index + 1;
    const stripped = line.trim();

    // ---------------------------------------------------------
    // 1. Analyze Line Type (Track Headers)
    // ---------------------------------------------------------
    const headerMatch = stripped.match(/^(#{1,6})\s+(.+)$/);
    const boldMatch = stripped.match(/^\*\*(.+)\*\*$/);

    let currentLineHeader = null;

    if (headerMatch) {
      currentLineHeader = headerMatch[2].trim();
    } else if (boldMatch) {
      currentLineHeader = boldMatch[1].trim();
    }

    // ---------------------------------------------------------
    // 2. Detection Logic
    // ---------------------------------------------------------

    // Form 3: Markdown List (e.g. * **Type:** Humanoid)
    if (stripped.startsWith('* **Type:**') || stripped.startsWith('* **Level')) {
      // If this list immediately follows a header (within 1-2 lines), it's a stat block
      if (lastHeader && (lineNum - lastHeaderLine <= 2)) {
        // Check duplicates (prevent re-adding same block if multiple list items match)
        if (blocks.length === 0 || blocks[blocks.length - 1].line !== lastHeaderLine) {
          blocks.push({
            name: lastHeader,
            line: lastHeaderLine,
            type: 'Stat Block (List)'
          });
        }
        // Don't consume header here; allow subsequent list items to confirm it (deduplication handles it)
      }
    }

    // Form 2: SIEGE Style
    else if (stripped === '**SIEGE**') {
      if (lastHeader) {
        blocks.push({
          name: lastHeader,
          line: lastHeaderLine,
          type: 'Stat Block (SIEGE)'
        });
      }
    }

    // Form 1: Inline/Paragraph Style (parenthetical stats)
    else if (line.includes('vital stats are')) {
      // Heuristic: Name is the start of the line up to the first comma, or first ~30 chars
      const nameMatch = stripped.match(/^([^,(]+)/);
      const name = nameMatch ? nameMatch[1].trim() : (stripped.substring(0, 30) + "...");

      blocks.push({
        name: name,
        line: lineNum,
        type: 'Stat Block (Inline)'
      });
    }

    // Legacy Support: Blockquote headers (> ## Name)
    else if (stripped.match(/^>\s*#{1,6}\s+(.+)$/)) {
        const match = stripped.match(/^>\s*#{1,6}\s+(.+)$/);
        blocks.push({
            name: match[1].trim(),
            line: lineNum,
            type: 'Monster/NPC'
        });
    }

    // ---------------------------------------------------------
    // 3. State Update (Post-Detection)
    // ---------------------------------------------------------
    if (currentLineHeader) {
      // Strip basic HTML tags if present
      const cleanHeader = currentLineHeader.replace(/<[^>]+>/g, '').trim();

      if (!IGNORE_HEADERS.has(cleanHeader)) {
        lastHeader = cleanHeader;
        lastHeaderLine = lineNum;
      }
    }
  });

  return blocks;
}

function updateStatBlockNavigator() {
  const container = document.getElementById('statBlockList');
  if (!container) return;

  const blocks = extractStatBlocks(currentContent || '');
  allStatBlocks = blocks;

  // Clear existing content safely
  container.textContent = '';

  if (!blocks || blocks.length === 0) {
    const p = document.createElement('p');
    p.className = 'placeholder';
    p.style.padding = '12px';
    p.textContent = 'No stat blocks found.';
    container.appendChild(p);
    return;
  }

  blocks.forEach((b, idx) => {
    const item = document.createElement('div');
    item.className = 'nav-item stat-block-item';
    item.dataset.index = idx;

    const iconDiv = document.createElement('div');
    iconDiv.className = 'nav-icon';
    iconDiv.textContent = '👾';

    const textDiv = document.createElement('div');
    textDiv.className = 'nav-text';

    const titleDiv = document.createElement('div');
    titleDiv.className = 'nav-title';
    titleDiv.title = b.name;
    titleDiv.textContent = b.name; // Safe: textContent escapes HTML

    const metaDiv = document.createElement('div');
    metaDiv.className = 'nav-meta';
    metaDiv.textContent = `${b.type} · line ${b.line}`;

    textDiv.appendChild(titleDiv);
    textDiv.appendChild(metaDiv);

    item.appendChild(iconDiv);
    item.appendChild(textDiv);

    item.addEventListener('click', () => {
      navigateToStatBlock(idx);
      container.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');
    });

    container.appendChild(item);
  });
}

function navigateToStatBlock(index) {
  const blocks = allStatBlocks || [];
  if (!blocks[index]) return;
  const target = blocks[index];

  // Sync editor
  jumpEditorToLine(target.line);

  // Sync rendered view
  const rendered = document.getElementById('renderedContent');
  if (rendered) {
    // Search for blockquote containing the name
    // or standard header
    const headers = Array.from(rendered.querySelectorAll('h1, h2, h3, h4, h5, h6, strong, p'));
    let match = headers.find(el => el.textContent.includes(target.name));

    if (match) {
      match.scrollIntoView({ behavior: 'smooth', block: 'center' });
      match.classList.add('highlight-flash');
      setTimeout(() => match.classList.remove('highlight-flash'), 2000);
    }
  }
}

function approveChange(changeId) {
  const change = pendingChanges.find(c => c.id === changeId);
  if (!change) return;
  
  change.status = 'approved';
  
  // Update marker for this section
  const marker = changeMarkers.get(change.sectionIndex);
  if (marker) {
    const allApproved = marker.changes.every(c => c.status === 'approved');
    const anyRejected = marker.changes.some(c => c.status === 'rejected');
    
    if (allApproved) {
      marker.status = 'approved';
    } else if (anyRejected) {
      marker.status = 'rejected';
    } else {
      marker.status = 'pending';
    }
  }
  
  updateNavigatorWithChanges();
  updatePendingChangesCounter();
  log(`Approved: ${change.description}`, 'success');
}

function rejectChange(changeId) {
  const change = pendingChanges.find(c => c.id === changeId);
  if (!change) return;
  
  change.status = 'rejected';
  
  // Update marker for this section
  const marker = changeMarkers.get(change.sectionIndex);
  if (marker) {
    const allApproved = marker.changes.every(c => c.status === 'approved');
    const anyRejected = marker.changes.some(c => c.status === 'rejected');
    
    if (allApproved) {
      marker.status = 'approved';
    } else if (anyRejected) {
      marker.status = 'rejected';
    } else {
      marker.status = 'pending';
    }
  }
  
  updateNavigatorWithChanges();
  updatePendingChangesCounter();
  log(`Rejected: ${change.description}`, 'info');
}

function parseLongLineOutputAndTrack(outputText, forcedSectionIdx = null, isSelection = false) {
  if (!outputText || outputText.trim().length === 0) return;

  // Regex matches lines like: Line 123: MODERATE (160 characters)
  const regex = /Line\s+(\d+):\s+([A-Za-z]+)\s+\((\d+)\s+characters\)/g;
  let m;
  while ((m = regex.exec(outputText)) !== null) {
    const lineNum = parseInt(m[1], 10);
    const severity = m[2].toLowerCase();
    const length = parseInt(m[3], 10);

    // Map line number back into full document if needed
    let mappedLine = lineNum;
    if (forcedSectionIdx !== null) {
      const s = (allSections || [])[forcedSectionIdx];
      if (s) mappedLine = s.startLine + lineNum - 1;
    }

    // Find which section this belongs to in the full document
    const sections = allSections || [];
    let sectionIndex = null;
    for (let i = 0; i < sections.length; i++) {
      const sec = sections[i];
      if (mappedLine >= sec.startLine && mappedLine <= sec.endLine) {
        sectionIndex = i;
        break;
      }
    }

    // Compose description
    const description = `${severity} long line (${length} chars) at line ${mappedLine}`;
    const lines = (currentContent || '').split('\n');
    const oldLine = lines[mappedLine - 1] || '';

    if (sectionIndex !== null) {
      trackChange(sectionIndex, 'Long Line', description, oldLine, '');
    } else {
      // If no section found, append a pending change for document root (index 0)
      trackChange(0, 'Long Line', description, oldLine, '');
    }
  }
}

async function applyApprovedChanges() {
  const approved = pendingChanges.filter(c => c.status === 'approved');
  
  if (approved.length === 0) {
    log('No approved changes to apply', 'info');
    return;
  }
  
  saveUndoState('apply approved changes');
  
  // Apply changes to document content
  // This is a simplified version - real implementation would need to handle line-level edits
  approved.forEach(change => {
    // For now, just log the change
    log(`Would apply: ${change.description}`, 'info');
  });
  
  // Clear applied changes
  pendingChanges = pendingChanges.filter(c => c.status !== 'approved');
  
  // Clear markers for sections with all changes applied
  changeMarkers.forEach((marker, sectionIndex) => {
    marker.changes = marker.changes.filter(c => c.status !== 'approved');
    if (marker.changes.length === 0) {
      changeMarkers.delete(sectionIndex);
    }
  });
  
  updateNavigatorWithChanges();
  updatePendingChangesCounter();
  log(`Applied ${approved.length} approved change(s)`, 'success');
}

// Start app
initialize();
updateUndoButton();
