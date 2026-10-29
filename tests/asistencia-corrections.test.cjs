const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./helpers/asistencia-harness.cjs');

function seedHistoricalRecords(h, workNotes = 'Marcación regularizada por olvido (Sin refrigerio).', start = '08:00:00', end = '16:00:00') {
    h.run('activeWorkers[0].created_at="2026-10-27"; workerSchedules.Ana.created_at="2026-10-27";');
    const records = [
        {id:'falta',employee_name:'Ana',date:'2026-10-27',type:'Falta',check_in:null,check_out:null,hours_credited:0,owed_minutes:480,notes:'Ausencia registrada'},
        {id:'trabajo',employee_name:'Ana',date:'2026-10-27',type:'Trabajo',check_in:start,check_out:end,hours_credited:8,late_minutes:0,extra_minutes:0,owed_minutes:0,lunch:false,notes:workNotes}
    ];
    h.run('saveLocalAttendance('+JSON.stringify(records)+');');
}

test('cargar datos antiguos corrige una falta regularizada sin borrar la auditoría', async () => {
    const h=harness(); seedHistoricalRecords(h);
    await h.run('loadAttendanceRecords()');
    assert.equal(h.run('attendanceRecords.length'),2);
    assert.equal(h.run('isCorrectedAbsence(attendanceRecords.find(r=>r.id==="falta"))'),true);
    assert.equal(h.el('metricAbsenceHours').textContent,'0:00');
    assert.equal(h.el('metricOwedHours').textContent,'0:00');
    const first=h.run('JSON.stringify(getLocalAttendance())');
    await h.run('loadAttendanceRecords()');
    assert.equal(h.run('JSON.stringify(getLocalAttendance())'),first);
});

test('la reparación histórica no adivina qué falta corregir con notas desconocidas', async () => {
    const h=harness(); seedHistoricalRecords(h,'Nota personalizada sin evidencia de regularización');
    await h.run('loadAttendanceRecords()');
    assert.equal(h.run('isCorrectedAbsence(attendanceRecords.find(r=>r.id==="falta"))'),false);
    assert.equal(h.el('metricAbsenceHours').textContent,'1 (8:00)');
});

test('un trabajo extra antiguo no elimina una ausencia real del horario oficial', async () => {
    const h=harness(); seedHistoricalRecords(h,'Marcación regularizada por olvido (Sin refrigerio).','18:00:00','19:00:00');
    await h.run('loadAttendanceRecords()');
    assert.equal(h.run('isCorrectedAbsence(attendanceRecords.find(r=>r.id==="falta"))'),false);
    assert.equal(h.el('metricAbsenceHours').textContent,'1 (8:00)');
});

test('la corrección histórica rechazada por la nube no cambia la falta en memoria', async () => {
    const h=harness(); seedHistoricalRecords(h);
    h.run('attendanceRecords=getLocalAttendance(); dbMode="supabase"; supabaseClient={from:()=>{const q={update:()=>q,eq:()=>q,is:()=>q,select:async()=>({error:{message:"sin permiso"}})};return q;}};');
    const original=h.run('JSON.stringify(attendanceRecords)');
    await h.run('repairRegularizedAbsences()');
    assert.equal(h.run('JSON.stringify(attendanceRecords)'),original);
});

test('cargar una recuperación antigua sin almuerzo corrige deuda una sola vez', async () => {
    const h=harness();
    h.run('activeWorkers[0].created_at="2026-10-28"; workerSchedules.Ana.created_at="2026-10-28"; saveLocalAttendance([{id:"primero",employee_name:"Ana",date:"2026-10-28",type:"Trabajo",check_in:"08:00:00",check_out:"12:00:00",hours_credited:4,owed_minutes:240,lunch:false,notes:"[Sin refrigerio: jornada corrida]."},{id:"segundo",employee_name:"Ana",date:"2026-10-28",type:"Trabajo",check_in:"12:00:00",check_out:"16:00:00",hours_credited:4,owed_minutes:0,lunch:false,notes:"[Sin refrigerio: jornada corrida]. [Turno de recuperación dentro del horario]."}]);');
    await h.run('loadAttendanceRecords()');
    assert.equal(h.run('attendanceRecords.find(r=>r.id==="segundo").owed_minutes'),-240);
    assert.equal(h.el('metricWorkedHours').textContent,'8:00');
    assert.equal(h.el('metricOwedHours').textContent,'0:00');
    const first=h.run('JSON.stringify(getLocalAttendance())');
    await h.run('loadAttendanceRecords()');
    assert.equal(h.run('JSON.stringify(getLocalAttendance())'),first);
});

test('las observaciones muestran el texto del usuario sin metadatos del horario', () => {
    const h=harness();
    h.run('const row=attachRecordScheduleSnapshot({id:"nota",employee_name:"Ana",date:"2026-10-28",type:"Trabajo",check_in:"08:00:00",check_out:"16:00:00",hours_credited:8,notes:"Mi observación"}); attendanceRecords=[row]; renderAttendanceTable();');
    assert.equal(h.run('getAttendanceDisplayNotes(attendanceRecords[0])'),'Mi observación');
    assert.ok(h.el('attendanceTableBody').children[0].innerHTML.includes('Mi observación'));
    assert.ok(!h.el('attendanceTableBody').children[0].innerHTML.includes('Horario de jornada'));
    assert.ok(h.run('!!getRecordScheduleSnapshot(attendanceRecords[0])'));
});

test('seleccionar un trabajador sin conexión mantiene deshabilitada la marcación', () => {
    const h=harness();
    h.run('dbMode="supabase"; loadWorkersAndSchedules.verified=true; loadAttendanceRecords.verified=false; handleWorkerChange();');
    assert.equal(h.el('btnToggleAttendance').disabled,true);
    assert.equal(h.el('btnPunchText').textContent,'Esperando conexión');
});
