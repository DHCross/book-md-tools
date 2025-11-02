# Electron app for Book MD Workbench

## Setup

```bash
cd electron
npm install
```

## Development

```bash
npm start
```

## Build DMG for macOS

```bash
npm run make
```

This will create a DMG file in `out/make/dmg/` ready for distribution.

## Packaging

The electron-forge config is auto-generated in `forge.config.js`. To customize DMG icon or signing, edit that file before running `npm run make`.

## Notes

- The app expects Python 3 and your Python scripts to be in `../scripts/`
- No installation required for end users—just drag the app to Applications.
