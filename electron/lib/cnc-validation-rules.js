/**
 * C&C CANONICAL VALIDATION RULES
 * 
 * Enforces the three critical validation rules:
 * 1. Attribute Phrasing Enforcement (Classed NPCs must use long-form)
 * 2. Level Notation Validation (no ordinals inside parentheses)
 * 3. Saves Notation (Monsters use Saves: P/M/M,P/N)
 * 
 * Based on official C&C Rule-Tree documents and PHB standards.
 */

const LONG_FORM_ATTRIBUTES = 'strength, dexterity, constitution, intelligence, wisdom, charisma';

/**
 * RULE 1: Attribute Phrasing Enforcement
 * 
 * Classed NPCs (Format A) MUST use long-form PHB-ordered attributes.
 * Monsters (Format B) SHOULD use "Saves: P" shorthand.
 * 
 * @param {string} text - The full stat block text
 * @param {object} classification - Classification result from classifyEntityV3
 * @returns {object|null} - Validation error or null if valid
 */
function validateAttributePhrasing(text, classification) {
  const errors = [];
  
  // Only applies to Format A (Classed NPCs)
  if (classification.format === 'A') {
    // Check for forbidden shorthand in Classed NPCs
    const shorthandPattern = /\b(Their|His|Her|Its)\s+primary\s+attributes\s+are\s+physical\b/i;
    const match = shorthandPattern.exec(text);
    
    if (match) {
      errors.push({
        type: 'ATTRIBUTE_PHRASING',
        severity: 'error',
        message: 'Classed NPC must use long-form attributes in PHB order',
        location: 'parenthetical',
        detected: match[0],
        expected: `${match[1]} primary attributes are ${LONG_FORM_ATTRIBUTES}`,
        autoFixable: true,
        fix: {
          search: match[0],
          replace: `${match[1]} primary attributes are ${LONG_FORM_ATTRIBUTES}`
        }
      });
    }
  }
  
  // Format B (Monsters) should use Saves notation
  if (classification.format === 'B') {
    const longFormInMonster = new RegExp(`\\b(Their|His|Her|Its)\\s+primary\\s+attributes\\s+are\\s+${LONG_FORM_ATTRIBUTES}`, 'i');
    const match = longFormInMonster.exec(text);
    
    if (match) {
      errors.push({
        type: 'ATTRIBUTE_PHRASING',
        severity: 'warning',
        message: 'Monster should use Saves notation instead of long-form attributes',
        location: 'parenthetical',
        detected: match[0],
        expected: 'Saves: P (or M, M,P, N as appropriate)',
        autoFixable: false
      });
    }
  }
  
  return errors.length > 0 ? errors : null;
}

/**
 * RULE 2: Level Notation Validation
 * 
 * Level notation with ordinal suffixes (1st, 5th, etc.) must NOT appear
 * inside parentheses. This prevents markup leakage.
 * 
 * Valid:   **Goblin Shaman, 5th Level** (wizard, HD 5, HP 22)
 * Invalid: **Goblin Shaman** (5th level wizard, HD 5, HP 22)
 * 
 * @param {string} text - The full stat block text
 * @returns {object|null} - Validation error or null if valid
 */
function validateLevelNotation(text) {
  const errors = [];
  
  // Pattern: ordinal level notation inside parentheses
  const pattern = /\(([^)]*\d+(?:st|nd|rd|th)\s+level[^)]*)\)/gi;
  let match;
  
  while ((match = pattern.exec(text)) !== null) {
    errors.push({
      type: 'LEVEL_NOTATION_IN_PARENTHESES',
      severity: 'error',
      message: 'Level notation with ordinal suffix must not appear inside parentheses',
      location: 'parenthetical',
      detected: match[0],
      expected: 'Move level to header (e.g., "**Name, 5th Level**") or remove ordinal suffix inside parentheses',
      autoFixable: false,
      guidance: [
        'Option 1: Move to header - **Goblin Shaman, 5th Level** (...)',
        'Option 2: Remove ordinal - (..., level 5, ...)',
        'Option 3: Use HD notation - (..., HD 5, ...)'
      ]
    });
  }
  
  return errors.length > 0 ? errors : null;
}

/**
 * RULE 3: Saves Notation Validation
 * 
 * Monsters (Format B) should use canonical Saves notation:
 * - Saves: P (Physical only)
 * - Saves: M (Mental only)
 * - Saves: M,P (Both)
 * - Saves: N (None/unimportant)
 * 
 * @param {string} text - The full stat block text
 * @param {object} classification - Classification result
 * @returns {object|null} - Validation info or null
 */
function validateSavesNotation(text, classification) {
  const errors = [];
  
  // Only check Format B (Monsters)
  if (classification.format !== 'B') return null;
  
  // Check if Saves notation is present
  const hasSaves = /Saves:\s*(?:P|M|M,P|N)\b/i.test(text);
  const hasPhysicalMental = /\b(Their|His|Her|Its)\s+primary\s+attributes\s+are\s+(physical|mental)\b/i.test(text);
  
  if (!hasSaves && !hasPhysicalMental) {
    errors.push({
      type: 'SAVES_NOTATION_MISSING',
      severity: 'warning',
      message: 'Monster should include Saves notation',
      location: 'parenthetical',
      expected: 'Add "Saves: P" (or M, M,P, N as appropriate)',
      autoFixable: false
    });
  }
  
  return errors.length > 0 ? errors : null;
}

/**
 * COMPREHENSIVE VALIDATION
 * 
 * Run all validation rules and return comprehensive report
 * 
 * @param {string} text - Full stat block text
 * @param {object} classification - Classification result from classifyEntityV3
 * @returns {object} - Validation result with errors and warnings
 */
function validateStatBlock(text, classification) {
  const allErrors = [];
  const allWarnings = [];
  
  // Rule 1: Attribute Phrasing
  const attributeErrors = validateAttributePhrasing(text, classification);
  if (attributeErrors) {
    attributeErrors.forEach(err => {
      if (err.severity === 'error') {
        allErrors.push(err);
      } else {
        allWarnings.push(err);
      }
    });
  }
  
  // Rule 2: Level Notation
  const levelErrors = validateLevelNotation(text);
  if (levelErrors) {
    levelErrors.forEach(err => {
      if (err.severity === 'error') {
        allErrors.push(err);
      } else {
        allWarnings.push(err);
      }
    });
  }
  
  // Rule 3: Saves Notation
  const savesErrors = validateSavesNotation(text, classification);
  if (savesErrors) {
    savesErrors.forEach(err => {
      if (err.severity === 'error') {
        allErrors.push(err);
      } else {
        allWarnings.push(err);
      }
    });
  }
  
  return {
    isValid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
    errorCount: allErrors.length,
    warningCount: allWarnings.length
  };
}

/**
 * AUTO-FIX: Apply automatic fixes where possible
 * 
 * @param {string} text - Original stat block text
 * @param {object} validation - Validation result from validateStatBlock
 * @returns {object} - { fixed: string, appliedFixes: array }
 */
function applyAutoFixes(text, validation) {
  let fixed = text;
  const appliedFixes = [];
  
  validation.errors.forEach(error => {
    if (error.autoFixable && error.fix) {
      fixed = fixed.replace(error.fix.search, error.fix.replace);
      appliedFixes.push({
        type: error.type,
        original: error.fix.search,
        replacement: error.fix.replace
      });
    }
  });
  
  return {
    fixed,
    appliedFixes,
    hasChanges: appliedFixes.length > 0
  };
}

module.exports = {
  validateAttributePhrasing,
  validateLevelNotation,
  validateSavesNotation,
  validateStatBlock,
  applyAutoFixes,
  LONG_FORM_ATTRIBUTES
};
