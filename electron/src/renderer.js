// ============================================================================
// STATE & CONFIGURATION
// ============================================================================

// Velocity Context Calculator (Human Baseline Comparison)
const HUMAN_COMMITS_PER_HOUR = 0.5; // ~1 commit every 2 hours (sustainable pace)

function getVelocityContext(speed, metricType = 'commits') {
  const baseline = HUMAN_COMMITS_PER_HOUR;
  const ratio = speed / baseline;

  if (ratio > 50) {
    return { label: "🤖 AI BURST", color: "#a855f7", icon: "⚡", description: "Pure AI generation" };
  }
  if (ratio > 5) {
    return { label: `${ratio.toFixed(1)}x Human`, color: "#22c55e", icon: "🚀", description: "AI-accelerated pace" };
  }
  if (ratio >= 0.8) {
    return { label: "Human Pace", color: "#60a5fa", icon: "👤", description: "Sustainable professional pace" };
  }
  return { label: "Thinking...", color: "#9ca3af", icon: "🐢", description: "Planning/debugging phase" };
}


let currentFilePath = null;
let currentContent = '';
let savedContent = ''; // Last version written to disk
let changeLog = [];
let selectedText = ''; // Current text selection (from Preview or Rendered)
let config = {
  defaultOutputSuffix: '_cleaned',
  tablesInline: true,
  gameSystem: 'cnc',
  gameEdition: 'reforged',
};

// SMART FIND/REPLACE PATTERNS (subset from Jules prototype)
const SMART_PATTERNS = {
  'double-spaces': { pattern: '  +', flags: 'g', label: 'Double Spaces' },
  'smart-quotes': { pattern: '[“”]', flags: 'g', label: 'Smart Quotes' },
  'emdash-spacing': { pattern: '\\s+—\\s+', flags: 'g', label: 'Em Dash Spacing' },
  'broken-dice': { pattern: '\\b[Il1oO]d\\d+', flags: 'g', label: 'Broken Dice' },
  'attr-check': { pattern: '\\b(Str|Dex|Con|Int|Wis|Cha)\\s*(\\+|-)?\\d+', flags: 'gi', label: 'Attribute Check' }
};

function augmentStatBlocksFromAlphabeticalList(blocks, content) {
  if (!content) return blocks;
  const lines = content.split('\n');
  if (!lines.length) return blocks;

  const skipPrefixes = [
    'table', 'block', 'section', 'appendix', 'part', 'chapter',
    'track', 'trail', 'road', 'path', 'river', 'stream', 'lake', 'forest',
    'wood', 'hill', 'mountain', 'ravine', 'bluff', 'pier', 'bridge', 'cave',
    'lair', 'den', 'silver mine', 'mine', 'orc lair', 'lair'
  ];
  const extra = [];
  const entryPattern = /^\s*(\d+)\.\s*(.+)$/; // Allow optional space after period

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(entryPattern);
    if (!match) continue;

    let name = match[2].trim();
    if (!name) continue;

    // Trim trailing detail sections at first delimiter
    const stopIdx = [name.indexOf('('), name.indexOf(':'), name.indexOf('—'), name.indexOf('–')]
      .filter(idx => idx >= 0)
      .sort((a, b) => a - b)[0];
    if (typeof stopIdx === 'number') {
      name = name.slice(0, stopIdx).trim();
    }

    // Clean formatting and trailing commas
    name = name.replace(/[_*]+/g, '').replace(/,\s*$/, '').trim();
    if (!name || name.length < 2) continue;

    // Skip entries that look like location descriptions
    // Examples: "Silver Mine, c. 3,900 sq. ft.", "36. Treasure Room, 20x30 ft.", etc.
    if (/\b(?:\d+[,.])*\d+\s*(?:sq|square)\.?\s*(?:ft|feet)|^\d+\.\s+\w+.*\d+\s*x\s*\d+/i.test(name)) continue;

    const firstWord = name.split(/\s+/)[0].toLowerCase();
    if (skipPrefixes.includes(firstWord)) continue;

    // Use the same classification logic as main stat blocks
    const tempBlock = { name, raw: line, fullText: line };
    const type = classifyStatBlock(tempBlock);

    extra.push({
      name,
      raw: line,
      fullText: line,
      lineNumber: i + 1,
      lineStart: i + 1,
      lineEnd: i + 1,
      context: 'Alphabetical Listing',
      type
    });
  }

  return extra.length ? blocks.concat(extra) : blocks;
}

let findState = {
  matches: [],
  currentIndex: -1,
  scope: 'all',
  useRegex: false
};

// Removed Preview mode - keeping only Edit mode

// Guard flags to prevent circular updates
let isInternalEditorUpdate = false; // Set to true when we modify editor from code
let suppressStatAnalysis = false; // Set to true when doing bulk updates
let userHasClickedEditor = false; // Track if user has manually clicked into editor
let editorLineTrackingInitialized = false;
let editorContentSyncInitialized = false;
let editorSyncTimeout = null;
const EDITOR_SYNC_DEBOUNCE = 300;
let findReplaceInitialized = false;
let suppressUserFocusMark = false;
let cmEditor = null; // CodeMirror instance
let cmAdapter = null; // Adapter exposing textarea-like API

function safeUpdateHeaderNavigator() {
  if (typeof updateHeaderNavigator === 'function') {
    try { updateHeaderNavigator(); } catch (e) { console.error('updateHeaderNavigator failed', e); }
  }
}

function safeUpdateStatBlockNavigator(blocks = []) {
  if (typeof updateStatBlockNavigator === 'function') {
    try { updateStatBlockNavigator(blocks); } catch (e) { console.error('updateStatBlockNavigator failed', e); }
  }
}

function getEditorAdapter() {
  if (cmAdapter) return cmAdapter;
  return document.getElementById('markdownEditor');
}

function buildCodeMirrorAdapter() {
  if (!cmEditor) return null;
  return {
    get value() {
      return cmEditor.getValue();
    },
    set value(v) {
      cmEditor.setValue(v || '');
    },
    get selectionStart() {
      const sel = cmEditor.listSelections()[0];
      const anchor = cmEditor.indexFromPos(sel.anchor);
      const head = cmEditor.indexFromPos(sel.head);
      return Math.min(anchor, head);
    },
    get selectionEnd() {
      const sel = cmEditor.listSelections()[0];
      const anchor = cmEditor.indexFromPos(sel.anchor);
      const head = cmEditor.indexFromPos(sel.head);
      return Math.max(anchor, head);
    },
    set selectionStart(pos) {
      this.setSelectionRange(pos, pos);
    },
    set selectionEnd(pos) {
      this.setSelectionRange(pos, pos);
    },
    setSelectionRange(start, end) {
      const anchor = cmEditor.posFromIndex(start);
      const head = cmEditor.posFromIndex(end);
      cmEditor.setSelection(anchor, head);
    },
    get scrollTop() {
      return cmEditor.getScrollInfo().top;
    },
    set scrollTop(val) {
      cmEditor.scrollTo(null, val || 0);
    },
    get clientHeight() {
      return cmEditor.getScrollInfo().clientHeight;
    },
    get scrollHeight() {
      return cmEditor.getScrollInfo().height;
    },
    focus(opts) {
      cmEditor.focus();
      // preventScroll unsupported; ignore opts
    },
    blur() {
      cmEditor.getInputField().blur();
    },
    addEventListener(type, handler) {
      if (!handler) return;
      const wrapper = cmEditor.getWrapperElement();
      const map = {
        focus: 'focus',
        blur: 'blur',
        scroll: 'scroll',
        change: 'change',
        input: 'change',
        select: 'cursorActivity',
        cursorActivity: 'cursorActivity'
      };
      const cmEvent = map[type];
      if (cmEvent) {
        cmEditor.on(cmEvent, () => handler({}));
        return;
      }
      // Fallback to DOM event on wrapper for mouse/keyboard
      wrapper.addEventListener(type, handler);
    }
  };
}

function initializeCodeMirror() {
  const textarea = document.getElementById('markdownEditor');
  if (!textarea || !window.CodeMirror || cmEditor) return;
  cmEditor = CodeMirror.fromTextArea(textarea, {
    mode: 'markdown',
    lineNumbers: true,
    lineWrapping: true,
    viewportMargin: Infinity
  });
  cmAdapter = buildCodeMirrorAdapter();
}

document.addEventListener('DOMContentLoaded', initializeCodeMirror);

// Stat block navigation state
let statBlocks = [];
let activeStatIndex = null; // index within statBlocks
let activeStatStartLine = null; // Line number of currently selected stat block
let statBlockSortMode = 'alphabetical'; // 'section' or 'alphabetical' - default to alphabetical
let statFilters = { type: 'all', status: 'all', onlyErrors: false, search: '' }; // default to all
let statContextCollapsed = {};
let reviewState = {}; // reviewed flags keyed by block id

// Unified navigation context for Next/Prev
let navContext = {
  mode: 'stat-block', // 'header' or 'stat-block'
  index: 0
};

// Removed old sync code - no longer needed with Edit/Preview toggle

// Check if editor has unsaved changes
function hasUnsavedChanges() {
  return currentContent !== savedContent;
}

function computeReviewStats(blocks) {
  const eligible = blocks.filter(
    b => !b.isSynthetic && b.type !== 'feature' && b.type !== 'missing'
  );
  const reviewed = eligible.filter(b => b.reviewed);
  const monsters = eligible.filter(b => b.type === 'monster');
  const monstersReviewed = monsters.filter(b => b.reviewed);
  const npcs = eligible.filter(b => b.type === 'npc' || b.type === 'npc-named');
  const npcsReviewed = npcs.filter(b => b.reviewed);
  return {
    total: { reviewed: reviewed.length, total: eligible.length },
    monsters: { reviewed: monstersReviewed.length, total: monsters.length },
    npcs: { reviewed: npcsReviewed.length, total: npcs.length }
  };
}

function updateReviewSummary() {
  const totalEl = document.getElementById('reviewSummaryTotal');
  const monsterEl = document.getElementById('reviewSummaryMonsters');
  const npcEl = document.getElementById('reviewSummaryNPCs');
  const statusEl = document.getElementById('reviewedSummaryStatus');
  if (!totalEl || !monsterEl || !npcEl || !statusEl) return;

  const stats = computeReviewStats(statBlocks || []);
  totalEl.textContent = `Total: ${stats.total.reviewed} / ${stats.total.total}`;
  monsterEl.textContent = `Monsters: ${stats.monsters.reviewed} / ${stats.monsters.total}`;
  npcEl.textContent = `NPCs: ${stats.npcs.reviewed} / ${stats.npcs.total}`;

  if (stats.total.total === 0) {
    statusEl.textContent = 'No blocks detected yet';
  } else if (stats.total.reviewed === 0) {
    statusEl.textContent = 'No blocks reviewed yet';
  } else {
    statusEl.textContent = `Reviewed ${stats.total.reviewed} of ${stats.total.total}`;
  }
}

function initializeEditorLineTracking() {
  if (editorLineTrackingInitialized) return;
  const editor = getEditorAdapter();
  if (!editor) return;

  const markUserInteraction = () => {
    if (suppressUserFocusMark) return;
    if (!userHasClickedEditor) {
      userHasClickedEditor = true;
    }
    requestAnimationFrame(updateLineInfoDisplay);
  };

  const handleCursorMotion = () => {
    requestAnimationFrame(updateLineInfoDisplay);
  };

  ['focus', 'mousedown', 'click'].forEach(evt => {
    editor.addEventListener(evt, markUserInteraction);
  });

  ['keydown', 'keyup', 'mouseup', 'input', 'select', 'change', 'cursorActivity'].forEach(evt => {
    editor.addEventListener(evt, handleCursorMotion);
  });

  // Update visible range on scroll
  editor.addEventListener('scroll', () => {
    requestAnimationFrame(updateLineInfoDisplay);
  });

  editorLineTrackingInitialized = true;
}

function initializeEditorContentSync() {
  if (editorContentSyncInitialized) return;
  const editor = getEditorAdapter();
  if (!editor) return;

  const handleInput = () => {
    if (isInternalEditorUpdate) return; // Skip programmatic updates
    currentContent = editor.value;
    setEditorUnsavedState();

    clearTimeout(editorSyncTimeout);
    editorSyncTimeout = setTimeout(() => {
      updateRenderedTab(currentContent);
      updateSummaryTab(currentContent);
      analyzeDocumentStatBlocks();
    }, EDITOR_SYNC_DEBOUNCE);
  };

  editor.addEventListener('input', handleInput);
  editor.addEventListener('change', handleInput);

  editorContentSyncInitialized = true;
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

  // Initialize visible game system indicator
  updateSystemIndicator();
  // Initialize Find/Replace strip (Ctrl/Cmd+F or Find button)
  initFindReplace();

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
// REFORGED NAME CONVERSION
// ============================================================================

let conversionMappings = { spells: new Map(), items: new Map() };

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

async function loadConversionMappings() {
  try {
    console.log('[DEBUG] Calling loadConversionCsvs...');

    if (!window.electronAPI || !window.electronAPI.loadConversionCsvs) {
      console.error('[DEBUG] loadConversionCsvs API not available - app needs restart');
      log('Please restart the app to enable conversion feature', 'error');
      return false;
    }

    const result = await window.electronAPI.loadConversionCsvs();
    console.log('[DEBUG] CSV load result:', result);

    if (!result.success) {
      log('Failed to load conversion CSVs: ' + result.message, 'error');
      console.error('[DEBUG] CSV load error:', result.message);
      return false;
    }

    // Parse spell CSV (Original, Old New Name, New Name)
    if (result.spells) {
      const spellLines = result.spells.split('\n').slice(1); // Skip header
      for (const line of spellLines) {
        if (!line.trim()) continue;
        const parts = parseCSVLine(line);
        if (parts.length >= 3) {
          const oldName = parts[0]?.trim();
          const newName = parts[2]?.trim(); // "New Name" column
          if (oldName && newName && newName !== oldName) {
            conversionMappings.spells.set(oldName.toLowerCase(), newName);
          }
        }
      }
    }

    // Parse item CSV (Old_Name, New_Name)
    if (result.items) {
      const itemLines = result.items.split('\n').slice(1); // Skip header
      for (const line of itemLines) {
        if (!line.trim()) continue;
        const parts = parseCSVLine(line);
        if (parts.length >= 2) {
          const oldName = parts[0]?.trim();
          const newName = parts[1]?.trim();
          if (oldName && newName && newName !== oldName) {
            conversionMappings.items.set(oldName.toLowerCase(), newName);
          }
        }
      }
    }

    log(`Loaded ${conversionMappings.spells.size} spell conversions and ${conversionMappings.items.size} item conversions`, 'success');
    return true;
  } catch (error) {
    log('Error loading conversion mappings: ' + error.message, 'error');
    return false;
  }
}

function findReplacements(content) {
  const replacements = [];
  const allMappings = new Map([...conversionMappings.spells, ...conversionMappings.items]);

  for (const [oldName, newName] of allMappings) {
    // Create regex that matches the old name (case-insensitive, whole word)
    const regex = new RegExp(`\\b${oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    let match;

    while ((match = regex.exec(content)) !== null) {
      replacements.push({
        oldText: match[0], // Preserve original case
        newText: newName,
        index: match.index,
        length: match[0].length
      });
    }
  }

  // Sort by index (descending) so we can replace from end to start
  return replacements.sort((a, b) => b.index - a.index);
}

async function convertToReforged() {
  if (!currentContent) {
    log('No document loaded', 'error');
    return;
  }

  // Load mappings if not already loaded
  if (conversionMappings.spells.size === 0 && conversionMappings.items.size === 0) {
    const loaded = await loadConversionMappings();
    if (!loaded) return;
  }

  // Add manual overrides for specific cases from Gemini analysis
  const manualOverrides = new Map([
    // Potions (specific item conversions)
    ['potion of alter size', 'Potion of Diminution'],
    ['potion of cure poison', 'Potion of Delay Toxin'],
    ['potion of cure critical wounds', 'Potion of Heal Critical Wounds'],
    ['potion of cure light wounds', 'Potion of Heal Light Wounds'],

    // Protection spells - keep alignment distinctions (C&C standard)
    ['protection from good', 'Protection from Disposition'],
    ['protection from evil', 'Protection from Disposition'],
    ['protection from chaos', 'Protection from Disposition'],
    ['protection from law', 'Protection from Disposition'],

    // C&C standard terms - keep as-is
    ['turn undead', 'Turn Undead'],
    ['nerve check', 'Nerve Check'], // Custom module mechanic
    ['batrachianoid', 'Batrachianoid'], // Correct C&C term (NOT Bullywug)
    ['bullywug', 'Batrachianoid'], // Convert IP-protected term
    ['darkvision', 'Darkvision'],
    ['twilight vision', 'Twilight Vision']
  ]);

  // Merge manual overrides with CSV mappings
  const allMappings = new Map([...conversionMappings.spells, ...conversionMappings.items, ...manualOverrides]);

  const replacements = findReplacementsWithMappings(currentContent, allMappings);

  if (replacements.length === 0) {
    log('No old names found to convert', 'info');
    return;
  }

  // Show preview dialog with warnings for special cases
  let warnings = [];
  if (replacements.some(r => r.oldText.toLowerCase().includes('nerve check'))) {
    warnings.push('⚠️ "Nerve Check" is a custom module mechanic (Wisdom Save vs. Fear, CL 0) - keeping as-is');
  }
  if (replacements.some(r => r.oldText.toLowerCase().includes('batrachianoid'))) {
    warnings.push('ℹ️ "Batrachianoid" is the correct C&C term (not "Bullywug") - keeping as-is');
  }

  const message = `Found ${replacements.length} name(s) to convert:\n\n` +
    replacements.slice(0, 10).map(r => `• "${r.oldText}" → "${r.newText}"`).join('\n') +
    (replacements.length > 10 ? `\n... and ${replacements.length - 10} more` : '') +
    (warnings.length > 0 ? '\n\n' + warnings.join('\n') : '') +
    `\n\nApply these changes?`;

  if (!confirm(message)) {
    log('Conversion cancelled', 'info');
    return;
  }

  // Apply replacements (from end to start to preserve indices)
  let newContent = currentContent;
  for (const replacement of replacements) {
    newContent = newContent.substring(0, replacement.index) +
      replacement.newText +
      newContent.substring(replacement.index + replacement.length);
  }

  // Update editor
  pushUndoState('Convert to Reforged Names');
  currentContent = newContent;
  updateEditorContent(newContent);
  log(`Converted ${replacements.length} name(s) to Reforged format`, 'success');
}

function findReplacementsWithMappings(content, mappings) {
  const replacements = [];

  for (const [oldName, newName] of mappings) {
    // Create regex that matches the old name (case-insensitive, whole word)
    const regex = new RegExp(`\\b${oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    let match;

    while ((match = regex.exec(content)) !== null) {
      replacements.push({
        oldText: match[0], // Preserve original case
        newText: newName,
        index: match.index,
        length: match[0].length
      });
    }
  }

  // Sort by index (descending) so we can replace from end to start
  return replacements.sort((a, b) => b.index - a.index);
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

function updateSystemIndicator() {
  const el = document.getElementById('systemIndicatorLabel');
  if (!el) return;
  const system = config.gameSystem || 'cnc';
  const edition = config.gameEdition || 'reforged';

  let systemName = 'Castles & Crusades';
  if (system !== 'cnc') {
    systemName = system;
  }

  let editionLabel = '';
  if (system === 'cnc' && edition === 'reforged') {
    editionLabel = 'Reforged';
  } else if (edition) {
    editionLabel = edition;
  }

  el.textContent = editionLabel ? `${systemName} — ${editionLabel}` : systemName;
}

// =========================================================================
// FIND / REPLACE (Heads-Up Strip)
// =========================================================================

function initFindReplace() {
  if (findReplaceInitialized) return;
  const strip = document.getElementById('findReplaceStrip');
  if (!strip) {
    // If DOM isn't ready yet, retry once when loaded
    document.addEventListener('DOMContentLoaded', initFindReplace, { once: true });
    return;
  }
  findReplaceInitialized = true;

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      toggleFindStrip();
    }
  });

  document.getElementById('closeFindStripBtn')?.addEventListener('click', () => {
    strip.style.display = 'none';
  });

  const findInput = document.getElementById('findInput');
  const replaceInput = document.getElementById('replaceInput');
  const wholeWordToggle = document.getElementById('wholeWordCheck');
  const replaceControls = document.getElementById('replaceControls');
  const toggleReplaceBtn = document.getElementById('toggleReplaceBtn');

  // Default to whole-word matching for simpler exact hits
  if (wholeWordToggle) wholeWordToggle.checked = true;

  findInput?.addEventListener('input', () => {
    findState.matches = [];
    findState.currentIndex = -1;
    updateFindStatus('');
    const term = findInput.value.trim();
    if (term.length > 0) {
      findNext(true, false);
    }
  });

  // Enter triggers next match
  findInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      findState.currentIndex = -1;
      findNext(true, false);
    }
  });
  replaceInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      findState.currentIndex = -1;
      findNext(true, true); // keep focus in editor when replacing
    }
  });

  document.getElementById('findNextBtn')?.addEventListener('click', () => findNext(true, false));
  document.getElementById('findPrevBtn')?.addEventListener('click', () => findNext(false, false));
  document.getElementById('replaceBtn')?.addEventListener('click', replaceCurrent);
  document.getElementById('replaceAllBtn')?.addEventListener('click', executeReplaceAll);

  if (toggleReplaceBtn && replaceControls) {
    toggleReplaceBtn.addEventListener('click', () => {
      const isHidden = replaceControls.style.display === 'none';
      replaceControls.style.display = isHidden ? 'flex' : 'none';
      toggleReplaceBtn.textContent = isHidden ? 'Replace ▲' : 'Replace ▼';
    });
    // Hide replace controls by default
    replaceControls.style.display = 'none';
  }
}

function toggleFindStrip() {
  const strip = document.getElementById('findReplaceStrip');
  const input = document.getElementById('findInput');
  if (!strip) return;
  if (strip.style.display === 'flex') {
    strip.style.display = 'none';
  } else {
    strip.style.display = 'flex';
    if (input) {
      input.focus();
      input.select();
    }
  }
}

// Initialize find/replace immediately (guarded for single run)
initFindReplace();

// Wire Find button to open the strip
document.getElementById('openFindBtn')?.addEventListener('click', () => {
  initFindReplace();
  toggleFindStrip();
});

document.getElementById('prevLineBtn')?.addEventListener('click', () => {
  navigateToPrevLine();
});

function updateFindStatus(msg) {
  const input = document.getElementById('findInput');
  if (input && msg) {
    input.setAttribute('title', msg);
  }

  // Update match counter
  const counter = document.getElementById('matchCounter');
  if (counter) {
    counter.textContent = msg || '--';
    counter.className = 'match-counter';
    if (msg && msg.includes('of')) {
      counter.classList.add('has-matches');
    } else if (msg && msg.includes('No matches')) {
      counter.classList.add('no-matches');
    }
  }
}

function getSearchRanges(scope) {
  const content = currentContent || '';
  const lines = content.split('\n');
  const totalLength = content.length;

  if (scope === 'all') {
    return [{ start: 0, end: totalLength }];
  }

  if (scope === 'selection') {
    const editor = getEditorAdapter();
    if (editor && editor.selectionStart !== editor.selectionEnd) {
      return [{ start: editor.selectionStart, end: editor.selectionEnd }];
    }
    return [{ start: 0, end: totalLength }];
  }

  const ranges = [];
  const lineOffsets = [];
  let charCount = 0;
  for (let i = 0; i < lines.length; i++) {
    lineOffsets.push(charCount);
    charCount += lines[i].length + 1;
  }
  lineOffsets.push(charCount);

  if (scope === 'headers') {
    lines.forEach((line, idx) => {
      if (line.trim().startsWith('#')) {
        ranges.push({ start: lineOffsets[idx], end: lineOffsets[idx + 1] - 1 });
      }
    });
  } else if (scope === 'stat-blocks') {
    const boundaries = [
      ...statBlocks.map(b => ({ line: b.lineNumber, type: 'start' })),
      ...allSections.map(s => ({ line: s.startLine, type: 'stop' }))
    ].sort((a, b) => a.line - b.line);

    statBlocks.forEach(block => {
      const startLine = block.lineNumber;
      const startIdx = lineOffsets[startLine - 1];
      const nextBoundary = boundaries.find(b => b.line > startLine);
      const endLine = nextBoundary ? nextBoundary.line - 1 : lines.length;
      if (endLine >= startLine) {
        const endIdx = lineOffsets[endLine] - 1;
        ranges.push({ start: startIdx, end: endIdx });
      }
    });
  }

  return ranges;
}

function runSearch() {
  const findInput = document.getElementById('findInput');
  if (!findInput) return [];
  const query = findInput.value;
  if (!query) return [];

  const useRegexEl = document.getElementById('useRegexCheck');
  const useRegex = !!(useRegexEl && useRegexEl.checked);
  const caseEl = document.getElementById('caseSensitiveCheck');
  const caseSensitive = !!(caseEl && caseEl.checked);
  const wholeWordEl = document.getElementById('wholeWordCheck');
  const wholeWord = !!(wholeWordEl && wholeWordEl.checked);
  const scopeEl = document.getElementById('searchScopeSelect');
  const scope = scopeEl ? scopeEl.value : 'all';

  const text = currentContent || '';
  const ranges = getSearchRanges(scope);
  let regex;

  try {
    const flags = caseSensitive ? 'gm' : 'gmi';
    if (useRegex) {
      // For regex mode, user controls boundaries manually
      const pattern = query;
      regex = new RegExp(pattern, flags);
    } else {
      const escaped = query.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
      let pattern = escaped;
      
      if (wholeWord) {
        // Smart boundaries: only add \b if the edge is a word character
        const startBoundary = /^\w/.test(query) ? '\\b' : '';
        const endBoundary = /\w$/.test(query) ? '\\b' : '';
        pattern = `${startBoundary}${escaped}${endBoundary}`;
      }
      
      regex = new RegExp(pattern, flags);
    }
  } catch (e) {
    log('Invalid Regex', 'error');
    return [];
  }

  const matches = [];
  let match;
  regex.lastIndex = 0;

  while ((match = regex.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    const inScope = ranges.some(r => start >= r.start && end <= r.end);
    if (inScope) {
      matches.push({ start, end, text: match[0], index: matches.length });
    }
    if (match.index === regex.lastIndex) {
      regex.lastIndex++;
    }
  }

  return matches;
}

function findNext(forward = true, focusEditor = false) {
  const matches = runSearch();
  if (!matches.length) {
    updateFindStatus('No matches');
    return;
  }
  findState.matches = matches;

  if (findState.currentIndex === -1) {
    findState.currentIndex = forward ? 0 : matches.length - 1;
  } else {
    findState.currentIndex = (findState.currentIndex + (forward ? 1 : -1) + matches.length) % matches.length;
  }

  const m = matches[findState.currentIndex];
  const editor = getEditorAdapter();
  if (!editor) return;

  if (focusEditor) {
    editor.focus();
  }

  const before = (editor.value || '').slice(0, m.start);
  const lineNumber = before ? before.split('\n').length : 1;
  
  // Jump to line AND select the match (passing range ensures it persists after scroll)
  jumpEditorToLine(lineNumber, focusEditor, { start: m.start, end: m.end });
  
  updateFindStatus(`Match ${findState.currentIndex + 1} of ${matches.length}`);
}

function replaceCurrent() {
  const editor = getEditorAdapter();
  const replaceInput = document.getElementById('replaceInput');
  if (!editor || !replaceInput) return;

  if (editor.selectionStart === editor.selectionEnd) {
    findNext(true, true);
    return;
  }

  const value = editor.value;
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const replacement = replaceInput.value || '';

  editor.value = value.slice(0, start) + replacement + value.slice(end);
  currentContent = editor.value;
  jumpEditorToLine((editor.value.slice(0, start + replacement.length).match(/\n/g) || []).length + 1, true);
  updateRenderedTab(currentContent);
  updateSummaryTab(currentContent);
  updateStatus('Replaced current match', 'success');
  findNext(true, true);
}

function executeReplaceAll() {
  const matches = runSearch();
  if (!matches.length) {
    updateFindStatus('No matches to replace');
    return;
  }
  const replaceInput = document.getElementById('replaceInput');
  const editor = getEditorAdapter();
  if (!replaceInput || !editor) return;

  const replacement = replaceInput.value || '';
  let text = currentContent || '';

  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i];
    text = text.slice(0, m.start) + replacement + text.slice(m.end);
  }

  currentContent = text;
  editor.value = text;
  updateRenderedTab(currentContent);
  updateSummaryTab(currentContent);
  analyzeDocumentStatBlocks();
  updateStatus(`Replaced ${matches.length} occurrence(s)`, 'success');
  findNext(true, true);
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
  safeUpdateHeaderNavigator();
  analyzeDocumentStatBlocks();

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
      safeUpdateHeaderNavigator();
      analyzeDocumentStatBlocks();
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
  safeUpdateHeaderNavigator();
  analyzeDocumentStatBlocks();

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

// Tab switching
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
  });
});

// Removed Preview mode toggle - keeping only Edit mode

// ============================================================================
// FILE OPERATIONS
// ============================================================================

async function handleOpenFileClick() {
  if (!window.electronAPI) {
    console.error('electronAPI not available - preload script may not be loaded');
    updateStatus('Error: electronAPI not available', 'error');
    return;
  }
  
  const filePath = await window.electronAPI.selectFile();
  if (filePath) {
    currentFilePath = filePath;
    const inputPath = document.getElementById('inputPath');
    if (inputPath) inputPath.value = filePath;
    await loadFile(filePath);
    updateStatus(`Loaded: ${filePath.split('/').pop()}`, 'success');
    log(`Loaded file: ${filePath}`, 'info');

    // Switch to Editor tab
    const editorTab = document.querySelector('[data-tab="editorTab"]');
    if (editorTab) editorTab.click();
  }
}

document.getElementById('browseBtn')?.addEventListener('click', handleOpenFileClick);
document.getElementById('openFileBtn')?.addEventListener('click', handleOpenFileClick);
document.getElementById('saveBtn')?.addEventListener('click', () => {
  saveCurrentFile();
});
document.getElementById('saveAsBtn')?.addEventListener('click', () => {
  saveCurrentFileAs();
});
document.getElementById('toggleReviewSummaryBtn')?.addEventListener('click', () => {
  const container = document.getElementById('reviewSummaryContainer');
  if (!container) return;
  const isHidden = container.style.display === 'none' || container.style.display === '';
  container.style.display = isHidden ? 'block' : 'none';
});

// Save shortcuts: Ctrl/Cmd+S (save), Shift+Ctrl/Cmd+S (Save As)
document.addEventListener('keydown', (e) => {
  const isSave = (e.key === 's' || e.key === 'S') && (e.ctrlKey || e.metaKey);
  if (!isSave) return;
  e.preventDefault();
  if (e.shiftKey) {
    saveCurrentFileAs();
  } else {
    saveCurrentFile();
  }
});

// Go To Line controls
const goToLineInput = document.getElementById('goToLineInput');
const goToLineBtn = document.getElementById('goToLineBtn');

const goToLine = () => {
  if (!goToLineInput) return;
  const val = parseInt(goToLineInput.value, 10);
  if (!Number.isFinite(val) || val < 1) return;
  userHasClickedEditor = true;
  jumpEditorToLine(val, true);
};

goToLineBtn?.addEventListener('click', goToLine);
goToLineInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    goToLine();
  }
});

// Keyboard shortcut: Ctrl/Cmd+L to focus Go To input
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && (e.key === 'l' || e.key === 'L')) {
    e.preventDefault();
    if (goToLineInput) {
      goToLineInput.focus();
      goToLineInput.select();
    }
  }
});

async function loadFile(filePath) {
  initializeCodeMirror();
  if (!window.electronAPI) {
    console.error('electronAPI not available - preload script may not be loaded');
    updateStatus('Error: electronAPI not available', 'error');
    return;
  }
  
  showProgress(true);
  const content = await window.electronAPI.readFile(filePath);
  showProgress(false);

  if (content) {
    currentContent = content;
    savedContent = content; // Track saved state
    userHasClickedEditor = false; // Reset on new file load
    updateMarkdownEditor(content);
    updateRenderedTab(content);
    updateSummaryTab(content);
    safeUpdateHeaderNavigator();
    // Reset stat navigator immediately, then run full analysis
    safeUpdateStatBlockNavigator([]);
    analyzeDocumentStatBlocks();

    addChangeLogEntry('File Loaded', `Opened: ${filePath}`);
  } else {
    log('Failed to read file', 'error');
  }
}

function updateMarkdownEditor(content) {
  initializeCodeMirror();
  const editor = getEditorAdapter();
  if (editor && content !== editor.value) {
    isInternalEditorUpdate = true; // Signal that we're updating from code
    editor.value = content;
    currentContent = content; // Ensure global state is in sync
    editor.scrollTop = 0;
    isInternalEditorUpdate = false; // Reset flag
    clearEditorUnsavedState();
    updateLineInfoDisplay();
    initializeEditorLineTracking();
    initializeEditorContentSync();
    safeUpdateHeaderNavigator();
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


  // Track selection changes in Rendered
  rendered.addEventListener('mouseup', captureSelection);
  rendered.addEventListener('keyup', captureSelection);
}


// Removed old sync code - no longer needed with Edit/Preview toggle

function updateLineInfoDisplay() {
  const editor = getEditorAdapter();
  const currentLineEl = document.getElementById('lineInfoCurrent');
  const blockLineEl = document.getElementById('lineInfoBlock');

  if (!editor) return;

  // Only show current line if user has manually clicked into the editor
  if (userHasClickedEditor) {
    const pos = editor.selectionStart || 0;
    const content = cmEditor ? cmEditor.getValue() : (editor.value || '');
    const before = content.slice(0, pos);
    const lineNumber = before ? before.split('\n').length : 1;
    if (currentLineEl) currentLineEl.textContent = lineNumber;
  } else {
    if (currentLineEl) currentLineEl.textContent = '—';
  }

  if (blockLineEl) blockLineEl.textContent = activeStatStartLine ? activeStatStartLine : '—';
}

function jumpEditorToLine(lineNumber, focusEditor = true, selectionRange = null) {
  const editor = getEditorAdapter();
  if (!editor) return;

  if (cmEditor) {
    const totalLines = cmEditor.lineCount();
    const targetLine = Math.max(1, Math.min(lineNumber, totalLines));
    const contentLength = cmEditor.getValue().length;
    const hasSelection = selectionRange && typeof selectionRange.start === 'number';
    const selectionStart = hasSelection
      ? Math.max(0, Math.min(selectionRange.start, contentLength))
      : cmEditor.indexFromPos({ line: targetLine - 1, ch: 0 });
    const selectionEnd = hasSelection && typeof selectionRange.end === 'number'
      ? Math.max(selectionStart, Math.min(selectionRange.end, contentLength))
      : selectionStart;

    cmEditor.operation(() => {
      cmEditor.setSelection(cmEditor.posFromIndex(selectionStart), cmEditor.posFromIndex(selectionEnd));
      cmEditor.scrollIntoView({ line: targetLine - 1, ch: 0 }, 100);
    });
    if (focusEditor) {
      suppressUserFocusMark = true;
      cmEditor.focus();
      setTimeout(() => { suppressUserFocusMark = false; }, 50);
    }
    updateLineInfoDisplay();
    return;
  }

  const content = editor.value || '';
  const lines = content.split('\n');
  const totalLines = lines.length;
  const targetLine = Math.max(1, Math.min(lineNumber, totalLines));

  const style = window.getComputedStyle(editor);
  const lineHeight = parseFloat(style.lineHeight) || 18;
  const paddingTop = parseFloat(style.paddingTop) || 0;
  
  // Compute character offset for the start of the target line
  let offset = 0;
  for (let i = 0; i < targetLine - 1; i++) {
    offset += (lines[i]?.length || 0) + 1;
  }

  // Target scroll puts the line about 20% down from top of viewport
  const viewportOffset = editor.clientHeight * 0.2;
  const targetScroll = Math.max(0, (targetLine - 1) * lineHeight + paddingTop - viewportOffset);
  
  // Clamp to valid scroll range
  const maxScroll = editor.scrollHeight - editor.clientHeight;
  const finalScroll = Math.min(targetScroll, maxScroll);
  
  // Determine the selection we want to set (clamped to content length)
  const contentLength = content.length;
  const hasSelection = selectionRange && typeof selectionRange.start === 'number';
  const selectionStart = hasSelection
    ? Math.max(0, Math.min(selectionRange.start, contentLength))
    : offset;
  const selectionEnd = hasSelection && typeof selectionRange.end === 'number'
    ? Math.max(selectionStart, Math.min(selectionRange.end, contentLength))
    : selectionStart;

  editor.blur();
  editor.setSelectionRange(selectionStart, selectionEnd);
  editor.scrollTop = finalScroll;
  
  if (focusEditor) {
    suppressUserFocusMark = true;
    try {
      editor.focus({ preventScroll: true });
    } catch (e) {
      editor.focus();
    }
    setTimeout(() => { suppressUserFocusMark = false; }, 50);
  }

  // Double-check after focus (focus might trigger a scroll)
  const enforceScroll = (attempt = 0) => {
    requestAnimationFrame(() => {
      const drift = Math.abs(editor.scrollTop - finalScroll);
      if (drift > 10) {
        if (attempt === 0) {
          console.warn(`[jumpEditorToLine] Focus caused drift! Correcting ${editor.scrollTop} -> ${finalScroll}`);
        }
        editor.scrollTop = finalScroll;
      }
      if (attempt < 3) {
        enforceScroll(attempt + 1);
      } else {
        updateLineInfoDisplay();
      }
    });
  };
  enforceScroll();
}


function captureSelection() {
  const editor = getEditorAdapter();
  if (cmEditor) {
    const sel = cmEditor.getSelection();
    selectedText = (sel || '').trim();
  } else if (editor && editor.selectionStart !== editor.selectionEnd) {
    const text = editor.value.substring(editor.selectionStart, editor.selectionEnd);
    selectedText = text.trim();
  } else {
    const selection = window.getSelection();
    selectedText = (selection && selection.toString() || '').trim();
  }

  // Update Quick Tools modal hint if open
  updateSelectionModeIndicator();
}

function flashNameInEditor(name, anchorOffset = null) {
  if (!name) return;
  const editor = getEditorAdapter();
  if (!editor) return;

  const text = cmEditor ? cmEditor.getValue() : (editor.value || '');
  const lower = text.toLowerCase();
  const target = name.toLowerCase();

  const anchor = (typeof anchorOffset === 'number' && anchorOffset >= 0)
    ? anchorOffset
    : (cmEditor
      ? cmEditor.indexFromPos(cmEditor.getCursor())
      : (typeof editor.selectionStart === 'number' ? editor.selectionStart : 0));

  const searchRadius = 1500;
  const start = Math.max(0, anchor - 500);
  const end = Math.min(text.length, anchor + searchRadius);

  let idx = lower.indexOf(target, start);
  if (idx === -1 || idx > end) {
    return;
  }
  if (idx === -1) return;

  if (cmEditor) {
    const from = cmEditor.posFromIndex(idx);
    const to = cmEditor.posFromIndex(idx + name.length);
    cmEditor.setSelection(from, to);
    setTimeout(() => cmEditor.setSelection(from, from), 250);
    return;
  }

  const originalStart = editor.selectionStart;
  const originalEnd = editor.selectionEnd;

  editor.setSelectionRange(idx, idx + name.length);
  setTimeout(() => {
    editor.setSelectionRange(originalStart, originalEnd);
  }, 250);
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

    // Read the output file using the actual path reported by the pipeline (handles versioned filenames)
    const outputPath = result.outputPath || tempPath.replace(/\.md$/, `${outputSuffix}.md`);
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
let headersCollapsed = false;

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

    const changeMsg = changedLines > 0
      ? `Built headers: ${changedLines} lines updated`
      : `Built headers: no changes detected`;


    addChangeLogEntry('Build Headers', changeMsg);
    log(changeMsg, changedLines > 0 ? 'info' : 'warning');

    currentContent = result.content;
    updateMarkdownEditor(currentContent);
    updateRenderedTab(currentContent);
    updateSummaryTab(currentContent);
    safeUpdateHeaderNavigator();
    analyzeDocumentStatBlocks();
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

// Reforged Conversion (sidebar button - keep for backward compatibility)
document.getElementById('convertReforgedBtn')?.addEventListener('click', convertToReforged);

// Reforged Conversion Panel
let pendingConversions = [];

document.getElementById('scanConversionsBtn')?.addEventListener('click', async () => {
  console.log('[DEBUG] Scan button clicked');

  if (!currentContent) {
    log('No document loaded', 'error');
    return;
  }

  console.log('[DEBUG] Document loaded, content length:', currentContent.length);

  // Load mappings if not already loaded
  if (conversionMappings.spells.size === 0 && conversionMappings.items.size === 0) {
    console.log('[DEBUG] Loading conversion mappings...');
    const loaded = await loadConversionMappings();
    console.log('[DEBUG] Mappings loaded:', loaded);
    if (!loaded) return;
  }

  console.log('[DEBUG] Spell mappings:', conversionMappings.spells.size);
  console.log('[DEBUG] Item mappings:', conversionMappings.items.size);

  // Manual overrides
  const manualOverrides = new Map([
    ['potion of alter size', 'Potion of Diminution'],
    ['potion of cure poison', 'Potion of Delay Toxin'],
    ['potion of cure critical wounds', 'Potion of Heal Critical Wounds'],
    ['potion of cure light wounds', 'Potion of Heal Light Wounds'],
    ['protection from good', 'Protection from Disposition'],
    ['protection from evil', 'Protection from Disposition'],
    ['protection from chaos', 'Protection from Disposition'],
    ['protection from law', 'Protection from Disposition'],
    ['bullywug', 'Batrachianoid']
  ]);

  const allMappings = new Map([...conversionMappings.spells, ...conversionMappings.items, ...manualOverrides]);

  // Find all conversions with line numbers
  const lines = currentContent.split('\n');
  pendingConversions = [];

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];

    for (const [oldName, newName] of allMappings) {
      const regex = new RegExp(`\\b${oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      let match;

      while ((match = regex.exec(line)) !== null) {
        pendingConversions.push({
          oldText: match[0],
          newText: newName,
          lineNumber: lineNum + 1,
          lineContent: line,
          index: match.index,
          length: match[0].length,
          applied: false
        });
      }
    }
  }

  renderConversionList();
  log(`Found ${pendingConversions.length} potential conversions`, 'success');
});

function renderConversionList() {
  const container = document.getElementById('conversionList');
  const countEl = document.getElementById('conversionCount');
  const applyAllBtn = document.getElementById('applyAllConversionsBtn');

  if (!container) return;

  const unapplied = pendingConversions.filter(c => !c.applied);

  if (countEl) {
    countEl.textContent = `${unapplied.length} conversion${unapplied.length !== 1 ? 's' : ''} pending`;
  }

  if (applyAllBtn) {
    applyAllBtn.disabled = unapplied.length === 0;
  }

  if (pendingConversions.length === 0) {
    container.innerHTML = '<p class="placeholder">No conversions found. The document may already use Reforged names.</p>';
    return;
  }

  container.innerHTML = pendingConversions.map((conv, idx) => `
    <div class="conversion-item ${conv.applied ? 'applied' : ''}" data-index="${idx}">
      <div class="conversion-item-content">
        <div class="conversion-item-line">Line ${conv.lineNumber}</div>
        <div style="display: flex; align-items: center; gap: 12px;">
          <div class="conversion-item-old">${escapeHtml(conv.oldText)}</div>
          <div class="conversion-item-arrow">→</div>
          <div class="conversion-item-new">${escapeHtml(conv.newText)}</div>
        </div>
      </div>
      ${!conv.applied ? `
        <div class="conversion-item-actions">
          <button class="conversion-item-btn apply-btn" data-index="${idx}">Apply</button>
          <button class="conversion-item-btn skip skip-btn" data-index="${idx}">Skip</button>
        </div>
      ` : '<div style="color: #4CAF50; font-size: 12px;">✓ Applied</div>'}
    </div>
  `).join('');

  // Add event listeners
  container.querySelectorAll('.apply-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.index);
      applyConversion(idx);
    });
  });

  container.querySelectorAll('.skip-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.index);
      skipConversion(idx);
    });
  });
}

function applyConversion(index) {
  const conv = pendingConversions[index];
  if (!conv || conv.applied) return;

  const lines = currentContent.split('\n');
  const lineIdx = conv.lineNumber - 1;

  if (lineIdx >= 0 && lineIdx < lines.length) {
    const line = lines[lineIdx];
    const newLine = line.substring(0, conv.index) + conv.newText + line.substring(conv.index + conv.length);
    lines[lineIdx] = newLine;

    pushUndoState('Convert: ' + conv.oldText + ' → ' + conv.newText);
    currentContent = lines.join('\n');
    updateEditorContent(currentContent);

    conv.applied = true;
    renderConversionList();
    log(`Converted "${conv.oldText}" to "${conv.newText}" on line ${conv.lineNumber}`, 'success');
  }
}

function skipConversion(index) {
  pendingConversions.splice(index, 1);
  renderConversionList();
}

document.getElementById('applyAllConversionsBtn')?.addEventListener('click', () => {
  const unapplied = pendingConversions.filter(c => !c.applied);

  if (unapplied.length === 0) return;

  if (!confirm(`Apply all ${unapplied.length} conversions?`)) return;

  pushUndoState('Apply All Reforged Conversions');

  // Apply from end to start to preserve indices
  const sorted = [...pendingConversions].sort((a, b) => {
    if (a.lineNumber !== b.lineNumber) return b.lineNumber - a.lineNumber;
    return b.index - a.index;
  });

  let lines = currentContent.split('\n');

  for (const conv of sorted) {
    if (conv.applied) continue;

    const lineIdx = conv.lineNumber - 1;
    if (lineIdx >= 0 && lineIdx < lines.length) {
      const line = lines[lineIdx];
      const newLine = line.substring(0, conv.index) + conv.newText + line.substring(conv.index + conv.length);
      lines[lineIdx] = newLine;
      conv.applied = true;
    }
  }

  currentContent = lines.join('\n');
  updateEditorContent(currentContent);
  renderConversionList();
  log(`Applied ${unapplied.length} conversions`, 'success');
});

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

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

  // Update sync checkbox to reflect current state (simple ON/OFF)
  const syncCheckbox = document.getElementById('settingSyncEnabled');
  if (syncCheckbox) {
    syncCheckbox.checked = !!syncScrollEnabled;
  }

  // Game system & edition
  const systemSelect = document.getElementById('settingGameSystem');
  const editionSelect = document.getElementById('settingGameEdition');
  if (systemSelect) {
    systemSelect.value = config.gameSystem || 'cnc';
  }
  if (editionSelect) {
    editionSelect.value = config.gameEdition || 'reforged';
  }

  // Reflect current values in header indicator
  updateSystemIndicator();

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

  // Save sync preference: checkbox checked = ON, unchecked = OFF
  const syncCheckbox = document.getElementById('settingSyncEnabled');
  syncScrollEnabled = !!(syncCheckbox && syncCheckbox.checked);
  config.syncScrollEnabled = syncScrollEnabled;

  // Persist game system & edition
  const systemSelect = document.getElementById('settingGameSystem');
  const editionSelect = document.getElementById('settingGameEdition');
  if (systemSelect) {
    config.gameSystem = systemSelect.value || 'cnc';
  }
  if (editionSelect) {
    config.gameEdition = editionSelect.value || 'reforged';
  }

  // Save config
  const result = await window.electronAPI.saveConfig(config);

  if (result.success) {
    log('Settings saved successfully', 'success');
    updateStatus('Settings saved', 'success');
    updateSystemIndicator();
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
  const sections = extractSections(currentContent || '');
  allSections = sections; // reuse existing sections array

  // Update right-hand content tree when sections change
  renderRightNavigator(buildRightNavModel());
}

function navigateToSection(index) {
  const sections = allSections || [];
  if (!sections[index]) return;
  const target = sections[index];

  // Update unified navigation context
  navContext.mode = 'stat-block';
  navContext.index = index;
  updateNavButtonsForContext();
  updateLineInfoDisplay();

  // Jump editor to the section start (keeps caret aligned with navigation)
  jumpEditorToLine(target.startLine, false);
}

// ============================================================================
// RIGHT-HAND CONTENT TREE (Sections + Stat Blocks with Icons)
// ============================================================================

// Icons for the right-hand content tree ONLY (left panel stays text-only)
const CONTENT_TREE_ICONS = {
  'monster': '👹',
  'npc': '🧍',
  'npc-named': '🧍',
  'boxed': '📦',
  'table': '📊',
  'trap': '🗺️',
  'hazard': '⚠️',
  'feature': '✨'
};

/**
 * Detect tables within a line range of the document
 * Returns array of detected tables with type and line number
 */
function detectTablesInRange(startLine, endLine) {
  if (!currentContent) return [];
  
  const lines = currentContent.split('\n');
  const tables = [];
  const actualEndLine = Math.min(endLine, lines.length);
  
  for (let i = startLine - 1; i < actualEndLine; i++) {
    const line = lines[i] || '';
    const lineNum = i + 1;
    
    // Markdown table separator row (|---|---|)
    if (/^\s*\|?\s*:?-+:?\s*\|/.test(line) && /\|/.test(line)) {
      // Look back for header row to get table name
      let tableName = 'Table';
      
      // Check previous lines for table header or caption
      for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
        const prevLine = lines[j] || '';
        
        // Check for "Table X:" or "TABLE:" pattern
        const tableMatch = prevLine.match(/\*?\*?(?:Table\s*\d*[:.]\s*)?([^|*\n]+)/i);
        if (tableMatch && prevLine.includes('|')) {
          // This is the header row, extract first cell as name hint
          const cells = prevLine.split('|').filter(c => c.trim());
          if (cells.length > 0) {
            tableName = cells[0].replace(/\*\*/g, '').trim().substring(0, 40);
          }
          break;
        }
        
        // Check for standalone table title
        if (/^#+\s*Table|^\*\*Table/i.test(prevLine)) {
          tableName = prevLine.replace(/^#+\s*/, '').replace(/\*\*/g, '').trim().substring(0, 40);
          break;
        }
      }
      
      tables.push({
        type: 'table',
        name: tableName || 'Table',
        line: lineNum - 1, // Point to start of table
        tableType: 'markdown'
      });
    }
    
    // HTML table start
    if (/<table\b/i.test(line)) {
      tables.push({
        type: 'table',
        name: 'HTML Table',
        line: lineNum,
        tableType: 'html'
      });
    }
    
    // Dice/Roll table patterns (common in TRPGs)
    // e.g., "d6  Result" or "1-2  Something"
    if (/^\s*(?:d\d+|Roll|\d+[-–]\d+)\s+/i.test(line) && i + 1 < actualEndLine) {
      const nextLine = lines[i + 1] || '';
      if (/^\s*\d+[-–]?\s+/.test(nextLine) || /^\s*\d+\.\s+/.test(nextLine)) {
        tables.push({
          type: 'table',
          name: 'Roll Table',
          line: lineNum,
          tableType: 'roll'
        });
      }
    }
    
    // Encounter table pattern (## Wandering Monsters, Random Encounters, etc.)
    if (/^#{1,4}\s*(?:Wandering|Random|Encounter|Monster)\s*(?:Table|List)?/i.test(line)) {
      tables.push({
        type: 'table',
        name: line.replace(/^#+\s*/, '').trim().substring(0, 40),
        line: lineNum,
        tableType: 'encounter'
      });
    }
    
    // Bold-range table format (e.g., **01-05** entry, **06-08** entry, etc.)
    // This is a common TRPG table format with lines like: **01-05** Description text
    if (/^\*\*\d+[-–]\d+\*\*\s/.test(line)) {
      // Look back up to 15 lines for a table header/title (heading, "D100", "Table", etc.)
      let tableName = 'Range Table';
      
      for (let j = i - 1; j >= Math.max(0, i - 15); j--) {
        const prevLine = lines[j] || '';
        
        // Check for "### D100 ...", "Table ...", or "### ..."
        if (/^#+\s*(?:D\d+|Table|###)/i.test(prevLine)) {
          tableName = prevLine.replace(/^#+\s*/, '').replace(/\*\*/g, '').trim().substring(0, 40);
          break;
        }
        
        // Stop if we hit another section/header that's clearly a different context
        if (/^#{1,2}\s/.test(prevLine)) {
          break;
        }
      }
      
      tables.push({
        type: 'table',
        name: tableName,
        line: lineNum,
        tableType: 'range-table'
      });
      // Skip ahead to avoid duplicate detections in the same table
      i += 5;
    }
  }
  
  // Deduplicate tables that are close together (within 3 lines)
  const deduped = [];
  for (const table of tables) {
    const isDupe = deduped.some(t => Math.abs(t.line - table.line) < 3);
    if (!isDupe) {
      deduped.push(table);
    }
  }
  
  return deduped;
}

/**
 * Build a model of sections with their contained stat blocks for the right navigator
 */
function buildRightNavModel() {
  const tree = [];
  const sections = allSections || [];
  const blocks = statBlocks || [];

  if (!sections.length) {
    // No sections - just list all stat blocks flat
    if (blocks.length > 0) {
      tree.push({
        type: 'section',
        title: 'Document',
        level: 1,
        startLine: 1,
        endLine: Infinity,
        children: blocks.map(b => ({
          type: b.type || 'feature',
          name: b.name || 'Unknown',
          line: b.lineStart || b.lineNumber || 1,
          subtitle: null,
          warnings: (b.validation?.errors?.length || 0) + (b.validation?.warnings?.length || 0)
        }))
      });
    }
    return tree;
  }

  // Build section tree with stat blocks nested under each section
  sections.forEach((section, idx) => {
    const nextSection = sections[idx + 1];
    const sectionEndLine = nextSection ? nextSection.startLine - 1 : Infinity;

    const node = {
      type: 'section',
      title: section.header || `Section ${idx + 1}`,
      level: section.level || 1,
      startLine: section.startLine || 1,
      endLine: sectionEndLine,
      children: []
    };

    // Find stat blocks within this section's line range
    const sectionBlocks = blocks.filter(b => {
      const blockLine = b.lineStart || b.lineNumber || 0;
      return blockLine >= node.startLine && blockLine <= sectionEndLine;
    });

    // Detect tables within this section
    const sectionTables = detectTablesInRange(node.startLine, sectionEndLine);

    // Combine stat blocks and tables, sorted by line number
    const statBlockChildren = sectionBlocks.map(b => ({
      type: b.type || 'feature',
      name: b.name || 'Unknown',
      line: b.lineStart || b.lineNumber || 1,
      subtitle: null,
      warnings: (b.validation?.errors?.length || 0) + (b.validation?.warnings?.length || 0)
    }));

    const tableChildren = sectionTables.map(t => ({
      type: 'table',
      name: t.name,
      line: t.line,
      subtitle: t.tableType,
      warnings: 0
    }));

    // Merge and sort by line number
    node.children = [...statBlockChildren, ...tableChildren].sort((a, b) => a.line - b.line);
    
    // Track if section has tables (for section-level indicator)
    node.hasTables = sectionTables.length > 0;
    node.tableCount = sectionTables.length;

    tree.push(node);
  });

  return tree;
}

/**
 * Render the right-hand content tree navigator with icons
 */
function renderRightNavigator(model) {
  const nav = document.getElementById('rightNavigator');
  if (!nav) return;

  if (!model || model.length === 0) {
    nav.innerHTML = '<p class="placeholder" style="padding: 12px;">Load a document to see sections with stat blocks.</p>';
    return;
  }

  const htmlParts = model.map(section => {
    const indent = Math.max(0, (section.level - 1)) * 14;
    
    // Show table indicator if section contains tables
    const tableIndicator = section.hasTables 
      ? `<span class="section-table-badge" title="${section.tableCount} table(s)">📊${section.tableCount > 1 ? section.tableCount : ''}</span>`
      : '';

    let html = `
      <div class="nav-node section-node"
           data-line="${section.startLine}"
           style="margin-left:${indent}px">
        📘 ${escapeHtml(section.title)} ${tableIndicator}
      </div>
    `;

    if (section.children && section.children.length > 0) {
      section.children.forEach(child => {
        const icon = CONTENT_TREE_ICONS[child.type] || '•';
        const warn = child.warnings > 0
          ? `<span class="block-warning">⚠️ ${child.warnings}</span>`
          : '';

        html += `
          <div class="nav-node block-node"
               data-line="${child.line}"
               style="margin-left:${indent + 18}px">
            <span class="block-icon">${icon}</span>
            <span class="block-name">${escapeHtml(child.name)}</span>
            ${child.subtitle ? `<span class="block-subtitle">${escapeHtml(child.subtitle)}</span>` : ''}
            ${warn}
          </div>
        `;
      });
    }

    return html;
  });

  nav.innerHTML = htmlParts.join('');

  // Bind click handlers for navigation
  nav.querySelectorAll('.nav-node').forEach(el => {
    el.addEventListener('click', () => {
      const line = Number(el.dataset.line);
      if (line > 0) {
        jumpEditorToLine(line, true);

        // Update active state
        nav.querySelectorAll('.nav-node').forEach(n => n.classList.remove('active'));
        el.classList.add('active');
      }
    });
  });
}

/**
 * Highlight the corresponding entry in the Content Tree when a stat block is selected
 */
function highlightInContentTree(block) {
  const nav = document.getElementById('rightNavigator');
  if (!nav || !block) return;

  const blockLine = block.lineStart || block.lineNumber || 0;
  
  // Clear all active states
  nav.querySelectorAll('.nav-node').forEach(el => el.classList.remove('active'));

  // Find the section that contains this block
  const sections = allSections || [];
  let containingSection = null;
  
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const nextSection = sections[i + 1];
    const sectionEnd = nextSection ? nextSection.startLine - 1 : Infinity;
    
    if (blockLine >= section.startLine && blockLine <= sectionEnd) {
      containingSection = section;
      break;
    }
  }

  // Highlight the section header
  if (containingSection) {
    const sectionNode = nav.querySelector(`.section-node[data-line="${containingSection.startLine}"]`);
    if (sectionNode) {
      sectionNode.classList.add('active');
      sectionNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  // Also highlight the specific block if it exists in the tree
  const blockNode = nav.querySelector(`.block-node[data-line="${blockLine}"]`);
  if (blockNode) {
    blockNode.classList.add('active');
    blockNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function highlightHeaderForLine(lineNumber) {
  // Header tree removed; no-op
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

// Extract traps and hazards from document (separate from stat blocks)
function extractTrapsAndHazards(content) {
  if (!content) return [];

  const lines = content.split('\n');
  const trapsAndHazards = [];
  const seen = new Set(); // Deduplicate

  // Hazard keywords from Python analysis
  const hazardKeywords = /(pit\s+trap|covered\s+pit|open\s+pit|snare|net\s+trap|spear\s+trap|pressure\s+plate|alarm|laughing\s+gas|sleeping\s+gas|green\s+slime|gray\s+ooze|air\s+fungus|exploding|curse|aversion|ammonia|secret\s+trap\s+door)/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Must have CL rating AND hazard keywords (from Python logic)
    if (/CL\s*\d+/i.test(line) && hazardKeywords.test(line)) {
      // Extract the most relevant bold text (prefer trap-related names)
      const boldMatches = line.match(/\*\*([^*]+)\*\*/g);
      if (boldMatches) {
        // Find the bold text that contains trap/hazard keywords
        let name = null;
        for (const boldMatch of boldMatches) {
          const cleanMatch = boldMatch.replace(/\*\*/g, '').replace(/^[_:\s]+|[_:\s]+$/g, '').trim();
          if (hazardKeywords.test(cleanMatch)) {
            name = cleanMatch;
            break;
          }
        }

        // Fallback to first bold text if no keyword match
        if (!name && boldMatches.length > 0) {
          name = boldMatches[0].replace(/\*\*/g, '').replace(/^[_:\s]+|[_:\s]+$/g, '').trim();
        }

        if (name && !seen.has(name.toLowerCase())) {
          seen.add(name.toLowerCase());
          trapsAndHazards.push({
            name,
            raw: line,
            fullText: line,
            lineNumber: i + 1,
            lineStart: i + 1,
            lineEnd: i + 1,
            context: 'Trap/Hazard',
            type: null // Will be classified later
          });
        }
      }
    }
  }

  return trapsAndHazards;
}

// Lightweight inline detector for bold stat lines the backend may miss
function detectInlineStatBlocks(content) {
  if (!content) return [];

  const lines = content.split('\n');
  const blocks = [];
  const statSignal = /(hp\s*\d+|hd\s*\d+|ac\s*\d+|mv\s*\d+)/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes('**')) continue;
    if (!statSignal.test(line)) continue;

    const nameMatch = line.match(/\*\*([^*]+)\*\*/);
    if (!nameMatch) continue;

    let name = nameMatch[1].trim();
    name = name.replace(/[:.]+$/, '').trim();
    if (!name) continue;

    // Skip single-word creature references in narrative text (e.g., "ally of the **ogre**")
    // These are just inline references, not stat block entries
    if (!/[:,]|^\*\*/.test(line) && name.split(/\s+/).length <= 2) {
      // If the line doesn't start with ** and doesn't have colons/commas after the name,
      // and the name is 1-2 words, it's likely just a narrative reference
      continue;
    }

    const rawLine = line.trim();
    blocks.push({
      name,
      raw: rawLine,
      fullText: rawLine,
      lineNumber: i + 1,
      lineStart: i + 1,
      lineEnd: i + 1,
      context: '',
      type: null
    });
  }

  return blocks;
}

function realignStatBlocks(blocks) {
  if (!currentContent || !blocks) return blocks;
  const lines = currentContent.split('\n');
  
  return blocks.map(block => {
    // Try to match using the raw line content first (most accurate)
    const searchContent = (block.raw || block.fullText || '').split('\n')[0].trim();
    if (!searchContent || searchContent.length < 5) return block;

    // Search window: start from 0 to handle the "doubling" issue completely
    // We want to find the FIRST occurrence to match user expectation
    const expectedLine = block.lineNumber || 1;
    
    let bestLine = -1;
    
    // Scan the whole document for the best match
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes(searchContent)) {
        // Exact match found
        bestLine = i + 1;
        break; // Stop at first match
      }
      
      // Fuzzy match (fallback)
      if (bestLine === -1 && block.name && line.includes(block.name.replace(/["']/g, '').trim())) {
        bestLine = i + 1;
        // Continue searching for a better exact match
      }
    }
    
    // If we found a better line, update it
    if (bestLine !== -1 && bestLine !== expectedLine) {
      return {
        ...block,
        lineNumber: bestLine,
        lineStart: bestLine
      };
    }
    
    return block;
  });
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function updateStatBlockNavigator(blocks) {
  const container = document.getElementById('statBlockNavigator');
  const countEl = document.getElementById('statBlockCount');

  if (!container) return;

  // Store full list and ensure lineStart is set from lineNumber
  // First realign blocks to correct line numbers in current content
  const realignedBlocks = realignStatBlocks(Array.isArray(blocks) ? blocks : []);
  
  statBlocks = realignedBlocks.map(b => ({
    ...b,
    lineStart: b.lineStart || b.lineNumber || 1,
    lineNumber: b.lineNumber || b.lineStart || 1
  }));

  // Add traps and hazards
  const trapsAndHazards = extractTrapsAndHazards(currentContent || '');
  statBlocks = statBlocks.concat(trapsAndHazards);

  // Add inline bold stat lines the backend may miss (e.g., quick edits)
  const inlineDetected = detectInlineStatBlocks(currentContent || '');
  inlineDetected.forEach(inlineBlock => {
    const line = inlineBlock.lineNumber || inlineBlock.lineStart || 0;
    const exists = statBlocks.some(block => {
      const bLine = block.lineNumber || block.lineStart || 0;
      const sameName = block.name && inlineBlock.name &&
        block.name.toLowerCase().trim() === inlineBlock.name.toLowerCase().trim();
      const closeLine = line && bLine && Math.abs(bLine - line) <= 2;
      return sameName || closeLine;
    });
    if (!exists) {
      statBlocks.push(inlineBlock);
    }
  });

  // Update count badge
  const sections = extractSections(currentContent || '');
  allSections = sections; // reuse existing sections array

  if (!statBlocks || statBlocks.length === 0) {
    container.innerHTML = '<p class="placeholder" style="padding: 12px;">No stat blocks detected in this document.</p>';
    if (countEl) countEl.textContent = '0';
    updateLineInfoDisplay();
    return;
  }

  // Classify and enhance blocks
  statBlocks = augmentStatBlocksFromAlphabeticalList(statBlocks, currentContent || '');
  statBlocks = statBlocks.map((block, idx) => {
    block._originalIndex = idx;
    block._uniqueId = `${block.name || 'unknown'}_${block.lineNumber || idx}_${idx}`; // Unique ID for duplicates
    block.type = block.type || classifyStatBlock(block);
    block.context = block.context || findBlockContext(block);
    block.isLegacy = detectLegacyFormat(block);
    block._reviewKey = buildReviewKey(block);
    block.reviewed = getReviewFlag(block._reviewKey);
    // Mark whether this entry has an actual stat block
    // True if: has comprehensive stat data (at least 2+ major properties) or validation
    // This filters out narrative mentions with incidental HP data like "**3 females** (4 HP each)"
    const raw = block.raw || block.fullText || '';
    const statProperties = (raw.match(/\b(HD|HP|AC|XP|MV|Move|Saves|Attack|Special|Ability|Skills)\s+[\d\w\-]+/gi) || []).length;
    const hasValidation = !!(block.validation && (block.validation.errors || block.validation.warnings));
    // Real stat blocks have 2+ major properties, or validation data, or explicit HD/HP/AC in sequence
    const hasComprehensiveStats = statProperties >= 2 || /\b(HD|XP)\s+[\d\+\-]+\b/.test(raw);
    block.hasStatBlock = hasComprehensiveStats || hasValidation;
    return block;
  });

  if (countEl) countEl.textContent = statBlocks.length.toString();

  renderStatBlockList();
  updateReviewSummary();

  // Update the right-hand content tree
  renderRightNavigator(buildRightNavModel());
}

// Classify stat block by type
function classifyStatBlock(block) {
  let name = (block.name || '').toLowerCase();
  const originalName = block.name || '';
  const text = (block.raw || block.fullText || '').toLowerCase();
  const combined = `${name} ${text}`;

  const hasCreatureWord = /(dragon|goblin|orc|troll|kobold|bugbear|hobgoblin|skeleton|zombie|ghoul|ghast|wraith|specter|lich|mummy|vampire|demon|devil|fiend|ogre|giant|beast|slime|ooze|fungus|mold|worm|centipede|spider|rat|bat|wolf|bear|boar|lion|griffon|wyvern|basilisk|naga|losel|shaman|chieftain|warrior|champion|leader|matriarch|patriarch|queen|king|lord|witch|cultist|spawn|aberration|construct|golem|gnoll|elf|elves|serjeant|lieutenant|yeexuul|stirge|mastiff|nixie|animal|herd|bandit|brigand|turtle|snapping|snake|poisonous|guards?|males?|females?|young|cubs?)/i.test(combined);
  const hasLocationWord = /\b(chamber|room|hall|corridor|passage|tunnel|entrance|exit|stair|stairs|doorway|archway|alcove|niche|balcony|terrace|courtyard|cellar|basement|attic|loft|storage|area|quarters|closet|chapel|shrine|temple|statue|altar|fountain|handout|compartment|lock|locked|barred|stuck|padlocked|door|gate|panel|lever|block\b|block\s*\d+|player\s+handout|cave|cavern|lair|den|well|reservoir|inn|tavern|gatehouse|keep|castle|manor|inn\b|gatehouse\b|tower\b|college|library|school|krushers?|faction|tribe|clan|group)\b/i.test(combined);
  const isAttributeOnly = /\b(locked|padlocked|barred|stuck|save\s+versus\s+poison|poison\s+save|save\s+vs\s+poison)\b/i.test(combined);

  // If this was extracted as a trap/hazard, classify it appropriately
  if (block.context === 'Trap/Hazard') {
    // Check if it's a trap or hazard based on keywords
    if (/(pit\s+trap|covered\s+pit|open\s+pit|snare|net\s+trap|spear\s+trap|pressure\s+plate|alarm|trap)/i.test(name)) {
      return 'trap';
    }
    if (/(laughing\s+gas|sleeping\s+gas|green\s+slime|gray\s+ooze|curse|aversion|ammonia|exploding|flesh\s+beetle)/i.test(name)) {
      return 'hazard';
    }
    // Default to trap for Trap/Hazard context
    return 'trap';
  }

  // Strip quantity patterns for better classification
  name = name.replace(/\s*x\s*\d+$/i, '').replace(/\s*\d+x$/i, '').replace(/\s*\d+$/i, '').trim();

  const hasHpOrHd = /\b(hp\s*\d+|hd\s*\d+d?\d*)\b/i.test(combined);
  const hasAc = /\bac\b\s*\d+/i.test(combined);
  const hasStatSignals = hasHpOrHd && hasAc;

  // Explicit handouts/items/blocks should be features
  if (/handout/i.test(combined) || /^block\s*\d+/i.test(name)) {
    return 'feature';
  }

  // Plain attributes/locks/save notes should not be entities
  if (isAttributeOnly) {
    return 'feature';
  }

  // Object/location cues that should override creature words
  if (/\b(statue|altar|compartment|lock|locked|stuck|padlocked|barred|secret\s+compartment|cave|cavern|lair|den|well|reservoir|inn|tavern|gatehouse|keep|castle)\b/i.test(combined)) {
    return 'feature';
  }

  // Room/Architectural patterns - check BEFORE NPC detection for location names
  // Use word boundaries to avoid matching creature names like "Cave bats"
  if (hasLocationWord ||
    (/\b(cave|cavern|den|lair)\b(?!\s+(bat|rat|spider|snake|monster|creature|giant|ghoul|naga))/i.test(combined)) ||
    /\b(sq\.?\s*ft|square\s*feet|feet\s*x\s*\d+|\d+\s*x\s*\d+|\d+\s*ft\s*x\s*\d+|dimensions?\b)/i.test(combined)) {
    // If it clearly names a creature but is also a location, keep feature only when it's an area/object label
    const areaLike = /\b(area|quarters|room|chamber|hall|chapel|shrine|statue|altar|block|handout|compartment|lock|locked|stuck|padlocked|barred|cave|cavern|lair|den|well|reservoir|inn|tavern|gatehouse|keep|castle|manor)\b/i.test(combined);
    if (!hasCreatureWord || (areaLike && !hasStatSignals)) {
      return 'feature';
    }
  }

  // Detect if this is a named NPC (proper name, not generic)
  const isNamedNPC = detectNamedNPC(originalName);

  // Check for character levels - strong indicator of humanoid NPC
  const hasCharacterLevel = /(\d+(?:st|nd|rd|th)[-–]\d+(?:st|nd|rd|th)?\s+level|level\s+\d+|level\s+(fighter|cleric|magic-user|thief|ranger|druid|bard|paladin|monk))/i.test(combined);

  // Special unique NPCs - specific named bosses, leaders, or unique roles
  const isUniqueNPC = /(\b(charlie|pinky|wily wil|yeexuul|gruzz kree|king krusher|hub-gub|griggle-gruk|fekk|ember raventree|grimlock|ji'gun-tima|iggy the mad|blook-glook|ug-muk'tik|grug-much|robert cooper|oni blackbeard|wilbur hornblower)\b|shaman(?!s)|chieftain(?!s)|leader\b|mate\b|lieutenant\b)/i.test(combined) &&
    !/(patrol|guards?|warriors?|raiders?|males?|females?)\s+x\s*\d+/i.test(combined);

  // NPC keywords (explicit people/roles)
  if (isNamedNPC || isUniqueNPC ||
    /\bnpc\b|hireling|commoner|merchant|innkeeper|barkeep|sage|scholar|clerk|noble|acolyte|priest|vicar|chaplain|courtier|peasant|farmer|villager|townsfolk|citizen|servant|porter|retainer|prisoner|captive/i.test(combined) ||
    /personality|attitude|demeanor/i.test(text) ||
    hasCharacterLevel) {
    return (isNamedNPC || isUniqueNPC) ? 'npc-named' : 'npc';
  }

  // Monster keywords (expanded) - check this AFTER room patterns
  // Include generic creature types, animals, and quantity-based groups
  const isMonster = /(dragon|goblin|orc|troll|kobold|bugbear|hobgoblin|skeleton|zombie|ghoul|ghast|wraith|specter|lich|mummy|vampire|demon|devil|fiend|ogre|giant|beast|slime|ooze|gelatinous|fungus|mold|worm|centipede|spider|rat|bat|wolf|bear|boar|lion|griffon|wyvern|basilisk|naga|losel|lizardfolk|bandit|brigand|ape|turtle|snapping|snake|poisonous|deadly|otter|nixie|stirge|mastiff|animal|herd|bison|cattle|deer|elk)/i.test(combined) ||
    /monster|creature|spawn/i.test(text) ||
    /(guards?|warriors?|males?|females?|young|cubs?|raiders?|patrol|sentries)\s+x\s*\d+/i.test(combined) ||
    /(cave\s+bats?|river\s+rats?|giant\s+rats?|black\s+bear|wood\s+elf|poisonous\s+snake)/i.test(combined) ||
    hasStatSignals;

  if (isMonster) {
    // Check if also a hazard (dual categorization) - only for specific hazard creatures
    const isHazardToo = /(green\s+slime|slime\s+colony|ooze\s+colony|exploding\s+fungus|sunset\s+mushrooms|sleeping\s+gas|aversion|ammonia\s+gas|curse)/i.test(combined);
    return isHazardToo ? 'hazard' : 'monster'; // Prioritize hazard for dual-category entities
  }

  // Trap detection - check for explicit trap indicators
  // Match names like "Pit Trap [X]", "Covered pit trap", "Spear trap", etc.
  if (/\b(pit|covered|open|spear|net|alarm|pressure)\s+(trap|plate)/i.test(name) ||
    /\btrap\b.*\[(x|X)\]/i.test(name) ||
    /(snare|net\s+trap|laughing\s+gas|sleeping\s+gas)/i.test(name)) {
    return 'trap';
  }

  // Also check for trap context in text (CL ratings, damage, triggers)
  if (/\btrap\b/i.test(name) && /(CL\s*\d+|triggers|collapses|damage|save)/i.test(text)) {
    return 'trap';
  }

  // Hazard keywords (environmental dangers)
  if (/(poison|acid|fire|lava|spikes|chasm|hazard|danger|aversion|ammonia|curse|sleeping|exploding|flesh|beetle)/i.test(combined) ||
    /hazard|environmental|danger|save vs/i.test(text)) {
    return 'hazard';
  }

  // Feature (only for specific environmental elements)
  if (/(fountain|altar|statue|door|chest|room)/i.test(combined)) {
    return 'feature';
  }

  // Default to monster if it has creature-like words but didn't match above
  // But exclude location-specific patterns and organization names
  if (/(elf|elves|gnoll|gnolls|kobold|kobolds|goblin|goblins|orc|orcs|human|humans|man|men|woman|women|child|children|male|female|guards?|warriors?|raiders?|patrol)/i.test(combined) &&
      !/(college|library|school|guild|company|krushers?|faction|organization)/i.test(combined)) {
    return 'monster';
  }

  // Location/organization names should be features
  if (/(college|library|school|guild|company|krushers?|faction|clan|tribe|band|organization)/i.test(combined)) {
    return 'feature';
  }

  return 'feature'; // Final fallback
}

// Find the earliest matching line for a block (prefer exact raw -> name patterns)
function resolveBlockLine(block) {
  if (!currentContent || !block) return null;
  const lines = currentContent.split('\n');
  const name = (block.name || '').trim();
  const rawFirst = (block.raw || block.fullText || '').split('\n')[0].trim();

  // Exact raw match (earliest)
  if (rawFirst && rawFirst.length > 4) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(rawFirst)) return i + 1;
    }
  }

  // Bolded name pattern
  if (name) {
    const boldPattern = new RegExp(`\\*\\*${escapeRegExp(name)}[:\\s]`, 'i');
    for (let i = 0; i < lines.length; i++) {
      if (boldPattern.test(lines[i])) return i + 1;
    }

    // Simple name includes
    const simpleName = name.replace(/["']/g, '').trim();
    if (simpleName.length > 2) {
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(simpleName.toLowerCase())) {
          return i + 1;
        }
      }
    }
  }

  return null;
}

// Extract stat block names using the same pattern as Python analysis
function extractStatBlockNames(content) {
  if (!content) return [];

  // Match Python pattern: **Name:** _(This.*?vital stats are|HP|He is a|She is a|It is a).*?HP
  const statBlockPattern = /\*\*([^\*]+)\*\*[:\s]*_?\((?:This.*?vital stats are|HP|He is a|She is a|It is a).*?HP/gi;
  const statBlockNames = new Set();

  let match;
  while ((match = statBlockPattern.exec(content)) !== null) {
    const name = match[1].trim();
    if (name) {
      statBlockNames.add(name);
    }
  }

  return Array.from(statBlockNames);
}

// Extract proper names from document content to find missing stat blocks
function extractReferencedNames(content) {
  if (!content) return [];

  const lines = content.split('\n');
  const referencedNames = new Set();

  // Patterns to extract proper names (more focused than before)
  const patterns = [
    // Quoted names: "Name", 'Name' (handle hyphens)
    /["']([A-Z][a-z]+(?:[-\s][A-Z][a-z]+)*)["']/g,
    // Bold names: **Name** (handle hyphens)
    /\*\*([A-Z][a-z]+(?:[-\s][A-Z][a-z]+)*)\*\*/g,
    // Title + name patterns: King Griggle-gruk, Queen Someone
    /\b(King|Queen|Lord|Lady|Sir|Captain|Chieftain|Chief|Leader|Shaman|Priest|Priestess)\s+([A-Z][a-z]+(?:[-\s][A-Z][a-z]+)*)\b/g
  ];

  for (const line of lines) {
    // Skip lines that reference other modules
    if (/\(CZY\s+environs|Ruins\s+of\s+the\s+Castle\s+Precincts|Appendix\s+[A-D]\)/i.test(line)) {
      continue;
    }

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(line)) !== null) {
        const name = match[1] || match[2]; // Handle both capture groups
        if (name && name.length > 2 && !/^(Table|Block|Section|Room|Area|Authors|Contributor|Edited|Production|Cover|Cartography|Special|Playtesters|Appendix|Mapping|Getting|Sages|Mages|Outs|Rumors|College|Green|Old|Little|False|Outside|Animal|Movement|Swamp|Approaching|LAYOUT|Tactics|Wood|Bandit|Secret|Kree-Gubs|Gublinish|Skull|Ioun|Giant|Concealed|Black|Watery)\s*\d*/i.test(name)) {
          referencedNames.add(name.trim());
        }
      }
    }
  }

  return Array.from(referencedNames);
}

// Find names referenced in document but missing from stat blocks
function findMissingStatBlocks() {
  if (!currentContent) return [];

  const referencedNames = extractReferencedNames(currentContent);
  const statBlockNames = extractStatBlockNames(currentContent);
  const statBlockNamesSet = new Set(
    statBlockNames.map(name => name.toLowerCase().trim())
  );

  const missing = referencedNames.filter(name => {
    const normalizedName = name.toLowerCase().trim();
    return !statBlockNamesSet.has(normalizedName) &&
      !statBlockNamesSet.has(normalizedName.replace(/^king\s+|queen\s+|lord\s+|lady\s+|sir\s+/i, '')) &&
      !statBlockNamesSet.has(normalizedName.replace(/\s+\([^)]+\)$/, '')); // Remove trailing parenthetical
  });

  return missing.sort();
}

// Show missing stat blocks report
function showMissingStatBlocksReport() {
  const missing = findMissingStatBlocks();

  if (missing.length === 0) {
    alert('All referenced names have corresponding stat blocks!');
    return;
  }

  const report = missing.join('\n');
  const message = `The following ${missing.length} names are referenced in the document but have no stat blocks:\n\n${report}\n\nConsider creating stat blocks for these entities or removing references if they're not needed.`;

  if (confirm(`${message}\n\nCopy this list to clipboard?`)) {
    navigator.clipboard.writeText(report).then(() => {
      log('Missing stat blocks list copied to clipboard', 'success');
    }).catch(err => {
      log('Failed to copy to clipboard', 'error');
    });
  }
}

// Detect if a name represents a unique named NPC vs generic monster
function detectNamedNPC(name) {
  if (!name || name.length < 3) return false;

  // Exclude structural/meta elements (tables, blocks, sections)
  if (/^(table|block|section|area|room|chapter|part|appendix)\s*\d+/i.test(name)) {
    return false;
  }

  // Exclude location/area names (not NPCs)
  if (/(track|trail|road|path|river|stream|lake|forest|wood|hill|mountain|ravine|bluff|pier|bridge|cave|cavern|lair|den|handout|reservoir|well|inn|tavern|gatehouse|castle|keep)/i.test(name)) {
    return false;
  }

  // Exclude boxed text markers and other formatting
  if (/^(<<|>>|begin|end|boxed|text)/i.test(name)) {
    return false;
  }

  // Generic quantity indicators = not a named NPC
  if (/\b(x\s*\d+|\d+\s*x|patrol|warriors?|guards?|sentries|males?|females?|young|raiders?|scouts?)\b/i.test(name)) {
    return false;
  }

  // Generic monster types = not a named NPC
  const genericMonsters = [
    'ape', 'bandit', 'bear', 'bat', 'boar', 'bugbear', 'centipede', 'beetle',
    'elf', 'gnoll', 'goblin', 'griffon', 'hobgoblin', 'kobold', 'lion',
    'lizardfolk', 'losel', 'commoner', 'naga', 'nixie', 'orc', 'otter',
    'owlbear', 'rat', 'riverman', 'snake', 'spider', 'stirge', 'thief',
    'turtle', 'wolf', 'wolverine', 'ogre', 'children', 'batrachianoid',
    'harpy', 'tick', 'mastiff', 'animal', 'herd', 'brigand', 'giant',
    'black', 'cave', 'wild', 'mountain', 'forest', 'river', 'huge', 'grey',
    'gray', 'small', 'large', 'medium', 'deadly', 'poisonous', 'carnivous', 'carnivorous',
    'slime', 'ooze', 'ghoul', 'ghouls', 'wraith', 'lich', 'mummy', 'vampire',
    'dragon', 'fungus', 'mold', 'naga', 'stirges', 'rats', 'snakes',
    'griffon', 'hobgoblin', 'lizardfolk', 'orc', 'stirge', 'nixie', 'mastiff',
    'gnoll', 'green', 'slime', 'snapping', 'normal', 'huge', 'dire'
  ];

  // Check first word and also check for "Type, descriptor" pattern (e.g., "Bear, black")
  const nameLower = name.toLowerCase();
  const firstWord = name.split(/[\s,]+/)[0].toLowerCase();

  if (genericMonsters.includes(firstWord)) {
    return false;
  }

  // Check for generic patterns like "Black Bear", "Giant rats", "Cave bats"
  const nameParts = name.split(/\s+/);
  if (nameParts.length >= 2) {
    const secondWord = nameParts[1].toLowerCase().replace(/[,()]/g, '');
    // If first word is descriptor and second is monster type
    if (genericMonsters.includes(firstWord) && genericMonsters.includes(secondWord)) {
      return false;
    }
    // If second word is monster type (e.g., "Black Bear", "Giant rats")
    if (genericMonsters.includes(secondWord)) {
      return false;
    }
  }

  // Check for role-based names (Brigand, crossbowman)
  if (/^(brigand|bandit|guard|warrior|scout|raider|sentry|patrol)\b/i.test(nameLower)) {
    return false;
  }

  // Quoted names are usually unique ("Charlie", "Pinky")
  if (/["']/.test(name)) return true;

  // Check for proper capitalized names (not just generic titles)
  // Names like "Grimlock Manface", "Fekk", "King
  const words = name.split(/\s+/);
  const hasProperName = words.some(word => {
    // Must start with capital and not be a generic title alone
    if (!/^[A-Z]/.test(word)) return false;
    const lower = word.toLowerCase();
    // Exclude generic titles when standalone
    const genericTitles = ['the', 'king', 'queen', 'chief', 'chieftain', 'leader', 'lord', 'lady', 'sir', 'captain', 'lieutenant', 'serjeant', 'shaman', 'priest'];
    return !genericTitles.includes(lower);
  });

  return hasProperName;
}

// Detect if stat block uses legacy format (needs Reforged conversion)
function detectLegacyFormat(block) {
  const text = (block.raw || block.fullText || '').toLowerCase();

  // Reforged indicators (C&C Reforged specific)
  const hasReforgedKeywords = /\b(primary attributes?|secondary attributes?|disposition|carries?|wears?)\b/i.test(text);

  // Legacy indicators (old D&D/AD&D style)
  const hasLegacyKeywords = /\b(thac0|saving throws?|to hit|morale|treasure type|no\. appearing)\b/i.test(text);

  // If it has Reforged keywords, it's updated
  if (hasReforgedKeywords) return false;

  // If it has legacy keywords or lacks Reforged structure, it's legacy
  if (hasLegacyKeywords) return true;

  // Check for minimal Reforged structure
  const hasHP = /\bhp\s*\d+/i.test(text);
  const hasAC = /\bac\s*\d+/i.test(text);
  const hasDisposition = /\bdisposition\b/i.test(text);
  const hasPrimaryAttrs = /\bprimary attributes?\b/i.test(text);

  // If it has HP/AC but missing disposition or primary attributes, likely legacy
  if ((hasHP || hasAC) && (!hasDisposition || !hasPrimaryAttrs)) {
    return true;
  }

  return false; // Assume modern if unclear
}

function buildReviewKey(block) {
  const fileKey = currentFilePath || 'global';
  const name = block.name || `block-${block.index || block._originalIndex || block.lineNumber || '0'}`;
  const line = block.lineNumber || block.lineStart || 0;
  return `review:${fileKey}::${name}::${line}`;
}

function getReviewFlag(key) {
  if (key in reviewState) return reviewState[key];
  try {
    const val = window.localStorage.getItem(key);
    if (val === '1') {
      reviewState[key] = true;
      return true;
    }
  } catch (e) {
    // ignore storage errors
  }
  reviewState[key] = false;
  return false;
}

function setReviewFlag(key, value) {
  reviewState[key] = !!value;
  try {
    if (value) {
      window.localStorage.setItem(key, '1');
    } else {
      window.localStorage.removeItem(key);
    }
  } catch (e) {
    // ignore storage errors
  }
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

// Helper to get currently filtered stat blocks
function getFilteredStatBlocks() {
  const searchInput = document.getElementById('statBlockSearch');
  const typeFilter = document.getElementById('statBlockTypeFilter');
  const statusFilter = document.getElementById('statBlockReviewFilter');
  const errorsOnly = document.getElementById('statBlockShowErrors');

  const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
  const selectedType = typeFilter ? typeFilter.value : 'all';
  const selectedStatus = statusFilter ? statusFilter.value : 'all';
  const showErrorsOnly = errorsOnly ? errorsOnly.checked : false;

  let blocksToFilter = statBlocks;

  // If showing missing stat blocks, create synthetic entries
  if (selectedType === 'missing') {
    const missingNames = findMissingStatBlocks();
    blocksToFilter = missingNames.map(name => ({
      name,
      type: 'missing',
      context: 'Referenced but Missing',
      lineNumber: null,
      lineStart: null,
      lineEnd: null,
      raw: '',
      fullText: '',
      isSynthetic: true
    }));
  } else {
    // For non-missing views, only show entries that have actual stat blocks
    // Also filter out entries from alphabetical lists (which are typically location references)
    blocksToFilter = statBlocks.filter(b => {
      if (b.hasStatBlock === false) return false;
      // Filter out entries with context "Alphabetical Listing" that don't have stat data
      if (b.context === 'Alphabetical Listing' && !b.raw.match(/\b(HD|HP|AC|XP)\s+\d+/i)) return false;
      // Additional check: if raw content is very short (under 50 chars) and has no stat keywords, it's likely a narrative mention
      const raw = b.raw || b.fullText || '';
      if (raw.length < 50 && !/\b(HD|HP|AC|XP|MV|Attack|Special|Saves)\s*[:=]?\s*\d+/i.test(raw)) return false;
      return true;
    });
  }

  return blocksToFilter.filter(block => {
    // Search filter
    if (searchTerm) {
      const name = (block.name || '').toLowerCase();
      const text = (block.raw || '').toLowerCase();
      if (!name.includes(searchTerm) && !text.includes(searchTerm)) {
        return false;
      }
    }

    // Type filter (skip for missing since we already filtered)
    if (selectedType !== 'all' && selectedType !== 'missing' && block.type !== selectedType) {
      return false;
    }

    // Status filter (skip for synthetic missing entries)
    if (!block.isSynthetic) {
      if (selectedStatus === 'reviewed' && !block.reviewed) return false;
      if (selectedStatus === 'unreviewed' && block.reviewed) return false;
    }

    const validation = block.validation || {};
    const errorCount = (typeof validation.errorCount === 'number')
      ? validation.errorCount
      : (validation.errors ? validation.errors.length : 0);
    const hasErrors = errorCount > 0;

    // Errors filter (skip for synthetic missing entries)
    if (!block.isSynthetic && showErrorsOnly && !hasErrors) {
      return false;
    }

    return true;
  });
}

function renderStatBlockList() {
  const container = document.getElementById('statBlockNavigator');
  if (!container) return;

  let filtered = getFilteredStatBlocks();

  if (filtered.length === 0) {
    container.innerHTML = '<p class="placeholder" style="padding: 12px;">No stat blocks match the filter.</p>';
    return;
  }

  // Sort based on mode
  if (statBlockSortMode === 'alphabetical') {
    filtered.sort((a, b) => {
      const nameA = (a.name || '').toLowerCase();
      const nameB = (b.name || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }

  // Group by context (area/room header) or alphabetically
  const groups = new Map();
  if (statBlockSortMode === 'section') {
    filtered.forEach(block => {
      const ctx = (block.context && block.context.trim()) ? block.context.trim() : 'No Context';
      if (!groups.has(ctx)) groups.set(ctx, []);
      groups.get(ctx).push(block);
    });
  } else {
    // Alphabetical: group by first letter
    filtered.forEach(block => {
      const name = block.name || 'Unknown';
      // Remove leading underscores, quotes, numbers, and special chars
      let cleanName = name.replace(/^[_"'\d\s\-]+/, '');
      // Skip common articles (The, A, An) for alphabetization
      cleanName = cleanName.replace(/^(The|A|An)\s+/i, '');
      const match = cleanName.match(/[A-Za-z]/);
      const firstLetter = match ? match[0].toUpperCase() : '#';
      if (!groups.has(firstLetter)) groups.set(firstLetter, []);
      groups.get(firstLetter).push(block);
    });
  }

  let html = '';

  // Sort groups
  const sortedGroups = Array.from(groups.entries()).sort((a, b) => {
    const keyA = a[0];
    const keyB = b[0];

    if (statBlockSortMode === 'section') {
      // For section mode, sort by first block's line number (document order)
      // Always put "Alphabetical Listing" at the end
      if (keyA === 'Alphabetical Listing') return 1;
      if (keyB === 'Alphabetical Listing') return -1;

      const firstBlockA = a[1][0];
      const firstBlockB = b[1][0];
      const lineA = firstBlockA.lineNumber || firstBlockA.lineStart || 0;
      const lineB = firstBlockB.lineNumber || firstBlockB.lineStart || 0;
      return lineA - lineB;
    } else {
      // For alphabetical mode, sort by letter
      // Put '#' at the end
      if (keyA === '#') return 1;
      if (keyB === '#') return -1;
      return keyA.localeCompare(keyB);
    }
  });

  sortedGroups.forEach(([ctx, blocksInGroup]) => {
    const collapsed = !!statContextCollapsed[ctx];
    const groupId = ctx.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'no-context';

    html += `
      <div class="stat-context-group" data-context-id="${groupId}">
        <div class="stat-context-header" data-context-key="${ctx}">
          <button class="stat-context-toggle" aria-label="Toggle group" style="border:none;background:none;padding:0 4px;cursor:pointer;font-size:11px;">${collapsed ? '▶' : '▼'}</button>
          <span class="stat-context-title" style="font-weight:600;">${escapeHtml(ctx)}</span>
          <span class="stat-context-count" style="margin-left:auto;font-size:11px;opacity:0.7;">${blocksInGroup.length}</span>
        </div>
        <div class="stat-context-body" style="${collapsed ? 'display:none;' : ''}">`;

    blocksInGroup.forEach((block) => {
      const idx = block._originalIndex;
      const activeClass = activeStatIndex === idx ? 'active' : '';
      const reviewedClass = block.reviewed ? ' reviewed' : '';

      const validation = block.validation || {};
      const errorCount = (typeof validation.errorCount === 'number')
        ? validation.errorCount
        : (validation.errors ? validation.errors.length : 0);
      const warningCount = (typeof validation.warningCount === 'number')
        ? validation.warningCount
        : (validation.warnings ? validation.warnings.length : 0);

      let statusBadge = '';
      if (errorCount > 0) {
        const label = errorCount === 1 ? '1 error' : `${errorCount} errors`;
        statusBadge = `<span style="margin-left:6px;font-size:11px;padding:1px 6px;border-radius:10px;background:#fdecea;color:#c0392b;white-space:nowrap;">⚠ ${label}</span>`;
      } else if (warningCount > 0) {
        const label = warningCount === 1 ? '1 warning' : `${warningCount} warnings`;
        statusBadge = `<span style="margin-left:6px;font-size:11px;padding:1px 6px;border-radius:10px;background:#fff4e5;color:#b26a00;white-space:nowrap;">⚠ ${label}</span>`;
      }

      // Add legacy badge if stat block needs Reforged conversion
      let legacyBadge = '';
      if (block.isLegacy) {
        legacyBadge = `<span style="margin-left:6px;font-size:11px;padding:1px 6px;border-radius:10px;background:#e3f2fd;color:#1976d2;white-space:nowrap;">🔄 Legacy</span>`;
      }

      html += `
          <div class="stat-block-item ${activeClass}${reviewedClass}" data-index="${idx}">
            <div class="stat-block-name">
              ${escapeHtml(block.name || `Block ${idx + 1}`)}
              <span class="stat-block-type ${block.type}">${block.type}</span>
              <button class="review-toggle" data-index="${idx}" title="${block.reviewed ? 'Mark unreviewed' : 'Mark reviewed'}">${block.reviewed ? '✔' : '○'}</button>
              ${legacyBadge}
              ${statusBadge}
            </div>
            ${block.context ? `<div class="stat-block-context">${escapeHtml(block.context)}</div>` : ''}
          </div>
        `;
    });

    html += `
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
  updateReviewSummary();

  // Bind click events for stat block items - navigate and show validation details
  container.querySelectorAll('.stat-block-item').forEach(item => {
    item.addEventListener('click', () => {
      const index = parseInt(item.getAttribute('data-index'), 10);
      if (!Number.isNaN(index) && statBlocks[index]) {
        navigateToStatBlock(statBlocks[index]);
        // showValidationDetails(statBlocks[index]); // Legacy function - no longer defined
      }
    });
  });

  // Bind review toggles
  container.querySelectorAll('.review-toggle').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.getAttribute('data-index'), 10);
      const block = statBlocks[idx];
      if (!block) return;
      const key = block._reviewKey || buildReviewKey(block);
      const newVal = !getReviewFlag(key);
      setReviewFlag(key, newVal);
      block.reviewed = newVal;

      // Track conversion if marking as reviewed (completed conversion)
      if (newVal && trackConversion) {
        trackConversion(block.name || `Block ${idx + 1}`);
      }

      renderStatBlockList();
      updateReviewSummary();
    });
  });

  // Bind collapsible group headers
  container.querySelectorAll('.stat-context-header').forEach(header => {
    header.addEventListener('click', (event) => {
      // Ignore clicks on inner stat-block items
      if (event.target && event.target.closest('.stat-block-item')) return;

      const ctxKey = header.getAttribute('data-context-key') || '';
      const body = header.nextElementSibling;
      const toggle = header.querySelector('.stat-context-toggle');
      if (!body) return;

      const isCollapsed = body.style.display === 'none';
      body.style.display = isCollapsed ? '' : 'none';
      if (toggle) toggle.textContent = isCollapsed ? '▼' : '▶';
      statContextCollapsed[ctxKey] = !isCollapsed;
    });
  });
}

function setHeaderCollapse(collapse) {
  headersCollapsed = !!collapse;
}

function applyHeaderCollapseState() {
  // Header tree removed; nothing to collapse
}

// Wire up header expand/collapse buttons
// (Header tree removed)

// Wire up search and filter controls
document.getElementById('statBlockSearch')?.addEventListener('input', renderStatBlockList);
document.getElementById('statBlockTypeFilter')?.addEventListener('change', renderStatBlockList);
document.getElementById('statBlockReviewFilter')?.addEventListener('change', renderStatBlockList);
document.getElementById('statBlockShowErrors')?.addEventListener('change', renderStatBlockList);

// Wire up sort mode toggle
document.getElementById('sortBySection')?.addEventListener('click', () => {
  statBlockSortMode = 'section';
  document.getElementById('sortBySection')?.classList.add('active');
  document.getElementById('sortAlphabetical')?.classList.remove('active');
  renderStatBlockList();
});
document.getElementById('sortAlphabetical')?.addEventListener('click', () => {
  const typeFilter = document.getElementById('statBlockTypeFilter');
  const selectedType = typeFilter ? typeFilter.value : 'all';

  // Only allow alphabetical sort when a specific type is selected
  if (selectedType === 'all') {
    return; // Do nothing if "All Types" is selected
  }

  statBlockSortMode = 'alphabetical';
  document.getElementById('sortAlphabetical')?.classList.add('active');
  document.getElementById('sortBySection')?.classList.remove('active');
  renderStatBlockList();
});

// Update alphabetical button state when type filter changes
document.getElementById('statBlockTypeFilter')?.addEventListener('change', () => {
  const typeFilter = document.getElementById('statBlockTypeFilter');
  const selectedType = typeFilter ? typeFilter.value : 'all';
  const alphabeticalBtn = document.getElementById('sortAlphabetical');

  if (selectedType === 'all') {
    // Disable alphabetical sort and switch to section view
    if (statBlockSortMode === 'alphabetical') {
      statBlockSortMode = 'section';
      document.getElementById('sortBySection')?.classList.add('active');
      alphabeticalBtn?.classList.remove('active');
    }
    alphabeticalBtn?.classList.add('disabled');
    alphabeticalBtn?.setAttribute('disabled', 'true');
  } else {
    alphabeticalBtn?.classList.remove('disabled');
    alphabeticalBtn?.removeAttribute('disabled');
  }

  renderStatBlockList();
});
document.getElementById('expandStatGroupsBtn')?.addEventListener('click', () => setStatGroupCollapsed(false));
document.getElementById('collapseStatGroupsBtn')?.addEventListener('click', () => setStatGroupCollapsed(true));
document.getElementById('missingStatBlocksBtn')?.addEventListener('click', () => showMissingStatBlocksReport());

// Manual refresh: allow explicit re-analysis on demand (read-only)
document.getElementById('refreshStatBlocksBtn')?.addEventListener('click', () => {
  analyzeDocumentStatBlocks();
});

const reviewFilter = document.getElementById('statBlockReviewFilter');
reviewFilter?.addEventListener('change', () => {
  statFilters.status = reviewFilter.value || 'all';
  renderStatBlockList();
});

// Wire up bulk review operations
document.getElementById('markAllReviewedBtn')?.addEventListener('click', () => {
  if (!confirm('Mark all visible stat blocks as reviewed?')) return;
  const filtered = getFilteredStatBlocks();
  filtered.forEach(block => {
    const key = block._reviewKey || buildReviewKey(block);
    setReviewFlag(key, true);
    block.reviewed = true;
  });
  renderStatBlockList();
  log(`Marked ${filtered.length} blocks as reviewed`, 'success');
});

document.getElementById('markAllUnreviewedBtn')?.addEventListener('click', () => {
  if (!confirm('Mark all visible stat blocks as unreviewed?')) return;
  const filtered = getFilteredStatBlocks();
  filtered.forEach(block => {
    const key = block._reviewKey || buildReviewKey(block);
    setReviewFlag(key, false);
    block.reviewed = false;
  });
  renderStatBlockList();
  log(`Marked ${filtered.length} blocks as unreviewed`, 'success');
});

document.getElementById('clearReviewStateBtn')?.addEventListener('click', () => {
  if (!confirm('Clear ALL review state for this file? This cannot be undone.')) return;
  statBlocks.forEach(block => {
    const key = block._reviewKey || buildReviewKey(block);
    setReviewFlag(key, false);
    block.reviewed = false;
  });
  renderStatBlockList();
  log('Cleared all review state', 'success');
});

function setStatGroupCollapsed(collapsed) {
  const contexts = new Set(
    statBlocks.map(b => (b.context && b.context.trim()) ? b.context.trim() : 'No Context')
  );
  statContextCollapsed = {};
  contexts.forEach(ctx => { statContextCollapsed[ctx] = collapsed; });
  renderStatBlockList();
}

function navigateToStatBlock(block) {
  console.log('=== navigateToStatBlock called ===', block?.name);
  if (!block) return;

  // Determine active index
  const idx = statBlocks.findIndex(b => b.index === block.index || b.lineNumber === block.lineNumber || b === block || (b.fullText && block.fullText && b.fullText === block.fullText));
  if (idx !== -1) {
    activeStatIndex = idx;
    navContext.mode = 'stat-block';
    navContext.index = idx;
    updateNavButtonsForContext();

    // Set the active stat start line for display
    activeStatStartLine = block.lineStart || block.lineNumber || null;
    console.log(`[navigateToStatBlock] "${block.name}" stored lineStart=${block.lineStart}, lineNumber=${block.lineNumber}`);
    
    updateLineInfoDisplay();
  }

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

  // Sync with Content Tree
  highlightInContentTree(block);

  // Jump cursor to the stat block in the editor
  let line = resolveBlockLine(block) || block.lineNumber || block.lineStart || 1;

  // First, try to verify the line number is still accurate by checking if the content matches
  if (block.name && currentContent && line > 0) {
    const lines = currentContent.split('\n');
    const targetLine = lines[line - 1];

    // If the stored line still contains the block name or raw content, trust it
    if (targetLine && (
      targetLine.toLowerCase().includes(block.name.toLowerCase()) ||
      (block.raw && targetLine.includes(block.raw.substring(0, 30)))
    )) {
      // Line number is still accurate, use it directly
      console.log(`[Navigate] Using stored line ${line} for "${block.name}"`);
    } else {
      // Line number is stale, search for the block
      console.log(`[Navigate] Line ${line} stale for "${block.name}", searching...`);
      const searchName = block.name.replace(/["']/g, '').trim();

      // Search the entire document for the best match
      let bestMatch = null;
      let bestDistance = Infinity;

      for (let i = 0; i < lines.length; i++) {
        const lineText = lines[i];

        // Try to match the raw content first (most precise)
        if (block.raw && lineText.includes(block.raw.substring(0, 50))) {
          bestMatch = i + 1;
          bestDistance = 0;
          break;
        }

        // Look for the name with various formatting patterns
        const patterns = [
          new RegExp(`\\*\\*${searchName}[:\\s]`, 'i'), // **Name: or **Name 
          new RegExp(`\\b${searchName}\\b`, 'i'),
          new RegExp(`\\b${searchName.replace(/\s+/g, '[\\s\\*]+')}\\b`, 'i')
        ];

        // For structural elements like "Block X", also try header patterns
        if (/^(block|section|area|room)\s*\d+/i.test(searchName)) {
          patterns.push(new RegExp(`^#{1,6}\\s*${searchName}\\b`, 'i'));
          patterns.push(new RegExp(`^${searchName}\\b`, 'i'));
        }

        for (const pattern of patterns) {
          if (pattern.test(lineText)) {
            const distance = Math.abs(i + 1 - line);
            // Prefer exact matches, then closest to expected line
            if (distance < bestDistance) {
              bestMatch = i + 1;
              bestDistance = distance;
            }
          }
        }
      }

      if (bestMatch !== null) {
        line = bestMatch;
        console.log(`[Navigate] Found "${block.name}" at line ${line}`);
        // Persist the corrected line so subsequent clicks use it
        block.lineNumber = line;
        block.lineStart = line;
      }
    }
  }

  jumpEditorToLine(line, true);

  // Flash the block name in the editor briefly to aid visual tracking
  if (block.name) {
    const editor = getEditorAdapter();
    const anchor = editor ? editor.selectionStart : null;
    flashNameInEditor(block.name, anchor);
  }

  // Sync header navigator highlight & scroll to matching section
  highlightHeaderForLine(line);

  log(`Navigated to stat block: ${block.name || 'Unknown'}`, 'info');
}

// Track last position for "jump back" functionality
let lastEditorPosition = { line: 0, ch: 0 };
let currentEditorPosition = { line: 0, ch: 0 };

function recordCurrentPosition() {
  const editor = getEditorAdapter();
  if (editor && editor.getCursor) {
    currentEditorPosition = { ...editor.getCursor() };
  }
}

function jumpToLastPosition() {
  const editor = getEditorAdapter();
  if (!editor) return;
  
  // Save current position before jumping
  recordCurrentPosition();
  
  // Jump to last position
  if (lastEditorPosition) {
    if (editor.setCursor) {
      editor.setCursor(lastEditorPosition);
      editor.focus();
      // Scroll position into view
      if (editor.scrollIntoView) {
        editor.scrollIntoView(lastEditorPosition, 100);
      }
    }
  }
}

function updateLastPosition() {
  if (currentEditorPosition.line !== lastEditorPosition.line || 
      currentEditorPosition.ch !== lastEditorPosition.ch) {
    lastEditorPosition = { ...currentEditorPosition };
  }
}

function updateNavButtonsForContext() {
  const prevBtn = document.getElementById('prevLineBtn');
  if (!prevBtn) return;

  prevBtn.textContent = '◀ Prev Line';
  prevBtn.title = 'Jump to last position (Ctrl+Alt+←)';
}

function navigateToPrevLine() {
  updateLastPosition();
  jumpToLastPosition();
}

// Show Validation Details Panel for a selected stat block
async function showStatDetails(block) {
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
    html += `<div style="margin-top:12px;"><details><summary style="cursor:pointer;">Show Raw Stat Block</summary><pre style="white-space:pre-wrap;padding:8px;background:#f8f9fa;border-radius:6px;margin-top:8px;">${(raw || '').replace(/</g, '&lt;')}</pre></details></div>`;

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
          content.innerHTML = `<p class="success">Applied ${applied.length} fix(es).</p><pre style="white-space:pre-wrap;padding:8px;background:#f8f9fa;border-radius:6px;margin-top:8px;">${(fixedText || '').replace(/</g, '&lt;')}</pre>`;
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

// Close validation panel button
document.getElementById('closeValidationBtn')?.addEventListener('click', () => {
  const panel = document.getElementById('statDetailsPanel');
  if (panel) panel.style.display = 'none';
});

// ============================================================================
// VELOCITY DASHBOARD FUNCTIONALITY
// ============================================================================

// Velocity Dashboard state
let velocityData = {
  sessionStart: Date.now(),
  conversionsToday: 0,
  sessionConversions: [],
  developmentCommits: 0,
  lastUpdate: Date.now(),
  aiBursts: [],
  totalAILines: 0,
  focusSession: {
    active: false,
    startTime: null,
    totalFocusMinutes: 0,
    sessionsToday: 0,
    focusWindows: []
  }
};

// Open Velocity Dashboard
document.getElementById('velocityDashboardBtn')?.addEventListener('click', () => {
  const modal = document.getElementById('velocityDashboardModal');
  if (modal) {
    modal.style.display = 'flex';
    updateVelocityDashboard();
  }
});

// Close Velocity Dashboard
document.getElementById('closeVelocityDashboardBtn')?.addEventListener('click', () => {
  const modal = document.getElementById('velocityDashboardModal');
  if (modal) modal.style.display = 'none';
});

// Tab switching
document.querySelectorAll('.velocity-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const targetTab = tab.getAttribute('data-tab');

    // Hide all tab contents
    document.querySelectorAll('.velocity-tab-content').forEach(content => {
      content.classList.remove('active');
    });

    // Remove active class from all tabs
    document.querySelectorAll('.velocity-tab').forEach(t => {
      t.classList.remove('active');
    });

    // Show target tab content
    const targetContent = document.getElementById(`velocity${targetTab.charAt(0).toUpperCase() + targetTab.slice(1)}`);
    if (targetContent) {
      targetContent.classList.add('active');
    }

    // Add active class to clicked tab
    tab.classList.add('active');
  });
});

// Update velocity dashboard with current data
async function updateVelocityDashboard() {
  // Calculate session time
  const sessionDuration = Date.now() - velocityData.sessionStart;
  const sessionHours = Math.floor(sessionDuration / (1000 * 60 * 60));
  const sessionMinutes = Math.floor((sessionDuration % (1000 * 60 * 60)) / (1000 * 60));

  // Update overview tab
  document.getElementById('sessionTime').textContent = `${sessionHours}h ${sessionMinutes}m`;
  document.getElementById('monstersToday').textContent = velocityData.conversionsToday;

  // Calculate average time per monster
  const avgTime = velocityData.sessionConversions.length > 0
    ? sessionDuration / velocityData.sessionConversions.length / (1000 * 60)
    : 0;
  document.getElementById('avgTimePerMonster').textContent = avgTime > 0
    ? `${avgTime.toFixed(1)} min`
    : '--';

  // Update progress (using current stat blocks)
  if (statBlocks && statBlocks.length > 0) {
    const total = statBlocks.length;
    const converted = statBlocks.filter(block =>
      block.validation && block.validation.errorCount === 0 && block.validation.warningCount === 0
    ).length;
    const progress = Math.round((converted / total) * 100);

    document.getElementById('totalMonsters').textContent = total;
    document.getElementById('convertedMonsters').textContent = converted;
    document.getElementById('progressPercent').textContent = `${progress}%`;
    document.getElementById('progressFill').style.width = `${progress}%`;

    // Update forecast
    const remaining = total - converted;
    const rate = velocityData.conversionsToday > 0 ? velocityData.conversionsToday : 5; // fallback rate
    const daysRemaining = Math.ceil(remaining / rate);
    const estDate = new Date();
    estDate.setDate(estDate.getDate() + daysRemaining);

    document.getElementById('estCompletion').textContent = estDate.toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    });
    document.getElementById('daysRemaining').textContent = daysRemaining;
    document.getElementById('requiredRate').textContent = `${(remaining / 21).toFixed(1)} monsters/day`;
    document.getElementById('currentRate').textContent = `${rate.toFixed(1)} monsters/day`;
  }

  // Update development metrics (only if elements exist)
  const devCommitsEl = document.getElementById('devCommits');
  if (devCommitsEl) devCommitsEl.textContent = velocityData.developmentCommits;

  const conversionRateEl = document.getElementById('conversionRate');
  if (conversionRateEl) conversionRateEl.textContent = `${velocityData.conversionsToday}/day`;


  // Fetch real velocity data from log
  try {
    const result = await window.electronAPI.getVelocityData();
    console.log('Velocity data result:', result);

    // Handle Summary Data (Synergy & Code Survival)
    if (result.success && result.summary) {
      console.log('Processing summary data:', result.summary);
      const s = result.summary;

      // Synergy Metrics
      if (s.synergy) {
        const synEl = document.getElementById('synergyRatio');
        if (synEl) synEl.textContent = s.synergy.synergy_ratio !== undefined ? s.synergy.synergy_ratio.toFixed(2) : '--';

        const regEl = document.getElementById('regressionRate');
        if (regEl) regEl.textContent = s.synergy.regression_rate !== undefined ? `${(s.synergy.regression_rate * 100).toFixed(1)}%` : '--%';

        const netEl = document.getElementById('netSynergyVelocity');
        const badgeEl = document.getElementById('velocityBadge');
        if (s.synergy.net_synergy_velocity !== undefined) {
          const speed = s.synergy.net_synergy_velocity;
          if (netEl) netEl.textContent = speed.toFixed(2);

          // Add multiplier badge
          if (badgeEl) {
            const context = getVelocityContext(speed, 'commits');
            badgeEl.textContent = `${context.icon} ${context.label}`;
            badgeEl.style.color = context.color;
            badgeEl.title = context.description;
          }
        } else {
          if (netEl) netEl.textContent = '--';
          if (badgeEl) badgeEl.textContent = '';
        }
      }

      // Code Survival
      if (s.code_survival) {
        const survEl = document.getElementById('codeSurvivalRate');
        if (survEl) survEl.textContent = s.code_survival.survival_rate !== undefined ? `${(s.code_survival.survival_rate * 100).toFixed(1)}%` : '--%';
      }
    }

    if (result.success && result.data && result.data.length > 0) {
      // Get the most recent entry
      const latest = result.data[result.data.length - 1];

      // Fallback: Code Survival Rate from log if not in summary
      if ((!result.summary || !result.summary.code_survival) && latest.churn_metrics && latest.churn_metrics.survival_rate !== undefined) {
        const survivalRate = latest.churn_metrics.survival_rate;
        const survivalEl = document.getElementById('codeSurvivalRate');
        if (survivalEl) {
          survivalEl.textContent = `${(survivalRate * 100).toFixed(1)}%`;
        }
      }

      // AI Paste Count
      if (latest.ai_paste_count !== undefined) {
        const aiPasteCount = latest.ai_paste_count;
        const aiPasteEl = document.getElementById('aiPasteCount');
        if (aiPasteEl) {
          aiPasteEl.textContent = aiPasteCount;
        }
      }

      // Code Changes (Churn) - using churn_ratio
      if (latest.churn_metrics && latest.churn_metrics.churn_ratio !== undefined) {
        const churn = latest.churn_metrics.churn_ratio;
        const churnEl = document.getElementById('codeChanges');
        if (churnEl) {
          churnEl.textContent = `${(churn * 100).toFixed(1)}% Churn`;
        }
      }
    }
  } catch (e) {
    console.error('Failed to load velocity log data', e);
  }

  // Render mini chart
  renderMiniChart();
}// Render mini conversion trend chart
function renderMiniChart() {
  const chartContainer = document.getElementById('conversionTrendChart');
  if (!chartContainer) return;

  // Generate mock data for the last 7 days
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const data = [3, 5, 2, 8, 4, 6, velocityData.conversionsToday];
  const maxValue = Math.max(...data, 10);

  // Create simple bar chart
  const chartHTML = `
    <div style="display: flex; align-items: end; height: 100%; gap: 8px; padding: 10px;">
      ${days.map((day, index) => `
        <div style="flex: 1; display: flex; flex-direction: column; align-items: center;">
          <div style="width: 100%; background: #007bff; height: ${(data[index] / maxValue) * 80}px; border-radius: 2px;"></div>
          <span style="font-size: 10px; color: #6c757d; margin-top: 4px;">${day}</span>
          <span style="font-size: 9px; color: #495057; font-weight: 500;">${data[index]}</span>
        </div>
      `).join('')}
    </div>
  `;

  chartContainer.innerHTML = chartHTML;
}

// Track conversion when stat block is marked as reviewed
function trackConversion(blockName) {
  const now = Date.now();
  velocityData.sessionConversions.push({
    name: blockName,
    timestamp: now
  });
  velocityData.conversionsToday++;
  velocityData.lastUpdate = now;

  // Update dashboard if it's open
  const modal = document.getElementById('velocityDashboardModal');
  if (modal && modal.style.display !== 'none') {
    updateVelocityDashboard();
  }
}

// Track development activity (mock for now)
function trackDevelopmentActivity() {
  velocityData.developmentCommits++;
}

// Initialize velocity tracking
function initializeVelocityTracking() {
  // Load saved data from localStorage if available
  const saved = localStorage.getItem('velocityData');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      // Check if it's the same day
      const today = new Date().toDateString();
      const lastDate = new Date(parsed.lastUpdate).toDateString();

      if (today === lastDate) {
        velocityData = { ...parsed, sessionStart: Date.now() };
      } else {
        // New day, keep long-term stats but reset daily counters
        velocityData = { 
          ...parsed,
          sessionStart: Date.now(),
          conversionsToday: 0,
          sessionConversions: []
        };
      }
      
      // Ensure focusSession exists (migration for existing data)
      if (!velocityData.focusSession) {
        velocityData.focusSession = {
          active: false,
          startTime: null,
          totalFocusMinutes: 0,
          sessionsToday: 0,
          focusWindows: []
        };
      } else if (today !== lastDate) {
        // Reset focus session stats for new day
        velocityData.focusSession.totalFocusMinutes = 0;
        velocityData.focusSession.sessionsToday = 0;
        velocityData.focusSession.focusWindows = [];
        velocityData.focusSession.active = false;
        velocityData.focusSession.startTime = null;
      }

      // Restore UI state if session is active
      if (velocityData.focusSession.active) {
        const toggleBtn = document.getElementById('focusToggle');
        const label = document.getElementById('focusLabel');
        if (toggleBtn) toggleBtn.classList.add('active');
        if (label) label.textContent = 'End Focus';
        console.log('Resuming active focus session from storage');
      }
    } catch (e) {
      console.error('Failed to load velocity data:', e);
    }
  }

  // Save data periodically
  setInterval(() => {
    localStorage.setItem('velocityData', JSON.stringify(velocityData));
  }, 30000); // every 30 seconds

  // Start Session Timer
  startSessionTimer();
}

// Session Timer Logic
let sessionTimerInterval;
let currentSessionState = 'planning'; // planning, coding, testing
let sessionTimeBreakdown = {
  planning: 0,
  coding: 0,
  testing: 0
};

function startSessionTimer() {
  if (sessionTimerInterval) clearInterval(sessionTimerInterval);

  sessionTimerInterval = setInterval(() => {
    // Increment current state time
    sessionTimeBreakdown[currentSessionState] += 1000;

    // Update UI
    updateSessionTimerUI();
  }, 1000);

  // Initialize buttons
  document.querySelectorAll('.session-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const newState = btn.getAttribute('data-state');
      setSessionState(newState);
    });
  });

  // Set initial active state
  setSessionState('planning');
}

function setSessionState(state) {
  currentSessionState = state;

  // Update buttons
  document.querySelectorAll('.session-btn').forEach(btn => {
    if (btn.getAttribute('data-state') === state) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

function updateSessionTimerUI() {
  const totalMs = sessionTimeBreakdown.planning + sessionTimeBreakdown.coding + sessionTimeBreakdown.testing;

  // Update main timer display
  const totalSecs = Math.floor(totalMs / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

  const timerDisplay = document.getElementById('sessionTimerDisplay');
  if (timerDisplay) timerDisplay.textContent = timeStr;

  // Update stats bar
  if (totalMs > 0) {
    const planPct = (sessionTimeBreakdown.planning / totalMs) * 100;
    const codePct = (sessionTimeBreakdown.coding / totalMs) * 100;
    const testPct = (sessionTimeBreakdown.testing / totalMs) * 100;

    const barPlan = document.querySelector('.stat-segment.plan');
    const barCode = document.querySelector('.stat-segment.code');
    const barTest = document.querySelector('.stat-segment.test');

    if (barPlan) barPlan.style.width = `${planPct}%`;
    if (barCode) barCode.style.width = `${codePct}%`;
    if (barTest) barTest.style.width = `${testPct}%`;

    // Update legend text
    const planM = Math.floor(sessionTimeBreakdown.planning / 60000);
    const codeM = Math.floor(sessionTimeBreakdown.coding / 60000);
    const testM = Math.floor(sessionTimeBreakdown.testing / 60000);

    const elPlan = document.getElementById('timePlan');
    const elCode = document.getElementById('timeCode');
    const elTest = document.getElementById('timeTest');

    if (elPlan) elPlan.textContent = `${planM}m`;
    if (elCode) elCode.textContent = `${codeM}m`;
    if (elTest) elTest.textContent = `${testM}m`;
  }
}

// initialize(); // Legacy function - no longer defined
updateUndoButton();
initializeVelocityTracking();

// Set default UI state for stat block navigator
setTimeout(() => {
  const typeFilter = document.getElementById('statBlockTypeFilter');
  const alphabeticalBtn = document.getElementById('sortAlphabetical');
  const sectionBtn = document.getElementById('sortBySection');

  if (typeFilter) typeFilter.value = 'monster';
  if (alphabeticalBtn) alphabeticalBtn.classList.add('active');
  if (sectionBtn) sectionBtn.classList.remove('active');
}, 100);

// ============================================================================
// PASSIVE AI BURST DETECTION
// ============================================================================

// Listen for AI burst events from the file watcher
if (window.electronAPI && window.electronAPI.onTelemetryUpdate) {
  window.electronAPI.onTelemetryUpdate((event, data) => {
    if (data.type === 'AI_BURST') {
      // Track the burst
      velocityData.aiBursts.push(data);
      velocityData.totalAILines += data.lines_added;

      // Update dashboard if open
      const modal = document.getElementById('velocityDashboardModal');
      if (modal && modal.style.display !== 'none') {
        updateAIBurstStats();
      }

      // Optional: Show notification
      console.log(`⚡ AI Burst: +${data.lines_added} lines in ${data.file}`);
    }
  });
}

function updateAIBurstStats() {
  // Update AI Paste Count in Development tab
  const aiPasteEl = document.getElementById('aiPasteCount');
  if (aiPasteEl) {
    aiPasteEl.textContent = velocityData.aiBursts.length;
  }

  // Update Code Changes to show AI contribution
  const codeChangesEl = document.getElementById('codeChanges');
  if (codeChangesEl) {
    codeChangesEl.textContent = `+${velocityData.totalAILines} lines (AI)`;
  }
}

// ============================================================================
// FOCUS SESSION TRACKING (Sniper Mode)
// ============================================================================

function toggleFocusSession() {
  const fs = velocityData.focusSession;
  const toggleBtn = document.getElementById('focusToggle');
  const label = document.getElementById('focusLabel');

  if (!fs.active) {
    // START FOCUS
    fs.active = true;
    fs.startTime = Date.now();
    fs.currentActivity = currentSessionState || 'planning'; // Track what type of work

    if (toggleBtn) toggleBtn.classList.add('active');
    if (label) label.textContent = 'End Focus';

    console.log(`🎯 Focus Session Started (${fs.currentActivity})`);

    // Log to session log
    logFocusEvent({
      type: 'FOCUS_START',
      context: fs.currentActivity
    });
  } else {
    // END FOCUS
    const duration = (Date.now() - fs.startTime) / 60000; // minutes
    fs.totalFocusMinutes += duration;
    fs.sessionsToday++;

    // Track time by activity type
    const activity = fs.currentActivity || 'planning';
    if (!fs.timeByActivity) fs.timeByActivity = {};
    fs.timeByActivity[activity] = (fs.timeByActivity[activity] || 0) + duration;

    fs.focusWindows.push({
      start: fs.startTime,
      end: Date.now(),
      duration: duration,
      activity: activity
    });
    fs.active = false;
    fs.startTime = null;
    fs.currentActivity = null;

    if (toggleBtn) toggleBtn.classList.remove('active');
    if (label) label.textContent = 'Start Focus';

    console.log(`🎯 Focus Session Ended: ${duration.toFixed(1)} minutes (${activity})`);
    console.log(`📊 Total Focus Today: ${fs.totalFocusMinutes.toFixed(1)} minutes (${fs.sessionsToday} sessions)`);
    console.log(`📊 By Activity:`, fs.timeByActivity);

    // Log to session log
    logFocusEvent({
      type: 'FOCUS_END',
      duration: duration,
      activity: activity,
      timeByActivity: fs.timeByActivity
    });

    // Update the session progress bars
    updateSessionProgressBars();

    // Save to localStorage
    localStorage.setItem('velocityData', JSON.stringify(velocityData));
  }
}

function logFocusEvent(event) {
  // This would ideally write to session-log.jsonl via IPC
  // For now, just log to console
  console.log('Focus Event:', {
    timestamp: new Date().toISOString(),
    ...event
  });
}

// Wire up the focus toggle button
document.getElementById('focusToggle')?.addEventListener('click', toggleFocusSession);

function updateSessionProgressBars() {
  const fs = velocityData.focusSession;
  if (!fs.timeByActivity) return;
  
  const total = fs.totalFocusMinutes || 1; // Avoid division by zero
  const planning = fs.timeByActivity.planning || 0;
  const coding = fs.timeByActivity.coding || 0;
  const testing = fs.timeByActivity.testing || 0;
  
  // Update progress bar widths
  const planBar = document.querySelector('.stat-segment.plan');
  const codeBar = document.querySelector('.stat-segment.code');
  const testBar = document.querySelector('.stat-segment.test');
  
  if (planBar) planBar.style.width = `${(planning / total * 100).toFixed(1)}%`;
  if (codeBar) codeBar.style.width = `${(coding / total * 100).toFixed(1)}%`;
  if (testBar) testBar.style.width = `${(testing / total * 100).toFixed(1)}%`;
  
  // Update legend
  const legend = document.querySelector('.session-legend');
  if (legend) {
    legend.innerHTML = `
      <div><span class="legend-dot plan"></span> Plan: ${planning.toFixed(0)}m</div>
      <div><span class="legend-dot code"></span> Code: ${coding.toFixed(0)}m</div>
      <div><span class="legend-dot test"></span> Test: ${testing.toFixed(0)}m</div>
    `;
  }
}

// Refresh Velocity Metrics Button
document.getElementById('refreshMetricsBtn')?.addEventListener('click', async () => {
  const btn = document.getElementById('refreshMetricsBtn');
  if (!btn) return;
  
  btn.classList.add('loading');
  btn.disabled = true;
  
  try {
    const result = await window.electronAPI.refreshVelocityMetrics();
    
    if (result.success) {
      console.log('✅ Metrics refreshed successfully');
      // Reload the dashboard
      updateVelocityDashboard();
    } else {
      console.error('❌ Failed to refresh metrics:', result.error);
      alert('Failed to refresh metrics. Check console for details.');
    }
  } catch (e) {
    console.error('Error refreshing metrics:', e);
    alert('Error refreshing metrics. Make sure the velocity scripts are available.');
  } finally {
    btn.classList.remove('loading');
    btn.disabled = false;
  }
});

// ============================================================================
// STAT BLOCK HIGHLIGHTING
// ============================================================================


// ============================================================================
