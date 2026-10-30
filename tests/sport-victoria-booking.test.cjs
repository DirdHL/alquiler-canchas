const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness() {
    const elements = new Map();
    function element(id) {
        if (elements.has(id)) return elements.get(id);
        const listeners = new Map();
        const classes = new Set();
        const options = new Set(id.includes('Ampm') ? ['pm'] : []);
        let value = id.includes('Ampm') ? 'pm' : '';
        const el = {
            style: {}, checked: false, disabled: false, innerHTML: '', textContent: '',
            get value() { return value; },
            set value(next) { value = id.includes('Ampm') && !options.has(String(next)) ? '' : String(next); },
            classList: { add(...xs) { xs.forEach(x => classes.add(x)); }, remove(...xs) { xs.forEach(x => classes.delete(x)); }, contains(x) { return classes.has(x); } },
            addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
            dispatchEvent(event) { for (const fn of listeners.get(event.type) || []) fn({ ...event, target: el }); },
            querySelector(selector) {
                const match = selector.match(/^option\[value="(.*?)"\]$/);
                return match && options.has(match[1]) ? { remove() { options.delete(match[1]); } } : null;
            },
            querySelectorAll() { return []; },
            insertAdjacentHTML(_where, html) { for (const match of html.matchAll(/value="(.*?)"/g)) options.add(match[1]); },
            appendChild() {}, insertBefore() {}, setAttribute() {}, reset() {}, focus() {}, select() {},
        };
        elements.set(id, el);
        return el;
    }
    const storage = new Map();
    const context = vm.createContext({
        document: { getElementById: element, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, documentElement: element('html'), body: element('body') },
        window: { innerWidth: 1200, addEventListener() {}, lucide: { createIcons() {} } },
        lucide: { createIcons() {} },
        localStorage: { getItem: key => storage.get(key) || null, setItem: (key, val) => storage.set(key, String(val)) },
        console, setTimeout() {}, clearInterval() {}, Event: class { constructor(type) { this.type = type; } },
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8'), context);
    return { element, run: source => vm.runInContext(source, context) };
}

test('all-day blocks keep their 06:00 start with AM initially disabled', () => {
    const h = harness();
    h.run('toggleAllDayFields(true)');
    assert.equal(h.run('bookingStartTimeInput.value'), '06:00');
    assert.equal(h.run('bookingEndTimeInput.value'), '23:00');
    assert.equal(h.element('checkEnableAm').checked, true);
    assert.equal(h.element('startHourSelect').disabled, true);
});

test('changing start to 11 PM preserves midnight as the automatic end', () => {
    const h = harness();
    h.run('setupEventListeners(); bookingStartTimeInput.value = "23:00"');
    h.element('startHourSelect').dispatchEvent({ type: 'change' });
    assert.equal(h.run('bookingEndTimeInput.value'), '00:00');
    assert.equal(h.element('checkEnableAm').checked, true);
});

test('availability setters preserve midnight and morning values', () => {
    const h = harness();
    h.run('setCheckerCourtStartTime("00:00"); setCheckerCourtEndTime("01:00")');
    assert.equal(h.run('getCheckerCourtStartTime()'), '00:00');
    assert.equal(h.run('getCheckerCourtEndTime()'), '01:00');
    assert.equal(h.element('checkEnableAmChecker').checked, true);
});

test('closed hours are unavailable and never show a Reservar action', () => {
    const h = harness();
    h.element('checkCourtDate').value = '2026-10-30';
    h.run('setCheckerCourtStartTime("02:00"); setCheckerCourtEndTime("03:00"); updateCourtAvailabilityChecker()');
    assert.match(h.element('checkerCourtResultsGrid').innerHTML, /cerrado/);
    assert.doesNotMatch(h.element('checkerCourtResultsGrid').innerHTML, /quickBookCourtFromChecker/);
});

test('overlaps reject invalid and equal times but allow operational boundaries', () => {
    const h = harness();
    assert.match(h.run('checkOverlaps("", "Grande", "2026-10-30", "09:00", "09:00")'), /diferentes/);
    assert.match(h.run('checkOverlaps("", "Grande", "2026-10-30", "25:00", "26:00")'), /válidos/);
    assert.match(h.run('checkOverlaps("", "Grande", "2026-02-31", "10:00", "11:00")'), /válidos/);
    assert.equal(h.run('checkOverlaps("", "Grande", "2026-10-30", "23:00", "01:00")'), null);
    assert.equal(h.run('checkOverlaps("", "Grande", "2026-10-30", "06:00", "07:00")'), null);
    assert.match(h.run('checkOverlaps("", "Grande", "2026-10-30", "23:00", "01:01")'), /cerrado/);
});

test('midnight conflicts are checked across dates and adjacent bookings remain allowed', () => {
    const h = harness();
    h.run('allEvents = [{ id: "night", name: "Cliente", court: "Grande", date: "2026-10-30", start_time: "23:00", end_time: "00:30" }]');
    assert.match(h.run('checkOverlaps("", "Grande", "2026-10-31", "00:00", "01:00")'), /Conflicto/);
    assert.equal(h.run('checkOverlaps("", "Grande", "2026-10-31", "00:30", "01:00")'), null);
    assert.equal(h.run('checkOverlaps("", "Pequeña", "2026-10-31", "00:00", "01:00")'), null);
});

test('quick booking preserves volleyball and midnight defaults', () => {
    const h = harness();
    h.run('populateAsesoresDropdown = () => {}; closeSidebarDrawer = () => {}; openModal = () => {}; bookingSportInput.value = "Fútbol"');
    h.run('openBookingModal(null, { court: "Pequeña", sport: "Vóley", date: "2026-10-31", start_time: "00:00", end_time: "01:00" })');
    assert.equal(h.element('bookingCourt').value, 'Pequeña');
    assert.equal(h.element('bookingSport').value, 'Vóley');
    assert.equal(h.element('bookingPelota').value, 'true');
    assert.equal(h.run('bookingStartTimeInput.value'), '00:00');
    assert.equal(h.run('bookingEndTimeInput.value'), '01:00');
});

test('after-midnight tariffs use the previous business day consistently', () => {
    const h = harness();
    const income = (date, start, end) => h.run(`calculateBookingIncome({date: '${date}', startTime: '${start}', endTime: '${end}', court: 'Grande', sport: 'Fútbol', pelota: true, chaleco: true}).total`);
    assert.equal(income('2026-11-01', '23:00', '00:00'), 60);
    assert.equal(income('2026-11-02', '00:00', '01:00'), 60);
    assert.equal(income('2026-10-30', '00:00', '01:00'), 35);
    assert.equal(income('2026-10-31', '00:00', '01:00'), 60);
});
