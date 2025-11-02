const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Edmunds Tagging
  injectEdmundsTags: (inputPath, outputPath) =>
    ipcRenderer.invoke('inject-edmunds-tags', inputPath, outputPath),
  stripEdmundsTags: (inputPath, outputPath) =>
    ipcRenderer.invoke('strip-edmunds-tags', inputPath, outputPath),

  // Pipeline
  runPipeline: (inputPath, outputSuffix) =>
    ipcRenderer.invoke('run-pipeline', inputPath, outputSuffix),
  formatText: (inputPath, outputSuffix) =>
    ipcRenderer.invoke('format-text', inputPath, outputSuffix),
  fixToc: (inputPath, outputSuffix) =>
    ipcRenderer.invoke('fix-toc', inputPath, outputSuffix),

  // QC Tools
  spellCheck: (inputPath) =>
    ipcRenderer.invoke('spell-check', inputPath),
  longLines: (inputPath) =>
    ipcRenderer.invoke('long-lines', inputPath),
  paragraphBreaks: (inputPath) =>
    ipcRenderer.invoke('paragraph-breaks', inputPath),

  // File dialogs
  openFileDialog: (title, filters) =>
    ipcRenderer.invoke('open-file-dialog', title, filters),
  saveFileDialog: (title, filters, defaultName) =>
    ipcRenderer.invoke('save-file-dialog', title, filters, defaultName),
  openFolder: (folderPath) =>
    ipcRenderer.invoke('open-folder', folderPath),

  // File I/O
  readFile: (filePath) =>
    ipcRenderer.invoke('read-file', filePath),
});
