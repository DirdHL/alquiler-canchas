const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./helpers/asistencia-harness.cjs');

function record(overrides = {}) {
    return { id: 'nube', employee_name: 'Ana', date: '2026-10-28', type: 'Trabajo',
        check_in: '08:00:00', check_out: '16:00:00', hours_credited: 8,
        late_minutes: 0, extra_minutes: 0, owed_minutes: 0, lunch: false, notes: '[Sin refrigerio: jornada corrida].', ...overrides };
}

function cloud(h, options = {}) {
    const data = { records: [record()], workers: [{ name: 'Ana', is_active: true, created_at: '2026-10-01' }],
        schedules: [{ employee_name: 'Ana', schedule_data: h.schedule }], calls: [], ...options };
    h.run('window.cloud=' + JSON.stringify(data) + `; dbMode='supabase';
        supabaseClient={from(table){
            const filters=[]; let patch=null; let first=0; let last=499;
            const q={select:()=>q,order:()=>q,range:(a,b)=>{first=a;last=b;return q;},
                eq:(key,value)=>{filters.push([key,value]);return q;},is:(key,value)=>{filters.push([key,value]);return q;},
                update:value=>{patch=value;return q;},
                then(resolve,reject){
                    const state=window.cloud;
                    state.calls.push({table,kind:patch?'update':'read',filters,first,last});
                    const attendance=table==='asistencias_v2';
                    if((!patch&&state.failRead)||(attendance&&!patch&&first===state.failOffset))
                        return Promise.resolve({data:null,error:{message:'sin conexión'}}).then(resolve,reject);
                    const source=attendance?state.records:table==='personal_asistencia_v2'?state.workers:state.schedules;
                    const matches=source.filter(row=>filters.every(([key,value])=>value===null?row[key]==null:row[key]===value));
                    if(patch){
                        const updated=matches.map(row=>{Object.assign(row,patch);return {...row};});
                        return Promise.resolve({data:updated,error:null}).then(resolve,reject);
                    }
                    const size=Math.min(last-first+1,state.pageCap||500);
                    return Promise.resolve({data:matches.slice(first,first+size).map(row=>({...row})),count:matches.length,error:null}).then(resolve,reject);
                }};
            return q;
        }};`);
}

test('una lectura fallida conserva los registros y bloquea marcaciones sin tocar la nube', async () => {
    const h=harness(); cloud(h,{ failRead:true });
    h.run('attendanceRecords='+JSON.stringify([record()])+'; updateConnectionStatus(true);');
    const original=h.run('JSON.stringify(attendanceRecords)');
    assert.equal(await h.run('loadAttendanceRecords()'),false);
    assert.equal(h.run('JSON.stringify(attendanceRecords)'),original);
    assert.equal(h.run('loadAttendanceRecords.verified'),false);
    assert.ok(h.el('statusText').textContent.includes('pendiente'));
    assert.equal(h.el('btnToggleAttendance').disabled,true);
    await h.run('handleAttendancePunch()');
    assert.equal(h.run('window.cloud.calls.filter(call=>call.kind==="update").length'),0);
    assert.ok(h.alerts.some(message=>message.includes('verificar')));
});

test('una carga paginada completa usa el recuento aunque el servidor limite cada página', async () => {
    const h=harness();
    cloud(h,{records:[record({id:'a'}),record({id:'b'}),record({id:'c'})],pageCap:2});
    assert.equal(await h.run('loadAttendanceRecords()'),true);
    assert.equal(h.run('attendanceRecords.length'),3);
    assert.equal(h.run('window.cloud.calls.filter(call=>call.kind==="read").length'),2);
    assert.equal(h.run('loadAttendanceRecords.hasLoaded'),true);
    assert.equal(h.run('loadAttendanceRecords.verified'),true);
    const cached=JSON.parse(h.storage.get('canchapro_cloud_attendance_v2:default'));
    assert.equal(cached.records.length,3);
    assert.ok(cached.verifiedAt);
});

test('una página fallida no reemplaza el estado por una lista parcial ni repara con datos incompletos', async () => {
    const h=harness();
    cloud(h,{records:[record({id:'a'}),record({id:'b'}),record({id:'c'})],pageCap:2,failOffset:2});
    h.run('attendanceRecords='+JSON.stringify([record({id:'anterior'})])+';');
    assert.equal(await h.run('loadAttendanceRecords()'),false);
    assert.equal(h.run('attendanceRecords[0].id'),'anterior');
    assert.equal(h.run('attendanceRecords.length'),1);
    assert.equal(h.run('window.cloud.calls.filter(call=>call.kind==="update").length'),0);
});

test('al iniciar sin red solo se recupera una caché de nube identificada y se mantiene el bloqueo', async () => {
    const h=harness(); cloud(h,{failRead:true});
    h.storage.set('canchapro_cloud_attendance_v2:default',JSON.stringify({records:[record({id:'copia'})],verifiedAt:'2026-10-27T20:00:00.000Z'}));
    h.run('attendanceRecords=[];');
    assert.equal(await h.run('loadAttendanceRecords()'),false);
    assert.equal(h.run('attendanceRecords[0].id'),'copia');
    assert.equal(h.run('loadAttendanceRecords.hasLoaded'),true);
    assert.equal(h.run('loadAttendanceRecords.verified'),false);
    assert.equal(h.el('btnToggleAttendance').disabled,true);
    assert.equal(h.run('window.cloud.calls.filter(call=>call.kind==="update").length'),0);
});

test('una lectura antigua que termina tarde no pisa una lectura más reciente', async () => {
    const h=harness();
    h.run(`dbMode='supabase'; window.releaseOld=null; window.request=0;
        supabaseClient={from:()=>({select:()=>({order:()=>({order:()=>{window.request++;return window.request===1?
            new Promise(resolve=>window.releaseOld=resolve):Promise.resolve({data:[${JSON.stringify(record({id:'nuevo'}))}],error:null});}})})})};`);
    const old=h.run('loadAttendanceRecords()');
    assert.equal(await h.run('loadAttendanceRecords()'),true);
    h.run('window.releaseOld({data:[],error:{message:"respuesta atrasada"}});');
    assert.equal(await old,false);
    assert.equal(h.run('attendanceRecords[0].id'),'nuevo');
    assert.equal(h.run('loadAttendanceRecords.verified'),true);
});

test('la baja remota limpia el trabajador seleccionado e impide otra marcación', async () => {
    const h=harness(); cloud(h,{workers:[]});
    assert.equal(await h.run('loadWorkersAndSchedules()'),true);
    assert.equal(h.run('activeWorkers.length'),0);
    assert.equal(h.run('selectedWorker'),null);
    assert.equal(h.el('employeeSelect').value,'');
    assert.equal(h.el('btnToggleAttendance').disabled,true);
    await h.run('handleAttendancePunch()');
    assert.equal(h.run('window.cloud.calls.filter(call=>call.kind==="update").length'),0);
});

test('la salida manual no sobrescribe una salida que otro dispositivo ya guardó', async () => {
    const h=harness([2026,9,28,17,30,0]);
    h.run('workerSchedules.Ana.miercoles.out="18:00";');
    const closed=record({check_out:'17:00:00',hours_credited:8,lunch:true,notes:'[Con refrigerio: -1h].'});
    cloud(h,{records:[closed]});
    h.run('attendanceRecords='+JSON.stringify([{...closed,check_out:null,hours_credited:0}])+';');
    await h.run('handleAttendancePunch()');
    assert.equal(h.run('window.cloud.records[0].check_out'),'17:00:00');
    assert.equal(h.run('window.cloud.records[0].hours_credited'),8);
    assert.equal(h.run('attendanceRecords[0].check_out'),'17:00:00');
    assert.ok(h.run('window.cloud.calls.some(call=>call.kind==="update"&&call.filters.some(([key,value])=>key==="check_out"&&value===null))'));
    assert.ok(h.alerts.some(message=>message.includes('otro dispositivo')));
});

test('la salida manual local conserva el cierre guardado desde otra pestaña', async () => {
    const h=harness([2026,9,28,17,30,0]);
    h.run('workerSchedules.Ana.miercoles.out="18:00";');
    const closed=record({check_out:'17:00:00',hours_credited:8,lunch:true,notes:'[Con refrigerio: -1h].'});
    h.run('saveLocalAttendance('+JSON.stringify([closed])+'); attendanceRecords='+JSON.stringify([{...closed,check_out:null,hours_credited:0}])+';');
    await h.run('handleAttendancePunch()');
    assert.equal(h.run('getLocalAttendance()[0].check_out'),'17:00:00');
    assert.equal(h.run('attendanceRecords[0].check_out'),'17:00:00');
});

test('un fallo al leer personal no borra el personal y los horarios ya verificados', async () => {
    const h=harness(); cloud(h,{failRead:true});
    const before=h.run('JSON.stringify({workers:activeWorkers,schedules:workerSchedules})');
    assert.equal(await h.run('loadWorkersAndSchedules()'),false);
    assert.equal(h.run('JSON.stringify({workers:activeWorkers,schedules:workerSchedules})'),before);
    assert.equal(h.run('loadWorkersAndSchedules.verified'),false);
    assert.equal(h.el('btnToggleAttendance').disabled,true);
});

test('una marcación en nube vuelve a verificar personal y jornada antes de guardar', async () => {
    const h=harness([2026,9,28,15,0,0]);
    const open=record({check_out:null,hours_credited:0});
    cloud(h,{records:[open]});
    h.run('attendanceRecords='+JSON.stringify([open])+'; loadWorkersAndSchedules.verified=true; loadAttendanceRecords.verified=true;');
    await h.run('handleAttendancePunch()');
    assert.equal(h.run('window.cloud.records[0].check_out'),'15:00:00');
    assert.equal(h.run('window.cloud.records[0].hours_credited'),7);
    assert.ok(h.run('window.cloud.calls.some(call=>call.kind==="read"&&call.table==="personal_asistencia_v2")'));
    assert.ok(h.run('window.cloud.calls.some(call=>call.kind==="read"&&call.table==="asistencias_v2")'));
    assert.equal(h.run('loadAttendanceRecords.verified'),true);
});

test('la verificación previa detecta una baja aunque aún no haya llegado el evento remoto', async () => {
    const h=harness([2026,9,28,8,0,0]);
    cloud(h,{workers:[],records:[]});
    h.run('loadWorkersAndSchedules.verified=true; loadAttendanceRecords.verified=true;');
    await h.run('handleAttendancePunch()');
    assert.equal(h.run('selectedWorker'),null);
    assert.equal(h.run('window.cloud.calls.filter(call=>call.kind==="update").length'),0);
    assert.equal(h.el('btnToggleAttendance').disabled,true);
});

test('no se mezclan asistencias nuevas con una lectura fallida de horarios y personal', async () => {
    const h=harness(); cloud(h,{records:[record({id:'nuevo'})]});
    h.run('attendanceRecords='+JSON.stringify([record({id:'anterior'})])+'; loadWorkersAndSchedules.verified=false; loadAttendanceRecords.hasLoaded=true; loadAttendanceRecords.verifiedAt="2026-10-27T20:00:00.000Z";');
    assert.equal(await h.run('loadAttendanceRecords()'),false);
    assert.equal(h.run('attendanceRecords[0].id'),'anterior');
    assert.equal(h.run('loadAttendanceRecords.verified'),false);
    assert.equal(h.run('window.cloud.calls.filter(call=>call.kind==="update").length'),0);
});
