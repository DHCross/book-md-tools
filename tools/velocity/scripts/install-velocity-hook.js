#!/usr/bin/env node
/**
 * Install a git post-commit hook that runs the velocity tracker after each commit.
 *
 * Usage:
 *   npm run velocity:install-hook
 *
 * The hook runs `npm run velocity:all` inside tools/velocity asynchronously so it
 * won't slow down commits. Logs are still written to the usual locations.
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const gitDir = path.join(repoRoot, '.git');
const hooksDir = path.join(gitDir, 'hooks');
const hookPath = path.join(hooksDir, 'post-commit');
const marker = '# Velocity Tracker Hook (auto-generated)';

function ensureGitDirExists() {
  if (!fs.existsSync(gitDir)) {
    console.error('Error: .git directory not found. Run this from inside the repo.');
    process.exit(1);
  }
}

function ensureHooksDir() {
  if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true });
  }
}

function createHookContent(existing) {
  const hookScript = `#!/bin/sh\n${marker}\nREPO_ROOT=\"$(git rev-parse --show-toplevel 2>/dev/null)\"\nif [ -z \"$REPO_ROOT\" ]; then\n  exit 0\nfi\ncd \"$REPO_ROOT\"/tools/velocity || exit 0\n# Run velocity tracker asynchronously so commits stay fast\nnpm run velocity:all >/dev/null 2>&1 &\n`;

  if (!existing) {
    return hookScript;
  }

  if (existing.includes(marker)) {
    console.log('Velocity tracker hook already installed.');
    process.exit(0);
  }

  return `${existing.trim()}\n\n${hookScript}`;
}

function writeHook(content) {
  fs.writeFileSync(hookPath, content, { mode: 0o755 });
  console.log('Velocity tracker post-commit hook installed.');
}

function main() {
  ensureGitDirExists();
  ensureHooksDir();

  let existing = null;
  if (fs.existsSync(hookPath)) {
    existing = fs.readFileSync(hookPath, 'utf8');
  }

  const content = createHookContent(existing);
  writeHook(content);
}

main();
