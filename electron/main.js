const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

let mainWindow;

// Get repo root (parent of electron folder)
const REPO_ROOT = path.join(__dirname, '..');
const PYTHON_SCRIPTS = path.join(REPO_ROOT, 'scripts');
const TOOLS_DIR = path.join(REPO_ROOT, 'tools');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    center: true,
    show: false, // show when ready to avoid flashes and ensure focus
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      enableRemoteModule: false,
      nodeIntegration: false,
    },
  });

  // Always load index.html from an absolute path to avoid CWD issues
  const indexPath = path.join(__dirname, 'src', 'index.html');
  mainWindow.loadFile(indexPath);

  // Show when ready to ensure it's visible and focused
  mainWindow.once('ready-to-show', () => {
    if (!mainWindow) return;
    mainWindow.show();
    mainWindow.focus();
  });

  // Ensure reference is cleared when closed (macOS activate will recreate)
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  
  // Disable cache for development
  mainWindow.webContents.session.clearCache();
  // mainWindow.webContents.openDevTools(); // Remove this in production
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS re-create a window in the app when the dock icon is clicked
  // and there are no other windows open, or bring the existing to front
  if (mainWindow === null || BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

// Ensure single instance and focus existing window if re-launched
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// Helper: Run Python script
function runPythonScript(scriptPath, args = [], env = null) {
  return new Promise((resolve) => {
    const fullPath = path.isAbsolute(scriptPath) ? scriptPath : path.join(REPO_ROOT, scriptPath);
    const options = env ? { env } : {};
    const pythonProcess = spawn('python3', [fullPath, ...args], options);

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, message: 'Success', output: stdout, stderr });
      } else {
        resolve({ success: false, message: stderr || stdout || 'Unknown error', output: stdout, stderr });
      }
    });

    pythonProcess.on('error', (err) => {
      resolve({ success: false, message: err.message, output: '', stderr: err.message });
    });
  });
}

// IPC: Inject Edmunds Tags
ipcMain.handle('inject-tags', async (event, inputPath, outputSuffix) => {
  const outputPath = inputPath.replace(/\.(md|markdown)$/i, `${outputSuffix}.$1`);
  const result = await runPythonScript('scripts/inject_numeric_tags.py', [inputPath, '-o', outputPath]);
  return { success: result.success, message: result.message, output: outputPath };
});

// IPC: Strip Edmunds Tags
ipcMain.handle('strip-tags', async (event, inputPath, outputSuffix) => {
  const outputPath = inputPath.replace(/\.(md|markdown)$/i, `${outputSuffix}.$1`);
  const result = await runPythonScript('scripts/strip_numeric_tags.py', [inputPath, '-o', outputPath]);
  return { success: result.success, message: result.message, output: outputPath };
});

// IPC: Run Full Pipeline
ipcMain.handle('run-pipeline', async (event, inputPath, outputSuffix, tablesInline) => {
  const env = { ...process.env };
  if (tablesInline !== undefined) {
    env.TABLES_INLINE = tablesInline ? '1' : '0';
  }
  const args = [inputPath, '--out-suffix', outputSuffix];
  const result = await runPythonScript('scripts/book_pipeline.py', args, env);
  return { success: result.success, message: result.message };
});

// IPC: Format Text
ipcMain.handle('format-text', async (event, inputPath, outputSuffix) => {
  const outputPath = inputPath.replace(/\.(md|markdown)$/i, `${outputSuffix}.$1`);
  const result = await runPythonScript('scripts/fix_formatting.py', [inputPath, '-o', outputPath]);
  return { success: result.success, message: result.message, output: outputPath };
});

// IPC: Fix TOC
ipcMain.handle('fix-toc', async (event, inputPath, outputSuffix) => {
  const outputPath = inputPath.replace(/\.(md|markdown)$/i, `${outputSuffix}.$1`);
  const result = await runPythonScript('tools/fix_toc_enhanced.py', [inputPath, outputPath]);
  return { success: result.success, message: result.message, output: outputPath };
});

// IPC: Spell Check
ipcMain.handle('spell-check', async (event, inputPath) => {
  const result = await runPythonScript('tools/spell_check.py', [inputPath]);
  return { success: result.success, message: result.message };
});

// IPC: Long Lines
ipcMain.handle('long-lines', async (event, inputPath) => {
  const result = await runPythonScript('tools/long_line_detector.py', [inputPath, '--threshold', '150']);
  return { success: result.success, message: result.message };
});

// IPC: Paragraph Breaks (legacy - use Quick Tools instead)
ipcMain.handle('paragraph-breaks', async (event, inputPath, outputSuffix = '_fixed_paragraphs') => {
  const outputPath = inputPath.replace(/\.(md|markdown)$/i, `${outputSuffix}.$1`);
  const result = await runPythonScript('tools/fix_broken_paragraphs.py', [inputPath, outputPath]);
  return { success: result.success, message: result.message, output: outputPath };
});

// IPC: Quick Tools (unified handler with section support)
ipcMain.handle('run-quick-tool', async (event, tool, inputPath, outputSuffix, options = {}) => {
  const toolMap = {
    'header-depth': 'tools/markdown_header_depth_corrector.py',
    'long-line': 'tools/long_line_detector.py',
    'paragraph-break': 'tools/fix_broken_paragraphs.py',
    'spell-check': 'tools/spell_check.py'
  };
  
  const scriptPath = toolMap[tool];
  if (!scriptPath) {
    return { success: false, message: `Unknown tool: ${tool}` };
  }
  
  let actualInputPath = inputPath;
  
  // If filtered content provided (selected sections), write to temp file
  if (options.filteredContent) {
    const tempPath = inputPath.replace(/\.(md|markdown)$/i, `_temp_sections${outputSuffix}.$1`);
    try {
      fs.writeFileSync(tempPath, options.filteredContent, 'utf-8');
      actualInputPath = tempPath;
    } catch (err) {
      return { success: false, message: `Failed to create temp file: ${err.message}` };
    }
  }
  
  // Build arguments based on tool
  const args = [actualInputPath];
  
  if (tool === 'header-depth') {
    args.push('--max-depth', '4');
  } else if (tool === 'long-line') {
    args.push('--threshold', '150', '--ignore-headers', '--ignore-code');
  } else if (tool === 'paragraph-break') {
    // fix_broken_paragraphs.py needs an output file path
    const outputPath = actualInputPath.replace(/\.(md|markdown)$/i, `${outputSuffix}.$1`);
    args.push(outputPath);
  }
  
  // Run the tool
  const result = await runPythonScript(scriptPath, args);
  
  // Clean up temp file if created
  if (options.filteredContent && actualInputPath !== inputPath) {
    try {
      fs.unlinkSync(actualInputPath);
    } catch (err) {
      // Ignore cleanup errors
    }
  }
  
  return { success: result.success, message: result.message, output: result.output };
});

// IPC: Format Text Actions
ipcMain.handle('run-format-action', async (event, options) => {
  const { filePath, action } = options;
  
  if (!filePath || !action) {
    return { error: 'Missing filePath or action' };
  }
  
  // For now, return placeholder - real implementation would call appropriate scripts
  // based on action type (smart-quotes, whitespace, line-breaks, headers, all)
  return { 
    success: true, 
    message: `Format action '${action}' would run here`,
    outputPath: filePath
  };
});

// IPC: Build Headers (convert bold to ATX hierarchy)
ipcMain.handle('build-headers', async (event, inputPath, outputSuffix = '_headers', options = {}) => {
  // Handle .txt, .md, .markdown files
  const outputPath = inputPath.replace(/\.(md|markdown|txt)$/i, `${outputSuffix}.$1`);
  const args = [inputPath, '-o', outputPath];
  if (options && options.loose) {
    args.push('--loose');
  }
  
  const result = await runPythonScript('scripts/convert_to_markdown_hierarchy.py', args);
  
  if (result.success) {
    return { 
      success: true, 
      message: `Headers built successfully`,
      outputPath: outputPath,
      output: result.output
    };
  } else {
    return { 
      success: false, 
      message: result.message || 'Header building failed'
    };
  }
});

// IPC: Document Comparator
ipcMain.handle('compare-documents', async (event, doc1Path, doc2Path, options = {}) => {
  const args = [doc1Path, doc2Path];
  
  // Add threshold if specified
  if (options.threshold !== undefined) {
    args.push('--threshold', options.threshold.toString());
  }
  
  // Add format if specified
  if (options.format) {
    args.push('--format', options.format);
  }
  
  // Add output path if specified
  if (options.outputPath) {
    args.push('--output', options.outputPath);
  }
  
  // Add quiet flag for programmatic use
  args.push('--quiet');
  
  const result = await runPythonScript('tools/document_comparator.py', args);
  
  // If output file was specified, read it and return the content
  if (options.outputPath && result.success) {
    try {
      const reportContent = fs.readFileSync(options.outputPath, 'utf-8');
      return { 
        success: result.success, 
        message: result.message,
        output: result.output,
        reportContent,
        reportPath: options.outputPath
      };
    } catch (err) {
      return { 
        success: false, 
        message: `Comparison completed but failed to read report: ${err.message}`,
        output: result.output
      };
    }
  }
  
  return { 
    success: result.success, 
    message: result.message,
    output: result.output,
    stderr: result.stderr
  };
});

// ============================================================================
// TABLE TOOLS
// ============================================================================

// IPC: Convert Markdown Table to TSV
ipcMain.handle('convert-md-table-to-tsv', async (event, inputPath, options = {}) => {
  const args = [inputPath];
  
  // Add output path if specified
  if (options.outputPath) {
    args.push('-o', options.outputPath);
  }
  
  // Add no-headers flag if specified
  if (options.noHeaders) {
    args.push('--no-headers');
  }
  
  const result = await runPythonScript('tools/md_table_to_tsv.py', args);
  
  // Read the output file if it was created
  if (options.outputPath && result.success) {
    try {
      const content = fs.readFileSync(options.outputPath, 'utf-8');
      return {
        success: true,
        message: 'Conversion successful',
        output: result.output,
        content: content,
        outputPath: options.outputPath
      };
    } catch (err) {
      return {
        success: false,
        message: `Conversion completed but failed to read output: ${err.message}`
      };
    }
  }
  
  return {
    success: result.success,
    message: result.message,
    output: result.output,
    content: result.stdout || result.output,
    stderr: result.stderr
  };
});

// IPC: Convert Names to Columns
ipcMain.handle('convert-names-to-columns', async (event, inputPath, options = {}) => {
  const args = [inputPath];
  
  // Add output path if specified
  if (options.outputPath) {
    args.push('-o', options.outputPath);
  }
  
  // Add columns if specified
  if (options.columns) {
    args.push('-c', options.columns.toString());
  }
  
  const result = await runPythonScript('tools/convert_names_to_columns.py', args);
  
  // Read the output file if it was created
  if (options.outputPath && result.success) {
    try {
      const content = fs.readFileSync(options.outputPath, 'utf-8');
      return {
        success: true,
        message: 'Conversion successful',
        output: result.output,
        content: content,
        outputPath: options.outputPath
      };
    } catch (err) {
      return {
        success: false,
        message: `Conversion completed but failed to read output: ${err.message}`
      };
    }
  }
  
  return {
    success: result.success,
    message: result.message,
    output: result.output,
    stderr: result.stderr
  };
});

// IPC: Multi-Format Table Converter (in-memory, no file I/O)
ipcMain.handle('convert-table-multi-format', async (event, inputText, format) => {
  // This is a JavaScript implementation of the HTML tool's logic
  // Parse the input text and convert to requested format
  
  try {
    const lines = inputText
      .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '')
      .replace(/_/g, '')
      .replace(/:/g, '')
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean);
    
    if (lines.length === 0) {
      return { success: false, message: 'No input text provided' };
    }
    
    // Pull category
    const category = lines.shift();
    const rows = [];
    const orphans = [];
    let section = '';
    
    const valueRe = /^[+\d.]+(?:\s*to\s*[+\d.]+)?%?$/i;
    const multiplierRe = /^x\d+/i;
    const sectionHeaderRe = /multiplier/i;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const next = lines[i + 1] || '';
      
      // Section header detection
      if (/^[A-Za-z ]+$/.test(line) && sectionHeaderRe.test(next)) {
        section = line;
        i++;
        continue;
      }
      
      // Descriptor + multiplier pairing
      if (valueRe.test(next) || multiplierRe.test(next)) {
        rows.push([category, section, line, next]);
        i++;
      } else {
        orphans.push(line);
      }
    }
    
    // Prepend header row
    const data = [
      ['Category', 'Section', 'Descriptor', 'Multiplier'],
      ...rows
    ];
    
    let output = '';
    
    if (format === 'tsv') {
      output = data.map(row => row.join('\t')).join('\n');
    } else if (format === 'csv') {
      output = data.map(row => {
        return row.map(cell => {
          return cell.includes(',') ? `"${cell}"` : cell;
        }).join(',');
      }).join('\n');
    } else if (format === 'markdown') {
      if (data.length < 2) {
        return { success: false, message: 'Insufficient data for markdown table' };
      }
      
      const headers = data[0];
      const dataRows = data.slice(1);
      const cat = dataRows.length > 0 ? dataRows[0][0] : '';
      
      let markdown = `# ${cat}\n\n`;
      let currentSection = '';
      
      for (const row of dataRows) {
        const sect = row[1];
        const descriptor = row[2];
        const value = row[3];
        
        if (sect !== currentSection) {
          currentSection = sect;
          markdown += `### ${currentSection}\n\n`;
          markdown += `| ${headers[2]} | ${headers[3]} |\n`;
          markdown += `| :--- | :--- |\n`;
        }
        markdown += `| ${descriptor} | ${value} |\n`;
      }
      output = markdown;
    }
    
    return {
      success: true,
      message: 'Conversion successful',
      output: output,
      orphans: orphans.length > 0 ? orphans : null
    };
  } catch (error) {
    return {
      success: false,
      message: `Conversion error: ${error.message}`
    };
  }
});

// IPC: Select file
ipcMain.handle('select-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Markdown File',
    filters: [
      { name: 'All Files', extensions: ['*'] },
      { name: 'Markdown Files', extensions: ['md', 'markdown'] },
      { name: 'Text Files', extensions: ['txt'] }
    ],
    properties: ['openFile'],
  });
  return result.filePaths[0] || null;
});

// IPC: Select save location
ipcMain.handle('select-save-location', async (event, defaultName) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save File As',
    defaultPath: defaultName || 'output.md',
    filters: [
      { name: 'Markdown Files', extensions: ['md'] },
      { name: 'Text Files', extensions: ['txt'] },
      { name: 'All Files', extensions: ['*'] }
    ],
  });
  return result.filePath || null;
});

// IPC: Open file dialog
ipcMain.handle('open-file-dialog', async (event, title, filters) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title,
    // Ensure 'All Files' is the default filter when no explicit order is provided
    filters: (Array.isArray(filters) && filters.length)
      ? ([{ name: 'All Files', extensions: ['*'] }, ...filters.filter(f => !(f && f.extensions && f.extensions.includes('*')))])
      : [{ name: 'All Files', extensions: ['*'] }, { name: 'Markdown Files', extensions: ['md', 'markdown'] }, { name: 'Text Files', extensions: ['txt'] }],
    properties: ['openFile'],
  });
  return result.filePaths[0] || null;
});

// IPC: Save file dialog
ipcMain.handle('save-file-dialog', async (event, title, filters, defaultName) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title,
    // Prefer 'All Files' first for consistency when saving
    filters: (Array.isArray(filters) && filters.length)
      ? ([{ name: 'All Files', extensions: ['*'] }, ...filters.filter(f => !(f && f.extensions && f.extensions.includes('*')))])
      : [{ name: 'All Files', extensions: ['*'] }, { name: 'Markdown Files', extensions: ['md'] }, { name: 'Text Files', extensions: ['txt'] }],
    defaultPath: defaultName,
  });
  return result.filePath || null;
});

// IPC: Open folder
ipcMain.handle('open-folder', async (event, folderPath) => {
  const { shell } = require('electron');
  shell.openPath(folderPath);
});

// IPC: Read file
ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return content;
  } catch (err) {
    return null;
  }
});

// IPC: Save file
ipcMain.handle('save-file', async (event, filePath, content) => {
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    return { success: true, message: 'File saved successfully' };
  } catch (err) {
    return { success: false, message: err.message };
  }
});

// IPC: Load config
ipcMain.handle('load-config', async () => {
  const configPath = path.join(REPO_ROOT, 'pyproject.toml');
  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      // Basic TOML parsing for our simple config
      const config = {};
      const lines = content.split('\n');
      lines.forEach(line => {
        if (line.includes('default_output_suffix')) {
          const match = line.match(/default_output_suffix\s*=\s*"(.+)"/);
          if (match) config.defaultOutputSuffix = match[1];
        }
        if (line.includes('tables_inline')) {
          const match = line.match(/tables_inline\s*=\s*(true|false)/);
          if (match) config.tablesInline = match[1] === 'true';
        }
      });
      return config;
    }
    return null;
  } catch (err) {
    console.error('Failed to load config:', err);
    return null;
  }
});

// IPC: Save config
ipcMain.handle('save-config', async (event, config) => {
  const configPath = path.join(REPO_ROOT, 'pyproject.toml');
  try {
    let content = '';
    if (fs.existsSync(configPath)) {
      content = fs.readFileSync(configPath, 'utf-8');
    }
    
    // Update or add settings in the TOML file
    const lines = content.split('\n');
    let updated = false;
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('default_output_suffix')) {
        lines[i] = `default_output_suffix = "${config.defaultOutputSuffix || '_cleaned'}"`;
        updated = true;
      }
      if (lines[i].includes('tables_inline')) {
        lines[i] = `tables_inline = ${config.tablesInline ? 'true' : 'false'}`;
        updated = true;
      }
    }
    
    // If not found, append to [tool.book_md] section or create it
    if (!updated) {
      if (!content.includes('[tool.book_md]')) {
        lines.push('');
        lines.push('[tool.book_md]');
      }
      lines.push(`default_output_suffix = "${config.defaultOutputSuffix || '_cleaned'}"`);
      lines.push(`tables_inline = ${config.tablesInline ? 'true' : 'false'}`);
    }
    
    fs.writeFileSync(configPath, lines.join('\n'), 'utf-8');
    return { success: true, message: 'Config saved successfully' };
  } catch (err) {
    return { success: false, message: err.message };
  }
});
