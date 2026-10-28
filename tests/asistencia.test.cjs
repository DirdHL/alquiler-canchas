const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'asistencia.js'), 'utf8');

function harness(date = [2026, 9, 28, 17, 0, 0]) {
    const elements = new Map();
    const storage = new Map();
    const alerts = [];
    const events = {};
    const observers = new Map();
    const exportedRows = [];
    let document;
    class Element {
        constructor(id = '') {
            this.id = id; this.value = ''; this.checked = false; this.disabled = false;
            this.style = {}; this.children = []; this.listeners = {}; this.attrs = {};
            this.tabIndex = 0; this.type = ''; this.isConnected = true; this.inert = false;
            const classes = new Set();
            this.classList = {
                add: (...items) => items.forEach(item => classes.add(item)),
                remove: (...items) => items.forEach(item => classes.delete(item)),
                contains: item => classes.has(item),
                toggle: (item, force) => {
                    const active = force === undefined ? !classes.has(item) : force;
                    active ? classes.add(item) : classes.delete(item); return active;
                }
            };
        }
        set innerHTML(value) {
            this.html = value; this.children = []; this.actions = {};
            for (const match of value.matchAll(/data-action="([^"]+)"/g)) this.actions[match[1]] = new Element();
        }
        get innerHTML() { return this.html || ''; }
        appendChild(child) { child.parent = this; this.children.push(child); return child; }
        addEventListener(name, handler) { (this.listeners[name] ||= []).push(handler); }
        async fire(name, event = {}) {
            for (const handler of this.listeners[name] || []) await handler({preventDefault() {}, ...event});
        }
        click() { return this.fire('click'); }
        focus() { document.activeElement = this; }
        blur() { document.activeElement = document.body; }
        getAttribute(name) { return this.attrs[name]; }
        setAttribute(name, value) { this.attrs[name] = value; }
        matches(selector) { return selector.includes(this.tag || 'button'); }
        closest() { for (let item = this; item; item = item.parent) if (item.inert) return item; return null; }
        contains(child) { return child === this || this.children.some(item => item.contains(child)); }
        getClientRects() { return this.hidden ? [] : [{}]; }
        querySelector(selector) {
            const action = selector.match(/data-action="([^"]+)"/);
            if (action) return this.actions?.[action[1]] || null;
            if (selector === '.modal-card') return this.card;
            if (selector === '.btn-close, #btnCancelConfirm') return this.closeButton;
            return this.parts?.[selector] || null;
        }
        querySelectorAll(selector) {
            if (selector === '.schedule-day-card') return this.rows || [];
            if (selector === '.emoji-opt-btn') return [];
            if (selector.includes('a[href]')) return this.controls || [];
            return [];
        }
    }
    const el = id => {
        if (!elements.has(id)) elements.set(id, new Element(id));
        return elements.get(id);
    };
    document = {
        activeElement: null, body: new Element('body'),
        getElementById: el, createElement: tag => {const item = new Element(); item.tag = tag; return item;},
        addEventListener(name, handler) { (events[name] ||= []).push(handler); },
        querySelectorAll(selector) {
            if (selector === '.modal-backdrop') return Array.from(elements.values()).filter(item => item.id.startsWith('modal'));
            if (selector === '#btnExportExcel, .btn-excel') return [el('btnExportExcel')];
            return [];
        }
    };
    document.activeElement = document.body;
    const days = ['lunes','martes','miercoles','jueves','viernes','sabado','domingo'];
    el('scheduleDaysContainer').rows = days.map((day, index) => {
        const row = new Element(); row.attrs['data-day'] = day;
        row.parts = Object.fromEntries(['.day-active-cb','.time-in','.time-out','.lunch-cb','.day-calc-hours'].map(key => [key,new Element()]));
        row.parts['.day-active-cb'].checked = index < 5;
        row.parts['.time-in'].value = '08:00'; row.parts['.time-out'].value = '16:00';
        return row;
    });
    el('filterEmployee').value = 'todos'; el('filterType').value = 'todos';
    el('filterMonth').value = '2026-10'; el('filterWeek').value = 'todas';
    class FakeDate extends Date {
        constructor(...args) { super(...(args.length ? args : date)); }
    }
    const env = {
        document, window: {URL:{createObjectURL:()=> 'blob:test',revokeObjectURL() {}}},
        localStorage: {getItem:key=>storage.get(key) || null, setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
        Date: FakeDate, crypto:{randomUUID:()=> 'test-id'}, alert:message=>alerts.push(message),
        prompt:()=>null, confirm:()=>true, console:{warn(){},error(){}},
        MutationObserver: class {constructor(callback) {this.callback=callback;} observe(element) {observers.set(element,this.callback);}},
        Blob: class {},
        ExcelJS:{Workbook:class {constructor() {this.xlsx={writeBuffer:async()=> []};} addWorksheet() {return {getRow:()=>({}),addRow:row=>exportedRows.push(row)};}}}
    };
    const api = new Function(...Object.keys(env), source + '\nreturn {run: code => eval(code)};')(...Object.values(env));
    const schedule = Object.fromEntries(days.map((day,index)=>[day,{active:index<5,in:'08:00',out:'16:00',lunch:false,netMinutes:index<5?480:0}]));
    schedule.created_at = '2026-10-01'; schedule.weeklyTarget = 40;
    api.run('activeWorkers = [{name:"Ana",emoji:"A",created_at:"2026-10-01",is_active:true}]; selectedWorker=activeWorkers[0];');
    api.run('workerSchedules = ' + JSON.stringify({Ana:schedule}));
    return {...api,el,storage,alerts,events,observers,document,exportedRows,schedule};
}


test('la jornada abierta suma desde el primer minuto sin duplicar crédito almacenado', () => {
    const h=harness([2026,9,28,8,59,41]);
    h.run('attendanceRecords=[{employee_name:"Ana",date:"2026-10-28",type:"Trabajo",check_in:"08:00:00",check_out:null,hours_credited:3,lunch:true}]; updateWorkerStats();');
    assert.equal(h.el('weeklyGoalHoursText').textContent,'1.0 / 40.0 h');
    assert.ok(h.el('weeklyGoalHelpText').textContent.includes('refrigerio se descontará al cerrar'));
    assert.ok(parseFloat(h.el('goalProgressBar').style.width)>0);
    assert.equal(h.run('attendanceRecords[0].hours_credited'),3);
});

test('la meta se actualiza aunque el reloj no pase por el segundo cero', () => {
    const h=harness([2026,9,28,8,59,41]);
    h.run('attendanceRecords=[{employee_name:"Ana",date:"2026-10-28",type:"Trabajo",check_in:"08:00:00",check_out:null,hours_credited:0,lunch:false}]; updateLiveClock();');
    assert.ok(h.el('weeklyGoalHelpText').textContent.includes('0h 59m'));
    h.run('Date=class extends Date {constructor(...args){super(...(args.length?args:[2026,9,28,9,0,12]));}}; updateLiveClock();');
    assert.ok(h.el('weeklyGoalHelpText').textContent.includes('1h 00m'));
});

test('solo cuenta la semana actual hasta hoy y admite créditos numéricos en texto', () => {
    const h=harness();
    h.run('attendanceRecords=[{employee_name:"Ana",date:"2026-10-27",type:"Trabajo",hours_credited:"8"},{employee_name:"Ana",date:"2026-10-25",type:"Trabajo",hours_credited:8},{employee_name:"Ana",date:"2026-10-30",type:"Permiso",hours_credited:8},{employee_name:"Ana",date:"2026-11-02",type:"Permiso",hours_credited:8}]; updateWorkerStats();');
    assert.equal(h.el('weeklyGoalHoursText').textContent,'8.0 / 40.0 h');
});

test('corrige cierres automáticos inválidos usando la salida programada una sola vez', async () => {
    const h=harness();
    h.run('attendanceRecords=[{id:"antiguo",employee_name:"Ana",date:"2026-10-27",type:"Trabajo",check_in:"08:00:00",check_out:"06:59:00",hours_credited:0,late_minutes:7,extra_minutes:12,lunch:true,notes:"Salida automática del sistema a las 6:59 AM."}]; saveLocalAttendance(attendanceRecords);');
    await h.run('repairInvalidAutomaticCheckouts()');
    assert.equal(h.run('attendanceRecords[0].check_out'),'16:00:00');
    assert.equal(h.run('attendanceRecords[0].hours_credited'),7);
    assert.equal(h.run('attendanceRecords[0].late_minutes'),7);
    assert.equal(h.run('attendanceRecords[0].extra_minutes'),12);
    const first=h.run('JSON.stringify(attendanceRecords)');
    await h.run('repairInvalidAutomaticCheckouts()');
    assert.equal(h.run('JSON.stringify(attendanceRecords)'),first);
    assert.ok(h.run('attendanceRecords[0].notes.includes("salida anterior 06:59:00")'));
    h.run('updateWorkerStats()');
    assert.equal(h.el('weeklyGoalHoursText').textContent,'7.0 / 40.0 h');
});

test('no altera una marcación manual ni una salida válida de un minuto', async () => {
    const h=harness();
    h.run('attendanceRecords=[{id:"manual",employee_name:"Ana",date:"2026-10-27",type:"Trabajo",check_in:"08:00:00",check_out:"06:59:00",hours_credited:0,notes:"Salida manual."},{id:"breve",employee_name:"Ana",date:"2026-10-27",type:"Trabajo",check_in:"08:08:00",check_out:"08:09:00",hours_credited:0.02,notes:"Salida automática del sistema a las 8:09 AM."}];');
    const original=h.run('JSON.stringify(attendanceRecords)');
    await h.run('repairInvalidAutomaticCheckouts()');
    assert.equal(h.run('JSON.stringify(attendanceRecords)'),original);
});

test('la reparación respeta jornadas sin refrigerio', async () => {
    const h=harness();
    h.run('attendanceRecords=[{id:"antiguo",employee_name:"Ana",date:"2026-10-27",type:"Trabajo",check_in:"08:09:00",check_out:"07:08:00",hours_credited:0,notes:"[Sin refrigerio: jornada corrida]. Salida automática del sistema a las 7:08 AM."}]; saveLocalAttendance(attendanceRecords);');
    await h.run('repairInvalidAutomaticCheckouts()');
    assert.equal(h.run('attendanceRecords[0].hours_credited'),7.85);
});

test('un fallo remoto de reparación conserva el registro y avisa en la meta', async () => {
    const h=harness();
    h.run('dbMode="supabase"; supabaseClient={from:()=>({update:()=>({eq:()=>({eq:()=>({select:async()=>({error:{message:"denegado"}})})})})})}; attendanceRecords=[{id:"antiguo",employee_name:"Ana",date:"2026-10-27",type:"Trabajo",check_in:"08:00:00",check_out:"06:59:00",hours_credited:0,lunch:true,notes:"Salida automática del sistema a las 6:59 AM."}];');
    await h.run('repairInvalidAutomaticCheckouts()');
    assert.equal(h.run('attendanceRecords[0].check_out'),'06:59:00');
    h.run('updateWorkerStats()');
    assert.ok(h.el('weeklyGoalHelpText').textContent.includes('pendiente(s) de corregir'));
});

test('reparación remota condiciona la actualización a la salida defectuosa anterior', async () => {
    const h=harness();
    h.run('window.filters=[]; dbMode="supabase"; supabaseClient={from:()=>({update:()=>({eq:(...args)=>{window.filters.push(args); return {eq:(...next)=>{window.filters.push(next); return {select:async()=>({data:[{id:"antiguo"}],error:null})};}};}})})}; attendanceRecords=[{id:"antiguo",employee_name:"Ana",date:"2026-10-27",type:"Trabajo",check_in:"08:00:00",check_out:"06:59:00",hours_credited:0,lunch:true,notes:"Salida automática del sistema a las 6:59 AM."}];');
    await h.run('repairInvalidAutomaticCheckouts()');
    assert.equal(h.run('attendanceRecords[0].check_out'),'16:00:00');
    assert.equal(h.run('JSON.stringify(window.filters)'),'[["id","antiguo"],["check_out","06:59:00"]]');
});

test('la carga repara datos locales antes de pintar la meta', async () => {
    const h=harness();
    h.run('saveLocalAttendance([{id:"antiguo",employee_name:"Ana",date:"2026-10-27",type:"Trabajo",check_in:"08:00:00",check_out:"06:59:00",hours_credited:0,lunch:true,notes:"Salida automática del sistema a las 6:59 AM."}]);');
    await h.run('loadAttendanceRecords()');
    assert.equal(h.el('weeklyGoalHoursText').textContent,'7.0 / 40.0 h');
});

test('refrigerio nulo usa la elección anotada y no abona una hora de más', async () => {
    const h=harness();
    h.run('saveLocalAttendance([{id:"antiguo",employee_name:"Ana",date:"2026-10-27",type:"Trabajo",check_in:"08:00:00",check_out:"06:59:00",hours_credited:0,lunch:null,notes:"[Con refrigerio: -1h]. Salida automática del sistema a las 6:59 AM."}]);');
    await h.run('loadAttendanceRecords()');
    assert.equal(h.run('attendanceRecords[0].hours_credited'),7);
    assert.equal(h.run('attendanceRecords[0].lunch'),true);
});

test('una fila modificada por otro cliente no se reemplaza con la reparación antigua', async () => {
    const h=harness();
    h.run('dbMode="supabase"; supabaseClient={from:()=>({update:()=>({eq:()=>({eq:()=>({select:async()=>({data:[],error:null})})})})})}; attendanceRecords=[{id:"antiguo",employee_name:"Ana",date:"2026-10-27",type:"Trabajo",check_in:"08:00:00",check_out:"06:59:00",hours_credited:0,lunch:true,notes:"Salida automática del sistema a las 6:59 AM."}];');
    await h.run('repairInvalidAutomaticCheckouts()');
    assert.equal(h.run('attendanceRecords[0].check_out'),'06:59:00');
});
