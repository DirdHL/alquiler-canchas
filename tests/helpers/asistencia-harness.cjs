const fs = require('node:fs');
const path = require('node:path');

// Reuse the browser simulator without registering the original test suite twice.
const testDirectory = path.resolve(__dirname, '..');
const original = fs.readFileSync(path.join(testDirectory, 'asistencia.test.cjs'), 'utf8');
const testRequire = name => name === 'node:test' ? () => {} : require(name);
module.exports = new Function('require', '__dirname', original + '\nreturn { harness, moveClock, seedScheduledShift, setLunchSchedule, lunchRecord, lunchAccounting };')(testRequire, testDirectory);
