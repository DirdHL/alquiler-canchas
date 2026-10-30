const test = require('node:test');
const assert = require('node:assert/strict');
const {canchasHarness} = require('./helpers/canchas-harness.cjs');

for (const [script, html] of [['app.js', 'index.html'], ['polideportivo.js', 'polideportivo.html'], ['brisas.js', 'brisas.html']]) {
    test(`${script}: morning and late-night operators always start with PM and AM disabled`, () => {
        for (const hour of [0, 6, 9, 14, 22, 23]) {
            const h = canchasHarness(script, html);
            h.context.Date = class extends Date {
                constructor(...args) { super(...(args.length ? args : [2026, 9, 30, hour, 15])); }
            };
            h.run('setupEventListeners(); initCourtAvailabilityChecker(); openBookingModal()');
            assert.equal(h.run('getCheckerCourtStartTime()'), '14:00', `operator hour ${hour}`);
            assert.equal(h.run('getCheckerCourtEndTime()'), '15:00');
            assert.equal(h.run('bookingStartTimeInput.value'), '14:00');
            assert.equal(h.run('bookingEndTimeInput.value'), '15:00');
            for (const id of ['checkEnableAmChecker', 'checkEnableAm']) assert.equal(h.elements.get(id).checked, false);
            for (const id of ['checkCourtStartAmpm', 'checkCourtEndAmpm', 'startAmpmSelect', 'endAmpmSelect']) {
                assert.equal(h.elements.get(id).value, 'pm');
                assert.equal(h.elements.get(id).querySelector('option[value="am"]'), null);
            }
        }
    });
}
