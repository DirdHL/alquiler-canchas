const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./helpers/asistencia-harness.cjs');

function manualForm(h, {date='2026-10-27',start='08:00',end='16:00',lunch=false}={}) {
    h.storage.set('canchapro_admin_auth','true');
    h.el('manualPunchWorker').value='Ana';
    h.el('manualPunchDate').value=date;
    h.el('manualPunchIn').value=start;
    h.el('manualPunchOut').value=end;
    h.el('manualPunchLunch').checked=lunch;
    h.el('modalManualPunch').classList.add('active');
}

function submitButton(h, formId) {
    const button=h.el(formId+'Submit');
    button.textContent='Guardar';
    h.el(formId).parts={'button[type="submit"]':button};
    return button;
}

test('doble envío de permiso durante una petición pendiente guarda una sola vez', async () => {
    const h=harness(), button=submitButton(h,'formAdminRegister');
    h.run('setupAdminRegisterModal(); loadAttendanceRecords=async()=>true; dbMode="supabase"; window.count=0; supabaseClient={from:()=>({insert:()=>{window.count++; return new Promise(resolve=>window.release=()=>resolve({error:null}));}})};');
    h.el('adminRegisterType').value='Permiso'; h.el('adminRegisterDate').value='2026-10-28';
    h.el('adminEmployeeSelect').value='Ana'; h.el('adminRegisterHours').value='1'; h.el('adminRegisterMinutes').value='0';
    const first=h.el('formAdminRegister').fire('submit');
    await h.el('formAdminRegister').fire('submit');
    assert.equal(h.run('window.count'),1);
    assert.equal(button.disabled,true);
    h.run('window.release()'); await first;
    assert.equal(button.disabled,false);
    assert.equal(button.textContent,'Guardar');
});

test('un fallo de permiso libera el botón para reintentar', async () => {
    const h=harness(), button=submitButton(h,'formAdminRegister');
    h.run('setupAdminRegisterModal(); loadAttendanceRecords=async()=>true; dbMode="supabase"; window.count=0; supabaseClient={from:()=>({insert:async()=>{window.count++; return {error:{message:"falló"}};}})};');
    h.el('adminRegisterType').value='Permiso'; h.el('adminRegisterDate').value='2026-10-28';
    h.el('adminEmployeeSelect').value='Ana'; h.el('adminRegisterHours').value='1'; h.el('adminRegisterMinutes').value='0';
    await h.el('formAdminRegister').fire('submit');
    await h.el('formAdminRegister').fire('submit');
    assert.equal(h.run('window.count'),2);
    assert.equal(button.disabled,false);
});

test('un permiso confirmado se conserva aunque falle la recarga posterior', async () => {
    const h=harness();
    h.run('setupAdminRegisterModal(); loadAttendanceRecords=async()=>false; dbMode="supabase"; supabaseClient={from:()=>({insert:async()=>({error:null})})};');
    h.el('adminRegisterType').value='Permiso'; h.el('adminRegisterDate').value='2026-10-28';
    h.el('adminEmployeeSelect').value='Ana'; h.el('adminRegisterHours').value='1'; h.el('adminRegisterMinutes').value='0';
    await h.el('formAdminRegister').fire('submit');
    assert.equal(h.run('attendanceRecords.filter(r=>r.type==="Permiso").length'),1);
    assert.ok(h.alerts.some(message=>message.includes('registro quedó guardado')));
});

test('doble envío de reducción de deuda no duplica el ajuste', async () => {
    const h=harness(); submitButton(h,'formReduceDebt');
    h.run('setupReduceDebt(); loadAttendanceRecords=async()=>true; dbMode="supabase"; window.count=0; supabaseClient={from:()=>({insert:()=>{window.count++;return new Promise(resolve=>window.release=()=>resolve({error:null}));}})};');
    h.el('reduceDebtHours').value='1'; h.el('reduceDebtMinutes').value='0';
    const first=h.el('formReduceDebt').fire('submit');
    await h.el('formReduceDebt').fire('submit');
    assert.equal(h.run('window.count'),1);
    h.run('window.release()'); await first;
});

test('regularizar una falta falsa conserva auditoría y corrige su deuda', async () => {
    const h=harness(); manualForm(h);
    h.run('setupManualPunchModal(); saveLocalAttendance([{id:"falta",employee_name:"Ana",date:"2026-10-27",type:"Falta",owed_minutes:480,notes:"Falta manual"}]);');
    await h.el('formManualPunch').fire('submit');
    assert.equal(h.run('attendanceRecords.filter(r=>r.type==="Trabajo").length'),1);
    assert.equal(h.run('attendanceRecords.filter(r=>r.type==="Falta").length'),1);
    assert.ok(h.run('isCorrectedAbsence(attendanceRecords.find(r=>r.id==="falta"))'));
    const summary=h.run('calculateMonthlyAttendanceSummary("Ana","2026-10",attendanceRecords)');
    assert.equal(summary.workedMinutes,480);
    assert.equal(summary.absenceCount,0);
    assert.equal(summary.owedMinutes,0);
});

test('regularizar solo extras conserva la falta y sus horas originales', async () => {
    const h=harness(); manualForm(h,{start:'18:00',end:'19:00'});
    h.run('activeWorkers[0].created_at="2026-10-27"; workerSchedules.Ana.created_at="2026-10-27"; workerSchedules.Ana.martes={active:true,in:"08:00",out:"18:00",lunch:true,netMinutes:540}; setupManualPunchModal(); saveLocalAttendance([{id:"falta",employee_name:"Ana",date:"2026-10-27",type:"Falta",owed_minutes:480,notes:"Falta manual"}]);');
    await h.el('formManualPunch').fire('submit');
    assert.equal(h.run('isCorrectedAbsence(attendanceRecords.find(r=>r.id==="falta"))'),false);
    assert.equal(h.el('metricOwedHours').textContent,'8:00');
    assert.equal(h.el('metricAbsenceHours').textContent,'1 (8:00)');
    assert.equal(h.run('attendanceRecords.find(r=>r.type==="Trabajo").extra_minutes'),60);
});

test('guardar de nuevo una regularización exacta no agrega más horas', async () => {
    const h=harness(); manualForm(h);
    h.run('setupManualPunchModal();');
    await h.el('formManualPunch').fire('submit');
    await h.el('formManualPunch').fire('submit');
    assert.equal(h.run('attendanceRecords.filter(r=>r.type==="Trabajo").length'),1);
    assert.ok(h.alerts.some(message=>message.includes('ya está registrada')));
});

test('regularización superpuesta con una jornada existente queda bloqueada', async () => {
    const h=harness(); manualForm(h,{start:'10:00',end:'14:00'});
    h.run('setupManualPunchModal(); saveLocalAttendance([{id:"anterior",employee_name:"Ana",date:"2026-10-27",type:"Trabajo",check_in:"08:00:00",check_out:"12:00:00",hours_credited:4,owed_minutes:240,lunch:false}]);');
    await h.el('formManualPunch').fire('submit');
    assert.equal(h.run('attendanceRecords.filter(r=>r.type==="Trabajo").length'),1);
    assert.ok(h.alerts.some(message=>message.includes('superpone')));
});

test('dos tramos contiguos son válidos y el segundo recupera la deuda', async () => {
    const h=harness(); manualForm(h,{start:'12:00',end:'16:00'});
    h.run('setupManualPunchModal(); saveLocalAttendance([{id:"anterior",employee_name:"Ana",date:"2026-10-27",type:"Trabajo",check_in:"08:00:00",check_out:"12:00:00",hours_credited:4,owed_minutes:240,lunch:false}]);');
    await h.el('formManualPunch').fire('submit');
    const summary=h.run('calculateMonthlyAttendanceSummary("Ana","2026-10",attendanceRecords)');
    assert.equal(summary.workedMinutes,480);
    assert.equal(summary.owedMinutes,0);
    assert.equal(summary.lateMinutes,0);
});

test('reintento tras guardar trabajo y fallar la corrección de falta reutiliza la jornada', async () => {
    const h=harness(); manualForm(h);
    h.run(`setupManualPunchModal(); dbMode="supabase";
        window.server=[{id:"falta",employee_name:"Ana",date:"2026-10-27",type:"Falta",owed_minutes:480,notes:"Falta manual"}];
        window.inserts=0;window.updates=0;
        loadAttendanceRecords=async()=>{attendanceRecords=window.server.map(r=>({...r}));return true;};
        supabaseClient={from:()=>({
            insert:async rows=>{window.inserts++;window.server.push(...rows);return{error:null};},
            update:values=>{let id;const query={eq:(field,value)=>{if(field==="id")id=value;return query;},is:()=>query,
                select:async()=>{window.updates++;if(window.updates===1)return{error:{message:"red interrumpida"}};
                const row=window.server.find(r=>r.id===id);Object.assign(row,values);return{data:[{id}],error:null};}};return query;}
        })};`);
    await h.el('formManualPunch').fire('submit');
    assert.equal(h.run('window.inserts'),1);
    assert.ok(h.el('modalManualPunch').classList.contains('active'));
    assert.ok(h.alerts.some(message=>message.includes('corrección de la falta sigue pendiente')));
    await h.el('formManualPunch').fire('submit');
    assert.equal(h.run('window.inserts'),1);
    assert.equal(h.run('window.updates'),2);
    assert.ok(h.run('isCorrectedAbsence(window.server.find(r=>r.id==="falta"))'));
});

test('doble envío de regularización mientras se guarda no inserta dos jornadas', async () => {
    const h=harness(); manualForm(h);
    h.run('setupManualPunchModal(); dbMode="supabase"; loadAttendanceRecords=async()=>true; window.inserts=0; supabaseClient={from:()=>({insert:()=>{window.inserts++;return new Promise(resolve=>window.release=()=>resolve({error:null}));}})};');
    const first=h.el('formManualPunch').fire('submit');
    await h.el('formManualPunch').fire('submit');
    assert.equal(h.run('window.inserts'),1);
    h.run('window.release()'); await first;
    assert.equal(h.run('window.inserts'),1);
});

test('Excel escribe horas extra decimales y números consistentes', async () => {
    const h=harness();
    h.run('attendanceRecords=[{id:"extra",employee_name:"Ana",date:"2026-10-28",type:"Trabajo",check_in:"18:00:00",check_out:"19:30:00",hours_credited:"1.5",late_minutes:"0",extra_minutes:"90"}]; setupExcelExport();');
    await h.el('btnExportExcel').click();
    const row=h.exportedRows.find(row=>row.colaborador==='Ana'&&row.tipo==='Trabajo');
    assert.equal(row.extras,1.5);
    assert.equal(row.horas,1.5);
    assert.equal(row.tardanza,0);
});

test('la tabla admite horas recibidas como texto numérico', () => {
    const h=harness();
    h.run('attendanceRecords=[{id:"texto",employee_name:"Ana",date:"2026-10-28",type:"Trabajo",check_in:"08:00:00",check_out:"16:00:00",hours_credited:"8",lunch:false}]; renderAttendanceTable();');
    assert.ok(h.el('attendanceTableBody').children.some(row=>row.innerHTML.includes('8.0 h')));
});
