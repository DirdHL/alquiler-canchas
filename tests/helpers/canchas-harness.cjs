const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Run the complete page script with isolated browser storage, without CDN or cloud access.
function canchasHarness(script, htmlFile, storage = new Map()) {
    const root = path.resolve(__dirname, '../..');
    const html = fs.readFileSync(path.join(root, htmlFile), 'utf8');
    const elements = new Map();
    const callbacks = {};
    let uuid = 0;

    class Element {
        constructor(id = '') {
            this.id = id; this.value = ''; this.checked = false; this.disabled = false;
            this.required = false; this.style = {}; this.dataset = {}; this.children = [];
            this.listeners = {}; this.textContent = ''; this.html = '';
            const classes = new Set();
            this.classList = {
                add: (...names) => names.forEach(name => classes.add(name)),
                remove: (...names) => names.forEach(name => classes.delete(name)),
                contains: name => classes.has(name),
                toggle: (name, force) => {
                    const enabled = force === undefined ? !classes.has(name) : force;
                    enabled ? classes.add(name) : classes.delete(name);
                    return enabled;
                }
            };
        }
        get innerHTML() { return this.html; }
        set innerHTML(value) { this.html = value; this.children = []; }
        get options() { return this.children; }
        appendChild(child) { child.parentElement = this; this.children.push(child); return child; }
        insertBefore(child, before) {
            const index = this.children.indexOf(before);
            if (index < 0) return this.appendChild(child);
            child.parentElement = this; this.children.splice(index, 0, child); return child;
        }
        remove() {
            if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(item => item !== this);
        }
        querySelector(selector) {
            const option = selector.match(/option\[value=["']([^"']*)["']\]/);
            return option ? this.children.find(child => child.value === option[1]) || null : null;
        }
        querySelectorAll(selector) { return selector === 'option' ? this.children : []; }
        addEventListener(type, callback) { (this.listeners[type] ||= []).push(callback); }
        dispatchEvent(event) { for (const callback of this.listeners[event.type] || []) callback({target: this, ...event}); }
        setAttribute(name, value) { this[name] = value; }
        getAttribute(name) { return this[name] ?? null; }
        reset() {}
        focus() {}
    }

    for (const match of html.matchAll(/<[\w-]+\b[^>]*\bid="([^"]+)"[^>]*>/g)) {
        const element = new Element(match[1]);
        element.checked = /\bchecked\b/.test(match[0]);
        const value = match[0].match(/\bvalue="([^"]*)"/);
        if (value) element.value = value[1];
        elements.set(element.id, element);
    }
    for (const match of html.matchAll(/<select\b[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
        const select = elements.get(match[1]);
        for (const option of match[2].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g)) {
            const child = new Element();
            child.value = option[1].match(/value="([^"]*)"/)?.[1] || option[2];
            child.textContent = option[2]; select.appendChild(child);
            if (select.children.length === 1 || /\bselected\b/.test(option[1])) select.value = child.value;
        }
    }
    const document = {
        getElementById: id => elements.get(id) || null,
        createElement: () => new Element(),
        body: new Element('body'), documentElement: new Element('html'),
        addEventListener(type, callback) { (callbacks[type] ||= []).push(callback); },
        querySelector: () => null,
        querySelectorAll: () => []
    };
    const localStorage = {
        getItem: key => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, String(value)),
        removeItem: key => storage.delete(key)
    };
    const context = vm.createContext({
        document, localStorage, console,
        window: {innerWidth: 1200, lucide: {createIcons() {}}, addEventListener() {}},
        lucide: {createIcons() {}},
        Event: class { constructor(type) { this.type = type; } },
        crypto: {randomUUID: () => `test-${++uuid}`},
        prompt: () => 'Reservasupabase', confirm: () => true, alert() {},
        setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
        FullCalendar: {Calendar: class {
            constructor(element, options) { this.options = options; }
            render() {}
            refetchEvents() {}
            getDate() { return new Date(2026, 9, 30, 12); }
        }}
    });
    vm.runInContext(fs.readFileSync(path.join(root, script), 'utf8'), context, {filename: script});
    const run = code => vm.runInContext(code, context);
    return {context, run, elements, storage, callbacks};
}

module.exports = {canchasHarness};
