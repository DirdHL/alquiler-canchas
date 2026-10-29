const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./helpers/asistencia-harness.cjs');

async function exportReport(records, filters = {}) {
    const h = harness([2026,9,28,17,0,0]);
    h.run('activeWorkers[0].created_at="2026-10-28"; workerSchedules.Ana.created_at="2026-10-28"; attendanceRecords='+JSON.stringify(records)+'; setupExcelExport();');
    for (const [id, value] of Object.entries(filters)) h.el(id).value=value;
    await h.el('btnExportExcel').click();
    return h;
}

function record(id, date, values = {}) {
    return { id,employee_name:'Ana',date,type:'Trabajo',check_in:'08:00:00',check_out:'16:00:00',
        hours_credited:8,late_minutes:0,extra_minutes:0,owed_minutes:0,lunch:false,notes:'',...values };
}

function dataRows(sheet) {
    return [...sheet.rows.values()].filter(row => row.source && !Array.isArray(row.source) && row.source.tipo);
}

function summaryRows(sheet, employee = 'Ana') {
    return [...sheet.rows.values()].filter(row => row.source && !Array.isArray(row.source) &&
        Object.hasOwn(row.source,'presenciales') && row.source.colaborador === employee);
}

function valueOf(value) {
    return value && typeof value==='object' && 'result' in value ? value.result : value;
}

test('el reporte abre con resumen y detalle preparados para impresión paginada', async () => {
    const h=await exportReport([record('trabajo','2026-10-28')]);
    assert.deepEqual(h.exportedWorkbook.worksheets.map(sheet=>sheet.name),['Resumen','Detalle']);
    for (const sheet of h.exportedWorkbook.worksheets) {
        assert.equal(sheet.pageSetup.paperSize,9);
        assert.equal(sheet.pageSetup.fitToPage,true);
        assert.equal(sheet.pageSetup.fitToWidth,1);
        assert.equal(sheet.pageSetup.fitToHeight,0);
        assert.ok(sheet.pageSetup.printArea);
        assert.ok(/&P/.test(sheet.headerFooter.oddFooter));
        assert.ok(/&N/.test(sheet.headerFooter.oddFooter));
    }
    const detail=h.exportedWorkbook.getWorksheet('Detalle');
    assert.equal(detail.pageSetup.orientation,'landscape');
    assert.match(detail.pageSetup.printTitlesRow,/^\d+:\d+$/);
    assert.ok(detail.views.some(view=>view.state==='frozen' && view.ySplit>0));
    assert.ok(detail.autoFilter);
    assert.equal(detail.pageSetup.printTitlesRow,'8:8');
    assert.equal(h.exportedWorkbook.getWorksheet('Resumen').pageSetup.printTitlesRow,'12:12');
});

test('el detalle conserva fechas y horas numéricas sin perder los minutos extra', async () => {
    const h=await exportReport([record('extra','2026-10-28',{
        check_in:'18:00:00',check_out:'19:30:00',hours_credited:'1.5',extra_minutes:'90'
    })]);
    const rows=dataRows(h.exportedWorkbook.getWorksheet('Detalle'));
    assert.equal(rows.length,1);
    assert.equal(rows[0].source.extras,1.5);
    assert.equal(rows[0].source.horas,1.5);
    assert.equal(rows[0].source.tardanza,0);
    assert.ok(rows[0].source.fecha instanceof Date || typeof rows[0].source.fecha==='number');
    assert.equal(typeof rows[0].source.entrada,'number');
    assert.equal(typeof rows[0].source.salida,'number');
    assert.equal(Math.round((rows[0].source.salida-rows[0].source.entrada)*1440),90);
});

test('el detalle se ordena cronológicamente y conserva los filtros seleccionados', async () => {
    const h=await exportReport([
        record('fin','2026-10-28',{late_minutes:20}),
        record('fuera','2026-10-21',{late_minutes:15}),
        record('inicio','2026-10-26',{late_minutes:10}),
        record('otra-persona','2026-10-27',{employee_name:'Bruno',late_minutes:30}),
        record('otra-categoria','2026-10-27',{late_minutes:0})
    ],{filterEmployee:'Ana',filterWeek:'4',filterType:'Tardanza'});
    const rows=dataRows(h.exportedWorkbook.getWorksheet('Detalle'));
    assert.equal(rows.length,2);
    assert.deepEqual(rows.map(row=>row.source.tardanza),[10,20]);
    assert.ok(rows.every(row=>row.source.colaborador==='Ana'));
});

test('las observaciones exportadas no muestran los metadatos internos del horario', async () => {
    const h=await exportReport([record('nota','2026-10-28',{
        notes:'Reunión de equipo | [Horario de jornada: {"active":true,"in":"08:00","out":"16:00","lunch":false}]'
    })]);
    const rows=dataRows(h.exportedWorkbook.getWorksheet('Detalle'));
    assert.equal(rows[0].source.notas,'Reunión de equipo');
    assert.ok(!JSON.stringify(h.exportedRows).includes('Horario de jornada'));
});

test('el saldo sigue siendo mensual cuando el detalle se filtra por tardanzas', async () => {
    const h=await exportReport([
        record('tarde','2026-10-27',{check_in:'08:30:00',hours_credited:7.5,late_minutes:30}),
        record('recuperacion','2026-10-28',{
            check_out:'18:00:00',hours_credited:10,owed_minutes:-30,extra_minutes:30,
            notes:'[Sin refrigerio: jornada corrida]. Recupera 30 min pendientes.'
        })
    ],{filterType:'Tardanza'});
    const detail=dataRows(h.exportedWorkbook.getWorksheet('Detalle'));
    assert.equal(detail.length,1);
    assert.equal(detail[0].source.tardanza,30);
    const summary=summaryRows(h.exportedWorkbook.getWorksheet('Resumen'));
    assert.equal(summary.length,1);
    assert.equal(valueOf(summary[0].source.minutos),30);
    assert.equal(valueOf(summary[0].source.presenciales),7.5);
    assert.equal(valueOf(summary[0].source.saldo),0);
    const labels=[...h.exportedWorkbook.getWorksheet('Resumen').getRow(5).cells.values()].map(cell=>cell.text).join(' ');
    assert.match(labels,/saldo/i);
    assert.match(labels,/mes|mensual/i);
});

test('una jornada abierta no aparece como horas confirmadas aunque tenga crédito guardado', async () => {
    const h=await exportReport([record('abierta','2026-10-28',{
        check_out:null,hours_credited:3,extra_minutes:0
    })]);
    const detail=dataRows(h.exportedWorkbook.getWorksheet('Detalle'));
    assert.equal(detail.length,1);
    assert.equal(detail[0].source.tipo,'Trabajo en curso');
    assert.equal(detail[0].source.horas,null);
    assert.equal(detail[0].source.salida,null);
    const summary=summaryRows(h.exportedWorkbook.getWorksheet('Resumen'));
    assert.equal(valueOf(summary[0].source.presenciales),0);
});

test('una falta justificada conserva ausencia histórica y saldo mensual cero', async () => {
    const h=await exportReport([
        record('falta','2026-10-27',{type:'Falta',check_in:null,check_out:null,hours_credited:0,owed_minutes:480}),
        record('permiso','2026-10-27',{type:'Permiso',hours_credited:8})
    ]);
    const summary=summaryRows(h.exportedWorkbook.getWorksheet('Resumen'));
    assert.equal(summary.length,1);
    assert.equal(valueOf(summary[0].source.faltas),1);
    assert.equal(valueOf(summary[0].source.ausencias),8);
    assert.equal(valueOf(summary[0].source.justificadas),8);
    assert.equal(valueOf(summary[0].source.saldo),0);
    const permission=dataRows(h.exportedWorkbook.getWorksheet('Detalle')).find(row=>row.source.tipo==='Permiso');
    assert.equal(permission.source.entrada,null);
    assert.equal(permission.source.salida,null);
});

test('los totales usan solo las filas de datos y guardan el resultado numérico correcto', async () => {
    const h=await exportReport([
        record('primero','2026-10-27',{late_minutes:25}),
        record('segundo','2026-10-28',{check_in:'18:00:00',check_out:'19:30:00',hours_credited:1.5,extra_minutes:90})
    ]);
    const detail=h.exportedWorkbook.getWorksheet('Detalle');
    assert.deepEqual(detail.getCell('F11').value,{formula:'SUBTOTAL(109,F9:F10)',result:9.5});
    assert.deepEqual(detail.getCell('G11').value,{formula:'SUBTOTAL(109,G9:G10)',result:25});
    assert.deepEqual(detail.getCell('H11').value,{formula:'SUBTOTAL(109,H9:H10)',result:1.5});
    const summary=h.exportedWorkbook.getWorksheet('Resumen');
    assert.deepEqual(summary.getCell('B14').value,{formula:'SUBTOTAL(109,B13:B13)',result:9.5});
    assert.deepEqual(summary.getCell('A8').value,{formula:'SUM(B13:B13)',result:9.5});
});

test('el reporte vacío muestra cero indicadores y no crea rangos de totales invertidos', async () => {
    const h=await exportReport([]);
    const summary=h.exportedWorkbook.getWorksheet('Resumen');
    const detail=h.exportedWorkbook.getWorksheet('Detalle');
    assert.equal(summary.getCell('A8').value,0);
    assert.equal(summary.getCell('D8').value,0);
    assert.equal(summary.getCell('G8').value,0);
    assert.equal(summary.getCell('I8').value,0);
    assert.match(summary.getCell('A13').text,/Sin registros/);
    assert.match(detail.getCell('C9').text,/Sin registros/);
    for (const sheet of [summary,detail]) {
        for (const row of sheet.rows.values()) {
            assert.ok([...row.cells.values()].every(cell=>!cell.value || typeof cell.value!=='object' || !cell.value.formula));
        }
    }
});

test('faltas repetidas de una fecha cuentan una vez con sus horas originales máximas', async () => {
    const h=await exportReport([
        record('falta1','2026-10-27',{type:'Falta',check_in:null,check_out:null,hours_credited:0,owed_minutes:480}),
        record('falta2','2026-10-27',{type:'Falta',check_in:null,check_out:null,hours_credited:0,owed_minutes:600}),
        record('permiso','2026-10-27',{type:'Permiso',hours_credited:10})
    ]);
    const summary=summaryRows(h.exportedWorkbook.getWorksheet('Resumen'));
    assert.equal(summary.length,1);
    assert.equal(valueOf(summary[0].source.faltas),1);
    assert.equal(valueOf(summary[0].source.ausencias),10);
    assert.equal(valueOf(summary[0].source.saldo),0);
});
