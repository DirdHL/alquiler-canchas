// =======================================================
// Bungalows de Tomayquichua - Client side logic
// Handles: Supabase Sync, Auto-Calculations, FullCalendar
// =======================================================

let dbMode = 'local'; // 'local' or 'supabase'
let supabaseClient = null;
let realtimeChannel = null;
let calendar = null;

// Application State
let bookings = [];
let activeOperator = 'Invitado';

// Constants
const PRICE_WEEKDAY = 160.00; // Lun-Jue
const PRICE_WEEKEND = 180.00; // Vie-Dom
const EXTRA_GUEST_FEE = 35.00; // Costo por 5to adulto o extra (actualizado a S/. 35)

// Initialize Page
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Initialize Lucide Icons
    lucide.createIcons();

    // 2. Set Up Event Listeners
    setupEventListeners();

    // 3. Load Active Operator
    loadOperatorSession();

    // 4. Initialize Database
    await initDatabase();

    // 5. Initialize Calendar
    initCalendar();

    // 6. Load Initial Data
    await fetchBookings();
});

// Load Operator Session
function loadOperatorSession() {
    const savedOperator = localStorage.getItem('canchapro_user_name');
    if (savedOperator) {
        activeOperator = savedOperator;
        document.getElementById('displayUserName').textContent = activeOperator;
    } else {
        openModal('modalUserOnboarding');
    }
}

// Set Up Event Listeners
function setupEventListeners() {
    // Navigation / Sidebars
    document.getElementById('btnToggleSidebar').addEventListener('click', toggleSidebar);
    document.getElementById('btnCloseSidebar').addEventListener('click', toggleSidebar);
    document.getElementById('sidebarBackdrop').addEventListener('click', toggleSidebar);

    // Modal triggers
    document.getElementById('btnNewReservation').addEventListener('click', () => openBookingModal());
    document.getElementById('btnCloseBooking').addEventListener('click', () => closeModal('modalBooking'));
    document.getElementById('btnOpenSettings').addEventListener('click', () => openSettingsModal());
    document.getElementById('btnCloseSettings').addEventListener('click', () => closeModal('modalSettings'));
    document.getElementById('btnOpenHistory').addEventListener('click', () => openHistoryModal());
    document.getElementById('btnCloseHistory').addEventListener('click', () => closeModal('modalHistory'));
    document.getElementById('btnOpenStats').addEventListener('click', () => openStatsAuthModal());
    document.getElementById('btnCloseStatsAuth').addEventListener('click', () => closeModal('modalStatsAuth'));
    document.getElementById('btnCloseStatsModal').addEventListener('click', () => closeModal('modalStats'));

    // Forms
    document.getElementById('formUserOnboarding').addEventListener('submit', handleOnboarding);
    document.getElementById('formSettings').addEventListener('submit', handleSaveSettings);
    document.getElementById('btnTestSupabase').addEventListener('click', testSupabaseConnection);
    document.getElementById('formBooking').addEventListener('submit', handleSaveBooking);
    document.getElementById('btnDeleteBooking').addEventListener('click', handleDeleteBooking);
    document.getElementById('btnCopyReservation').addEventListener('click', copyReservationDetails);
    document.getElementById('formStatsAuth').addEventListener('submit', handleStatsAuth);

    // Profile Edit
    document.getElementById('btnEditUser').addEventListener('click', () => {
        const currentName = localStorage.getItem('canchapro_user_name') || '';
        document.getElementById('onboardingName').value = currentName;
        openModal('modalUserOnboarding');
    });

    // Dynamic field change triggers for calculations
    const calcFields = [
        'bookingCheckIn', 'bookingCheckOut', 'bookingHorario',
        'bookingAdults', 'bookingNinosGratis', 'bookingNinosPagantes',
        'bookingHorasExtras', 'bookingAdicionalHoras',
        'bookingCuatrimoto', 'bookingCuatrimotoMonto',
        'bookingTotal', 'bookingAdelanto'
    ];
    calcFields.forEach(id => {
        document.getElementById(id).addEventListener('input', runDynamicCalculations);
        document.getElementById(id).addEventListener('change', runDynamicCalculations);
    });

    // Handle ATV count change to pre-populate ATV price
    document.getElementById('bookingCuatrimoto').addEventListener('change', (e) => {
        const count = parseInt(e.target.value) || 0;
        const priceInput = document.getElementById('bookingCuatrimotoMonto');
        // Pre-fill with S/. 50 per ATV, editable
        priceInput.value = count * 50;
        runDynamicCalculations();
    });

    // Handle schedule change (Full Day vs Dia y Noche)
    document.getElementById('bookingHorario').addEventListener('change', (e) => {
        const horario = e.target.value;
        const checkIn = document.getElementById('bookingCheckIn').value;
        const checkOutInput = document.getElementById('bookingCheckOut');
        
        if (horario === 'Full Day') {
            // Full Day check-out is the same day
            if (checkIn) {
                checkOutInput.value = checkIn;
                checkOutInput.disabled = true;
            }
        } else {
            // Día y Noche check-out is next day by default
            checkOutInput.disabled = false;
            if (checkIn) {
                const checkInDate = new Date(checkIn + 'T00:00:00');
                checkInDate.setDate(checkInDate.getDate() + 1);
                checkOutInput.value = checkInDate.toISOString().split('T')[0];
            }
        }
        runDynamicCalculations();
    });

    // When check-in changes, auto-set check-out based on Horario
    document.getElementById('bookingCheckIn').addEventListener('change', (e) => {
        const checkIn = e.target.value;
        const horario = document.getElementById('bookingHorario').value;
        const checkOutInput = document.getElementById('bookingCheckOut');
        
        if (checkIn) {
            if (horario === 'Full Day') {
                checkOutInput.value = checkIn;
                checkOutInput.disabled = true;
            } else {
                const checkInDate = new Date(checkIn + 'T00:00:00');
                checkInDate.setDate(checkInDate.getDate() + 1);
                checkOutInput.value = checkInDate.toISOString().split('T')[0];
            }
        }
        runDynamicCalculations();
    });

    // Split Payment visibility
    document.getElementById('bookingPaymentType').addEventListener('change', (e) => {
        const splitRow = document.getElementById('splitPaymentRow');
        if (e.target.value === 'Dividido') {
            splitRow.classList.remove('hidden');
            // Pre-fill values
            const total = parseFloat(document.getElementById('bookingTotal').value) || 0;
            document.getElementById('splitEfectivo').value = (total / 2).toFixed(2);
            document.getElementById('splitYape').value = (total / 2).toFixed(2);
        } else {
            splitRow.classList.add('hidden');
        }
    });

    // Handle dynamic custom inputs for Contact Source and Advisor
    document.getElementById('bookingSource').addEventListener('change', (e) => {
        const customGroup = document.getElementById('customSourceGroup');
        const customInput = document.getElementById('bookingSourceCustom');
        if (e.target.value === 'Otro') {
            customGroup.classList.remove('hidden');
            customInput.required = true;
        } else {
            customGroup.classList.add('hidden');
            customInput.required = false;
            customInput.value = '';
        }
    });

    document.getElementById('bookingNotes').addEventListener('change', (e) => {
        const customGroup = document.getElementById('customAsesorGroup');
        const customInput = document.getElementById('bookingNotesCustom');
        if (e.target.value === 'Otro') {
            customGroup.classList.remove('hidden');
            customInput.required = true;
        } else {
            customGroup.classList.add('hidden');
            customInput.required = false;
            customInput.value = '';
        }
    });

    // Block / Maintenance checkbox handler
    document.getElementById('bookingIsBlock').addEventListener('change', (e) => {
        const isBlock = e.target.checked;
        const nameField = document.getElementById('bookingName');
        const groupClientInfo = document.getElementById('groupClientInfo');
        const rowClientDetails = document.getElementById('rowClientDetails');
        const rowOccupancy = document.getElementById('rowOccupancy');
        const rowExtras = document.getElementById('rowExtras');
        const rowCuatrimoto = document.getElementById('rowCuatrimoto');
        const rowMedioPago = document.getElementById('rowMedioPago');
        const splitPaymentRow = document.getElementById('splitPaymentRow');

        if (isBlock) {
            nameField.value = 'Mantenimiento / Fuera de Servicio';
            nameField.required = false;
            groupClientInfo.style.display = 'none';
            rowClientDetails.style.display = 'none';
            rowOccupancy.style.display = 'none';
            rowExtras.style.display = 'none';
            rowCuatrimoto.style.display = 'none';
            rowMedioPago.style.display = 'none';
            splitPaymentRow.classList.add('hidden');
            
            // Set prices to 0
            document.getElementById('bookingTotal').value = 0;
            document.getElementById('bookingAdelanto').value = 0;
        } else {
            nameField.value = '';
            nameField.required = true;
            groupClientInfo.style.display = 'block';
            rowClientDetails.style.display = 'flex';
            rowOccupancy.style.display = 'flex';
            rowExtras.style.display = 'flex';
            rowCuatrimoto.style.display = 'flex';
            rowMedioPago.style.display = 'flex';
            
            if (document.getElementById('bookingPaymentType').value === 'Dividido') {
                splitPaymentRow.classList.remove('hidden');
            }
        }
        runDynamicCalculations();
    });

    // Calendar filters
    const bungalowsFilters = ['filterB1', 'filterB2', 'filterB3', 'filterB4', 'filterB5', 'filterB6'];
    bungalowsFilters.forEach(id => {
        document.getElementById(id).addEventListener('change', () => {
            if (calendar) {
                calendar.refetchEvents();
                updateDailySummaryList();
            }
        });
    });

    // Modal Stats Tab triggers
    const tabButtons = document.querySelectorAll('.stats-tabs .tab-btn');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            tabButtons.forEach(b => {
                b.classList.remove('active');
                b.style.color = 'var(--text-secondary)';
                b.style.borderBottom = 'none';
                b.style.fontWeight = '500';
            });
            e.target.classList.add('active');
            e.target.style.color = 'var(--primary)';
            e.target.style.borderBottom = '2px solid var(--primary)';
            e.target.style.fontWeight = '600';

            const targetTab = e.target.getAttribute('data-tab');
            document.querySelectorAll('.tab-content').forEach(content => {
                content.style.display = 'none';
            });
            document.getElementById(targetTab).style.display = 'block';
        });
    });
}

// Onboarding Form Handler
function handleOnboarding(e) {
    e.preventDefault();
    const name = document.getElementById('onboardingName').value.trim();
    if (name) {
        localStorage.setItem('canchapro_user_name', name);
        activeOperator = name;
        document.getElementById('displayUserName').textContent = name;
        closeModal('modalUserOnboarding');
        logSessionActivity(`Sesión iniciada como asesor: ${name}`);
    }
}

// Toggle mobile sidebar
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    sidebar.classList.toggle('active');
    backdrop.classList.toggle('active');
}

// Modal helper controls
function openModal(id) {
    document.getElementById(id).classList.add('active');
    document.body.classList.add('no-scroll');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
    document.body.classList.remove('no-scroll');
}

// Open booking modal in CREATE mode
function openBookingModal(dateStr = null) {
    const form = document.getElementById('formBooking');
    form.reset();
    document.getElementById('bookingId').value = '';
    document.getElementById('modalTitle').textContent = 'Nueva Reserva de Bungalow';
    document.getElementById('btnDeleteBooking').classList.add('hidden');
    document.getElementById('bookingIsBlock').checked = false;

    // Reset visibility variables
    document.getElementById('groupClientInfo').style.display = 'block';
    document.getElementById('rowClientDetails').style.display = 'flex';
    document.getElementById('rowOccupancy').style.display = 'flex';
    document.getElementById('rowExtras').style.display = 'flex';
    document.getElementById('rowCuatrimoto').style.display = 'flex';
    document.getElementById('rowMedioPago').style.display = 'flex';
    document.getElementById('splitPaymentRow').classList.add('hidden');
    document.getElementById('customSourceGroup').classList.add('hidden');
    document.getElementById('customAsesorGroup').classList.add('hidden');

    // Prepopulate inputs
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const checkInVal = dateStr || todayStr;
    document.getElementById('bookingCheckIn').value = checkInVal;
    
    // Trigger schedule logic
    document.getElementById('bookingHorario').value = 'Día y Noche';
    document.getElementById('bookingCheckOut').disabled = false;
    const checkInDate = new Date(checkInVal + 'T00:00:00');
    checkInDate.setDate(checkInDate.getDate() + 1);
    document.getElementById('bookingCheckOut').value = checkInDate.toISOString().split('T')[0];

    // Prepopulate operator
    const savedNotes = document.getElementById('bookingNotes');
    let hasOperatorOption = false;
    for (let i = 0; i < savedNotes.options.length; i++) {
        if (savedNotes.options[i].value === activeOperator) {
            savedNotes.selectedIndex = i;
            hasOperatorOption = true;
            break;
        }
    }
    if (!hasOperatorOption) {
        savedNotes.value = 'Otro';
        document.getElementById('customAsesorGroup').classList.remove('hidden');
        document.getElementById('bookingNotesCustom').value = activeOperator;
        document.getElementById('bookingNotesCustom').required = true;
    }

    runDynamicCalculations();
    openModal('modalBooking');
}

// Open booking modal in EDIT mode
function openBookingEditModal(booking) {
    document.getElementById('modalTitle').textContent = 'Editar Reserva';
    document.getElementById('bookingId').value = booking.id;
    document.getElementById('btnDeleteBooking').classList.remove('hidden');

    const isBlock = booking.estado_reserva === 'Bloqueado';
    document.getElementById('bookingIsBlock').checked = isBlock;

    // Load inputs
    document.getElementById('bookingName').value = booking.nombre_cliente || '';
    document.getElementById('bookingDni').value = booking.dni_cliente || '';
    const phoneInput = document.getElementById('bookingPhone');
    if (phoneInput) phoneInput.value = booking.telefono_cliente || '';
    document.getElementById('bookingBungalow').value = booking.bungalow_numero;
    document.getElementById('bookingHorario').value = booking.horario;
    document.getElementById('bookingCheckIn').value = booking.fecha_ingreso;
    document.getElementById('bookingCheckOut').value = booking.fecha_salida;
    document.getElementById('bookingAdults').value = booking.adultos;
    document.getElementById('bookingNinosGratis').value = booking.ninos_gratis;
    document.getElementById('bookingNinosPagantes').value = booking.ninos_pagantes;
    document.getElementById('bookingHorasExtras').value = booking.horas_extras;
    document.getElementById('bookingAdicionalHoras').value = booking.adicional_horas;
    document.getElementById('bookingCuatrimoto').value = booking.alquiler_cuatrimoto;
    document.getElementById('bookingCuatrimotoMonto').value = booking.cuatrimoto_monto;
    document.getElementById('bookingTotal').value = booking.monto_total;
    document.getElementById('bookingAdelanto').value = booking.monto_adelanto;
    document.getElementById('bookingPaymentType').value = booking.tipo_pago;
    document.getElementById('bookingComment').value = booking.notas || '';

    // Handle divided payment
    if (booking.tipo_pago === 'Dividido') {
        document.getElementById('splitPaymentRow').classList.remove('hidden');
        document.getElementById('splitEfectivo').value = booking.monto_efectivo || 0;
        document.getElementById('splitYape').value = booking.monto_yape || 0;
    } else {
        document.getElementById('splitPaymentRow').classList.add('hidden');
    }

    // Handle source of contact
    const sourceSelect = document.getElementById('bookingSource');
    let hasSource = false;
    for (let i = 0; i < sourceSelect.options.length; i++) {
        if (sourceSelect.options[i].value === booking.medio_contacto) {
            sourceSelect.selectedIndex = i;
            hasSource = true;
            break;
        }
    }
    if (!hasSource && booking.medio_contacto) {
        sourceSelect.value = 'Otro';
        document.getElementById('customSourceGroup').classList.remove('hidden');
        document.getElementById('bookingSourceCustom').value = booking.medio_contacto;
        document.getElementById('bookingSourceCustom').required = true;
    } else {
        document.getElementById('customSourceGroup').classList.add('hidden');
    }

    // Handle operator
    const notesSelect = document.getElementById('bookingNotes');
    let hasNotes = false;
    for (let i = 0; i < notesSelect.options.length; i++) {
        if (notesSelect.options[i].value === booking.asesor_registro) {
            notesSelect.selectedIndex = i;
            hasNotes = true;
            break;
        }
    }
    if (!hasNotes && booking.asesor_registro) {
        notesSelect.value = 'Otro';
        document.getElementById('customAsesorGroup').classList.remove('hidden');
        document.getElementById('bookingNotesCustom').value = booking.asesor_registro;
        document.getElementById('bookingNotesCustom').required = true;
    } else {
        document.getElementById('customAsesorGroup').classList.add('hidden');
    }

    // Disable check-out if Full Day
    if (booking.horario === 'Full Day') {
        document.getElementById('bookingCheckOut').disabled = true;
    } else {
        document.getElementById('bookingCheckOut').disabled = false;
    }

    // Trigger UI visibility changes based on isBlock
    const groupClientInfo = document.getElementById('groupClientInfo');
    const rowClientDetails = document.getElementById('rowClientDetails');
    const rowOccupancy = document.getElementById('rowOccupancy');
    const rowExtras = document.getElementById('rowExtras');
    const rowCuatrimoto = document.getElementById('rowCuatrimoto');
    const rowMedioPago = document.getElementById('rowMedioPago');

    if (isBlock) {
        groupClientInfo.style.display = 'none';
        rowClientDetails.style.display = 'none';
        rowOccupancy.style.display = 'none';
        rowExtras.style.display = 'none';
        rowCuatrimoto.style.display = 'none';
        rowMedioPago.style.display = 'none';
        document.getElementById('splitPaymentRow').classList.add('hidden');
    } else {
        groupClientInfo.style.display = 'block';
        rowClientDetails.style.display = 'flex';
        rowOccupancy.style.display = 'flex';
        rowExtras.style.display = 'flex';
        rowCuatrimoto.style.display = 'flex';
        rowMedioPago.style.display = 'flex';
    }

    runDynamicCalculations();
    openModal('modalBooking');
}

// ----------------------------------------------------
// Calculations Engine
// ----------------------------------------------------
function calculateNights(checkInStr, checkOutStr, horario) {
    if (!checkInStr || !checkOutStr) return 0;
    if (horario === 'Full Day') return 1; // Full day counts as 1 day

    const start = new Date(checkInStr + 'T00:00:00');
    const end = new Date(checkOutStr + 'T00:00:00');
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays || 1;
}

function calculateBasePrice(checkInStr, checkOutStr, horario) {
    if (!checkInStr || !checkOutStr) return 0;
    const start = new Date(checkInStr + 'T00:00:00');
    
    if (horario === 'Full Day') {
        const dayOfWeek = start.getDay(); // 0 = Sunday, 5 = Friday, 6 = Saturday
        const isWeekend = (dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6);
        return isWeekend ? PRICE_WEEKEND : PRICE_WEEKDAY;
    } else {
        const end = new Date(checkOutStr + 'T00:00:00');
        let totalBase = 0;
        let current = new Date(start);
        
        while (current < end) {
            const dayOfWeek = current.getDay();
            const isWeekend = (dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6);
            totalBase += isWeekend ? PRICE_WEEKEND : PRICE_WEEKDAY;
            current.setDate(current.getDate() + 1);
        }
        
        if (totalBase === 0) {
            const dayOfWeek = start.getDay();
            const isWeekend = (dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6);
            totalBase = isWeekend ? PRICE_WEEKEND : PRICE_WEEKDAY;
        }
        return totalBase;
    }
}

// Main Dynamic Calculation function
function runDynamicCalculations() {
    const isBlock = document.getElementById('bookingIsBlock').checked;
    
    const breakdownBase = document.getElementById('breakdownBase');
    const breakdownGuests = document.getElementById('breakdownGuests');
    const breakdownExtras = document.getElementById('breakdownExtras');
    const breakdownAdvance = document.getElementById('breakdownAdvance');
    const breakdownRemaining = document.getElementById('breakdownRemaining');
    const totalInput = document.getElementById('bookingTotal');
    const adelantoInput = document.getElementById('bookingAdelanto');

    if (isBlock) {
        // Block is free
        breakdownBase.textContent = 'S/. 0.00';
        breakdownGuests.textContent = 'S/. 0.00';
        breakdownExtras.textContent = 'S/. 0.00';
        breakdownAdvance.textContent = 'S/. 0.00';
        breakdownRemaining.textContent = 'S/. 0.00';
        totalInput.value = 0;
        adelantoInput.value = 0;
        return;
    }

    const checkIn = document.getElementById('bookingCheckIn').value;
    const checkOut = document.getElementById('bookingCheckOut').value;
    const horario = document.getElementById('bookingHorario').value;

    const adults = parseInt(document.getElementById('bookingAdults').value) || 0;
    const ninosGratis = parseInt(document.getElementById('bookingNinosGratis').value) || 0;
    const ninosPagantes = parseInt(document.getElementById('bookingNinosPagantes').value) || 0;

    const extraHours = parseInt(document.getElementById('bookingHorasExtras').value) || 0;
    const extraHoursPrice = parseFloat(document.getElementById('bookingAdicionalHoras').value) || 0;
    
    const cuatrimotosCount = parseInt(document.getElementById('bookingCuatrimoto').value) || 0;
    const cuatrimotosMonto = parseFloat(document.getElementById('bookingCuatrimotoMonto').value) || 0;

    // 1. Calculate Nights/Days
    const nights = calculateNights(checkIn, checkOut, horario);

    // 2. Base Price
    const basePrice = calculateBasePrice(checkIn, checkOut, horario);

    // 3. Guests Occupancy Math
    // Standard capacity: 4 people.
    // 1 child under 7 is free (doesn't count toward the capacity).
    // The rest (Adults + remaining free kids > 1 + pagantes) counts toward capacity.
    const freeKidsOverLimit = Math.max(0, ninosGratis - 1);
    const totalCountForCapacity = adults + freeKidsOverLimit + ninosPagantes;
    const extraGuests = Math.max(0, totalCountForCapacity - 4);
    const guestsFee = extraGuests * EXTRA_GUEST_FEE * nights;

    // 4. Extras (Hours + Cuatrimotos)
    // Note: extraHoursPrice is the total extra hours amount already entered by the user
    const extrasTotal = extraHoursPrice + cuatrimotosMonto;

    // 5. Total
    const calculatedTotal = basePrice + guestsFee + extrasTotal;

    // Update form Total value ONLY if it's not manually overwritten or if it's a new calculate
    // We let the input change trigger, but if the user has active focus on bookingTotal, don't overwrite it immediately
    if (document.activeElement !== totalInput) {
        totalInput.value = calculatedTotal.toFixed(2);
    }

    const finalTotal = parseFloat(totalInput.value) || 0;
    const adelanto = finalTotal; // Siempre se paga completo por adelantado
    adelantoInput.value = finalTotal.toFixed(2);
    const remaining = 0;

    // Render Display Elements
    breakdownBase.textContent = `S/. ${basePrice.toFixed(2)}`;
    breakdownGuests.textContent = `S/. ${guestsFee.toFixed(2)}`;
    breakdownExtras.textContent = `S/. ${extrasTotal.toFixed(2)}`;
    breakdownAdvance.textContent = `S/. ${adelanto.toFixed(2)}`;
    
    breakdownRemaining.textContent = `S/. ${remaining.toFixed(2)}`;
    breakdownRemaining.style.color = '#34d399'; // Green/Mint

    // Auto-balance split payments if active
    if (document.getElementById('bookingPaymentType').value === 'Dividido') {
        const splitEfectivo = document.getElementById('splitEfectivo');
        const splitYape = document.getElementById('splitYape');
        if (document.activeElement !== splitEfectivo && document.activeElement !== splitYape) {
            splitEfectivo.value = (finalTotal / 2).toFixed(2);
            splitYape.value = (finalTotal / 2).toFixed(2);
        }
    }
}

// ----------------------------------------------------
// Database Sincronización
// ----------------------------------------------------
async function initDatabase() {
    const url = localStorage.getItem('canchapro_supabase_url');
    const key = localStorage.getItem('canchapro_supabase_key');

    if (url && key) {
        try {
            // Test reachability first
            const reachable = await checkSupabaseReachable(url);
            if (reachable) {
                supabaseClient = supabase.createClient(url, key);
                dbMode = 'supabase';
                
                const statusDot = document.getElementById('statusDot');
                statusDot.className = 'status-dot connected';
                document.getElementById('statusText').textContent = 'Conectado a la Nube (Supabase)';
                document.getElementById('statusDesc').textContent = 'Las reservas de Bungalows se sincronizan automáticamente en tiempo real.';
                
                setupRealtimeListener();
                return;
            }
        } catch (e) {
            console.error("Fallo al inicializar Supabase client:", e);
        }
    }

    // Local fallback status
    dbMode = 'local';
    const statusDot = document.getElementById('statusDot');
    statusDot.className = 'status-dot disconnected';
    document.getElementById('statusText').textContent = 'Modo Local (Sin Conexión)';
    document.getElementById('statusDesc').textContent = 'Los datos se guardan en este navegador. Configura la base de datos para compartir con otros asesores.';
}

async function checkSupabaseReachable(url) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000); // 4s timeout
        const res = await fetch(`${url}/rest/v1/`, { method: 'OPTIONS', signal: controller.signal });
        clearTimeout(timeoutId);
        return res.ok || res.status === 401; // 401 unauthorized is fine (means API reachable)
    } catch (e) {
        return false;
    }
}

function setupRealtimeListener() {
    if (!supabaseClient) return;

    if (realtimeChannel) {
        supabaseClient.removeChannel(realtimeChannel);
    }

    realtimeChannel = supabaseClient.channel('realtime_db_bungalows')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reservas_bungalows' }, async (payload) => {
            console.log("Cambio en base de datos recibido en tiempo real:", payload);
            await fetchBookings();
        })
        .subscribe();
}

// Fetch all bookings
async function fetchBookings() {
    if (dbMode === 'supabase' && supabaseClient) {
        try {
            const { data, error } = await supabaseClient
                .from('reservas_bungalows')
                .select('*')
                .order('fecha_ingreso', { ascending: true });
            
            if (error) throw error;
            bookings = data || [];
        } catch (err) {
            console.error("Fallo al obtener de Supabase, usando respaldo local:", err);
            loadLocalBookingsFallback();
        }
    } else {
        loadLocalBookingsFallback();
    }

    // Refresh views
    if (calendar) {
        calendar.refetchEvents();
    }
    updateDailySummaryList();
    updateDashboardStats();
}

function loadLocalBookingsFallback() {
    const raw = localStorage.getItem('canchapro_reservas_bungalows');
    bookings = raw ? JSON.parse(raw) : [];
}

function saveLocalBookingsFallback() {
    localStorage.setItem('canchapro_reservas_bungalows', JSON.stringify(bookings));
}

// ----------------------------------------------------
// Save / Update / Delete Booking Handlers
// ----------------------------------------------------
async function handleSaveBooking(e) {
    e.preventDefault();
    document.getElementById('bookingError').textContent = '';

    const id = document.getElementById('bookingId').value;
    const isBlock = document.getElementById('bookingIsBlock').checked;
    const bungalow = parseInt(document.getElementById('bookingBungalow').value);
    const checkIn = document.getElementById('bookingCheckIn').value;
    const checkOut = document.getElementById('bookingCheckOut').value;
    const horario = document.getElementById('bookingHorario').value;

    // Check collisions / overlaps
    const collides = checkBookingCollision(id, bungalow, checkIn, checkOut, horario);
    if (collides) {
        document.getElementById('bookingError').textContent = '⚠️ Conflicto de Fechas: El Bungalow seleccionado ya cuenta con una reserva en ese rango de fechas y horario.';
        return;
    }

    // Build data payload
    let source = document.getElementById('bookingSource').value;
    if (source === 'Otro') {
        source = document.getElementById('bookingSourceCustom').value.trim() || 'Otro';
    }

    let notes = document.getElementById('bookingNotes').value;
    if (notes === 'Otro') {
        notes = document.getElementById('bookingNotesCustom').value.trim() || 'Otro';
    }

    const payload = {
        bungalow_numero: bungalow,
        fecha_ingreso: checkIn,
        fecha_salida: checkOut,
        horario: horario,
        estado_reserva: isBlock ? 'Bloqueado' : 'Confirmado',
        notas: document.getElementById('bookingComment').value.trim(),
        asesor_registro: notes,
        monto_total: parseFloat(document.getElementById('bookingTotal').value) || 0,
        monto_adelanto: parseFloat(document.getElementById('bookingAdelanto').value) || 0,
        tipo_pago: document.getElementById('bookingPaymentType').value,
        monto_efectivo: parseFloat(document.getElementById('splitEfectivo').value) || 0,
        monto_yape: parseFloat(document.getElementById('splitYape').value) || 0
    };

    if (isBlock) {
        payload.nombre_cliente = 'Mantenimiento';
        payload.dni_cliente = '';
        payload.telefono_cliente = '';
        payload.adultos = 0;
        payload.ninos_gratis = 0;
        payload.ninos_pagantes = 0;
        payload.precio_base = 0;
        payload.adicional_personas = 0;
        payload.horas_extras = 0;
        payload.adicional_horas = 0;
        payload.alquiler_cuatrimoto = 0;
        payload.cuatrimoto_monto = 0;
    } else {
        payload.nombre_cliente = document.getElementById('bookingName').value.trim();
        payload.dni_cliente = document.getElementById('bookingDni').value.trim();
        const phoneInput = document.getElementById('bookingPhone');
        payload.telefono_cliente = phoneInput ? phoneInput.value.trim() : '';
        payload.adultos = parseInt(document.getElementById('bookingAdults').value) || 4;
        payload.ninos_gratis = parseInt(document.getElementById('bookingNinosGratis').value) || 0;
        payload.ninos_pagantes = parseInt(document.getElementById('bookingNinosPagantes').value) || 0;
        payload.precio_base = calculateBasePrice(checkIn, checkOut, horario);
        
        // Calculate guests fee
        const nights = calculateNights(checkIn, checkOut, horario);
        const freeKidsOverLimit = Math.max(0, payload.ninos_gratis - 1);
        const totalCapacityCount = payload.adultos + freeKidsOverLimit + payload.ninos_pagantes;
        const extraGuests = Math.max(0, totalCapacityCount - 4);
        payload.adicional_personas = extraGuests * EXTRA_GUEST_FEE * nights;

        payload.horas_extras = parseInt(document.getElementById('bookingHorasExtras').value) || 0;
        payload.adicional_horas = parseFloat(document.getElementById('bookingAdicionalHoras').value) || 0;
        payload.alquiler_cuatrimoto = parseInt(document.getElementById('bookingCuatrimoto').value) || 0;
        payload.cuatrimoto_monto = parseFloat(document.getElementById('bookingCuatrimotoMonto').value) || 0;
        payload.medio_contacto = source;
    }

    if (dbMode === 'supabase' && supabaseClient) {
        try {
            let error;
            if (id) {
                // Update
                const { error: err } = await supabaseClient
                    .from('reservas_bungalows')
                    .update(payload)
                    .eq('id', id);
                error = err;
                logSessionActivity(`Reserva ${id} actualizada para: ${payload.nombre_cliente}`);
            } else {
                // Insert
                const { error: err } = await supabaseClient
                    .from('reservas_bungalows')
                    .insert([payload]);
                error = err;
                logSessionActivity(`Nueva reserva creada para: ${payload.nombre_cliente}`);
            }
            if (error) throw error;
        } catch (err) {
            console.error("Error al guardar en Supabase:", err);
            document.getElementById('bookingError').textContent = 'Error al sincronizar con el servidor: ' + err.message;
            return;
        }
    } else {
        // Local Save
        if (id) {
            const index = bookings.findIndex(b => b.id === id);
            if (index !== -1) {
                bookings[index] = { ...bookings[index], ...payload };
            }
            logSessionActivity(`Reserva local ${id} editada.`);
        } else {
            payload.id = 'local_' + Date.now();
            payload.created_at = new Date().toISOString();
            bookings.push(payload);
            logSessionActivity(`Nueva reserva local creada para: ${payload.nombre_cliente}`);
        }
        saveLocalBookingsFallback();
    }

    closeModal('modalBooking');
    await fetchBookings();
}

async function handleDeleteBooking() {
    const id = document.getElementById('bookingId').value;
    if (!id) return;

    if (!confirm('¿Estás seguro de que deseas eliminar esta reserva de bungalow?')) return;

    if (dbMode === 'supabase' && supabaseClient) {
        try {
            const { error } = await supabaseClient
                .from('reservas_bungalows')
                .delete()
                .eq('id', id);
            if (error) throw error;
            logSessionActivity(`Reserva ${id} eliminada de la base de datos.`);
        } catch (err) {
            console.error("Error al eliminar de Supabase:", err);
            alert("No se pudo eliminar de la base de datos: " + err.message);
            return;
        }
    } else {
        bookings = bookings.filter(b => b.id !== id);
        saveLocalBookingsFallback();
        logSessionActivity(`Reserva local ${id} eliminada.`);
    }

    closeModal('modalBooking');
    await fetchBookings();
}

// Collision Check logic
function checkBookingCollision(id, bungalow, checkIn, checkOut, horario) {
    const startNew = new Date(checkIn + 'T00:00:00');
    const endNew = new Date(checkOut + 'T00:00:00');

    return bookings.some(b => {
        // Exclude the current booking itself if editing
        if (b.id === id) return false;
        
        // Only check same bungalow
        if (b.bungalow_numero !== bungalow) return false;

        const startOld = new Date(b.fecha_ingreso + 'T00:00:00');
        const endOld = new Date(b.fecha_salida + 'T00:00:00');

        // Date overlap check
        // Formule: (StartA <= EndB) and (EndA >= StartB)
        const dateOverlap = (startNew < endOld) && (endNew > startOld);
        
        if (dateOverlap) {
            // Overlap check for horario/shift:
            // Full Day: 9am - 6pm
            // Dia y Noche: 3pm - 12pm
            // If they are on the same day, they only collide if:
            // 1. One is Dia y Noche (starts 3pm) and another is Full Day (ends 6pm) on the same day:
            //    Yes! 3pm to 6pm is an overlap.
            // 2. Both are Full Day: Yes.
            // 3. Both are Dia y Noche: Yes.
            
            return true;
        }
        return false;
    });
}

// ----------------------------------------------------
// UI Renderers & Helpers
// ----------------------------------------------------
function initCalendar() {
    const calendarEl = document.getElementById('calendar');
    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        locale: 'es',
        firstDay: 1, // Lunes
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,listMonth'
        },
        editable: false,
        selectable: true,
        events: function (info, successCallback, failureCallback) {
            // Format state bookings into FullCalendar events
            const fcEvents = bookings.map(b => {
                const isBlocked = b.estado_reserva === 'Bloqueado';
                let title = isBlocked 
                    ? `🔒 B${b.bungalow_numero} BLOQUEADO` 
                    : `B${b.bungalow_numero}: ${b.nombre_cliente} (${b.horario})`;
                
                // For FullCalendar display, the end date is exclusive.
                // We add 1 day to the checkout date so it highlights the grid cell correctly.
                const checkOutDate = new Date(b.fecha_salida + 'T00:00:00');
                checkOutDate.setDate(checkOutDate.getDate() + 1);
                const exclusiveCheckOutStr = checkOutDate.toISOString().split('T')[0];

                return {
                    id: b.id,
                    title: title,
                    start: b.fecha_ingreso,
                    end: b.horario === 'Full Day' ? b.fecha_ingreso : exclusiveCheckOutStr,
                    allDay: true,
                    className: isBlocked ? 'event-bungalow-blocked' : `event-bungalow-${b.bungalow_numero}`,
                    extendedProps: b
                };
            });

            // Filter out disabled bungalows from the sidebar filters
            const filteredEvents = fcEvents.filter(event => {
                const bNo = event.extendedProps.bungalow_numero;
                return document.getElementById(`filterB${bNo}`).checked;
            });

            successCallback(filteredEvents);
        },
        select: function (info) {
            // Multi-day selection triggers booking modal creation
            const startStr = info.startStr;
            // FullCalendar select's endStr is exclusive. We subtract 1 day to get inclusive check-out
            const endInclusive = new Date(info.endStr);
            endInclusive.setDate(endInclusive.getDate() - 1);
            const endStr = endInclusive.toISOString().split('T')[0];

            openBookingModal(startStr);
            
            // Check if selection spans multiple days
            if (startStr !== endStr) {
                document.getElementById('bookingHorario').value = 'Día y Noche';
                document.getElementById('bookingCheckOut').disabled = false;
                document.getElementById('bookingCheckOut').value = info.endStr; // Exclusive end date works as check-out day
            }
            runDynamicCalculations();
        },
        eventClick: function (info) {
            const booking = info.event.extendedProps;
            openBookingEditModal(booking);
        }
    });

    calendar.render();
}

// Update "Huéspedes para Hoy" Resumen Diario
function updateDailySummaryList() {
    const listEl = document.getElementById('dailySummaryList');
    listEl.innerHTML = '';

    const today = new Date();
    const todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    document.getElementById('summaryDateLabel').textContent = today.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

    // Find bookings that cover today
    const activeToday = bookings.filter(b => {
        // Filter by checkbox filters
        if (!document.getElementById(`filterB${b.bungalow_numero}`).checked) return false;

        const start = new Date(b.fecha_ingreso + 'T00:00:00');
        const end = new Date(b.fecha_salida + 'T00:00:00');
        const current = new Date(todayStr + 'T00:00:00');

        return (current >= start && current <= end);
    });

    if (activeToday.length === 0) {
        listEl.innerHTML = '<p class="no-activity" style="width: 100%; text-align: center; color: var(--text-muted); padding: 20px;">No hay huéspedes registrados en bungalows para hoy.</p>';
        return;
    }

    activeToday.forEach(b => {
        const isBlocked = b.estado_reserva === 'Bloqueado';
        const card = document.createElement('div');
        card.className = 'summary-item-card';

        const checkInFormatted = new Date(b.fecha_ingreso + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
        const checkOutFormatted = new Date(b.fecha_salida + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

        if (isBlocked) {
            card.innerHTML = `
                <div class="summary-item-header">
                    <span class="summary-item-time" style="color: var(--text-muted);">MANTENIMIENTO</span>
                    <span class="summary-item-court bungalow-badge-blocked">Bungalow ${b.bungalow_numero}</span>
                </div>
                <div class="summary-item-client">Fuera de Servicio</div>
                <div class="summary-item-details">
                    <span class="summary-detail-tag">
                        <i data-lucide="calendar"></i> ${checkInFormatted} al ${checkOutFormatted}
                    </span>
                </div>
            `;
        } else {
            card.innerHTML = `
                <div class="summary-item-header">
                    <span class="summary-item-time">${b.horario}</span>
                    <span class="summary-item-court bungalow-badge-${b.bungalow_numero}">Bungalow ${b.bungalow_numero}</span>
                </div>
                <div class="summary-item-client">${b.nombre_cliente}</div>
                <div class="summary-item-details">
                    <span class="summary-detail-tag">
                        <i data-lucide="calendar"></i> ${checkInFormatted} al ${checkOutFormatted}
                    </span>
                    <span class="summary-detail-tag">
                        <i data-lucide="users"></i> ${b.adultos} Ad. / ${b.ninos_gratis + b.ninos_pagantes} Ni.
                    </span>
                    ${b.alquiler_cuatrimoto > 0 ? `
                        <span class="summary-detail-tag" style="color: #f59e0b; font-weight: 600;">
                            <i data-lucide="activity"></i> ${b.alquiler_cuatrimoto} Moto(s)
                        </span>
                    ` : ''}
                </div>
                <div class="summary-item-header" style="margin-top: 6px; border-top: 1px solid rgba(255, 255, 255, 0.05); padding-top: 8px;">
                    <span style="font-size: 11px; color: var(--text-muted);">Asesor: ${b.asesor_registro}</span>
                </div>
            `;
        }

        // Click card to edit
        card.addEventListener('click', () => openBookingEditModal(b));
        listEl.appendChild(card);
    });

    lucide.createIcons();
}

// Update Dashboard Sidebar stats
function updateDashboardStats() {
    const today = new Date();
    const todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');

    // 1. Bungalows occupied today
    const occupiedToday = bookings.filter(b => {
        const start = new Date(b.fecha_ingreso + 'T00:00:00');
        const end = new Date(b.fecha_salida + 'T00:00:00');
        const current = new Date(todayStr + 'T00:00:00');
        return (current >= start && current <= end && b.estado_reserva !== 'Bloqueado');
    });
    // Deduplicate by bungalow number
    const uniqueOccupied = new Set(occupiedToday.map(b => b.bungalow_numero));
    document.getElementById('statTodayOccupied').textContent = `${uniqueOccupied.size} / 6`;

    // 2. Today's expected income (sum of base price + guest fees + extras of bookings active today, pro-rated by total stay length)
    let totalTodayIncome = 0;
    bookings.forEach(b => {
        if (b.estado_reserva === 'Bloqueado') return;
        const start = new Date(b.fecha_ingreso + 'T00:00:00');
        const end = new Date(b.fecha_salida + 'T00:00:00');
        const current = new Date(todayStr + 'T00:00:00');

        if (current >= start && current <= end) {
            const nights = calculateNights(b.fecha_ingreso, b.fecha_salida, b.horario);
            // Pro-rate total amount by days
            totalTodayIncome += b.monto_total / (nights || 1);
        }
    });
    document.getElementById('statTodayIncome').textContent = `S/. ${totalTodayIncome.toFixed(2)}`;

    // 3. Total bookings this month
    const thisMonth = today.getMonth(); // 0-11
    const thisYear = today.getFullYear();
    const monthBookings = bookings.filter(b => {
        const start = new Date(b.fecha_ingreso + 'T00:00:00');
        return (start.getMonth() === thisMonth && start.getFullYear() === thisYear);
    });
    document.getElementById('statMonthReservations').textContent = monthBookings.length;
}

// ----------------------------------------------------
// Share Booking Info / Copy Reservation
// ----------------------------------------------------
function copyReservationDetails() {
    const isBlock = document.getElementById('bookingIsBlock').checked;
    if (isBlock) {
        alert("No se pueden copiar los detalles de un bloqueo.");
        return;
    }

    const bungalow = document.getElementById('bookingBungalow').value;
    const name = document.getElementById('bookingName').value.trim();
    const checkIn = document.getElementById('bookingCheckIn').value;
    const checkOut = document.getElementById('bookingCheckOut').value;
    const horario = document.getElementById('bookingHorario').value;
    const adults = document.getElementById('bookingAdults').value;
    const kids = parseInt(document.getElementById('bookingNinosGratis').value || 0) + parseInt(document.getElementById('bookingNinosPagantes').value || 0);

    const total = parseFloat(document.getElementById('bookingTotal').value) || 0;
    const paymentType = document.getElementById('bookingPaymentType').value;
    const source = document.getElementById('bookingSource').value;
    
    const cuatrimotos = parseInt(document.getElementById('bookingCuatrimoto').value) || 0;
    const horasExtras = parseInt(document.getElementById('bookingHorasExtras').value) || 0;

    const formattedIn = new Date(checkIn + 'T00:00:00').toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });
    const formattedOut = new Date(checkOut + 'T00:00:00').toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });

    let msg = `🏡 *RESERVA DE BUNGALOW DE TOMAYQUICHUA* 🏡\n\n`;
    msg += `👤 *Huésped:* ${name}\n`;
    msg += `🔢 *Bungalow:* N° ${bungalow}\n`;
    msg += `📅 *Fecha Ingreso:* ${formattedIn}\n`;
    msg += `📅 *Fecha Salida:* ${formattedOut}\n`;
    msg += `⏰ *Turno:* ${horario}\n`;
    msg += `👥 *Ocupantes:* ${adults} adultos / ${kids} niños\n`;
    
    if (cuatrimotos > 0) {
        msg += `🏍️ *Cuatrimotos:* ${cuatrimotos} alquilada(s)\n`;
    }
    if (horasExtras > 0) {
        msg += `⏰ *Horas extras:* ${horasExtras} hora(s)\n`;
    }

    msg += `\n💵 *Monto Total (Cancelado):* S/. ${total.toFixed(2)}\n`;
    msg += `💳 *Método de Pago:* ${paymentType}\n`;
    msg += `ℹ️ *Canal:* ${source}\n\n`;
    msg += `¡Te esperamos! Sigue con Bungalows de Tomayquichua ✨`;

    navigator.clipboard.writeText(msg).then(() => {
        alert("¡Detalles de reserva copiados al portapapeles! Listo para pegar en WhatsApp.");
    }).catch(e => {
        console.error("Fallo al copiar texto:", e);
        alert("Error al copiar texto: " + e);
    });
}

// ----------------------------------------------------
// Statistics Dashboard Engine
// ----------------------------------------------------
function openStatsAuthModal() {
    const isUnlocked = localStorage.getItem('canchapro_stats_unlocked') === 'true';
    if (isUnlocked) {
        loadStatsDashboard();
    } else {
        document.getElementById('statsPassword').value = '';
        document.getElementById('statsAuthError').style.display = 'none';
        openModal('modalStatsAuth');
    }
}

function handleStatsAuth(e) {
    e.preventDefault();
    const pwd = document.getElementById('statsPassword').value;
    // Standard system stats password matches other sections (e.g. Reservasupabase)
    if (pwd === 'Reservasupabase') {
        localStorage.setItem('canchapro_stats_unlocked', 'true');
        closeModal('modalStatsAuth');
        loadStatsDashboard();
    } else {
        const errorEl = document.getElementById('statsAuthError');
        errorEl.textContent = '❌ Contraseña incorrecta. Solicítela al administrador.';
        errorEl.style.display = 'block';
    }
}

function loadStatsDashboard() {
    openModal('modalStats');

    const today = new Date();
    const thisMonth = today.getMonth();
    const thisYear = today.getFullYear();

    // 1. Gather bookings this month
    const monthBookings = bookings.filter(b => {
        if (b.estado_reserva === 'Bloqueado') return false;
        const start = new Date(b.fecha_ingreso + 'T00:00:00');
        return (start.getMonth() === thisMonth && start.getFullYear() === thisYear);
    });

    // 2. Calculations
    let totalRevenue = 0;
    let depositoTotal = 0;
    let otrosTotal = 0;

    // Per bungalow stats map
    const bungalowStats = {
        1: { count: 0, revenue: 0, motos: 0, daysOccupied: 0 },
        2: { count: 0, revenue: 0, motos: 0, daysOccupied: 0 },
        3: { count: 0, revenue: 0, motos: 0, daysOccupied: 0 },
        4: { count: 0, revenue: 0, motos: 0, daysOccupied: 0 },
        5: { count: 0, revenue: 0, motos: 0, daysOccupied: 0 },
        6: { count: 0, revenue: 0, motos: 0, daysOccupied: 0 }
    };

    // Client counts map
    const clientsMap = {};

    monthBookings.forEach(b => {
        totalRevenue += b.monto_total;
        
        // Split payment calculations
        if (b.tipo_pago === 'Depósito') {
            depositoTotal += b.monto_total;
        } else if (b.tipo_pago === 'Yape' || b.tipo_pago === 'Efectivo') {
            otrosTotal += b.monto_total;
        } else if (b.tipo_pago === 'Dividido') {
            depositoTotal += b.monto_efectivo || 0;
            otrosTotal += b.monto_yape || 0;
        }

        // Bungalow specific stats
        const bNo = b.bungalow_numero;
        if (bungalowStats[bNo]) {
            bungalowStats[bNo].count++;
            bungalowStats[bNo].revenue += b.monto_total;
            bungalowStats[bNo].motos += b.alquiler_cuatrimoto || 0;
            
            const nights = calculateNights(b.fecha_ingreso, b.fecha_salida, b.horario);
            bungalowStats[bNo].daysOccupied += nights;
        }

        // Clients directory compiling
        const clientKey = b.dni_cliente ? b.dni_cliente.trim() : b.nombre_cliente.trim();
        if (clientKey) {
            if (!clientsMap[clientKey]) {
                clientsMap[clientKey] = {
                    nombre: b.nombre_cliente,
                    dni: b.dni_cliente || 'N/A',
                    phone: b.telefono_cliente || 'N/A',
                    count: 0
                };
            }
            clientsMap[clientKey].count++;
        }
    });

    // Populate Top overview cards
    document.getElementById('statsIncomeMonth').textContent = `S/. ${totalRevenue.toFixed(2)}`;
    document.getElementById('statsCountMonth').textContent = `${monthBookings.length} reservas registradas`;
    document.getElementById('statsDepositoMonth').textContent = `S/. ${depositoTotal.toFixed(2)}`;
    document.getElementById('statsOtrosMonth').textContent = `S/. ${otrosTotal.toFixed(2)}`;

    // Populate Report Table
    const tableBody = document.querySelector('#tableStatsReport tbody');
    tableBody.innerHTML = '';
    
    for (let i = 1; i <= 6; i++) {
        const stats = bungalowStats[i];
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid var(--border-color)';
        tr.innerHTML = `
            <td style="padding: 12px 16px; font-weight: 600; color: white;">Bungalow ${i}</td>
            <td style="padding: 12px 16px;">${stats.count} reservas</td>
            <td style="padding: 12px 16px; font-weight: 700; color: #34d399;">S/. ${stats.revenue.toFixed(2)}</td>
            <td style="padding: 12px 16px;">${stats.motos} moto(s)</td>
        `;
        tableBody.appendChild(tr);
    }

    // Populate Occupancy Bars
    // Days in current month
    const totalDaysInMonth = new Date(thisYear, thisMonth + 1, 0).getDate();
    const occupancyContainer = document.getElementById('ocupacionContainer');
    occupancyContainer.innerHTML = '';

    for (let i = 1; i <= 6; i++) {
        const stats = bungalowStats[i];
        const percent = Math.min(100, Math.round((stats.daysOccupied / totalDaysInMonth) * 100));
        
        const row = document.createElement('div');
        row.innerHTML = `
            <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 4px;">
                <span style="font-weight: 600;">Bungalow ${i}</span>
                <span style="color: var(--text-secondary);">${stats.daysOccupied} días ocupados (${percent}%)</span>
            </div>
            <div style="width: 100%; height: 8px; background: rgba(255,255,255,0.05); border-radius: 4px; overflow: hidden;">
                <div style="width: ${percent}%; height: 100%; background: linear-gradient(90deg, #f59e0b, #fbbf24); border-radius: 4px;"></div>
            </div>
        `;
        occupancyContainer.appendChild(row);
    }

    // Populate Clients Directory Table
    const tableClientsBody = document.querySelector('#tableStatsClients tbody');
    tableClientsBody.innerHTML = '';
    
    const clientsList = Object.values(clientsMap).sort((a, b) => b.count - a.count);
    if (clientsList.length === 0) {
        tableClientsBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 20px;">No hay directorio compilado este mes.</td></tr>';
    } else {
        clientsList.forEach(c => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid var(--border-color)';
            tr.innerHTML = `
                <td style="padding: 12px 16px; font-weight: 600; color: white;">${c.nombre}</td>
                <td style="padding: 12px 16px;">${c.dni}</td>
                <td style="padding: 12px 16px;">${c.phone}</td>
                <td style="padding: 12px 16px; font-weight: 700; color: #fbbf24;">${c.count} reserva(s)</td>
            `;
            tableClientsBody.appendChild(tr);
        });
    }
}

// ----------------------------------------------------
// Settings & Config Modal Handlers
// ----------------------------------------------------
function openSettingsModal() {
    const url = localStorage.getItem('canchapro_supabase_url') || '';
    const key = localStorage.getItem('canchapro_supabase_key') || '';
    document.getElementById('supabaseUrl').value = url;
    document.getElementById('supabaseKey').value = key;
    document.getElementById('settingsFeedback').textContent = '';
    openModal('modalSettings');
}

async function handleSaveSettings(e) {
    e.preventDefault();
    const url = document.getElementById('supabaseUrl').value.trim();
    const key = document.getElementById('supabaseKey').value.trim();
    const feedback = document.getElementById('settingsFeedback');

    feedback.textContent = '⏳ Conectando con Supabase...';
    feedback.style.color = '#fbbf24';

    try {
        const reachable = await checkSupabaseReachable(url);
        if (reachable) {
            localStorage.setItem('canchapro_supabase_url', url);
            localStorage.setItem('canchapro_supabase_key', key);
            feedback.textContent = '✅ Credenciales válidas. Conexión establecida.';
            feedback.style.color = '#34d399';
            
            setTimeout(() => {
                closeModal('modalSettings');
                // Reboot database connection
                initDatabase().then(() => fetchBookings());
            }, 1000);
        } else {
            throw new Error("No se pudo alcanzar el servidor REST de Supabase. Revisa la URL.");
        }
    } catch (err) {
        feedback.textContent = '❌ Fallo en la conexión: ' + err.message;
        feedback.style.color = '#ef4444';
    }
}

async function testSupabaseConnection() {
    const url = document.getElementById('supabaseUrl').value.trim();
    const key = document.getElementById('supabaseKey').value.trim();
    const feedback = document.getElementById('settingsFeedback');

    if (!url || !key) {
        feedback.textContent = '❌ Ingrese ambos campos para probar.';
        feedback.style.color = '#ef4444';
        return;
    }

    feedback.textContent = '⏳ Probando conexión...';
    feedback.style.color = '#fbbf24';

    try {
        const reachable = await checkSupabaseReachable(url);
        if (reachable) {
            feedback.textContent = '✅ Conexión exitosa. El servidor responde correctamente.';
            feedback.style.color = '#34d399';
        } else {
            feedback.textContent = '❌ No se pudo alcanzar el servidor. Compruebe la URL.';
            feedback.style.color = '#ef4444';
        }
    } catch (e) {
        feedback.textContent = '❌ Fallo en la conexión: ' + e.message;
        feedback.style.color = '#ef4444';
    }
}

// ----------------------------------------------------
// History logger (session scoped)
// ----------------------------------------------------
const sessionLogs = [];
function logSessionActivity(msg) {
    const time = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    sessionLogs.unshift({ time, msg });
    
    // Add to local audit log table if in Supabase
    saveAuditTrailToDb(msg);
}

async function saveAuditTrailToDb(actionDetails) {
    if (dbMode === 'supabase' && supabaseClient) {
        try {
            await supabaseClient.from('historial').insert([{
                action: 'bungalows',
                user_name: activeOperator,
                details: actionDetails
            }]);
        } catch (e) {
            console.warn("Fallo al escribir en tabla historial:", e);
        }
    }
}

function openHistoryModal() {
    const container = document.getElementById('activityList');
    container.innerHTML = '';
    
    if (sessionLogs.length === 0) {
        container.innerHTML = '<p class="no-activity">No hay actividad registrada en esta sesión.</p>';
    } else {
        sessionLogs.forEach(log => {
            const p = document.createElement('p');
            p.style.fontSize = '13px';
            p.style.borderBottom = '1px solid rgba(255,255,255,0.03)';
            p.style.padding = '8px 0';
            p.innerHTML = `<span style="color: var(--primary); font-weight:700; margin-right: 8px;">[${log.time}]</span> ${log.msg}`;
            container.appendChild(p);
        });
    }
    openModal('modalHistory');
}
