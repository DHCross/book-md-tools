# Velocity Tracker Integration Handoff

## Context
- This folder contains a portable toolkit for compiling commit velocity telemetry and report artifacts.
- Current contents: `scripts/velocity-tracker.js`, `scripts/velocity-artifacts.js`, `scripts/velocity-notifier.js`, `scripts/append-recognition-provenance.js`, sample docs, and a legacy `package.json` that belongs to another project.
- Primary objective: re-home these utilities inside the main repo without disturbing existing deploy or packaging workflows.

## Guiding Principles
1. keep changes sandboxed (no modifications that would trigger production deploys or CI/CD hooks).
2. minimize dependencies—only the velocity scripts require Node ≥18, with no runtime packages today.
3. preserve historical provenance: sample output files should remain for reference but not be overwritten automatically.

## Recommended Integration Path
1. **Create a dedicated tooling enclave** (e.g., `tools/velocity/`).
   - Copy the four velocity scripts into `tools/velocity/scripts/`.
   - Copy the exemplar docs (`docs/velocity-forecast.example.md`, `velocity-artifacts/velocity-summary.example.json`) so future runs have templates.
2. **Author a minimal `package.json`** in that enclave containing:
   ```json
   {
     "name": "velocity-tooling",
     "private": true,
     "engines": { "node": ">=18 <21" },
     "scripts": {
       "velocity:run": "node scripts/velocity-tracker.js --analyze",
       "velocity:report": "node scripts/velocity-artifacts.js",
       "velocity:notify": "node scripts/velocity-notifier.js",
       "velocity:all": "npm run velocity:run && npm run velocity:report"
     }
   }
   ```
   - Omit unrelated Next.js dependencies to prevent npm install from inflating the repo footprint.
3. **Document local usage** in `tools/velocity/README.md`:
   - `cd tools/velocity`
   - `npm install` (no deps yet, but keeps the workflow consistent).
   - `npm run velocity:run` and `npm run velocity:report` for manual execution.
4. **Log storage expectations**:
   - Default log path: `.logs/velocity-log.jsonl` (mirrored to `velocity-log.jsonl`).
   - Ensure `.logs/` exists or set `VELOCITY_LOG_PATH` / `VELOCITY_LOG_MIRROR_PATH` env vars.
   - Add `.logs/` and `velocity-artifacts/velocity-summary.json` to `.gitignore` if not already ignored.
5. **Optional CI wiring**:
   - Only import `.github/workflows/velocity.yml` when stakeholders explicitly request automated runs.
   - Before enabling, confirm secrets `SLACK_WEBHOOK_URL` / `DISCORD_WEBHOOK_URL` are configured.

## Implementation Checklist
- [ ] Create `tools/velocity/` structure and copy scripts + exemplars.
- [ ] Write lean `package.json` + README in that folder.
- [ ] Update root `.gitignore` with velocity log/artifact entries.
- [ ] Smoke-test locally (`npm run velocity:run` / `velocity:report`) to verify log + artifact generation.
- [ ] Document any repo-specific customizations inside `scripts/velocity-tracker.js` (phase templates, repo slug).

## Cautionary Notes
- The existing `velocity-tracker.js` references repo `DHCross/WovenWebApp`; update `REPO` to match this project when integrating.
- Avoid committing generated artifacts unless stakeholders request a checked-in historical record.
- If adding Python wrappers or invoking from existing pipelines, keep Node CLI invocation isolated to avoid altering Python packaging requirements.

## Handoff Expectations
- Leave this doc in place so future agents understand the integration scope.
- Record deviations from the plan (e.g., if you keep the toolkit in place instead of relocating) in the README you create.
- Once integration is complete, add a short status note to `docs/velocity-forecast.example.md` explaining the new home and usage.
