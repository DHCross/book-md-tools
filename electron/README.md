# Book MD Workbench - Electron App

A professional desktop application for markdown document processing and layout preparation.

## Features

- **Full Pipeline Processing** - Run complete document processing pipeline
- **Document Comparator** - Compare document versions with four diagnostic checks:
  - Symmetry & Sequence Check
  - Structural Parity Check
  - Content Volume Comparison
  - Cross-Reference Check
- **Edmunds Tagging System** - Inject/strip numeric hierarchy tags
- **Text Formatting** - Advanced markdown formatting and normalization
- **Quality Control Tools**:
  - Header Depth Corrector
  - Long Line Detector
  - Paragraph Break Detector
  - Spell Checker
- **TOC Management** - Table of contents correction
- **Visual Preview** - Preview raw markdown and rendered HTML
- **Document Statistics** - Comprehensive document analysis
- **Change Logging** - Track all operations and modifications

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
