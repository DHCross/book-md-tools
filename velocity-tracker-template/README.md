# Velocity Tracker Toolkit

This folder packages the velocity tracking utilities so you can drop them into any repository (or publish as a standalone repo).

## Included Components

```
velocity-tracker-template/
├── README.md                      # This document
├── package.json                   # Scripts + dependency manifest (copy/adapt)
├── .github/workflows/velocity.yml # Optional GitHub Action wiring
├── docs/
│   └── velocity-forecast.example.md        # Sample markdown report output
├── scripts/
│   ├── velocity-tracker.js                 # Core analyzer (GitHub + local git)
│   ├── velocity-artifacts.js               # Markdown + JSON artifact generator
│   ├── velocity-notifier.js                # Slack/Discord webhook notifier
│   └── append-recognition-provenance.js    # Appends provenance to recognition note
└── velocity-artifacts/
    └── velocity-summary.example.json       # Example JSON summary artifact
```

## How to Re-Home the Tracker

1. **Create a new repo** (or subfolder) and copy this directory’s contents into it.
2. **Install dependencies** in the target project:
   ```bash
   npm install
   ```
   *If you only need the tracker scripts, trim the `package.json` to keep the `velocity:*` commands and any runtime deps (currently none).* 
3. **Wire npm scripts** (if integrating into an existing repo):
   - Copy the `velocity:*` script entries from this `package.json` into your project’s `package.json`.
   - Ensure the scripts directory path matches your structure (e.g., `scripts/velocity-tracker.js`).
4. **Telemetry log location**: by default the tracker writes to `.logs/velocity-log.jsonl` (mirrored to `velocity-log.jsonl`). Create the folder or set env vars `VELOCITY_LOG_PATH` / `VELOCITY_LOG_MIRROR_PATH` as needed.
5. **Optional CI pipeline**: drop `.github/workflows/velocity.yml` into your repo to run the tracker on pushes/schedules. Update secrets:
   - `GITHUB_TOKEN` is provided automatically in Actions.
   - Add `SLACK_WEBHOOK_URL` / `DISCORD_WEBHOOK_URL` for notifier support.
6. **Synergy debug signals**: if you log AI activity to `debug-session.jsonl`, the artifacts script will surface synergy ratios and per-model breakdowns.

## Usage

Run from the repo root:

```bash
npm run velocity:run        # Analyze the last 7 days (GitHub API with local fallback)
npm run velocity:report     # Generate docs/velocity-forecast.md + JSON summary
npm run velocity:notify     # Send webhook alerts on significant velocity shifts
npm run velocity:all        # Convenience: run + report back-to-back
```

Generated files land in:
- `docs/velocity-forecast.md`
- `velocity-artifacts/velocity-summary.json`

## Customization Checklist

- Update the narrative sections inside `scripts/velocity-tracker.js` to reflect your team’s phases.
- Adjust keyword detection (`scanGitForSignals`) if you use different tagging conventions.
- Edit `velocity.yml` schedule/branches to match your workflow.

Once satisfied, you can publish this folder as its own repo (rename as desired) and import it into other projects.
