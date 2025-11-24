#!/usr/bin/env node
/**
 * code-survival.js
 *
 * Calculates the "Code Survival Rate" - the percentage of lines from AI-generated
 * commits that are still present in the current codebase.
 *
 * Usage:
 *   node scripts/code-survival.js [--out velocity-artifacts/code-survival.json]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const AI_TAG_REGEX = /\[AI:.*?\]/i; // Regex to identify AI commits from subject
// Heuristic: If no explicit tag, we might check for "Co-authored-by" or specific authors
// For this MVP, we'll rely on the [AI:...] tag or explicit "AI" in the subject for simplicity,
// or we can treat ALL commits as "AI" if the user is running this in a specific mode,
// but let's stick to the plan: "Identify AI commits (using [AI:...] tags or heuristics)."
const AI_AUTHOR_REGEX = /^(AI|Copilot|Robot|Assistant)/i; 

function parseArgs(argv) {
  const args = { out: 'velocity-artifacts/code-survival.json' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out' && argv[i + 1]) { args.out = argv[++i]; continue; }
  }
  return args;
}

function getAICommits() {
  try {
    // Get all commits: hash, author, subject
    const cmd = `git log --pretty=format:"%H||%an||%s"`;
    const out = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    const lines = out.split('\n');
    
    const aiCommits = [];
    
    lines.forEach(line => {
      const [hash, author, subject] = line.split('||');
      if (!hash) return;
      
      const isAITagged = AI_TAG_REGEX.test(subject);
      const isAIAuthor = AI_AUTHOR_REGEX.test(author);
      
      if (isAITagged || isAIAuthor) {
        aiCommits.push({ hash, author, subject });
      }
    });
    
    return aiCommits;
  } catch (err) {
    console.error('Error fetching commits:', err.message);
    return [];
  }
}

function getFilesChangedInCommit(commitHash) {
  try {
    const cmd = `git show --pretty="" --name-only ${commitHash}`;
    const out = execSync(cmd, { encoding: 'utf8' });
    return out.split('\n').filter(Boolean);
  } catch (err) {
    return [];
  }
}

function analyzeSurvival(aiCommits) {
  let totalAILinesAdded = 0;
  let survivingAILines = 0;
  
  // Cache current file blames to avoid re-running git blame for every commit
  // Map: filePath -> Map: lineContent -> commitHash (Simplified blame)
  // Actually, we need to know if a specific line from a specific commit is still there.
  // Git blame shows the commit that LAST modified the line.
  // If the line is still attributed to the AI commit, it survives.
  // If it's attributed to a later commit, it might have been modified (churn) or replaced.
  
  // Strategy:
  // 1. For each AI commit, find what files it touched.
  // 2. For each file, run git blame.
  // 3. Count how many lines in the CURRENT file are attributed to that AI commit.
  // 4. We also need to know how many lines were ORIGINALLY added by that commit to calculate the rate.
  //    (This is harder without running git diff for every commit).
  
  // Alternative Strategy (Forward-looking):
  // 1. Get list of all files currently in the repo.
  // 2. Run git blame on ALL files.
  // 3. Aggregate counts by commit hash.
  // 4. Match against our list of AI commits.
  
  console.log('Analyzing current codebase via git blame...');
  
  const commitLineCounts = {}; // hash -> count of surviving lines
  
  try {
    // Get all tracked files
    const filesCmd = `git ls-files`;
    const files = execSync(filesCmd, { encoding: 'utf8' }).split('\n').filter(Boolean);
    
    for (const file of files) {
      try {
        // Run blame, outputting only the commit hash for each line
        // -s: suppress author/time, just hash and content (but we just need hash)
        // --line-porcelain is best for parsing but verbose.
        // `git blame -l -s file` gives just hash and content? No.
        // `git blame --no-progress --porcelain file`
        
        // Let's use a simpler output: just the hashes for every line
        const blameCmd = `git blame --line-porcelain "${file}" | grep "^[0-9a-f]\\{40\\}" | cut -d " " -f 1`;
        // Note: The grep/cut might be platform dependent. Let's do it in node.
        
        const blameOut = execSync(`git blame --line-porcelain "${file}"`, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
        const blameLines = blameOut.split('\n');
        
        for (const line of blameLines) {
          // Porcelain format starts with the full hash
          if (/^[0-9a-f]{40}/.test(line)) {
            const hash = line.split(' ')[0];
            commitLineCounts[hash] = (commitLineCounts[hash] || 0) + 1;
          }
        }
      } catch (err) {
        // File might be binary or deleted in the meantime
      }
    }
  } catch (err) {
    console.error('Error listing files:', err.message);
    return null;
  }
  
  // Now we have the surviving line count for EVERY commit.
  // We need the ORIGINAL line count for the AI commits to calculate the percentage.
  // This is expensive: `git show --numstat hash` gives added/deleted lines.
  
  console.log(`Found ${aiCommits.length} AI commits. Calculating original stats...`);
  
  let totalOriginalLines = 0;
  let totalSurvivingLines = 0;
  
  const survivalByCommit = [];
  
  for (const commit of aiCommits) {
    try {
      // Get stats for this commit
      const statCmd = `git show --numstat --format="" ${commit.hash}`;
      const statOut = execSync(statCmd, { encoding: 'utf8' });
      
      let addedLines = 0;
      statOut.split('\n').forEach(line => {
        const parts = line.split('\t');
        if (parts.length === 3) {
          const added = parseInt(parts[0], 10);
          if (!isNaN(added)) addedLines += added;
        }
      });
      
      const surviving = commitLineCounts[commit.hash] || 0;
      
      if (addedLines > 0) {
        totalOriginalLines += addedLines;
        totalSurvivingLines += surviving;
        
        survivalByCommit.push({
          hash: commit.hash,
          subject: commit.subject,
          added: addedLines,
          surviving: surviving,
          rate: surviving / addedLines
        });
      }
    } catch (err) {
      console.warn(`Failed to analyze commit ${commit.hash}`);
    }
  }
  
  return {
    total_ai_commits: aiCommits.length,
    total_original_lines: totalOriginalLines,
    total_surviving_lines: totalSurvivingLines,
    survival_rate: totalOriginalLines > 0 ? totalSurvivingLines / totalOriginalLines : 0,
    details: survivalByCommit
  };
}

function main() {
  const args = parseArgs(process.argv);
  
  console.log('Identifying AI commits...');
  const aiCommits = getAICommits();
  
  if (aiCommits.length === 0) {
    console.log('No AI commits found (looking for "[AI:...]" tag or "AI" author).');
    // Write an empty/default result
    const result = {
      generated_at: new Date().toISOString(),
      total_ai_commits: 0,
      survival_rate: 0,
      message: "No AI commits detected."
    };
    ensureDir(args.out);
    fs.writeFileSync(args.out, JSON.stringify(result, null, 2));
    return;
  }
  
  const stats = analyzeSurvival(aiCommits);
  
  if (stats) {
    const result = {
      generated_at: new Date().toISOString(),
      ...stats
    };
    
    ensureDir(args.out);
    fs.writeFileSync(args.out, JSON.stringify(result, null, 2));
    console.log(`\nSurvival Rate: ${(stats.survival_rate * 100).toFixed(1)}%`);
    console.log(`Report written to ${args.out}`);
  }
}

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

main();
