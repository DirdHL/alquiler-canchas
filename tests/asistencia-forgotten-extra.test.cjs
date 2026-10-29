const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./helpers/asistencia-harness.cjs');

function seed(h) {
    h.run('workerSchedules.Ana.miercoles={active:true,in:"08:00",out:"18:00",lunch:true,netMinutes:540}; attendanceRecords=[{id:"dia",employee_name:"Ana",date:"2026-10-28",type:"Trabajo",check_in:"08:00:00",check_out:"18:00:00",hours_credited:9,extra_minutes:0,lunch:true},{id:"olvido",employee_name:"Ana",date:"2026-10-28",type:"Trabajo",check_in:"18:10:00",check_out:null,hours_credited:0,extra_minutes:0,lunch:false,notes:"[Sin refrigerio: jornada corrida]. [Turno extra fuera de horario]."}]; saveLocalAttendance(attendanceRecords);');
}

test('seleccionar perfil muestra el olvido de ayer y las horas ya confirmadas', () => {
    const h=harness([2026,9,29,9,0,0]); seed(h);
    h.run('handleWorkerChange()');
    const notice=h.el('forgottenExtraNotice');
    assert.equal(notice.hidden,false);
    assert.ok(notice.children[0].innerHTML.includes('Ayer olvidaste'));
    assert.ok(notice.children[0].innerHTML.includes('9h 00m'));
    assert.ok(notice.children[0].innerHTML.includes('pendientes de confirmar'));
    assert.equal(h.run('attendanceRecords[1].extra_minutes'),0);
});

test('el aviso excluye turnos actuales, cerrados y jornadas normales sin cerrar', () => {
    const h=harness([2026,9,29,9,0,0]); seed(h);
    h.run('attendanceRecords[1].check_out="20:00:00"; attendanceRecords.push({id:"hoy",employee_name:"Ana",date:"2026-10-29",type:"Trabajo",check_in:"18:00:00",check_out:null},{id:"normal",employee_name:"Ana",date:"2026-10-28",type:"Trabajo",check_in:"08:00:00",check_out:null}); handleWorkerChange();');
    assert.equal(h.el('forgottenExtraNotice').hidden,true);
});

test('sin contraseña no abre el formulario ni modifica la jornada', async () => {
    const h=harness([2026,9,29,9,0,0]); seed(h);
    h.run('handleWorkerChange()');
    await h.el('forgottenExtraNotice').children[0].querySelector('[data-action="close-extra"]').click();
    assert.equal(h.el('modalForgottenExtra').classList.contains('active'),false);
    assert.equal(await h.run('confirmForgottenExtra("olvido","20:00")'),null);
    assert.equal(h.run('attendanceRecords[1].check_out'),null);
});

test('administrador puede revisar duración y cerrar el registro original sin duplicarlo', async () => {
    const h=harness([2026,9,29,9,0,0]); seed(h);
    h.storage.set('canchapro_admin_auth','true');
    h.run('setupForgottenExtraModal(); handleWorkerChange();');
    await h.el('forgottenExtraNotice').children[0].querySelector('[data-action="close-extra"]').click();
    assert.equal(h.el('modalForgottenExtra').classList.contains('active'),true);
    h.el('forgottenExtraOut').value='20:00';
    await h.el('forgottenExtraOut').fire('input');
    assert.ok(h.el('forgottenExtraDuration').textContent.includes('1h 50m'));
    await h.el('formForgottenExtra').fire('submit');
    assert.equal(h.run('getLocalAttendance().length'),2);
    assert.equal(h.run('attendanceRecords.find(r=>r.id==="olvido").extra_minutes'),110);
    assert.equal(h.run('attendanceRecords.find(r=>r.id==="olvido").check_out'),'20:00:00');
    assert.ok(h.run('attendanceRecords.find(r=>r.id==="olvido").notes.includes("regularizada por administrador")'));
    assert.equal(h.el('forgottenExtraNotice').hidden,true);
    assert.equal(h.run('attendanceRecords[0].hours_credited'),9);
});

test('una salida inválida no cierra el turno ni abona horas inventadas', async () => {
    const h=harness([2026,9,29,9,0,0]); seed(h);
    h.storage.set('canchapro_admin_auth','true');
    await assert.rejects(h.run('confirmForgottenExtra("olvido","08:00")'),/posterior/);
    assert.equal(h.run('getLocalAttendance()[1].check_out'),null);
});

test('otra jornada que se superpone impide confirmar horas duplicadas', async () => {
    const h=harness([2026,9,29,9,0,0]); seed(h);
    h.storage.set('canchapro_admin_auth','true');
    h.run('attendanceRecords.push({id:"otro",employee_name:"Ana",date:"2026-10-28",type:"Trabajo",check_in:"19:00:00",check_out:"20:00:00",hours_credited:1}); saveLocalAttendance(attendanceRecords);');
    await assert.rejects(h.run('confirmForgottenExtra("olvido","20:30")'),/superpone/);
    assert.equal(h.run('attendanceRecords.find(r=>r.id==="olvido").check_out'),null);
});

test('cierre remoto exige que la salida siga vacía y respeta otro dispositivo', async () => {
    const h=harness([2026,9,29,9,0,0]); seed(h);
    h.storage.set('canchapro_admin_auth','true');
    h.run('dbMode="supabase"; loadAllData=async()=>true; loadAttendanceRecords=async()=>true; window.filters=[]; supabaseClient={from:()=>{const q={update:()=>q,eq:(...args)=>{window.filters.push(args);return q;},is:(...args)=>{window.filters.push(args);return q;},select:async()=>({data:[],error:null})};return q;}};');
    await assert.rejects(h.run('confirmForgottenExtra("olvido","20:00")'),/Otro dispositivo/);
    assert.equal(h.run('attendanceRecords[1].check_out'),null);
    assert.ok(h.run('window.filters.some(([field,value])=>field==="check_out"&&value===null)'));
});
