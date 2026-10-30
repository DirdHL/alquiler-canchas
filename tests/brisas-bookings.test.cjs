const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness() {
    const elements = new Map();
    const storage = new Map();
    class Element {
        constructor(id = '') {
            this.id = id; this.value = ''; this.checked = false; this.children = [];
            this.style = {}; this.listeners = {}; this.innerHTML = ''; this.textContent = '';
            const classes = new Set();
            this.classList = {
                add: value => classes.add(value), remove: value => classes.delete(value),
                contains: value => classes.has(value), toggle: value => classes.has(value) ? classes.delete(value) : classes.add(value)
            };
        }
        appendChild(child) { child.parent = this; this.children.push(child); return child; }
        insertBefore(child) { child.parent = this; this.children.unshift(child); }
        remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
        querySelector(selector) {
            const value = selector.match(/option\[value="([^"]+)"\]/)?.[1];
            return value ? this.children.find(child => child.value === value) || null : null;
        }
        querySelectorAll() { return []; }
        addEventListener(name, handler) { (this.listeners[name] ||= []).push(handler); }
        dispatchEvent(event) {
            for (const handler of this.listeners[event.type] || []) handler.call(this, { target: this, preventDefault() {}, ...event });
        }
        insertAdjacentHTML(position, html) {
            for (const match of html.matchAll(/value="([^"]+)"/g)) {
                const option = new Element(); option.value = match[1]; this.appendChild(option);
            }
        }
        focus() {}
        setAttribute() {}
    }
    const el = id => {
        if (!elements.has(id)) elements.set(id, new Element(id));
        return elements.get(id);
    };
    const document = {
        getElementById: el, querySelector: () => null, querySelectorAll: () => [],
        addEventListener() {}, createElement: () => new Element(), body: new Element(), documentElement: new Element()
    };
    const context = vm.createContext({
        document, window: { addEventListener() {}, innerWidth: 1200 }, console,
        localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)) },
        lucide: { createIcons() {} }, Event: class Event { constructor(type) { this.type = type; } },
        setTimeout() {}, clearInterval() {}
    });
    const source = fs.readFileSync(path.join(__dirname, '..', 'brisas.js'), 'utf8');
    vm.runInContext(source + `\nthis.api = {
        fetchBookings, getLocalBookings, saveLocalBookings, filterEvents, checkOverlaps, toggleBlockFields,
        toggleAllDayFields, getCourtScheduleError, updateAvailabilityGrid, updateCourtAvailabilityChecker,
        setCheckerCourtStartTime, setCheckerCourtEndTime, getCheckerCourtStartTime, getCheckerCourtEndTime,
        updateStatsDashboard, getCurrentBusinessDate, setupEventListeners, bookingStartTimeInput, bookingEndTimeInput,
        calculateBookingIncome, getBrisasRate, buildRatesForm, handleStatsRatesSave,
        rateDefaults: BRISAS_RATE_DEFAULTS, rateInputs: BRISAS_RATE_INPUTS,
        courts: BRISAS_COURTS,
        setEvents: value => { allEvents = value; },
        setCalendar: value => { calendar = value; availabilityTimeFilter = 'all'; },
        setCloud: value => { dbMode = 'supabase'; supabaseClient = value; }
    };`, context);
    for (const id of ['startAmpmSelect', 'endAmpmSelect', 'checkCourtStartAmpm', 'checkCourtEndAmpm']) {
        const option = new Element(); option.value = 'pm'; el(id).appendChild(option); el(id).value = 'pm';
    }
    for (const court of context.api.courts) { const option = new Element(); option.value = court; el('bookingCourt').appendChild(option); }
    el('filterCanchaFutbol').checked = true; el('filterCanchaVoley').checked = true;
    return { ...context.api, el, storage };
}

const booking = (id, court, overrides = {}) => ({ id, court, sport: 'Fútbol', name: 'Cliente', date: '2026-10-30', start_time: '14:00', end_time: '15:00', ...overrides });

test('Brisas loads global blocks from local and cloud without mixing other venues', async () => {
    const h = harness();
    const rows = [booking('1', h.courts[0]), booking('2', 'Brisas Ambas', { sport: 'Bloqueo' }), booking('3', 'Grande'), booking('4', 'Cancha Grande')];
    h.saveLocalBookings(rows);
    assert.deepEqual(Array.from(await h.fetchBookings(), row => row.id), ['1', '2']);
    h.setCloud({ from: () => ({ select() { return this; }, order() { return this; }, range: async () => ({ data: rows, error: null }) }) });
    assert.deepEqual(Array.from(await h.fetchBookings(), row => row.id), ['1', '2']);
});

test('legacy and v2 local reservations survive edits and deleted records stay deleted', () => {
    const h = harness();
    h.storage.set('canchapro_reservas_brisas_v2', JSON.stringify([booking('old', h.courts[1]), booking('same', h.courts[0], { name: 'Anterior' })]));
    h.storage.set('canchapro_reservas_brisas', JSON.stringify([booking('same', h.courts[0], { name: 'Actual' })]));
    const rows = h.getLocalBookings();
    assert.deepEqual(Array.from(rows, row => row.id), ['old', 'same']);
    assert.equal(rows.find(row => row.id === 'same').name, 'Actual');
    h.saveLocalBookings(rows.filter(row => row.id !== 'old'));
    assert.deepEqual(Array.from(h.getLocalBookings(), row => row.id), ['same']);
});

test('global block option is unique, removed on normal reservation, and visible under either filter', () => {
    const h = harness();
    h.toggleBlockFields(true); h.toggleBlockFields(true);
    assert.equal(h.el('bookingCourt').children.filter(option => option.value === 'Brisas Ambas').length, 1);
    const block = booking('block', 'Brisas Ambas', { sport: 'Bloqueo' });
    h.el('filterCanchaFutbol').checked = false;
    assert.equal(h.filterEvents([block]).length, 1);
    h.el('filterCanchaVoley').checked = false;
    assert.equal(h.filterEvents([block]).length, 0);
    h.toggleBlockFields(false);
    assert.equal(h.el('bookingCourt').querySelector('option[value="Brisas Ambas"]'), null);
    assert.equal(h.el('bookingCourt').value, h.courts[0]);
});

test('global blocks prevent bookings on all five courts, permit adjacent hours, and fill the grid', () => {
    const h = harness();
    h.setEvents([booking('block', 'Brisas Ambas', { sport: 'Bloqueo' })]);
    for (const court of h.courts) {
        assert.match(h.checkOverlaps('', court, '2026-10-30', '14:30', '15:30'), /Conflicto/);
        assert.equal(h.checkOverlaps('', court, '2026-10-30', '15:00', '16:00'), null);
    }
    h.setCalendar({ getDate: () => new Date(2026, 9, 30) });
    h.updateAvailabilityGrid();
    assert.equal((h.el('availabilityTableBody').innerHTML.match(/availability-blocked-badge/g) || []).length, 10);
});

test('all-day blocks and checker setters preserve morning and midnight without AM initially enabled', () => {
    const h = harness();
    h.toggleAllDayFields(true);
    assert.equal(h.bookingStartTimeInput.value, '06:00');
    assert.equal(h.bookingEndTimeInput.value, '23:00');
    assert.equal(h.el('checkEnableAm').checked, true);
    h.bookingEndTimeInput.value = '00:00';
    assert.equal(h.bookingEndTimeInput.value, '00:00');
    h.setCheckerCourtStartTime('06:00'); h.setCheckerCourtEndTime('00:00');
    assert.equal(h.getCheckerCourtStartTime(), '06:00');
    assert.equal(h.getCheckerCourtEndTime(), '00:00');
    assert.equal(h.el('checkEnableAmChecker').checked, true);
});

test('automatic end time for 11 PM is midnight with AM enabled', () => {
    const h = harness();
    h.setupEventListeners();
    h.bookingStartTimeInput.value = '23:00';
    h.el('startHourSelect').dispatchEvent({ type: 'change' });
    assert.equal(h.bookingEndTimeInput.value, '00:00');
});

test('invalid hour/minute text is rejected by booking and checker inputs', () => {
    const h = harness();
    h.bookingStartTimeInput.value = '14:00';
    h.el('startHourSelect').value = '13';
    assert.equal(h.bookingStartTimeInput.value, '');
    h.setCheckerCourtStartTime('14:00');
    h.el('checkCourtStartMin').value = '60';
    assert.equal(h.getCheckerCourtStartTime(), '');
});

test('availability checker does not offer closed hours and reports global blocks on every court', () => {
    const h = harness();
    h.el('checkCourtDate').value = '2026-10-30';
    h.setCheckerCourtStartTime('01:00'); h.setCheckerCourtEndTime('02:00');
    h.updateCourtAvailabilityChecker();
    assert.match(h.el('checkerCourtResultsGrid').innerHTML, /cerrado/);
    assert.doesNotMatch(h.el('checkerCourtResultsGrid').innerHTML, /quickBookCourtFromChecker/);
    h.setEvents([booking('block', 'Brisas Ambas', { sport: 'Bloqueo' })]);
    h.setCheckerCourtStartTime('14:00'); h.setCheckerCourtEndTime('15:00');
    h.updateCourtAvailabilityChecker();
    assert.equal((h.el('checkerCourtResultsGrid').innerHTML.match(/checker-status-badge busy/g) || []).length, 5);
    assert.equal(h.getCourtScheduleError('2026-10-30', '23:00', '01:00'), null);
});

test('statistics account for current football and volleyball courts', () => {
    const h = harness();
    const date = h.getCurrentBusinessDate();
    h.setEvents([booking('football', h.courts[0], { date }), booking('volleyball', h.courts[3], { date, sport: 'Vóley' })]);
    h.updateStatsDashboard();
    const html = h.el('statsBreakdownTableBody').innerHTML;
    assert.match(html, /Canchas Fútbol/); assert.match(html, /Canchas Vóley/);
    assert.equal((html.match(/1 res\. \/ 1\.0h/g) || []).length, 6);
});

test('weekend football prices respect 3 PM and 6 PM boundaries on every football court', () => {
    const h = harness();
    for (const date of ['2026-10-30', '2026-10-31', '2026-11-01']) {
        for (const court of h.courts.slice(0, 3)) {
            const big = court.includes('Cancha 3');
            for (const [startTime, endTime, expected] of [
                ['14:00', '15:00', 25],
                ['15:00', '18:00', big ? 150 : 120],
                ['18:00', '19:00', big ? 60 : 50],
                ['14:30', '15:30', big ? 37.5 : 32.5],
                ['17:30', '18:30', big ? 55 : 45]
            ]) {
                const income = h.calculateBookingIncome({ date, court, sport: 'Fútbol', startTime, endTime, pelota: false, chaleco: false });
                assert.equal(income.total, expected, `${date} ${court} ${startTime}–${endTime}`);
                assert.equal(income.equipmentIncluded, endTime > '15:00');
            }
        }
    }
});

test('equipment is extra before the promo, included during the promo, and weekday/volleyball defaults stay intact', () => {
    const h = harness();
    const params = { date: '2026-10-30', court: h.courts[2], sport: 'Fútbol', startTime: '14:00', endTime: '15:00', pelota: true, chaleco: true };
    assert.equal(h.calculateBookingIncome(params).total, 35);
    assert.equal(h.calculateBookingIncome({ ...params, startTime: '15:00', endTime: '16:00' }).total, 50);
    assert.equal(h.calculateBookingIncome({ ...params, date: '2026-10-29', startTime: '15:00', endTime: '18:00' }).total, 85);
    assert.equal(h.calculateBookingIncome({ ...params, court: h.courts[3], sport: 'Vóley' }).total, 25);
    h.setupEventListeners();
    h.el('bookingDate').value = params.date;
    h.bookingStartTimeInput.value = '14:00'; h.bookingEndTimeInput.value = '15:00';
    h.el('bookingCourt').value = h.courts[2]; h.el('bookingCourt').dispatchEvent({ type: 'change' });
    assert.equal(h.el('bookingPelota').value, 'false');
    assert.equal(h.el('bookingChaleco').value, 'false');
});

test('weekend night price continues after midnight into the next calendar date', () => {
    const h = harness();
    const params = { date: '2026-11-01', court: h.courts[2], sport: 'Fútbol', startTime: '23:30', endTime: '00:30' };
    assert.equal(h.calculateBookingIncome(params).total, 60);
    assert.equal(h.calculateBookingIncome({ ...params, date: '2026-11-02', startTime: '00:00', endTime: '01:00' }).total, 60);
    assert.equal(h.calculateBookingIncome({ ...params, date: '2026-10-30', startTime: '00:00', endTime: '01:00' }).total, 25);
});

test('Brisas rate editor reads and saves only its own venue settings, and calculator applies them', () => {
    const h = harness();
    h.storage.set('canchapro_rate_grande', '999');
    h.storage.set('canchapro_rate_viedom_36_grande', '999');
    h.buildRatesForm();
    assert.doesNotMatch(h.el('ratesFormRow').innerHTML, /999|Cancha Grande|Cancha Pequeña/);
    assert.match(h.el('ratesFormRow').innerHTML, /Cancha 3 \(16 jug\)/);
    assert.match(h.el('ratesFormRow').innerHTML, /Canchas 1 y 2/);
    for (const [id, key] of Object.entries(h.rateInputs)) h.el(id).value = String(h.rateDefaults[key]);
    h.el('rateGrande').value = '30'; h.el('ratePequena').value = '20'; h.el('rateVoley').value = '15';
    h.el('ratePelota').value = '3'; h.el('rateChaleco').value = '4';
    h.el('rateVieDom36Grande').value = '55'; h.el('rateVieDom36Pequena').value = '45';
    h.el('rateVieDom612Grande').value = '65'; h.el('rateVieDom612Pequena').value = '55';
    h.handleStatsRatesSave({ preventDefault() {} });
    assert.equal(h.storage.get('canchapro_rate_grande'), '999');
    assert.equal(h.storage.get('canchapro_rate_viedom_36_grande'), '999');
    assert.equal(h.storage.get('canchapro_brisas_rate_cancha3'), '30');
    const params = { date: '2026-10-29', court: h.courts[2], sport: 'Fútbol', startTime: '14:00', endTime: '15:00', pelota: true, chaleco: true };
    assert.equal(h.calculateBookingIncome(params).total, 37);
    assert.equal(h.calculateBookingIncome({ ...params, court: h.courts[0] }).total, 27);
    assert.equal(h.calculateBookingIncome({ ...params, court: h.courts[3], sport: 'Vóley' }).total, 15);
    assert.equal(h.calculateBookingIncome({ ...params, date: '2026-10-30', startTime: '15:00', endTime: '18:00' }).total, 165);
    assert.equal(h.calculateBookingIncome({ ...params, date: '2026-10-30', startTime: '18:00', endTime: '19:00' }).total, 65);
});

test('Brisas rates accept zero, reject invalid edits, and ignore malformed persisted values', () => {
    const h = harness();
    h.storage.set('canchapro_brisas_rate_cancha3', '0');
    assert.equal(h.getBrisasRate('cancha3'), 0);
    h.storage.set('canchapro_brisas_rate_cancha3', 'invalid');
    assert.equal(h.getBrisasRate('cancha3'), 25);
    for (const [id, key] of Object.entries(h.rateInputs)) h.el(id).value = String(h.rateDefaults[key]);
    h.el('rateChaleco').value = '-1';
    h.handleStatsRatesSave({ preventDefault() {} });
    assert.equal(h.storage.get('canchapro_brisas_rate_cancha3'), 'invalid');
    assert.equal(h.storage.has('canchapro_brisas_rate_pelota'), false);
    assert.match(h.el('statsRatesFeedback').textContent, /válidos/);
});
