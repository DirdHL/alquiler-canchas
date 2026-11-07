const test = require('node:test');
const assert = require('node:assert/strict');
const { bungalowsHarness, fakeSupabase } = require('./helpers/bungalows-harness.cjs');

// 2026-11-09 es lunes (tarifa de semana: S/. 160)
const row = (id, bungalow, overrides = {}) => ({
    id, bungalow_numero: bungalow,
    nombre_cliente: 'Ana Pérez', dni_cliente: '12345678', telefono_cliente: '',
    fecha_ingreso: '2026-11-09', fecha_salida: '2026-11-10', horario: 'Día y Noche',
    adultos: 4, ninos_gratis: 0, ninos_pagantes: 0, precio_base: 160, adicional_personas: 0,
    horas_extras: 0, adicional_horas: 0, monto_total: 160, monto_adelanto: 0,
    tipo_pago: 'Depósito', monto_efectivo: 160, monto_yape: 0, medio_contacto: 'Facebook',
    estado_reserva: 'Confirmado', notas: '', asesor_registro: 'Dird',
    created_at: '2026-10-20T15:00:00+00:00',
    ...overrides
});

const localDate = (offsetDays = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function withLocalRows(rows, options) {
    const storage = new Map([['canchapro_reservas_bungalows', JSON.stringify(rows)]]);
    const h = bungalowsHarness({ storage, ...options });
    h.api.setBookings(JSON.parse(JSON.stringify(rows)));
    return h;
}

const savedRows = (h) => JSON.parse(h.storage.get('canchapro_reservas_bungalows'));

function fillNewBooking(h, { bungalows = [1], date = '2026-11-09' } = {}) {
    h.api.openBookingModal(date);
    h.el('bookingName').value = 'Cliente Nuevo';
    h.el('bookingDni').value = '87654321';
    bungalows.forEach(n => h.change(`chkBungalow${n}`, true));
}

test('editar carga el total negociado, el adelanto, el tipo de pago y el precio de hora extra guardados', async () => {
    const original = row('r1', 2, {
        tipo_pago: 'Yape', monto_total: 300, monto_adelanto: 100, monto_efectivo: 0, monto_yape: 300,
        horas_extras: 2, adicional_horas: 20, telefono_cliente: '999888777'
    });
    const h = withLocalRows([original]);

    // Valores "viejos" de otra reserva abierta antes en el mismo formulario
    h.api.openBookingModal('2026-11-20');
    h.el('bookingPaymentType').value = 'Depósito';
    h.el('bookingTotal').value = '999';
    h.el('bookingAdelanto').value = '50';

    h.api.openBookingEditModal(original);
    assert.equal(h.el('bookingPaymentType').value, 'Yape');
    assert.equal(h.el('bookingTotal').value, '300.00');
    assert.equal(h.el('bookingAdelanto').value, '100.00');
    assert.equal(h.el('bookingPendiente').value, '200.00');
    assert.equal(Number(h.el('bookingAdicionalHoras').value), 20);
    assert.equal(h.el('bookingAdicionalHoras').disabled, false);
    assert.equal(h.api.isTotalManuallyEdited, true, 'S/. 300 difiere del calculado (S/. 200): es un precio negociado');

    await h.submit();
    const [saved] = savedRows(h);
    assert.equal(saved.id, 'r1', 'la fila se actualiza en su lugar');
    assert.equal(saved.tipo_pago, 'Yape');
    assert.equal(saved.monto_total, 300);
    assert.equal(saved.monto_adelanto, 100);
    assert.equal(saved.monto_yape, 300);
    assert.equal(saved.horas_extras, 2);
    assert.equal(saved.adicional_horas, 20);
    assert.equal(saved.telefono_cliente, '999888777', 'el teléfono antiguo no se borra');
    assert.equal(saved.created_at, original.created_at);
});

test('editar un grupo desde un bungalow secundario conserva adicionales y niños de todo el grupo', async () => {
    const primary = row('g1', 2, { adultos: 6, ninos_gratis: 1, ninos_pagantes: 1, adicional_personas: 85, monto_total: 202.5, monto_adelanto: 50, monto_efectivo: 202.5 });
    const secondary = row('g2', 3, { adultos: 4, ninos_gratis: 1, monto_total: 202.5, monto_adelanto: 50, monto_efectivo: 202.5 });
    const h = withLocalRows([primary, secondary]);

    h.api.openBookingEditModal(secondary);
    assert.deepEqual(h.checkedBungalows(), [2, 3]);
    assert.equal(Number(h.el('bookingPersonas').value), 8);
    assert.equal(Number(h.el('bookingAdicionales').value), 2);
    assert.equal(Number(h.el('bookingNinoPequeno').value), 2);
    assert.equal(Number(h.el('bookingNinosAdicionales').value), 1);
    assert.equal(h.el('bookingTotal').value, '405.00');
    assert.equal(h.api.isTotalManuallyEdited, false);

    await h.submit();
    const rows = savedRows(h).sort((a, b) => a.bungalow_numero - b.bungalow_numero);
    assert.deepEqual(rows.map(r => r.id), ['g1', 'g2']);
    assert.deepEqual(rows.map(r => r.adultos), [6, 4]);
    assert.deepEqual(rows.map(r => r.ninos_gratis), [1, 1]);
    assert.deepEqual(rows.map(r => r.ninos_pagantes), [1, 0]);
    assert.deepEqual(rows.map(r => r.monto_total), [202.5, 202.5]);
    assert.deepEqual(rows.map(r => r.monto_adelanto), [50, 50]);
});

test('en Supabase la edición actualiza las filas en su lugar e inserta antes de tocar nada', async () => {
    const db = fakeSupabase({ reservas_bungalows: [row('a', 1), row('b', 2)] });
    const h = bungalowsHarness();
    h.api.setCloud(db);
    await h.api.fetchBookings();

    h.api.openBookingEditModal(h.api.bookings.find(b => b.id === 'a'));
    h.change('chkBungalow4', true);
    db.calls.length = 0;
    await h.submit();

    const ops = db.calls.filter(c => c.table === 'reservas_bungalows' && c.op !== 'select').map(c => c.op);
    assert.deepEqual(ops, ['insert', 'update', 'update'], 'sin borrar y volver a crear');
    const rows = db.tables.reservas_bungalows;
    assert.deepEqual(rows.map(r => r.bungalow_numero).sort(), [1, 2, 4]);
    assert.ok(rows.some(r => r.id === 'a') && rows.some(r => r.id === 'b'), 'se conservan los ids');
    assert.equal(rows.find(r => r.bungalow_numero === 4).created_at, '2026-10-20T15:00:00+00:00');
    assert.deepEqual(rows.map(r => r.monto_total), [160, 160, 160]);
});

test('si falla la conexión al guardar una edición, la reserva original no se pierde', async () => {
    const db = fakeSupabase({ reservas_bungalows: [row('a', 1), row('b', 2)] }, {
        fail: q => (q.table === 'reservas_bungalows' && q.op === 'insert') ? { message: 'sin conexión' } : null
    });
    const h = bungalowsHarness();
    h.api.setCloud(db);
    await h.api.fetchBookings();

    h.api.openBookingEditModal(h.api.bookings.find(b => b.id === 'a'));
    h.change('chkBungalow4', true);
    db.calls.length = 0;
    await h.submit();

    assert.match(h.el('bookingError').innerHTML, /sin conexión/);
    assert.deepEqual(db.calls.filter(c => c.op === 'update' || c.op === 'delete'), []);
    assert.deepEqual(db.tables.reservas_bungalows.map(r => r.id), ['a', 'b']);
});

test('doble clic en "Guardar Reserva" crea la reserva una sola vez', async () => {
    const db = fakeSupabase({ reservas_bungalows: [] });
    let release;
    const slowInsert = new Promise(resolve => { release = resolve; });
    db.delayFor = q => (q.table === 'reservas_bungalows' && q.op === 'insert') ? slowInsert : null;
    const h = bungalowsHarness();
    h.api.setCloud(db);

    fillNewBooking(h, { bungalows: [1] });
    const first = h.submit();
    const second = h.submit();
    assert.equal(h.el('btnSaveBooking').disabled, true);
    release();
    await Promise.all([first, second]);

    assert.equal(db.calls.filter(c => c.table === 'reservas_bungalows' && c.op === 'insert').length, 1);
    assert.equal(db.tables.reservas_bungalows.length, 1);
    assert.equal(h.el('btnSaveBooking').disabled, false);
});

test('al editar solo un bungalow del grupo, no se puede mover encima de otro bungalow del grupo', async () => {
    const h = withLocalRows([row('a', 1), row('b', 2)]);
    h.api.openBookingEditModal(h.api.bookings[0]);

    h.change('bookingEditGroupToggle', false);
    assert.deepEqual(h.checkedBungalows(), [1]);
    assert.equal(h.el('chkBungalow2').disabled, true, 'B2 sigue ocupado por el resto del grupo');

    h.el('chkBungalow1').checked = false;
    h.el('chkBungalow2').checked = true;
    await h.submit();
    assert.match(h.el('bookingError').innerHTML, /Conflicto de Reserva/);
    assert.deepEqual(savedRows(h).map(r => r.bungalow_numero), [1, 2]);
});

test('los emojis del comentario sobreviven a la edición y los servicios se leen solo del inicio', async () => {
    const notas = '🍷 (x2) 🎂 - Cumple 🎉 de Ana 🌙 ❤️';
    const h = withLocalRows([row('a', 1, { notas })]);
    h.api.openBookingEditModal(h.api.bookings[0]);
    assert.equal(h.el('bookingComment').value, 'Cumple 🎉 de Ana 🌙 ❤️');
    assert.equal(Number(h.el('bookingVinoCant').value), 2);
    assert.equal(h.el('bookingTorta').checked, true);
    assert.equal(h.el('bookingCuatrimoto').checked, false);

    await h.submit();
    assert.equal(savedRows(h)[0].notas, notas);

    const onlyComment = h.api.parseServiceNotes('🎂 cumple sin torta del local');
    assert.equal(onlyComment.torta, false);
    assert.equal(onlyComment.comment, '🎂 cumple sin torta del local');
    const oldFormat = h.api.parseServiceNotes('🍷 🏍️');
    assert.equal(oldFormat.vino, 1);
    assert.equal(oldFormat.cuatrimoto, true);
    assert.equal(oldFormat.comment, '');
});

test('valida el orden de las fechas y las reglas del turno 9am a 12pm', async () => {
    const h = bungalowsHarness();
    assert.match(h.api.getBookingDateError('2026-11-10', '2026-11-09', 'Día y Noche'), /posterior/);
    assert.match(h.api.getBookingDateError('2026-11-09', '', 'Día y Noche'), /Ingresa/);
    assert.match(h.api.getBookingDateError('2026-11-09', '2026-11-11', '9am a 12pm'), /día después/);
    assert.match(h.api.getBookingDateError('2026-11-13', '2026-11-14', '9am a 12pm'), /Lunes a Jueves/);
    assert.equal(h.api.getBookingDateError('2026-11-09', '2026-11-10', '9am a 12pm'), '');
    assert.equal(h.api.getBookingDateError('2026-11-09', '2026-11-09', 'Full Day'), '');

    fillNewBooking(h);
    h.el('bookingCheckOut').value = '2026-11-08';
    await h.submit();
    assert.match(h.el('bookingError').innerHTML, /posterior/);
    assert.equal(h.api.bookings.length, 0);
});

test('los ingresos del día no cuentan dos veces el día de salida', () => {
    const h = bungalowsHarness();
    const dn = row('a', 1, { fecha_salida: '2026-11-11', monto_total: 320 });
    assert.equal(h.api.getDailyIncomeShare(dn, '2026-11-09'), 160);
    assert.equal(h.api.getDailyIncomeShare(dn, '2026-11-10'), 160);
    assert.equal(h.api.getDailyIncomeShare(dn, '2026-11-11'), 0);
    const ext = row('b', 1, { horario: 'Horario Extendido', monto_total: 320 });
    assert.equal(h.api.getDailyIncomeShare(ext, '2026-11-09'), 160);
    assert.equal(h.api.getDailyIncomeShare(ext, '2026-11-10'), 160);
    const fd = row('c', 1, { horario: 'Full Day', fecha_salida: '2026-11-09' });
    assert.equal(h.api.getDailyIncomeShare(fd, '2026-11-09'), 160);
    assert.equal(h.api.getDailyIncomeShare(fd, '2026-11-10'), 0);
});

test('el resumen del día cuenta cada grupo una vez y no cuenta bloqueos', () => {
    const today = localDate(0);
    const tomorrow = localDate(1);
    const h = bungalowsHarness();
    h.api.setBookings([
        row('g1', 1, { fecha_ingreso: today, fecha_salida: tomorrow }),
        row('g2', 2, { fecha_ingreso: today, fecha_salida: tomorrow }),
        row('s1', 3, { nombre_cliente: 'Luis', dni_cliente: '1', horario: 'Full Day', fecha_ingreso: today, fecha_salida: today }),
        row('out', 4, { nombre_cliente: 'Eva', dni_cliente: '2', fecha_ingreso: localDate(-1), fecha_salida: today }),
        row('blk', 5, { estado_reserva: 'Bloqueado', nombre_cliente: 'Mantenimiento', dni_cliente: '', fecha_ingreso: today, fecha_salida: today, monto_total: 0 })
    ]);
    h.api.updateDashboardStats();
    const startsThisMonth = [today, today, today, localDate(-1)].filter(d => d.slice(0, 7) === today.slice(0, 7));
    const expectedGroups = startsThisMonth.length === 4 ? 3 : 2; // grupo + Luis (+ Eva si entró este mes)
    assert.equal(h.el('statMonthReservations').textContent, expectedGroups);
    assert.equal(h.el('statTodayIncome').textContent, 'S/. 480.00');
    assert.equal(h.el('statTodayOccupied').textContent, '4 / 6');
});

test('Excel: una reserva de varios bungalows se reporta con su total completo', () => {
    const h = bungalowsHarness();
    const [group] = h.api.consolidateBookingRows([row('a', 1, { monto_total: 180, monto_efectivo: 180, precio_base: 180 }),
        row('b', 2, { monto_total: 180, monto_efectivo: 180, precio_base: 180 }),
        row('c', 3, { monto_total: 180, monto_efectivo: 180, precio_base: 180 })]);
    assert.equal(group.monto_total, 540);
    assert.equal(group.monto_deposito, 540);
    assert.equal(group.monto_efectivo_real, 0);
    assert.equal(group.bungalow_numero, '1, 2, 3');

    // Registros antiguos que guardaban el total completo en cada fila
    const [legacy] = h.api.consolidateBookingRows([
        row('x', 1, { monto_total: 360, precio_base: 180, tipo_pago: 'Yape', monto_yape: 360, monto_efectivo: 0, created_at: '2026-09-01T10:00:00+00:00' }),
        row('y', 2, { monto_total: 360, precio_base: 180, tipo_pago: 'Yape', monto_yape: 360, monto_efectivo: 0, created_at: '2026-09-01T10:00:00+00:00' })
    ]);
    assert.equal(legacy.monto_total, 360);
    assert.equal(legacy.monto_yape, 360);

    const [split] = h.api.consolidateBookingRows([
        row('s1', 1, { tipo_pago: 'Dividido', monto_total: 180, monto_efectivo: 100, monto_yape: 80 }),
        row('s2', 2, { tipo_pago: 'Dividido', monto_total: 180, monto_efectivo: 100, monto_yape: 80 })
    ]);
    assert.equal(split.monto_deposito, 200);
    assert.equal(split.monto_yape, 160);
});

test('horas extra: el monto se calcula según el formato con que se guardó la fila', () => {
    const h = bungalowsHarness();
    assert.equal(h.api.getExtraHoursAmount(row('n', 1, { horas_extras: 2, adicional_horas: 20 })), 40);
    assert.equal(h.api.getExtraHoursAmount(row('o', 1, { horas_extras: 2, adicional_horas: 40, created_at: '2026-09-01T10:00:00+00:00' })), 40);
    assert.deepEqual({ ...h.api.getScheduleHours('Full Day', 2) }, { start: '9:00 AM', end: '8:00 PM' });
    assert.deepEqual({ ...h.api.getScheduleHours('9am a 12pm', 1) }, { start: '9:00 AM', end: '1:00 PM' });
    assert.deepEqual({ ...h.api.getScheduleHours('Día y Noche', 13) }, { start: '3:00 PM', end: '1:00 AM' });
});

test('eliminar con "Editar Grupo Completo" borra todo el grupo y puede devolver el vino', async () => {
    const notas = '🍷 (x2)';
    const h = withLocalRows([row('a', 1, { notas }), row('b', 2, { notas }), row('z', 5, { nombre_cliente: 'Otro', dni_cliente: '9' })]);
    h.storage.set('canchapro_inventory_vino_bungalows', '10');

    h.api.openBookingEditModal(h.api.bookings[0]);
    await h.api.handleDeleteBooking();

    assert.deepEqual(savedRows(h).map(r => r.id), ['z']);
    assert.equal(h.storage.get('canchapro_inventory_vino_bungalows'), '12');
    assert.match(h.dialogs.confirms[0], /2 bungalows del grupo/);
});

test('el inventario de vino solo descuenta la diferencia al editar', async () => {
    const h = withLocalRows([]);
    h.storage.set('canchapro_inventory_vino_bungalows', '12');

    fillNewBooking(h, { bungalows: [1] });
    h.el('bookingVinoCant').value = '2';
    await h.submit();
    assert.equal(h.storage.get('canchapro_inventory_vino_bungalows'), '10');

    h.api.openBookingEditModal(h.api.bookings[0]);
    h.el('bookingVinoCant').value = '3';
    await h.submit();
    assert.equal(h.storage.get('canchapro_inventory_vino_bungalows'), '9');

    h.api.openBookingEditModal(h.api.bookings[0]);
    h.el('bookingVinoCant').value = '1';
    await h.submit();
    assert.equal(h.storage.get('canchapro_inventory_vino_bungalows'), '11');
    assert.equal(h.api.bookings.length, 1);
});

test('un nombre con HTML se muestra como texto en el aviso de conflicto', async () => {
    const h = withLocalRows([row('a', 1, { nombre_cliente: '<img src=x onerror=alert(1)>' })]);
    fillNewBooking(h, { bungalows: [1] });
    await h.submit();
    const message = h.el('bookingError').innerHTML;
    assert.match(message, /&lt;img src=x/);
    assert.doesNotMatch(message, /<img/);
});

test('el pago dividido guardado se conserva al editar y el otro monto se completa solo', () => {
    const h = withLocalRows([row('a', 1, { tipo_pago: 'Dividido', monto_total: 400, monto_efectivo: 300, monto_yape: 100 })]);
    h.api.openBookingEditModal(h.api.bookings[0]);
    assert.equal(h.el('splitPaymentRow').classList.contains('hidden'), false);
    assert.equal(h.el('splitEfectivo').value, '300.00');
    assert.equal(h.el('splitYape').value, '100.00');

    h.change('splitEfectivo', '250');
    assert.equal(h.el('splitYape').value, '150.00');
});

test('una descarga vieja de reservas no pisa a una más nueva', async () => {
    const db = fakeSupabase({ reservas_bungalows: [row('a', 1)] });
    const h = bungalowsHarness();
    h.api.setCloud(db);
    const pending = [];
    db.delayFor = q => {
        if (q.table !== 'reservas_bungalows' || q.op !== 'select') return null;
        let release;
        const p = new Promise(resolve => { release = resolve; });
        pending.push(release);
        return p;
    };

    const flush = () => new Promise(resolve => setImmediate(resolve));
    const older = h.api.fetchBookings();
    await flush(); // la consulta vieja ya salió (con 1 reserva) y su respuesta queda en camino
    db.tables.reservas_bungalows.push(row('b', 2));
    const newer = h.api.fetchBookings();
    await flush();
    assert.equal(pending.length, 2);
    pending[1]();
    await newer;
    pending[0]();
    await older;
    assert.deepEqual([...h.api.bookings.map(b => b.id)], ['a', 'b']);
});

test('en móvil el botón Menú abre y cierra el sidebar sin dejar el fondo oscuro', () => {
    const h = bungalowsHarness({ innerWidth: 800 });
    h.api.toggleSidebarHandler();
    assert.equal(h.el('sidebar').classList.contains('open'), true);
    assert.equal(h.el('sidebarBackdrop').classList.contains('active'), true);
    h.api.toggleSidebarHandler();
    assert.equal(h.el('sidebar').classList.contains('open'), false);
    assert.equal(h.el('sidebar').classList.contains('active'), false);
    assert.equal(h.el('sidebarBackdrop').classList.contains('active'), false);
});

test('Navidad (24-27 dic) y Año Nuevo (31 dic-3 ene) cuestan S/. 250 por bungalow y S/. 1500 la casa completa', () => {
    const h = bungalowsHarness();
    const base = (inStr, outStr, horario = 'Día y Noche') => h.api.calculateBasePrice(inStr, outStr, horario);

    // Cada día del rango (inclusive) vale S/. 250, sin importar si es semana o fin de semana
    for (const d of ['2026-12-24', '2026-12-25', '2026-12-26', '2026-12-27', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03']) {
        assert.equal(base(d, d, 'Full Day'), 250, `Full Day ${d}`);
    }
    assert.equal(base('2026-12-24', '2026-12-27'), 750, '3 noches de Navidad');
    assert.equal(base('2026-12-31', '2027-01-03'), 750, '3 noches de Año Nuevo');
    assert.equal(base('2026-12-24', '2026-12-27', 'Horario Extendido'), 1000, '4 días de Navidad');

    // Fuera del rango vuelve la tarifa normal: 23 dic (miércoles) y 28 dic (lunes)
    assert.equal(base('2026-12-23', '2026-12-23', 'Full Day'), 160);
    assert.equal(base('2026-12-28', '2026-12-28', 'Full Day'), 160);
    assert.equal(base('2026-12-23', '2026-12-25'), 160 + 250, 'una noche normal + una de Navidad');
    assert.equal(base('2026-12-27', '2026-12-29'), 250 + 160, 'una noche de Navidad + una normal');
    assert.equal(base('2027-01-04', '2027-01-04', 'Full Day'), 160);

    // Casa completa (6 bungalows) una noche
    const casa = h.api.computeBookingPricing({ checkIn: '2026-12-31', checkOut: '2027-01-01', horario: 'Día y Noche', numBungalows: 6 });
    assert.equal(casa.total, 1500);
});

test('el formulario calcula S/. 1500 al reservar la casa completa el 24 de diciembre', () => {
    const h = bungalowsHarness();
    fillNewBooking(h, { bungalows: [1, 2, 3, 4, 5, 6], date: '2026-12-24' });
    h.change('bookingCheckOut', '2026-12-25');
    h.change('bookingHorario', 'Día y Noche');
    assert.equal(h.el('bookingTotal').value, '1500.00');
});
