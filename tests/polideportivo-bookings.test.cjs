const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'polideportivo.js'), 'utf8');

function harness() {
    const elements = new Map();
    const storage = new Map();
    class Element {
        constructor(id = '') {
            this.id = id; this._value = ''; this.checked = false; this.disabled = false;
            this.style = {}; this.children = []; this.listeners = {}; this.dataset = {};
            const classes = new Set();
            this.classList = {
                add: (...items) => items.forEach(item => classes.add(item)),
                remove: (...items) => items.forEach(item => classes.delete(item)),
                contains: item => classes.has(item),
                toggle: (item, force) => force ? classes.add(item) : classes.delete(item)
            };
        }
        get value() { return this._value; }
        set value(value) {
            const text = String(value);
            this._value = this.isSelect && !this.children.some(child => child.value === text) ? '' : text;
        }
        appendChild(child) { child.parent = this; this.children.push(child); return child; }
        insertBefore(child) { child.parent = this; this.children.unshift(child); return child; }
        remove() {
            if (!this.parent) return;
            const parent = this.parent;
            parent.children = parent.children.filter(child => child !== this);
            if (parent.value === this.value) parent.value = parent.children[0]?.value || '';
        }
        querySelector(selector) {
            const match = selector.match(/option\[value="([^"]*)"\]/);
            return match ? this.children.find(child => child.value === match[1]) || null : null;
        }
        querySelectorAll(selector) {
            if (selector === 'option[data-legacy-court]') return this.children.filter(child => child.dataset.legacyCourt);
            return [];
        }
        addEventListener(name, handler) { (this.listeners[name] ||= []).push(handler); }
        dispatchEvent(event) { (this.listeners[event.type] || []).forEach(handler => handler({ target: this, ...event })); }
        reset() {} focus() {} select() {} setAttribute() {} removeAttribute() {}
    }
    const el = id => {
        if (!elements.has(id)) elements.set(id, new Element(id));
        return elements.get(id);
    };
    const setOptions = (id, values) => {
        const select = el(id); select.isSelect = true;
        values.forEach(value => { const option = new Element(); option.value = value; select.appendChild(option); });
        select.value = values[0];
    };
    ['startAmpmSelect', 'endAmpmSelect', 'checkCourtStartAmpm', 'checkCourtEndAmpm'].forEach(id => setOptions(id, ['pm']));
    setOptions('bookingCourt', ['Cancha Grande 1', 'Cancha Grande 2', 'Cancha Grande 3', 'Cancha Pequeña 1', 'Cancha Pequeña 2', 'Cancha Pequeña 3', 'Cancha Pequeña 4', 'Cancha de Vóley 1', 'Cancha de Vóley 2', 'Cancha de Vóley 3', 'Cancha de Vóley 4']);
    setOptions('bookingSport', ['Fútbol', 'Vóley']);
    const document = {
        body: new Element('body'), documentElement: new Element('html'), getElementById: el,
        createElement: () => new Element(), addEventListener() {},
        querySelectorAll: () => [], querySelector: () => null
    };
    const context = vm.createContext({
        document, window: { addEventListener() {}, innerWidth: 1200 }, console,
        localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
        lucide: { createIcons() {} }, setTimeout() {}, clearInterval() {},
        Event: class { constructor(type) { this.type = type; } },
        alert() {}, prompt: () => 'Reservasupabase'
    });
    vm.runInContext(source + '\nglobalThis.api = { checkOverlaps, getBookingTimeError, fetchBookings, getPolideportivoCourtAssignments, setCheckerCourtStartTime, setCheckerCourtEndTime, getCheckerCourtStartTime, getCheckerCourtEndTime, updateCourtAvailabilityChecker, toggleAllDayFields, openBookingModal, toggleBlockFields, setupEventListeners, bookingStartTimeInput, bookingEndTimeInput, setEvents(events) { allEvents = events; } };', context);
    return { ...context.api, el, storage, context };
}
const booking = (id, court, start, end, date = '2026-10-30') => ({
    id, court, date, start_time: start, end_time: end, name: id, sport: 'Fútbol', notes: '', medio: 'Cliente frecuente'
});

test('AM setters preserve morning and midnight, enabling both selectors', () => {
    const h = harness();
    h.bookingStartTimeInput.value = '06:00';
    h.bookingEndTimeInput.value = '00:30';
    assert.equal(h.bookingStartTimeInput.value, '06:00');
    assert.equal(h.bookingEndTimeInput.value, '00:30');
    assert.equal(h.el('checkEnableAm').checked, true);
    assert.ok(h.el('endAmpmSelect').querySelector('option[value="am"]'));
    h.setCheckerCourtStartTime('23:00'); h.setCheckerCourtEndTime('00:00');
    assert.equal(h.getCheckerCourtEndTime(), '00:00');
    assert.equal(h.el('checkEnableAmChecker').checked, true);
});

test('all-day blocking starts at 06 AM and start changes can cross midnight', () => {
    const h = harness();
    h.toggleAllDayFields(true);
    assert.equal(h.bookingStartTimeInput.value, '06:00');
    assert.equal(h.bookingEndTimeInput.value, '23:00');
    h.toggleAllDayFields(false);
    h.setupEventListeners();
    h.bookingStartTimeInput.value = '23:00';
    h.el('startHourSelect').dispatchEvent({ type: 'change' });
    assert.equal(h.bookingEndTimeInput.value, '00:00');
});

test('same operating hours apply to saving and availability, including overnight edges', () => {
    const h = harness();
    assert.equal(h.checkOverlaps('', 'Cancha Grande 1', '2026-10-30', '23:00', '01:00'), null);
    assert.match(h.checkOverlaps('', 'Cancha Grande 1', '2026-10-30', '00:30', '01:30'), /cerrado/);
    assert.match(h.getBookingTimeError('2026-02-31', '18:00', '19:00'), /válidos/);
    h.el('checkCourtDate').value = '2026-10-30';
    h.setCheckerCourtStartTime('02:00'); h.setCheckerCourtEndTime('03:00');
    h.updateCourtAvailabilityChecker();
    assert.match(h.el('checkerCourtResultsGrid').innerHTML, /cerrado/);
    assert.doesNotMatch(h.el('checkerCourtResultsGrid').innerHTML, /checker-court-card available/);
});

test('legacy category bookings consume physical capacity and are respected by numbered bookings', () => {
    const h = harness();
    h.setEvents([booking('old', 'Cancha Grande', '18:00', '19:00')]);
    assert.match(h.checkOverlaps('', 'Cancha Grande 1', '2026-10-30', '18:00', '19:00'), /Conflicto/);
    assert.equal(h.checkOverlaps('', 'Cancha Grande 2', '2026-10-30', '18:00', '19:00'), null);
    assert.equal(h.checkOverlaps('old', 'Cancha Grande', '2026-10-30', '18:00', '19:00'), null);
    h.setEvents([1, 2, 3].map(i => booking(`old-${i}`, 'Cancha Grande', '18:00', '19:00')));
    assert.match(h.checkOverlaps('', 'Cancha Grande 3', '2026-10-30', '18:00', '19:00'), /Conflicto/);
    assert.equal(h.checkOverlaps('', 'Cancha Pequeña 1', '2026-10-30', '18:00', '19:00'), null);
});

test('checker reuses one numbered court for consecutive reservations', () => {
    const h = harness();
    h.setEvents([booking('first', 'Cancha Grande 1', '18:00', '19:00'), booking('second', 'Cancha Grande 1', '19:00', '20:00')]);
    h.el('checkCourtDate').value = '2026-10-30';
    h.setCheckerCourtStartTime('18:00'); h.setCheckerCourtEndTime('20:00');
    h.updateCourtAvailabilityChecker();
    assert.match(h.el('checkerCourtResultsGrid').innerHTML, /2 \/ 3 libres/);
    assert.equal((h.el('checkerCourtResultsGrid').innerHTML.match(/checker-court-card occupied/g) || []).length, 1);
});

test('all-court blocks conflict with every category, while touching endpoints are allowed', () => {
    const h = harness();
    h.setEvents([{ ...booking('closed', 'Todas', '18:00', '19:00'), sport: 'Bloqueo' }]);
    assert.match(h.checkOverlaps('', 'Cancha de Vóley 4', '2026-10-30', '18:30', '19:30'), /Conflicto/);
    assert.equal(h.checkOverlaps('', 'Cancha Grande 1', '2026-10-30', '19:00', '20:00'), null);
});

test('local reads only accept exact Polideportivo courts', async () => {
    const h = harness();
    h.storage.set('canchapro_reservas_poli', JSON.stringify([
        booking('valid', 'Cancha Grande 1', '18:00', '19:00'),
        booking('other', 'Brisas Grande', '18:00', '19:00'),
        booking('prefix', 'Cancha Grande de otra sede', '18:00', '19:00')
    ]));
    const events = await h.fetchBookings();
    assert.equal(events.length, 1);
    assert.equal(events[0].id, 'valid');
});

test('legacy bookings remain editable and clearing a block restores a real court', () => {
    const h = harness();
    h.openBookingModal(booking('old', 'Cancha Grande', '18:00', '19:00'));
    assert.equal(h.el('bookingCourt').value, 'Cancha Grande');
    h.el('bookingIsBlock').checked = true;
    h.toggleBlockFields(true);
    assert.equal(h.el('bookingCourt').value, 'Todas');
    h.el('bookingIsBlock').checked = false;
    h.toggleBlockFields(false);
    assert.equal(h.el('bookingCourt').value, 'Cancha Grande 1');
    assert.equal(h.el('bookingSport').value, 'Fútbol');
});


test('legacy assignments can move an earlier booking to keep a later fixed court available', () => {
    const h = harness();
    h.setEvents([
        booking('A', 'Cancha Grande', '17:00', '18:00'),
        booking('B', 'Cancha Grande', '17:30', '18:30'),
        booking('C', 'Cancha Grande 2', '18:00', '18:30'),
        booking('D', 'Cancha Grande 3', '18:00', '18:30')
    ]);
    const records = h.getPolideportivoCourtAssignments();
    assert.equal(records.find(record => record.event.id === 'A').courts.length, 1);
    assert.equal(records.find(record => record.event.id === 'B').courts[0], 'Cancha Grande 1');
    assert.equal(h.checkOverlaps('', 'Cancha Grande 3', '2026-10-30', '17:30', '18:00'), null);
    h.el('checkCourtDate').value = '2026-10-30';
    h.setCheckerCourtStartTime('17:30'); h.setCheckerCourtEndTime('18:00');
    h.updateCourtAvailabilityChecker();
    assert.match(h.el('checkerCourtResultsGrid').innerHTML, /1 \/ 3 libres/);
    vm.runInContext('globalThis.gridDefaults = null; openBookingModal = (booking, defaults) => { globalThis.gridDefaults = defaults; };', h.context);
    h.context.window.openBookingFromGrid('2026-10-30', '17:30', '18:00', 'Cancha Grande');
    assert.equal(h.context.gridDefaults.court, 'Cancha Grande 3');
});

test('generic assignments reuse slots across independent dates without changing fixed courts', () => {
    const h = harness();
    const events = [];
    for (let day = 1; day <= 28; day++) {
        const date = `2026-10-${String(day).padStart(2, '0')}`;
        for (let slot = 0; slot < 18; slot++) {
            const start = `${String(slot + 6).padStart(2, '0')}:00`;
            const end = `${String((slot + 7) % 24).padStart(2, '0')}:00`;
            events.push(booking(`generic-${day}-${slot}`, 'Cancha de Vóley', start, end, date));
            events.push(booking(`fixed-${day}-${slot}`, 'Cancha de Vóley 1', start, end, date));
        }
    }
    h.setEvents(events);
    const assignments = h.getPolideportivoCourtAssignments();
    assert.equal(assignments.length, events.length);
    assignments.forEach(record => {
        assert.equal(record.courts.length, 1);
        assert.equal(record.courts[0], record.event.id.startsWith('generic') ? 'Cancha de Vóley 2' : 'Cancha de Vóley 1');
    });
});

test('zero or out-of-range twelve-hour inputs are not converted to valid booking times', () => {
    const h = harness();
    h.el('startHourSelect').value = '00'; h.el('startMinSelect').value = '00';
    assert.equal(h.bookingStartTimeInput.value, '');
    h.el('checkCourtStartHour').value = '00'; h.el('checkCourtStartMin').value = '00';
    assert.equal(h.getCheckerCourtStartTime(), '');
});
