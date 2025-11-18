export { formatHdAsLevel } from './format-hd-as-level';

export function normalizeDisposition(value: string): string {
  const mapping: Record<string, string> = {
    'lawful good': 'law/good',
    'lawful neutral': 'law/neutral',
    'lawful evil': 'law/evil',
    'neutral good': 'neutral/good',
    'true neutral': 'neutral',
    'neutral': 'neutral',
    'neutral/neutral': 'neutral',
    'neutral evil': 'neutral/evil',
    'chaotic good': 'chaos/good',
    'chaotic neutral': 'chaos/neutral',
    'chaotic evil': 'chaos/evil',
  };
  return mapping[trimmed] ?? value.trim();
}

export interface SubjectOptions {
  isPlural: boolean;
  race?: string;
  level?: string;
  charClass?: string;
  fallback?: string | null;
}

export function buildSubjectDescriptor(options: SubjectOptions): string {
  const pronoun = options.isPlural ? 'These' : 'This';
  const descriptorParts: string[] = [];

  if (options.race) {
    descriptorParts.push(options.race.trim().toLowerCase());
  }

  if (options.level) {
    descriptorParts.push(`${toSuperscript(options.level.trim())} level`);
  }

  if (options.charClass) {
    const baseClass = options.charClass.trim().toLowerCase();
    const classDescriptor = options.isPlural ? pluralizeClassName(baseClass) : baseClass;
    descriptorParts.push(classDescriptor);
  }

  let descriptor = descriptorParts.filter(Boolean).join(' ').trim();

  if (!descriptor) {
    const fallback = options.fallback?.trim();
    if (fallback) {
      descriptor = fallback
        .replace(/[,]+/g, ' ')
        .replace(/\s+/g, ' ')
        .toLowerCase();
    }
  }

  if (!descriptor) {
    if (options.isPlural) {
      descriptor = 'creatures';
    } else {
      // Default to "human" if no race is specified for a single character.
      descriptor = options.charClass ? options.charClass : 'human';
    }
    descriptor = descriptor.toLowerCase();
  }

  return `${pronoun} ${descriptor}`.replace(/\s+/g, ' ').trim();
}

export function toPossessiveSubject(subject: string, isPlural: boolean): string {
  const trimmed = subject.trim();
  const apostrophe = '\u2019';
  if (!trimmed) {
    return isPlural ? `These creatures${apostrophe}` : `This character${apostrophe}s`;
  }

  const lower = trimmed.toLowerCase();
  const alreadyPossessive = lower.endsWith("'") || lower.endsWith(apostrophe);
  if (alreadyPossessive) {
    return trimmed;
  }

  if (isPlural) {
    if (lower.endsWith('men') || lower.endsWith('children') || lower.endsWith('people')) {
      return `${trimmed}${apostrophe}`;
    }
    if (lower.endsWith('s')) {
      return `${trimmed}${apostrophe}`;
    }
    return `${trimmed}${apostrophe}s`;
  }

  if (lower.endsWith('s')) {
    return `${trimmed}${apostrophe}`;
  }

  return `${trimmed}${apostrophe}s`;
}

export function toSuperscript(value: string): string {
  return value + 'ᵗʰ';
}

/**
 * Estimate average HP for a given HD expression: e.g., '3d10+2' => round(3*(10+1)/2 + 2)
 */
export function estimateHpFromHd(hd: string): number | null {
  if (!hd) return null;
  const m = hd.match(/(\d+)d(\d+)([+-]\d+)?/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const sides = parseInt(m[2], 10);
  const modifier = m[3] ? parseInt(m[3], 10) : 0;
  const avg = n * ((sides + 1) / 2) + modifier;
  return Math.round(avg);
}

/**
 * Heuristics to detect if a parenthetical or title represents a named/ranked NPC.
 * This is used to decide whether to treat HD as classed HP and to use singular
 * pronouns and expanded primary attribute lists.
 */
export function isRankedNamedEntity(title?: string, data?: { raceClass?: string | null; significantAttributes?: string | null }): boolean {
  if (!title && !data) return false;
  // Expand heuristics for ranking/naming detection: check for common titles,
  // parenthetical role words, and two-word capitalized names (e.g., Ember Raventree)
  const namedTitle = !!title && /(?:leader|chieftain|king|queen|lord|captain|sir|the\s+[A-Z]|^\*\*.+\*\*|\(.*leader.*\)|\(.*chieftain.*\))/i.test(title ?? '');
  // Also treat titles with two or more capitalized words (or hyphenated names)
  // as named entities (e.g., Ember Raventree, Hub-Gub, Little Hillwood Werewolf)
  const twoCapitalWords = !!title && /(?:^|\s)[A-Z][a-z]+(?:[-'][A-Z][a-z]+)*(?:\s+[A-Z][a-z]+(?:[-'][A-Z][a-z]+)*)+/.test(title ?? '');
  const hasClass = Boolean(data?.raceClass);
  const hasSigAttrs = Boolean(data?.significantAttributes);
  return namedTitle || twoCapitalWords || hasClass || hasSigAttrs;
}

/**
 * Determine the possessive pronoun to use for a singular vs plural entity.
 * Prefer explicit pronouns from the original prose; if none are found,
 * fall back to plural 'Their' for units and 'Their' for singulars to
 * preserve current behavior. Use this helper to choose 'His', 'Her', etc.
 */
export function determinePossessivePronoun(originalText?: string, originalPronoun?: string, isPlural?: boolean, title?: string): string {
  // Optionally accept a title as an additional hint; default is undefined.
  // NOTE: Keep backward-compatibility with callers that don't provide the title.
  // (If a title is provided, it should be the element's bold name or title line.)
  // Signature supported callers will pass `title` when available.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function _determine(_: string | undefined): string { return 'Their'; }
  if (isPlural) return 'Their';

  // If originalPronoun was set during extraction (e.g., 'he', 'she', 'they')
  // prefer that mapping.
  const pron = (originalPronoun ?? '').toLowerCase();
  if (pron) {
    if (['he', 'his'].includes(pron)) return 'His';
    if (['she', 'her'].includes(pron)) return 'Her';
    if (['they', 'their', 'these', 'those'].includes(pron)) return 'Their';
    if (pron === 'it') return 'Its';
  }

  if (!originalText) {
    // fallback to title-based inference
    const fromTitle = inferPronounFromTitle(title);
    return fromTitle ?? 'Their';
  }

  const text = originalText.toLowerCase();

  const pronounMatch = text.match(/\b(he|she|they|it|his|her|their)\s+(?:carries|carry|wears|wields|has|have)\b/);
  if (pronounMatch) {
    const found = pronounMatch[1];
    if (['he', 'his'].includes(found)) return 'His';
    if (['she', 'her'].includes(found)) return 'Her';
    if (['they', 'their', 'these', 'those'].includes(found)) return 'Their';
    if (found === 'it') return 'Its';
  }

  // Try title inference as a fallback when the original text doesn't include pronoun
  const titlePron = inferPronounFromTitle(title);
  if (titlePron) return titlePron;

  return 'Their';
}

/**
 * Heuristics to derive the singular possessive pronoun from a title.
 * Returns 'His' | 'Her' | 'Their'.
 */
export function inferPronounFromTitle(title?: string): string | undefined {
  if (!title) return undefined;
  const t = title.toLowerCase();

  // Female titles
  if (/\b(queen|lady|princess|dame|mistress|empress|queen consort|ms\.?|mrs\.?|miss)\b/i.test(t)) {
    return 'Her';
  }

  // Male titles
  if (/\b(king|sir\b|prince|lord|baron|duke|captain|chieftain|emperor|sir\b|lord\b)\b/i.test(t)) {
    return 'His';
  }

  // If the title includes known honorifics like 'Lord A' or 'Lady B', map them
  if (/^\*\*/.test(title)) {
    // Titles sometimes appear with bold; check name-affix heuristics
    const lower = title.replace(/\*+/g, '').toLowerCase();
    if (/\b(lord|lady|sir|king|queen|captain|dame)\b/.test(lower)) {
      if (/\b(lady|queen|dame|mistress|princess)/.test(lower)) return 'Her';
      if (/\b(lord|sir|king|captain|baron)/.test(lower)) return 'His';
    }
  }

  return undefined;
}

export function pluralizeClassName(name: string): string {
  const lower = name.trim().toLowerCase();
  const irregulars: Record<string, string> = {
    'thief': 'thieves',
    'archer': 'archers',
    'fighter': 'fighters',
    'cleric': 'clerics',
    'paladin': 'paladins',
    'ranger': 'rangers',
    'wizard': 'wizards',
    'warlock': 'warlocks',
    'druid': 'druids',
    'bard': 'bards',
    'monk': 'monks',
    'rogue': 'rogues',
    'assassin': 'assassins',
    'knight': 'knights',
    'magic-user': 'magic-users',
  };

  if (irregulars[lower]) {
    return irregulars[lower];
  }

  if (lower.endsWith('man')) {
    return `${lower.slice(0, -3)}men`;
  }
  if (lower.endsWith('fe')) {
    return `${lower.slice(0, -2)}ves`;
  }
  if (lower.endsWith('f')) {
    return `${lower.slice(0, -1)}ves`;
  }
  if (lower.endsWith('y') && !/[aeiou]y$/.test(lower)) {
    return `${lower.slice(0, -1)}ies`;
  }
  if (lower.endsWith('s')) {
    return lower;
  }

  return `${lower}s`;
}
