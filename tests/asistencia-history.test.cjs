const test = require('node:test');
const assert = require('node:assert/strict');
const { harness, setLunchSchedule, lunchRecord, lunchAccounting } = require('./helpers/asistencia-harness.cjs');

test('una jornada conserva su horario guardado al cambiar el horario actual', () => {
    const h = harness(); setLunchSchedule(h);
    h.run('window.row=attachRecordScheduleSnapshot({id:"cerrada",employee_name:"Ana",date:"2026-10-28",type:"Trabajo",check_in:"08:00:00",check_out:"18:00:00",hours_credited:10,late_minutes:0,extra_minutes:60,owed_minutes:0,notes:"[Sin refrigerio: jornada corrida]."},workerSchedules.Ana.miercoles); workerSchedules.Ana.miercoles.out="17:00"; workerSchedules.Ana.miercoles.netMinutes=480;');
    assert.equal(h.run('getRecordDaySchedule(window.row).out'), '18:00');
    assert.equal(h.run('getRecordDaySchedule(window.row).lunch'), true);
});

test('reparar registros cerrados no modifica extras al editar el horario actual', async () => {
    const h = harness(); setLunchSchedule(h);
    h.run('const row=attachRecordScheduleSnapshot({id:"cerrada",employee_name:"Ana",date:"2026-10-28",type:"Trabajo",check_in:"08:00:00",check_out:"18:00:00",hours_credited:10,late_minutes:0,extra_minutes:60,owed_minutes:0,notes:"[Sin refrigerio: jornada corrida]."},workerSchedules.Ana.miercoles); attendanceRecords=[row]; saveLocalAttendance(attendanceRecords); workerSchedules.Ana.miercoles.out="17:00"; workerSchedules.Ana.miercoles.netMinutes=480;');
    await h.run('repairMissingLunchExtras()');
    assert.equal(h.run('attendanceRecords[0].extra_minutes'), 60);
    assert.equal(h.run('attendanceRecords[0].hours_credited'), 10);
    assert.equal(h.run('getLocalAttendance()[0].extra_minutes'), 60);
});

test('guardar la edición de horario conserva los datos y el horario de jornadas existentes', async () => {
    const h = harness(); setLunchSchedule(h);
    h.storage.set('canchapro_admin_auth', 'true');
    h.run('attendanceRecords=[{id:"antes-edicion",employee_name:"Ana",date:"2026-10-28",type:"Trabajo",check_in:"08:00:00",check_out:"18:00:00",hours_credited:10,late_minutes:0,extra_minutes:60,owed_minutes:0,notes:"[Sin refrigerio: jornada corrida]."}]; saveLocalAttendance(attendanceRecords); setupAddWorkerWizard(); setupEditWorkerSchedule();');
    await h.el('btnEditWorkerSchedule').click();
    const row = h.el('scheduleDaysContainer').rows.find(item => item.getAttribute('data-day') === 'miercoles');
    row.querySelector('.time-out').value = '17:00';
    await h.el('btnWizardSave').click();
    assert.equal(h.run('workerSchedules.Ana.miercoles.out'), '17:00');
    assert.equal(h.run('getRecordDaySchedule(attendanceRecords[0]).out'), '18:00');
    assert.equal(h.run('attendanceRecords[0].extra_minutes'), 60);
    assert.equal(h.run('attendanceRecords[0].hours_credited'), 10);
    assert.equal(h.run('getRecordDaySchedule(getLocalAttendance()[0]).out'), '18:00');
});

test('las versiones del horario se aplican desde su fecha sin cambiar jornadas anteriores', () => {
    const h = harness(); setLunchSchedule(h);
    h.run('const previous=JSON.parse(JSON.stringify(workerSchedules.Ana)); previous.created_at="2026-10-01"; const next=JSON.parse(JSON.stringify(previous)); next.miercoles.out="17:00"; next.miercoles.netMinutes=480; workerSchedules.Ana=mergeScheduleHistory(previous,next,"2026-10-29");');
    assert.equal(h.run('getRecordDaySchedule({employee_name:"Ana",date:"2026-10-28"}).out'), '18:00');
    assert.equal(h.run('getRecordDaySchedule({employee_name:"Ana",date:"2026-11-04"}).out'), '17:00');
});

test('varias ediciones conservan cada versión anterior del horario', () => {
    const h = harness(); setLunchSchedule(h);
    h.run('const previous=JSON.parse(JSON.stringify(workerSchedules.Ana)); previous.created_at="2026-10-01"; const next=JSON.parse(JSON.stringify(previous)); next.miercoles.out="17:00"; next.miercoles.netMinutes=480; workerSchedules.Ana=mergeScheduleHistory(previous,next,"2026-10-29"); const last=JSON.parse(JSON.stringify(workerSchedules.Ana)); last.miercoles.out="16:00"; last.miercoles.netMinutes=420; workerSchedules.Ana=mergeScheduleHistory(workerSchedules.Ana,last,"2026-11-05");');
    assert.equal(h.run('getRecordDaySchedule({employee_name:"Ana",date:"2026-10-28"}).out'), '18:00');
    assert.equal(h.run('getRecordDaySchedule({employee_name:"Ana",date:"2026-11-04"}).out'), '17:00');
    assert.equal(h.run('getRecordDaySchedule({employee_name:"Ana",date:"2026-11-11"}).out'), '16:00');
});

test('una jornada abierta usa el horario guardado para avance y autocierre', async () => {
    const h = harness([2026,9,28,17,10,0]); setLunchSchedule(h);
    h.run('const row=attachRecordScheduleSnapshot({id:"abierta",employee_name:"Ana",date:"2026-10-28",type:"Trabajo",check_in:"08:00:00",check_out:null,hours_credited:0,late_minutes:0,extra_minutes:0,owed_minutes:0,notes:"[Sin refrigerio: jornada corrida]."},workerSchedules.Ana.miercoles); attendanceRecords=[row]; saveLocalAttendance(attendanceRecords); workerSchedules.Ana.miercoles.out="17:00"; workerSchedules.Ana.miercoles.netMinutes=480;');
    const weekly = h.run('calculateWeeklyGoal(selectedWorker,workerSchedules.Ana,attendanceRecords)');
    assert.equal(weekly.pendingScheduledClosures, 0);
    assert.equal(weekly.liveMinutes, 550);
    await h.run('autoCheckoutActiveShifts()');
    assert.equal(h.run('attendanceRecords[0].check_out'), null);
});

test('desactivar un día del horario no borra una falta de una fecha anterior', () => {
    const h = harness();
    h.run('activeWorkers[0].created_at="2026-10-27"; workerSchedules.Ana.created_at="2026-10-27"; const previous=JSON.parse(JSON.stringify(workerSchedules.Ana)); const next=JSON.parse(JSON.stringify(previous)); next.martes.active=false; workerSchedules.Ana=mergeScheduleHistory(previous,next,"2026-10-28");');
    const absences = h.run('getDetectedAbsences("2026-10")');
    assert.equal(absences.length, 1);
    assert.equal(absences[0].date, '2026-10-27');
    assert.equal(absences[0].owed_minutes, 480);
});

test('un mes solo con faltas sigue disponible para consultar el historial', () => {
    const h = harness([2026,10,2,10,0,0]);
    h.run('attendanceRecords=[]; populateMonthFilter();');
    assert.equal(h.run('getDetectedAbsences("2026-10").length'), 22);
    assert.ok(h.el('filterMonth').children.some(option => option.value === '2026-10'));
    assert.ok(h.el('filterMonth').children.some(option => option.value === '2026-11'));
});

test('una reentrada recupera tiempo aunque el horario no incluya almuerzo', () => {
    const h = harness();
    h.run('activeWorkers[0].created_at="2026-10-28"; workerSchedules.Ana.created_at="2026-10-28"; const first={id:"primera",employee_name:"Ana",date:"2026-10-28",type:"Trabajo",check_in:"08:00:00",lunch:false,late_minutes:0,notes:"[Sin refrigerio: jornada corrida]."}; attendanceRecords=[{...first,...calculateShiftAccounting(first,"12:00:00",workerSchedules.Ana.miercoles),check_out:"12:00:00"}]; const second={id:"segunda",employee_name:"Ana",date:"2026-10-28",type:"Trabajo",check_in:"12:00:00",lunch:false,late_minutes:0,notes:"[Sin refrigerio: jornada corrida]. [Turno de recuperación dentro del horario]."}; attendanceRecords.push({...second,...calculateShiftAccounting(second,"16:00:00",workerSchedules.Ana.miercoles),check_out:"16:00:00"});');
    const summary = h.run('calculateMonthlyAttendanceSummary("Ana","2026-10",attendanceRecords)');
    assert.equal(summary.workedMinutes, 480);
    assert.equal(summary.owedMinutes, 0);
    assert.equal(summary.extraMinutes, 0);
});

test('preservar horarios mantiene la recuperación de almuerzo y la tardanza histórica', () => {
    const h = harness(); setLunchSchedule(h);
    const row = {...lunchRecord('08:30:00'), late_minutes:30};
    const result = lunchAccounting(h, row);
    assert.equal(result.hours_credited, 9.5);
    assert.equal(result.owed_minutes, -30);
    assert.equal(result.extra_minutes, 30);
    assert.equal(result.late_minutes, 30);
});
