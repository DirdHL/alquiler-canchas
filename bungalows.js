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
let activeAdvisorsList = [];
let isTotalManuallyEdited = false;
let selectedDate = new Date();

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

    // En DNI solo se pueden poner numeros
    const bookingDni = document.getElementById('bookingDni');
    if (bookingDni) {
        bookingDni.addEventListener('input', function () {
            this.value = this.value.replace(/[^0-9]/g, '');
        });
    }

    // Dynamic field change triggers for calculations
    const calcFields = [
        'bookingCheckIn', 'bookingCheckOut', 'bookingHorario',
        'bookingAdicionales', 'bookingNinoPequeno',
        'bookingHorasExtras', 'bookingAdicionalHoras',
        'bookingTotal', 'bookingAdelanto', 'bookingPendiente'
    ];
    calcFields.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', runDynamicCalculations);
            el.addEventListener('change', runDynamicCalculations);
        }
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

    const selectAsesor = document.getElementById('bookingNotes');
    if (selectAsesor) {
        selectAsesor.addEventListener('change', async () => {
            if (selectAsesor.value === '_add_new_') {
                await handleAddAsesor(selectAsesor);
            } else if (selectAsesor.value === '_delete_') {
                await handleDeleteAsesor(selectAsesor);
            }
        });
    }

    // Block / Maintenance checkbox handler
    document.getElementById('bookingIsBlock').addEventListener('change', (e) => {
        const isBlock = e.target.checked;
        const nameField = document.getElementById('bookingName');
        const groupClientInfo = document.getElementById('groupClientInfo');
        const rowClientDetails = document.getElementById('rowClientDetails');
        const rowOccupancy = document.getElementById('rowOccupancy');
        const rowExtras = document.getElementById('rowExtras');
        const rowMedioPago = document.getElementById('rowMedioPago');
        const splitPaymentRow = document.getElementById('splitPaymentRow');

        if (isBlock) {
            nameField.value = 'Mantenimiento / Fuera de Servicio';
            nameField.required = false;
            document.getElementById('bookingDni').required = false;
            groupClientInfo.style.display = 'none';
            rowClientDetails.style.display = 'none';
            rowOccupancy.style.display = 'none';
            rowExtras.style.display = 'none';
            rowMedioPago.style.display = 'none';
            splitPaymentRow.classList.add('hidden');

            // Set prices to 0
            document.getElementById('bookingTotal').value = 0;
            document.getElementById('bookingAdelanto').value = 0;
            document.getElementById('bookingPendiente').value = 0;
        } else {
            nameField.value = '';
            nameField.required = true;
            document.getElementById('bookingDni').required = true;
            groupClientInfo.style.display = 'block';
            rowClientDetails.style.display = 'flex';
            rowOccupancy.style.display = 'flex';
            rowExtras.style.display = 'flex';
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
                updateAvailabilityGrid();
            }
        });
    });

    // Daily Summary Tabs switching (same as polideportivo)
    const btnTabReservations = document.getElementById('btnTabReservations');
    const btnTabAvailability = document.getElementById('btnTabAvailability');
    const tabReservationsContent = document.getElementById('tabReservationsContent');
    const tabAvailabilityContent = document.getElementById('tabAvailabilityContent');

    if (btnTabReservations && btnTabAvailability) {
        btnTabReservations.addEventListener('click', () => {
            btnTabReservations.classList.add('active');
            btnTabAvailability.classList.remove('active');
            if (tabReservationsContent) tabReservationsContent.style.display = 'block';
            if (tabAvailabilityContent) tabAvailabilityContent.style.display = 'none';
        });

        btnTabAvailability.addEventListener('click', () => {
            btnTabAvailability.classList.add('active');
            btnTabReservations.classList.remove('active');
            if (tabReservationsContent) tabReservationsContent.style.display = 'none';
            if (tabAvailabilityContent) {
                tabAvailabilityContent.style.display = 'block';
                updateAvailabilityGrid();
            }
        });
    }

    // Custom Bungalow Checkbox Grid Selection & Sincronización (Selección Múltiple)
    const chkList = document.querySelectorAll('input[name="bungalowSelect"]');
    chkList.forEach(chk => {
        chk.addEventListener('change', function () {
            // Obtener todos los seleccionados
            const selected = Array.from(document.querySelectorAll('input[name="bungalowSelect"]:checked')).map(c => c.value);
            // Sincronizar el select oculto con el primer valor seleccionado (o vacío si ninguno)
            document.getElementById('bookingBungalow').value = selected.length > 0 ? selected[0] : '';
            // Actualizar límite de niños
            updateNinosLimit();
            // Forzar recálculo financiero
            runDynamicCalculations();
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

    // Restablecer el bloqueo de total manual si cambian fechas, horario o bungalows
    const resetFields = ['bookingCheckIn', 'bookingCheckOut', 'bookingHorario'];
    resetFields.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', () => {
                isTotalManuallyEdited = false;
            });
        }
    });

    const bungalowSelects = document.querySelectorAll('input[name="bungalowSelect"]');
    bungalowSelects.forEach(chk => {
        chk.addEventListener('change', () => {
            isTotalManuallyEdited = false;
        });
    });

    // Detectar edición manual del total
    const totalInputEl = document.getElementById('bookingTotal');
    if (totalInputEl) {
        totalInputEl.addEventListener('input', () => {
            isTotalManuallyEdited = true;
            runDynamicCalculations();
        });
    }

    // Availability grid controls
    const gridDatePicker = document.getElementById('gridDatePicker');
    if (gridDatePicker) {
        gridDatePicker.addEventListener('change', (e) => {
            const newDateVal = e.target.value;
            if (newDateVal) {
                selectedDate = new Date(newDateVal + 'T00:00:00');
                if (calendar) calendar.gotoDate(selectedDate);
                updateDailySummaryList();
                updateAvailabilityGrid();
            }
        });
    }

    const btnGridToday = document.getElementById('btnGridToday');
    if (btnGridToday) {
        btnGridToday.addEventListener('click', () => {
            selectedDate = new Date();
            if (calendar) calendar.gotoDate(selectedDate);
            updateDailySummaryList();
            updateAvailabilityGrid();
        });
    }

    const btnGridPrevWeek = document.getElementById('btnGridPrevWeek');
    if (btnGridPrevWeek) {
        btnGridPrevWeek.addEventListener('click', () => {
            const activeDate = getActiveDate();
            activeDate.setDate(activeDate.getDate() - 7);
            selectedDate = new Date(activeDate);
            if (calendar) calendar.gotoDate(selectedDate);
            updateDailySummaryList();
            updateAvailabilityGrid();
        });
    }

    const btnGridNextWeek = document.getElementById('btnGridNextWeek');
    if (btnGridNextWeek) {
        btnGridNextWeek.addEventListener('click', () => {
            const activeDate = getActiveDate();
            activeDate.setDate(activeDate.getDate() + 7);
            selectedDate = new Date(activeDate);
            if (calendar) calendar.gotoDate(selectedDate);
            updateDailySummaryList();
            updateAvailabilityGrid();
        });
    }
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
    sidebar.classList.toggle('open');
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

// Update limit for kids under 7 based on selected bungalows
function updateNinosLimit() {
    const selectedCount = document.querySelectorAll('input[name="bungalowSelect"]:checked').length;
    const ninosInput = document.getElementById('bookingNinoPequeno');
    if (ninosInput) {
        const maxVal = Math.max(1, selectedCount);
        ninosInput.max = maxVal;
        
        // Clamp current value if it exceeds maxVal
        const currentVal = parseInt(ninosInput.value) || 0;
        if (currentVal > maxVal) {
            ninosInput.value = maxVal;
        }

        const helpEl = document.getElementById('bookingNinosHelp');
        if (helpEl) {
            helpEl.textContent = `Máximo ${maxVal} niño(s) (${selectedCount} bungalow(s) seleccionado(s)).`;
        }
    }
}

// Open booking modal in CREATE mode
function openBookingModal(dateStr = null) {
    isTotalManuallyEdited = false;
    const form = document.getElementById('formBooking');
    form.reset();
    document.getElementById('bookingId').value = '';
    document.getElementById('modalTitle').textContent = 'Nueva Reserva de Bungalow';
    document.getElementById('btnDeleteBooking').classList.add('hidden');
    document.getElementById('bookingIsBlock').checked = false;

    // Reset custom checkboxes selection
    const chkList = document.querySelectorAll('input[name="bungalowSelect"]');
    chkList.forEach(chk => {
        chk.checked = false;
        chk.disabled = false;
        const card = chk.closest('.bungalow-card');
        if (card) {
            card.classList.remove('disabled');
            const statusBadge = card.querySelector('.bungalow-status');
            if (statusBadge) {
                statusBadge.textContent = 'Disponible';
                statusBadge.className = 'bungalow-status available';
            }
        }
    });
    document.getElementById('bookingBungalow').value = '';
    document.getElementById('bookingPendiente').value = '';
    updateNinosLimit();

    // Clear error
    const errorEl = document.getElementById('bookingError');
    errorEl.textContent = '';
    errorEl.style.display = 'none';

    // Reset visibility variables
    document.getElementById('groupClientInfo').style.display = 'block';
    document.getElementById('rowClientDetails').style.display = 'flex';
    document.getElementById('rowOccupancy').style.display = 'flex';
    document.getElementById('rowExtras').style.display = 'flex';
    document.getElementById('rowMedioPago').style.display = 'flex';
    document.getElementById('splitPaymentRow').classList.add('hidden');
    document.getElementById('customSourceGroup').classList.add('hidden');
    document.getElementById('bookingName').required = true;
    document.getElementById('bookingDni').required = true;

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

    // Prepopulate operator dynamically
    populateAsesoresDropdown('');

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

    // Clear error
    const errorEl = document.getElementById('bookingError');
    errorEl.textContent = '';
    errorEl.style.display = 'none';

    // Load inputs
    document.getElementById('bookingName').value = booking.nombre_cliente || '';
    document.getElementById('bookingDni').value = booking.dni_cliente || '';
    const phoneInput = document.getElementById('bookingPhone');
    if (phoneInput) phoneInput.value = booking.telefono_cliente || '';
    document.getElementById('bookingBungalow').value = booking.bungalow_numero;

    // Set matching checkbox in grid
    const bungalowNo = booking.bungalow_numero;
    const chkList = document.querySelectorAll('input[name="bungalowSelect"]');
    chkList.forEach(chk => {
        chk.checked = (parseInt(chk.value) === bungalowNo);
    });

    updateNinosLimit();

    document.getElementById('bookingHorario').value = booking.horario;
    document.getElementById('bookingCheckIn').value = booking.fecha_ingreso;
    document.getElementById('bookingCheckOut').value = booking.fecha_salida;
    const totalGuests = (booking.adultos || 4) + (booking.ninos_pagantes || 0);
    const adicionales = Math.max(0, totalGuests - 4);
    document.getElementById('bookingAdicionales').value = adicionales;
    document.getElementById('bookingNinoPequeno').value = booking.ninos_gratis || 0;
    document.getElementById('bookingHorasExtras').value = booking.horas_extras;
    document.getElementById('bookingAdicionalHoras').value = booking.adicional_horas;
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
    let medio = booking.medio_contacto || '';
    if (medio === 'WhatsApp') {
        medio = 'Estado WSP';
    }
    let hasSource = false;
    for (let i = 0; i < sourceSelect.options.length; i++) {
        if (sourceSelect.options[i].value === medio) {
            sourceSelect.selectedIndex = i;
            hasSource = true;
            break;
        }
    }
    if (!hasSource && medio) {
        sourceSelect.value = 'Otro';
        document.getElementById('customSourceGroup').classList.remove('hidden');
        document.getElementById('bookingSourceCustom').value = medio;
        document.getElementById('bookingSourceCustom').required = true;
    } else {
        document.getElementById('customSourceGroup').classList.add('hidden');
    }

    // Handle operator dynamically
    populateAsesoresDropdown(booking.asesor_registro || '');

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
    const rowMedioPago = document.getElementById('rowMedioPago');

    if (isBlock) {
        groupClientInfo.style.display = 'none';
        rowClientDetails.style.display = 'none';
        rowOccupancy.style.display = 'none';
        rowExtras.style.display = 'none';
        rowMedioPago.style.display = 'none';
        document.getElementById('splitPaymentRow').classList.add('hidden');
        document.getElementById('bookingName').required = false;
        document.getElementById('bookingDni').required = false;
    } else {
        groupClientInfo.style.display = 'block';
        rowClientDetails.style.display = 'flex';
        rowOccupancy.style.display = 'flex';
        rowExtras.style.display = 'flex';
        rowMedioPago.style.display = 'flex';
        document.getElementById('bookingName').required = true;
        document.getElementById('bookingDni').required = true;
    }

    // Determinar si el total guardado es un total editado manualmente (descuento/acuerdo)
    const calcBase = calculateBasePrice(booking.fecha_ingreso, booking.fecha_salida, booking.horario);
    const nights = calculateNights(booking.fecha_ingreso, booking.fecha_salida, booking.horario);
    const calcGuests = adicionales * EXTRA_GUEST_FEE * nights;
    const calcExtras = booking.adicional_horas || 0;
    const expectedCalculatedTotal = calcBase + calcGuests + calcExtras;

    if (Math.abs(booking.monto_total - expectedCalculatedTotal) > 0.01) {
        isTotalManuallyEdited = true;
    } else {
        isTotalManuallyEdited = false;
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

    const adicionales = parseInt(document.getElementById('bookingAdicionales').value) || 0;

    const extraHours = parseInt(document.getElementById('bookingHorasExtras').value) || 0;
    const extraHoursPrice = parseFloat(document.getElementById('bookingAdicionalHoras').value) || 0;

    const cuatrimotosCount = 0;
    const cuatrimotosMonto = 0;

    // Obtener cantidad de bungalows seleccionados
    const selectedBungalows = Array.from(document.querySelectorAll('input[name="bungalowSelect"]:checked')).map(c => parseInt(c.value));
    const numBungalows = Math.max(1, selectedBungalows.length);

    // 1. Calculate Nights/Days
    const nights = calculateNights(checkIn, checkOut, horario);

    // 2. Base Price (Multiplicado por cantidad de bungalows)
    const basePrice = calculateBasePrice(checkIn, checkOut, horario) * numBungalows;

    // 3. Guests Occupancy Math
    // Standard capacity: 4 people.
    // Additional guests are charged S/. 35 each per night.
    const guestsFee = adicionales * EXTRA_GUEST_FEE * nights;

    // 4. Extras (Hours + Cuatrimotos)
    // Note: extraHoursPrice is the total extra hours amount already entered by the user
    const extrasTotal = extraHoursPrice + cuatrimotosMonto;

    // 5. Total
    const calculatedTotal = basePrice + guestsFee + extrasTotal;

    // Update form Total value ONLY if it's not manually overwritten or if it's a new calculate
    if (!isTotalManuallyEdited && document.activeElement !== totalInput) {
        totalInput.value = calculatedTotal.toFixed(2);
    }

    const finalTotal = parseFloat(totalInput.value) || 0;
    const pendienteInput = document.getElementById('bookingPendiente');

    let adelantoVal = parseFloat(adelantoInput.value);
    let pendienteVal = parseFloat(pendienteInput.value);

    // If both are empty, NaN, or 0, keep them at 0
    const isAdelantoZeroOrEmpty = isNaN(adelantoVal) || adelantoVal === 0 || adelantoInput.value === '';
    const isPendienteZeroOrEmpty = isNaN(pendienteVal) || pendienteVal === 0 || pendienteInput.value === '';

    if (document.activeElement === pendienteInput) {
        if (isNaN(pendienteVal)) pendienteVal = 0;
        adelantoVal = Math.max(0, finalTotal - pendienteVal);
        adelantoInput.value = adelantoVal.toFixed(2);
    } else if (document.activeElement === adelantoInput) {
        if (isNaN(adelantoVal)) adelantoVal = 0;
        pendienteVal = Math.max(0, finalTotal - adelantoVal);
        pendienteInput.value = pendienteVal.toFixed(2);
    } else {
        if (isAdelantoZeroOrEmpty && isPendienteZeroOrEmpty) {
            adelantoVal = 0;
            pendienteVal = 0;
        } else {
            if (isNaN(adelantoVal)) adelantoVal = 0;
            if (adelantoVal > finalTotal) {
                adelantoVal = finalTotal;
            }
            pendienteVal = Math.max(0, finalTotal - adelantoVal);
        }
        adelantoInput.value = adelantoVal.toFixed(2);
        pendienteInput.value = pendienteVal.toFixed(2);
    }

    const adelanto = adelantoVal;
    const remaining = pendienteVal;

    // Render Display Elements
    breakdownBase.textContent = `S/. ${basePrice.toFixed(2)}`;
    breakdownGuests.textContent = `S/. ${guestsFee.toFixed(2)}`;
    breakdownExtras.textContent = `S/. ${extrasTotal.toFixed(2)}`;
    breakdownAdvance.textContent = `S/. ${adelanto.toFixed(2)}`;

    breakdownRemaining.textContent = `S/. ${remaining.toFixed(2)}`;
    breakdownRemaining.style.color = remaining > 0 ? '#ef4444' : '#34d399'; // Green/Mint

    // Auto-balance split payments if active
    if (document.getElementById('bookingPaymentType').value === 'Dividido') {
        const splitEfectivo = document.getElementById('splitEfectivo');
        const splitYape = document.getElementById('splitYape');
        if (document.activeElement !== splitEfectivo && document.activeElement !== splitYape) {
            splitEfectivo.value = (finalTotal / 2).toFixed(2);
            splitYape.value = (finalTotal / 2).toFixed(2);
        }
    }

    // Call bungalow availability check dynamically
    updateBungalowAvailability();
}

// ----------------------------------------------------
// Calculations Engine Helpers: Availability check
// ----------------------------------------------------
function updateBungalowAvailability() {
    const bookingId = document.getElementById('bookingId').value;
    const checkIn = document.getElementById('bookingCheckIn').value;
    const checkOut = document.getElementById('bookingCheckOut').value;
    const horario = document.getElementById('bookingHorario').value;
    const extraHours = parseInt(document.getElementById('bookingHorasExtras').value) || 0;

    const chkList = document.querySelectorAll('input[name="bungalowSelect"]');
    const hasDates = checkIn && checkOut && horario;

    chkList.forEach(chk => {
        const bungalowNo = parseInt(chk.value);
        const card = chk.closest('.bungalow-card');
        const statusBadge = card.querySelector('.bungalow-status');

        if (hasDates) {
            const conflict = checkBookingCollision(bookingId, bungalowNo, checkIn, checkOut, horario, extraHours);
            if (conflict) {
                card.classList.add('disabled');
                chk.disabled = true;
                statusBadge.textContent = 'Ocupado';
                statusBadge.className = 'bungalow-status occupied';

                // If it was checked and it is now conflicting, uncheck it
                if (chk.checked) {
                    chk.checked = false;
                    document.getElementById('bookingBungalow').value = '';
                }
            } else {
                card.classList.remove('disabled');
                chk.disabled = false;
                statusBadge.textContent = 'Disponible';
                statusBadge.className = 'bungalow-status available';
            }
        } else {
            card.classList.remove('disabled');
            chk.disabled = false;
            statusBadge.textContent = 'Disponible';
            statusBadge.className = 'bungalow-status available';
        }
    });

    // Make sure Lucide icons are refreshed/rendered for the check icons inside custom checkbox boxes
    if (window.lucide && typeof lucide.createIcons === 'function') {
        lucide.createIcons();
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

                // Fetch active advisors list
                await fetchAdvisors();

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

    // Fetch active advisors list
    fetchAdvisors();
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
        .on('postgres_changes', { event: '*', schema: 'public', table: 'personal_asesores' }, async () => {
            // Refetch active advisors list when it changes
            await fetchAdvisors();
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
    updateAvailabilityGrid();
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
    const errorEl = document.getElementById('bookingError');
    errorEl.textContent = '';
    errorEl.style.display = 'none';

    const id = document.getElementById('bookingId').value;
    const isBlock = document.getElementById('bookingIsBlock').checked;
    const checkIn = document.getElementById('bookingCheckIn').value;
    const checkOut = document.getElementById('bookingCheckOut').value;
    const horario = document.getElementById('bookingHorario').value;

    // Obtener todos los bungalows seleccionados
    const selectedBungalows = Array.from(document.querySelectorAll('input[name="bungalowSelect"]:checked')).map(c => parseInt(c.value));
    if (selectedBungalows.length === 0) {
        errorEl.textContent = '⚠️ Por favor, seleccione al menos un Bungalow.';
        errorEl.style.display = 'block';
        return;
    }

    const extraHours = parseInt(document.getElementById('bookingHorasExtras').value) || 0;

    // Check collisions / overlaps for all selected bungalows
    let conflictingBooking = null;
    for (const bNo of selectedBungalows) {
        conflictingBooking = checkBookingCollision(id, bNo, checkIn, checkOut, horario, extraHours);
        if (conflictingBooking) break;
    }

    if (conflictingBooking) {
        const clientName = conflictingBooking.estado_reserva === 'Bloqueado'
            ? 'Mantenimiento / Bloqueado'
            : conflictingBooking.nombre_cliente;

        const dateIn = new Date(conflictingBooking.fecha_ingreso + 'T00:00:00');
        const dateOut = new Date(conflictingBooking.fecha_salida + 'T00:00:00');
        const fechaInFormatted = dateIn.toLocaleDateString('es-PE', { day: 'numeric', month: 'short' });
        const fechaOutFormatted = dateOut.toLocaleDateString('es-PE', { day: 'numeric', month: 'short' });

        errorEl.innerHTML = `⚠️ <strong>Conflicto de Reserva:</strong> El Bungalow ${conflictingBooking.bungalow_numero} ya está ocupado por <strong>${clientName}</strong> (${conflictingBooking.horario}) del ${fechaInFormatted} al ${fechaOutFormatted}.`;
        errorEl.style.display = 'block';
        return;
    }

    // Build data payloads
    let source = document.getElementById('bookingSource').value;
    if (source === 'Otro') {
        source = document.getElementById('bookingSourceCustom').value.trim() || 'Otro';
    }

    let notes = document.getElementById('bookingNotes').value;

    const totalCalculado = parseFloat(document.getElementById('bookingTotal').value) || 0;
    const adelantoTotal = parseFloat(document.getElementById('bookingAdelanto').value) || 0;
    const splitEfectivoTotal = parseFloat(document.getElementById('splitEfectivo').value) || 0;
    const splitYapeTotal = parseFloat(document.getElementById('splitYape').value) || 0;

    const adicionales = parseInt(document.getElementById('bookingAdicionales').value) || 0;
    const ninoPequeno = parseInt(document.getElementById('bookingNinoPequeno').value) || 0;
    const extraHoursPrice = parseFloat(document.getElementById('bookingAdicionalHoras').value) || 0;

    const nights = calculateNights(checkIn, checkOut, horario);
    const extrasTotal = extraHoursPrice;

    // Helper to generate the payload for a single bungalow
    function getPayloadForBungalow(bNo, index) {
        const payload = {
            bungalow_numero: bNo,
            fecha_ingreso: checkIn,
            fecha_salida: checkOut,
            horario: horario,
            estado_reserva: isBlock ? 'Bloqueado' : 'Confirmado',
            notas: document.getElementById('bookingComment').value.trim(),
            asesor_registro: notes,
            tipo_pago: document.getElementById('bookingPaymentType').value,
            medio_contacto: source
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
            payload.monto_total = 0;
            payload.monto_adelanto = 0;
            payload.monto_efectivo = 0;
            payload.monto_yape = 0;
        } else {
            payload.nombre_cliente = document.getElementById('bookingName').value.trim();
            payload.dni_cliente = document.getElementById('bookingDni').value.trim();
            const phoneInput = document.getElementById('bookingPhone');
            payload.telefono_cliente = phoneInput ? phoneInput.value.trim() : '';

            // Main reservation gets additional guests/children, standard ones get base capacity
            payload.adultos = 4 + (index === 0 ? adicionales : 0);
            payload.ninos_gratis = (index < ninoPequeno) ? 1 : 0;
            payload.ninos_pagantes = 0;
            payload.precio_base = calculateBasePrice(checkIn, checkOut, horario);
            payload.adicional_personas = (index === 0 ? adicionales * EXTRA_GUEST_FEE * nights : 0);
            payload.horas_extras = (index === 0 ? extraHours : 0);
            payload.adicional_horas = (index === 0 ? extraHoursPrice : 0);
            payload.alquiler_cuatrimoto = 0;
            payload.cuatrimoto_monto = 0;

            const singleTotal = payload.precio_base + payload.adicional_personas + payload.adicional_horas;
            payload.monto_total = singleTotal;

            if (totalCalculado > 0) {
                payload.monto_adelanto = adelantoTotal * (singleTotal / totalCalculado);
            } else {
                payload.monto_adelanto = 0;
            }

            if (payload.tipo_pago === 'Dividido') {
                if (totalCalculado > 0) {
                    payload.monto_efectivo = splitEfectivoTotal * (singleTotal / totalCalculado);
                    payload.monto_yape = splitYapeTotal * (singleTotal / totalCalculado);
                } else {
                    payload.monto_efectivo = 0;
                    payload.monto_yape = 0;
                }
            } else {
                payload.monto_efectivo = 0;
                payload.monto_yape = 0;
            }
        }
        return payload;
    }

    if (dbMode === 'supabase' && supabaseClient) {
        try {
            if (id) {
                // Modo Edición:
                // 1. Actualizar la reserva existente con el primer bungalow
                const firstPayload = getPayloadForBungalow(selectedBungalows[0], 0);
                const { error: updErr } = await supabaseClient
                    .from('reservas_bungalows')
                    .update(firstPayload)
                    .eq('id', id);
                if (updErr) throw updErr;
                logSessionActivity(`Reserva ${id} actualizada para: ${firstPayload.nombre_cliente}`);

                // 2. Si hay más de un bungalow, insertar los adicionales como nuevos
                if (selectedBungalows.length > 1) {
                    const extraPayloads = [];
                    for (let i = 1; i < selectedBungalows.length; i++) {
                        extraPayloads.push(getPayloadForBungalow(selectedBungalows[i], i));
                    }
                    const { error: insErr } = await supabaseClient
                        .from('reservas_bungalows')
                        .insert(extraPayloads);
                    if (insErr) throw insErr;
                    logSessionActivity(`Creadas ${extraPayloads.length} reservas adicionales por edición de grupo.`);
                }
            } else {
                // Modo Creación: Insertar todos los bungalows seleccionados
                const payloads = selectedBungalows.map((bNo, idx) => getPayloadForBungalow(bNo, idx));
                const { error: insErr } = await supabaseClient
                    .from('reservas_bungalows')
                    .insert(payloads);
                if (insErr) throw insErr;
                logSessionActivity(`Nuevas reservas creadas para: ${payloads[0].nombre_cliente} en bungalows [${selectedBungalows.join(', ')}]`);
            }
        } catch (err) {
            console.error("Error al guardar en Supabase:", err);
            errorEl.textContent = 'Error al sincronizar con el servidor: ' + err.message;
            errorEl.style.display = 'block';
            return;
        }
    } else {
        // Local Save Fallback
        if (id) {
            // Modo Edición:
            // 1. Actualizar la reserva actual
            const index = bookings.findIndex(b => b.id === id);
            if (index !== -1) {
                const firstPayload = getPayloadForBungalow(selectedBungalows[0], 0);
                bookings[index] = { ...bookings[index], ...firstPayload };
                logSessionActivity(`Reserva local ${id} editada.`);
            }

            // 2. Insertar bungalows adicionales
            for (let i = 1; i < selectedBungalows.length; i++) {
                const extraPayload = getPayloadForBungalow(selectedBungalows[i], i);
                extraPayload.id = 'local_' + Date.now() + '_' + i;
                extraPayload.created_at = new Date().toISOString();
                bookings.push(extraPayload);
            }
        } else {
            // Modo Creación:
            selectedBungalows.forEach((bNo, idx) => {
                const payload = getPayloadForBungalow(bNo, idx);
                payload.id = 'local_' + Date.now() + '_' + idx;
                payload.created_at = new Date().toISOString();
                bookings.push(payload);
            });
            logSessionActivity(`Nuevas reservas locales creadas para: ${selectedBungalows.join(', ')}`);
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

// Global helper to get the precise start and end datetimes for a booking, including extra hours
function getBookingInterval(checkInStr, checkOutStr, horarioStr, extraHours = 0) {
    let start, end;
    if (horarioStr === 'Full Day') {
        // Full Day: 9:00 AM to 6:00 PM on check-in day
        start = new Date(checkInStr + 'T09:00:00');
        end = new Date(checkInStr + 'T18:00:00');
    } else {
        // Día y Noche: 3:00 PM on check-in day to 12:00 PM on check-out day
        start = new Date(checkInStr + 'T15:00:00');
        end = new Date(checkOutStr + 'T12:00:00');
    }
    
    if (extraHours > 0) {
        end.setHours(end.getHours() + extraHours);
    }
    
    return { start, end };
}

// Collision Check logic
function checkBookingCollision(id, bungalow, checkIn, checkOut, horario, extraHours = 0) {
    const newInterval = getBookingInterval(checkIn, checkOut, horario, extraHours);

    return bookings.find(b => {
        // Exclude the current booking itself if editing
        if (b.id === id) return false;

        // Only check same bungalow
        if (b.bungalow_numero !== bungalow) return false;

        const oldInterval = getBookingInterval(b.fecha_ingreso, b.fecha_salida, b.horario, b.horas_extras || 0);

        // Date overlap check: (StartA < EndB) and (EndA > StartB)
        const overlaps = (newInterval.start < oldInterval.end) && (newInterval.end > oldInterval.start);
        return overlaps;
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
        buttonText: {
            today: 'Hoy',
            month: 'Mes',
            list: 'Lista'
        },
        editable: false,
        selectable: true,
        datesSet: function (info) {
            const currentCalendar = info.view.calendar;
            if (currentCalendar) {
                selectedDate = currentCalendar.getDate();
            }
            updateDailySummaryList();
            updateAvailabilityGrid();
        },
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
                    end: exclusiveCheckOutStr,
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

            // Set active date
            selectedDate = new Date(startStr + 'T00:00:00');
            updateDailySummaryList();
            updateAvailabilityGrid();

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
    if (!listEl) return;
    listEl.innerHTML = '';

    const activeDate = getActiveDate();
    const year = activeDate.getFullYear();
    const month = String(activeDate.getMonth() + 1).padStart(2, '0');
    const day = String(activeDate.getDate()).padStart(2, '0');
    const activeDateStr = `${year}-${month}-${day}`;

    // Display long formatted day in header
    const labelOptions = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
    const formattedLabel = activeDate.toLocaleDateString('es-ES', labelOptions);
    const summaryDateLabel = document.getElementById('summaryDateLabel');
    if (summaryDateLabel) {
        summaryDateLabel.textContent = formattedLabel.charAt(0).toUpperCase() + formattedLabel.slice(1);
    }

    // Find bookings that cover the activeDate
    const activeToday = bookings.filter(b => {
        // Filter by checkbox filters
        const filterEl = document.getElementById(`filterB${b.bungalow_numero}`);
        if (filterEl && !filterEl.checked) return false;

        const start = new Date(b.fecha_ingreso + 'T00:00:00');
        const end = new Date(b.fecha_salida + 'T00:00:00');
        const current = new Date(activeDateStr + 'T00:00:00');

        return (current >= start && current <= end);
    });

    if (activeToday.length === 0) {
        listEl.innerHTML = '<p class="no-activity" style="width: 100%; text-align: center; color: var(--text-muted); padding: 20px;">No hay huéspedes registrados en bungalows para este día.</p>';
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
                        <i data-lucide="users"></i> ${b.adultos || 4} pers.${b.ninos_gratis ? ` + ${b.ninos_gratis} niño(s)` : ''}
                    </span>
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

    if (window.lucide) lucide.createIcons();
}

function getActiveDate() {
    return selectedDate || new Date();
}

// Render interactive bungalow availability grid (7-day view starting on calendar active date)
function updateAvailabilityGrid() {
    if (!calendar) return;
    const tabAvailabilityContent = document.getElementById('tabAvailabilityContent');
    if (!tabAvailabilityContent || tabAvailabilityContent.style.display === 'none') return;

    const activeDate = getActiveDate();
    
    // Sync datepicker value
    const gridDatePicker = document.getElementById('gridDatePicker');
    if (gridDatePicker) {
        const y = activeDate.getFullYear();
        const m = String(activeDate.getMonth() + 1).padStart(2, '0');
        const d = String(activeDate.getDate()).padStart(2, '0');
        gridDatePicker.value = `${y}-${m}-${d}`;
    }

    const yr = activeDate.getFullYear();
    const mo = activeDate.getMonth();
    const dy = activeDate.getDate();

    // Generate 7 consecutive days starting from activeDate
    const daysToShow = 7;
    const dateSlots = [];
    for (let i = 0; i < daysToShow; i++) {
        const d = new Date(yr, mo, dy + i);
        const yStr = d.getFullYear();
        const mStr = String(d.getMonth() + 1).padStart(2, '0');
        const dStr = String(d.getDate()).padStart(2, '0');
        const dateStr = `${yStr}-${mStr}-${dStr}`;

        const dayName = d.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '');
        const dayNum = String(d.getDate()).padStart(2, '0');
        const monthNum = String(d.getMonth() + 1).padStart(2, '0');
        const displayDate = `${dayName.charAt(0).toUpperCase() + dayName.slice(1)} ${dayNum}/${monthNum}`;
        dateSlots.push({
            dateStr: dateStr,
            displayDate: displayDate
        });
    }

    const bungalows = [1, 2, 3, 4, 5, 6];

    let html = '';
    dateSlots.forEach(slot => {
        html += `<tr>`;
        html += `<td style="padding: 10px 16px; font-weight: 600; color: var(--text-primary); border-bottom: 1px solid var(--border-color);">${slot.displayDate}</td>`;

        bungalows.forEach(bNum => {
            const filterEl = document.getElementById(`filterB${bNum}`);
            const isFilterChecked = filterEl ? filterEl.checked : true;
            
            html += `<td style="padding: 6px 8px; border-bottom: 1px solid var(--border-color); vertical-align: top; text-align: center; ${isFilterChecked ? '' : 'opacity: 0.4; pointer-events: none;'}">`;

            // Find all close/relevant bookings for this bungalow on this date (within 2 days window)
            const D = slot.dateStr;
            const relevantBookings = bookings.filter(b => {
                if (b.bungalow_numero !== bNum) return false;
                const bStart = new Date(b.fecha_ingreso + 'T00:00:00');
                const bEnd = new Date(b.fecha_salida + 'T00:00:00');
                const gridDate = new Date(D + 'T00:00:00');
                const twoDaysBefore = new Date(gridDate.getTime() - 2 * 24 * 60 * 60 * 1000);
                const twoDaysAfter = new Date(gridDate.getTime() + 2 * 24 * 60 * 60 * 1000);
                return bStart <= twoDaysAfter && bEnd >= twoDaysBefore;
            });

            // Determine if a booking actually overlaps with date D on a time level
            const dateStart = new Date(D + 'T00:00:00');
            const dateEnd = new Date(new Date(D + 'T00:00:00').getTime() + 24 * 60 * 60 * 1000);
            
            const overlaps = relevantBookings.filter(b => {
                const interval = getBookingInterval(b.fecha_ingreso, b.fecha_salida, b.horario, b.horas_extras || 0);
                return interval.start < dateEnd && interval.end > dateStart;
            });

            if (overlaps.length > 0) {
                overlaps.forEach(b => {
                    const isBlocked = b.estado_reserva === 'Bloqueado';
                    if (isBlocked) {
                        let blockReason = b.nombre_cliente || 'Mantenimiento';
                        if (blockReason.startsWith('🔒 Bloqueo: ')) {
                            blockReason = blockReason.replace('🔒 Bloqueo: ', '');
                        } else if (blockReason.startsWith('🔒 Bloqueo:')) {
                            blockReason = blockReason.replace('🔒 Bloqueo:', '');
                        }
                        html += `
                        <div class="availability-card blocked-card" onclick="openBookingEditModalById('${b.id}')" title="🔒 Bloqueo: ${escapeHTML(blockReason)}">
                            <div class="availability-card-header">
                                <span class="availability-card-title">🔒 Bloqueo</span>
                            </div>
                            <div class="availability-card-client">${escapeHTML(blockReason)}</div>
                        </div>`;
                    } else {
                        // Classify the day
                        const startHour = b.horario === 'Full Day' ? '9:00 AM' : '3:00 PM';
                        let endHour = b.horario === 'Full Day' ? '6:00 PM' : '12:00 PM';
                        if (b.horario !== 'Full Day' && (b.horas_extras || 0) > 0) {
                            let hh = 12 + b.horas_extras;
                            let daysOverflow = Math.floor(hh / 24);
                            hh = hh % 24;
                            let ampm = hh >= 12 ? 'PM' : 'AM';
                            let displayHr = hh % 12;
                            displayHr = displayHr ? displayHr : 12;
                            endHour = `${displayHr}:00 ${ampm}`;
                            if (daysOverflow > 0) {
                                endHour += ` (+${daysOverflow}d)`;
                            }
                        }

                        let statusText = '';
                        let statusEmoji = '';
                        let timeText = '';

                        if (D === b.fecha_ingreso && D === b.fecha_salida) {
                            statusText = 'Full Day';
                            statusEmoji = '☀️';
                            timeText = `${startHour} - ${endHour}`;
                        } else if (D === b.fecha_ingreso) {
                            statusText = 'Ingreso';
                            statusEmoji = '🌇';
                            timeText = startHour;
                        } else if (D === b.fecha_salida) {
                            statusText = 'Salida';
                            statusEmoji = '🌅';
                            timeText = endHour;
                        } else {
                            statusText = 'Hospedado';
                            statusEmoji = '👤';
                            timeText = 'Todo el día';
                        }
                        
                        html += `
                        <div class="availability-card bungalow-${bNum}" onclick="openBookingEditModalById('${b.id}')" title="${escapeHTML(b.nombre_cliente)} (${b.horario}) | Ingreso: ${startHour} - Salida: ${endHour}">
                            <div class="availability-card-header">
                                <span class="availability-card-title">${statusEmoji} ${statusText}</span>
                                <span class="availability-card-time">${timeText}</span>
                            </div>
                            <div class="availability-card-client">${escapeHTML(b.nombre_cliente)}</div>
                        </div>`;
                    }
                });
            }

            // Check if afternoon/night is available to show quick booking button
            // Afternoon/night is free if a standard check-in (starts D T15:00:00, ends D+1 T12:00:00) 
            // does NOT collide with any existing bookings.
            const newCheckInStart = new Date(D + 'T15:00:00');
            const nextDay = new Date(new Date(D + 'T00:00:00').getTime() + 24 * 60 * 60 * 1000);
            const nextDayStr = nextDay.getFullYear() + '-' + String(nextDay.getMonth() + 1).padStart(2, '0') + '-' + String(nextDay.getDate()).padStart(2, '0');
            const newCheckInEnd = new Date(nextDayStr + 'T12:00:00');

            const isOccupiedForCheckIn = relevantBookings.some(b => {
                const oldInterval = getBookingInterval(b.fecha_ingreso, b.fecha_salida, b.horario, b.horas_extras || 0);
                return newCheckInStart < oldInterval.end && newCheckInEnd > oldInterval.start;
            });

            if (!isOccupiedForCheckIn) {
                html += `<button type="button" class="availability-slot-btn" onclick="openBookingFromGrid('${slot.dateStr}', ${bNum})">
                    <i data-lucide="plus" style="width: 11px; height: 11px;"></i> + Reservar
                </button>`;
            }

            html += `</td>`;
        });

        html += `</tr>`;
    });

    const tbody = document.getElementById('availabilityTableBody');
    if (tbody) {
        tbody.innerHTML = html;
        if (window.lucide) lucide.createIcons();
    }
}

// Global functions for availability grid actions
window.openBookingFromGrid = function (dateStr, bungalowNum) {
    openBookingModal(dateStr);
    
    // Check the checkbox for the selected bungalow
    const chkList = document.querySelectorAll('input[name="bungalowSelect"]');
    chkList.forEach(chk => {
        chk.checked = (parseInt(chk.value) === bungalowNum);
    });
    
    // Sync the hidden select
    document.getElementById('bookingBungalow').value = bungalowNum;
    
    // Update limit and calculations
    updateNinosLimit();
    runDynamicCalculations();
};

window.openBookingEditModalById = function (id) {
    const booking = bookings.find(b => b.id === id || String(b.id) === String(id));
    if (booking) {
        openBookingEditModal(booking);
    }
};

function escapeHTML(str) {
    if (!str) return '';
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
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

    const selectedBungalows = Array.from(document.querySelectorAll('input[name="bungalowSelect"]:checked'))
        .map(c => c.value)
        .sort((a, b) => parseInt(a) - parseInt(b));
    
    let bungalowStr = "";
    if (selectedBungalows.length > 0) {
        const formatted = selectedBungalows.map(num => `N° ${num}`);
        if (formatted.length === 1) {
            bungalowStr = formatted[0];
        } else if (formatted.length === 2) {
            bungalowStr = `${formatted[0]} y ${formatted[1]}`;
        } else {
            const allButLast = formatted.slice(0, -1).join(', ');
            const last = formatted[formatted.length - 1];
            bungalowStr = `${allButLast} y ${last}`;
        }
    } else {
        const fallbackVal = document.getElementById('bookingBungalow').value;
        bungalowStr = fallbackVal ? `N° ${fallbackVal}` : '';
    }

    const name = document.getElementById('bookingName').value.trim();
    const checkIn = document.getElementById('bookingCheckIn').value;
    const checkOut = document.getElementById('bookingCheckOut').value;
    const horario = document.getElementById('bookingHorario').value;
    const adicionales = parseInt(document.getElementById('bookingAdicionales').value) || 0;
    const ninos = parseInt(document.getElementById('bookingNinoPequeno').value) || 0;

    const total = parseFloat(document.getElementById('bookingTotal').value) || 0;
    const adelanto = parseFloat(document.getElementById('bookingAdelanto').value) || 0;
    const pendiente = parseFloat(document.getElementById('bookingPendiente').value) || 0;
    const paymentType = document.getElementById('bookingPaymentType').value;
    const source = document.getElementById('bookingSource').value;

    const horasExtras = parseInt(document.getElementById('bookingHorasExtras').value) || 0;
    const dni = document.getElementById('bookingDni') ? document.getElementById('bookingDni').value.trim() : '';

    const dateInObj = new Date(checkIn + 'T00:00:00');
    let weekdayIn = dateInObj.toLocaleDateString('es-PE', { weekday: 'long' });
    weekdayIn = weekdayIn.charAt(0).toUpperCase() + weekdayIn.slice(1);
    const dayIn = String(dateInObj.getDate()).padStart(2, '0');
    const monthIn = String(dateInObj.getMonth() + 1).padStart(2, '0');
    const yearIn = String(dateInObj.getFullYear()).slice(-2);
    const formattedIn = `${weekdayIn} ${dayIn}/${monthIn}/${yearIn}`;

    const dateOutObj = new Date(checkOut + 'T00:00:00');
    let weekdayOut = dateOutObj.toLocaleDateString('es-PE', { weekday: 'long' });
    weekdayOut = weekdayOut.charAt(0).toUpperCase() + weekdayOut.slice(1);
    const dayOut = String(dateOutObj.getDate()).padStart(2, '0');
    const monthOut = String(dateOutObj.getMonth() + 1).padStart(2, '0');
    const yearOut = String(dateOutObj.getFullYear()).slice(-2);
    const formattedOut = `${weekdayOut} ${dayOut}/${monthOut}/${yearOut}`;

    let msg = `🏡 *RESERVA DE BUNGALOW* 🏡\n\n`;
    msg += `*Cliente:* ${name}\n`;
    if (dni) {
        msg += `*DNI:* ${dni}\n`;
    }
    msg += `*Bungalow${selectedBungalows.length > 1 ? 's' : ''}:* ${bungalowStr}\n`;
    msg += `📅 *Fecha Ingreso:* ${formattedIn}\n`;
    msg += `🏁 *Fecha Salida:* ${formattedOut}\n`;
    msg += `*Horario:* ${horario}\n`;

    if (adicionales > 0) {
        msg += `*Personas adicionales:* ${adicionales}\n`;
    }
    if (ninos > 0) {
        msg += `*Menores:* ${ninos}\n`;
    }

    if (horasExtras > 0) {
        msg += `*Horas extras:* ${horasExtras} hora(s)\n`;
    }

    msg += `*Método de Pago:* ${paymentType}\n`;
    msg += `*Medio:* ${source}\n`;

    msg += `\n*Monto Adelantado:* S/. ${adelanto.toFixed(2)}\n`;
    if (pendiente > 0) {
        msg += `*Saldo pendiente por cancelar S/. ${pendiente.toFixed(2)}, para permitir ingreso*\n`;
    }

    msg += `\n*¡Te esperamos!* ✨`;

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

// Helper to transform any name to Title Case (Initial Uppercase, rest lowercase)
function formatAsesorName(name) {
    if (!name) return '';
    return name.trim().split(/\s+/).map(word => {
        if (!word) return '';
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }).filter(word => word.length > 0).join(' ');
}

// Helper to populate the dropdown of advisors
function populateAsesoresDropdown(selectedValue = '') {
    const select = document.getElementById('bookingNotes');
    if (!select) return;

    // Clear dropdown
    select.innerHTML = '';

    // Add placeholder option
    const optPlaceholder = document.createElement('option');
    optPlaceholder.value = '';
    optPlaceholder.textContent = 'Seleccionar asesor...';
    optPlaceholder.disabled = true;
    optPlaceholder.selected = !selectedValue;
    select.appendChild(optPlaceholder);

    // Add active advisors to select
    activeAdvisorsList.forEach(advisor => {
        const option = document.createElement('option');
        option.value = advisor;
        option.textContent = advisor;
        select.appendChild(option);
    });

    // Admin option to register new advisor
    const optAdd = document.createElement('option');
    optAdd.value = '_add_new_';
    optAdd.textContent = '➕ Agregar nuevo asesor...';
    optAdd.style.fontWeight = '600';
    optAdd.style.color = 'var(--primary)';
    select.appendChild(optAdd);

    // Admin option to delete an advisor
    const optDel = document.createElement('option');
    optDel.value = '_delete_';
    optDel.textContent = '➖ Eliminar asesor...';
    optDel.style.fontWeight = '600';
    optDel.style.color = 'var(--danger)';
    select.appendChild(optDel);



    const formattedSelectedValue = formatAsesorName(selectedValue);

    if (formattedSelectedValue && !activeAdvisorsList.includes(formattedSelectedValue) && formattedSelectedValue !== '_add_new_' && formattedSelectedValue !== '_delete_') {
        // If the saved value is not in our active list, it means it's a custom value
        const optionCustom = document.createElement('option');
        optionCustom.value = formattedSelectedValue;
        optionCustom.textContent = formattedSelectedValue;
        select.appendChild(optionCustom);
        select.value = formattedSelectedValue;
    } else if (formattedSelectedValue && activeAdvisorsList.includes(formattedSelectedValue)) {
        select.value = formattedSelectedValue;
    } else {
        select.value = '';
    }
}

async function fetchAdvisors() {
    if (dbMode === 'supabase' && supabaseClient) {
        try {
            const { data: advData, error: advError } = await supabaseClient
                .from('personal_asesores')
                .select('name')
                .eq('is_active', true)
                .order('name', { ascending: true });

            if (advError) throw advError;

            if (advData && advData.length > 0) {
                activeAdvisorsList = advData.map(a => a.name);
            } else {
                loadActiveAdvisorsFromLocal();
            }
        } catch (err) {
            console.warn("Table personal_asesores not found or failed, using localStorage fallback:", err.message);
            loadActiveAdvisorsFromLocal();
        }
    } else {
        loadActiveAdvisorsFromLocal();
    }
    // Repopulate active select if open/needed
    const select = document.getElementById('bookingNotes');
    if (select) {
        // Save current selection to restore
        const currentVal = select.value;
        populateAsesoresDropdown(currentVal);
    }
}

function loadActiveAdvisorsFromLocal() {
    try {
        let savedCustom = localStorage.getItem('canchapro_custom_asesores');
        if (savedCustom === null) {
            const defaults = new Set(['Dird']);
            if (typeof bookings !== 'undefined' && bookings.length > 0) {
                bookings.forEach(b => {
                    if (b.asesor_registro && b.asesor_registro.trim() && b.asesor_registro !== 'Otro') {
                        defaults.add(formatAsesorName(b.asesor_registro));
                    }
                });
            }
            const defaultsArr = Array.from(defaults).sort();
            localStorage.setItem('canchapro_custom_asesores', JSON.stringify(defaultsArr));
            activeAdvisorsList = defaultsArr;
        } else {
            activeAdvisorsList = JSON.parse(savedCustom);
        }
    } catch (e) {
        console.warn("Error loading custom advisors from local:", e);
        activeAdvisorsList = ['Dird'];
    }
}

function saveNewAdvisorLocal(cleanName) {
    let customNames = [];
    try {
        const savedCustom = localStorage.getItem('canchapro_custom_asesores');
        if (savedCustom) {
            customNames = JSON.parse(savedCustom);
        } else {
            customNames = ['Dird'];
        }
    } catch (e) {
        console.warn(e);
    }
    if (!customNames.includes(cleanName)) {
        customNames.push(cleanName);
        localStorage.setItem('canchapro_custom_asesores', JSON.stringify(customNames));
    }
}

function deleteAdvisorLocal(cleanName) {
    let customNames = [];
    try {
        const savedCustom = localStorage.getItem('canchapro_custom_asesores');
        if (savedCustom) {
            customNames = JSON.parse(savedCustom);
        } else {
            customNames = ['Dird'];
        }
    } catch (e) {
        console.warn(e);
    }
    customNames = customNames.filter(name => name !== cleanName);
    localStorage.setItem('canchapro_custom_asesores', JSON.stringify(customNames));
}

async function handleAddAsesor(selectAsesor) {
    const pwd = prompt("Ingrese la contraseña de administrador para registrar un nuevo asesor:");
    if (pwd === 'Reservasupabase') {
        const newName = prompt("Ingrese el nombre completo del nuevo asesor:");
        if (newName && newName.trim()) {
            const cleanName = formatAsesorName(newName);

            if (!activeAdvisorsList.includes(cleanName)) {
                if (dbMode === 'supabase' && supabaseClient) {
                    try {
                        const { error: insErr } = await supabaseClient
                            .from('personal_asesores')
                            .insert([{ name: cleanName, is_active: true }]);

                        if (insErr) {
                            const { error: updErr } = await supabaseClient
                                .from('personal_asesores')
                                .update({ is_active: true })
                                .eq('name', cleanName);
                            if (updErr) throw updErr;
                        }
                    } catch (err) {
                        console.warn("Could not save new advisor to Supabase, saving locally:", err.message);
                        saveNewAdvisorLocal(cleanName);
                    }
                } else {
                    saveNewAdvisorLocal(cleanName);
                }
            }

            await fetchAdvisors();
            selectAsesor.value = cleanName;

            if (typeof logSessionActivity === 'function') {
                logSessionActivity(`registró al nuevo asesor: ${cleanName}`);
            }
            alert(`El asesor "${cleanName}" fue registrado correctamente.`);
        } else {
            selectAsesor.value = '';
        }
    } else {
        if (pwd !== null) alert("Contraseña incorrecta o cancelado.");
        selectAsesor.value = '';
    }
}

async function handleDeleteAsesor(selectAsesor) {
    const pwd = prompt("Ingrese la contraseña de administrador para eliminar un asesor:");
    if (pwd === 'Reservasupabase') {
        if (activeAdvisorsList.length === 0) {
            alert("No hay asesores guardados para eliminar.");
            selectAsesor.value = '';
            return;
        }

        const listStr = activeAdvisorsList.join(', ');
        const nameToDelete = prompt(`Asesores eliminables:\n[ ${listStr} ]\n\nEscriba el nombre exacto del asesor que desea eliminar:`);

        if (nameToDelete) {
            const cleanName = nameToDelete.trim();
            if (activeAdvisorsList.includes(cleanName)) {
                if (dbMode === 'supabase' && supabaseClient) {
                    try {
                        const { error: delErr } = await supabaseClient
                            .from('personal_asesores')
                            .update({ is_active: false })
                            .eq('name', cleanName);

                        if (delErr) throw delErr;
                    } catch (err) {
                        console.warn("Could not deactivate advisor in Supabase, updating locally:", err.message);
                        deleteAdvisorLocal(cleanName);
                    }
                } else {
                    deleteAdvisorLocal(cleanName);
                }

                await fetchAdvisors();
                selectAsesor.value = '';
                alert(`El asesor "${cleanName}" fue eliminado correctamente.`);

                if (typeof logSessionActivity === 'function') {
                    logSessionActivity(`eliminó al asesor: ${cleanName}`);
                }
            } else {
                alert(`El nombre "${cleanName}" no coincide con ningún asesor de la lista.`);
                selectAsesor.value = '';
            }
        } else {
            selectAsesor.value = '';
        }
    } else {
        if (pwd !== null) alert("Contraseña incorrecta o cancelado.");
        selectAsesor.value = '';
    }
}
