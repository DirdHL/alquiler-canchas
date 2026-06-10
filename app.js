// ==========================================
// CanchaPro JavaScript App Logic
// ==========================================

// State Management
let dbMode = 'local'; // 'local' or 'supabase'
let supabaseClient = null;
let calendar = null;
let allEvents = []; // Cache for local/downloaded events

// DOM Elements
const sidebar = document.getElementById('sidebar');
const sidebarBackdrop = document.getElementById('sidebarBackdrop');
const btnToggleSidebar = document.getElementById('btnToggleSidebar');
const btnCloseSidebar = document.getElementById('btnCloseSidebar');

const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const statusDesc = document.getElementById('statusDesc');

const modalBooking = document.getElementById('modalBooking');
const formBooking = document.getElementById('formBooking');
const modalTitle = document.getElementById('modalTitle');
const bookingIdInput = document.getElementById('bookingId');
const bookingNameInput = document.getElementById('bookingName');
const bookingCourtInput = document.getElementById('bookingCourt');
const bookingSportInput = document.getElementById('bookingSport');
const bookingDateInput = document.getElementById('bookingDate');
const bookingStartTimeInput = document.getElementById('bookingStartTime');
const bookingEndTimeInput = document.getElementById('bookingEndTime');
const bookingNotesInput = document.getElementById('bookingNotes');
const bookingError = document.getElementById('bookingError');

const btnNewReservation = document.getElementById('btnNewReservation');
const btnCloseBooking = document.getElementById('btnCloseBooking');
const btnCancelBooking = document.getElementById('btnCancelBooking');
const btnDeleteBooking = document.getElementById('btnDeleteBooking');

const modalSettings = document.getElementById('modalSettings');
const btnOpenSettings = document.getElementById('btnOpenSettings');
const btnCloseSettings = document.getElementById('btnCloseSettings');
const formSettings = document.getElementById('formSettings');
const supabaseUrlInput = document.getElementById('supabaseUrl');
const supabaseKeyInput = document.getElementById('supabaseKey');
const settingsFeedback = document.getElementById('settingsFeedback');
const btnTestSupabase = document.getElementById('btnTestSupabase');
const btnCopySql = document.getElementById('btnCopySql');

// Onboarding and User Profile DOM Elements
const modalUserOnboarding = document.getElementById('modalUserOnboarding');
const formUserOnboarding = document.getElementById('formUserOnboarding');
const onboardingNameInput = document.getElementById('onboardingName');
const displayUserName = document.getElementById('displayUserName');
const btnEditUser = document.getElementById('btnEditUser');

// Activity Log DOM Elements
const modalHistory = document.getElementById('modalHistory');
const btnOpenHistory = document.getElementById('btnOpenHistory');
const btnCloseHistory = document.getElementById('btnCloseHistory');
const activityList = document.getElementById('activityList');
const btnClearHistoryLocal = document.getElementById('btnClearHistoryLocal');

// Filters
const filterCanchaGrande = document.getElementById('filterCanchaGrande');
const filterCanchaPequena = document.getElementById('filterCanchaPequena');
const filterFutbol = document.getElementById('filterFutbol');
const filterVoley = document.getElementById('filterVoley');

// Stats
const statTodayReservations = document.getElementById('statTodayReservations');
const statCanchaGrande = document.getElementById('statCanchaGrande');
const statCanchaPequena = document.getElementById('statCanchaPequena');

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Lucide Icons
    lucide.createIcons();
    
    // 2. Initialize Operator Identity
    checkOperatorIdentity();

    // 3. Load Supabase config from LocalStorage if exists
    loadDatabaseSettings();

    // 4. Initialize Calendar
    initCalendar();

    // 5. Set up Event Listeners
    setupEventListeners();

    // 6. Update stats initially
    updateStats();
    
    // 7. Load activity history
    fetchAndRenderHistory();
});

// Initialize FullCalendar
function initCalendar() {
    const calendarEl = document.getElementById('calendar');
    
    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: window.innerWidth < 768 ? 'timeGridDay' : 'timeGridWeek',
        locale: 'es',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay'
        },
        buttonText: {
            today: 'Hoy',
            month: 'Mes',
            week: 'Semana',
            day: 'Día',
            list: 'Lista'
        },
        slotMinTime: '06:00:00',
        slotMaxTime: '23:00:00',
        allDaySlot: false,
        slotDuration: '00:30:00',
        snapDuration: '00:30:00',
        slotLabelInterval: '01:00',
        expandRows: true,
        stickyHeaderDates: true,
        selectable: true,
        selectMirror: true,
        editable: false,
        height: 'auto',
        
        // Fetch Events Dynamically
        events: function(fetchInfo, successCallback, failureCallback) {
            fetchBookings().then(bookings => {
                allEvents = bookings;
                updateStats();
                
                // Apply UI filters
                const filtered = filterEvents(bookings);
                
                // Convert to FullCalendar event format
                const fcEvents = filtered.map(b => ({
                    id: b.id,
                    title: `${b.name} (${b.sport})`,
                    start: `${b.date}T${b.start_time}`,
                    end: `${b.date}T${b.end_time}`,
                    className: b.court === 'Grande' ? 'event-cancha-grande' : 'event-cancha-pequena',
                    extendedProps: b // Keep original data
                }));
                
                successCallback(fcEvents);
            }).catch(err => {
                console.error("Error cargando reservas:", err);
                failureCallback(err);
            });
        },

        // Click and drag to create event
        select: function(selectionInfo) {
            const startDateObj = new Date(selectionInfo.startStr);
            const endDateObj = new Date(selectionInfo.endStr);
            
            // Format to local date & times
            const dateStr = selectionInfo.startStr.split('T')[0];
            const startTimeStr = formatTime(startDateObj);
            const endTimeStr = formatTime(endDateObj);

            openBookingModal(null, {
                date: dateStr,
                start_time: startTimeStr,
                end_time: endTimeStr
            });
        },

        // Click event to view/edit
        eventClick: function(info) {
            const bookingData = info.event.extendedProps;
            openBookingModal(bookingData);
        }
    });

    calendar.render();
}

// Utility to format Date object to HH:MM time string
function formatTime(date) {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

// Event Listeners Setup
function setupEventListeners() {
    // Mobile Sidebar Drawer Actions
    if (btnToggleSidebar) {
        btnToggleSidebar.addEventListener('click', openSidebarDrawer);
    }
    if (btnCloseSidebar) {
        btnCloseSidebar.addEventListener('click', closeSidebarDrawer);
    }
    if (sidebarBackdrop) {
        sidebarBackdrop.addEventListener('click', closeSidebarDrawer);
    }

    // Booking Form Modals
    btnNewReservation.addEventListener('click', () => openBookingModal());
    btnCloseBooking.addEventListener('click', closeBookingModal);
    btnCancelBooking.addEventListener('click', closeBookingModal);
    btnDeleteBooking.addEventListener('click', handleDeleteBooking);
    formBooking.addEventListener('submit', handleSaveBooking);

    // Settings Modal
    btnOpenSettings.addEventListener('click', () => {
        closeSidebarDrawer();
        openModal(modalSettings);
        settingsFeedback.className = 'settings-feedback';
        settingsFeedback.textContent = '';
    });
    btnCloseSettings.addEventListener('click', () => closeModal(modalSettings));
    btnTestSupabase.addEventListener('click', testSupabaseConnection);
    formSettings.addEventListener('submit', handleSaveSettings);
    
    // Copy SQL script to clipboard
    btnCopySql.addEventListener('click', () => {
        const sqlText = document.getElementById('sqlCode').innerText;
        navigator.clipboard.writeText(sqlText).then(() => {
            btnCopySql.innerHTML = '<i data-lucide="check"></i> Copiado';
            lucide.createIcons();
            setTimeout(() => {
                btnCopySql.innerHTML = '<i data-lucide="copy"></i> Copiar SQL';
                lucide.createIcons();
            }, 2000);
        });
    });

    // Checkbox Filters
    [filterCanchaGrande, filterCanchaPequena, filterFutbol, filterVoley].forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            if (calendar) calendar.refetchEvents();
        });
    });

    // Responsive views adjust
    window.addEventListener('resize', () => {
        if (window.innerWidth >= 900) {
            closeSidebarDrawer();
        }
        if (!calendar) return;
        const newView = window.innerWidth < 768 ? 'timeGridDay' : 'timeGridWeek';
        if (calendar.view.type !== newView) {
            calendar.changeView(newView);
        }
    });

    // Operator Identity Actions
    if (formUserOnboarding) {
        formUserOnboarding.addEventListener('submit', handleSaveOnboardingName);
    }
    if (btnEditUser) {
        btnEditUser.addEventListener('click', openOperatorEditModal);
    }

    // Activity Log Actions
    if (btnOpenHistory) {
        btnOpenHistory.addEventListener('click', () => {
            closeSidebarDrawer();
            openModal(modalHistory);
            fetchAndRenderHistory();
        });
    }
    if (btnCloseHistory) {
        btnCloseHistory.addEventListener('click', () => {
            closeModal(modalHistory);
        });
    }
    if (btnClearHistoryLocal) {
        btnClearHistoryLocal.addEventListener('click', clearHistoryLocal);
    }
}

// Open Booking Modal (Null = New, Object = Edit)
function openBookingModal(booking = null, defaults = null) {
    formBooking.reset();
    bookingError.style.display = 'none';
    
    // Close mobile drawer if open
    closeSidebarDrawer();
    
    if (booking) {
        // Edit Mode
        modalTitle.textContent = 'Editar Reserva';
        bookingIdInput.value = booking.id;
        bookingNameInput.value = booking.name;
        bookingCourtInput.value = booking.court;
        bookingSportInput.value = booking.sport;
        bookingDateInput.value = booking.date;
        bookingStartTimeInput.value = booking.start_time;
        bookingEndTimeInput.value = booking.end_time;
        bookingNotesInput.value = booking.notes || '';
        
        btnDeleteBooking.classList.remove('hidden');
    } else {
        // New Mode
        modalTitle.textContent = 'Nueva Reserva';
        bookingIdInput.value = '';
        btnDeleteBooking.classList.add('hidden');

        // Apply defaults if clicked on calendar
        if (defaults) {
            bookingDateInput.value = defaults.date;
            bookingStartTimeInput.value = defaults.start_time;
            bookingEndTimeInput.value = defaults.end_time;
        } else {
            // Standard defaults
            const today = new Date().toISOString().split('T')[0];
            bookingDateInput.value = today;
            bookingStartTimeInput.value = '14:00';
            bookingEndTimeInput.value = '15:00';
        }
    }

    openModal(modalBooking);
    lucide.createIcons(); // Refresh modal icons
}

function closeBookingModal() {
    closeModal(modalBooking);
}

// Mobile sidebar controls
function openSidebarDrawer() {
    if (sidebar) sidebar.classList.add('open');
    if (sidebarBackdrop) sidebarBackdrop.classList.add('active');
    updateBodyScroll();
}

function closeSidebarDrawer() {
    if (sidebar) sidebar.classList.remove('open');
    if (sidebarBackdrop) sidebarBackdrop.classList.remove('active');
    updateBodyScroll();
}

// Modal helper controls
function openModal(modal) {
    modal.classList.add('active');
    updateBodyScroll();
}

// Close helper controls
function closeModal(modal) {
    modal.classList.remove('active');
    updateBodyScroll();
}

// Manage body scrolling to prevent scroll chain issues on mobile when overlays are active
function updateBodyScroll() {
    const isAnyModalActive = document.querySelectorAll('.modal-backdrop.active').length > 0;
    const isSidebarActive = sidebar && sidebar.classList.contains('open');
    
    if (isAnyModalActive || isSidebarActive) {
        document.body.classList.add('no-scroll');
    } else {
        document.body.classList.remove('no-scroll');
    }
}

// Fetch bookings from either LocalStorage or Supabase
async function fetchBookings() {
    if (dbMode === 'supabase' && supabaseClient) {
        try {
            const { data, error } = await supabaseClient
                .from('reservas')
                .select('*')
                .order('date', { ascending: true })
                .order('start_time', { ascending: true });

            if (error) throw error;
            return data || [];
        } catch (err) {
            console.error("Fallo al obtener de Supabase, usando respaldo local:", err);
            return getLocalBookings();
        }
    } else {
        return getLocalBookings();
    }
}

// Local Storage Helper: Get
function getLocalBookings() {
    const data = localStorage.getItem('canchapro_reservas');
    return data ? JSON.parse(data) : [];
}

// Local Storage Helper: Save
function saveLocalBookings(bookings) {
    localStorage.setItem('canchapro_reservas', JSON.stringify(bookings));
}

// Filter bookings based on UI checkboxes
function filterEvents(bookings) {
    return bookings.filter(b => {
        const courtMatch = (b.court === 'Grande' && filterCanchaGrande.checked) || 
                           (b.court === 'Pequeña' && filterCanchaPequena.checked);
        const sportMatch = (b.sport === 'Fútbol' && filterFutbol.checked) || 
                           (b.sport === 'Vóley' && filterVoley.checked);
        return courtMatch && sportMatch;
    });
}

// Check overlapping bookings
function checkOverlaps(id, court, date, startTime, endTime) {
    // Convert new time to comparable numbers (minutes of day)
    const newStart = parseTimeToMinutes(startTime);
    const newEnd = parseTimeToMinutes(endTime);

    if (newStart >= newEnd) {
        return "La hora de inicio debe ser anterior a la hora de fin.";
    }

    // Check conflicts on the same date and same court
    for (const event of allEvents) {
        // Skip current event if editing
        if (event.id === id) continue;

        if (event.court === court && event.date === date) {
            const existStart = parseTimeToMinutes(event.start_time);
            const existEnd = parseTimeToMinutes(event.end_time);

            // Overlap check formula: (StartA < EndB) AND (EndA > StartB)
            if (newStart < existEnd && newEnd > existStart) {
                return `Conflicto de horario: La ${court === 'Grande' ? 'Cancha Grande' : 'Cancha Pequeña'} ya está reservada por ${event.name} en este horario (${event.start_time} - ${event.end_time}).`;
            }
        }
    }
    return null; // No conflict
}

function parseTimeToMinutes(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
}

// Handle saving a booking (Create or Update)
async function handleSaveBooking(e) {
    e.preventDefault();
    bookingError.style.display = 'none';

    const id = bookingIdInput.value || crypto.randomUUID();
    const name = bookingNameInput.value.trim();
    const court = bookingCourtInput.value;
    const sport = bookingSportInput.value;
    const date = bookingDateInput.value;
    const startTime = bookingStartTimeInput.value;
    const endTime = bookingEndTimeInput.value;
    const notes = bookingNotesInput.value.trim();

    // 1. Validation for empty inputs
    if (!name || !date || !startTime || !endTime) {
        showBookingError("Por favor completa todos los campos requeridos.");
        return;
    }

    // 2. Validate time overlaps
    const overlapMsg = checkOverlaps(bookingIdInput.value, court, date, startTime, endTime);
    if (overlapMsg) {
        showBookingError(overlapMsg);
        return;
    }

    const bookingData = {
        id,
        name,
        court,
        sport,
        date,
        start_time: startTime,
        end_time: endTime,
        notes
    };

    try {
        if (dbMode === 'supabase' && supabaseClient) {
            // Guardar en Supabase
            let query;
            if (bookingIdInput.value) {
                // Actualizar
                query = supabaseClient.from('reservas').update(bookingData).eq('id', id);
            } else {
                // Insertar nuevo
                query = supabaseClient.from('reservas').insert([bookingData]);
            }
            
            const { error } = await query;
            if (error) throw error;
        } else {
            // Guardar en LocalStorage
            let localList = getLocalBookings();
            if (bookingIdInput.value) {
                // Reemplazar existente
                localList = localList.map(b => b.id === id ? bookingData : b);
            } else {
                // Agregar nuevo
                localList.push(bookingData);
            }
            saveLocalBookings(localList);
        }

        // Add history entry!
        const isUpdate = !!bookingIdInput.value;
        const logAction = isUpdate ? 'editar' : 'crear';
        const logDetails = `${isUpdate ? 'modificó la' : 'creó una'} reserva para ${name} (${court} - ${sport}) el ${date} de ${startTime} a ${endTime}`;
        await addHistoryEntry(logAction, logDetails);

        // Refresh Calendar UI & Close modal
        closeBookingModal();
        if (calendar) calendar.refetchEvents();
        updateStats();
        
    } catch (err) {
        console.error("Error al guardar reserva:", err);
        showBookingError("Error de base de datos: " + err.message);
    }
}

// Handle deleting a booking
async function handleDeleteBooking() {
    const id = bookingIdInput.value;
    if (!id) return;

    if (!confirm("¿Estás seguro de que deseas eliminar esta reserva?")) {
        return;
    }

    const name = bookingNameInput.value.trim();
    const court = bookingCourtInput.value;
    const sport = bookingSportInput.value;
    const date = bookingDateInput.value;
    const startTime = bookingStartTimeInput.value;
    const endTime = bookingEndTimeInput.value;

    try {
        if (dbMode === 'supabase' && supabaseClient) {
            const { error } = await supabaseClient.from('reservas').delete().eq('id', id);
            if (error) throw error;
        } else {
            let localList = getLocalBookings();
            localList = localList.filter(b => b.id !== id);
            saveLocalBookings(localList);
        }

        // Add history entry!
        const logDetails = `eliminó la reserva de ${name} (${court} - ${sport}) del ${date} de ${startTime} a ${endTime}`;
        await addHistoryEntry('eliminar', logDetails);

        closeBookingModal();
        if (calendar) calendar.refetchEvents();
        updateStats();

    } catch (err) {
        console.error("Error al eliminar reserva:", err);
        showBookingError("Error de base de datos al eliminar: " + err.message);
    }
}

function showBookingError(msg) {
    bookingError.textContent = msg;
    bookingError.style.display = 'block';
}

// ==========================================
// Supabase Credential Validators
// ==========================================
function validateAndFixSupabaseUrl(rawUrl) {
    const url = rawUrl.trim();

    // Detect if user pasted the Supabase dashboard URL
    const dashboardMatch = url.match(/supabase\.com\/dashboard\/project\/([a-z0-9]+)/);
    if (dashboardMatch) {
        const projectId = dashboardMatch[1];
        const correctedUrl = `https://${projectId}.supabase.co`;
        return { valid: false, suggestion: correctedUrl,
            message: `❌ Pegaste la URL del panel de Supabase.\nLa URL correcta es: ${correctedUrl}` };
    }
    if (!url.includes('.supabase.co')) {
        return { valid: false, suggestion: null,
            message: `❌ La URL debe tener el formato:\nhttps://XXXXXXXXXXXXXXXX.supabase.co` };
    }
    return { valid: true, message: null, suggestion: null };
}

function validateKey(rawKey) {
    const key = rawKey.trim();
    // Clave secreta - nunca usar en el navegador
    if (key.startsWith('sb_secret_') || key.startsWith('sb_live_')) {
        return { valid: false,
            message: `❌ Pegaste la CLAVE SECRETA. Esta clave NUNCA debe usarse en un navegador.\n\n✅ Ve a Configuración → Claves API → pestaña "Legacy anon" y copia la clave "anon | public" (empieza con eyJ...)` };
    }
    // Nueva clave publishable - válida pero requiere RLS
    if (key.startsWith('sb_publishable_')) {
        return { valid: true, isPublishable: true, message: null };
    }
    // Clave JWT heredada (Legacy)
    if (key.startsWith('eyJ')) {
        return { valid: true, isPublishable: false, message: null };
    }
    // Formato desconocido
    return { valid: false, suggestion: null,
        message: `❌ La clave no parece correcta.\n\nDebe empezar con "eyJ..." (Clave anon heredada).\nVe a Configuración → Claves API → pestaña "Legacy anon".` };
}

async function checkSupabaseReachable(url) {
    try {
        const res = await fetch(`${url}/rest/v1/`, { method: 'HEAD' });
        return true; // Any response means reachable
    } catch(e) {
        return false;
    }
}

// Load Supabase settings and attempt initialization
function loadDatabaseSettings() {
    const url = localStorage.getItem('canchapro_supabase_url');
    const key = localStorage.getItem('canchapro_supabase_key');

    if (url && key) {
        supabaseUrlInput.value = url;
        supabaseKeyInput.value = key;
        
        try {
            supabaseClient = supabase.createClient(url, key);
            dbMode = 'supabase';
            
            // Validate connection
            testSupabaseSilent();
        } catch (e) {
            console.error("Error de inicialización de Supabase client:", e);
            setLocalMode();
        }
    } else {
        setLocalMode();
    }
}

// Test Connection silently at startup
function updateDatabaseStatusUI(connected, errorMsg = null) {
    const btnOpenSettings = document.getElementById('btnOpenSettings');
    if (!btnOpenSettings) return;

    if (connected) {
        statusDot.className = 'status-dot connected';
        statusText.textContent = 'Conectado a la Nube (Supabase)';
        statusDesc.textContent = 'Las reservas están sincronizadas con la nube y compartidas en tiempo real.';
        
        btnOpenSettings.className = 'btn btn-secondary btn-sm';
        btnOpenSettings.innerHTML = '<i data-lucide="database"></i> Configuración de Base de Datos';
    } else {
        statusDot.className = 'status-dot disconnected';
        if (errorMsg) {
            statusText.textContent = 'Error de Conexión (Supabase)';
            statusDesc.textContent = errorMsg;
        } else {
            statusText.textContent = 'Modo Sin Conexión (Local)';
            statusDesc.textContent = 'Accede con el link y la contraseña para poder compartir la informacion con los demas asesores';
        }
        
        btnOpenSettings.className = 'btn btn-attention btn-sm';
        btnOpenSettings.innerHTML = '<i data-lucide="database"></i> Ingresa aquí para ver la info';
    }
    if (window.lucide) {
        lucide.createIcons();
    }
}

async function testSupabaseSilent() {
    try {
        const { data, error } = await supabaseClient.from('reservas').select('id').limit(1);
        if (error) throw error;
        
        // Success
        updateDatabaseStatusUI(true);
        
        // Listen to real-time events to update calendar immediately when others make changes!
        setupRealtimeSubscription();
        
        if (calendar) calendar.refetchEvents();
    } catch (err) {
        console.warn("Supabase no está listo o la tabla no existe:", err.message);
        updateDatabaseStatusUI(false, 'Configurado, pero no pudimos conectar a la tabla "reservas". ¿Ejecutaste el SQL?');
    }
}

// Set up Supabase Realtime Channel
let realtimeChannel = null;
function setupRealtimeSubscription() {
    if (!supabaseClient) return;
    
    // Clean old channel if active
    if (realtimeChannel) {
        supabaseClient.removeChannel(realtimeChannel);
    }
    
    realtimeChannel = supabaseClient.channel('realtime_db')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reservas' }, () => {
            // Refetch calendar dynamically on any database change
            if (calendar) calendar.refetchEvents();
            fetchAndRenderHistory();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'historial' }, () => {
            // Refetch history dynamically on any database change
            fetchAndRenderHistory();
        })
        .subscribe();
}

function setLocalMode() {
    dbMode = 'local';
    supabaseClient = null;
    updateDatabaseStatusUI(false);
}

// Handle saving database settings form
async function handleSaveSettings(e) {
    e.preventDefault();
    settingsFeedback.className = 'settings-feedback';
    settingsFeedback.textContent = 'Verificando e intentando guardar...';

    const url = supabaseUrlInput.value.trim();
    const key = supabaseKeyInput.value.trim();

    if (!url || !key) {
        showSettingsError("Ambos campos son obligatorios.");
        return;
    }

    // Validate URL format
    const urlCheck = validateAndFixSupabaseUrl(url);
    if (!urlCheck.valid) {
        if (urlCheck.suggestion) {
            supabaseUrlInput.value = urlCheck.suggestion;
            showSettingsError(`URL corregida automáticamente a: ${urlCheck.suggestion}\n\nAhora haz clic en "Guardar Credenciales" nuevamente.`);
        } else {
            showSettingsError(urlCheck.message);
        }
        return;
    }

    try {
        const tempClient = supabase.createClient(url, key);
        
        // Test query
        const { data, error } = await tempClient.from('reservas').select('id').limit(1);
        
        if (error) {
            throw new Error(`Conexión correcta pero error en la tabla: ${error.message}`);
        }

        // Connection works! Save to storage
        localStorage.setItem('canchapro_supabase_url', url);
        localStorage.setItem('canchapro_supabase_key', key);
        
        supabaseClient = tempClient;
        dbMode = 'supabase';
        
        // Sync indicator UI
        updateDatabaseStatusUI(true);
        
        setupRealtimeSubscription();
        
        settingsFeedback.className = 'settings-feedback success';
        settingsFeedback.textContent = '¡Conexión guardada y establecida con éxito!';
        
        setTimeout(() => {
            closeModal(modalSettings);
            if (calendar) calendar.refetchEvents();
        }, 1500);

    } catch (err) {
        console.error(err);
        showSettingsError(`Error de conexión: ${err.message}`);
    }
}

// Test Connection Button Action
async function testSupabaseConnection() {
    settingsFeedback.className = 'settings-feedback';
    settingsFeedback.textContent = 'Probando conexión...';

    const url = supabaseUrlInput.value.trim();
    const key = supabaseKeyInput.value.trim();

    if (!url || !key) {
        showSettingsError("Ingresa la URL y la Key antes de probar.");
        return;
    }

    // 1. Validate URL
    const urlCheck = validateAndFixSupabaseUrl(url);
    if (!urlCheck.valid) {
        if (urlCheck.suggestion) supabaseUrlInput.value = urlCheck.suggestion;
        showSettingsError(urlCheck.message + (urlCheck.suggestion ? '\n\nEl campo fue corregido. Intenta de nuevo.' : ''));
        return;
    }

    // 2. Validate Key type
    const keyCheck = validateKey(key);
    if (!keyCheck.valid) {
        showSettingsError(keyCheck.message);
        return;
    }

    // 3. Check if project is reachable at all
    settingsFeedback.textContent = 'Verificando que el proyecto Supabase existe...';
    const reachable = await checkSupabaseReachable(url);
    if (!reachable) {
        showSettingsError(`❌ No se pudo alcanzar el servidor Supabase.\n\nVerifica que:\n• La URL sea correcta: ${url}\n• Tengas conexión a Internet\n• El proyecto no esté pausado en Supabase`);
        return;
    }

    // 4. Try the actual DB query
    settingsFeedback.textContent = 'Conectando a la base de datos...';
    try {
        const tempClient = supabase.createClient(url, key);
        const { data, error } = await tempClient.from('reservas').select('id').limit(1);
        if (error) throw new Error(error.message);

        settingsFeedback.className = 'settings-feedback success';
        settingsFeedback.textContent = '¡Conexión Exitosa! ✅ La tabla "reservas" existe y es accesible.';
    } catch (err) {
        if (err.message.includes('relation') || err.message.includes('does not exist')) {
            showSettingsError(`❌ La tabla "reservas" no existe todavía.\n\nEjecuta el SQL del recuadro de abajo en el SQL Editor de Supabase.`);
        } else if (err.message.includes('permission') || err.message.includes('policy') || err.message.includes('RLS')) {
            showSettingsError(`❌ Error de permisos RLS.\n\nEjecuta esto en el SQL Editor de Supabase:\nALTER TABLE reservas ENABLE ROW LEVEL SECURITY;\nCREATE POLICY "Acceso publico" ON reservas FOR ALL USING (true) WITH CHECK (true);`);
        } else {
            showSettingsError(`❌ Error: ${err.message}`);
        }
    }
}

function showSettingsError(msg) {
    settingsFeedback.className = 'settings-feedback error';
    settingsFeedback.textContent = msg;
}

// Update Dashboard Statistics Card
function updateStats() {
    const todayStr = new Date().toISOString().split('T')[0];
    
    // Filter events belonging to today
    const todayEvents = allEvents.filter(e => e.date === todayStr);
    
    statTodayReservations.textContent = todayEvents.length;
    
    let hoursGrande = 0;
    let hoursPequena = 0;
    
    todayEvents.forEach(e => {
        const start = parseTimeToMinutes(e.start_time);
        const end = parseTimeToMinutes(e.end_time);
        const diffHours = (end - start) / 60;
        
        if (e.court === 'Grande') {
            hoursGrande += diffHours;
        } else if (e.court === 'Pequeña') {
            hoursPequena += diffHours;
        }
    });
    
    statCanchaGrande.textContent = `${hoursGrande.toFixed(1)} h`;
    statCanchaPequena.textContent = `${hoursPequena.toFixed(1)} h`;
}

// ==========================================
// Operator Identity & Audit History Logic
// ==========================================

function checkOperatorIdentity() {
    const name = localStorage.getItem('canchapro_user_name');
    if (name) {
        displayUserName.textContent = name;
    } else {
        displayUserName.textContent = 'Invitado';
        openModal(modalUserOnboarding);
    }
}

async function handleSaveOnboardingName(e) {
    e.preventDefault();
    const rawName = onboardingNameInput.value.trim();
    if (!rawName) return;

    // Clean duplicate spaces and capitalize each word (e.g. "juan carlos" -> "Juan Carlos" or "admin 1" -> "Admin 1")
    const formattedName = rawName
        .split(/\s+/)
        .map(word => {
            if (!word) return '';
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        })
        .filter(word => word.length > 0)
        .join(' ');

    if (!formattedName) return;

    const oldName = localStorage.getItem('canchapro_user_name');
    if (oldName && oldName !== formattedName) {
        await addHistoryEntry('editar', `cambió su nombre a ${formattedName}`);
    }

    localStorage.setItem('canchapro_user_name', formattedName);
    displayUserName.textContent = formattedName;
    closeModal(modalUserOnboarding);

    // Refresh history logs to update display name
    fetchAndRenderHistory();
}

function openOperatorEditModal() {
    const currentName = localStorage.getItem('canchapro_user_name') || '';
    onboardingNameInput.value = currentName;
    openModal(modalUserOnboarding);
}

async function addHistoryEntry(action, details) {
    const userName = localStorage.getItem('canchapro_user_name') || 'Invitado';
    const entry = {
        action,
        user_name: userName,
        details,
        created_at: new Date().toISOString()
    };

    if (dbMode === 'supabase' && supabaseClient) {
        try {
            const { error } = await supabaseClient.from('historial').insert([entry]);
            if (error) throw error;
        } catch (e) {
            console.error("Fallo al guardar log en Supabase, guardando localmente:", e);
            saveHistoryEntryLocal(entry);
        }
    } else {
        saveHistoryEntryLocal(entry);
    }
}

function saveHistoryEntryLocal(entry) {
    let history = getHistoryLocal();
    history.unshift(entry);
    if (history.length > 50) history = history.slice(0, 50);
    localStorage.setItem('canchapro_historial', JSON.stringify(history));
    fetchAndRenderHistory();
}

function getHistoryLocal() {
    const data = localStorage.getItem('canchapro_historial');
    return data ? JSON.parse(data) : [];
}

async function fetchAndRenderHistory() {
    let entries = [];
    if (dbMode === 'supabase' && supabaseClient) {
        try {
            const { data, error } = await supabaseClient
                .from('historial')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(10);
            if (error) throw error;
            entries = data || [];
            
            if (btnClearHistoryLocal) btnClearHistoryLocal.style.display = 'none';
        } catch (e) {
            console.warn("Fallo al obtener historial de Supabase, usando local:", e);
            entries = getHistoryLocal().slice(0, 10);
            if (btnClearHistoryLocal) btnClearHistoryLocal.style.display = 'inline-block';
        }
    } else {
        entries = getHistoryLocal().slice(0, 10);
        if (btnClearHistoryLocal && entries.length > 0) {
            btnClearHistoryLocal.style.display = 'inline-block';
        } else if (btnClearHistoryLocal) {
            btnClearHistoryLocal.style.display = 'none';
        }
    }

    if (!activityList) return;

    if (entries.length === 0) {
        activityList.innerHTML = '<p class="no-activity">No hay actividad registrada.</p>';
        return;
    }

    activityList.innerHTML = entries.map(entry => {
        const timeAgo = formatTimeAgo(new Date(entry.created_at));
        let actionClass = 'crear';
        let actionWord = 'creó';

        if (entry.action === 'editar') {
            actionClass = 'editar';
            actionWord = 'modificó';
        } else if (entry.action === 'eliminar') {
            actionClass = 'eliminar';
            actionWord = 'eliminó';
        }

        return `
            <div class="activity-item">
                <div class="activity-indicator ${actionClass}"></div>
                <div class="activity-content">
                    <span class="activity-text">
                        <span class="user-highlight">${escapeHTML(entry.user_name)}</span> ${escapeHTML(entry.details)}
                    </span>
                    <span class="activity-time">${timeAgo}</span>
                </div>
            </div>
        `;
    }).join('');
}

function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

function formatTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    
    if (seconds < 0) return 'Ahora mismo';
    if (seconds < 60) return `Hace ${seconds} seg`;
    
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `Hace ${minutes} min`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `Hace ${hours} h`;
    
    return date.toLocaleString('es-ES', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
}

function clearHistoryLocal() {
    if (confirm("¿Estás seguro de que deseas limpiar el historial local? Esto no afectará la base de datos Supabase.")) {
        localStorage.removeItem('canchapro_historial');
        fetchAndRenderHistory();
    }
}
