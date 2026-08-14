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
const PRICE_WEEKDAY = 160.00; // Tarifa diaria Lun-Jue (Día y Noche / Full Day / Por día de Horario Extendido)
const PRICE_WEEKEND = 180.00; // Tarifa diaria Vie-Dom (Día y Noche / Full Day / Por día de Horario Extendido)
const EXTRA_GUEST_FEE = 30.00; // Costo por persona adicional (actualizado a S/. 30)
const EXTRA_CHILD_FEE = 25.00; // Costo por niño adicional (S/. 25)

// Initialize Page
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Initialize Lucide Icons
    lucide.createIcons();

    // 2. Initialize Sidebar Collapsed State
    initSidebarState();

    // 3. Set Up Event Listeners
    setupEventListeners();

    // 4. Load Active Operator
    loadOperatorSession();

    // 4. Initialize Database
    await initDatabase();

    // 5. Initialize Calendar
    initCalendar();

    // 6. Load Initial Data
    await fetchBookings();

    // 7. Background Auto-Sync Fallback & Tab Visibility Listeners
    setInterval(() => {
        if (dbMode === 'supabase' && supabaseClient) {
            fetchBookings();
        }
    }, 15000);

    window.addEventListener('focus', () => {
        if (dbMode === 'supabase' && supabaseClient) {
            fetchBookings();
        }
    });

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && dbMode === 'supabase' && supabaseClient) {
            fetchBookings();
        }
    });
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
    document.getElementById('btnToggleSidebar').addEventListener('click', toggleSidebarHandler);
    document.getElementById('btnCloseSidebar').addEventListener('click', closeSidebarDrawer);
    document.getElementById('sidebarBackdrop').addEventListener('click', closeSidebarDrawer);

    // Modal triggers
    document.getElementById('btnNewReservation').addEventListener('click', () => openBookingModal());
    document.getElementById('btnCloseBooking').addEventListener('click', () => closeModal('modalBooking'));
    document.getElementById('btnOpenSettings').addEventListener('click', () => openSettingsModal());
    document.getElementById('btnCloseSettings').addEventListener('click', () => closeModal('modalSettings'));
    const historySearchInput = document.getElementById('historySearchInput');
    const btnClearHistoryLocal = document.getElementById('btnClearHistoryLocal');
    document.getElementById('btnOpenHistory').addEventListener('click', () => {
        if (historySearchInput) historySearchInput.value = '';
        openHistoryModal();
    });
    document.getElementById('btnCloseHistory').addEventListener('click', () => closeModal('modalHistory'));
    if (historySearchInput) {
        historySearchInput.addEventListener('input', (e) => {
            renderHistoryList(e.target.value.trim());
        });
    }
    if (btnClearHistoryLocal) {
        btnClearHistoryLocal.addEventListener('click', () => {
            if (confirm("¿Estás seguro de que deseas limpiar el historial local? Esto no afectará la base de datos Supabase.")) {
                localStorage.removeItem('canchapro_historial_bungalows');
                openHistoryModal();
            }
        });
    }
    document.getElementById('btnOpenStats').addEventListener('click', () => openStatsAuthModal());
    document.getElementById('btnCloseStatsAuth').addEventListener('click', () => closeModal('modalStatsAuth'));
    document.getElementById('btnCloseStatsModal').addEventListener('click', () => closeModal('modalStats'));
    document.getElementById('btnExportStatsExcel').addEventListener('click', exportAllDataToExcel);

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
        'bookingPersonas', 'bookingAdicionales', 'bookingNinoPequeno', 'bookingNinosAdicionales',
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

    // Handle schedule change (Full Day, Día y Noche, Horario Extendido)
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
            // Día y Noche y Horario Extendido: check-out default al día siguiente
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
            rowOccupancy.style.display = 'grid';
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

    const filterAsesorSelect = document.getElementById('filterAsesor');
    if (filterAsesorSelect) {
        filterAsesorSelect.addEventListener('change', () => {
            if (calendar) {
                calendar.refetchEvents();
                updateDailySummaryList();
                updateAvailabilityGrid();
            }
        });
    }

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
            // Actualizar límite de niños y de personas estándar
            updateNinosLimit();
            updatePersonasLimit();
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

// Update limit for standard guests based on selected bungalows
function updatePersonasLimit() {
    const selectedCount = Math.max(1, document.querySelectorAll('input[name="bungalowSelect"]:checked').length);
    const personasInput = document.getElementById('bookingPersonas');
    if (personasInput) {
        const maxVal = selectedCount * 4;
        personasInput.max = maxVal;

        // Clamp current value if it exceeds maxVal
        let currentVal = parseInt(personasInput.value) || 0;
        if (currentVal === 0) {
            personasInput.value = maxVal;
        } else if (currentVal > maxVal) {
            personasInput.value = maxVal;
        }

        const helpEl = document.getElementById('bookingPersonasHelp');
        if (helpEl) {
            helpEl.textContent = `Máximo ${maxVal} personas (${selectedCount} bungalow(s) seleccionado(s)).`;
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
    const personasInput = document.getElementById('bookingPersonas');
    if (personasInput) personasInput.value = 4;
    const ninosAdicInput = document.getElementById('bookingNinosAdicionales');
    if (ninosAdicInput) ninosAdicInput.value = 0;
    updateNinosLimit();
    updatePersonasLimit();

    // Clear error
    const errorEl = document.getElementById('bookingError');
    errorEl.textContent = '';
    errorEl.style.display = 'none';

    // Reset visibility variables
    document.getElementById('groupClientInfo').style.display = 'block';
    document.getElementById('rowClientDetails').style.display = 'flex';
    document.getElementById('rowOccupancy').style.display = 'grid';
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

    const totalAdults = booking.adultos || 4;
    const standardGuests = Math.min(4, totalAdults);
    const adicionales = Math.max(0, totalAdults - 4);

    const personasInput = document.getElementById('bookingPersonas');
    if (personasInput) {
        personasInput.value = standardGuests;
    }
    updatePersonasLimit();
    document.getElementById('bookingAdicionales').value = adicionales;
    document.getElementById('bookingNinoPequeno').value = booking.ninos_gratis || 0;
    const ninosAdicEdit = document.getElementById('bookingNinosAdicionales');
    if (ninosAdicEdit) ninosAdicEdit.value = booking.ninos_pagantes || 0;
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
        rowOccupancy.style.display = 'grid';
        rowExtras.style.display = 'flex';
        rowMedioPago.style.display = 'flex';
        document.getElementById('bookingName').required = true;
        document.getElementById('bookingDni').required = true;
    }

    // Determinar si el total guardado es un total editado manualmente (descuento/acuerdo)
    const calcBase = calculateBasePrice(booking.fecha_ingreso, booking.fecha_salida, booking.horario);
    const nights = calculateNights(booking.fecha_ingreso, booking.fecha_salida, booking.horario);
    const calcGuests = (adicionales * EXTRA_GUEST_FEE + (booking.ninos_pagantes || 0) * EXTRA_CHILD_FEE) * nights;
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
    } else if (horario === 'Horario Extendido') {
        // Horario Extendido: Desde las 9:00 AM del ingreso hasta las 6:00 PM de la salida
        // Abarca todos los días enteros del rango (de fecha_ingreso hasta fecha_salida inclusive)
        const end = new Date(checkOutStr + 'T00:00:00');
        let totalBase = 0;
        let current = new Date(start);

        while (current <= end) {
            const dayOfWeek = current.getDay(); // 0 = Sun, 1 = Mon, ..., 5 = Fri, 6 = Sat
            let isWeekend = (dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6);

            // Si es lunes y es parte de la extensión de una estadía de fin de semana (viene del domingo)
            if (dayOfWeek === 1 && current > start) {
                const prevDay = new Date(current);
                prevDay.setDate(prevDay.getDate() - 1);
                if (prevDay.getDay() === 0 && prevDay >= start) {
                    isWeekend = true;
                }
            }

            totalBase += isWeekend ? PRICE_WEEKEND : PRICE_WEEKDAY;
            current.setDate(current.getDate() + 1);
        }

        if (totalBase === 0) {
            const dayOfWeek = start.getDay();
            const isWeekend = (dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6);
            totalBase = isWeekend ? PRICE_WEEKEND : PRICE_WEEKDAY;
        }
        return totalBase;
    } else {
        // Día y Noche: 3:00 PM a 12:00 PM del día siguiente (por noches)
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
    const ninosAdicionales = parseInt(document.getElementById('bookingNinosAdicionales').value) || 0;

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
    // Additional adults are charged S/. 30 each per night.
    // Additional children are charged S/. 25 each per night.
    const guestsFee = (adicionales * EXTRA_GUEST_FEE + ninosAdicionales * EXTRA_CHILD_FEE) * nights;

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
    const url = localStorage.getItem('canchapro_supabase_url') || localStorage.getItem('canchapro_supabase_url_poli');
    const key = localStorage.getItem('canchapro_supabase_key') || localStorage.getItem('canchapro_supabase_key_poli');

    if (url && key) {
        try {
            supabaseClient = supabase.createClient(url, key);

            // Directly test query on reservas_bungalows table
            const { data, error } = await supabaseClient.from('reservas_bungalows').select('id').limit(1);

            if (!error) {
                dbMode = 'supabase';

                const statusDot = document.getElementById('statusDot');
                if (statusDot) statusDot.className = 'status-dot connected';
                const statusText = document.getElementById('statusText');
                if (statusText) statusText.textContent = 'Conectado a la Nube (Supabase)';
                const statusDesc = document.getElementById('statusDesc');
                if (statusDesc) statusDesc.textContent = 'Las reservas de Bungalows se sincronizan automáticamente en tiempo real.';

                // Fetch active advisors list
                await fetchAdvisors();

                setupRealtimeListener();
                return;
            } else {
                console.warn("Tabla 'reservas_bungalows' no accesible o error Supabase:", error.message);
            }
        } catch (e) {
            console.error("Fallo al inicializar Supabase client:", e);
        }
    }

    // Local fallback status
    dbMode = 'local';
    const statusDot = document.getElementById('statusDot');
    if (statusDot) statusDot.className = 'status-dot disconnected';
    const statusText = document.getElementById('statusText');
    if (statusText) statusText.textContent = 'Modo Local (Sin Conexión)';
    const statusDesc = document.getElementById('statusDesc');
    if (statusDesc) statusDesc.textContent = 'Los datos se guardan en este navegador. Configura la base de datos para compartir con otros asesores.';

    // Fetch active advisors list
    fetchAdvisors();
}

async function checkSupabaseReachable(url) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(`${url}/rest/v1/`, { method: 'GET', signal: controller.signal });
        clearTimeout(timeoutId);
        return res.ok || res.status === 401 || res.status === 400;
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
            console.log("Cambio en base de datos recibido en tiempo real (Bungalows):", payload);
            await fetchBookings();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'personal_asesores' }, async () => {
            await fetchAdvisors();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'historial' }, async () => {
            const modal = document.getElementById('modalHistory');
            if (modal && modal.classList.contains('active')) {
                openHistoryModal();
            }
        })
        .subscribe((status, err) => {
            console.log("Estado de suscripción Realtime Bungalows:", status);
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                console.warn("Reintentando reconexión a Realtime Bungalows en 5 segundos...");
                setTimeout(() => {
                    if (dbMode === 'supabase' && supabaseClient) {
                        setupRealtimeListener();
                    }
                }, 5000);
            }
        });
}

// Fetch all bookings
async function fetchBookings() {
    if (dbMode === 'supabase' && supabaseClient) {
        try {
            let allData = [];
            let from = 0;
            const step = 1000;
            let hasMore = true;

            while (hasMore) {
                const { data, error } = await supabaseClient
                    .from('reservas_bungalows')
                    .select('*')
                    .order('fecha_ingreso', { ascending: true })
                    .range(from, from + step - 1);

                if (error) throw error;
                if (data && data.length > 0) {
                    allData = allData.concat(data);
                    from += step;
                    if (data.length < step) hasMore = false;
                } else {
                    hasMore = false;
                }
            }
            bookings = allData;
        } catch (err) {
            console.error("Fallo al obtener de Supabase, usando respaldo local:", err);
            loadLocalBookingsFallback();
        }
    } else {
        loadLocalBookingsFallback();
    }

    // Refresh views
    populateFilterAsesoresDropdown();
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
    const ninosAdicionales = parseInt(document.getElementById('bookingNinosAdicionales').value) || 0;
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
            const totalBaseGuests = parseInt(document.getElementById('bookingPersonas').value) || 4;
            const baseGuestsForBungalow = Math.min(4, Math.max(0, totalBaseGuests - index * 4));

            payload.adultos = baseGuestsForBungalow + (index === 0 ? adicionales : 0);
            payload.ninos_gratis = (index < ninoPequeno) ? 1 : 0;
            payload.ninos_pagantes = (index === 0 ? ninosAdicionales : 0);
            payload.precio_base = calculateBasePrice(checkIn, checkOut, horario);
            payload.adicional_personas = (index === 0 ? (adicionales * EXTRA_GUEST_FEE + ninosAdicionales * EXTRA_CHILD_FEE) * nights : 0);
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
    } else if (horarioStr === 'Horario Extendido') {
        // Horario Extendido: 9:00 AM on check-in day to 6:00 PM (18:00) on check-out day
        start = new Date(checkInStr + 'T09:00:00');
        end = new Date(checkOutStr + 'T18:00:00');
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
    const isMobile = window.innerWidth <= 768;
    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        locale: 'es',
        firstDay: 1, // Lunes
        // Desactiva el resize automático para que el min-width del CSS se respete
        handleWindowResize: false,
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth'
        },
        buttonText: {
            today: 'Hoy',
            month: 'Mes'
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
            const isSmallScreen = window.innerWidth <= 1028;
            const fcEvents = bookings.map(b => {
                const isBlocked = b.estado_reserva === 'Bloqueado';
                let title = "";
                if (isSmallScreen) {
                    title = isBlocked ? `🔒 B${b.bungalow_numero}` : `B${b.bungalow_numero}`;
                } else {
                    title = isBlocked
                        ? `🔒 B${b.bungalow_numero} BLOQUEADO`
                        : `B${b.bungalow_numero}: ${b.nombre_cliente} (${b.horario})`;
                }

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

            // Filter out disabled bungalows and advisor filter from the sidebar filters
            const filterAsesorVal = document.getElementById('filterAsesor') ? document.getElementById('filterAsesor').value : 'TODOS';
            const filteredEvents = fcEvents.filter(event => {
                const bNo = event.extendedProps.bungalow_numero;
                const bChecked = document.getElementById(`filterB${bNo}`) ? document.getElementById(`filterB${bNo}`).checked : true;
                if (!bChecked) return false;

                if (filterAsesorVal && filterAsesorVal !== 'TODOS') {
                    const asesorRes = (event.extendedProps.asesor_registro || '').trim();
                    if (filterAsesorVal === 'SIN_ASESOR') {
                        if (asesorRes !== '' && asesorRes !== 'Sin Asesor') return false;
                    } else {
                        if (asesorRes !== filterAsesorVal) return false;
                    }
                }
                return true;
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

    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (calendar) {
                calendar.refetchEvents();
            }
        }, 150);
    });
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
    const filterAsesorVal = document.getElementById('filterAsesor') ? document.getElementById('filterAsesor').value : 'TODOS';
    const activeToday = bookings.filter(b => {
        // Filter by checkbox filters
        const filterEl = document.getElementById(`filterB${b.bungalow_numero}`);
        if (filterEl && !filterEl.checked) return false;

        // Filter by Asesor
        if (filterAsesorVal && filterAsesorVal !== 'TODOS') {
            const asesorRes = (b.asesor_registro || '').trim();
            if (filterAsesorVal === 'SIN_ASESOR') {
                if (asesorRes !== '' && asesorRes !== 'Sin Asesor') return false;
            } else {
                if (asesorRes !== filterAsesorVal) return false;
            }
        }

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
                        <i data-lucide="users"></i> ${b.adultos || 4} pers.${((b.ninos_gratis || 0) + (b.ninos_pagantes || 0)) > 0 ? ` + ${(b.ninos_gratis || 0) + (b.ninos_pagantes || 0)} niño(s)` : ''}
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
            const filterAsesorVal = document.getElementById('filterAsesor') ? document.getElementById('filterAsesor').value : 'TODOS';
            const D = slot.dateStr;
            const relevantBookings = bookings.filter(b => {
                if (b.bungalow_numero !== bNum) return false;

                if (filterAsesorVal && filterAsesorVal !== 'TODOS') {
                    const asesorRes = (b.asesor_registro || '').trim();
                    if (filterAsesorVal === 'SIN_ASESOR') {
                        if (asesorRes !== '' && asesorRes !== 'Sin Asesor') return false;
                    } else {
                        if (asesorRes !== filterAsesorVal) return false;
                    }
                }

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
                                <span class="availability-card-title">🔒 <span class="grid-status-text">Bloqueo</span></span>
                            </div>
                            <div class="availability-card-client">${escapeHTML(blockReason)}</div>
                        </div>`;
                    } else {
                        // Classify the day
                        let startHour = '3:00 PM';
                        let endHour = '12:00 PM';
                        if (b.horario === 'Full Day') {
                            startHour = '9:00 AM';
                            endHour = '6:00 PM';
                        } else if (b.horario === 'Horario Extendido') {
                            startHour = '9:00 AM';
                            endHour = '6:00 PM';
                        }

                        if (b.horario !== 'Full Day' && b.horario !== 'Horario Extendido' && (b.horas_extras || 0) > 0) {
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
                                <span class="availability-card-title">${statusEmoji} <span class="grid-status-text">${statusText}</span></span>
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
    const personas = parseInt(document.getElementById('bookingPersonas').value) || 4;
    const adicionales = parseInt(document.getElementById('bookingAdicionales').value) || 0;
    const ninos = parseInt(document.getElementById('bookingNinoPequeno').value) || 0;
    const ninosAdic = parseInt(document.getElementById('bookingNinosAdicionales').value) || 0;

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

    let checkInTime = "";
    let checkOutTime = "";
    if (horario === "Día y Noche") {
        checkInTime = "3:00 pm";
        const baseHour = 12; // 12:00 pm
        const totalHour = (baseHour + horasExtras) % 24;
        const period = totalHour >= 12 ? "pm" : "am";
        let displayHour = totalHour % 12;
        if (displayHour === 0) displayHour = 12;
        checkOutTime = `${displayHour}:00 ${period}`;
    } else if (horario === "Full Day") {
        checkInTime = "9:00 am";
        const baseHour = 18; // 6:00 pm
        const totalHour = (baseHour + horasExtras) % 24;
        const period = totalHour >= 12 ? "pm" : "am";
        let displayHour = totalHour % 12;
        if (displayHour === 0) displayHour = 12;
        checkOutTime = `${displayHour}:00 ${period}`;
    }

    const advisor = document.getElementById('bookingNotes') ? document.getElementById('bookingNotes').value : '';

    let msg = `🏡 *RESERVA DE BUNGALOW* 🏡\n\n`;
    msg += `*Cliente:* ${name}\n`;
    if (dni) {
        msg += `*DNI:* ${dni}\n`;
    }
    msg += `*Fecha Ingreso:* ${formattedIn}${checkInTime ? ` - ${checkInTime}` : ''}\n`;
    msg += `*Fecha Salida:* ${formattedOut}${checkOutTime ? ` - ${checkOutTime}` : ''}\n`;
    const totalPersonas = personas + adicionales;
    const totalNinos = ninos + ninosAdic;
    let cantidadStr = `${totalPersonas} persona${totalPersonas > 1 ? 's' : ''}`;
    if (totalNinos > 0) {
        cantidadStr += ` + ${totalNinos} niño(s)`;
    }
    msg += `*Cantidad:* ${cantidadStr}\n`;

    if (advisor && advisor !== '_add_new_' && advisor !== '_delete_') {
        msg += `*Asesor(a):* ${advisor}\n`;
    }
    msg += `*Medio:* ${source}\n`;
    msg += `*Bungalow${selectedBungalows.length > 1 ? 's' : ''}:* ${bungalowStr}\n`;

    if (pendiente <= 0) {
        msg += `\n*Total:* S/. ${total.toFixed(2)} (Cancelado)\n`;
    } else {
        msg += `\n*Monto Adelantado:* S/. ${adelanto.toFixed(2)}\n`;
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

function getColLetter(colIndex) {
    let temp = colIndex;
    let letter = '';
    while (temp > 0) {
        let modulo = (temp - 1) % 26;
        letter = String.fromCharCode(65 + modulo) + letter;
        temp = Math.floor((temp - modulo) / 26);
    }
    return letter;
}

function capitalizeName(name) {
    if (!name || typeof name !== 'string') return name || '';
    return name
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .map(word => {
            if (!word) return '';
            return word.charAt(0).toUpperCase() + word.slice(1);
        })
        .join(' ');
}

async function exportAllDataToExcel() {
    if (!bookings || bookings.length === 0) {
        alert("No hay reservas registradas para exportar.");
        return;
    }

    const workbook = new ExcelJS.Workbook();

    // ─── RESUMEN SHEET ─────────────────────────────────────────────
    const summaryWs = workbook.addWorksheet('📊 RESUMEN', { properties: { tabColor: { argb: 'FF0F766E' } } });
    summaryWs.views = [{ showGridLines: false }];

    function styleTitle(cell, text, bgArgb = 'FF0F766E', fgArgb = 'FFFFFFFF', fontSize = 12) {
        cell.value = text;
        cell.font = { name: 'Outfit', bold: true, size: fontSize, color: { argb: fgArgb } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgArgb } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        };
    }
    function styleValue(cell, value, isMoney = false) {
        cell.value = isMoney ? parseFloat(parseFloat(value).toFixed(2)) : value;
        if (isMoney) cell.numFmt = '"S/. "#,##0.00';
        cell.font = { name: 'Outfit', bold: true, size: 10, color: { argb: 'FF0F766E' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
        cell.alignment = { vertical: 'middle', horizontal: isMoney ? 'right' : 'left' };
        cell.border = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        };
    }

    summaryWs.getColumn(1).width = 30;
    summaryWs.getColumn(2).width = 20;
    summaryWs.getColumn(3).width = 20;
    summaryWs.getColumn(4).width = 20;
    summaryWs.getColumn(5).width = 20;

    let sr = 1;
    const monthColorsS = ['FFFFFFFF', 'FFF8FAFC'];

    // Title Block
    summaryWs.mergeCells(sr, 1, sr, 5);
    const mainTitleCell = summaryWs.getCell(sr, 1);
    styleTitle(mainTitleCell, "REPORTE GENERAL DE RESERVAS Y ESTADÍSTICAS - BUNGALOWS", 'FF0F766E', 'FFFFFFFF', 14);
    summaryWs.getRow(sr).height = 40;
    sr += 2; // Blank row

    // Group events by Month based on fecha_ingreso
    const groups = {};
    bookings.forEach(b => {
        if (!b.fecha_ingreso) return;
        const dateParts = b.fecha_ingreso.split('-');
        if (dateParts.length < 2) return;
        const year = dateParts[0];
        const monthIndex = parseInt(dateParts[1]) - 1;
        const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        const monthName = months[monthIndex] || 'Otros';
        const label = `${monthName} ${year}`;
        if (!groups[label]) {
            groups[label] = [];
        }
        groups[label].push(b);
    });

    // 1. Month Summary Block
    summaryWs.mergeCells(sr, 1, sr, 5);
    styleTitle(summaryWs.getCell(sr, 1), "INGRESOS Y USOS MENSUALES", 'FF334155', 'FFFFFFFF', 11);
    summaryWs.getRow(sr).height = 24; sr++;

    const headersM = ["Mes / Período", "Reservas", "Monto Hospedaje", "Monto Adicionales", "Total Facturado"];
    headersM.forEach((h, idx) => {
        styleTitle(summaryWs.getCell(sr, idx + 1), h, 'FF1E293B', 'FFFFFFFF', 10);
    });
    summaryWs.getRow(sr).height = 22; sr++;

    let grandTotalBookings = 0;
    let grandTotalHospedaje = 0;
    let grandTotalAdic = 0;
    let grandTotalSum = 0;

    let rowIdx = 0;
    for (const [monthLabel, items] of Object.entries(groups)) {
        const bg = monthColorsS[rowIdx % 2];
        const activeItems = items.filter(b => b.estado_reserva !== 'Bloqueado');

        let count = activeItems.length;
        let hMonto = 0;
        let adicMonto = 0;
        let tMonto = 0;

        activeItems.forEach(b => {
            const tot = parseFloat(b.monto_total) || 0;
            const extraP = parseFloat(b.adicional_personas) || 0;
            const extraH = parseFloat(b.adicional_horas) || 0;

            // Hospedaje base (total minus extras)
            const base = Math.max(0, tot - extraP - extraH);
            hMonto += base;
            adicMonto += extraP + extraH;
            tMonto += tot;
        });

        grandTotalBookings += count;
        grandTotalHospedaje += hMonto;
        grandTotalAdic += adicMonto;
        grandTotalSum += tMonto;

        const c1 = summaryWs.getCell(sr, 1);
        c1.value = monthLabel; c1.font = { name: 'Outfit', bold: true, size: 10, color: { argb: 'FF1E293B' } };
        c1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        c1.alignment = { vertical: 'middle', horizontal: 'left' };
        c1.border = { top: { style: 'thin', color: { argb: 'FFE2E8F0' } }, left: { style: 'thin', color: { argb: 'FFE2E8F0' } }, bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }, right: { style: 'thin', color: { argb: 'FFE2E8F0' } } };

        styleValue(summaryWs.getCell(sr, 2), count, false);
        styleValue(summaryWs.getCell(sr, 3), hMonto, true);
        styleValue(summaryWs.getCell(sr, 4), adicMonto, true);
        styleValue(summaryWs.getCell(sr, 5), tMonto, true);

        // Apply row BG to values
        for (let col = 2; col <= 5; col++) {
            summaryWs.getCell(sr, col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        }

        summaryWs.getRow(sr).height = 20;
        sr++;
        rowIdx++;
    }

    // Totals Row for Months
    const totalCell = summaryWs.getCell(sr, 1);
    totalCell.value = "TOTAL GENERAL";
    totalCell.font = { name: 'Outfit', bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    totalCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
    totalCell.alignment = { vertical: 'middle', horizontal: 'left' };
    totalCell.border = { top: { style: 'thin', color: { argb: 'FF0F766E' } }, left: { style: 'thin', color: { argb: 'FF0F766E' } }, bottom: { style: 'thin', color: { argb: 'FF0F766E' } }, right: { style: 'thin', color: { argb: 'FF0F766E' } } };

    styleValue(summaryWs.getCell(sr, 2), grandTotalBookings, false);
    styleValue(summaryWs.getCell(sr, 3), grandTotalHospedaje, true);
    styleValue(summaryWs.getCell(sr, 4), grandTotalAdic, true);
    styleValue(summaryWs.getCell(sr, 5), grandTotalSum, true);

    for (let col = 2; col <= 5; col++) {
        summaryWs.getCell(sr, col).font.color = { argb: 'FFFFFFFF' };
        summaryWs.getCell(sr, col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
    }
    summaryWs.getRow(sr).height = 22;
    sr += 3; // Blank rows

    // Helper function to format local YYYY-MM-DD
    const getLocalYYYYMMDD = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const r = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${r}`;
    };

    // Calculate all 7 days of the current week (Monday-Sunday)
    const getWeekDaysList = () => {
        const t = new Date();
        const day = t.getDay();
        const diff = t.getDate() - day + (day === 0 ? -6 : 1);
        const mon = new Date(t.setDate(diff));

        const weekDates = [];
        for (let i = 0; i < 7; i++) {
            const temp = new Date(mon);
            temp.setDate(mon.getDate() + i);
            weekDates.push(getLocalYYYYMMDD(temp));
        }
        return weekDates;
    };
    const currentWeekDays = getWeekDaysList();
    const todayStr = getLocalYYYYMMDD(new Date());

    // ─── FINANCIAL SUMMARY OF CURRENT MONTH Block ───────────────────
    const today = new Date();
    const thisMonth = today.getMonth(); // 0-indexed (0-11)
    const thisYear = today.getFullYear();

    const monthBookings = bookings.filter(b => {
        if (b.estado_reserva === 'Bloqueado' || b.estado_reserva === 'Bloqueo') return false;
        if (!b.fecha_ingreso) return false;
        const parts = b.fecha_ingreso.split('-');
        if (parts.length < 2) return false;
        const year = parseInt(parts[0]);
        const month = parseInt(parts[1]) - 1; // Convert to 0-indexed
        return (month === thisMonth && year === thisYear);
    });

    let monthRevenue = 0;
    let monthDeposito = 0;
    let monthOtros = 0;
    let monthDayNightRevenue = 0;
    let monthFullDayRevenue = 0;
    let monthAdicPersonas = 0;


    monthBookings.forEach(b => {
        const amt = parseFloat(b.monto_total) || 0;
        monthRevenue += amt;

        if (b.tipo_pago === 'Depósito') {
            monthDeposito += amt;
        } else if (b.tipo_pago === 'Yape' || b.tipo_pago === 'Efectivo') {
            monthOtros += amt;
        } else if (b.tipo_pago === 'Dividido') {
            monthDeposito += parseFloat(b.monto_efectivo) || 0;
            monthOtros += parseFloat(b.monto_yape) || 0;
        }

        const isFullDay = b.horario === 'Full Day';
        if (isFullDay) {
            monthFullDayRevenue += amt;
        } else {
            monthDayNightRevenue += amt;
        }

        monthAdicPersonas += parseFloat(b.adicional_personas) || 0;
    });

    // Today bookings calculations
    const todayBookings = bookings.filter(b => {
        if (b.estado_reserva === 'Bloqueado' || b.estado_reserva === 'Bloqueo') return false;
        return b.fecha_ingreso === todayStr;
    });

    let todayBungalowBase = 0;
    let todayAdicionales = 0;
    let todayTotal = 0;

    todayBookings.forEach(b => {
        const tot = parseFloat(b.monto_total) || 0;
        const extraP = parseFloat(b.adicional_personas) || 0;
        const extraH = parseFloat(b.adicional_horas) || 0;
        const extra = extraP + extraH;

        todayBungalowBase += (tot - extra);
        todayAdicionales += extra;
        todayTotal += tot;
    });

    // Week bookings calculations
    const weekBookings = bookings.filter(b => {
        if (b.estado_reserva === 'Bloqueado' || b.estado_reserva === 'Bloqueo') return false;
        return currentWeekDays.includes(b.fecha_ingreso);
    });

    let weekBungalowBase = 0;
    let weekAdicionales = 0;
    let weekTotal = 0;

    weekBookings.forEach(b => {
        const tot = parseFloat(b.monto_total) || 0;
        const extraP = parseFloat(b.adicional_personas) || 0;
        const extraH = parseFloat(b.adicional_horas) || 0;
        const extra = extraP + extraH;

        weekBungalowBase += (tot - extra);
        weekAdicionales += extra;
        weekTotal += tot;
    });

    sr += 3;
    summaryWs.mergeCells(sr, 1, sr, 3);
    styleTitle(summaryWs.getCell(sr, 1), "INGRESO DE DINERO EN BUNGALOWS (MES ACTUAL)", 'FF0F766E', 'FFFFFFFF', 11);
    summaryWs.getRow(sr).height = 24; sr++;

    styleTitle(summaryWs.getCell(sr, 1), "Concepto", 'FF1E293B', 'FFFFFFFF', 10);
    styleTitle(summaryWs.getCell(sr, 2), "Monto", 'FF1E293B', 'FFFFFFFF', 10);
    summaryWs.getRow(sr).height = 22; sr++;

    const financialData = [
        ["Ganancia del Mes Total", monthRevenue],
        ["Depósitos del Mes", monthDeposito],
        ["Yape / Otros Pagos del Mes", monthOtros],
        ["Ganancia del Mes Día y Noche", monthDayNightRevenue],
        ["Ganancia de Full Day del Mes", monthFullDayRevenue],
        ["Ganancia de Personas Adicionales", monthAdicPersonas]
    ];

    financialData.forEach(([concept, val], fIdx) => {
        const bg = monthColorsS[fIdx % 2];
        const c1 = summaryWs.getCell(sr, 1);
        c1.value = concept;
        c1.font = { name: 'Outfit', bold: true, size: 10, color: { argb: 'FF1E293B' } };
        c1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        c1.alignment = { vertical: 'middle', horizontal: 'left' };
        c1.border = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        };

        styleValue(summaryWs.getCell(sr, 2), val, true);
        summaryWs.getCell(sr, 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };

        summaryWs.getRow(sr).height = 20;
        sr++;
    });

    // ─── INGRESO DE DINERO EN BUNGALOWS (SEMANA ACTUAL) ────────────
    sr += 3;
    summaryWs.mergeCells(sr, 1, sr, 3);
    styleTitle(summaryWs.getCell(sr, 1), "INGRESO DE DINERO EN BUNGALOWS (SEMANA ACTUAL)", 'FF0F766E', 'FFFFFFFF', 11);
    summaryWs.getRow(sr).height = 24; sr++;

    styleTitle(summaryWs.getCell(sr, 1), "Concepto", 'FF1E293B', 'FFFFFFFF', 10);
    styleTitle(summaryWs.getCell(sr, 2), "Monto", 'FF1E293B', 'FFFFFFFF', 10);
    summaryWs.getRow(sr).height = 22; sr++;

    const weekData = [
        ["Ganancias de Bungalows Totales", weekBungalowBase],
        ["Ganancias de Adicionales", weekAdicionales],
        ["Total", weekTotal]
    ];

    weekData.forEach(([concept, val], fIdx) => {
        const bg = monthColorsS[fIdx % 2];
        const c1 = summaryWs.getCell(sr, 1);
        c1.value = concept;
        c1.font = { name: 'Outfit', bold: true, size: 10, color: { argb: 'FF1E293B' } };
        c1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        c1.alignment = { vertical: 'middle', horizontal: 'left' };
        c1.border = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        };

        styleValue(summaryWs.getCell(sr, 2), val, true);
        summaryWs.getCell(sr, 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };

        summaryWs.getRow(sr).height = 20;
        sr++;
    });

    // ─── INGRESO DE DINERO EN BUNGALOWS (DÍA DE HOY) ────────────────
    sr += 3;
    summaryWs.mergeCells(sr, 1, sr, 3);
    styleTitle(summaryWs.getCell(sr, 1), "INGRESO DE DINERO EN BUNGALOWS (DÍA DE HOY)", 'FF0F766E', 'FFFFFFFF', 11);
    summaryWs.getRow(sr).height = 24; sr++;

    styleTitle(summaryWs.getCell(sr, 1), "Concepto", 'FF1E293B', 'FFFFFFFF', 10);
    styleTitle(summaryWs.getCell(sr, 2), "Monto", 'FF1E293B', 'FFFFFFFF', 10);
    summaryWs.getRow(sr).height = 22; sr++;

    const todayData = [
        ["Ganancias de Bungalows Totales", todayBungalowBase],
        ["Ganancias de Adicionales", todayAdicionales],
        ["Total", todayTotal]
    ];

    todayData.forEach(([concept, val], fIdx) => {
        const bg = monthColorsS[fIdx % 2];
        const c1 = summaryWs.getCell(sr, 1);
        c1.value = concept;
        c1.font = { name: 'Outfit', bold: true, size: 10, color: { argb: 'FF1E293B' } };
        c1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        c1.alignment = { vertical: 'middle', horizontal: 'left' };
        c1.border = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        };

        styleValue(summaryWs.getCell(sr, 2), val, true);
        summaryWs.getCell(sr, 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };

        summaryWs.getRow(sr).height = 20;
        sr++;
    });

    // ─── CLIENTS WORKSHEET ─────────────────────────────────────────
    const clientsWs = workbook.addWorksheet('👥 CLIENTES', { properties: { tabColor: { argb: 'FF10B981' } } });
    clientsWs.views = [{ showGridLines: true }];

    const clientColsDef = [
        { header: 'Nombre del Cliente', key: 'nombre', width: 35 },
        { header: 'DNI', key: 'dni', width: 16 },
        { header: 'Asesores que lo atendieron', key: 'asesores', width: 35 },
        { header: 'Medios de Contacto', key: 'medios', width: 30 },
        { header: 'Número de Reservas', key: 'num_reservas', width: 20 },
        { header: 'Fechas de Reservas', key: 'fechas_reservas', width: 28 },
        { header: 'Total Bungalows Reservados', key: 'total_bungalows', width: 24 }
    ];
    clientsWs.columns = clientColsDef;

    // Style client header row
    const clientHeaderRow = clientsWs.getRow(1);
    clientHeaderRow.height = 26;
    clientHeaderRow.eachCell((cell) => {
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF10B981' }
        };
        cell.font = {
            name: 'Outfit',
            color: { argb: 'FFFFFFFF' },
            bold: true,
            size: 11
        };
        cell.alignment = {
            vertical: 'middle',
            horizontal: 'center',
            wrapText: true
        };
        cell.border = {
            top: { style: 'thin', color: { argb: 'FF1E293B' } },
            left: { style: 'thin', color: { argb: 'FF1E293B' } },
            bottom: { style: 'medium', color: { argb: 'FF1E293B' } },
            right: { style: 'thin', color: { argb: 'FF1E293B' } }
        };
    });

    // Group active bookings by DNI (or Name if empty)
    const clientsExcelMap = {};
    const activeAllExcelBookings = bookings.filter(b => b.estado_reserva !== 'Bloqueo' && b.estado_reserva !== 'Bloqueado');

    activeAllExcelBookings.forEach(b => {
        const name = capitalizeName(b.nombre_cliente || 'Desconocido');
        const dni = (b.dni_cliente || '').trim();
        const key = dni !== '' ? dni : `nodni_${name.toLowerCase()}`;

        if (!clientsExcelMap[key]) {
            clientsExcelMap[key] = {
                name: name,
                dni: dni,
                advisors: new Set(),
                medios: new Set(),
                dateCounts: {},
                bungalowsCount: 0
            };
        }

        if (name !== 'Desconocido') {
            clientsExcelMap[key].name = name;
        }

        const advisor = capitalizeName(b.asesor_registro || '');
        if (advisor && advisor.toLowerCase() !== 'sin asesor') {
            clientsExcelMap[key].advisors.add(advisor);
        }

        const medio = (b.medio_contacto || '').trim();
        if (medio) {
            clientsExcelMap[key].medios.add(medio);
        }

        if (b.fecha_ingreso) {
            const d = b.fecha_ingreso;
            clientsExcelMap[key].dateCounts[d] = (clientsExcelMap[key].dateCounts[d] || 0) + 1;
        }

        clientsExcelMap[key].bungalowsCount++;
    });

    const clientsExcelList = Object.values(clientsExcelMap).sort((a, b) => Object.keys(b.dateCounts).length - Object.keys(a.dateCounts).length);

    let clientRowNo = 2;
    clientsExcelList.forEach(c => {
        const advisorsStr = Array.from(c.advisors).join(', ') || 'Sin asesor';
        const mediosStr = Array.from(c.medios).join(', ') || 'Ninguno';

        const sortedDates = Object.keys(c.dateCounts).sort();
        const formattedDates = sortedDates.map(d => {
            const parts = d.split('-');
            if (parts.length === 3) {
                const day = parts[2];
                const month = parts[1];
                const year = parts[0].length === 4 ? parts[0].substring(2) : parts[0];
                const count = c.dateCounts[d];
                return `${day}/${month}/${year}(${count})`;
            }
            return `${d}(${c.dateCounts[d]})`;
        }).join(', ') || 'Sin fechas';

        const dataRow = clientsWs.addRow({
            nombre: c.name,
            dni: c.dni || 'Sin DNI',
            asesores: advisorsStr,
            medios: mediosStr,
            num_reservas: Object.keys(c.dateCounts).length,
            fechas_reservas: formattedDates,
            total_bungalows: c.bungalowsCount
        });

        dataRow.height = 20;
        const isAlternate = (clientRowNo % 2 === 0);
        dataRow.eachCell((cell, colNumber) => {
            cell.font = { name: 'Outfit', size: 10 };
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: isAlternate ? 'FFF8FAFC' : 'FFFFFFFF' }
            };
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
            };

            const colKey = clientColsDef[colNumber - 1].key;
            if (colKey === 'dni' || colKey === 'num_reservas' || colKey === 'total_bungalows' || colKey === 'fechas_reservas') {
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
            } else {
                cell.alignment = { horizontal: 'left', vertical: 'middle' };
            }
        });

        clientRowNo++;
    });



    // ─── DATA WORKSEETS ───────────────────────────────────────────
    const columnsDef = [
        { header: 'Bungalow', key: 'bungalow', width: 14 },
        { header: 'Fecha Entrada', key: 'fecha_entrada', width: 14 },
        { header: 'Fecha Salida', key: 'fecha_salida', width: 14 },
        { header: 'Horario', key: 'horario', width: 12 },
        { header: 'Cliente', key: 'cliente', width: 25 },
        { header: 'DNI', key: 'dni', width: 12 },
        { header: 'Teléfono', key: 'telefono', width: 14 },
        { header: 'Asesor', key: 'asesor', width: 16 },
        { header: 'Medio de Contacto', key: 'medio', width: 18 },
        { header: 'Tipo de Pago', key: 'tipo_pago', width: 18 },
        { header: 'Monto Total (S/.)', key: 'monto_total', width: 18 },
        { header: 'Adelanto (S/.)', key: 'monto_adelanto', width: 18 },
        { header: 'Efectivo (S/.)', key: 'monto_efectivo', width: 18 },
        { header: 'Yape (S/.)', key: 'monto_yape', width: 18 },
        { header: 'Depósito (S/.)', key: 'monto_deposito', width: 18 },
        { header: 'Extra Personas (S/.)', key: 'monto_adic_personas', width: 20 },
        { header: 'Extra Horas (S/.)', key: 'monto_adic_horas', width: 20 },
        { header: 'Estado', key: 'estado', width: 14 },
        { header: 'Observaciones', key: 'observaciones', width: 30 },
        { header: 'Fecha Registro', key: 'registro', width: 22 }
    ];

    for (const [monthLabel, bookingsInMonth] of Object.entries(groups)) {
        const worksheet = workbook.addWorksheet(monthLabel);

        // Grid lines visible
        worksheet.views = [{ showGridLines: true }];
        worksheet.columns = columnsDef;

        // Auto filter
        worksheet.autoFilter = `A1:${getColLetter(columnsDef.length)}1`;

        // Style header row
        const headerRow = worksheet.getRow(1);
        headerRow.height = 26;
        headerRow.eachCell((cell) => {
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF0F766E' }
            };
            cell.font = {
                name: 'Outfit',
                color: { argb: 'FFFFFFFF' },
                bold: true,
                size: 11
            };
            cell.alignment = {
                vertical: 'middle',
                horizontal: 'center',
                wrapText: true
            };
            cell.border = {
                top: { style: 'thin', color: { argb: 'FF1E293B' } },
                left: { style: 'thin', color: { argb: 'FF1E293B' } },
                bottom: { style: 'medium', color: { argb: 'FF1E293B' } },
                right: { style: 'thin', color: { argb: 'FF1E293B' } }
            };
        });

        let rowNumber = 2;
        bookingsInMonth.forEach(b => {
            const dataRow = worksheet.addRow({
                bungalow: b.bungalow_numero || '',
                fecha_entrada: b.fecha_ingreso || '',
                fecha_salida: b.fecha_salida || '',
                horario: b.horario || '',
                cliente: capitalizeName(b.nombre_cliente || ''),
                dni: b.dni_cliente || '',
                telefono: b.telefono_cliente || '',
                asesor: capitalizeName(b.asesor_registro || ''),
                medio: b.medio_contacto || '',
                tipo_pago: b.tipo_pago || '',
                monto_total: b.monto_total ? parseFloat(b.monto_total) : 0,
                monto_adelanto: b.monto_adelanto ? parseFloat(b.monto_adelanto) : 0,
                monto_efectivo: b.monto_efectivo ? parseFloat(b.monto_efectivo) : 0,
                monto_yape: b.monto_yape ? parseFloat(b.monto_yape) : 0,
                monto_deposito: b.monto_deposito ? parseFloat(b.monto_deposito) : 0,
                monto_adic_personas: b.adicional_personas ? parseFloat(b.adicional_personas) : 0,
                monto_adic_horas: b.adicional_horas ? parseFloat(b.adicional_horas) : 0,
                estado: b.estado_reserva || '',
                observaciones: b.observaciones || '',
                registro: b.created_at ? new Date(b.created_at).toLocaleString('es-PE') : ''
            });

            dataRow.height = 20;

            const isAlternate = (rowNumber % 2 === 0);
            dataRow.eachCell((cell, colNumber) => {
                cell.font = { name: 'Outfit', size: 10 };
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: isAlternate ? 'FFF8FAFC' : 'FFFFFFFF' }
                };
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                    left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                    bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                    right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
                };

                const colKey = columnsDef[colNumber - 1].key;
                if (['fecha_entrada', 'fecha_salida', 'horario', 'dni', 'telefono', 'tipo_pago', 'medio', 'estado'].includes(colKey)) {
                    cell.alignment = { horizontal: 'center', vertical: 'middle' };
                } else if (['monto_total', 'monto_adelanto', 'monto_efectivo', 'monto_yape', 'monto_deposito', 'monto_adic_personas', 'monto_adic_horas'].includes(colKey)) {
                    cell.alignment = { horizontal: 'right', vertical: 'middle' };
                    cell.numFmt = '"S/. "#,##0.00';
                } else {
                    cell.alignment = { horizontal: 'left', vertical: 'middle' };
                }
            });

            rowNumber++;
        });
    }



    workbook.xlsx.writeBuffer().then((buffer) => {
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'Reporte_Reservas_Bungalows.xlsx';
        link.click();
    }).catch(err => {
        console.error("Error al exportar:", err);
        alert("Ocurrió un error al generar el archivo Excel: " + err.message);
    });
}

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

function loadStatsDashboard(period = 'month') {
    openModal('modalStats');

    // Sincronizar botones de período en la UI
    document.querySelectorAll('.filter-period-btn').forEach(btn => {
        const btnPeriod = btn.getAttribute('data-period');
        if (btnPeriod === period) {
            btn.classList.add('active');
            btn.style.background = 'rgba(255, 255, 255, 0.05)';
            btn.style.color = 'var(--text-secondary)';
            btn.style.fontWeight = '600';
        } else {
            btn.classList.remove('active');
            btn.style.background = 'none';
            btn.style.color = 'var(--text-muted)';
            btn.style.fontWeight = '500';
        }
    });

    // Actualizar etiquetas en la UI
    const labelsMap = {
        month: {
            income: 'Ganancia Estimada del Mes',
            deposito: 'Cobrado en Depósito (Mes)',
            otros: 'Yape / Otros Pagos (Mes)',
            extras: 'Extras / Adicionales (Mes)',
            occupancy: 'Grado de ocupación por cada Bungalow este mes:',
            asesores: 'Rendimiento de Asesores (Este mes):'
        },
        week: {
            income: 'Ganancia de la Semana',
            deposito: 'Cobrado en Depósito (Semana)',
            otros: 'Yape / Otros Pagos (Semana)',
            extras: 'Extras / Adicionales (Semana)',
            occupancy: 'Grado de ocupación por cada Bungalow esta semana:',
            asesores: 'Rendimiento de Asesores (Esta semana):'
        },
        day: {
            income: 'Ganancia Hoy',
            deposito: 'Cobrado en Depósito (Hoy)',
            otros: 'Yape / Otros Pagos (Hoy)',
            extras: 'Extras / Adicionales (Hoy)',
            occupancy: 'Grado de ocupación por cada Bungalow hoy:',
            asesores: 'Rendimiento de Asesores (Hoy):'
        }
    };

    const currentLabels = labelsMap[period];
    document.getElementById('labelIncome').textContent = currentLabels.income;
    document.getElementById('labelDeposito').textContent = currentLabels.deposito;
    document.getElementById('labelOtros').textContent = currentLabels.otros;
    document.getElementById('labelExtras').textContent = currentLabels.extras;
    document.getElementById('labelOccupancy').textContent = currentLabels.occupancy;
    document.getElementById('labelAsesores').textContent = currentLabels.asesores;

    const todayObj = new Date();
    const thisMonth = todayObj.getMonth();
    const thisYear = todayObj.getFullYear();

    // Helper to format local YYYY-MM-DD
    const getLocalYYYYMMDD = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const r = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${r}`;
    };

    const todayStr = getLocalYYYYMMDD(todayObj);

    // Calculate all 7 days of the current week (Monday-Sunday)
    const getWeekDaysList = () => {
        const temp = new Date(todayObj.getTime());
        const day = temp.getDay();
        const diff = temp.getDate() - day + (day === 0 ? -6 : 1);
        const mon = new Date(temp.setDate(diff));

        const weekDates = [];
        for (let i = 0; i < 7; i++) {
            const tempD = new Date(mon.getTime());
            tempD.setDate(mon.getDate() + i);
            weekDates.push(getLocalYYYYMMDD(tempD));
        }
        return weekDates;
    };
    const currentWeekDays = getWeekDaysList();

    // Filter bookings based on selected period
    const monthBookings = bookings.filter(b => {
        if (b.estado_reserva === 'Bloqueado' || b.estado_reserva === 'Bloqueo') return false;
        if (!b.fecha_ingreso) return false;

        if (period === 'day') {
            return b.fecha_ingreso === todayStr;
        } else if (period === 'week') {
            return currentWeekDays.includes(b.fecha_ingreso);
        } else {
            // Month
            const parts = b.fecha_ingreso.split('-');
            if (parts.length < 2) return false;
            const year = parseInt(parts[0]);
            const month = parseInt(parts[1]) - 1;
            return (month === thisMonth && year === thisYear);
        }
    });

    // 2. Calculations
    let totalRevenue = 0;
    let depositoTotal = 0;
    let otrosTotal = 0;
    let totalDayNightCount = 0;
    let totalDayNightRevenue = 0;
    let totalFullDayCount = 0;
    let totalFullDayRevenue = 0;
    let totalExtrasRevenue = 0;

    // Per bungalow stats map
    const bungalowStats = {
        1: { count: 0, revenue: 0, daysOccupied: 0, dayNightCount: 0, dayNightRevenue: 0, fullDayCount: 0, fullDayRevenue: 0, extras: 0 },
        2: { count: 0, revenue: 0, daysOccupied: 0, dayNightCount: 0, dayNightRevenue: 0, fullDayCount: 0, fullDayRevenue: 0, extras: 0 },
        3: { count: 0, revenue: 0, daysOccupied: 0, dayNightCount: 0, dayNightRevenue: 0, fullDayCount: 0, fullDayRevenue: 0, extras: 0 },
        4: { count: 0, revenue: 0, daysOccupied: 0, dayNightCount: 0, dayNightRevenue: 0, fullDayCount: 0, fullDayRevenue: 0, extras: 0 },
        5: { count: 0, revenue: 0, daysOccupied: 0, dayNightCount: 0, dayNightRevenue: 0, fullDayCount: 0, fullDayRevenue: 0, extras: 0 },
        6: { count: 0, revenue: 0, daysOccupied: 0, dayNightCount: 0, dayNightRevenue: 0, fullDayCount: 0, fullDayRevenue: 0, extras: 0 }
    };

    // Client counts map
    const clientsMap = {};

    // Asesores stats map
    const asesoresMap = {};

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

        // Schedule & extras split
        const isFullDay = b.horario === 'Full Day';
        const extrasAmount = (b.adicional_personas || 0) + (b.adicional_horas || 0);

        if (isFullDay) {
            totalFullDayCount++;
            totalFullDayRevenue += b.monto_total;
        } else {
            totalDayNightCount++;
            totalDayNightRevenue += b.monto_total;
        }
        totalExtrasRevenue += extrasAmount;

        // Bungalow specific stats
        const bNo = b.bungalow_numero;
        if (bungalowStats[bNo]) {
            bungalowStats[bNo].count++;
            bungalowStats[bNo].revenue += b.monto_total;
            bungalowStats[bNo].extras += extrasAmount;

            if (isFullDay) {
                bungalowStats[bNo].fullDayCount++;
                bungalowStats[bNo].fullDayRevenue += b.monto_total;
            } else {
                bungalowStats[bNo].dayNightCount++;
                bungalowStats[bNo].dayNightRevenue += b.monto_total;
            }

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

        // Populate Asesores stats
        let asesorNombre = b.asesor_registro ? b.asesor_registro.trim() : 'Sin Asesor';
        if (asesorNombre === '') asesorNombre = 'Sin Asesor';
        if (!asesoresMap[asesorNombre]) {
            asesoresMap[asesorNombre] = {
                count: 0,
                revenue: 0,
                bungalows: {} // { 1: count, 2: count }
            };
        }
        asesoresMap[asesorNombre].count++;
        asesoresMap[asesorNombre].revenue += b.monto_total || 0;

        if (!asesoresMap[asesorNombre].bungalows[b.bungalow_numero]) {
            asesoresMap[asesorNombre].bungalows[b.bungalow_numero] = 0;
        }
        asesoresMap[asesorNombre].bungalows[b.bungalow_numero]++;
    });

    // Calculate date range string based on period
    let rangeText = '';
    let totalDaysInPeriod = new Date(thisYear, thisMonth + 1, 0).getDate();

    if (period === 'day') {
        rangeText = 'hoy';
        totalDaysInPeriod = 1;
    } else if (period === 'week') {
        const formatShortDate = (dateStr) => {
            const p = dateStr.split('-');
            const monthsShort = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
            return `${parseInt(p[2])} ${monthsShort[parseInt(p[1]) - 1]}`;
        };
        rangeText = `semana: ${formatShortDate(currentWeekDays[0])} al ${formatShortDate(currentWeekDays[6])}`;
        totalDaysInPeriod = 7;
    } else {
        const firstDayOfMonth = new Date(thisYear, thisMonth, 1);
        const monthsShort = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
        rangeText = `mes: ${firstDayOfMonth.getDate()} ${monthsShort[firstDayOfMonth.getMonth()]} al ${todayObj.getDate()} ${monthsShort[todayObj.getMonth()]}`;
    }

    // Populate Top overview cards
    document.getElementById('statsIncomeMonth').textContent = `S/. ${totalRevenue.toFixed(2)}`;
    document.getElementById('statsCountMonth').textContent = `${monthBookings.length} reservas registradas (${rangeText})`;
    document.getElementById('statsDepositoMonth').textContent = `S/. ${depositoTotal.toFixed(2)}`;
    document.getElementById('statsOtrosMonth').textContent = `S/. ${otrosTotal.toFixed(2)}`;

    // Set new DOM elements
    document.getElementById('statsDayNightCount').textContent = totalDayNightCount;
    document.getElementById('statsDayNightRevenue').textContent = `S/. ${totalDayNightRevenue.toFixed(2)}`;
    document.getElementById('statsFullDayCount').textContent = totalFullDayCount;
    document.getElementById('statsFullDayRevenue').textContent = `S/. ${totalFullDayRevenue.toFixed(2)}`;
    document.getElementById('statsExtrasMonth').textContent = `S/. ${totalExtrasRevenue.toFixed(2)}`;

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
            <td style="padding: 12px 16px; color: #a78bfa;">${stats.dayNightCount} res. (S/. ${stats.dayNightRevenue.toFixed(2)})</td>
            <td style="padding: 12px 16px; color: #fbbf24;">${stats.fullDayCount} res. (S/. ${stats.fullDayRevenue.toFixed(2)})</td>
            <td style="padding: 12px 16px; color: #22d3ee;">S/. ${stats.extras.toFixed(2)}</td>
            <td style="padding: 12px 16px; font-weight: 700; color: #34d399;">S/. ${stats.revenue.toFixed(2)}</td>
        `;
        tableBody.appendChild(tr);
    }

    // Populate Occupancy Bars
    const occupancyContainer = document.getElementById('ocupacionContainer');
    occupancyContainer.innerHTML = '';

    for (let i = 1; i <= 6; i++) {
        const stats = bungalowStats[i];
        const percent = Math.min(100, Math.round((stats.daysOccupied / totalDaysInPeriod) * 100));

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

    // Populate Asesores Table
    const tableAsesoresBody = document.querySelector('#tableStatsAsesores tbody');
    if (tableAsesoresBody) {
        tableAsesoresBody.innerHTML = '';
        const asesoresList = Object.entries(asesoresMap)
            .map(([nombre, data]) => ({ nombre, ...data }))
            .sort((a, b) => b.revenue - a.revenue);

        if (asesoresList.length === 0) {
            tableAsesoresBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 20px;">No hay registros de asesores este mes.</td></tr>';
        } else {
            asesoresList.forEach(a => {
                // Determine top bungalows
                const topBungalows = Object.entries(a.bungalows)
                    .sort((x, y) => y[1] - x[1])
                    .map(x => `B${x[0]} (${x[1]})`)
                    .slice(0, 3) // Top 3
                    .join(', ');

                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid var(--border-color)';
                tr.innerHTML = `
                    <td style="padding: 12px 16px; font-weight: 600; color: white;">
                        ${a.nombre === 'Sin Asesor' ? '<span style="color:var(--text-muted); font-style:italic;">Sin Asesor</span>' : a.nombre}
                    </td>
                    <td style="padding: 12px 16px;">${a.count}</td>
                    <td style="padding: 12px 16px; font-weight: 700; color: #10b981;">S/. ${a.revenue.toFixed(2)}</td>
                    <td style="padding: 12px 16px; font-size: 13px; color: var(--text-secondary);">${topBungalows || '-'}</td>
                `;
                tableAsesoresBody.appendChild(tr);
            });
        }
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
// History logger (session and persistent scoped)
// ----------------------------------------------------
const sessionLogs = [];
function logSessionActivity(msg) {
    const time = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    sessionLogs.unshift({ time, msg });

    // Add to local/database audit log table
    saveAuditTrailToDb(msg);
}

async function saveAuditTrailToDb(actionDetails) {
    const entry = {
        action: 'bungalows',
        user_name: activeOperator,
        details: `[Bungalows] ${actionDetails}`,
        created_at: new Date().toISOString()
    };

    if (dbMode === 'supabase' && supabaseClient) {
        try {
            await supabaseClient.from('historial').insert([entry]);
        } catch (e) {
            console.warn("Fallo al escribir en tabla historial, guardando localmente:", e);
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
    localStorage.setItem('canchapro_historial_bungalows', JSON.stringify(history));
}

function getHistoryLocal() {
    const data = localStorage.getItem('canchapro_historial_bungalows');
    if (!data) return [];
    try {
        const history = JSON.parse(data);
        const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        return history.filter(e => new Date(e.created_at).getTime() > sevenDaysAgo);
    } catch (e) {
        return [];
    }
}

async function openHistoryModal() {
    const container = document.getElementById('activityList');
    const btnClearHistoryLocal = document.getElementById('btnClearHistoryLocal');
    container.innerHTML = '<p class="no-activity">Cargando historial...</p>';
    openModal('modalHistory');

    let entries = [];
    const sevenDaysAgoISO = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000)).toISOString();

    if (dbMode === 'supabase' && supabaseClient) {
        try {
            const { data, error } = await supabaseClient
                .from('historial')
                .select('*')
                .gt('created_at', sevenDaysAgoISO)
                .order('created_at', { ascending: false });

            if (error) throw error;
            entries = data || [];
            if (btnClearHistoryLocal) btnClearHistoryLocal.style.display = 'none';
        } catch (e) {
            console.warn("Fallo al obtener historial de Supabase, usando local:", e);
            entries = getHistoryLocal();
            if (btnClearHistoryLocal) btnClearHistoryLocal.style.display = 'inline-block';
        }
    } else {
        entries = getHistoryLocal();
        if (btnClearHistoryLocal && entries.length > 0) {
            btnClearHistoryLocal.style.display = 'inline-block';
        } else if (btnClearHistoryLocal) {
            btnClearHistoryLocal.style.display = 'none';
        }
    }

    // Filter to only include Bungalows logs
    entries = entries.filter(e => {
        const d = e.details || '';
        const act = e.action || '';
        return act === 'bungalows' || d.startsWith('[Bungalows]');
    });

    // Apply Search Filter Reactively
    const searchVal = document.getElementById('historySearchInput') ? document.getElementById('historySearchInput').value.trim().toLowerCase() : '';
    if (searchVal) {
        entries = entries.filter(e => {
            const user = (e.user_name || '').toLowerCase();
            const details = (e.details || '').toLowerCase();
            const action = (e.action || '').toLowerCase();
            return user.includes(searchVal) || details.includes(searchVal) || action.includes(searchVal);
        });
    }

    container.innerHTML = '';
    if (entries.length === 0) {
        container.innerHTML = '<p class="no-activity">No se encontraron registros en el historial.</p>';
        return;
    }

    // Group entries by day
    const groups = {};
    entries.forEach(entry => {
        const label = getDayGroupLabel(entry.created_at);
        if (!groups[label]) {
            groups[label] = [];
        }
        groups[label].push(entry);
    });

    let html = '';
    for (const [dayLabel, groupEntries] of Object.entries(groups)) {
        html += `<div class="activity-day-group" style="font-weight: 700; margin-top: 16px; margin-bottom: 8px; color: var(--primary); font-size: 12px; text-transform: uppercase;">${dayLabel}</div>`;
        html += groupEntries.map(entry => {
            let badgeColor = '#10b981'; // green for crear
            let badgeBg = 'rgba(16, 185, 129, 0.1)';
            let actionTextLabel = 'Crear';

            const detailsText = entry.details || '';
            if (entry.action === 'editar' || detailsText.toLowerCase().includes('edit') || detailsText.toLowerCase().includes('actualiz')) {
                badgeColor = '#f59e0b'; // orange for editar
                badgeBg = 'rgba(245, 158, 11, 0.1)';
                actionTextLabel = 'Editar';
            } else if (entry.action === 'eliminar' || detailsText.toLowerCase().includes('elimin') || detailsText.toLowerCase().includes('borrar')) {
                badgeColor = '#ef4444'; // red for eliminar
                badgeBg = 'rgba(239, 68, 68, 0.1)';
                actionTextLabel = 'Eliminar';
            }

            // Clean details (removing system prefix if present)
            let cleanDetails = detailsText;
            const systemPrefixes = ['[Canchas] ', '[Polideportivo] ', '[Bungalows] ', '[Locales] ', '[Asistencia] '];
            systemPrefixes.forEach(pref => {
                if (cleanDetails.startsWith(pref)) {
                    cleanDetails = cleanDetails.substring(pref.length);
                }
            });

            // Format timestamp relative
            const dateObj = new Date(entry.created_at);
            const timeAgo = formatLogTimestamp(entry.created_at);

            return `
                <div class="activity-item" style="margin-bottom: 8px; border-radius: var(--radius-lg); flex-direction: column; align-items: stretch; gap: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap;">
                        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                            <span style="font-size: 10px; font-weight: 600; text-transform: uppercase; padding: 2px 6px; border-radius: 6px; background: ${badgeBg}; color: ${badgeColor}; border: 1px solid rgba(255,255,255,0.03);">
                                ${actionTextLabel}
                            </span>
                            <span class="user-highlight" style="font-weight: 600; font-size: 13px; color: var(--text-primary);">${escapeHTML(entry.user_name)}</span>
                        </div>
                        <span class="activity-time" style="font-size: 11px; color: var(--text-muted); white-space: nowrap;">${timeAgo}</span>
                    </div>
                    <div class="activity-text" style="font-size: 13px; color: var(--text-secondary); line-height: 1.4;">
                        ${escapeHTML(cleanDetails)}
                    </div>
                </div>
            `;
        }).join('');
    }
    container.innerHTML = html;
}

function getDayGroupLabel(dateStr) {
    const today = new Date();
    const target = new Date(dateStr);
    const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const targetDate = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
    const diffDays = Math.round((todayDate - targetDate) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) {
        return "Hoy";
    } else if (diffDays === 1) {
        return "Ayer";
    } else {
        let label = target.toLocaleDateString('es-ES', {
            weekday: 'long',
            day: 'numeric',
            month: 'long'
        });
        return label.charAt(0).toUpperCase() + label.slice(1);
    }
}

function formatLogTimestamp(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    const timePart = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    return timePart;
}

// Escape HTML helper if not defined
function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g,
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
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

function populateFilterAsesoresDropdown() {
    const filterSelect = document.getElementById('filterAsesor');
    if (!filterSelect) return;

    const currentVal = filterSelect.value || 'TODOS';
    filterSelect.innerHTML = '<option value="TODOS">Todos los asesores</option>';

    // Obtener lista completa incluyendo asesores de las reservas existentes
    const advisorSet = new Set(activeAdvisorsList);
    if (typeof bookings !== 'undefined' && Array.isArray(bookings)) {
        bookings.forEach(b => {
            if (b.asesor_registro && b.asesor_registro.trim() && b.asesor_registro !== 'Sin Asesor') {
                advisorSet.add(b.asesor_registro.trim());
            }
        });
    }

    const sortedAdvisors = Array.from(advisorSet).filter(a => a).sort();
    sortedAdvisors.forEach(asesorName => {
        const opt = document.createElement('option');
        opt.value = asesorName;
        opt.textContent = asesorName;
        filterSelect.appendChild(opt);
    });

    const optSin = document.createElement('option');
    optSin.value = 'SIN_ASESOR';
    optSin.textContent = 'Sin Asesor';
    filterSelect.appendChild(optSin);

    filterSelect.value = currentVal;
    if (filterSelect.value !== currentVal) {
        filterSelect.value = 'TODOS';
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
    populateFilterAsesoresDropdown();
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

// ============================================================
// Touch scroll horizontal para el calendario (móvil)
// FullCalendar captura los touch events — los interceptamos
// ANTES que él (capture: true) para manejar el scroll.
// ============================================================
function initCalendarTouchScroll() {
    const wrapper = document.querySelector('.calendar-scroll-wrapper');
    if (!wrapper) return;

    let startX = 0, startY = 0, startScroll = 0;
    let scrolling = null; // null = sin decidir, true = horizontal, false = vertical

    // Fase de captura: interceptamos antes que FullCalendar
    wrapper.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        startScroll = wrapper.scrollLeft;
        scrolling = null;
    }, { passive: true, capture: true });

    wrapper.addEventListener('touchmove', (e) => {
        const dx = e.touches[0].clientX - startX;
        const dy = e.touches[0].clientY - startY;

        // Decidir dirección solo en el primer movimiento significativo
        if (scrolling === null && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
            scrolling = Math.abs(dx) > Math.abs(dy); // true = horizontal
        }

        if (scrolling === true) {
            // Es un deslizamiento horizontal → scrolleamos nosotros
            e.preventDefault();   // evitar que el browser haga scroll de página
            e.stopPropagation();  // evitar que FullCalendar lo reciba
            wrapper.scrollLeft = startScroll - dx;
        }
        // Si scrolling === false (vertical) → dejamos pasar normalmente
    }, { passive: false, capture: true });

    wrapper.addEventListener('touchend', () => {
        scrolling = null;
    }, { passive: true, capture: true });
}

// Inicializar al cargar el DOM
document.addEventListener('DOMContentLoaded', () => {
    // Pequeño delay para que FullCalendar renderice primero
    setTimeout(initCalendarTouchScroll, 600);

    // Setup period filter buttons for stats dashboard
    document.querySelectorAll('.filter-period-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const period = e.currentTarget.getAttribute('data-period');
            loadStatsDashboard(period);
        });
    });
});

function toggleSidebarHandler() {
    const sidebar = document.getElementById('sidebar');
    const sidebarBackdrop = document.getElementById('sidebarBackdrop');
    if (window.innerWidth <= 1024) {
        if (sidebar) {
            const isOpen = sidebar.classList.toggle('open') || sidebar.classList.toggle('active');
            if (sidebarBackdrop) sidebarBackdrop.classList.toggle('active', isOpen);
        }
    } else {
        const appContainer = document.querySelector('.app-container');
        if (appContainer) {
            const isCollapsed = appContainer.classList.toggle('sidebar-collapsed');
            localStorage.setItem('canchapro_sidebar_collapsed', isCollapsed ? 'true' : 'false');
        }
    }
}

function closeSidebarDrawer() {
    const sidebar = document.getElementById('sidebar');
    const sidebarBackdrop = document.getElementById('sidebarBackdrop');
    if (window.innerWidth <= 1024) {
        if (sidebar) {
            sidebar.classList.remove('open');
            sidebar.classList.remove('active');
        }
        if (sidebarBackdrop) sidebarBackdrop.classList.remove('active');
    } else {
        const appContainer = document.querySelector('.app-container');
        if (appContainer) {
            appContainer.classList.add('sidebar-collapsed');
            localStorage.setItem('canchapro_sidebar_collapsed', 'true');
        }
    }
}

function initSidebarState() {
    const savedState = localStorage.getItem('canchapro_sidebar_collapsed');
    const isCollapsed = savedState === null ? true : savedState === 'true';
    const appContainer = document.querySelector('.app-container');
    if (!appContainer) return;

    if (window.innerWidth > 1024) {
        if (isCollapsed) {
            appContainer.classList.add('sidebar-collapsed');
        } else {
            appContainer.classList.remove('sidebar-collapsed');
        }
    }
}
