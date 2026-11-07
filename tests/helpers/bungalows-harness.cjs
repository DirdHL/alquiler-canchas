const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '../..');

// Mini DOM suficiente para bungalows.js: elementos con id del HTML, checkboxes de bungalows,
// formularios con reset() y selectores simples.
class FakeElement {
    constructor(tag = 'div', attrs = {}) {
        this.tagName = tag.toUpperCase();
        this.id = attrs.id || '';
        this.name = attrs.name || '';
        this.type = attrs.type || '';
        this.value = attrs.value ?? '';
        this.defaultValue = this.value;
        this.checked = !!attrs.checked;
        this.defaultChecked = this.checked;
        this.disabled = !!attrs.disabled;
        this.required = !!attrs.required;
        this.style = {};
        this.dataset = {};
        this.children = [];
        this.listeners = {};
        this.textContent = '';
        this.html = '';
        this.parentElement = null;
        this.closestMap = {};
        this.queryMap = {};
        this._classes = new Set(String(attrs.class || '').split(/\s+/).filter(Boolean));
        this.classList = {
            add: (...names) => names.forEach(n => this._classes.add(n)),
            remove: (...names) => names.forEach(n => this._classes.delete(n)),
            contains: (name) => this._classes.has(name),
            toggle: (name, force) => {
                const on = force === undefined ? !this._classes.has(name) : !!force;
                if (on) this._classes.add(name); else this._classes.delete(name);
                return on;
            }
        };
    }
    get className() { return [...this._classes].join(' '); }
    set className(value) { this._classes = new Set(String(value).split(/\s+/).filter(Boolean)); }
    get innerHTML() { return this.html; }
    set innerHTML(value) { this.html = String(value); this.children = []; }
    get options() { return this.children; }
    appendChild(child) { child.parentElement = this; this.children.push(child); return child; }
    remove() {
        if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(c => c !== this);
    }
    closest(selector) { return this.closestMap[selector] || null; }
    querySelector(selector) {
        if (this.queryMap[selector]) return this.queryMap[selector];
        const option = selector.match(/option\[value=["']([^"']*)["']\]/);
        return option ? this.children.find(c => c.value === option[1]) || null : null;
    }
    querySelectorAll(selector) { return selector === 'option' ? this.children : []; }
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter(f => f !== fn); }
    dispatchEvent(event) {
        for (const fn of [...(this.listeners[event.type] || [])]) {
            fn.call(this, { target: this, currentTarget: this, preventDefault() {}, stopPropagation() {}, ...event });
        }
    }
    click() { this.dispatchEvent({ type: 'click' }); }
    setAttribute(name, value) { this[name] = value; }
    getAttribute(name) { return this[name] ?? null; }
    focus() {}
    reset() {
        for (const el of this.formElements || []) {
            if (el.tagName === 'SELECT') {
                const def = el.children.find(o => o.defaultSelected) || el.children[0];
                el.value = def ? def.value : '';
            } else {
                el.value = el.defaultValue;
                el.checked = el.defaultChecked;
            }
        }
    }
}

function parseAttrs(attrText) {
    const attrs = {};
    for (const m of attrText.matchAll(/([\w-]+)="([^"]*)"/g)) attrs[m[1]] = m[2];
    const bare = attrText.replace(/"[^"]*"/g, '""');
    for (const flag of ['checked', 'disabled', 'required', 'selected']) {
        if (new RegExp(`\\b${flag}\\b(?!=)`).test(bare)) attrs[flag] = true;
    }
    return attrs;
}

function buildDocument(html) {
    const byId = new Map();
    const all = [];
    const register = (el) => { all.push(el); if (el.id) byId.set(el.id, el); return el; };

    for (const m of html.matchAll(/<(\w+)\b([^>]*)>/g)) {
        const attrs = parseAttrs(m[2]);
        if (attrs.id || attrs.name === 'blockBungalow') register(new FakeElement(m[1], attrs));
    }

    // Opciones de los <select>
    for (const m of html.matchAll(/<select\b[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
        const select = byId.get(m[1]);
        select.children = [];
        for (const opt of m[2].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g)) {
            const attrs = parseAttrs(opt[1]);
            const child = new FakeElement('option', attrs);
            child.value = attrs.value ?? opt[2].trim();
            child.textContent = opt[2].replace(/\s+/g, ' ').trim();
            child.defaultSelected = !!attrs.selected;
            select.appendChild(child);
        }
        const def = select.children.find(o => o.defaultSelected) || select.children[0];
        select.value = def ? def.value : '';
    }

    // Tarjetas de los checkboxes de bungalows (closest('.bungalow-card') y su badge de estado)
    for (const el of all) {
        if (el.name === 'bungalowSelect') {
            const card = new FakeElement('div', { class: 'bungalow-card' });
            const status = new FakeElement('span', { class: 'bungalow-status available' });
            card.queryMap['.bungalow-status'] = status;
            el.closestMap['.bungalow-card'] = card;
        }
    }

    // Formularios: reset() restablece los campos que están dentro del <form>
    for (const m of html.matchAll(/<form\b[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/form>/g)) {
        const ids = [...m[2].matchAll(/\bid="([^"]+)"/g)].map(x => x[1]);
        byId.get(m[1]).formElements = ids.map(id => byId.get(id)).filter(el => el && ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName));
    }

    const stubs = new Map();
    const matches = (el, selector) => {
        let rest = selector;
        const name = rest.match(/\[name="([^"]+)"\]/);
        if (name && el.name !== name[1]) return false;
        const value = rest.match(/\[value="([^"]+)"\]/);
        if (value && String(el.value) !== value[1]) return false;
        if (rest.includes(':checked') && !el.checked) return false;
        rest = rest.replace(/\[[^\]]*\]/g, '').replace(':checked', '');
        const tag = rest.match(/^(\w+)/);
        if (tag && el.tagName !== tag[1].toUpperCase()) return false;
        const classes = [...rest.matchAll(/\.([\w-]+)/g)].map(c => c[1]);
        if (!name && classes.length === 0) return false;
        return classes.every(c => el.classList.contains(c));
    };
    const document = {
        body: new FakeElement('body'),
        documentElement: new FakeElement('html'),
        readyState: 'complete',
        activeElement: null,
        listeners: {},
        getElementById: (id) => byId.get(id) || null,
        createElement: (tag) => new FakeElement(tag),
        addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
        querySelectorAll(selector) {
            if (selector.includes(' ')) return [];
            return all.filter(el => matches(el, selector));
        },
        querySelector(selector) {
            const tableBody = selector.match(/^#([\w-]+) tbody$/);
            if (tableBody) {
                if (!stubs.has(selector)) stubs.set(selector, new FakeElement('tbody'));
                return stubs.get(selector);
            }
            return this.querySelectorAll(selector)[0] || null;
        }
    };
    return { document, byId };
}

// Supabase falso: guarda las filas en memoria y registra cada operación.
function fakeSupabase(initialTables = {}, { fail } = {}) {
    const tables = {};
    for (const [name, rows] of Object.entries(initialTables)) tables[name] = rows.map(r => ({ ...r }));
    const calls = [];
    let seq = 0;

    const execute = (q) => {
        calls.push({ table: q.table, op: q.op, payload: q.payload, filters: q.filters });
        const forced = fail && fail(q);
        if (forced) return { data: null, error: forced };
        if (!tables[q.table]) {
            if (q.table === 'historial') return { data: null, error: null };
            return { data: null, error: { message: `relation "${q.table}" does not exist`, code: '42P01' } };
        }
        const rows = tables[q.table];
        const pass = (row) => q.filters.every(([kind, col, val]) =>
            kind === 'eq' ? String(row[col]) === String(val) : val.map(String).includes(String(row[col])));
        if (q.op === 'insert') {
            const list = Array.isArray(q.payload) ? q.payload : [q.payload];
            list.forEach(p => rows.push({ id: `db-${++seq}`, created_at: p.created_at || '2026-11-05T10:00:00+00:00', ...p }));
            return { data: null, error: null };
        }
        if (q.op === 'update') {
            rows.forEach((row, i) => { if (pass(row)) rows[i] = { ...row, ...q.payload }; });
            return { data: null, error: null };
        }
        if (q.op === 'delete') {
            tables[q.table] = rows.filter(row => !pass(row));
            return { data: null, error: null };
        }
        let result = rows.filter(pass).map(r => ({ ...r }));
        if (q.range) result = result.slice(q.range[0], q.range[1] + 1);
        if (q.single) return { data: result[0] || null, error: null };
        return { data: result, error: null };
    };

    const client = {
        tables, calls,
        from(table) {
            const q = { table, op: 'select', filters: [], payload: null };
            const builder = {
                select() { return builder; },
                insert(payload) { q.op = 'insert'; q.payload = payload; return builder; },
                update(payload) { q.op = 'update'; q.payload = payload; return builder; },
                upsert(payload) { q.op = 'insert'; q.payload = payload; return builder; },
                delete() { q.op = 'delete'; return builder; },
                eq(col, val) { q.filters.push(['eq', col, val]); return builder; },
                in(col, vals) { q.filters.push(['in', col, vals]); return builder; },
                order() { return builder; },
                limit() { return builder; },
                gt() { return builder; },
                range(from, to) { q.range = [from, to]; return builder; },
                maybeSingle() { q.single = true; return builder; },
                then(resolve, reject) {
                    // La operación se ejecuta al momento; delayFor solo retrasa la respuesta (simula red lenta)
                    const result = execute(q);
                    const delay = client.delayFor && client.delayFor(q);
                    return (delay ? delay.then(() => result) : Promise.resolve(result)).then(resolve, reject);
                }
            };
            return builder;
        },
        rpc: async (name, args) => {
            calls.push({ op: 'rpc', name, args });
            return { data: null, error: { message: `function ${name} does not exist` } };
        },
        channel() { return { on() { return this; }, subscribe() { return this; } }; },
        removeChannel() {}
    };
    return client;
}

function bungalowsHarness({ storage = new Map(), innerWidth = 1200 } = {}) {
    const html = fs.readFileSync(path.join(ROOT, 'bungalows.html'), 'utf8');
    const { document, byId } = buildDocument(html);
    const dialogs = { alerts: [], confirms: [], confirmAnswer: true };
    const localStorage = {
        getItem: key => storage.has(key) ? storage.get(key) : null,
        setItem: (key, value) => storage.set(key, String(value)),
        removeItem: key => storage.delete(key)
    };
    const window = {
        innerWidth,
        innerHeight: 900,
        addEventListener() {},
        matchMedia: () => ({ matches: false }),
        lucide: { createIcons() {} }
    };
    const context = vm.createContext({
        document, window, localStorage, console,
        sessionStorage: { getItem: () => null, setItem() {} },
        lucide: { createIcons() {} },
        alert: (msg) => { dialogs.alerts.push(String(msg)); },
        confirm: (msg) => { dialogs.confirms.push(String(msg)); return dialogs.confirmAnswer; },
        prompt: () => null,
        setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
        FullCalendar: { Calendar: class { constructor(el, options) { this.options = options; } render() {} refetchEvents() {} getDate() { return new Date(); } updateSize() {} } },
        supabase: { createClient: () => null }
    });

    const source = fs.readFileSync(path.join(ROOT, 'bungalows.js'), 'utf8');
    vm.runInContext(source + `
this.api = {
    get bookings() { return bookings; },
    setBookings(rows) { bookings = rows; },
    setCloud(client) { dbMode = 'supabase'; supabaseClient = client; },
    get editState() { return editState; },
    get isTotalManuallyEdited() { return isTotalManuallyEdited; },
    setupEventListeners, openBookingModal, openBookingEditModal, handleSaveBooking, handleDeleteBooking,
    runDynamicCalculations, getBookingDateError, getDailyIncomeShare, updateDashboardStats,
    consolidateBookingRows, getExtraHoursAmount, parseServiceNotes, toggleSidebarHandler,
    fetchBookings, getVinoInventory, planGroupUpdate, getScheduleHours,
    calculateBasePrice, computeBookingPricing
};`, context, { filename: 'bungalows.js' });

    const api = context.api;
    api.setupEventListeners();
    const el = id => byId.get(id);
    const submit = () => api.handleSaveBooking({ preventDefault() {} });
    const change = (id, value) => {
        const input = el(id);
        if (input.type === 'checkbox') input.checked = value; else input.value = value;
        input.dispatchEvent({ type: 'input' });
        input.dispatchEvent({ type: 'change' });
    };
    const checkedBungalows = () => document.querySelectorAll('input[name="bungalowSelect"]:checked').map(c => Number(c.value));
    return { api, el, document, storage, dialogs, window, submit, change, checkedBungalows };
}

module.exports = { bungalowsHarness, fakeSupabase };
