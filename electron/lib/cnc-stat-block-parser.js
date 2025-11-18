/**
 * C&C STAT BLOCK PARSER - Main Orchestrator
 * 
 * This module coordinates classification and validation of C&C stat blocks.
 * It serves as the main entry point for the Electron IPC handlers.
 * 
 * Usage:
 *   const { analyzeStatBlock } = require('./cnc-stat-block-parser');
 *   const result = analyzeStatBlock('**Goblin Shaman** (wizard, HD 5, HP 22)');
 */

const { classifyEntityV3 } = require('./cnc-classification-rules');
const { validateStatBlock, applyAutoFixes } = require('./cnc-validation-rules');

/**
 * Extract parenthetical data from stat block text
 * 
 * This is a simplified version - you may want to integrate more sophisticated
 * parsing from enhanced-parser.ts later.
 * 
 * @param {string} text - Full stat block text
 * @returns {object} - Parsed parenthetical data
 */
function parseParentheticalData(text) {
  const data = {
    raw: text,
    hd: null,
    hp: null,
    ac: null,
    level: null,
    raceClass: null,
    spells: null
  };
  
  // Extract HD (Hit Dice)
  const hdMatch = text.match(/\bHD\s+(\d+(?:d\d+)?(?:[+-]\d+)?)/i);
  if (hdMatch) data.hd = hdMatch[1];
  
  // Extract HP (Hit Points)
  const hpMatch = text.match(/\bHP\s+(\d+)/i);
  if (hpMatch) data.hp = hpMatch[1];
  
  // Extract AC (Armor Class)
  const acMatch = text.match(/\bAC\s+(\d+)/i);
  if (acMatch) data.ac = acMatch[1];
  
  // Extract level
  const levelMatch = text.match(/(?:level\s+)?(\d+)(?:st|nd|rd|th)?\s+level/i);
  if (levelMatch) data.level = levelMatch[0];
  
  // Detect spells
  const hasSpells = /\b(?:spell|wizard|cleric|druid|magic-user|illusionist|bard)\b/i.test(text) ||
                    /\b(?:can\s+cast|spells?\s+per\s+day)\b/i.test(text);
  if (hasSpells) data.spells = 'detected';
  
  // Extract race/class info (simplified)
  data.raceClass = text;
  
  return data;
}

/**
 * Extract canonical data structure from stat block
 * 
 * @param {string} name - Creature name (from **Name** markup)
 * @param {string} parenthetical - Content inside parentheses
 * @returns {object} - Canonical data for classifier
 */
function buildCanonicalData(name, parenthetical) {
  const parsed = parseParentheticalData(parenthetical);
  
  return {
    name: name,
    level: parsed.level || '',
    hd: parsed.hd || '',
    hp: parsed.hp || '',
    ac: parsed.ac || '',
    // Add more fields as needed for enhanced parsing
  };
}

/**
 * Main analysis function - coordinates classification and validation
 * 
 * @param {string} markdownText - Full stat block text (e.g., "**Name** (data)")
 * @param {object} options - Analysis options
 * @param {boolean} options.validateFormat - Run validation rules (default: true)
 * @param {boolean} options.checkAttributePhrasing - Check attribute phrasing (default: true)
 * @param {boolean} options.checkLevelNotation - Check level notation (default: true)
 * @param {boolean} options.autoFix - Attempt to auto-fix errors (default: false)
 * @returns {object} - Analysis result with classification and validation
 */
function analyzeStatBlock(markdownText, options = {}) {
  // Set defaults
  const opts = {
    validateFormat: options.validateFormat !== false,
    checkAttributePhrasing: options.checkAttributePhrasing !== false,
    checkLevelNotation: options.checkLevelNotation !== false,
    autoFix: options.autoFix === true
  };
  
  // Parse stat block structure: **Name** (parenthetical data)
  const statBlockPattern = /\*\*([^*]+)\*\*\s*\(([^)]+)\)/;
  const match = statBlockPattern.exec(markdownText);
  
  if (!match) {
    throw new Error('Invalid stat block format - expected **Name** (data)');
  }
  
  const name = match[1].trim();
  const parenthetical = match[2].trim();
  const fullText = match[0];
  
  // Build canonical data structure
  const canonicalData = buildCanonicalData(name, parenthetical);
  
  // Build context for signal extraction
  const parsed = parseParentheticalData(parenthetical);
  const context = {
    raceClass: parsed.raceClass,
    spells: parsed.spells,
    description: markdownText
  };
  
  // STEP 1: Classify the entity (Format A/B/C)
  const classification = classifyEntityV3(name, canonicalData, context);
  
  // STEP 2: Validate canonical rules
  let validation = { errors: [], warnings: [], isValid: true };
  if (opts.validateFormat) {
    validation = validateStatBlock(fullText, classification);
  }
  
  // STEP 3: Auto-fix if requested
  let fixedText = null;
  let appliedFixes = [];
  if (opts.autoFix && !validation.isValid) {
    const fixResult = applyAutoFixes(fullText, validation);
    if (fixResult.hasChanges) {
      fixedText = fixResult.fixed;
      appliedFixes = fixResult.appliedFixes;
    }
  }
  
  // Return comprehensive analysis
  return {
    name,
    parenthetical,
    fullText,
    classification: {
      format: classification.format,
      category: getCategoryName(classification.format),
      subtype: classification.subtype,
      confidence: classification.confidence,
      step: classification.step
    },
    signals: classification.signals,
    validation: {
      isValid: validation.isValid,
      errors: validation.errors || [],
      warnings: validation.warnings || [],
      errorCount: validation.errorCount || 0,
      warningCount: validation.warningCount || 0
    },
    reasoning: classification.reasoning,
    step: classification.step,
    fixedText,
    appliedFixes
  };
}

/**
 * Get human-readable category name from format code
 */
function getCategoryName(format) {
  switch (format) {
    case 'A': return 'Classed NPC';
    case 'B': return 'Monster';
    case 'C': return 'Unit';
    default: return 'Unknown';
  }
}

/**
 * Batch analyze multiple stat blocks from a document
 * 
 * @param {string} markdownDocument - Full markdown document text
 * @param {object} options - Analysis options (same as analyzeStatBlock)
 * @returns {array} - Array of analysis results
 */
function analyzeBatch(markdownDocument, options = {}) {
  const results = [];
  const statBlockPattern = /\*\*([^*]+)\*\*\s*\(([^)]+)\)/g;
  let match;
  
  while ((match = statBlockPattern.exec(markdownDocument)) !== null) {
    const fullText = match[0];
    
    try {
      const result = analyzeStatBlock(fullText, options);
      
      // Add line number information
      const beforeText = markdownDocument.substring(0, match.index);
      const lineNumber = (beforeText.match(/\n/g) || []).length + 1;
      
      results.push({
        ...result,
        lineNumber,
        index: match.index
      });
    } catch (error) {
      // Skip invalid stat blocks but track them
      results.push({
        name: match[1],
        error: error.message,
        lineNumber: (markdownDocument.substring(0, match.index).match(/\n/g) || []).length + 1,
        index: match.index
      });
    }
  }
  
  return results;
}

/**
 * Get summary statistics for a batch analysis
 * 
 * @param {array} results - Array of analysis results from analyzeBatch
 * @returns {object} - Summary statistics
 */
function getSummaryStats(results) {
  const stats = {
    total: results.length,
    byFormat: { A: 0, B: 0, C: 0 },
    withErrors: 0,
    withWarnings: 0,
    totalErrors: 0,
    totalWarnings: 0,
    bySubtype: {}
  };
  
  results.forEach(result => {
    if (result.error) return; // Skip failed parses
    
    // Count by format
    stats.byFormat[result.classification.format]++;
    
    // Count by subtype
    const subtype = result.classification.subtype || 'unknown';
    stats.bySubtype[subtype] = (stats.bySubtype[subtype] || 0) + 1;
    
    // Count validation issues
    if (result.validation.errorCount > 0) {
      stats.withErrors++;
      stats.totalErrors += result.validation.errorCount;
    }
    if (result.validation.warningCount > 0) {
      stats.withWarnings++;
      stats.totalWarnings += result.validation.warningCount;
    }
  });
  
  return stats;
}

// Export public API
module.exports = {
  analyzeStatBlock,
  analyzeBatch,
  getSummaryStats,
  parseParentheticalData,
  buildCanonicalData
};
