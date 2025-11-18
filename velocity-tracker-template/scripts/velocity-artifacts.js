#!/usr/bin/env node
// eslint-disable-next-line
// Above shebang must remain first line for CLI execution
/**
 * velocity-artifacts.js v1.0.0
 *
 * Generates a human‑readable velocity forecast markdown file from the
 * structured line‑delimited JSON log at ./.logs/velocity-log.jsonl.
 *
 * Usage:
 *   node scripts/velocity-artifacts.js                 # default output docs/velocity-forecast.md
 *   node scripts/velocity-artifacts.js --out other.md  # custom output path
 *   node scripts/velocity-artifacts.js --limit 15       # limit recent samples considered for rolling avg
 *
 * Each JSONL entry is expected to contain at minimum:
 *   timestamp, commitCount, totalDurationSeconds, phases (object of phaseName -> {status})
 * Optional fields (if present) are surfaced: estimates, cliCommand.
 *
 * The script selects the latest entry (chronological by timestamp) as the
 * anchor snapshot, computes rolling averages over the last N (default 10)
 * entries, and emits a markdown summary similar to the manually written
 * example currently in docs/velocity-forecast.md.
 *
 * Safety & Failure Modes:
 * - If log file missing or empty: produces a placeholder forecast with guidance.
 * - If JSON parse fails on a line: line skipped (reported in diagnostics section).
 * - Never throws for common file errors (exits 0 with placeholder).
 */

/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const VELOCITY_LOG_FILENAME = 'velocity-log.jsonl';
const DEBUG_LOG_FILENAME = 'debug-session.jsonl';
const SUCCESS_TYPE = 'ai_fix_success';
const FAILURE_TYPE = 'ai_fix_failure_regression';

const { execSync } = require('child_process');
function parseArgs(argv){
  const args = { out: 'docs/velocity-forecast.md', limit: 10 };
  for (let i=2;i<argv.length;i++){
    const a = argv[i];
    if (a === '--out' && argv[i+1]) { args.out = argv[++i]; continue; }
    if (a === '--limit' && argv[i+1]) { args.limit = Math.max(1, parseInt(argv[++i],10)||10); continue; }
    if (a === '--help') { args.help = true; }
  }
  return args;
}

function formatDuration(seconds){
  if (!Number.isFinite(seconds) || seconds <= 0) return '0h00m';
  const h = Math.floor(seconds/3600);
  const m = Math.floor((seconds%3600)/60);
  const s = Math.floor(seconds%60);
  return `${h}h${String(m).padStart(2,'0')}m${s>0?`${String(s).padStart(2,'0')}s`:''}`;
}

function pct(n){
  return (Math.round(n*1000)/10).toFixed(1)+'%';
}

function humanList(arr){
  if (!arr.length) return 'None';
  if (arr.length === 1) return arr[0];
  if (arr.length === 2) return arr.join(' & ');
  return arr.slice(0,-1).join(', ') + ' & ' + arr[arr.length-1];
}

function computeRolling(entries, limit){
  const slice = entries.slice(-limit);
  if (!slice.length) return null;
  const totalCommits = slice.reduce((a,e)=>a+(e.commitCount||0),0);
  const totalSeconds = slice.reduce((a,e)=>a+(e.totalDurationSeconds||0),0);
  return {
    sampleSize: slice.length,
    commitCount: totalCommits,
    totalDurationSeconds: totalSeconds,
    commitsPerHour: totalSeconds>0 ? (totalCommits / (totalSeconds/3600)) : 0
  };
}

/**
 * Scan git log for keywords indicating fixes, rollbacks, or failures
 * between `sinceIso` and `untilIso`.
 * Returns counts and sample messages.
 */
function scanGitForSignals(sinceIso, untilIso){
  try{
    const sinceArg = sinceIso ? `--since="${sinceIso}"` : '';
    const untilArg = untilIso ? `--until="${untilIso}"` : '';
    const format = '%H||%an||%ad||%s';
    const cmd = `git log ${sinceArg} ${untilArg} --pretty=format:"${format}"`;
    const out = execSync(cmd, { encoding: 'utf8' }).trim();
    if (!out) return { found: 0, fixes: 0, failures: 0, reverts: 0, samples: [] };

    const lines = out.split('\n');
    let fixes = 0, failures = 0, reverts = 0;
    const samples = [];
    const modelCounts = {};
    const fixRegex = /\bfix\b|\bfixes\b|\bfixed\b|\bCRITICAL FIX\b|\bHOTFIX\b/i;
    const failureRegex = /\bfail\b|\bfailure\b|\bregression\b|\berror\b/i;
    const revertRegex = /\brevert\b|\brollback\b/i;
    const modelTagRegex = /\[AI:([^\]]+)\]/i;

    for (const l of lines){
      const parts = l.split('||');
      if (parts.length < 4) continue;
      const subject = parts[3] || '';

      const isFix = fixRegex.test(subject);
      const isFailure = failureRegex.test(subject);
      const isRevert = revertRegex.test(subject);

      if (isFix) fixes++;
      if (isFailure) failures++;
      if (isRevert) reverts++;

      const modelMatch = subject.match(modelTagRegex);
      if (modelMatch) {
        const rawModel = modelMatch[1].trim();
        const model = rawModel || 'unknown';
        if (!modelCounts[model]) {
          modelCounts[model] = { commits: 0, fixes: 0, failures: 0, reverts: 0 };
        }
        modelCounts[model].commits += 1;
        if (isFix) modelCounts[model].fixes += 1;
        if (isFailure) modelCounts[model].failures += 1;
        if (isRevert) modelCounts[model].reverts += 1;
      }

      if (fixes + failures + reverts < 10 && (isFix || isFailure || isRevert)) {
        samples.push({ commit: parts[0], author: parts[1], date: parts[2], subject });
      }
    }

    return { found: lines.length, fixes, failures, reverts, samples, model_counts: modelCounts };
  }
  catch(err){
    // If git not available or error, return empty
    return { found: 0, fixes: 0, failures: 0, reverts: 0, samples: [], model_counts: {} };
  }
}

function normalizeEntry(entry){
  const commitCount = Number.isFinite(entry.commitCount)
    ? entry.commitCount
    : Number.isFinite(entry.total_commits)
      ? entry.total_commits
      : Number.isFinite(entry.totalCommits)
        ? entry.totalCommits
        : 0;
  const durationSeconds = Number.isFinite(entry.totalDurationSeconds)
    ? entry.totalDurationSeconds
    : Number.isFinite(entry.total_elapsed_seconds)
      ? entry.total_elapsed_seconds
      : Number.isFinite(entry.total_elapsed_minutes)
        ? entry.total_elapsed_minutes * 60
        : Number.isFinite(entry.total_elapsed_hours)
          ? entry.total_elapsed_hours * 3600
          : 0;
  const commitsPerHour = Number.isFinite(entry.commitsPerHour)
    ? entry.commitsPerHour
    : Number.isFinite(entry.commits_per_hour)
      ? entry.commits_per_hour
      : durationSeconds > 0
        ? commitCount / (durationSeconds / 3600)
        : 0;
  return {
    ...entry,
    commitCount,
    totalDurationSeconds: durationSeconds,
    commitsPerHour,
  };
}

function pickLogPath(){
  const preferred = path.join(process.cwd(), '.logs', VELOCITY_LOG_FILENAME);
  const fallback = path.join(process.cwd(), VELOCITY_LOG_FILENAME);
  if (fs.existsSync(preferred)) return preferred;
  if (fs.existsSync(fallback)) return fallback;
  return preferred;
}

function pickDebugLogPath(){
  const preferred = path.join(process.cwd(), '.logs', DEBUG_LOG_FILENAME);
  const fallback = path.join(process.cwd(), DEBUG_LOG_FILENAME);
  if (fs.existsSync(preferred)) return preferred;
  if (fs.existsSync(fallback)) return fallback;
  return null;
}

function readDebugSignals(){
  const file = pickDebugLogPath();
  if (!file) return [];
  const raw = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
  const entries = [];
  raw.forEach(line => {
    try {
      const obj = JSON.parse(line);
      const ts = obj.timestamp ? new Date(obj.timestamp) : null;
      if (!ts || Number.isNaN(ts.getTime())) return;
      entries.push({
        ...obj,
        timestampMs: ts.getTime(),
        timestampISO: ts.toISOString(),
        signal_type: (obj.signal_type || obj.type || 'unspecified').toLowerCase(),
      });
    } catch {
      /* ignore malformed line */
    }
  });
  return entries;
}

function deriveWindow(entry){
  if (!entry) return null;
  const end = entry.end ? new Date(entry.end) : (entry.timestamp ? new Date(entry.timestamp) : new Date());
  if (Number.isNaN(end.getTime())) return null;
  let durationSeconds = Number.isFinite(entry.totalDurationSeconds)
    ? entry.totalDurationSeconds
    : Number.isFinite(entry.total_elapsed_seconds)
      ? entry.total_elapsed_seconds
      : Number.isFinite(entry.total_elapsed_minutes)
        ? entry.total_elapsed_minutes * 60
        : Number.isFinite(entry.total_elapsed_hours)
          ? entry.total_elapsed_hours * 3600
          : 0;
  if (durationSeconds <= 0 && Number.isFinite(entry.commitCount) && Number.isFinite(entry.commitsPerHour) && entry.commitsPerHour > 0) {
    durationSeconds = (entry.commitCount / entry.commitsPerHour) * 3600;
  }
  if (durationSeconds <= 0) durationSeconds = 12 * 3600; // default 12h window
  const start = entry.start ? new Date(entry.start) : new Date(end.getTime() - durationSeconds * 1000);
  return {
    start,
    end,
    durationSeconds,
    hours: durationSeconds / 3600,
  };
}

function summarizeSynergy(signals, latestEntry, gitSignals){
  if (!latestEntry) {
    return { window_hours: 0, successful_ai_fixes: 0, ai_induced_failures: 0, signals_considered: 0 };
  }
  const window = deriveWindow(latestEntry);
  if (!window) {
    return { window_hours: 0, successful_ai_fixes: 0, ai_induced_failures: 0, signals_considered: 0 };
  }
  const { start, end, hours } = window;
  const startMs = start.getTime();
  const endMs = end.getTime();
  const withinWindow = (signals || []).filter(sig => sig.timestampMs >= startMs && sig.timestampMs <= endMs);
  const successCount = withinWindow.filter(sig => sig.signal_type === SUCCESS_TYPE).length;
  const failureCount = withinWindow.filter(sig => sig.signal_type === FAILURE_TYPE).length;
  const commitCount = Number.isFinite(latestEntry.commitCount)
    ? latestEntry.commitCount
    : Number.isFinite(latestEntry.total_commits)
      ? latestEntry.total_commits
      : 0;
  const commitsPerHour = Number.isFinite(latestEntry.commitsPerHour)
    ? latestEntry.commitsPerHour
    : Number.isFinite(latestEntry.commits_per_hour)
      ? latestEntry.commits_per_hour
      : 0;
  const denom = Math.max(commitCount, 1);
  const synergyRatio = successCount / denom;
  const regressionRate = failureCount / denom;
  const failuresPerHour = hours > 0 ? failureCount / hours : failureCount;
  return {
    window_hours: hours,
    window_start: start.toISOString(),
    window_end: end.toISOString(),
    successful_ai_fixes: successCount,
    ai_induced_failures: failureCount,
    signals_considered: withinWindow.length,
    commits_per_hour: commitsPerHour,
    synergy_ratio: synergyRatio,
    regression_rate: regressionRate,
    failures_per_hour: failuresPerHour,
    net_synergy_velocity: commitsPerHour - failuresPerHour,
    git_signals: gitSignals || { found:0, fixes:0, failures:0, reverts:0, samples:[], model_counts:{} }
  };
}

function ensureDir(filePath){
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function writeSummaryJson(summary){
  const outPath = path.join(process.cwd(), 'velocity-artifacts', 'velocity-summary.json');
  ensureDir(outPath);
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2), 'utf8');
}

function phaseSummary(phasesObj){
  if (!phasesObj || typeof phasesObj !== 'object') return { done: [], pending: [] };
  const done = [], pending = [];
  for (const [k,v] of Object.entries(phasesObj)){
    const status = (v && v.status) || v || '';
    if (['done','complete','completed','ok','finished'].includes(String(status).toLowerCase())) done.push(k);
    else pending.push(k);
  }
  return { done, pending };
}

function renderMarkdown({ nowISO, latest, rolling, parseErrors, args, synergy }){
  if (!latest){
    return `# Velocity Forecast Summary\n\n**Generated:** ${nowISO}\n\n_No velocity log entries found._\n\nAdd telemetry by appending structured JSON lines to \`.logs/velocity-log.jsonl\` (mirrored to \`velocity-log.jsonl\` for CI). Example:\n\n\`\`\`json\n{\n  \"timestamp\": \"2025-11-11T00:12:33Z\",\n  \"commitCount\": 42,\n  \"totalDurationSeconds\": 28800,\n  \"phases\": { \"api_client\": \"done\", \"relational_logic\": \"in_progress\" }\n}\n\`\`\`\n\nThen re-run: \`npm run velocity:report\`.\n`;
  }

  const phase = phaseSummary(latest.phases);
  const rollingLine = rolling
    ? `${rolling.commitCount} commits in ${formatDuration(rolling.totalDurationSeconds)} (sample=${rolling.sampleSize}) → **${rolling.commitsPerHour.toFixed(2)} commits/hour**`
    : 'Insufficient data for rolling window.';

  const est = latest.estimate || latest.estimatedTask || null;
  const estBlock = est ? `\n- Current estimate target: **${est.name || est.task || est}** → remaining: ${est.remainingHours ?? 0}h` : '';

  const latestRate = latest.totalDurationSeconds > 0
    ? latest.commitCount / (latest.totalDurationSeconds / 3600)
    : 0;
  const narrativeRate = rolling?.commitsPerHour ?? latestRate;
  const branchInfo = latest.branch ? `  \n**Branch:** ${latest.branch}` : '';
  const commitInfo = latest.commit ? `  \n**Commit:** ${latest.commit}` : '';
  let synergyBlock = 'No AI signal entries were logged within the latest velocity window.';
  if (synergy && (synergy.signals_considered > 0 || synergy.successful_ai_fixes > 0 || synergy.ai_induced_failures > 0)) {
    synergyBlock = [
      `- Window: ~${synergy.window_hours.toFixed(1)}h (${synergy.window_start} → ${synergy.window_end})`,
      `- AI-assisted fixes: **${synergy.successful_ai_fixes}**`,
      `- AI-induced failures: **${synergy.ai_induced_failures}**`,
      `- Synergy ratio (fixes ÷ commits): **${synergy.synergy_ratio.toFixed(3)}**`,
      `- Regression rate (failures ÷ commits): **${synergy.regression_rate.toFixed(3)}**`,
      `- Net synergy velocity: **${synergy.net_synergy_velocity.toFixed(2)} commits/hour**`,
    ].join('  \n');
  }

  // Append git-detected signals (commits with fix/failure keywords)
  if (synergy && synergy.git_signals && synergy.git_signals.found > 0) {
    const g = synergy.git_signals;
    const sampleList = (g.samples || []).map(s => `    - ${s.date} ${s.author}: ${s.subject}`).join('  \n');
    const gitBlock = [
      `- Git-detected commits in window: **${g.found}**`,
      `- Git-detected fixes: **${g.fixes}**`,
      `- Git-detected failures: **${g.failures}**`,
      `- Git-detected reverts/rollbacks: **${g.reverts}**`,
      sampleList ? `- Samples:\n${sampleList}` : null,
    ].filter(Boolean).join('  \n');

    synergyBlock = synergyBlock + '  \n' + gitBlock;

    // Append per-model AI synergy breakdown when [AI:Model] tags are present
    const modelCounts = g.model_counts || {};
    const modelKeys = Object.keys(modelCounts);
    if (modelKeys.length > 0) {
      const modelLines = modelKeys.map(name => {
        const mc = modelCounts[name];
        const totalTagged = mc.commits || 0;
        const fixRate = totalTagged > 0 ? mc.fixes / totalTagged : 0;
        const failureRate = totalTagged > 0 ? mc.failures / totalTagged : 0;
        return `    - ${name}: commits=${totalTagged}, fixes=${mc.fixes}, failures=${mc.failures}, reverts=${mc.reverts}, fix_rate=${fixRate.toFixed(3)}, failure_rate=${failureRate.toFixed(3)}`;
      }).join('  \n');

      synergyBlock = `${synergyBlock}  \n- Per-model AI synergy (from [AI:Model] commit tags):\n${modelLines}`;
    }
  }

  return `# Velocity Forecast Summary\n\n**Generated:** ${nowISO}  \n**Snapshot Timestamp:** ${latest.timestamp}${branchInfo}${commitInfo}  \n**Subject:** Math Brain refactor velocity\n\n## What the data says\n\n- Latest run: **${latest.commitCount} commits** over **${formatDuration(latest.totalDurationSeconds)}** (${latestRate.toFixed(2)} commits/hour).\n- Rolling window (${args.limit}): ${rollingLine}.\n- Phases DONE: ${humanList(phase.done)}.  \n- Phases Pending: ${humanList(phase.pending)}.${estBlock}\n\n## Plain-English Outlook\n\n1. Current cadence suggests ~${narrativeRate.toFixed(2)} commits/hour is sustainable short‑term.  \n2. All done phases indicate remaining focus should shift to documentation, CI hardening, and post‑refactor cleanup.  \n3. Feed more runs via \`velocity-tracker.js --analyze\` to refine rolling accuracy and detect acceleration or decay.\n\n## Synergy Analysis (Speed + Quality)\n\n${synergyBlock}\n\n## Suggested pipeline hook\n\nAdd an npm script: \`velocity:report\` → \`node scripts/velocity-artifacts.js\` and invoke it in CI after merge to main. Commit the updated \`docs/velocity-forecast.md\` so stakeholders always see a fresh forecast.\n\n---\n_Parsed lines: ${(latest._index||0)+1}/${(latest._total||0)}. Parse errors: ${parseErrors}. Generated by velocity-artifacts.js v1.0.0._\n`;
}

function main(){
  const args = parseArgs(process.argv);
  if (args.help){
    console.log('Usage: node scripts/velocity-artifacts.js [--out docs/velocity-forecast.md] [--limit 10]');
    process.exit(0);
  }
  const logPath = pickLogPath();
  let entries = [];
  let parseErrors = 0;
  if (fs.existsSync(logPath)) {
    const raw = fs.readFileSync(logPath,'utf8').split(/\r?\n/).filter(Boolean);
    raw.forEach((line,i)=>{
      try {
        const obj = JSON.parse(line);
        obj._index = i;
        obj._total = raw.length;
        entries.push(normalizeEntry(obj));
      }
      catch { parseErrors++; }
    });
    entries.sort((a,b)=> new Date(a.timestamp) - new Date(b.timestamp));
  }
  const latest = entries.length ? entries[entries.length-1] : null;
  const rolling = entries.length ? computeRolling(entries, args.limit) : null;
  const debugSignals = readDebugSignals();
  // also scan git commits in the analysis window (derive from latest entry)
  let gitSignals = { found:0, fixes:0, failures:0, reverts:0, samples:[] };
  try {
    const win = deriveWindow(latest);
    if (win && win.start && win.end) {
      gitSignals = scanGitForSignals(win.start.toISOString(), win.end.toISOString());
    }
  } catch (e) {
    gitSignals = { found:0, fixes:0, failures:0, reverts:0, samples:[] };
  }
  const synergy = summarizeSynergy(debugSignals, latest, gitSignals);
  const nowISO = new Date().toISOString();
  const md = renderMarkdown({ nowISO, latest, rolling, parseErrors, args, synergy });
  const outPath = path.isAbsolute(args.out) ? args.out : path.join(process.cwd(), args.out);
  ensureDir(outPath);
  fs.writeFileSync(outPath, md, 'utf8');

  const summaryPayload = {
    generated_at: nowISO,
    latest_run: latest ? {
      timestamp: latest.timestamp,
      commit_count: latest.commitCount,
      total_duration_seconds: latest.totalDurationSeconds,
      commits_per_hour: latest.commitsPerHour,
    } : null,
    rolling_window_limit: args.limit,
    synergy,
    parse_errors: parseErrors,
  };
  writeSummaryJson(summaryPayload);
  console.log(`Velocity forecast written: ${outPath}`);
  console.log('Synergy metrics captured in velocity-artifacts/velocity-summary.json');
}

main();
