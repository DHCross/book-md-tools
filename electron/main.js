const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs').promises;

let mainWindow;

// Get repo root (parent of electron folder)
const REPO_ROOT = path.join(__dirname, '..');
const PYTHON_SCRIPTS = path.join(REPO_ROOT, 'scripts');
const TOOLS_DIR = path.join(REPO_ROOT, 'tools');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      enableRemoteModule: false,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile('src/index.html');
  // mainWindow.webContents.openDevTools(); // Remove this in production
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Helper: Run Python script
function runPythonScript(scriptPath, args = []) {
  return new Promise((resolve) => {
    const fullPath = path.isAbsolute(scriptPath) ? scriptPath : path.join(REPO_ROOT, scriptPath);
    const pythonProcess = spawn('python3', [fullPath, ...args]);

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
ipcMain.handle('inject-edmunds-tags', async (event, inputPath, outputPath) => {
  const result = await runPythonScript('inject_numeric_tags.py', [inputPath, '-o', outputPath]);
  return { success: result.success, message: result.message, output: outputPath };
});

// IPC: Strip Edmunds Tags
ipcMain.handle('strip-edmunds-tags', async (event, inputPath, outputPath) => {
  const result = await runPythonScript('strip_numeric_tags.py', [inputPath, '-o', outputPath]);
  return { success: result.success, message: result.message, output: outputPath };
});

// IPC: Run Full Pipeline
ipcMain.handle('run-pipeline', async (event, inputPath, outputSuffix) => {
  const result = await runPythonScript('book_pipeline.py', [inputPath, '--out-suffix', outputSuffix]);
  return { success: result.success, message: result.message };
});

// IPC: Format Text
ipcMain.handle('format-text', async (event, inputPath, outputSuffix) => {
  const outputPath = inputPath.replace(/\.md$/, `${outputSuffix}.md`);
  const result = await runPythonScript('fix_formatting.py', [inputPath, '-o', outputPath]);
  return { success: result.success, message: result.message };
});

// IPC: Fix TOC
ipcMain.handle('fix-toc', async (event, inputPath, outputSuffix) => {
  const outputPath = inputPath.replace(/\.md$/, `${outputSuffix}.md`);
  const result = await runPythonScript('book_pipeline.py', [inputPath, '--out-suffix', outputSuffix]);
  return { success: result.success, message: result.message };
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

// IPC: Paragraph Breaks
ipcMain.handle('paragraph-breaks', async (event, inputPath) => {
  const result = await runPythonScript('tools/paragraph_break_detector.py', [inputPath]);
  return { success: result.success, message: result.message };
});

// IPC: Open file dialog
ipcMain.handle('open-file-dialog', async (event, title, filters) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title,
    filters,
    properties: ['openFile'],
  });
  return result.filePaths[0] || null;
});

// IPC: Save file dialog
ipcMain.handle('save-file-dialog', async (event, title, filters, defaultName) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title,
    filters,
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
