const test = require('node:test');
const assert = require('node:assert/strict');
const {canchasHarness} = require('./helpers/canchas-harness.cjs');

const sites = [
    {name: 'Sport Victoria', script: 'app.js', html: 'index.html', key: 'canchapro_reservas', court: 'Grande', block: 'Ambas'},
    {name: 'Polideportivo', script: 'polideportivo.js', html: 'polideportivo.html', key: 'canchapro_reservas_poli', court: 'Cancha Grande 1', block: 'Todas'},
    {name: 'Brisas', script: 'brisas.js', html: 'brisas.html', key: 'canchapro_reservas_brisas', court: 'Cancha 1 (10 jug)', block: 'Brisas Ambas'}
];
const booking = (id, court, extra = {}) => ({
    id, court, name: 'Cliente de prueba', sport: 'Fútbol', date: '2026-10-30',
    start_time: '23:00:00', end_time: '00:00:00', notes: 'Prueba', medio: 'Cliente frecuente',
    pelota: false, chaleco: false, tipo_pago: 'Efectivo', ...extra
});

for (const site of sites) {
    test(`${site.name}: cloud results and global blocks stay in their own venue`, async () => {
        const h = canchasHarness(site.script, site.html);
        const records = sites.flatMap((s, i) => [booking(`r${i}`, s.court), booking(`b${i}`, s.block, {sport: 'Bloqueo'})]);
        h.context.remoteRecords = records;
        h.run(`dbMode = 'supabase'; supabaseClient = {
            from(table) {
                if (table !== 'reservas') throw new Error('Unexpected table');
                return {select() {return this;}, order() {return this;},
                    range(from, to) {return Promise.resolve({data: remoteRecords.slice(from, to + 1), error: null});}};
            }
        };`);
        const result = await h.run('fetchBookings()');
        assert.deepEqual(Array.from(result, item => item.id), [`r${sites.indexOf(site)}`, `b${sites.indexOf(site)}`]);
        h.context.records = result;
        assert.equal(h.run('filterEvents(records).length'), 2, 'global blocks must remain visible in the calendar');
    });

    test(`${site.name}: calendar maps a midnight ending onto the following date`, async () => {
        const storage = new Map([[site.key, JSON.stringify([booking('midnight', site.court)])]]);
        const h = canchasHarness(site.script, site.html, storage);
        h.run('initCalendar(); updateStats = () => {}; updateDailySummary = () => {}; updateCourtAvailabilityChecker = () => {};');
        const events = await h.run('new Promise((resolve, reject) => calendar.options.events({}, resolve, reject))');
        assert.equal(events.length, 1);
        assert.equal(events[0].start, '2026-10-30T23:00:00');
        assert.equal(events[0].end, '2026-10-31T00:00:00');
    });

    test(`${site.name}: local create, edit and delete preserve the other venues`, async () => {
        const storage = new Map(sites.filter(s => s !== site).map(s => [s.key, JSON.stringify([booking(s.name, s.court)])]));
        const before = new Map(storage);
        const h = canchasHarness(site.script, site.html, storage);
        // Keep persistence, validation and payload generation real; omit rendering unrelated dashboards.
        h.run('fetchAndRenderHistory = () => {}; updateStats = () => {};');
        const fields = {
            bookingName: 'Cliente de prueba', bookingCourt: site.court, bookingSport: 'Fútbol',
            bookingDate: '2026-10-30', bookingNotes: 'Prueba', bookingSource: 'Cliente frecuente',
            bookingPaymentType: 'Efectivo', bookingPelota: 'false', bookingChaleco: 'false',
            startHourSelect: '7', startMinSelect: '00', startAmpmSelect: 'pm',
            endHourSelect: '8', endMinSelect: '00', endAmpmSelect: 'pm'
        };
        for (const [id, value] of Object.entries(fields)) {
            assert.ok(h.elements.has(id), `Missing HTML field ${id}`);
            h.elements.get(id).value = value;
        }
        await h.run('handleSaveBooking({preventDefault() {}})');
        let saved = JSON.parse(storage.get(site.key) || '[]');
        assert.equal(saved.length, 1, h.elements.get('bookingError').textContent);
        assert.equal(saved[0].start_time, '19:00');
        assert.equal(saved[0].end_time, '20:00');
        h.elements.get('bookingId').value = saved[0].id;
        h.elements.get('bookingName').value = 'Cliente editado';
        await h.run('handleSaveBooking({preventDefault() {}})');
        saved = JSON.parse(storage.get(site.key));
        assert.equal(saved.length, 1);
        assert.equal(saved[0].name, 'Cliente editado');
        await h.run('handleDeleteBooking()');
        assert.deepEqual(JSON.parse(storage.get(site.key)), []);
        for (const [key, value] of before) assert.equal(storage.get(key), value, `${key} changed from another venue`);
    });
}
