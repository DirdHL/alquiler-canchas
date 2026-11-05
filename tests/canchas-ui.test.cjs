const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'canchas-ui.js'), 'utf8');

function setup(observer = true) {
    let width = 1000, updates = 0, callback;
    const frames = [], events = {};
    const element = { getBoundingClientRect: () => ({ width }) };
    const container = { addEventListener: (name, fn) => { events[name] = fn; } };
    const context = {
        document: { readyState: 'complete', getElementById: () => element, querySelector: () => container },
        window: { addEventListener: (name, fn) => { events[name] = fn; } },
        calendar: { updateSize: () => { updates++; } },
        requestAnimationFrame: fn => { frames.push(fn); return frames.length; },
    };
    if (observer) context.ResizeObserver = class { constructor(fn) { callback = fn; } observe() {} };
    vm.runInNewContext(source, context);
    return {
        context, container, events,
        resize: value => { width = value; if (callback) callback(); },
        flush: () => { while (frames.length) frames.shift()(); },
        updates: () => updates,
    };
}

test('recalculates after sidebar expansion and collapse, coalescing each frame', () => {
    const ui = setup();
    ui.flush();
    assert.equal(ui.updates(), 1);
    ui.resize(900); ui.resize(800); ui.resize(700); ui.flush();
    assert.equal(ui.updates(), 2);
    ui.resize(1000); ui.flush();
    assert.equal(ui.updates(), 3);
    ui.resize(1000); ui.flush();
    assert.equal(ui.updates(), 3, 'height changes must not create a resize loop');
});

test('handles hidden calendars and updates when visible again', () => {
    const ui = setup(); ui.flush();
    ui.resize(0); ui.flush();
    assert.equal(ui.updates(), 1);
    ui.resize(1000); ui.flush();
    assert.equal(ui.updates(), 2);
});

test('transition and window resize fallback works without ResizeObserver', () => {
    const ui = setup(false); ui.flush(); ui.resize(700);
    ui.events.transitionend({ target: {}, propertyName: 'grid-template-columns' }); ui.flush();
    assert.equal(ui.updates(), 1);
    ui.events.transitionend({ target: ui.container, propertyName: 'grid-template-columns' }); ui.flush();
    assert.equal(ui.updates(), 2);
    ui.resize(1000); ui.events.resize(); ui.flush();
    assert.equal(ui.updates(), 3);
});

test('does not fail when the calendar has not initialized', () => {
    const ui = setup(); delete ui.context.calendar;
    assert.doesNotThrow(ui.flush);
    assert.equal(ui.updates(), 0);
});
