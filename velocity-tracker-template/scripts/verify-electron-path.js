const path = require('path');
const fs = require('fs');

const __dirname_mock = '/Users/dancross/Documents/GitHub/book-md-tools/electron';
const REPO_ROOT = path.join(__dirname_mock, '..');
const summaryPath = path.join(REPO_ROOT, 'velocity-tracker-template', 'velocity-artifacts', 'velocity-summary.json');

console.log(`Checking path: ${summaryPath}`);

if (fs.existsSync(summaryPath)) {
    console.log('File exists.');
    try {
        const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
        console.log('JSON parsed successfully.');
        console.log('Synergy Ratio:', summary.synergy?.synergy_ratio);
        console.log('Code Survival:', summary.code_survival?.survival_rate);
    } catch (e) {
        console.error('JSON parse failed:', e);
    }
} else {
    console.error('File does not exist.');
}
