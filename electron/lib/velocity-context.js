/**
 * Velocity Context Calculator
 * Compares current velocity to research-backed human baselines
 * Based on industry studies: professional developers average 8 lines/hour
 */

// HUMAN BASELINES (Research-backed)
const HUMAN_LINES_PER_HOUR = 8;
const HUMAN_COMMITS_PER_HOUR = 0.5; // ~1 commit every 2 hours (sustainable pace)

/**
 * Get contextual badge for a velocity metric
 * @param {number} speed - The velocity value
 * @param {string} metricType - 'commits' or 'lines'
 * @returns {object} Badge info with label, color, icon, description
 */
function getVelocityContext(speed, metricType = 'commits') {
    let baseline;

    if (metricType === 'commits') {
        baseline = HUMAN_COMMITS_PER_HOUR;
    } else {
        baseline = HUMAN_LINES_PER_HOUR;
    }

    const ratio = speed / baseline;

    // Badge logic
    if (ratio > 50) {
        return {
            label: "🤖 AI BURST",
            color: "#a855f7",
            icon: "⚡",
            description: "Pure AI generation",
            multiplier: ratio
        };
    }

    if (ratio > 5) {
        return {
            label: `${ratio.toFixed(1)}x Human`,
            color: "#22c55e",
            icon: "🚀",
            description: "AI-accelerated pace",
            multiplier: ratio
        };
    }

    if (ratio >= 0.8) {
        return {
            label: "Human Pace",
            color: "#60a5fa",
            icon: "👤",
            description: "Sustainable professional pace",
            multiplier: ratio
        };
    }

    return {
        label: "Thinking...",
        color: "#9ca3af",
        icon: "🐢",
        description: "Planning/debugging phase",
        multiplier: ratio
    };
}

// Export for use in renderer
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getVelocityContext, HUMAN_LINES_PER_HOUR, HUMAN_COMMITS_PER_HOUR };
}
