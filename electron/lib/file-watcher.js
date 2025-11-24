/**
 * electron/lib/file-watcher.js
 * Passive AI Burst Detector
 * Monitors file save velocity to distinguish Human Typing vs. AI Pasting.
 */
const chokidar = require('chokidar');
const fs = require('fs');
const path = require('path');

// CONFIGURATION
const WATCH_DIR = path.resolve(__dirname, '../../'); // Watch project root
const LOG_FILE = path.join(WATCH_DIR, 'velocity-tracker-template', 'session-log.jsonl');
const IGNORED = [
    /(^|[\/\\])\../,       // Dotfiles (.git, .next)
    /node_modules/,
    /dist/,
    /build/,
    /velocity-tracker/,    // Don't watch the logs themselves!
    /\.log$/,
    /\.lock$/
];

// STATE
let fileCache = new Map(); // Stores { lineCount, lastModified }
let isReady = false;
let lastActivityTime = null;
let implicitFocusActive = false;

function countLines(content) {
    return content.split('\n').length;
}

function appendLog(event) {
    // Ensure directory exists
    const logDir = path.dirname(LOG_FILE);
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

    const entry = JSON.stringify({
        timestamp: new Date().toISOString(),
        ...event
    }) + '\n';

    // Use appendFile to be non-blocking
    fs.appendFile(LOG_FILE, entry, (err) => {
        if (err) console.error('Failed to log burst:', err);
    });
}

function startWatcher(mainWindow) {
    console.log('👁️  Starting Passive AI Watcher on:', WATCH_DIR);

    const watcher = chokidar.watch(WATCH_DIR, {
        ignored: IGNORED,
        persistent: true,
        ignoreInitial: true, // Don't log initial scan
        awaitWriteFinish: { // Wait for write to stabilize (crucial for AI pastes)
            stabilityThreshold: 300,
            pollInterval: 100
        }
    });

    watcher.on('add', (filePath) => handleFileChange(filePath, 'create', mainWindow));
    watcher.on('change', (filePath) => handleFileChange(filePath, 'update', mainWindow));

    return watcher;
}

function handleFileChange(filePath, type, mainWindow) {
    fs.readFile(filePath, 'utf8', (err, content) => {
        if (err) return;

        const currentLines = countLines(content);
        const now = Date.now();
        const prev = fileCache.get(filePath) || { lineCount: 0, lastModified: now - 10000 };

        const lineDelta = currentLines - prev.lineCount;
        const timeDelta = now - prev.lastModified; // in ms

        // UPDATE CACHE
        fileCache.set(filePath, { lineCount: currentLines, lastModified: now });

        // 0. PASSIVE FLOW DETECTION (Sniper Mode)
        // Detect sustained activity (bursts within 5 minutes = implicit focus)
        if (lastActivityTime && (now - lastActivityTime) < 300000) {
            // Activity within 5 minutes = sustained flow
            if (!implicitFocusActive) {
                implicitFocusActive = true;
                console.log('🎯 Implicit Focus Session Started (sustained activity detected)');
                appendLog({ type: 'IMPLICIT_FOCUS_START' });
            }
        } else if (lastActivityTime && (now - lastActivityTime) > 900000) {
            // 15+ minute gap = session break
            if (implicitFocusActive) {
                implicitFocusActive = false;
                console.log('🎯 Implicit Focus Session Ended (15+ min gap)');
                appendLog({ type: 'IMPLICIT_FOCUS_END' });
            }
        }
        lastActivityTime = now;

        // 1. BURST DETECTION LOGIC
        // Threshold: Adding > 5 lines in under 2 seconds (Human max is ~1-2 lines/sec)
        // We strictly look for POSITIVE growth (adding code). Deletions are separate.
        const isBurst = lineDelta > 5 && timeDelta < 2000;

        if (isBurst) {
            const event = {
                type: 'AI_BURST',
                file: path.basename(filePath),
                lines_added: lineDelta,
                time_delta_ms: timeDelta,
                velocity: (lineDelta / (timeDelta / 1000)).toFixed(1) + " lines/sec"
            };

            console.log(`⚡ AI BURST DETECTED: +${lineDelta} lines in ${timeDelta}ms (${event.file})`);

            // 1. Log to JSONL (Persistence)
            appendLog(event);

            // 2. Send to Dashboard (Real-time)
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('telemetry-update', event);
            }
        }
        else if (lineDelta > 0) {
            // Manual typing event (optional: log aggregated manual stats)
            // console.log(`✍️  Manual: +${lineDelta} lines`);
        }
    });
}

module.exports = { startWatcher };
