# Velocity Metrics: A Plain English Guide

This dashboard isn't just about "engineering speed"—it's about understanding the **efficiency of your collaboration with AI**.

## The Core Questions

### 1. "Is the AI actually helping me?"
**Metric:** `Cooperation Score` (formerly Synergy Ratio)
*   **What it means:** This measures how much "forward progress" you make versus how much time you spend fixing the AI's mistakes.
*   **The Goal:** You want this to be **> 1.0**.
    *   **> 1.0**: The AI is accelerating you.
    *   **< 1.0**: You are spending more time fixing AI code than it would have taken to write it yourself.
    *   **1.0**: Neutral.

### 2. "How fast am I *really* going?"
**Metric:** `Effective Speed` (formerly Net Synergy Velocity)
*   **What it means:** Your development speed *after* subtracting the "waste" (time spent debugging AI hallucinations, refactoring bad suggestions, etc.).
*   **Why it matters:** You might feel like you're coding fast (high "Raw Velocity"), but if you're constantly reverting changes, your *Effective Speed* is low.

### 3. "Is the AI writing good code?"
**Metric:** `AI Code Quality` (formerly Code Survival Rate)
*   **What it means:** The percentage of code written by the AI that is *still in the project* after 7 days.
*   **The Goal:** High percentage (e.g., > 80%).
*   **Interpretation:**
    *   **Low %**: The AI is generating "throwaway" code. You're likely rewriting it all.
    *   **High %**: The AI understands the context and writes durable code.

### 4. "Where is my time going?"
**Metric:** `Time Breakdown`
*   **What it means:** A split of your session time into three buckets:
    *   🧠 **Planning/Prompting**: Thinking, writing specs, crafting prompts.
    *   ⚡ **AI Coding**: Waiting for generation, reviewing diffs.
    *   🧪 **Testing/Verifying**: Running the app, fixing bugs.
*   **Why it matters:** If you spend 90% of your time "Testing/Verifying", the AI might be generating buggy code. If you spend 90% "Prompting", you might be over-engineering the instructions.

## Other Terms
*   **Regression Rate**: How often a new change breaks an old feature. Lower is better.
*   **Churn**: How much code is deleted/replaced shortly after being written. High churn = "Thrashing" (not knowing what you want).

---

## Passive AI Detection (Zero-Click Telemetry)

The system automatically detects when you're using AI assistance **without requiring manual tagging**.

### How It Works: The "Impossible Velocity" Heuristic

**The Logic**: Humans type at 50-100 words per minute. AI "types" at 10,000+ WPM (instantaneous paste).

*   **AI Burst Detection**: If a file gains **>5 lines in <2 seconds**, it's tagged as an AI-assisted change.
*   **Manual Typing**: Gradual changes (1-2 lines/second) are tagged as human work.

### What Gets Tracked

1. **AI Paste Count**: Number of "burst" events detected (e.g., "12 AI pastes today")
2. **Total AI Lines**: Sum of all lines added via AI bursts (e.g., "+456 lines from AI")
3. **AI Contribution %**: `(AI Lines) / (Total Lines)` - Shows what percentage of your code came from AI

### Requirements for Accuracy

**Enable Auto-Save in Your Editor** (Recommended):
*   **VS Code**: `File > Auto Save` or set `"files.autoSave": "afterDelay"` in settings
*   **Windsurf**: Similar auto-save settings
*   **Why**: This forces the file watcher to see your typing in real-time instead of in one big burst when you manually save

**Without Auto-Save**: The system might misclassify a 20-minute typing session as "AI" if you save it all at once.

### Privacy

*   The watcher **only monitors file changes** (line counts and timestamps)
*   It **does not read** your prompts, code content, or clipboard
*   All data stays **local** in `velocity-tracker-template/session-log.jsonl`
*   The feature is **disabled in production builds** (only runs during development)

---

## FAQ

**Q: Why are all my metrics zero?**
A: The metrics need data to work with:
- **Cooperation Score**: Requires commits tagged with `[AI:FIX]` or `[AI:FAIL]`
- **AI Code Quality**: Needs AI-generated code that survives 7+ days
- **Time Breakdown**: Requires you to click the session state buttons (🧠 Plan / ⚡ Code / 🧪 Test)
- **AI Bursts**: Starts tracking as soon as you paste/generate code and save

**Q: How do I tag commits for better metrics?**
A: Use these tags in your commit messages:
- `[AI:GEN]` - AI generated this code
- `[AI:FIX]` - AI helped fix a bug
- `[AI:FAIL]` - AI suggestion caused a problem (had to revert)

**Q: Can I disable the passive detection?**
A: Yes, it only runs in development mode. When you package the app (`npm run make`), it's automatically disabled.

