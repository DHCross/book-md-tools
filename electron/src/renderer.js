// Log helper
function log(message, type = 'info') {
  const logContainer = document.getElementById('logContainer');
  const entry = document.createElement('p');
  entry.className = `log-entry ${type}`;
  const timestamp = new Date().toLocaleTimeString();
  entry.textContent = `[${timestamp}] ${message}`;
  logContainer.appendChild(entry);
  logContainer.scrollTop = logContainer.scrollHeight;
}

// State
let inputPath = null;
let outputSuffix = '_output';

// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    const tabId = btn.dataset.tab;
    document.getElementById(tabId).classList.add('active');
  });
});

// Browse input file
document.getElementById('browseInputBtn').addEventListener('click', async () => {
  const path = await window.electronAPI.openFileDialog('Select Markdown file', [
    { name: 'Markdown', extensions: ['md'] },
    { name: 'All Files', extensions: ['*'] },
  ]);
  if (path) {
    inputPath = path;
    document.getElementById('inputPath').value = path.split('/').pop();
    log(`Input: ${path}`, 'info');
    // Load file content for preview
    await loadFilePreview(path);
  }
});

// Load file preview
async function loadFilePreview(filePath) {
  const content = await window.electronAPI.readFile(filePath);
  if (content) {
    // Raw markdown preview
    document.getElementById('previewContainer').textContent = content;
    // Rendered HTML preview
    renderMarkdown(content);
  }
}

// Render markdown to HTML
function renderMarkdown(markdown) {
  const renderedContainer = document.getElementById('renderedContainer');
  
  // Simple markdown to HTML conversion (basic support)
  let html = markdown
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Headers
    .replace(/^#### (.*$)/gim, '<h4>$1</h4>')
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    // Code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Line breaks
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
  
  html = '<p>' + html + '</p>';
  renderedContainer.innerHTML = html;
}

// Output suffix
document.getElementById('outputSuffix').addEventListener('change', (e) => {
  outputSuffix = e.target.value || '_output';
});

// Run Full Pipeline
document.getElementById('runPipelineBtn').addEventListener('click', async () => {
  if (!inputPath) {
    log('Please select an input file', 'error');
    return;
  }
  log('Starting full pipeline...', 'info');
  document.getElementById('progress').classList.remove('hidden');
  const result = await window.electronAPI.runPipeline(inputPath, outputSuffix);
  log(`Pipeline: ${result.message}`, result.success ? 'success' : 'error');
  document.getElementById('progress').classList.add('hidden');
});

// Format Text
document.getElementById('formatTextBtn').addEventListener('click', async () => {
  if (!inputPath) {
    log('Please select an input file', 'error');
    return;
  }
  log('Formatting text...', 'info');
  document.getElementById('progress').classList.remove('hidden');
  const result = await window.electronAPI.formatText(inputPath, outputSuffix);
  log(`Format: ${result.message}`, result.success ? 'success' : 'error');
  document.getElementById('progress').classList.add('hidden');
});

// Fix TOC
document.getElementById('fixTocBtn').addEventListener('click', async () => {
  if (!inputPath) {
    log('Please select an input file', 'error');
    return;
  }
  log('Fixing table of contents...', 'info');
  document.getElementById('progress').classList.remove('hidden');
  const result = await window.electronAPI.fixToc(inputPath, outputSuffix);
  log(`TOC: ${result.message}`, result.success ? 'success' : 'error');
  document.getElementById('progress').classList.add('hidden');
});

// Inject Tags
document.getElementById('injectTagsBtn').addEventListener('click', async () => {
  if (!inputPath) {
    log('Please select an input file', 'error');
    return;
  }
  const outputPath = await window.electronAPI.saveFileDialog('Save tagged output as', [
    { name: 'Markdown', extensions: ['md'] },
  ]);
  if (!outputPath) return;
  log('Injecting Edmunds tags...', 'info');
  const result = await window.electronAPI.injectEdmundsTags(inputPath, outputPath);
  log(`Tags: ${result.message}`, result.success ? 'success' : 'error');
});

// Strip Tags
document.getElementById('stripTagsBtn').addEventListener('click', async () => {
  if (!inputPath) {
    log('Please select an input file', 'error');
    return;
  }
  const outputPath = await window.electronAPI.saveFileDialog('Save cleaned output as', [
    { name: 'Markdown', extensions: ['md'] },
  ]);
  if (!outputPath) return;
  log('Stripping Edmunds tags...', 'info');
  const result = await window.electronAPI.stripEdmundsTags(inputPath, outputPath);
  log(`Strip: ${result.message}`, result.success ? 'success' : 'error');
});

// Spell Check
document.getElementById('spellCheckBtn').addEventListener('click', async () => {
  if (!inputPath) {
    log('Please select an input file', 'error');
    return;
  }
  log('Running spell check...', 'info');
  const result = await window.electronAPI.spellCheck(inputPath);
  log(`Spell Check: ${result.message}`, result.success ? 'success' : 'error');
});

// Long Lines
document.getElementById('longLinesBtn').addEventListener('click', async () => {
  if (!inputPath) {
    log('Please select an input file', 'error');
    return;
  }
  log('Detecting long lines...', 'info');
  const result = await window.electronAPI.longLines(inputPath);
  log(`Long Lines: ${result.message}`, result.success ? 'success' : 'error');
});

// Paragraph Breaks
document.getElementById('pbreaksBtn').addEventListener('click', async () => {
  if (!inputPath) {
    log('Please select an input file', 'error');
    return;
  }
  log('Analyzing paragraph breaks...', 'info');
  const result = await window.electronAPI.paragraphBreaks(inputPath);
  log(`Paragraph Breaks: ${result.message}`, result.success ? 'success' : 'error');
});

// Open Output
document.getElementById('openOutputBtn').addEventListener('click', async () => {
  if (!inputPath) {
    log('No file selected yet', 'warning');
    return;
  }
  const folderPath = inputPath.substring(0, inputPath.lastIndexOf('/'));
  await window.electronAPI.openFolder(folderPath);
});

// Clear Log
document.getElementById('clearLogBtn').addEventListener('click', () => {
  const logContainer = document.getElementById('logContainer');
  logContainer.innerHTML = '';
  log('Log cleared.', 'info');
});

// Settings
document.getElementById('settingsBtn').addEventListener('click', async () => {
  log('Settings not yet implemented', 'warning');
});

// Export
document.getElementById('exportMarkdownBtn').addEventListener('click', async () => {
  log('Export not yet implemented', 'warning');
});

log('Welcome to Book MD Workbench!', 'info');
