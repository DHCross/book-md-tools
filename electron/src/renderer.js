// ============================================================================
// STATE & CONFIGURATION
// ============================================================================

let currentFilePath = null;
let currentContent = '';
let changeLog = [];
let config = {
  defaultOutputSuffix: '_cleaned',
  tablesInline: true,
};

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
    updatePreviewTab(content);
    updateRenderedTab(content);
    updateSummaryTab(content);
    addChangeLogEntry('File Loaded', `Opened: ${filePath}`);
  } else {
    log('Failed to read file', 'error');
  }
}

function updatePreviewTab(content) {
  const preview = document.getElementById('previewContent');
  if (preview) preview.textContent = content;
}

function updateRenderedTab(content) {
  const rendered = document.getElementById('renderedContent');
  if (!rendered) return;
  
  // Use marked library for proper Markdown rendering
  if (typeof marked !== 'undefined') {
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
  if (!currentFilePath) {
    log('Please select an input file first', 'error');
    return;
  }
  
  const outputSuffix = document.getElementById('outputSuffix')?.value || config.defaultOutputSuffix;
  const tablesInline = document.getElementById('tablesInlineCheck')?.checked ?? config.tablesInline;
  
  log('Starting full pipeline...', 'info');
  updateStatus('Running pipeline...', 'processing');
  showProgress(true);
  
  const result = await window.electronAPI.runPipeline(currentFilePath, outputSuffix, tablesInline);
  
  showProgress(false);
  
  if (result.success) {
    log('Pipeline completed successfully', 'success');
    updateStatus('Pipeline complete', 'success');
    addChangeLogEntry('Pipeline', `Completed with suffix: ${outputSuffix}`);
    
    // Reload the output file
    const outputPath = currentFilePath.replace(/\.md$/, `${outputSuffix}.md`);
    await loadFile(outputPath);
  } else {
    log(`Pipeline failed: ${result.message}`, 'error');
    updateStatus('Pipeline failed', 'error');
  }
});

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

document.getElementById('fixTOCBtn')?.addEventListener('click', async () => {
  if (!currentFilePath) {
    log('Please select an input file first', 'error');
    return;
  }
  
  const outputSuffix = document.getElementById('outputSuffix')?.value || config.defaultOutputSuffix;
  
  log('Fixing table of contents...', 'info');
  updateStatus('Fixing TOC...', 'processing');
  showProgress(true);
  
  const result = await window.electronAPI.fixTOC(currentFilePath, outputSuffix);
  
  showProgress(false);
  
  if (result.success) {
    log('TOC fixed successfully', 'success');
    updateStatus('TOC fix complete', 'success');
    addChangeLogEntry('Fix TOC', `Fixed TOC with suffix: ${outputSuffix}`);
  } else {
    log(`TOC fix failed: ${result.message}`, 'error');
    updateStatus('TOC fix failed', 'error');
  }
});

// ============================================================================
// EDMUNDS TAGGING
// ============================================================================

document.getElementById('injectTagsBtn')?.addEventListener('click', async () => {
  if (!currentFilePath) {
    log('Please select an input file first', 'error');
    return;
  }
  
  const outputSuffix = document.getElementById('outputSuffix')?.value || '_tagged';
  
  log('Injecting Edmunds tags...', 'info');
  updateStatus('Injecting tags...', 'processing');
  showProgress(true);
  
  const result = await window.electronAPI.injectTags(currentFilePath, outputSuffix);
  
  showProgress(false);
  
  if (result.success) {
    log('Tags injected successfully', 'success');
    updateStatus('Tag injection complete', 'success');
    addChangeLogEntry('Inject Tags', `Added Edmunds tags with suffix: ${outputSuffix}`);
  } else {
    log(`Tag injection failed: ${result.message}`, 'error');
    updateStatus('Tag injection failed', 'error');
  }
});

document.getElementById('stripTagsBtn')?.addEventListener('click', async () => {
  if (!currentFilePath) {
    log('Please select an input file first', 'error');
    return;
  }
  
  const outputSuffix = document.getElementById('outputSuffix')?.value || '_stripped';
  
  log('Stripping Edmunds tags...', 'info');
  updateStatus('Stripping tags...', 'processing');
  showProgress(true);
  
  const result = await window.electronAPI.stripTags(currentFilePath, outputSuffix);
  
  showProgress(false);
  
  if (result.success) {
    log('Tags stripped successfully', 'success');
    updateStatus('Tag stripping complete', 'success');
    addChangeLogEntry('Strip Tags', `Removed Edmunds tags with suffix: ${outputSuffix}`);
  } else {
    log(`Tag stripping failed: ${result.message}`, 'error');
    updateStatus('Tag stripping failed', 'error');
  }
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
  if (!currentFilePath) {
    alert('Please select an input file first');
    log('No file selected', 'error');
    return;
  }

  // Always use _headers suffix for this operation
  const outputSuffix = '_headers';
  const loose = !!document.getElementById('buildHeadersLooseCheck')?.checked;
  
  log('Building header structure...', 'info');
  showProgress(true);
  updateStatus('Building headers...', 'info');

  try {
  const result = await window.electronAPI.buildHeaders(currentFilePath, outputSuffix, { loose });
    
    showProgress(false);
    
    if (result.success) {
      log(`Headers built successfully: ${result.outputPath}`, 'success');
      updateStatus('Headers built', 'success');
      
      // Load and preview the output file
      let outputContent = await window.electronAPI.readFile(result.outputPath);
      if (outputContent) {
        // Parse the output to count changes
        const originalLines = currentContent.split('\n');
        let convertedLines = outputContent.split('\n');
        let changedLines = originalLines.reduce((count, line, i) => {
          return count + (line !== convertedLines[i] ? 1 : 0);
        }, 0);

        // Auto-fallback: if strict made no changes and loose wasn't requested, retry with loose
        if (changedLines === 0 && !loose) {
          log("No changes with strict mode; retrying with 'Infer headings (no Markdown)'…", 'info');
          const resultLoose = await window.electronAPI.buildHeaders(currentFilePath, outputSuffix, { loose: true });
          if (resultLoose && resultLoose.success) {
            outputContent = await window.electronAPI.readFile(resultLoose.outputPath);
            convertedLines = (outputContent || '').split('\n');
            changedLines = originalLines.reduce((count, line, i) => count + (line !== convertedLines[i] ? 1 : 0), 0);
          }
        }

        const changeMsg = changedLines > 0 
          ? `Built headers: ${changedLines} lines updated`
          : `Built headers: no changes detected`;

        addChangeLogEntry('Build Headers', changeMsg);
        log(changeMsg, changedLines > 0 ? 'info' : 'warning');

        // Switch to the new output file
        currentFilePath = result.outputPath;
        currentContent = outputContent;
        document.getElementById('inputPath').value = result.outputPath;

        // Update all tabs with the new content
        updatePreviewTab(outputContent);
        updateRenderedTab(outputContent);
        updateSummaryTab(outputContent);

        // Show success message
        const fileName = result.outputPath.split('/').pop();
        updateStatus(`Loaded: ${fileName}`, 'success');
        log(`Switched to output file: ${fileName}`, 'info');

        // Show alert with more helpful message
        if (changedLines > 0) {
          alert(`Header structure built successfully!\n\nSwitched to: ${fileName}\nLines changed: ${changedLines}\n\nThe new file is now loaded in the editor.`);
        } else {
          const hint = "\n• If your headings aren’t bold (**Heading**), enable 'Infer headings (no Markdown)' or share a sample heading and I’ll tune the matcher";
          alert(`Build Headers completed with no changes.\n\nSwitched to: ${fileName}\n\nPossible reasons:\n• File already has proper ATX headers (# ## ###)\n• No bold headings found (**text**)\n• Bold text doesn't match detection patterns${hint}\n\nThe output file is now loaded for your review.`);
        }
      }
    } else {
      log(`Header building failed: ${result.message}`, 'error');
      updateStatus('Header building failed', 'error');
      alert(`Header building failed: ${result.message}`);
    }
  } catch (error) {
    showProgress(false);
    log(`Error: ${error.message}`, 'error');
    updateStatus('Error', 'error');
    alert(`Error: ${error.message}`);
  }
});

document.getElementById('quickToolsBtn')?.addEventListener('click', () => {
  const modal = document.getElementById('quickToolsModal');
  if (modal) modal.style.display = 'flex';
});

document.getElementById('closeQuickToolsBtn')?.addEventListener('click', () => {
  const modal = document.getElementById('quickToolsModal');
  if (modal) modal.style.display = 'none';
});

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
  
  // If sections are selected, prepare filtered content
  if (selectedSections.length > 0 && selectedSections.length < allSections.length) {
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
    
    if (options.sectionCount) {
      addChangeLogEntry('Quick Tool', `Ran ${toolName} on ${options.sectionCount} sections`);
    } else {
      addChangeLogEntry('Quick Tool', `Ran ${toolName}`);
    }
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
// INITIALIZATION
// ============================================================================

async function initialize() {
  log('Book MD Workbench ready', 'info');
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
  }
}

// Start app
initialize();
