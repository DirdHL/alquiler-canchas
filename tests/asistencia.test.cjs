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
    let uuid = 0;
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
    el('employeeSelect').value = 'Ana';
    el('filterEmployee').value = 'todos'; el('filterType').value = 'todos';
    el('filterMonth').value = '2026-10'; el('filterWeek').value = 'todas';
    class FakeDate extends Date {
        constructor(...args) { super(...(args.length ? args : date)); }
    }
    const env = {
        document, window: {URL:{createObjectURL:()=> 'blob:test',revokeObjectURL() {}}},
        localStorage: {getItem:key=>storage.get(key) || null, setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
        Date: FakeDate, crypto:{randomUUID:()=> 'test-' + (++uuid)}, alert:message=>alerts.push(message),
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

function moveClock(h, hour, minute = 0, day = 28) {
    h.run('Date = class extends Date {constructor(...args){super(...(args.length ? args : [2026,9,' + day + ',' + hour + ',' + minute + ',0]));}};');
}
function seedScheduledShift(h) {
    h.run('workerSchedules.Ana.miercoles.out="18:00"; attendanceRecords=[{id:"normal",employee_name:"Ana",date:"2026-10-28",type:"Trabajo",check_in:"08:00:00",check_out:null,lunch:true,hours_credited:0,notes:"[Con refrigerio: -1h]."}]; saveLocalAttendance(attendanceRecords);');
}

test('la jornada se cierra automáticamente a las 18 y abona 9h netas', async () => {
    const h=harness([2026,9,28,17,59,59]); seedScheduledShift(h);
    await h.run('autoCheckoutActiveShifts()');
    assert.equal(h.run('attendanceRecords[0].check_out'),null);
    moveClock(h,18);
    await h.run('autoCheckoutActiveShifts()');
    assert.equal(h.run('attendanceRecords[0].check_out'),'18:00:00');
    assert.equal(h.run('attendanceRecords[0].hours_credited'),9);
    assert.equal(h.run('attendanceRecords[0].extra_minutes'),0);
    assert.equal(h.el('btnPunchText').textContent,'Marcar Entrada Extra');
});

test('al volver tarde se cierra a las 18 sin abonar extras de la jornada normal', async () => {
    const h=harness([2026,9,28,20,0,0]); seedScheduledShift(h);
    h.run('updateWeeklyGoalProgress()');
    assert.equal(h.el('weeklyGoalHoursText').textContent,'9.0 / 40.0 h');
    assert.equal(h.el('metricExtraHours').textContent,'0:00');
    await h.run('autoCheckoutActiveShifts()');
    assert.equal(h.run('attendanceRecords[0].check_out'),'18:00:00');
    assert.equal(h.run('attendanceRecords[0].extra_minutes'),0);
});

test('el botón vencido cierra primero y requiere una nueva entrada explícita para extras', async () => {
    const h=harness([2026,9,28,17,59,0]); seedScheduledShift(h);
    h.run('updatePunchButtonState()');
    moveClock(h,18,10);
    await h.run('handleAttendancePunch()');
    assert.equal(h.run('attendanceRecords.length'),1);
    assert.equal(h.el('btnPunchText').textContent,'Marcar Entrada Extra');
    await h.run('handleAttendancePunch()');
    assert.equal(h.run('attendanceRecords.length'),2);
    assert.equal(h.run('attendanceRecords.find(r=>r.id!=="normal").check_in'),'18:10:00');
    assert.equal(h.run('attendanceRecords.find(r=>r.id!=="normal").lunch'),false);
    moveClock(h,18,20);
    await h.run('autoCheckoutActiveShifts()');
    h.run('updateWeeklyGoalProgress()');
    assert.equal(h.run('attendanceRecords.find(r=>r.id!=="normal").check_out'),null);
    assert.equal(h.el('metricExtraHours').textContent,'0:10');
    moveClock(h,19);
    await h.run('handleAttendancePunch()');
    assert.equal(h.run('attendanceRecords.find(r=>r.id!=="normal").extra_minutes'),50);
    assert.equal(h.run('attendanceRecords.find(r=>r.id!=="normal").hours_credited'),0.83);
    assert.equal(h.el('metricExtraHours').textContent,'0:50');
});

test('primera entrada fuera del horario es extra y no genera tardanza', async () => {
    const h=harness([2026,9,28,18,10,0]);
    h.run('workerSchedules.Ana.miercoles.out="18:00"; attendanceRecords=[];');
    await h.run('handleAttendancePunch()');
    assert.equal(h.run('attendanceRecords[0].late_minutes'),0);
    assert.equal(h.run('attendanceRecords[0].lunch'),false);
    moveClock(h,19);
    await h.run('handleAttendancePunch()');
    assert.equal(h.run('attendanceRecords[0].extra_minutes'),50);
    assert.equal(h.run('attendanceRecords[0].owed_minutes'),0);
    moveClock(h,10,0,29);
    assert.ok(h.run('getDetectedAbsences("2026-10").some(r=>r.date==="2026-10-28")'));
});

test('recuperación dentro del horario se cierra a las 18 y no descuenta otro refrigerio', async () => {
    const h=harness([2026,9,28,17,45,0]);
    h.run('workerSchedules.Ana.miercoles.out="18:00"; attendanceRecords=[{id:"normal",employee_name:"Ana",date:"2026-10-28",type:"Trabajo",check_in:"08:00:00",check_out:"17:30:00",lunch:true,hours_credited:8.5,owed_minutes:30}]; saveLocalAttendance(attendanceRecords); handleWorkerChange();');
    h.el('employeeSelect').value='Ana'; h.run('handleWorkerChange()');
    await h.run('handleAttendancePunch()');
    moveClock(h,18);
    await h.run('autoCheckoutActiveShifts()');
    assert.equal(h.run('attendanceRecords.find(r=>r.id!=="normal").hours_credited'),0.25);
    assert.equal(h.run('attendanceRecords.find(r=>r.id!=="normal").extra_minutes'),0);
    assert.equal(h.run('attendanceRecords.find(r=>r.id!=="normal").owed_minutes'),0);
});

test('fallo remoto impide abrir extras sobre una jornada que no pudo cerrarse', async () => {
    const h=harness([2026,9,28,18,10,0]); seedScheduledShift(h);
    h.run('dbMode="supabase"; supabaseClient={from:()=>({update:()=>({eq:()=>({is:()=>({select:async()=>({error:{message:"denegado"}})})})})})};');
    await h.run('handleAttendancePunch()');
    assert.equal(h.run('attendanceRecords.length'),1);
    assert.equal(h.run('attendanceRecords[0].check_out'),null);
    assert.ok(h.alerts.some(message=>message.includes('No se pudo cerrar')));
});

test('al abrir al día siguiente se concilia la jornada olvidada a su salida programada', async () => {
    const h=harness([2026,9,29,7,8,0]); seedScheduledShift(h);
    await h.run('autoCheckoutActiveShifts()');
    assert.equal(h.run('attendanceRecords[0].check_out'),'18:00:00');
    assert.equal(h.run('attendanceRecords[0].hours_credited'),9);
});

test('autocierre remoto exige que la jornada siga abierta y respeta rechazos sin filas', async () => {
    const h=harness([2026,9,28,18,10,0]); seedScheduledShift(h);
    h.run('window.filters=[]; dbMode="supabase"; supabaseClient={from:()=>({update:()=>({eq:(...args)=>{window.filters.push(args);return {is:(...next)=>{window.filters.push(next);return {select:async()=>({data:[],error:null})};}};}})})};');
    await h.run('autoCheckoutActiveShifts()');
    assert.equal(h.run('attendanceRecords[0].check_out'),null);
    assert.equal(h.run('JSON.stringify(window.filters)'),'[["id","normal"],["check_out",null]]');
});

test('extras anticipadas se calculan por minutos trabajados y no por adelanto potencial', () => {
    const h=harness();
    const result=h.run('calculateShiftAccounting({check_in:"07:00:00",lunch:false},"07:30:00",workerSchedules.Ana.miercoles)');
    assert.equal(result.hours_credited,0.5);
    assert.equal(result.extra_minutes,30);
    assert.equal(result.owed_minutes,0);
});

test('un clic justo antes del límite no crea extras si el autocierre ocurre durante la espera', async () => {
    const h=harness([2026,9,28,17,59,59]); seedScheduledShift(h);
    h.run('const originalAutoCheckout=autoCheckoutActiveShifts; autoCheckoutActiveShifts=async(...args)=>{Date=class extends Date {constructor(...values){super(...(values.length?values:[2026,9,28,18,0,0]));}};return originalAutoCheckout(...args);};');
    await h.run('handleAttendancePunch()');
    assert.equal(h.run('attendanceRecords.length'),1);
    assert.equal(h.run('attendanceRecords[0].check_out'),'18:00:00');
    assert.equal(h.el('btnPunchText').textContent,'Marcar Entrada Extra');
});

test('un extra antes del inicio no elimina la tardanza de la primera entrada normal', async () => {
    const h=harness([2026,9,28,8,15,0]);
    h.run('workerSchedules.Ana.miercoles.out="18:00"; attendanceRecords=[{id:"temprano",employee_name:"Ana",date:"2026-10-28",type:"Trabajo",check_in:"07:00:00",check_out:"07:30:00",hours_credited:0.5,extra_minutes:30,lunch:false}]; saveLocalAttendance(attendanceRecords); handleWorkerChange();');
    assert.ok(h.el('employeeStatusBox').innerHTML.includes('Tardanza detectada'));
    await h.run('handleAttendancePunch()');
    assert.equal(h.run('attendanceRecords.find(r=>r.id!=="temprano").late_minutes'),15);
});

test('justificar una falta conserva el día y sus horas históricas con deuda cero', () => {
    const h=harness();
    h.run('activeWorkers[0].created_at="2026-10-27"; workerSchedules.Ana.created_at="2026-10-27"; attendanceRecords=[{id:"permiso",employee_name:"Ana",date:"2026-10-27",type:"Permiso",hours_credited:8}]; updateWorkerStats();');
    assert.equal(h.el('metricAbsenceHours').textContent,'1 (8:00)');
    assert.equal(h.el('metricOwedHours').textContent,'0:00');
    const item=h.el('absencesListContainer').children[0];
    assert.ok(item.innerHTML.includes('Justificada · se conserva en el historial'));
    assert.ok(item.innerHTML.includes('8h 00m de ausencia registrada'));
    assert.ok(item.innerHTML.includes('disabled'));
    assert.equal(h.run('getDetectedAbsences("2026-10").length'),1);
});

test('un permiso parcial reduce deuda y mantiene la ausencia original', () => {
    const h=harness();
    h.run('activeWorkers[0].created_at="2026-10-27"; workerSchedules.Ana.created_at="2026-10-27"; attendanceRecords=[{employee_name:"Ana",date:"2026-10-27",type:"Permiso",hours_credited:3}]; updateWorkerStats();');
    assert.equal(h.el('metricAbsenceHours').textContent,'1 (8:00)');
    assert.equal(h.el('metricOwedHours').textContent,'5:00');
    assert.ok(h.el('absencesListContainer').children[0].innerHTML.includes('Justificada parcialmente'));
    h.storage.set('canchapro_admin_auth','true');
    h.run('window.quickJustifyAbsence("Ana","2026-10-27",getCombinedAttendanceRecords("2026-10").find(r=>r.type==="Falta").pending_absence_minutes);');
    assert.equal(h.el('adminRegisterHours').value,'5');
});

test('ajustes y permisos no restan minutos de tardanza histórica', () => {
    const h=harness();
    h.run('attendanceRecords=[{employee_name:"Ana",date:"2026-10-28",type:"Trabajo",check_in:"08:15:00",check_out:"16:00:00",hours_credited:7.75,late_minutes:15,owed_minutes:0},{employee_name:"Ana",date:"2026-10-28",type:"Permiso",hours_credited:0.25},{employee_name:"Ana",date:"2026-10-28",type:"Ajuste",owed_minutes:-60}];');
    const result=h.run('calculateMonthlyAttendanceSummary("Ana","2026-10",attendanceRecords)');
    assert.equal(result.lateMinutes,15);
    assert.equal(result.owedMinutes,0);
    assert.equal(result.workedMinutes,465);
});

test('reducir deuda conserva el contador y los minutos de faltas manuales', () => {
    const h=harness();
    h.run('attendanceRecords=[{employee_name:"Ana",date:"2026-10-27",type:"Falta",owed_minutes:480},{employee_name:"Ana",date:"2026-10-28",type:"Ajuste",owed_minutes:-60}];');
    const result=h.run('calculateMonthlyAttendanceSummary("Ana","2026-10",attendanceRecords)');
    assert.equal(result.absenceCount,1);
    assert.equal(result.absenceMinutes,480);
    assert.equal(result.owedMinutes,420);
    assert.equal(h.run('attendanceRecords[0].owed_minutes'),480);
});

test('permisos se limitan a la deuda de su propia fecha', () => {
    const h=harness();
    h.run('attendanceRecords=[{employee_name:"Ana",date:"2026-10-27",type:"Falta",owed_minutes:480},{employee_name:"Ana",date:"2026-10-28",type:"Trabajo",late_minutes:15,owed_minutes:30},{employee_name:"Ana",date:"2026-10-28",type:"Permiso",hours_credited:100}];');
    const result=h.run('calculateMonthlyAttendanceSummary("Ana","2026-10",attendanceRecords)');
    assert.equal(result.absenceCount,1);
    assert.equal(result.lateMinutes,15);
    assert.equal(result.owedMinutes,480);
});

test('permisos de tardanza conservan el atraso y descuentan solo ese saldo', () => {
    const h=harness();
    h.run('attendanceRecords=[{employee_name:"Ana",date:"2026-10-28",type:"Trabajo",late_minutes:15,owed_minutes:30},{employee_name:"Ana",date:"2026-10-28",type:"Permiso",hours_credited:0.25}];');
    const result=h.run('calculateMonthlyAttendanceSummary("Ana","2026-10",attendanceRecords)');
    assert.equal(result.lateMinutes,15);
    assert.equal(result.owedMinutes,30);
});

test('una fecha de falta cuenta una vez y las justificaciones repetidas no crean deuda negativa', () => {
    const h=harness();
    h.run('attendanceRecords=[{id:"falta1",employee_name:"Ana",date:"2026-10-27",type:"Falta",owed_minutes:480},{id:"falta2",employee_name:"Ana",date:"2026-10-27",type:"Falta",owed_minutes:480},{employee_name:"Ana",date:"2026-10-27",type:"Permiso",hours_credited:8},{employee_name:"Ana",date:"2026-10-27",type:"Permiso",hours_credited:8},{employee_name:"Ana",date:"2026-10-28",type:"Trabajo",late_minutes:15}];');
    const result=h.run('calculateMonthlyAttendanceSummary("Ana","2026-10",attendanceRecords)');
    assert.equal(result.absenceCount,1);
    assert.equal(result.absenceMinutes,480);
    assert.equal(result.owedMinutes,15);
    assert.equal(result.lateMinutes,15);
});

test('feriados no generan faltas automáticas y los permisos conservan la ausencia', () => {
    const h=harness();
    h.run('activeWorkers[0].created_at="2026-10-26"; workerSchedules.Ana.created_at="2026-10-26"; attendanceRecords=[{employee_name:"Ana",date:"2026-10-26",type:"Feriado",hours_credited:8},{employee_name:"Ana",date:"2026-10-27",type:"Permiso",hours_credited:8}];');
    const absences=h.run('getDetectedAbsences("2026-10")');
    assert.equal(absences.length,1);
    assert.equal(absences[0].date,'2026-10-27');
});

test('el historial mensual excluye fechas futuras y otros meses', () => {
    const h=harness();
    h.run('attendanceRecords=[{employee_name:"Ana",date:"2026-10-27",type:"Falta",owed_minutes:480},{employee_name:"Ana",date:"2026-10-30",type:"Falta",owed_minutes:480},{employee_name:"Ana",date:"2026-09-28",type:"Trabajo",late_minutes:90}];');
    const result=h.run('calculateMonthlyAttendanceSummary("Ana","2026-10",attendanceRecords)');
    assert.equal(result.absenceCount,1);
    assert.equal(result.lateMinutes,0);
});

test('el resumen mensual muestra el mes actual y no afirma puntualidad por tener cero faltas', () => {
    const h=harness();
    h.run('activeWorkers[0].created_at="2026-10-28"; workerSchedules.Ana.created_at="2026-10-28"; attendanceRecords=[{employee_name:"Ana",date:"2026-10-28",type:"Trabajo",late_minutes:12}]; updateWorkerStats();');
    assert.ok(h.el('monthlySummaryPeriod').textContent.includes('2026'));
    assert.ok(h.el('monthlySummaryPeriod').textContent.toLowerCase().includes('octubre'));
    assert.equal(h.el('metricLateHours').textContent,'0:12');
    assert.ok(h.el('absencesListContainer').innerHTML.includes('Las tardanzas se muestran por separado'));
});

test('justificar y después recargar mantiene falta mensual y saldo cero', async () => {
    const h=harness();
    h.run('activeWorkers[0].created_at="2026-10-27"; workerSchedules.Ana.created_at="2026-10-27"; saveLocalAttendance([{id:"permiso",employee_name:"Ana",date:"2026-10-27",type:"Permiso",hours_credited:8}]);');
    await h.run('loadAttendanceRecords()');
    assert.equal(h.el('metricAbsenceHours').textContent,'1 (8:00)');
    assert.equal(h.el('metricOwedHours').textContent,'0:00');
    await h.run('loadAttendanceRecords()');
    assert.equal(h.el('metricAbsenceHours').textContent,'1 (8:00)');
});

test('una asistencia regularizada corrige la falta falsa sin confundirla con un permiso', () => {
    const h=harness();
    h.run('activeWorkers[0].created_at="2026-10-27"; workerSchedules.Ana.created_at="2026-10-27"; attendanceRecords=[{employee_name:"Ana",date:"2026-10-27",type:"Trabajo",check_in:"08:00:00",check_out:"16:00:00",hours_credited:8}]; updateWorkerStats();');
    assert.equal(h.el('metricAbsenceHours').textContent,'0:00');
});

test('una ausencia totalmente justificada no vuelve a abrir justificación por cero minutos', () => {
    const h=harness(); h.storage.set('canchapro_admin_auth','true');
    h.run('window.quickJustifyAbsence("Ana","2026-10-27",0);');
    assert.equal(h.el('modalAdminRegister').classList.contains('active'),false);
});

test('una falta manual de cero minutos conserva su conteo sin crear deuda', () => {
    const h=harness();
    h.run('attendanceRecords=[{employee_name:"Ana",date:"2026-10-27",type:"Falta",owed_minutes:0}];');
    const result=h.run('calculateMonthlyAttendanceSummary("Ana","2026-10",attendanceRecords)');
    assert.equal(result.absenceCount,1);
    assert.equal(result.absenceMinutes,0);
    assert.equal(result.owedMinutes,0);
    assert.equal(h.run('getAbsenceRecordedMinutes({employee_name:"Ana",date:"2026-10-27",owed_minutes:"0"})'),0);
});

test('una falta automática justificada usa notas neutras y un estado explícito', () => {
    const h=harness();
    h.run('activeWorkers[0].created_at="2026-10-27"; workerSchedules.Ana.created_at="2026-10-27"; attendanceRecords=[{employee_name:"Ana",date:"2026-10-27",type:"Permiso",hours_credited:8}];');
    const absence=h.run('getCombinedAttendanceRecords("2026-10").find(r=>r.type==="Falta")');
    assert.ok(absence.notes.includes('Ausencia registrada'));
    assert.ok(!absence.notes.includes('no justificada'));
    assert.equal(absence.is_fully_justified,true);
});
