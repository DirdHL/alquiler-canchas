// =======================================================
// Locales - Sistema de Reservas
// =======================================================

let dbMode = 'local';
let supabaseClient = null;
let realtimeChannel = null;
let calendar = null;
let bookings = [];
let activeOperator = 'Invitado';

document.addEventListener('DOMContentLoaded', async () => {
    lucide.createIcons();
    setupEventListeners();
    loadOperatorSession();
    await initDatabase();
    initCalendar();
    await fetchBookings();
});

function loadOperatorSession() {
    const savedOperator = localStorage.getItem('canchapro_user_name');
    if (savedOperator) {
        activeOperator = savedOperator;
        document.getElementById('displayUserName').textContent = activeOperator;
    }
}

function setupEventListeners() {
    document.getElementById('btnToggleSidebar').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('active'));
    document.getElementById('btnCloseSidebar').addEventListener('click', () => document.getElementById('sidebar').classList.remove('active'));
    document.getElementById('btnNewReservation').addEventListener('click', () => openBookingModal());
    document.getElementById('btnCloseBooking').addEventListener('click', () => closeModal('modalBooking'));
    document.getElementById('btnOpenSettings').addEventListener('click', () => openModal('modalSettings'));
    document.getElementById('btnCloseSettings').addEventListener('click', () => closeModal('modalSettings'));
    document.getElementById('formSettings').addEventListener('submit', handleSaveSettings);
    document.getElementById('formBooking').addEventListener('submit', handleSaveBooking);
    document.getElementById('btnDeleteBooking').addEventListener('click', handleDeleteBooking);

    // Dynamic calculations
    document.getElementById('bookingTotal').addEventListener('input', runDynamicCalculations);
    document.getElementById('bookingAdelanto').addEventListener('input', runDynamicCalculations);
    
    // Filters
    document.getElementById('filterLosPinosGrande').addEventListener('change', renderCalendarEvents);
    document.getElementById('filterLosPinosPequeno').addEventListener('change', renderCalendarEvents);
    document.getElementById('filterPolideportivoGrande').addEventListener('change', renderCalendarEvents);
}

function runDynamicCalculations() {
    const total = parseFloat(document.getElementById('bookingTotal').value) || 0;
    const adelanto = parseFloat(document.getElementById('bookingAdelanto').value) || 0;
    document.getElementById('bookingPendiente').value = Math.max(0, total - adelanto).toFixed(2);
}

function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

function openBookingModal(booking = null, defaultDate = null) {
    document.getElementById('formBooking').reset();
    document.getElementById('bookingId').value = '';
    document.getElementById('bookingError').textContent = '';
    
    // Asesores
    const selectAsesor = document.getElementById('bookingNotes');
    selectAsesor.innerHTML = `<option value="${activeOperator}" selected>${activeOperator}</option>`;
    
    if (defaultDate) {
        document.getElementById('bookingFecha').value = defaultDate;
    } else {
        document.getElementById('bookingFecha').value = new Date().toISOString().split('T')[0];
    }
    
    if (booking) {
        document.getElementById('modalTitle').textContent = 'Editar Reserva';
        document.getElementById('bookingId').value = booking.id;
        document.getElementById('bookingName').value = booking.nombre_cliente || '';
        document.getElementById('bookingTelefono').value = booking.telefono_cliente || '';
        document.getElementById('bookingLocal').value = `${booking.sede}|${booking.espacio}`;
        document.getElementById('bookingTipoEvento').value = booking.tipo_evento || '';
        document.getElementById('bookingFecha').value = booking.fecha_reserva;
        document.getElementById('bookingHoraInicio').value = booking.hora_inicio.substring(0, 5);
        document.getElementById('bookingHoraFin').value = booking.hora_fin.substring(0, 5);
        document.getElementById('bookingSource').value = booking.medio_contacto || 'WhatsApp';
        document.getElementById('bookingTotal').value = booking.monto_total;
        document.getElementById('bookingAdelanto').value = booking.monto_adelanto;
        document.getElementById('bookingComment').value = booking.notas || '';
        document.getElementById('bookingIsBlock').checked = booking.estado_reserva === 'Bloqueado';
        document.getElementById('btnDeleteBooking').classList.remove('hidden');
    } else {
        document.getElementById('modalTitle').textContent = 'Nueva Reserva de Local';
        document.getElementById('btnDeleteBooking').classList.add('hidden');
    }
    
    runDynamicCalculations();
    openModal('modalBooking');
}

async function handleSaveBooking(e) {
    e.preventDefault();
    const isBlock = document.getElementById('bookingIsBlock').checked;
    
    const [sede, espacio] = document.getElementById('bookingLocal').value.split('|');
    const payload = {
        sede: sede,
        espacio: espacio,
        nombre_cliente: document.getElementById('bookingName').value,
        telefono_cliente: document.getElementById('bookingTelefono').value,
        fecha_reserva: document.getElementById('bookingFecha').value,
        hora_inicio: document.getElementById('bookingHoraInicio').value,
        hora_fin: document.getElementById('bookingHoraFin').value,
        tipo_evento: document.getElementById('bookingTipoEvento').value,
        monto_total: parseFloat(document.getElementById('bookingTotal').value) || 0,
        monto_adelanto: parseFloat(document.getElementById('bookingAdelanto').value) || 0,
        medio_contacto: document.getElementById('bookingSource').value,
        estado_reserva: isBlock ? 'Bloqueado' : 'Confirmado',
        notas: document.getElementById('bookingComment').value,
        asesor_registro: document.getElementById('bookingNotes').value
    };

    const bookingId = document.getElementById('bookingId').value;
    
    if (dbMode === 'supabase' && supabaseClient) {
        let error;
        if (bookingId) {
            const res = await supabaseClient.from('reservas_locales').update(payload).eq('id', bookingId);
            error = res.error;
        } else {
            const res = await supabaseClient.from('reservas_locales').insert([payload]);
            error = res.error;
        }
        
        if (error) {
            document.getElementById('bookingError').textContent = 'Error al guardar: ' + error.message;
            return;
        }
    } else {
        // Local mode fallback
        if (bookingId) {
            const idx = bookings.findIndex(b => b.id === bookingId);
            if (idx >= 0) bookings[idx] = { ...bookings[idx], ...payload };
        } else {
            payload.id = Date.now().toString();
            bookings.push(payload);
        }
    }
    
    closeModal('modalBooking');
    if (dbMode === 'local') await fetchBookings();
}

async function handleDeleteBooking() {
    if (!confirm('¿Estás seguro de eliminar esta reserva?')) return;
    const bookingId = document.getElementById('bookingId').value;
    
    if (dbMode === 'supabase' && supabaseClient) {
        await supabaseClient.from('reservas_locales').delete().eq('id', bookingId);
    } else {
        bookings = bookings.filter(b => b.id !== bookingId);
    }
    closeModal('modalBooking');
    if (dbMode === 'local') await fetchBookings();
}

function initCalendar() {
    const calendarEl = document.getElementById('calendar');
    calendar = new FullCalendar.Calendar(calendarEl, {
        locale: 'es',
        initialView: 'dayGridMonth',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'multiMonthYear,dayGridMonth,timeGridWeek,timeGridDay'
        },
        buttonText: {
            today: 'Hoy',
            month: 'Mes',
            week: 'Semana',
            day: 'Día',
            multiMonthYear: 'Año'
        },
        dateClick: function(info) {
            openBookingModal(null, info.dateStr);
        },
        eventClick: function(info) {
            openBookingModal(info.event.extendedProps.rawBooking);
        },
        events: []
    });
    calendar.render();
}

function renderCalendarEvents() {
    const events = [];
    bookings.forEach(b => {
        let filterId = '';
        let color = '#3b82f6'; // default blue
        let titlePrefix = '';
        
        if (b.sede === 'Los Pinos' && b.espacio === 'Grande') {
            filterId = 'filterLosPinosGrande'; color = '#10b981'; titlePrefix = '[Pinos-G]';
        }
        else if (b.sede === 'Los Pinos' && b.espacio === 'Pequeño') {
            filterId = 'filterLosPinosPequeno'; color = '#f59e0b'; titlePrefix = '[Pinos-P]';
        }
        else if (b.sede === 'Polideportivo' && b.espacio === 'Grande') {
            filterId = 'filterPolideportivoGrande'; color = '#8b5cf6'; titlePrefix = '[Polidep]';
        }
        
        const filterEl = document.getElementById(filterId);
        if (filterEl && !filterEl.checked) return;
        
        let title = `${titlePrefix} ${b.nombre_cliente} - ${b.tipo_evento}`;
        if (b.estado_reserva === 'Bloqueado') {
            title = `🔒 BLOQUEADO ${titlePrefix}`;
            color = '#ef4444';
        }
        
        events.push({
            id: b.id,
            title: title,
            start: `${b.fecha_reserva}T${b.hora_inicio}`,
            end: `${b.fecha_reserva}T${b.hora_fin}`,
            backgroundColor: color,
            borderColor: color,
            extendedProps: { rawBooking: b }
        });
    });
    
    calendar.removeAllEvents();
    calendar.addEventSource(events);
    
    // Update daily summary
    const today = new Date().toISOString().split('T')[0];
    const todayEvents = bookings.filter(b => b.fecha_reserva === today);
    document.getElementById('statTodayOccupied').textContent = `${todayEvents.length} Locales`;
}

// ==========================================
// SUPABASE / DB LOGIC
// ==========================================
async function initDatabase() {
    const savedUrl = localStorage.getItem('canchapro_supabase_url');
    const savedKey = localStorage.getItem('canchapro_supabase_key');
    
    if (savedUrl && savedKey) {
        try {
            supabaseClient = window.supabase.createClient(savedUrl, savedKey);
            dbMode = 'supabase';
            
            // Subscribe to real-time changes
            realtimeChannel = supabaseClient.channel('custom-all-channel-locales')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'reservas_locales' }, payload => {
                    fetchBookings();
                })
                .subscribe();
                
            document.getElementById('statusDot').className = 'status-dot connected';
            document.getElementById('statusText').textContent = 'Conectado a la Nube (Supabase)';
            document.getElementById('statusDesc').textContent = 'Sincronización en tiempo real activa.';
        } catch (e) {
            console.error('Supabase init error:', e);
            dbMode = 'local';
        }
    }
}

function handleSaveSettings(e) {
    e.preventDefault();
    const url = document.getElementById('supabaseUrl').value.trim();
    const key = document.getElementById('supabaseKey').value.trim();
    localStorage.setItem('canchapro_supabase_url', url);
    localStorage.setItem('canchapro_supabase_key', key);
    window.location.reload();
}

async function fetchBookings() {
    if (dbMode === 'supabase' && supabaseClient) {
        const { data, error } = await supabaseClient.from('reservas_locales').select('*');
        if (!error && data) {
            bookings = data;
        }
    }
    renderCalendarEvents();
}
