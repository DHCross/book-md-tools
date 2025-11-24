const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // File Operations
  selectFile: () => ipcRenderer.invoke('select-file'),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  saveFile: (filePath, content) => ipcRenderer.invoke('save-file', filePath, content),
  selectSaveLocation: (defaultName) => ipcRenderer.invoke('select-save-location', defaultName),
  openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath),

  // Pipeline Operations
  runPipeline: (inputPath, outputSuffix, tablesInline) =>
    ipcRenderer.invoke('run-pipeline', inputPath, outputSuffix, tablesInline),
  formatText: (content, outputSuffix) =>
    ipcRenderer.invoke('format-text', content, outputSuffix),
  fixTOC: (content, outputSuffix) =>
    ipcRenderer.invoke('fix-toc', content, outputSuffix),

  // Edmunds Tagging
  injectTags: (content, outputSuffix) =>
    ipcRenderer.invoke('inject-tags', content, outputSuffix),
  stripTags: (content, outputSuffix) =>
    ipcRenderer.invoke('strip-tags', content, outputSuffix),

  // Quick Tools
  runQuickTool: (tool, inputPath, outputSuffix, options) =>
    ipcRenderer.invoke('run-quick-tool', tool, inputPath, outputSuffix, options),
  buildHeaders: (inputPath, outputSuffix, options) =>
    ipcRenderer.invoke('build-headers', inputPath, outputSuffix, options),
  runFormatAction: (options) =>
    ipcRenderer.invoke('run-format-action', options),

  // Document Comparator
  compareDocuments: (doc1Path, doc2Path, options) =>
    ipcRenderer.invoke('compare-documents', doc1Path, doc2Path, options),

    // Table Tools
    convertMdTableToTsv: (inputPath, options) =>
      ipcRenderer.invoke('convert-md-table-to-tsv', inputPath, options),
    convertNamesToColumns: (inputPath, options) =>
      ipcRenderer.invoke('convert-names-to-columns', inputPath, options),
    convertTableMultiFormat: (inputText, format) =>
      ipcRenderer.invoke('convert-table-multi-format', inputText, format),

  // Velocity Data
  getVelocityData: () => ipcRenderer.invoke('get-velocity-data'),

  // Config Operations
  loadConfig: () => ipcRenderer.invoke('load-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config'),

  // Stat Block Analysis
  analyzeStatBlock: (content) => ipcRenderer.invoke('analyze-stat-block', content),
  validateStatBlock: (content) => ipcRenderer.invoke('validate-stat-block', content),
  fixStatBlock: (content) => ipcRenderer.invoke('fix-stat-block', content),
  canonicalizeStatBlocks: (blocks) => ipcRenderer.invoke('canonicalize-stat-blocks', blocks),
  
  // Checkpoint Export/Import
  exportCheckpoint: (data) => ipcRenderer.invoke('export-checkpoint', data),
  importCheckpoint: () => ipcRenderer.invoke('import-checkpoint'),
  
  // Reforged Name Conversion
  loadConversionCsvs: () => ipcRenderer.invoke('load-conversion-csvs'),
});
