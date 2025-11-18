# Velocity Tracker

This enclave houses the experimental velocity tracker that will evolve into a commercial diagnostic product for AI + human collaboration. Keep all work here so it remains isolated from the main app.

## Roadmap Snapshot

1. **Phase 1 – Metrics Deepening (current focus)**
   - Enrich JSONL logs with `synergy_ratio`, `regression_rate`, `net_synergy_velocity`.
   - Maintain an AI contribution ledger (who/what caused fixes vs. regressions).
   - Add a simple quality index (tests/lint outcomes) so "fast" also means "good".
2. **Phase 2 – Reporting & Storytelling (next)**
   - Convert the markdown report into an HTML dashboard or Electron panel with charts (Chart.js/Vega-Lite work well offline).
   - Provide team/individual breakdowns plus an “AI impact narrative.”
3. **Phase 3 – Enterprise Foundations (later)**
   - Multi-repo aggregation, role-aware access, and optional integrations (Jira/Trello, Slack alerts).

Until Phase 2, keep outputs in Markdown/JSON so iteration stays fast.

## Setup

1. Ensure Node.js v18+ (and npm ≥9) is installed.
2. From this folder run `npm install` (no external deps yet—this just wires npm scripts).

## Usage

All commands run from `tools/velocity/`:

- `npm run velocity:run` – Analyze commit history and write the latest metrics (Phase 1 work starts here).
- `npm run velocity:report` – Generate the Markdown + JSON artifacts.
- `npm run velocity:all` – Run analysis followed by report generation.
- `npm run velocity:notify` – Send webhook notifications (requires `SLACK_WEBHOOK_URL` or `DISCORD_WEBHOOK_URL`).
- `npm run velocity:provenance` – Append recognition/provenance metadata to artifacts.

## Configuration

- Logs default to `.logs/velocity-log.jsonl` and mirror to `velocity-log.jsonl`.
- Override with `VELOCITY_LOG_PATH` / `VELOCITY_LOG_MIRROR_PATH` if desired.
- Velocity artifacts land in `velocity-artifacts/` and Markdown lives under `docs/`.

## Output

- Markdown forecast: `docs/velocity-forecast.md` (future HTML dashboard will read from the same data).
- JSON summary: `velocity-artifacts/velocity-summary.json`.
- Contribution ledger + synergy metrics: append to the JSONL log as Phase 1 features land.

## Integration Notes

- This tooling is self-contained; nothing here should modify builds or deploys.
- Treat this directory as the staging ground for the future `human-ai-collab-velocity` product. Document deviations or experiments in this README so the next contributor (human or AI) can follow along.
