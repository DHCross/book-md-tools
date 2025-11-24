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
