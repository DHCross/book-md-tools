#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Append provenance (commit SHA, Actions run ID) to the recognition note.
 * - Uses GitHub Actions env if available (GITHUB_SHA, GITHUB_RUN_ID, GITHUB_REF_NAME)
 * - Falls back to `git rev-parse HEAD` locally
 */
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const NOTE_PATH = path.resolve(process.cwd(), 'docs/RECOGNITION_EVENT_2025-11-11.md');

function getLocalSha() {
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return null;
  }
}

function main() {
  const ts = new Date().toISOString();
  const sha = process.env.GITHUB_SHA || getLocalSha() || 'UNKNOWN_SHA';
  const runId = process.env.GITHUB_RUN_ID || 'LOCAL_RUN';
  const ref = process.env.GITHUB_REF_NAME || process.env.GITHUB_REF || 'LOCAL_REF';
  const repo = process.env.GITHUB_REPOSITORY || 'LOCAL_REPO';

  const block = `\n---\n\n### Provenance IDs (appended ${ts})\n\n- Repository: ${repo}  \n- Ref: ${ref}  \n- Commit SHA: ${sha}  \n- Actions Run ID: ${runId}\n`;

  if (!fs.existsSync(NOTE_PATH)) {
    console.error(`Recognition note not found: ${NOTE_PATH}`);
    process.exit(0); // do not fail CI
  }

  fs.appendFileSync(NOTE_PATH, block, 'utf8');
  console.log('✅ Appended provenance to recognition note');
}

main();

