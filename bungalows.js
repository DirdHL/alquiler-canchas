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
let mediosContactoList = []; // Medios de contacto (base + registrados en BD)
const ADD_MEDIO_VALUE = '_add_medio_';
const DEFAULT_MEDIOS = ['Facebook', 'TikTok', 'Instagram', 'Estado WSP', 'Msg masivo', 'Cliente frecuente', 'Recomendación', 'Afiche'];
let isTotalManuallyEdited = false;
let selectedDate = new Date();
let currentBungalowTab = 'all'; // Pestaña activa: '1'..'6' o 'all'
let editState = null; // Reserva en edición: { id, groupIds } (null si es una reserva nueva)
let isSavingBooking = false; // Evita guardar o eliminar dos veces con doble clic
let fetchBookingsSeq = 0; // Descarta respuestas viejas cuando se cruzan dos descargas

// Utility to format Date object to YYYY-MM-DD local date string
function getLocalDateString(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Constants
const PRICE_WEEKDAY = 160.00; // Tarifa diaria Lun-Jue (Día y Noche / Full Day / Por día de Horario Extendido)
const PRICE_WEEKEND = 180.00; // Tarifa diaria Vie-Dom (Día y Noche / Full Day / Por día de Horario Extendido)
const EXTRA_GUEST_FEE = 30.00; // Costo por persona adicional (actualizado a S/. 30)
const EXTRA_CHILD_FEE = 25.00; // Costo por niño adicional (S/. 25)

// Fechas con tarifa especial por bungalow (rangos inclusivos, YYYY-MM-DD).
// Reemplazan la tarifa de semana / fin de semana en esos días. Casa completa = 6 × precio.
const SPECIAL_RATES = [
    { from: '2026-12-24', to: '2026-12-27', price: 250.00 }, // Navidad (casa completa S/. 1500)
    { from: '2026-12-31', to: '2027-01-03', price: 250.00 }  // Año Nuevo (casa completa S/. 1500)
];

// Tarifa diaria de un bungalow para una fecha (Date)
function getDailyRate(date, isWeekend) {
    const dateStr = getLocalDateString(date);
    const special = SPECIAL_RATES.find(r => dateStr >= r.from && dateStr <= r.to);
    if (special) return special.price;
    return isWeekend ? PRICE_WEEKEND : PRICE_WEEKDAY;
}

// Desde cambios-229 (2026-10-06) "adicional_horas" guarda el PRECIO por hora en cada fila.
// Antes guardaba el MONTO total de las horas extra, solo en la fila principal del grupo.
const EXTRA_HOURS_PRICE_SINCE = '2026-10-06';
// Desde cambios-223 (2026-09-30) el total negociado se reparte entre las filas del grupo.
const SPLIT_TOTALS_SINCE = '2026-09-30';

function addDaysToDateString(dateStr, days) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return getLocalDateString(d);
}

// ----------------------------------------------------
// Grupos de reserva: una reserva de varios bungalows se guarda como una fila por bungalow
// con el mismo cliente, fechas y horario.
// ----------------------------------------------------
function isSameBookingGroup(a, b) {
    return a.estado_reserva !== 'Bloqueado' && b.estado_reserva !== 'Bloqueado' &&
        a.dni_cliente === b.dni_cliente &&
        a.nombre_cliente === b.nombre_cliente &&
        a.fecha_ingreso === b.fecha_ingreso &&
        a.fecha_salida === b.fecha_salida &&
        a.horario === b.horario;
}

function getBookingGroup(booking) {
    const rows = bookings.filter(b => isSameBookingGroup(b, booking));
    if (rows.length === 0) rows.push(booking);
    return rows.sort((a, b) => a.bungalow_numero - b.bungalow_numero);
}

function getBookingGroupKey(b) {
    return [b.dni_cliente, b.nombre_cliente, b.fecha_ingreso, b.fecha_salida, b.horario, b.estado_reserva]
        .map(v => String(v === null || v === undefined ? '' : v).trim()).join('|');
}

function isGroupEditMode() {
    const container = document.getElementById('groupEditToggleContainer');
    const toggle = document.getElementById('bookingEditGroupToggle');
    return !!(container && container.style.display !== 'none' && toggle && toggle.checked);
}

// Filas que se modificarán al guardar/eliminar desde el formulario (vacío si es una reserva nueva).
// Se usan los ids capturados al abrir el modal para no tocar filas que otro asesor agregó después.
function getEditTargetRows() {
    if (!editState) return [];
    const ids = isGroupEditMode() ? editState.groupIds : [editState.id];
    return bookings
        .filter(b => ids.some(id => String(id) === String(b.id)))
        .sort((a, b) => a.bungalow_numero - b.bungalow_numero);
}

// Monto cobrado por horas extra en una fila (ver EXTRA_HOURS_PRICE_SINCE)
function isLegacyExtraHoursRow(row) {
    return !!(row && row.created_at && String(row.created_at) < EXTRA_HOURS_PRICE_SINCE);
}

function getExtraHoursAmount(row) {
    const value = parseFloat(row && row.adicional_horas) || 0;
    if (isLegacyExtraHoursRow(row)) return value;
    return (parseInt(row && row.horas_extras) || 0) * value;
}

// ----------------------------------------------------
// Servicios especiales guardados al inicio de las notas: "🍷 (x2) 🎂 🏍️ - comentario"
// ----------------------------------------------------
const SERVICE_TOKEN_SRC = '(?:🍷\\s*\\(x\\d+\\)|🍷|🎂|🏍\\uFE0F?)';
const SERVICE_NOTES_RE = new RegExp(`^(${SERVICE_TOKEN_SRC}(?:\\s+${SERVICE_TOKEN_SRC})*)(?:\\s+-\\s+([\\s\\S]*)|\\s*)$`, 'u');

function parseServiceNotes(notes) {
    const text = (notes || '').trim();
    const match = text.match(SERVICE_NOTES_RE);
    if (!match) return { vino: 0, torta: false, cuatrimoto: false, comment: text };
    const icons = match[1];
    const wineCount = icons.match(/🍷\s*\(x(\d+)\)/u);
    return {
        vino: wineCount ? parseInt(wineCount[1]) : (icons.includes('🍷') ? 1 : 0),
        torta: icons.includes('🎂'),
        cuatrimoto: icons.includes('🏍'),
        comment: (match[2] || '').trim()
    };
}

function buildServiceNotes({ vino, torta, cuatrimoto, comment }) {
    const icons = [];
    if (vino > 0) icons.push(`🍷 (x${vino})`);
    if (torta) icons.push('🎂');
    if (cuatrimoto) icons.push('🏍️');
    const text = (comment || '').trim();
    if (icons.length === 0) return text;
    return icons.join(' ') + (text ? ' - ' + text : '');
}

function getServiceIcons(notes) {
    const s = parseServiceNotes(notes);
    return (s.vino > 0 ? '🍷' : '') + (s.torta ? '🎂' : '') + (s.cuatrimoto ? '🏍️' : '');
}

// Horas de ingreso y salida para mostrar (incluye las horas extra en cualquier turno)
function formatHour12(hour24, lowercase = false) {
    const h = ((hour24 % 24) + 24) % 24;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const text = `${h % 12 || 12}:00 ${ampm}`;
    return lowercase ? text.toLowerCase() : text;
}

function getScheduleHours(horario, extraHours = 0, lowercase = false) {
    let startHour = 15, endHour = 12; // Día y Noche
    if (horario === 'Full Day' || horario === 'Horario Extendido') {
        startHour = 9; endHour = 18;
    } else if (horario === '9am a 12pm') {
        startHour = 9; endHour = 12;
    }
    return {
        start: formatHour12(startHour, lowercase),
        end: formatHour12(endHour + (parseInt(extraHours) || 0), lowercase)
    };
}

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

    // 5.1 Initialize Availability Checker
    initAvailabilityChecker();

    // 5.2 Initialize Advisors Announcement Alert
    initAdvisorsAlert();

    // 5.3 Initialize Mobile Horizontal Recommendation Alert
    initMobileOrientationAlert();

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
    document.getElementById('btnOpenBlock').addEventListener('click', () => openBlockModal());
    document.getElementById('btnCloseBlock').addEventListener('click', () => closeModal('modalBlock'));
    document.getElementById('formBlock').addEventListener('submit', handleSaveBlock);
    document.getElementById('btnDeleteBlock').addEventListener('click', handleDeleteBlock);
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

    // Inventario de vino (compartido en Supabase si existe la tabla "inventario")
    updateVinoInventoryDisplay();
    const btnAddVino = document.getElementById('btnAddVino');
    if (btnAddVino) {
        btnAddVino.addEventListener('click', async () => {
            const display = document.getElementById('currentVinoCountDisplay');
            display.textContent = getVinoInventory();
            document.getElementById('addVinoAmount').value = 1;
            openModal('modalAddVino');
            display.textContent = await fetchVinoInventory();
        });
    }

    const btnCloseAddVino = document.getElementById('btnCloseAddVino');
    if (btnCloseAddVino) {
        btnCloseAddVino.addEventListener('click', () => closeModal('modalAddVino'));
    }

    const changeVinoInventory = async (sign) => {
        const amount = parseInt(document.getElementById('addVinoAmount').value) || 0;
        if (amount > 0) {
            const remaining = await adjustVinoInventory(sign * amount);
            if (remaining !== null) {
                logSessionActivity(`Inventario de vino ${sign > 0 ? 'aumentado' : 'reducido'} en ${amount} (quedan ${remaining}).`);
            }
        }
        closeModal('modalAddVino');
    };
    const btnConfirmAddVino = document.getElementById('btnConfirmAddVino');
    if (btnConfirmAddVino) btnConfirmAddVino.addEventListener('click', () => changeVinoInventory(1));
    const btnConfirmSubtractVino = document.getElementById('btnConfirmSubtractVino');
    if (btnConfirmSubtractVino) btnConfirmSubtractVino.addEventListener('click', () => changeVinoInventory(-1));

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

    // Si cambian fechas, horario o bungalows, el total vuelve a calcularse solo.
    // Se registra ANTES que los recálculos para que estos ya vean el cambio.
    ['bookingCheckIn', 'bookingCheckOut', 'bookingHorario'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', () => { isTotalManuallyEdited = false; });
    });
    document.querySelectorAll('input[name="bungalowSelect"]').forEach(chk => {
        chk.addEventListener('change', () => { isTotalManuallyEdited = false; });
    });

    // Handle extra hours input to toggle price field
    document.getElementById('bookingHorasExtras').addEventListener('input', syncExtraHoursPriceState);

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

    // Pago dividido: al escribir un monto, el otro se completa con lo que falta del total
    const splitEfectivoInput = document.getElementById('splitEfectivo');
    const splitYapeInput = document.getElementById('splitYape');
    const balanceSplit = (changed, other) => {
        const total = parseFloat(document.getElementById('bookingTotal').value) || 0;
        const value = parseFloat(changed.value) || 0;
        other.value = Math.max(0, total - value).toFixed(2);
    };
    splitEfectivoInput.addEventListener('input', () => balanceSplit(splitEfectivoInput, splitYapeInput));
    splitYapeInput.addEventListener('input', () => balanceSplit(splitYapeInput, splitEfectivoInput));

    // Editar grupo completo / solo este bungalow: recarga bungalows, ocupación y montos de las filas elegidas
    const toggleGroup = document.getElementById('bookingEditGroupToggle');
    if (toggleGroup) {
        toggleGroup.addEventListener('change', () => {
            const rows = getEditTargetRows();
            if (rows.length > 0) loadBookingRowsIntoForm(rows, { keepSchedule: true });
            runDynamicCalculations();
        });
    }

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
            // Día y Noche, Horario Extendido y 9am a 12pm: check-out default al día siguiente
            checkOutInput.disabled = false;
            if (checkIn) {
                const checkInDate = new Date(checkIn + 'T00:00:00');
                checkInDate.setDate(checkInDate.getDate() + 1);
                checkOutInput.value = getLocalDateString(checkInDate);
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
                checkOutInput.value = getLocalDateString(checkInDate);
            }
        }
        runDynamicCalculations();
    });

    // Split Payment visibility
    document.getElementById('bookingPaymentType').addEventListener('change', (e) => {
        const splitRow = document.getElementById('splitPaymentRow');
        if (e.target.value === 'Dividido') {
            splitRow.classList.remove('hidden');
            // Pre-fill values (mitad y mitad, sin perder centavos)
            const total = parseFloat(document.getElementById('bookingTotal').value) || 0;
            const [half1, half2] = splitInHalf(total);
            document.getElementById('splitEfectivo').value = half1.toFixed(2);
            document.getElementById('splitYape').value = half2.toFixed(2);
        } else {
            splitRow.classList.add('hidden');
        }
    });

    // Medio de contacto: opción "Agregar otro medio" abre el panel inline
    const sourceSelect = document.getElementById('bookingSource');
    sourceSelect.addEventListener('focus', () => {
        // Recordar la última selección válida para poder restaurarla si se cancela
        if (sourceSelect.value !== ADD_MEDIO_VALUE) sourceSelect.dataset.prev = sourceSelect.value;
    });
    sourceSelect.addEventListener('change', (e) => {
        if (e.target.value === ADD_MEDIO_VALUE) {
            openAddMedioPanel();
        } else {
            sourceSelect.dataset.prev = e.target.value;
            closeAddMedioPanel(false);
        }
    });
    document.getElementById('btnSaveMedio').addEventListener('click', handleSaveNewMedio);
    document.getElementById('btnCancelMedio').addEventListener('click', () => closeAddMedioPanel(true));
    document.getElementById('bookingSourceCustom').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault(); // Evita enviar el formulario de la reserva
            handleSaveNewMedio();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            closeAddMedioPanel(true);
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

    // (El bloqueo de horarios ahora se gestiona desde el botón "Bloquear" del calendario)

    // Bungalow Navigation Tabs (B1 a B6 y Ver Todos)
    const bungalowTabButtons = document.querySelectorAll('.bungalow-tab');
    bungalowTabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            bungalowTabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentBungalowTab = btn.dataset.bungalow;

            // Actualizar título principal
            const mainTitle = document.getElementById('mainPageTitle');
            if (mainTitle) {
                mainTitle.textContent = currentBungalowTab === 'all'
                    ? 'Calendario - Todos los Bungalows'
                    : `Calendario - Bungalow ${currentBungalowTab}`;
            }

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
            const errorEl = document.getElementById('bookingError');
            if (errorEl) {
                errorEl.textContent = '';
                errorEl.style.display = 'none';
            }
            
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
    const statsTabButtons = document.querySelectorAll('.stats-tabs .tab-btn');
    statsTabButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            statsTabButtons.forEach(b => {
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
    // Mantener bloqueado el scroll si queda otro modal abierto (ej. aviso de vino sobre la reserva)
    if (!document.querySelector('.modal-backdrop.active')) {
        document.body.classList.remove('no-scroll');
    }
}

// ----------------------------------------------------
// Inventario de vino: tabla "inventario" de Supabase (compartida entre asesores).
// Si la tabla no existe se usa el respaldo local de este navegador, como antes.
// ----------------------------------------------------
const VINO_INVENTORY_KEY = 'vino_bungalows';
const VINO_LOCAL_KEY = 'canchapro_inventory_vino_bungalows';
const VINO_DEFAULT = 12;
let vinoInventory = null;
let vinoInventoryShared = false;
let inventoryChannel = null;

function readLocalVinoInventory() {
    const value = parseInt(localStorage.getItem(VINO_LOCAL_KEY));
    return isNaN(value) ? VINO_DEFAULT : value;
}

function getVinoInventory() {
    return vinoInventory === null ? readLocalVinoInventory() : vinoInventory;
}

function updateVinoInventoryDisplay() {
    const el = document.getElementById('vinoInventoryCount');
    if (el) el.textContent = getVinoInventory();
}

async function fetchVinoInventory() {
    if (dbMode === 'supabase' && supabaseClient) {
        try {
            const selectRow = () => supabaseClient.from('inventario')
                .select('cantidad').eq('clave', VINO_INVENTORY_KEY).maybeSingle();
            let { data, error } = await selectRow();
            if (error) throw error;
            if (!data) {
                // Primera vez: se sube el conteo que tenía este navegador
                const { error: insErr } = await supabaseClient.from('inventario').upsert(
                    { clave: VINO_INVENTORY_KEY, cantidad: readLocalVinoInventory() },
                    { onConflict: 'clave', ignoreDuplicates: true }
                );
                if (insErr) throw insErr;
                ({ data, error } = await selectRow());
                if (error) throw error;
            }
            vinoInventory = data ? (parseInt(data.cantidad) || 0) : 0;
            vinoInventoryShared = true;
            updateVinoInventoryDisplay();
            return vinoInventory;
        } catch (err) {
            console.warn('Tabla "inventario" no disponible, usando el inventario local:', err.message || err);
        }
    }
    vinoInventoryShared = false;
    vinoInventory = readLocalVinoInventory();
    updateVinoInventoryDisplay();
    return vinoInventory;
}

// Suma (delta > 0) o resta (delta < 0) vinos. Devuelve el nuevo stock, o null si no se pudo guardar.
async function adjustVinoInventory(delta) {
    if (!delta) return getVinoInventory();
    if (vinoInventoryShared && dbMode === 'supabase' && supabaseClient) {
        try {
            // Función de la base de datos: suma/resta de forma atómica aunque dos asesores guarden a la vez
            const { data, error } = await supabaseClient.rpc('ajustar_inventario', { p_clave: VINO_INVENTORY_KEY, p_delta: delta });
            if (error) throw error;
            vinoInventory = parseInt(data) || 0;
            updateVinoInventoryDisplay();
            return vinoInventory;
        } catch (err) {
            console.error('No se pudo actualizar el inventario de vino en la nube:', err);
            alert('⚠️ No se pudo actualizar el inventario de vino en la nube: ' + (err.message || err) +
                '\nRevisa que exista la función "ajustar_inventario" (ver instrucciones_supabase.md).');
            return null;
        }
    }
    const next = Math.max(0, readLocalVinoInventory() + delta);
    localStorage.setItem(VINO_LOCAL_KEY, next);
    vinoInventory = next;
    updateVinoInventoryDisplay();
    return next;
}

function setupInventoryRealtime() {
    if (!supabaseClient || !vinoInventoryShared) return;
    if (inventoryChannel) supabaseClient.removeChannel(inventoryChannel);
    // Canal aparte: si la tabla no tiene tiempo real, no afecta al canal de reservas
    inventoryChannel = supabaseClient.channel('realtime_inventario_bungalows')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'inventario' }, () => fetchVinoInventory())
        .subscribe();
}

function syncExtraHoursPriceState() {
    const extraHours = parseInt(document.getElementById('bookingHorasExtras').value) || 0;
    const priceInput = document.getElementById('bookingAdicionalHoras');
    priceInput.disabled = extraHours <= 0;
    if (extraHours <= 0) priceInput.value = 0;
}

// Tipo de pago: si una reserva antigua tiene un valor que ya no está en la lista (ej. "Efectivo"),
// se agrega como opción temporal para no cambiarlo al guardar.
function setPaymentTypeValue(value) {
    const select = document.getElementById('bookingPaymentType');
    Array.from(select.options).filter(o => o.dataset && o.dataset.temp === '1').forEach(o => o.remove());
    const finalValue = value || 'Depósito';
    if (!Array.from(select.options).some(o => o.value === finalValue)) {
        const opt = document.createElement('option');
        opt.value = finalValue;
        opt.textContent = finalValue;
        opt.dataset.temp = '1';
        select.appendChild(opt);
    }
    select.value = finalValue;
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
    editState = null;
    const form = document.getElementById('formBooking');
    form.reset();
    setPaymentTypeValue('Depósito');
    syncExtraHoursPriceState();
    document.getElementById('bookingId').value = '';
    document.getElementById('modalTitle').textContent = 'Nueva Reserva de Bungalow';
    document.getElementById('btnDeleteBooking').classList.add('hidden');
    document.getElementById('groupEditToggleContainer').style.display = 'none';

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

    const vinoCantInput = document.getElementById('bookingVinoCant');
    if (vinoCantInput) vinoCantInput.value = 0;
    const tortaInput = document.getElementById('bookingTorta');
    if (tortaInput) tortaInput.checked = false;
    const cuatriInput = document.getElementById('bookingCuatrimoto');
    if (cuatriInput) cuatriInput.checked = false;

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
    closeAddMedioPanel(false);
    populateMediosDropdown(DEFAULT_MEDIOS[0]);
    document.getElementById('bookingName').required = true;
    document.getElementById('bookingDni').required = true;

    // Prepopulate inputs
    const today = new Date();
    const todayStr = getLocalDateString(today);
    const checkInVal = dateStr || todayStr;
    document.getElementById('bookingCheckIn').value = checkInVal;

    // Trigger schedule logic
    document.getElementById('bookingHorario').value = 'Día y Noche';
    document.getElementById('bookingCheckOut').disabled = false;
    const checkInDate = new Date(checkInVal + 'T00:00:00');
    checkInDate.setDate(checkInDate.getDate() + 1);
    document.getElementById('bookingCheckOut').value = getLocalDateString(checkInDate);

    // Preseleccionar el bungalow de la pestaña activa si no es 'all'
    if (currentBungalowTab !== 'all') {
        const bNum = parseInt(currentBungalowTab);
        const chk = document.querySelector(`input[name="bungalowSelect"][value="${bNum}"]`);
        if (chk) {
            chk.checked = true;
            document.getElementById('bookingBungalow').value = bNum;
        }
        updateNinosLimit();
        updatePersonasLimit();
    }

    // Prepopulate operator dynamically
    populateAsesoresDropdown(activeOperator);

    runDynamicCalculations();
    openModal('modalBooking');
}

// Open booking modal in EDIT mode
function openBookingEditModal(booking) {
    // Los bloqueos se editan desde su propio modal
    if (booking.estado_reserva === 'Bloqueado') {
        openBlockModal(booking);
        return;
    }
    // FullCalendar entrega una copia: se trabaja con la fila actual de la lista
    const original = bookings.find(b => String(b.id) === String(booking.id)) || booking;
    const group = getBookingGroup(original);
    editState = { id: original.id, groupIds: group.map(b => b.id) };

    document.getElementById('formBooking').reset();
    document.getElementById('modalTitle').textContent = 'Editar Reserva';
    document.getElementById('bookingId').value = original.id;
    document.getElementById('btnDeleteBooking').classList.remove('hidden');

    // Clear error
    const errorEl = document.getElementById('bookingError');
    errorEl.textContent = '';
    errorEl.style.display = 'none';

    // Reserva de varios bungalows: por defecto se edita el grupo completo
    const toggleContainer = document.getElementById('groupEditToggleContainer');
    const toggleCheck = document.getElementById('bookingEditGroupToggle');
    if (group.length > 1) {
        toggleContainer.style.display = 'block';
        toggleCheck.checked = true;
        document.getElementById('groupEditCount').textContent = group.length;
    } else {
        toggleContainer.style.display = 'none';
        toggleCheck.checked = false;
    }

    // Cliente, turno y fechas
    document.getElementById('bookingName').value = original.nombre_cliente || '';
    document.getElementById('bookingDni').value = original.dni_cliente || '';
    const phoneInput = document.getElementById('bookingPhone');
    if (phoneInput) phoneInput.value = original.telefono_cliente || '';
    document.getElementById('bookingHorario').value = original.horario;
    document.getElementById('bookingCheckIn').value = original.fecha_ingreso;
    document.getElementById('bookingCheckOut').value = original.fecha_salida;
    document.getElementById('bookingCheckOut').disabled = (original.horario === 'Full Day');

    // Servicios especiales y comentario (los emojis del comentario se conservan tal cual)
    const services = parseServiceNotes(original.notas || original.observaciones || '');
    document.getElementById('bookingVinoCant').value = services.vino;
    const tortaInput = document.getElementById('bookingTorta');
    if (tortaInput) tortaInput.checked = services.torta;
    const cuatriInput = document.getElementById('bookingCuatrimoto');
    if (cuatriInput) cuatriInput.checked = services.cuatrimoto;
    document.getElementById('bookingComment').value = services.comment;

    // Medio de contacto
    let medio = original.medio_contacto || '';
    if (medio === 'WhatsApp') {
        medio = 'Estado WSP';
    }
    // Si el medio guardado no está en la lista (registros antiguos), se agrega como opción temporal
    populateMediosDropdown(medio || DEFAULT_MEDIOS[0]);
    closeAddMedioPanel(false);

    // Asesor y tipo de pago guardados
    populateAsesoresDropdown(original.asesor_registro || '');
    setPaymentTypeValue(original.tipo_pago);

    // Secciones del formulario visibles
    document.getElementById('groupClientInfo').style.display = 'block';
    document.getElementById('rowClientDetails').style.display = 'flex';
    document.getElementById('rowOccupancy').style.display = 'grid';
    document.getElementById('rowExtras').style.display = 'flex';
    document.getElementById('rowMedioPago').style.display = 'flex';
    document.getElementById('bookingName').required = true;
    document.getElementById('bookingDni').required = true;

    // Bungalows, ocupación, horas extra y montos guardados (total, adelanto, pago dividido)
    loadBookingRowsIntoForm(group);

    runDynamicCalculations();
    openModal('modalBooking');
}

// Carga en el formulario bungalows, ocupación, horas extra y montos de las filas indicadas
// (el grupo completo o un solo bungalow) y decide si el total guardado fue negociado a mano.
function loadBookingRowsIntoForm(rows, { keepSchedule = false } = {}) {
    const sorted = [...rows].sort((a, b) => a.bungalow_numero - b.bungalow_numero);
    const primary = sorted[0];
    const count = sorted.length;
    const num = (value) => parseFloat(value) || 0;
    const sum = (fn) => sorted.reduce((acc, row) => acc + (fn(row) || 0), 0);

    // Bungalows seleccionados
    const numbers = sorted.map(r => parseInt(r.bungalow_numero));
    document.querySelectorAll('input[name="bungalowSelect"]').forEach(chk => {
        chk.checked = numbers.includes(parseInt(chk.value));
    });
    document.getElementById('bookingBungalow').value = numbers[0] || '';

    // Ocupación: hasta 4 personas por bungalow y el resto son adicionales.
    // Se suma todo el grupo porque los adicionales se guardan solo en la fila principal.
    const adultsOf = r => (r.adultos === null || r.adultos === undefined || r.adultos === '') ? 4 : (parseInt(r.adultos) || 0);
    const adicionales = sum(r => Math.max(0, adultsOf(r) - 4));
    const ninosPagantes = sum(r => parseInt(r.ninos_pagantes));
    document.getElementById('bookingPersonas').value = sum(r => Math.min(4, adultsOf(r)));
    document.getElementById('bookingAdicionales').value = adicionales;
    document.getElementById('bookingNinoPequeno').value = sum(r => parseInt(r.ninos_gratis));
    document.getElementById('bookingNinosAdicionales').value = ninosPagantes;
    updateNinosLimit();
    updatePersonasLimit();

    // Horas extra: cada fila guarda el precio por hora (las anteriores a cambios-229 guardaban el monto)
    const extraHours = parseInt(primary.horas_extras) || 0;
    let extraHoursPrice = num(primary.adicional_horas);
    if (isLegacyExtraHoursRow(primary)) {
        const money = sum(r => num(r.adicional_horas));
        extraHoursPrice = extraHours > 0 ? Math.round((money / (extraHours * count)) * 100) / 100 : 0;
    }
    document.getElementById('bookingHorasExtras').value = extraHours;
    document.getElementById('bookingAdicionalHoras').value = extraHoursPrice;
    syncExtraHoursPriceState();

    // Montos guardados: cada fila tiene su parte del total de la reserva
    const total = sum(r => num(r.monto_total));
    const adelanto = sum(r => num(r.monto_adelanto));
    document.getElementById('bookingTotal').value = total.toFixed(2);
    document.getElementById('bookingAdelanto').value = adelanto.toFixed(2);
    document.getElementById('bookingPendiente').value = Math.max(0, total - adelanto).toFixed(2);

    const isSplit = document.getElementById('bookingPaymentType').value === 'Dividido';
    document.getElementById('splitPaymentRow').classList.toggle('hidden', !isSplit);
    if (isSplit && sorted.every(r => r.tipo_pago === 'Dividido')) {
        document.getElementById('splitEfectivo').value = sum(r => num(r.monto_efectivo)).toFixed(2);
        document.getElementById('splitYape').value = sum(r => num(r.monto_yape)).toFixed(2);
    } else {
        const [half1, half2] = splitInHalf(total);
        document.getElementById('splitEfectivo').value = isSplit ? half1.toFixed(2) : '';
        document.getElementById('splitYape').value = isSplit ? half2.toFixed(2) : '';
    }

    // Si el total guardado no coincide con el calculado, fue un precio negociado y se respeta.
    // (Si ya se cambiaron fechas u horario en el formulario, el total vuelve a calcularse.)
    const expected = computeBookingPricing({
        checkIn: primary.fecha_ingreso, checkOut: primary.fecha_salida, horario: primary.horario,
        numBungalows: count, adicionales, ninosAdicionales: ninosPagantes, extraHours, extraHoursPrice
    });
    const scheduleChanged = keepSchedule && (
        document.getElementById('bookingCheckIn').value !== primary.fecha_ingreso ||
        document.getElementById('bookingCheckOut').value !== primary.fecha_salida ||
        document.getElementById('bookingHorario').value !== primary.horario
    );
    isTotalManuallyEdited = !scheduleChanged && Math.abs(total - expected.total) > 0.01;
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
        return getDailyRate(start, isWeekend);
    } else if (horario === '9am a 12pm') {
        const dayOfWeek = start.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6) {
            return 0; // Not allowed on weekends
        }
        return 250;
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

            totalBase += getDailyRate(current, isWeekend);
            current.setDate(current.getDate() + 1);
        }

        if (totalBase === 0) {
            const dayOfWeek = start.getDay();
            const isWeekend = (dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6);
            totalBase = getDailyRate(start, isWeekend);
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
            totalBase += getDailyRate(current, isWeekend);
            current.setDate(current.getDate() + 1);
        }

        if (totalBase === 0) {
            const dayOfWeek = start.getDay();
            const isWeekend = (dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6);
            totalBase = getDailyRate(start, isWeekend);
        }
        return totalBase;
    }
}

// Precio de una reserva: todos los bungalows seleccionados juntos
function computeBookingPricing({ checkIn, checkOut, horario, numBungalows = 1, adicionales = 0, ninosAdicionales = 0, extraHours = 0, extraHoursPrice = 0 }) {
    const n = Math.max(1, numBungalows || 1);
    const nights = calculateNights(checkIn, checkOut, horario);
    // Precio base multiplicado por la cantidad de bungalows
    const basePrice = calculateBasePrice(checkIn, checkOut, horario) * n;
    // Capacidad estándar: 4 personas por bungalow. Adultos adicionales S/. 30 y niños adicionales S/. 25, por noche
    const guestsFee = ((adicionales || 0) * EXTRA_GUEST_FEE + (ninosAdicionales || 0) * EXTRA_CHILD_FEE) * nights;
    // Horas extra: horas × precio por hora × bungalows
    const extrasTotal = (extraHours || 0) * (extraHoursPrice || 0) * n;
    return { nights, basePrice, guestsFee, extrasTotal, total: basePrice + guestsFee + extrasTotal };
}

// Divide un monto en dos partes que suman exactamente el total (sin perder centavos)
function splitInHalf(total) {
    const first = Math.round((total / 2) * 100) / 100;
    return [first, Math.round((total - first) * 100) / 100];
}

// Main Dynamic Calculation function
function runDynamicCalculations() {
    const breakdownBase = document.getElementById('breakdownBase');
    const breakdownGuests = document.getElementById('breakdownGuests');
    const breakdownExtras = document.getElementById('breakdownExtras');
    const breakdownAdvance = document.getElementById('breakdownAdvance');
    const breakdownRemaining = document.getElementById('breakdownRemaining');
    const totalInput = document.getElementById('bookingTotal');
    const adelantoInput = document.getElementById('bookingAdelanto');

    const checkIn = document.getElementById('bookingCheckIn').value;
    const checkOut = document.getElementById('bookingCheckOut').value;
    const horario = document.getElementById('bookingHorario').value;

    // Ayuda en el calendario del navegador: la salida mínima depende del turno
    document.getElementById('bookingCheckOut').min = checkIn
        ? (horario === 'Full Day' ? checkIn : addDaysToDateString(checkIn, 1))
        : '';

    const pricing = computeBookingPricing({
        checkIn, checkOut, horario,
        numBungalows: document.querySelectorAll('input[name="bungalowSelect"]:checked').length,
        adicionales: parseInt(document.getElementById('bookingAdicionales').value) || 0,
        ninosAdicionales: parseInt(document.getElementById('bookingNinosAdicionales').value) || 0,
        extraHours: parseInt(document.getElementById('bookingHorasExtras').value) || 0,
        extraHoursPrice: parseFloat(document.getElementById('bookingAdicionalHoras').value) || 0
    });
    const { basePrice, guestsFee, extrasTotal } = pricing;

    // Update form Total value ONLY if it's not manually overwritten
    if (!isTotalManuallyEdited && document.activeElement !== totalInput) {
        totalInput.value = pricing.total.toFixed(2);
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

    // Pago dividido: se respeta lo escrito si suma el total; si el total cambió, se ajusta el Yape
    if (document.getElementById('bookingPaymentType').value === 'Dividido') {
        const splitEfectivo = document.getElementById('splitEfectivo');
        const splitYape = document.getElementById('splitYape');
        if (document.activeElement !== splitEfectivo && document.activeElement !== splitYape) {
            const efectivo = parseFloat(splitEfectivo.value);
            const yape = parseFloat(splitYape.value) || 0;
            if (isNaN(efectivo) || efectivo < 0 || efectivo > finalTotal) {
                const [half1, half2] = splitInHalf(finalTotal);
                splitEfectivo.value = half1.toFixed(2);
                splitYape.value = half2.toFixed(2);
            } else if (Math.abs(efectivo + yape - finalTotal) > 0.005) {
                splitYape.value = (finalTotal - efectivo).toFixed(2);
            }
        }
    }

    // Call bungalow availability check dynamically
    updateBungalowAvailability();
}

// ----------------------------------------------------
// Calculations Engine Helpers: Availability check
// ----------------------------------------------------
function updateBungalowAvailability() {
    const checkIn = document.getElementById('bookingCheckIn').value;
    const checkOut = document.getElementById('bookingCheckOut').value;
    const horario = document.getElementById('bookingHorario').value;
    const extraHours = parseInt(document.getElementById('bookingHorasExtras').value) || 0;
    // En edición se ignoran solo las filas que se van a modificar (todo el grupo o solo este bungalow)
    const excludeIds = getEditTargetRows().map(b => b.id);

    const chkList = document.querySelectorAll('input[name="bungalowSelect"]');
    const hasDates = checkIn && checkOut && horario;

    chkList.forEach(chk => {
        const bungalowNo = parseInt(chk.value);
        const card = chk.closest('.bungalow-card');
        const statusBadge = card.querySelector('.bungalow-status');
        const conflict = hasDates ? checkBookingCollision(excludeIds, bungalowNo, checkIn, checkOut, horario, extraHours) : null;

        if (conflict && !chk.checked) {
            card.classList.add('disabled');
            chk.disabled = true;
            statusBadge.textContent = 'Ocupado';
            statusBadge.className = 'bungalow-status occupied';
        } else if (conflict) {
            // Ya estaba marcado: no se desmarca en silencio (se perdería un bungalow del grupo).
            // Queda marcado como "Ocupado" y al guardar se muestra con quién choca.
            card.classList.remove('disabled');
            chk.disabled = false;
            statusBadge.textContent = 'Ocupado';
            statusBadge.className = 'bungalow-status occupied';
        } else {
            card.classList.remove('disabled');
            chk.disabled = false;
            statusBadge.textContent = 'Disponible';
            statusBadge.className = 'bungalow-status available';
        }
    });
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

            // Directly test query on reservas_bungalows table1
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
                await fetchMediosContacto();
                await fetchVinoInventory();

                setupRealtimeListener();
                setupInventoryRealtime();
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
    fetchMediosContacto();
    fetchVinoInventory();
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
        .on('postgres_changes', { event: '*', schema: 'public', table: 'medios_contacto' }, async () => {
            await fetchMediosContacto();
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
    const seq = ++fetchBookingsSeq;
    let nextBookings;

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
                    .order('id', { ascending: true }) // orden estable entre páginas
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
            nextBookings = allData;
        } catch (err) {
            // Falla temporal de red: se conservan las reservas que ya estaban en pantalla
            console.error("Fallo al obtener reservas de Supabase, se mantienen los datos actuales:", err);
            return;
        }
    } else {
        nextBookings = readLocalBookings();
    }

    // Si mientras tanto empezó otra descarga más reciente, esta respuesta ya está vieja
    if (seq !== fetchBookingsSeq) return;

    const changed = JSON.stringify(nextBookings) !== JSON.stringify(bookings);
    bookings = nextBookings;
    if (!changed) return;

    // Refresh views
    populateFilterAsesoresDropdown();
    if (calendar) {
        calendar.refetchEvents();
    }
    updateDailySummaryList();
    updateAvailabilityGrid();
    updateDashboardStats();
    updateAvailabilityChecker();
}

function readLocalBookings() {
    try {
        const parsed = JSON.parse(localStorage.getItem('canchapro_reservas_bungalows') || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        console.error('El respaldo local de reservas está dañado:', e);
        return [];
    }
}

function saveLocalBookingsFallback() {
    localStorage.setItem('canchapro_reservas_bungalows', JSON.stringify(bookings));
}

// ----------------------------------------------------
// Save / Update / Delete Booking Handlers
// ----------------------------------------------------
async function handleSaveBooking(e) {
    e.preventDefault();
    // Doble clic o Enter repetido: si ya se está guardando no se vuelve a enviar (evita reservas duplicadas)
    if (isSavingBooking) return;
    isSavingBooking = true;
    const saveBtn = document.getElementById('btnSaveBooking');
    const saveBtnText = saveBtn.textContent;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Guardando...';
    try {
        await saveBookingFromForm();
    } finally {
        isSavingBooking = false;
        saveBtn.disabled = false;
        saveBtn.textContent = saveBtnText;
    }
}

// Valida las fechas según el turno. Devuelve el mensaje de error o '' si están bien.
function getBookingDateError(checkIn, checkOut, horario) {
    if (!checkIn || !checkOut) return '⚠️ Ingresa la fecha de ingreso y la fecha de salida.';
    if (horario === 'Full Day') return ''; // sale el mismo día
    if (checkOut <= checkIn) return '⚠️ La fecha de salida debe ser posterior a la fecha de ingreso.';
    if (horario === '9am a 12pm') {
        const dow = new Date(checkIn + 'T00:00:00').getDay();
        if (dow === 0 || dow === 5 || dow === 6) {
            return '⚠️ El turno de 9:00 AM a 12:00 PM del día siguiente solo está disponible para ingresos de Lunes a Jueves.';
        }
        if (checkOut !== addDaysToDateString(checkIn, 1)) {
            return '⚠️ El turno de 9:00 AM a 12:00 PM termina al día siguiente: la salida debe ser el día después del ingreso.';
        }
    }
    return '';
}

// Empareja las filas existentes con los bungalows elegidos para actualizarlas en su lugar (conservan su id)
// en vez de borrar todo y volver a crear: si la conexión falla a mitad, la reserva no se pierde.
function planGroupUpdate(existingRows, payloads) {
    const remaining = [...existingRows];
    const updates = [];
    const pending = [];
    payloads.forEach(p => {
        const idx = remaining.findIndex(r => parseInt(r.bungalow_numero) === parseInt(p.bungalow_numero));
        if (idx >= 0) updates.push({ id: remaining.splice(idx, 1)[0].id, payload: p });
        else pending.push(p);
    });
    const inserts = [];
    pending.forEach(p => {
        const row = remaining.shift(); // bungalow cambiado: se reutiliza una fila que quedó libre
        if (row) updates.push({ id: row.id, payload: p });
        else inserts.push(p);
    });
    return { updates, inserts, deletes: remaining.map(r => r.id) };
}

function newLocalId(index = 0) {
    return `local_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`;
}

// Aviso cuando se piden más vinos de los que hay. Resuelve true si el asesor decide continuar.
function confirmVinoShortage(currentInv, requested) {
    return new Promise((resolve) => {
        const missing = requested - currentInv;
        document.getElementById('vinoWarningText').innerHTML = `El inventario actual de vinos es <strong>${currentInv}</strong>, pero estás solicitando <strong>${requested}</strong>. Falta(n) <strong>${missing}</strong> vino(s).`;
        openModal('modalVinoWarning');

        const btnCancel = document.getElementById('btnCancelVinoWarning');
        const btnProceed = document.getElementById('btnProceedVinoWarning');
        const finish = (result) => {
            btnCancel.removeEventListener('click', onCancel);
            btnProceed.removeEventListener('click', onProceed);
            closeModal('modalVinoWarning');
            resolve(result);
        };
        const onCancel = () => finish(false);
        const onProceed = () => finish(true);
        btnCancel.addEventListener('click', onCancel);
        btnProceed.addEventListener('click', onProceed);
    });
}

async function saveBookingFromForm() {
    const errorEl = document.getElementById('bookingError');
    const showError = (html) => {
        errorEl.innerHTML = html;
        errorEl.style.display = 'block';
    };
    errorEl.textContent = '';
    errorEl.style.display = 'none';

    const id = document.getElementById('bookingId').value;
    const horario = document.getElementById('bookingHorario').value;
    const checkIn = document.getElementById('bookingCheckIn').value;
    const checkOutInput = document.getElementById('bookingCheckOut');
    if (horario === 'Full Day' && checkIn) checkOutInput.value = checkIn; // Full Day: sale el mismo día
    const checkOut = checkOutInput.value;

    // En edición: filas que se van a modificar (todo el grupo o solo este bungalow)
    const targetRows = id ? getEditTargetRows() : [];
    if (id && targetRows.length === 0) {
        return showError('⚠️ Esta reserva ya no existe (otro asesor pudo haberla eliminado). Cierra el formulario y revisa el calendario.');
    }

    // Obtener todos los bungalows seleccionados
    const selectedBungalows = Array.from(document.querySelectorAll('input[name="bungalowSelect"]:checked')).map(c => parseInt(c.value));
    if (selectedBungalows.length === 0) {
        return showError('⚠️ Por favor, seleccione al menos un Bungalow.');
    }

    const dateError = getBookingDateError(checkIn, checkOut, horario);
    if (dateError) return showError(dateError);

    const nameValue = document.getElementById('bookingName').value.trim();
    const dniValue = document.getElementById('bookingDni').value.trim();
    if (!nameValue) return showError('⚠️ El Nombre es obligatorio.');
    if (!dniValue) return showError('⚠️ El DNI es obligatorio.');

    const extraHours = parseInt(document.getElementById('bookingHorasExtras').value) || 0;

    // Choques con otras reservas o bloqueos (se ignoran solo las filas que se están editando)
    const excludeIds = targetRows.map(b => b.id);
    let conflictingBooking = null;
    for (const bNo of selectedBungalows) {
        conflictingBooking = checkBookingCollision(excludeIds, bNo, checkIn, checkOut, horario, extraHours);
        if (conflictingBooking) break;
    }
    if (conflictingBooking) {
        if (conflictingBooking.estado_reserva === 'Bloqueado') {
            return showError(`🔒 <strong>Horario bloqueado:</strong> El Bungalow ${escapeHTML(conflictingBooking.bungalow_numero)} no está disponible en este horario por mantenimiento/bloqueo (${escapeHTML(formatBlockRange(conflictingBooking))}).`);
        }
        const formatShort = (dateStr) => new Date(dateStr + 'T00:00:00').toLocaleDateString('es-PE', { day: 'numeric', month: 'short' });
        return showError(`⚠️ <strong>Conflicto de Reserva:</strong> El Bungalow ${escapeHTML(conflictingBooking.bungalow_numero)} ya está ocupado por <strong>${escapeHTML(conflictingBooking.nombre_cliente)}</strong> (${escapeHTML(conflictingBooking.horario)}) del ${formatShort(conflictingBooking.fecha_ingreso)} al ${formatShort(conflictingBooking.fecha_salida)}`);
    }

    const source = document.getElementById('bookingSource').value;
    if (!source || source === ADD_MEDIO_VALUE) {
        return showError('⚠️ Selecciona un Medio de Contacto (o guarda el nuevo medio antes de continuar).');
    }

    const paymentType = document.getElementById('bookingPaymentType').value;
    const totalCalculado = parseFloat(document.getElementById('bookingTotal').value) || 0;
    const adelantoTotal = parseFloat(document.getElementById('bookingAdelanto').value) || 0;
    const splitEfectivoTotal = parseFloat(document.getElementById('splitEfectivo').value) || 0;
    const splitYapeTotal = parseFloat(document.getElementById('splitYape').value) || 0;
    if (paymentType === 'Dividido' && Math.abs(splitEfectivoTotal + splitYapeTotal - totalCalculado) > 0.05) {
        return showError(`⚠️ En el pago dividido, Depósito + Yape (S/. ${(splitEfectivoTotal + splitYapeTotal).toFixed(2)}) debe ser igual al total (S/. ${totalCalculado.toFixed(2)}).`);
    }

    // Vino: solo se descuenta del inventario la diferencia con lo que ya tenía la reserva
    const cantVino = parseInt(document.getElementById('bookingVinoCant').value) || 0;
    const previousVino = targetRows.length > 0 ? parseServiceNotes(targetRows[0].notas || targetRows[0].observaciones).vino : 0;
    const vinoDelta = cantVino - previousVino;
    if (vinoDelta > 0) {
        const currentInv = await fetchVinoInventory();
        if (vinoDelta > currentInv && !(await confirmVinoShortage(currentInv, vinoDelta))) return;
    }

    const asesor = document.getElementById('bookingNotes').value;
    const adicionales = parseInt(document.getElementById('bookingAdicionales').value) || 0;
    const ninoPequeno = parseInt(document.getElementById('bookingNinoPequeno').value) || 0;
    const ninosAdicionales = parseInt(document.getElementById('bookingNinosAdicionales').value) || 0;
    const extraHoursPrice = parseFloat(document.getElementById('bookingAdicionalHoras').value) || 0;
    const totalBaseGuests = parseInt(document.getElementById('bookingPersonas').value) || 4;
    const nights = calculateNights(checkIn, checkOut, horario);
    const numBungalows = selectedBungalows.length;
    const phoneInput = document.getElementById('bookingPhone');
    const telefono = phoneInput ? phoneInput.value.trim() : (targetRows[0] ? (targetRows[0].telefono_cliente || '') : '');
    const notas = buildServiceNotes({
        vino: cantVino,
        torta: !!(document.getElementById('bookingTorta') && document.getElementById('bookingTorta').checked),
        cuatrimoto: !!(document.getElementById('bookingCuatrimoto') && document.getElementById('bookingCuatrimoto').checked),
        comment: document.getElementById('bookingComment').value
    });
    // Las filas editadas conservan su fecha de registro y, si son anteriores a cambios-229,
    // el formato antiguo de horas extra (monto total en la fila principal)
    const originalCreatedAt = targetRows.length > 0 ? targetRows[0].created_at : null;
    const legacyExtraHours = targetRows.length > 0 && isLegacyExtraHoursRow(targetRows[0]);

    // Función para dividir preservando centavos (la fila principal se lleva el residuo)
    function safeDivide(amount, count, idx) {
        if (amount <= 0) return 0;
        const base = Math.floor((amount * 100) / count) / 100;
        if (idx === 0) {
            const remainder = amount - (base * (count - 1));
            return Number(remainder.toFixed(2));
        }
        return base;
    }

    // Helper to generate the payload for a single bungalow (la fila 0 es la principal del grupo)
    function getPayloadForBungalow(bNo, index) {
        const payload = {
            bungalow_numero: bNo,
            fecha_ingreso: checkIn,
            fecha_salida: checkOut,
            horario: horario,
            estado_reserva: 'Confirmado',
            notas: notas,
            asesor_registro: asesor,
            tipo_pago: paymentType,
            medio_contacto: source,
            nombre_cliente: nameValue,
            dni_cliente: dniValue,
            telefono_cliente: telefono,
            // Cada bungalow lleva hasta 4 personas; la fila principal guarda además los adicionales
            adultos: Math.min(4, Math.max(0, totalBaseGuests - index * 4)) + (index === 0 ? adicionales : 0),
            ninos_gratis: (index < ninoPequeno) ? 1 : 0,
            ninos_pagantes: (index === 0 ? ninosAdicionales : 0),
            precio_base: calculateBasePrice(checkIn, checkOut, horario),
            adicional_personas: (index === 0 ? (adicionales * EXTRA_GUEST_FEE + ninosAdicionales * EXTRA_CHILD_FEE) * nights : 0),
            horas_extras: extraHours,
            adicional_horas: legacyExtraHours
                ? (index === 0 ? extraHours * extraHoursPrice * numBungalows : 0)
                : extraHoursPrice,
            alquiler_cuatrimoto: 0,
            cuatrimoto_monto: 0
        };

        // El total negociado (de todos los bungalows) se reparte entre las filas
        const singleTotalCalculado = (totalCalculado > 0)
            ? safeDivide(totalCalculado, numBungalows, index)
            : (payload.precio_base + payload.adicional_personas + extraHours * extraHoursPrice);
        payload.monto_total = singleTotalCalculado;
        payload.monto_adelanto = totalCalculado > 0 ? safeDivide(adelantoTotal, numBungalows, index) : 0;

        if (paymentType === 'Dividido') {
            payload.monto_efectivo = totalCalculado > 0 ? safeDivide(splitEfectivoTotal, numBungalows, index) : 0;
            payload.monto_yape = totalCalculado > 0 ? safeDivide(splitYapeTotal, numBungalows, index) : 0;
        } else if (paymentType === 'Efectivo' || paymentType === 'Depósito') {
            payload.monto_efectivo = singleTotalCalculado;
            payload.monto_yape = 0;
        } else if (paymentType === 'Yape') {
            payload.monto_efectivo = 0;
            payload.monto_yape = singleTotalCalculado;
        } else {
            payload.monto_efectivo = 0;
            payload.monto_yape = 0;
        }
        return payload;
    }

    const payloads = selectedBungalows.map((bNo, idx) => getPayloadForBungalow(bNo, idx));
    const bungalowsTxt = selectedBungalows.join(', ');

    if (dbMode === 'supabase' && supabaseClient) {
        let stepsDone = 0;
        try {
            if (!id) {
                // Modo Creación: insertar todos los bungalows seleccionados
                const { error } = await supabaseClient.from('reservas_bungalows').insert(payloads);
                if (error) throw error;
            } else {
                // Modo Edición: 1) bungalows nuevos, 2) actualizar los existentes, 3) quitar los desmarcados
                const plan = planGroupUpdate(targetRows, payloads);
                if (plan.inserts.length > 0) {
                    const rowsToInsert = plan.inserts.map(p => originalCreatedAt ? { ...p, created_at: originalCreatedAt } : p);
                    const { error } = await supabaseClient.from('reservas_bungalows').insert(rowsToInsert);
                    if (error) throw error;
                    stepsDone++;
                }
                for (const { id: rowId, payload } of plan.updates) {
                    const { error } = await supabaseClient.from('reservas_bungalows').update(payload).eq('id', rowId);
                    if (error) throw error;
                    stepsDone++;
                }
                if (plan.deletes.length > 0) {
                    const { error } = await supabaseClient.from('reservas_bungalows').delete().in('id', plan.deletes);
                    if (error) throw error;
                    stepsDone++;
                }
            }
        } catch (err) {
            console.error("Error al guardar en Supabase:", err);
            showError('Error al sincronizar con el servidor: ' + escapeHTML(err.message || String(err)) +
                (stepsDone > 0 ? '<br>⚠️ Una parte de los cambios sí se guardó: revisa esta reserva en el calendario antes de volver a intentarlo.' : ''));
            if (stepsDone > 0) await fetchBookings();
            return;
        }
    } else {
        // Local Save Fallback
        if (!id) {
            payloads.forEach((p, i) => bookings.push({ ...p, id: newLocalId(i), created_at: new Date().toISOString() }));
        } else {
            const plan = planGroupUpdate(targetRows, payloads);
            plan.updates.forEach(({ id: rowId, payload }) => {
                const idx = bookings.findIndex(b => String(b.id) === String(rowId));
                if (idx >= 0) bookings[idx] = { ...bookings[idx], ...payload };
            });
            plan.inserts.forEach((p, i) => bookings.push({ ...p, id: newLocalId(i), created_at: originalCreatedAt || new Date().toISOString() }));
            bookings = bookings.filter(b => !plan.deletes.some(delId => String(delId) === String(b.id)));
        }
        saveLocalBookingsFallback();
    }

    logSessionActivity(id
        ? `Reserva editada: ${nameValue} (${checkIn} al ${checkOut}) en bungalows [${bungalowsTxt}]`
        : `Nuevas reservas creadas para: ${nameValue} (${checkIn} al ${checkOut}) en bungalows [${bungalowsTxt}]`);

    // Inventario: se descuentan los vinos nuevos o se devuelven los que se quitaron
    if (vinoDelta !== 0) await adjustVinoInventory(-vinoDelta);

    closeModal('modalBooking');
    await fetchBookings();
}

async function handleDeleteBooking() {
    const id = document.getElementById('bookingId').value;
    if (!id || isSavingBooking) return;

    // Con "Editar Grupo Completo" marcado se elimina todo el grupo; si no, solo este bungalow
    const rows = getEditTargetRows();
    if (rows.length === 0) {
        alert('Esta reserva ya no existe (otro asesor pudo haberla eliminado).');
        closeModal('modalBooking');
        await fetchBookings();
        return;
    }
    const first = rows[0];
    const bungalowsTxt = rows.map(r => r.bungalow_numero).join(', ');
    const question = rows.length > 1
        ? `¿Eliminar la reserva de ${first.nombre_cliente} en los ${rows.length} bungalows del grupo (${bungalowsTxt})?`
        : `¿Estás seguro de que deseas eliminar la reserva de ${first.nombre_cliente} en el Bungalow ${first.bungalow_numero}?`;
    if (!confirm(question)) return;

    // El vino vuelve al inventario solo si se elimina la reserva completa y el asesor lo confirma
    const siblingsLeft = getBookingGroup(first).filter(b => !rows.some(r => String(r.id) === String(b.id)));
    const vinoCount = siblingsLeft.length === 0 ? parseServiceNotes(first.notas || first.observaciones).vino : 0;
    const returnVino = vinoCount > 0 &&
        confirm(`La reserva tenía ${vinoCount} vino(s). ¿Devolverlos al inventario?\n(Cancelar si ya se entregaron)`);

    isSavingBooking = true;
    const deleteBtn = document.getElementById('btnDeleteBooking');
    deleteBtn.disabled = true;
    try {
        const ids = rows.map(r => r.id);
        if (dbMode === 'supabase' && supabaseClient) {
            const { error } = await supabaseClient.from('reservas_bungalows').delete().in('id', ids);
            if (error) {
                console.error("Error al eliminar de Supabase:", error);
                alert("No se pudo eliminar de la base de datos: " + error.message);
                return;
            }
        } else {
            bookings = bookings.filter(b => !ids.some(delId => String(delId) === String(b.id)));
            saveLocalBookingsFallback();
        }
        logSessionActivity(`Reserva eliminada: ${first.nombre_cliente} (${first.fecha_ingreso} al ${first.fecha_salida}) en bungalows [${bungalowsTxt}]`);
        if (returnVino) await adjustVinoInventory(vinoCount);

        closeModal('modalBooking');
        await fetchBookings();
    } finally {
        isSavingBooking = false;
        deleteBtn.disabled = false;
    }
}

// Global helper to get the precise start and end datetimes for a booking, including extra hours
function getBookingInterval(checkInStr, checkOutStr, horarioStr, extraHours = 0) {
    let start, end;
    if (horarioStr === 'Full Day') {
        // Full Day: 9:00 AM to 6:00 PM on check-in day
        start = new Date(checkInStr + 'T09:00:00');
        end = new Date(checkInStr + 'T18:00:00');
    } else if (horarioStr === '9am a 12pm') {
        start = new Date(checkInStr + 'T09:00:00');
        end = new Date(checkOutStr + 'T12:00:00');
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
    // Agregar 1 hora de margen para limpieza
    end.setHours(end.getHours() + 1);

    return { start, end };
}

// Collision Check logic
// excludeIds: ids de las filas que se están editando (no cuentan como choque). Puede ser null para reservas nuevas.
function checkBookingCollision(excludeIds, bungalow, checkIn, checkOut, horario, extraHours = 0) {
    const excluded = (Array.isArray(excludeIds) ? excludeIds : (excludeIds ? [excludeIds] : [])).map(String);
    const newInterval = getBookingInterval(checkIn, checkOut, horario, extraHours);

    return bookings.find(b => {
        if (excluded.includes(String(b.id))) return false;

        // Only check same bungalow
        if (parseInt(b.bungalow_numero) !== parseInt(bungalow)) return false;

        const oldInterval = getRecordInterval(b);

        // Date overlap check: (StartA < EndB) and (EndA > StartB)
        return (newInterval.start < oldInterval.end) && (newInterval.end > oldInterval.start);
    });
}

// ----------------------------------------------------
// Bloqueo de horarios personalizados (rango exacto fecha/hora)
// ----------------------------------------------------
// Intervalo real de un registro: si es un bloqueo con rango exacto lo usa tal cual;
// de lo contrario calcula el intervalo según el turno de la reserva.
function getRecordInterval(b) {
    if (b.bloqueo_inicio && b.bloqueo_fin) {
        return { start: new Date(b.bloqueo_inicio), end: new Date(b.bloqueo_fin) };
    }
    return getBookingInterval(b.fecha_ingreso, b.fecha_salida, b.horario, b.horas_extras || 0);
}

// Solapamiento genérico: (inicioA < finB) && (finA > inicioB)
function checkIntervalCollision(excludeId, bungalow, start, end) {
    return bookings.find(b => {
        if (excludeId && String(b.id) === String(excludeId)) return false;
        if (b.bungalow_numero !== bungalow) return false;
        const iv = getRecordInterval(b);
        return start < iv.end && end > iv.start;
    });
}

function toDateTimeLocalValue(d) {
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function formatBlockRange(b) {
    const iv = getRecordInterval(b);
    const opts = { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true };
    return `${iv.start.toLocaleString('es-PE', opts)} – ${iv.end.toLocaleString('es-PE', opts)}`;
}

function openBlockModal(block = null) {
    const form = document.getElementById('formBlock');
    form.reset();
    const errorEl = document.getElementById('blockError');
    errorEl.textContent = '';
    errorEl.style.display = 'none';

    const chks = document.querySelectorAll('input[name="blockBungalow"]');
    chks.forEach(c => { c.checked = false; c.disabled = false; });

    if (block) {
        document.getElementById('blockModalTitle').textContent = '🔒 Editar Bloqueo';
        document.getElementById('blockId').value = block.id;
        document.getElementById('btnDeleteBlock').classList.remove('hidden');
        chks.forEach(c => {
            c.checked = parseInt(c.value) === block.bungalow_numero;
            c.disabled = true; // un registro de bloqueo pertenece a un solo bungalow
        });
        const iv = getRecordInterval(block);
        document.getElementById('blockStart').value = toDateTimeLocalValue(iv.start);
        document.getElementById('blockEnd').value = toDateTimeLocalValue(iv.end);
        const reason = (block.nombre_cliente || '').replace(/^🔒 Bloqueo:\s*/, '');
        document.getElementById('blockReason').value = reason === 'Mantenimiento' ? '' : reason;
    } else {
        document.getElementById('blockModalTitle').textContent = '🔒 Bloquear Bungalow';
        document.getElementById('blockId').value = '';
        document.getElementById('btnDeleteBlock').classList.add('hidden');
        if (currentBungalowTab !== 'all') {
            const chk = document.querySelector(`input[name="blockBungalow"][value="${parseInt(currentBungalowTab)}"]`);
            if (chk) chk.checked = true;
        }
        const base = new Date(selectedDate || new Date());
        base.setHours(8, 0, 0, 0);
        const end = new Date(base);
        end.setHours(20, 0, 0, 0);
        document.getElementById('blockStart').value = toDateTimeLocalValue(base);
        document.getElementById('blockEnd').value = toDateTimeLocalValue(end);
    }
    openModal('modalBlock');
}

async function handleSaveBlock(e) {
    e.preventDefault();
    if (isSavingBooking) return; // evita bloqueos duplicados por doble clic
    isSavingBooking = true;
    const saveBtn = document.getElementById('btnSaveBlock');
    saveBtn.disabled = true;
    try {
        await saveBlockFromForm();
    } finally {
        isSavingBooking = false;
        saveBtn.disabled = false;
    }
}

async function saveBlockFromForm() {
    const errorEl = document.getElementById('blockError');
    const showErr = (html) => { errorEl.innerHTML = html; errorEl.style.display = 'block'; };
    errorEl.style.display = 'none';

    const id = document.getElementById('blockId').value;
    const startVal = document.getElementById('blockStart').value;
    const endVal = document.getElementById('blockEnd').value;
    const reason = document.getElementById('blockReason').value.trim();
    const selected = Array.from(document.querySelectorAll('input[name="blockBungalow"]:checked')).map(c => parseInt(c.value));

    if (selected.length === 0) return showErr('⚠️ Selecciona al menos un bungalow.');
    if (!startVal || !endVal) return showErr('⚠️ La fecha y hora de inicio y de fin son obligatorias.');

    const start = new Date(startVal);
    const end = new Date(endVal);
    if (isNaN(start) || isNaN(end)) return showErr('⚠️ Fechas inválidas.');
    if (end <= start) return showErr('⚠️ La fecha/hora de fin debe ser posterior a la de inicio.');

    // Validación de solapamiento contra reservas y otros bloqueos
    for (const bNo of selected) {
        const conflict = checkIntervalCollision(id, bNo, start, end);
        if (conflict) {
            const what = conflict.estado_reserva === 'Bloqueado'
                ? `ya tiene otro bloqueo (${formatBlockRange(conflict)})`
                : `tiene una reserva de <strong>${escapeHTML(conflict.nombre_cliente || '')}</strong> (${formatBlockRange(conflict)})`;
            return showErr(`⚠️ El Bungalow ${bNo} ${what} que se cruza con este horario.`);
        }
    }

    const pad = n => String(n).padStart(2, '0');
    const dateOnly = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const ts = d => `${dateOnly(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;

    const buildPayload = (bNo) => ({
        bungalow_numero: bNo,
        fecha_ingreso: dateOnly(start),
        fecha_salida: dateOnly(end),
        horario: 'Bloqueo Personalizado',
        estado_reserva: 'Bloqueado',
        bloqueo_inicio: ts(start),
        bloqueo_fin: ts(end),
        nombre_cliente: reason || 'Mantenimiento',
        dni_cliente: '',
        telefono_cliente: '',
        notas: '',
        asesor_registro: activeOperator || '',
        tipo_pago: 'Efectivo',
        medio_contacto: '',
        adultos: 0, ninos_gratis: 0, ninos_pagantes: 0,
        precio_base: 0, adicional_personas: 0, horas_extras: 0, adicional_horas: 0,
        alquiler_cuatrimoto: 0, cuatrimoto_monto: 0,
        monto_total: 0, monto_adelanto: 0, monto_efectivo: 0, monto_yape: 0
    });

    if (dbMode === 'supabase' && supabaseClient) {
        try {
            if (id) {
                const { error } = await supabaseClient.from('reservas_bungalows')
                    .update(buildPayload(selected[0])).eq('id', id);
                if (error) throw error;
            } else {
                const { error } = await supabaseClient.from('reservas_bungalows')
                    .insert(selected.map(buildPayload));
                if (error) throw error;
            }
        } catch (err) {
            console.error('Error al guardar bloqueo:', err);
            return showErr('Error al sincronizar con el servidor: ' + err.message +
                ' (¿ejecutaste el SQL de las columnas bloqueo_inicio / bloqueo_fin?)');
        }
    } else {
        if (id) {
            const idx = bookings.findIndex(b => String(b.id) === String(id));
            if (idx >= 0) bookings[idx] = { ...bookings[idx], ...buildPayload(selected[0]) };
        } else {
            selected.forEach((bNo, i) => {
                const p = buildPayload(bNo);
                p.id = 'local_' + Date.now() + '_' + i;
                p.created_at = new Date().toISOString();
                bookings.push(p);
            });
        }
        saveLocalBookingsFallback();
    }

    logSessionActivity(`Bloqueo ${id ? 'editado' : 'creado'} en bungalows [${selected.join(', ')}]: ${ts(start)} → ${ts(end)}`);
    closeModal('modalBlock');
    await fetchBookings();
}

async function handleDeleteBlock() {
    const id = document.getElementById('blockId').value;
    if (!id) return;
    if (!confirm('¿Eliminar este bloqueo?')) return;

    if (dbMode === 'supabase' && supabaseClient) {
        const { error } = await supabaseClient.from('reservas_bungalows').delete().eq('id', id);
        if (error) {
            alert('No se pudo eliminar el bloqueo: ' + error.message);
            return;
        }
    } else {
        bookings = bookings.filter(b => String(b.id) !== String(id));
        saveLocalBookingsFallback();
    }
    logSessionActivity(`Bloqueo ${id} eliminado.`);
    closeModal('modalBlock');
    await fetchBookings();
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
        handleWindowResize: true,
        dayMaxEvents: false, // Muestra todos los eventos sin ocultar nada
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
        eventContent: function (arg) {
            const b = arg.event.extendedProps;
            if (!b) return { html: arg.event.title };

            const isBlocked = b.estado_reserva === 'Bloqueado';
            if (isBlocked) {
                const reason = (b.nombre_cliente && !b.nombre_cliente.startsWith('🔒')) ? b.nombre_cliente : 'Bloqueado';
                const rangeLine = b.bloqueo_inicio ? `<div class="fc-event-line-3">🕒 ${formatBlockRange(b)}</div>` : '';
                return {
                    html: `<div class="fc-event-custom-card multi-line">
                        <div class="fc-event-line-1">🔒 <strong>B${b.bungalow_numero} BLOQUEADO</strong></div>
                        <div class="fc-event-line-2">${escapeHTML(reason)}</div>${rangeLine}
                    </div>`
                };
            }

            // Horas de ingreso/salida (las horas extra se suman en cualquier turno)
            const hours = getScheduleHours(b.horario, b.horas_extras);
            const startHour = hours.start;
            const endHour = hours.end;

            let emoji = '☀️🌙';
            if (b.horario === 'Full Day') emoji = '☀️';
            else if (b.horario === 'Horario Extendido') emoji = '✨';
            else if (b.horario === '9am a 12pm') emoji = '🌅';

            // Servicios especiales (vino, torta, cuatrimoto) guardados al inicio de las notas
            const serviceIcons = getServiceIcons(b.notas);
            if (serviceIcons) emoji = emoji + ' ' + serviceIcons;

            if (currentBungalowTab !== 'all') {
                // Vista de Bungalow Individual: Mostrar toda la información aprovechando el espacio vertical
                return {
                    html: `<div class="fc-event-custom-card multi-line">
                        <div class="fc-event-line-1">${emoji} <strong>${escapeHTML(b.nombre_cliente)}</strong></div>
                        <div class="fc-event-line-2">${escapeHTML(b.horario)}</div>
                        <div class="fc-event-line-3">🕒 ${startHour} a ${endHour}</div>
                    </div>`
                };
            } else {
                // Vista "Ver Todos": Más compacto para que entren varios
                return {
                    html: `<div class="fc-event-custom-card compact">
                        <div class="fc-event-line-compact"><strong>${emoji} B${b.bungalow_numero}:</strong> ${escapeHTML(b.nombre_cliente)} (${startHour} - ${endHour})</div>
                    </div>`
                };
            }
        },
        events: function (info, successCallback, failureCallback) {
            const isSmallScreen = window.innerWidth <= 768;
            const fcEvents = bookings.map(b => {
                const isBlocked = b.estado_reserva === 'Bloqueado';

                // Calcular horas de entrada y salida
                const hours = getScheduleHours(b.horario, b.horas_extras);
                const timeStr = `${hours.start} a ${hours.end}`;
                let emoji = '☀️🌙';
                if (b.horario === 'Full Day') emoji = '☀️';
                else if (b.horario === 'Horario Extendido') emoji = '✨';
                else if (b.horario === '9am a 12pm') emoji = '🌅';

                let title = "";
                if (isBlocked) {
                    const reason = (b.nombre_cliente && !b.nombre_cliente.startsWith('🔒')) ? b.nombre_cliente : 'Bloqueado';
                    title = `🔒 B${b.bungalow_numero}: ${reason}`;
                } else {
                    if (isSmallScreen) {
                        title = `${emoji} B${b.bungalow_numero}: ${b.nombre_cliente} (${timeStr})`;
                    } else {
                        title = `${emoji} B${b.bungalow_numero}: ${b.nombre_cliente} | ${b.horario} (${timeStr})`;
                    }
                }

                // For FullCalendar display, the end date is exclusive.
                // We add 1 day to the checkout date so it highlights the grid cell correctly.
                const checkOutDate = new Date(b.fecha_salida + 'T00:00:00');
                checkOutDate.setDate(checkOutDate.getDate() + 1);
                const exclusiveCheckOutStr = getLocalDateString(checkOutDate);

                let scheduleClass = 'event-horario-dianoche';
                if (b.horario === 'Full Day') {
                    scheduleClass = 'event-horario-fullday';
                } else if (b.horario === 'Horario Extendido') {
                    scheduleClass = 'event-horario-extendido';
                }

                let eventClass = isBlocked
                    ? 'event-bungalow-blocked'
                    : `event-bungalow-${b.bungalow_numero} ${scheduleClass}`;

                return {
                    id: b.id,
                    title: title,
                    start: b.fecha_ingreso,
                    end: exclusiveCheckOutStr,
                    allDay: true,
                    className: eventClass,
                    extendedProps: b
                };
            });

            // Filter out disabled bungalows and advisor filter from the sidebar filters
            const filterAsesorVal = document.getElementById('filterAsesor') ? document.getElementById('filterAsesor').value : 'TODOS';
            const filteredEvents = fcEvents.filter(event => {
                const bNo = event.extendedProps.bungalow_numero;

                // Filtrar según la pestaña activa (B1 a B6 o Todos)
                if (currentBungalowTab !== 'all' && bNo !== parseInt(currentBungalowTab)) {
                    return false;
                }

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
            // FullCalendar select's end is exclusive. We subtract 1 day to get inclusive check-out.
            // (Se usa info.end, que está en hora local; new Date('YYYY-MM-DD') se interpreta en UTC y en Perú da un día menos)
            const endInclusive = new Date(info.end);
            endInclusive.setDate(endInclusive.getDate() - 1);
            const endStr = getLocalDateString(endInclusive);

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
        // Filtrar según la pestaña activa
        if (currentBungalowTab !== 'all' && b.bungalow_numero !== parseInt(currentBungalowTab)) {
            return false;
        }

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
                    <span class="summary-item-time">${escapeHTML(b.horario)}</span>
                    <span class="summary-item-court bungalow-badge-${b.bungalow_numero}">Bungalow ${b.bungalow_numero}</span>
                </div>
                <div class="summary-item-client">${escapeHTML(b.nombre_cliente)}</div>
                <div class="summary-item-details">
                    <span class="summary-detail-tag">
                        <i data-lucide="calendar"></i> ${checkInFormatted} al ${checkOutFormatted}
                    </span>
                    <span class="summary-detail-tag">
                        <i data-lucide="users"></i> ${b.adultos || 4} pers.${((b.ninos_gratis || 0) + (b.ninos_pagantes || 0)) > 0 ? ` + ${(b.ninos_gratis || 0) + (b.ninos_pagantes || 0)} niño(s)` : ''}
                    </span>
                </div>
                <div class="summary-item-header" style="margin-top: 6px; border-top: 1px solid rgba(255, 255, 255, 0.05); padding-top: 8px;">
                    <span style="font-size: 11px; color: var(--text-muted);">Asesor: ${escapeHTML(b.asesor_registro)}</span>
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
            const isTabActive = (currentBungalowTab === 'all' || parseInt(currentBungalowTab) === bNum);

            html += `<td style="padding: 6px 8px; border-bottom: 1px solid var(--border-color); vertical-align: top; text-align: center; ${isTabActive ? '' : 'opacity: 0.35;'}">`;

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
                const interval = getRecordInterval(b);
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

                        if (b.horario !== 'Full Day' && b.horario !== 'Horario Extendido' && b.horario !== '9am a 12pm' && (b.horas_extras || 0) > 0) {
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
                const oldInterval = getRecordInterval(b);
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

// ----------------------------------------------------
// Smart Availability Checker Functions
// ----------------------------------------------------
function initAvailabilityChecker() {
    const checkDateIn = document.getElementById('checkDateIn');
    const checkHorario = document.getElementById('checkHorario');
    const checkDateOut = document.getElementById('checkDateOut');
    const btnQuickToday = document.getElementById('btnQuickToday');
    const btnQuickTomorrow = document.getElementById('btnQuickTomorrow');
    const btnQuickWeekend = document.getElementById('btnQuickWeekend');

    if (!checkDateIn || !checkDateOut || !checkHorario) return;

    // Default dates (Hoy -> Mañana)
    const today = new Date();
    const todayStr = getLocalDateString(today);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = getLocalDateString(tomorrow);

    checkDateIn.value = todayStr;
    checkDateOut.value = tomorrowStr;

    // Listeners para cambio de horario y fechas
    checkHorario.addEventListener('change', () => {
        const horario = checkHorario.value;
        const inDate = new Date(checkDateIn.value + 'T00:00:00');
        if (horario === 'Full Day') {
            checkDateOut.value = checkDateIn.value;
            checkDateOut.disabled = true;
        } else {
            checkDateOut.disabled = false;
            inDate.setDate(inDate.getDate() + 1);
            checkDateOut.value = getLocalDateString(inDate);
        }
        updateAvailabilityChecker();
    });

    checkDateIn.addEventListener('change', () => {
        const horario = checkHorario.value;
        const inDate = new Date(checkDateIn.value + 'T00:00:00');
        if (horario === 'Full Day') {
            checkDateOut.value = checkDateIn.value;
        } else {
            inDate.setDate(inDate.getDate() + 1);
            checkDateOut.value = getLocalDateString(inDate);
        }
        updateAvailabilityChecker();
    });

    checkDateOut.addEventListener('change', updateAvailabilityChecker);

    // "Hoy" y "Mañana" se calculan al hacer clic (la página puede quedar abierta pasada la medianoche)
    if (btnQuickToday) {
        btnQuickToday.addEventListener('click', () => {
            const currentToday = getLocalDateString(new Date());
            checkDateIn.value = currentToday;
            checkHorario.value = 'Día y Noche';
            checkDateOut.disabled = false;
            checkDateOut.value = addDaysToDateString(currentToday, 1);
            updateAvailabilityChecker();
        });
    }

    if (btnQuickTomorrow) {
        btnQuickTomorrow.addEventListener('click', () => {
            const currentToday = getLocalDateString(new Date());
            checkDateIn.value = addDaysToDateString(currentToday, 1);
            checkHorario.value = 'Día y Noche';
            checkDateOut.disabled = false;
            checkDateOut.value = addDaysToDateString(currentToday, 2);
            updateAvailabilityChecker();
        });
    }

    if (btnQuickWeekend) {
        btnQuickWeekend.addEventListener('click', () => {
            const sat = new Date();
            const dayOfWeek = sat.getDay();
            const daysUntilSat = (6 - dayOfWeek + 7) % 7 || 7;
            sat.setDate(sat.getDate() + daysUntilSat);
            const mon = new Date(sat);
            mon.setDate(mon.getDate() + 2);

            checkDateIn.value = getLocalDateString(sat);
            checkHorario.value = 'Día y Noche';
            checkDateOut.disabled = false;
            checkDateOut.value = getLocalDateString(mon);
            updateAvailabilityChecker();
        });
    }

    updateAvailabilityChecker();
}

function initAdvisorsAlert() {
    const alertEl = document.getElementById('advisorsUpdateAlert');
    const closeBtn = document.getElementById('btnCloseAdvisorsAlert');
    if (!alertEl) return;

    // Configuración de expiración de 3 días (72 horas)
    const STORAGE_KEY_EXPIRED = 'canchapro_advisors_alert_expiry_v1';
    const STORAGE_KEY_CLOSED = 'canchapro_advisors_alert_dismissed_v1';

    const now = Date.now();
    let expiry = localStorage.getItem(STORAGE_KEY_EXPIRED);
    if (!expiry) {
        // 3 días = 3 * 24 * 60 * 60 * 1000 = 259,200,000 ms
        expiry = now + (3 * 24 * 60 * 60 * 1000);
        localStorage.setItem(STORAGE_KEY_EXPIRED, expiry);
    } else {
        expiry = parseInt(expiry);
    }

    const isClosed = localStorage.getItem(STORAGE_KEY_CLOSED) === 'true';

    // Si ya pasaron los 3 días o la asesora ya lo cerró voluntariamente
    if (now > expiry || isClosed) {
        alertEl.style.display = 'none';
        return;
    }

    // Mostrar el cartel destacado
    alertEl.style.display = 'flex';

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            alertEl.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            alertEl.style.opacity = '0';
            alertEl.style.transform = 'translateY(-8px)';
            setTimeout(() => {
                alertEl.style.display = 'none';
            }, 300);
            localStorage.setItem(STORAGE_KEY_CLOSED, 'true');
        });
    }
}

function initMobileOrientationAlert() {
    const alertEl = document.getElementById('mobileOrientationAlert');
    const closeBtn = document.getElementById('btnCloseMobileAlert');
    if (!alertEl) return;

    const STORAGE_KEY_DISMISSED = 'canchapro_mobile_orient_dismissed_session';

    function checkOrientation() {
        // If user already closed it in this session, keep it hidden
        if (sessionStorage.getItem(STORAGE_KEY_DISMISSED) === 'true') {
            alertEl.style.display = 'none';
            return;
        }

        // Detection: Mobile/Tablet screen in portrait mode (width <= 850px and height > width or media portrait)
        const isMobileScreen = window.innerWidth <= 850;
        const isPortrait = window.innerHeight >= window.innerWidth || (window.matchMedia && window.matchMedia("(orientation: portrait)").matches);

        if (isMobileScreen && isPortrait) {
            alertEl.style.display = 'flex';
            if (window.lucide && typeof lucide.createIcons === 'function') {
                lucide.createIcons();
            }
        } else {
            // Automatically hide when rotated horizontally or on desktop
            alertEl.style.display = 'none';
        }
    }

    // Run initial evaluation
    checkOrientation();

    // Listen for orientation and window size changes
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
    if (window.screen && screen.orientation) {
        screen.orientation.addEventListener('change', checkOrientation);
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            alertEl.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
            alertEl.style.opacity = '0';
            alertEl.style.transform = 'translateY(-6px)';
            setTimeout(() => {
                alertEl.style.display = 'none';
                alertEl.style.opacity = '1';
                alertEl.style.transform = 'translateY(0)';
            }, 250);
            sessionStorage.setItem(STORAGE_KEY_DISMISSED, 'true');
        });
    }
}

function updateAvailabilityChecker() {
    const checkDateIn = document.getElementById('checkDateIn');
    const checkHorario = document.getElementById('checkHorario');
    const checkDateOut = document.getElementById('checkDateOut');
    const resultsEl = document.getElementById('checkerResultsGrid');

    if (!checkDateIn || !checkDateOut || !checkHorario || !resultsEl) return;

    const inStr = checkDateIn.value;
    const outStr = checkDateOut.value;
    const horario = checkHorario.value;

    if (!inStr || !outStr) {
        resultsEl.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 10px;">Seleccione una fecha válida</div>';
        return;
    }

    // Mismas reglas de fechas que al guardar (salida posterior al ingreso, 9am-12pm solo L-J, etc.)
    const dateError = getBookingDateError(inStr, horario === 'Full Day' ? inStr : outStr, horario);
    if (dateError) {
        resultsEl.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: #ef4444; padding: 10px; font-weight: bold;">${escapeHTML(dateError)}</div>`;
        return;
    }

    const price = calculateBasePrice(inStr, outStr, horario);
    const bungalows = [1, 2, 3, 4, 5, 6];
    let html = '';

    bungalows.forEach(bNum => {
        const collision = checkBookingCollision(null, bNum, inStr, outStr, horario, 0);

        if (!collision) {
            // Bungalow Disponible
            html += `
            <div class="checker-bungalow-card available" onclick="quickBookFromChecker(${bNum}, '${inStr}', '${outStr}', '${horario}')" title="Clic para reservar Bungalow ${bNum}">
                <div class="checker-card-header">
                    <div class="checker-card-name">
                        <span class="tab-color-dot color-b${bNum}"></span>
                        <span>B${bNum}</span>
                    </div>
                    <span class="checker-status-badge free">Libre</span>
                </div>
                <div class="checker-card-body">
                    <strong>Tarifa base:</strong><br>S/. ${price.toFixed(2)}
                </div>
                <div class="checker-card-action">
                    <button type="button" class="btn-book"><i data-lucide="plus"></i> Reservar</button>
                </div>
            </div>`;
        } else {
            // Bungalow Ocupado / Bloqueado
            const isBlocked = collision.estado_reserva === 'Bloqueado';
            let clientName = collision.nombre_cliente || 'Ocupado';
            if (clientName.startsWith('🔒 Bloqueo: ')) clientName = clientName.replace('🔒 Bloqueo: ', '');
            else if (clientName.startsWith('🔒 Bloqueo:')) clientName = clientName.replace('🔒 Bloqueo:', '');

            html += `
            <div class="checker-bungalow-card occupied" onclick="openBookingEditModalById('${collision.id}')" title="Ocupado por ${escapeHTML(clientName)} - Clic para ver detalles">
                <div class="checker-card-header">
                    <div class="checker-card-name">
                        <span class="tab-color-dot color-b${bNum}"></span>
                        <span>B${bNum}</span>
                    </div>
                    <span class="checker-status-badge busy">${isBlocked ? 'Bloqueo' : 'Ocupado'}</span>
                </div>
                <div class="checker-card-body">
                    <strong>${escapeHTML(clientName)}</strong><br>
                    <small style="color: var(--text-muted); font-size: 10px;">${escapeHTML(collision.horario)}</small>
                </div>
                <div class="checker-card-action">
                    <span style="font-size: 10px; color: var(--text-secondary); font-weight: 600;">Ver reserva &rarr;</span>
                </div>
            </div>`;
        }
    });

    resultsEl.innerHTML = html;
    if (window.lucide) lucide.createIcons();
}

window.quickBookFromChecker = function (bNum, inStr, outStr, horario) {
    openBookingModal(inStr);

    // Marcar el bungalow
    const chkList = document.querySelectorAll('input[name="bungalowSelect"]');
    chkList.forEach(chk => {
        chk.checked = (parseInt(chk.value) === bNum);
    });
    document.getElementById('bookingBungalow').value = bNum;

    // Configurar fechas y horario
    document.getElementById('bookingCheckIn').value = inStr;
    document.getElementById('bookingHorario').value = horario;
    document.getElementById('bookingCheckOut').disabled = (horario === 'Full Day');
    document.getElementById('bookingCheckOut').value = outStr;

    updateNinosLimit();
    updatePersonasLimit();
    runDynamicCalculations();
};

// Parte del monto de una reserva que corresponde a un día:
// Día y Noche y 9am-12pm se cobran por noche (el día de salida no es otra noche),
// Horario Extendido por día (cuentan ingreso y salida) y Full Day es un solo día.
function getDailyIncomeShare(b, dateStr) {
    const total = parseFloat(b.monto_total) || 0;
    if (!b.fecha_ingreso || !b.fecha_salida) return 0;
    if (b.horario === 'Full Day') return dateStr === b.fecha_ingreso ? total : 0;
    if (b.horario === 'Horario Extendido') {
        if (dateStr < b.fecha_ingreso || dateStr > b.fecha_salida) return 0;
        return total / (calculateNights(b.fecha_ingreso, b.fecha_salida, b.horario) + 1);
    }
    if (dateStr < b.fecha_ingreso || dateStr >= b.fecha_salida) return 0;
    return total / (calculateNights(b.fecha_ingreso, b.fecha_salida, b.horario) || 1);
}

// Update Dashboard Sidebar stats
function updateDashboardStats() {
    const todayStr = getLocalDateString(new Date());
    const activeBookings = bookings.filter(b => b.estado_reserva !== 'Bloqueado' && b.fecha_ingreso && b.fecha_salida);

    // 1. Bungalows ocupados hoy (incluye los que salen hoy al mediodía)
    const uniqueOccupied = new Set(activeBookings
        .filter(b => b.fecha_ingreso <= todayStr && todayStr <= b.fecha_salida)
        .map(b => b.bungalow_numero));
    document.getElementById('statTodayOccupied').textContent = `${uniqueOccupied.size} / 6`;

    // 2. Ingresos de hoy: monto de cada reserva repartido entre sus noches (o días) cobrados
    const totalTodayIncome = activeBookings.reduce((acc, b) => acc + getDailyIncomeShare(b, todayStr), 0);
    document.getElementById('statTodayIncome').textContent = `S/. ${totalTodayIncome.toFixed(2)}`;

    // 3. Reservas del mes: sin bloqueos, y una reserva de varios bungalows cuenta una sola vez
    const monthPrefix = todayStr.slice(0, 7);
    const monthGroups = new Set(activeBookings
        .filter(b => b.fecha_ingreso.startsWith(monthPrefix))
        .map(getBookingGroupKey));
    document.getElementById('statMonthReservations').textContent = monthGroups.size;
}

// ----------------------------------------------------
// Share Booking Info / Copy Reservation
// ----------------------------------------------------
function copyReservationDetails() {
    const isBlock = false;
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

    // Horas de ingreso y salida de cualquier turno (incluye horas extra)
    const scheduleHours = getScheduleHours(horario, horasExtras, true);
    const checkInTime = scheduleHours.start;
    const checkOutTime = scheduleHours.end;

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

// Reparto de lo cobrado en una fila según el tipo de pago.
// En "Depósito" y "Dividido" el depósito se guarda en monto_efectivo (el campo conserva su nombre antiguo).
function getPaymentBreakdown(b) {
    const total = parseFloat(b.monto_total) || 0;
    const efectivoField = parseFloat(b.monto_efectivo) || 0;
    let yape = parseFloat(b.monto_yape) || 0;
    let deposito = 0;
    let efectivo = 0;
    if (b.tipo_pago === 'Depósito') deposito = efectivoField || total;
    else if (b.tipo_pago === 'Dividido') deposito = efectivoField;
    else if (b.tipo_pago === 'Efectivo') efectivo = efectivoField || total;
    else efectivo = efectivoField;
    if (b.tipo_pago === 'Yape' && yape === 0) yape = total;
    return { deposito, efectivo, yape };
}

// Agrupa las filas de una misma reserva (una por bungalow) en una sola, sumando sus montos.
// Garantiza que si se alquilan 5 bungalows por S/. 500, el monto total sea S/. 500 (NO 500 x 5).
function consolidateBookingRows(items) {
    const grouped = {};
    items.forEach(b => {
        const key = getBookingGroupKey(b);
        if (!grouped[key]) {
            grouped[key] = {
                ...b,
                rows: [],
                bungalows_arr: [],
                raw_monto_total: 0,
                raw_monto_adelanto: 0,
                raw_deposito: 0,
                raw_efectivo: 0,
                raw_yape: 0,
                monto_adic_personas: 0,
                monto_adic_horas: 0
            };
        }
        const g = grouped[key];
        const pay = getPaymentBreakdown(b);
        g.rows.push(b);
        g.bungalows_arr.push(b.bungalow_numero);
        g.raw_monto_total += parseFloat(b.monto_total) || 0;
        g.raw_monto_adelanto += parseFloat(b.monto_adelanto) || 0;
        g.raw_deposito += pay.deposito;
        g.raw_efectivo += pay.efectivo;
        g.raw_yape += pay.yape;
        g.monto_adic_personas += parseFloat(b.adicional_personas) || 0;
        g.monto_adic_horas += getExtraHoursAmount(b);
    });

    return Object.values(grouped).map(g => {
        const first = g.rows[0];
        const N = g.rows.length;
        let total = g.raw_monto_total;
        let adelanto = g.raw_monto_adelanto;
        let deposito = g.raw_deposito;
        let efectivo = g.raw_efectivo;
        let yape = g.raw_yape;

        // Detección de seguridad para registros antiguos guardados sin dividir: cada fila con el total
        // completo (ej. 500 en cada una en lugar de 100). Solo aplica a filas anteriores al reparto del
        // total (SPLIT_TOTALS_SINCE), todas iguales y de al menos ~N veces su precio base; si no,
        // una reserva normal de varios bungalows se reportaría como si fuera de uno solo.
        const singleMonto = parseFloat(first.monto_total) || 0;
        const singleBase = parseFloat(first.precio_base) || 0;
        const isOldRecord = g.rows.every(r => r.created_at && String(r.created_at) < SPLIT_TOTALS_SINCE);
        const allSame = g.rows.every(r => Math.abs((parseFloat(r.monto_total) || 0) - singleMonto) < 0.05);
        if (N > 1 && isOldRecord && allSame && singleBase > 0 && singleMonto >= singleBase * N * 0.8) {
            const pay = getPaymentBreakdown(first);
            total = singleMonto;
            adelanto = parseFloat(first.monto_adelanto) || 0;
            deposito = pay.deposito;
            efectivo = pay.efectivo;
            yape = pay.yape;
        }

        return {
            ...g,
            first_record: first,
            bungalow_numero: [...g.bungalows_arr].sort((a, b) => a - b).join(', '),
            monto_total: total,
            monto_adelanto: adelanto,
            monto_deposito: deposito,
            monto_efectivo_real: efectivo,
            // Columna "Depósito" de las hojas mensuales (incluye el efectivo de registros antiguos)
            monto_efectivo: deposito + efectivo,
            monto_yape: yape
        };
    });
}

async function exportAllDataToExcel() {
    if (!bookings || bookings.length === 0) {
        alert("No hay reservas registradas para exportar.");
        return;
    }

    // ─── BORRÓN Y CUENTA NUEVA: DESDE EL 1 DE OCTUBRE DE 2026 ─────
    const START_DATE = '2026-10-01';
    const filteredBookings = bookings.filter(b => {
        if (!b.fecha_ingreso) return false;
        return b.fecha_ingreso >= START_DATE;
    });

    if (filteredBookings.length === 0) {
        alert("No hay reservas registradas a partir del 1 de Octubre de 2026 para exportar.");
        return;
    }

    // Una fila por reserva (si se alquilan 5 bungalows por S/. 500, el monto es S/. 500, NO 500 x 5)
    const consolidateBookings = consolidateBookingRows;

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

    summaryWs.getColumn(1).width = 32;
    summaryWs.getColumn(2).width = 20;
    summaryWs.getColumn(3).width = 22;
    summaryWs.getColumn(4).width = 22;
    summaryWs.getColumn(5).width = 22;

    let sr = 1;
    const monthColorsS = ['FFFFFFFF', 'FFF8FAFC'];

    // Title Block
    summaryWs.mergeCells(sr, 1, sr, 5);
    const mainTitleCell = summaryWs.getCell(sr, 1);
    styleTitle(mainTitleCell, "REPORTE GENERAL DE RESERVAS Y ESTADÍSTICAS - BUNGALOWS (DESDE OCTUBRE 2026)", 'FF0F766E', 'FFFFFFFF', 13);
    summaryWs.getRow(sr).height = 40;
    sr += 2; // Blank row

    // Group filtered bookings by Month
    const groups = {};
    filteredBookings.forEach(b => {
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
    styleTitle(summaryWs.getCell(sr, 1), "INGRESOS Y USOS MENSUALES (OCTUBRE 2026 EN ADELANTE)", 'FF334155', 'FFFFFFFF', 11);
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

    const monthDataStartRow = sr;
    let rowIdx = 0;
    for (const [monthLabel, items] of Object.entries(groups)) {
        const bg = monthColorsS[rowIdx % 2];
        const activeItems = items.filter(b => b.estado_reserva !== 'Bloqueado');
        const consolidatedActive = consolidateBookings(activeItems);

        let count = consolidatedActive.length;
        let hMonto = 0;
        let adicMonto = 0;
        let tMonto = 0;

        consolidatedActive.forEach(b => {
            const tot = parseFloat(b.monto_total) || 0;
            const extraP = parseFloat(b.monto_adic_personas) || 0;
            const extraH = parseFloat(b.monto_adic_horas) || 0;

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
        c1.value = monthLabel;
        c1.font = { name: 'Outfit', bold: true, size: 10, color: { argb: 'FF1E293B' } };
        c1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        c1.alignment = { vertical: 'middle', horizontal: 'left' };
        c1.border = { top: { style: 'thin', color: { argb: 'FFE2E8F0' } }, left: { style: 'thin', color: { argb: 'FFE2E8F0' } }, bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }, right: { style: 'thin', color: { argb: 'FFE2E8F0' } } };

        styleValue(summaryWs.getCell(sr, 2), count, false);
        styleValue(summaryWs.getCell(sr, 3), hMonto, true);
        styleValue(summaryWs.getCell(sr, 4), adicMonto, true);

        // Fórmula de Excel para Total Facturado: Hospedaje + Adicionales
        const cellTotal = summaryWs.getCell(sr, 5);
        cellTotal.value = { formula: `C${sr}+D${sr}`, result: tMonto };
        cellTotal.numFmt = '"S/. "#,##0.00';
        cellTotal.font = { name: 'Outfit', bold: true, size: 10, color: { argb: 'FF0F766E' } };
        cellTotal.alignment = { vertical: 'middle', horizontal: 'right' };
        cellTotal.border = { top: { style: 'thin', color: { argb: 'FFE2E8F0' } }, left: { style: 'thin', color: { argb: 'FFE2E8F0' } }, bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }, right: { style: 'thin', color: { argb: 'FFE2E8F0' } } };

        for (let col = 2; col <= 5; col++) {
            summaryWs.getCell(sr, col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        }

        summaryWs.getRow(sr).height = 20;
        sr++;
        rowIdx++;
    }

    const monthDataEndRow = sr - 1;

    // Totals Row for Months with Native Excel Formulas
    const totalCell = summaryWs.getCell(sr, 1);
    totalCell.value = "TOTAL GENERAL";
    totalCell.font = { name: 'Outfit', bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    totalCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
    totalCell.alignment = { vertical: 'middle', horizontal: 'left' };
    totalCell.border = { top: { style: 'medium', color: { argb: 'FF0F766E' } }, left: { style: 'thin', color: { argb: 'FF0F766E' } }, bottom: { style: 'medium', color: { argb: 'FF0F766E' } }, right: { style: 'thin', color: { argb: 'FF0F766E' } } };

    if (monthDataEndRow >= monthDataStartRow) {
        summaryWs.getCell(sr, 2).value = { formula: `SUM(B${monthDataStartRow}:B${monthDataEndRow})`, result: grandTotalBookings };
        summaryWs.getCell(sr, 3).value = { formula: `SUM(C${monthDataStartRow}:C${monthDataEndRow})`, result: grandTotalHospedaje };
        summaryWs.getCell(sr, 4).value = { formula: `SUM(D${monthDataStartRow}:D${monthDataEndRow})`, result: grandTotalAdic };
        summaryWs.getCell(sr, 5).value = { formula: `SUM(E${monthDataStartRow}:E${monthDataEndRow})`, result: grandTotalSum };
    } else {
        styleValue(summaryWs.getCell(sr, 2), 0, false);
        styleValue(summaryWs.getCell(sr, 3), 0, true);
        styleValue(summaryWs.getCell(sr, 4), 0, true);
        styleValue(summaryWs.getCell(sr, 5), 0, true);
    }

    summaryWs.getCell(sr, 2).font = { name: 'Outfit', bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    summaryWs.getCell(sr, 2).alignment = { vertical: 'middle', horizontal: 'left' };
    summaryWs.getCell(sr, 3).numFmt = '"S/. "#,##0.00';
    summaryWs.getCell(sr, 3).font = { name: 'Outfit', bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    summaryWs.getCell(sr, 3).alignment = { vertical: 'middle', horizontal: 'right' };
    summaryWs.getCell(sr, 4).numFmt = '"S/. "#,##0.00';
    summaryWs.getCell(sr, 4).font = { name: 'Outfit', bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    summaryWs.getCell(sr, 4).alignment = { vertical: 'middle', horizontal: 'right' };
    summaryWs.getCell(sr, 5).numFmt = '"S/. "#,##0.00';
    summaryWs.getCell(sr, 5).font = { name: 'Outfit', bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    summaryWs.getCell(sr, 5).alignment = { vertical: 'middle', horizontal: 'right' };

    for (let col = 2; col <= 5; col++) {
        summaryWs.getCell(sr, col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
        summaryWs.getCell(sr, col).border = { top: { style: 'medium', color: { argb: 'FF0F766E' } }, bottom: { style: 'medium', color: { argb: 'FF0F766E' } }, left: { style: 'thin', color: { argb: 'FFE2E8F0' } }, right: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
    }
    summaryWs.getRow(sr).height = 22;
    sr += 3; // Blank rows

    // Helper functions for dates
    const getLocalYYYYMMDD = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const r = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${r}`;
    };

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

    // ─── RESUMEN FINANCIERO CONSOLIDADOS (OCTUBRE 2026 EN ADELANTE) ─
    const activeOctConsolidated = consolidateBookings(filteredBookings.filter(b => b.estado_reserva !== 'Bloqueado' && b.estado_reserva !== 'Bloqueo'));

    let monthRevenue = 0;
    let monthDeposito = 0;
    let monthEfectivo = 0;
    let monthYape = 0;
    let monthDayNightRevenue = 0;
    let monthFullDayRevenue = 0;
    let monthHorarioExtRevenue = 0;
    let monthAdicPersonas = 0;
    let monthAdicHoras = 0;

    activeOctConsolidated.forEach(b => {
        const amt = parseFloat(b.monto_total) || 0;
        monthRevenue += amt;

        // Depósitos (incluye la parte depósito de los pagos divididos), efectivo (registros antiguos) y Yape
        monthDeposito += (parseFloat(b.monto_deposito) || 0);
        monthEfectivo += (parseFloat(b.monto_efectivo_real) || 0);
        monthYape += (parseFloat(b.monto_yape) || 0);

        if (b.horario === 'Full Day') {
            monthFullDayRevenue += amt;
        } else if (b.horario === 'Horario Extendido' || b.horario === '9am a 12pm') {
            monthHorarioExtRevenue += amt;
        } else {
            monthDayNightRevenue += amt;
        }

        monthAdicPersonas += (parseFloat(b.monto_adic_personas) || 0);
        monthAdicHoras += (parseFloat(b.monto_adic_horas) || 0);
    });

    // Today bookings calculations (desde Octubre)
    const todayConsolidated = consolidateBookings(filteredBookings.filter(b => b.estado_reserva !== 'Bloqueado' && b.estado_reserva !== 'Bloqueo' && b.fecha_ingreso === todayStr));
    let todayBungalowBase = 0;
    let todayAdicionales = 0;
    let todayTotal = 0;

    todayConsolidated.forEach(b => {
        const tot = parseFloat(b.monto_total) || 0;
        const extraP = parseFloat(b.monto_adic_personas) || 0;
        const extraH = parseFloat(b.monto_adic_horas) || 0;
        const extra = extraP + extraH;

        todayBungalowBase += Math.max(0, tot - extra);
        todayAdicionales += extra;
        todayTotal += tot;
    });

    // Week bookings calculations (desde Octubre)
    const weekConsolidated = consolidateBookings(filteredBookings.filter(b => b.estado_reserva !== 'Bloqueado' && b.estado_reserva !== 'Bloqueo' && currentWeekDays.includes(b.fecha_ingreso)));
    let weekBungalowBase = 0;
    let weekAdicionales = 0;
    let weekTotal = 0;

    weekConsolidated.forEach(b => {
        const tot = parseFloat(b.monto_total) || 0;
        const extraP = parseFloat(b.monto_adic_personas) || 0;
        const extraH = parseFloat(b.monto_adic_horas) || 0;
        const extra = extraP + extraH;

        weekBungalowBase += Math.max(0, tot - extra);
        weekAdicionales += extra;
        weekTotal += tot;
    });

    // ─── BLOQUE FINANCIERO OCTUBRE 2026 ─────────────────────────────
    summaryWs.mergeCells(sr, 1, sr, 3);
    styleTitle(summaryWs.getCell(sr, 1), "INGRESO DE DINERO EN BUNGALOWS (OCTUBRE 2026 / PERÍODO VIGENTE)", 'FF0F766E', 'FFFFFFFF', 11);
    summaryWs.getRow(sr).height = 24; sr++;

    styleTitle(summaryWs.getCell(sr, 1), "Concepto", 'FF1E293B', 'FFFFFFFF', 10);
    styleTitle(summaryWs.getCell(sr, 2), "Monto", 'FF1E293B', 'FFFFFFFF', 10);
    summaryWs.getRow(sr).height = 22; sr++;

    const financialData = [
        ["Ganancia Total Facturada", monthRevenue],
        ["Cobrado en Depósitos Bancarios", monthDeposito],
        ["Cobrado en Efectivo", monthEfectivo],
        ["Cobrado en Yape / Plin", monthYape],
        ["Ganancia por Turno Día y Noche", monthDayNightRevenue],
        ["Ganancia por Turno Full Day", monthFullDayRevenue],
        ["Ganancia por Horario Extendido / 9am a 12pm", monthHorarioExtRevenue],
        ["Ganancia por Personas Adicionales", monthAdicPersonas],
        ["Ganancia por Horas Extras", monthAdicHoras]
    ];

    financialData.forEach(([concept, val], fIdx) => {
        const bg = monthColorsS[fIdx % 2];
        const c1 = summaryWs.getCell(sr, 1);
        c1.value = concept;
        c1.font = { name: 'Outfit', bold: true, size: 10, color: { argb: 'FF1E293B' } };
        c1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        c1.alignment = { vertical: 'middle', horizontal: 'left' };
        c1.border = { top: { style: 'thin', color: { argb: 'FFE2E8F0' } }, left: { style: 'thin', color: { argb: 'FFE2E8F0' } }, bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }, right: { style: 'thin', color: { argb: 'FFE2E8F0' } } };

        styleValue(summaryWs.getCell(sr, 2), val, true);
        summaryWs.getCell(sr, 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };

        summaryWs.getRow(sr).height = 20;
        sr++;
    });

    // ─── INGRESO DE DINERO (SEMANA ACTUAL) ──────────────────────────
    sr += 2;
    summaryWs.mergeCells(sr, 1, sr, 3);
    styleTitle(summaryWs.getCell(sr, 1), "INGRESO DE DINERO EN BUNGALOWS (SEMANA ACTUAL)", 'FF0F766E', 'FFFFFFFF', 11);
    summaryWs.getRow(sr).height = 24; sr++;

    styleTitle(summaryWs.getCell(sr, 1), "Concepto", 'FF1E293B', 'FFFFFFFF', 10);
    styleTitle(summaryWs.getCell(sr, 2), "Monto", 'FF1E293B', 'FFFFFFFF', 10);
    summaryWs.getRow(sr).height = 22; sr++;

    const weekData = [
        ["Ganancias de Hospedaje Base", weekBungalowBase],
        ["Ganancias de Adicionales", weekAdicionales],
        ["Total Semana", weekTotal]
    ];

    weekData.forEach(([concept, val], fIdx) => {
        const bg = monthColorsS[fIdx % 2];
        const c1 = summaryWs.getCell(sr, 1);
        c1.value = concept;
        c1.font = { name: 'Outfit', bold: true, size: 10, color: { argb: 'FF1E293B' } };
        c1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        c1.alignment = { vertical: 'middle', horizontal: 'left' };
        c1.border = { top: { style: 'thin', color: { argb: 'FFE2E8F0' } }, left: { style: 'thin', color: { argb: 'FFE2E8F0' } }, bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }, right: { style: 'thin', color: { argb: 'FFE2E8F0' } } };

        styleValue(summaryWs.getCell(sr, 2), val, true);
        summaryWs.getCell(sr, 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };

        summaryWs.getRow(sr).height = 20;
        sr++;
    });

    // ─── INGRESO DE DINERO (DÍA DE HOY) ─────────────────────────────
    sr += 2;
    summaryWs.mergeCells(sr, 1, sr, 3);
    styleTitle(summaryWs.getCell(sr, 1), "INGRESO DE DINERO EN BUNGALOWS (DÍA DE HOY)", 'FF0F766E', 'FFFFFFFF', 11);
    summaryWs.getRow(sr).height = 24; sr++;

    styleTitle(summaryWs.getCell(sr, 1), "Concepto", 'FF1E293B', 'FFFFFFFF', 10);
    styleTitle(summaryWs.getCell(sr, 2), "Monto", 'FF1E293B', 'FFFFFFFF', 10);
    summaryWs.getRow(sr).height = 22; sr++;

    const todayData = [
        ["Ganancias de Hospedaje Base", todayBungalowBase],
        ["Ganancias de Adicionales", todayAdicionales],
        ["Total Hoy", todayTotal]
    ];

    todayData.forEach(([concept, val], fIdx) => {
        const bg = monthColorsS[fIdx % 2];
        const c1 = summaryWs.getCell(sr, 1);
        c1.value = concept;
        c1.font = { name: 'Outfit', bold: true, size: 10, color: { argb: 'FF1E293B' } };
        c1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        c1.alignment = { vertical: 'middle', horizontal: 'left' };
        c1.border = { top: { style: 'thin', color: { argb: 'FFE2E8F0' } }, left: { style: 'thin', color: { argb: 'FFE2E8F0' } }, bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }, right: { style: 'thin', color: { argb: 'FFE2E8F0' } } };

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
        { header: 'Fechas de Reservas', key: 'fechas_reservas', width: 30 },
        { header: 'Total Bungalows Reservados', key: 'total_bungalows', width: 24 }
    ];
    clientsWs.columns = clientColsDef;

    const clientHeaderRow = clientsWs.getRow(1);
    clientHeaderRow.height = 26;
    clientHeaderRow.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10B981' } };
        cell.font = { name: 'Outfit', color: { argb: 'FFFFFFFF' }, bold: true, size: 11 };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.border = { top: { style: 'thin', color: { argb: 'FF1E293B' } }, left: { style: 'thin', color: { argb: 'FF1E293B' } }, bottom: { style: 'medium', color: { argb: 'FF1E293B' } }, right: { style: 'thin', color: { argb: 'FF1E293B' } } };
    });

    // Group active bookings by DNI (desde Octubre 1)
    const clientsExcelMap = {};
    const activeAllExcelBookings = consolidateBookings(filteredBookings.filter(b => b.estado_reserva !== 'Bloqueo' && b.estado_reserva !== 'Bloqueado'));

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

        const countInBooking = b.bungalows_arr ? b.bungalows_arr.length : 1;
        clientsExcelMap[key].bungalowsCount += countInBooking;
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
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isAlternate ? 'FFF8FAFC' : 'FFFFFFFF' } };
            cell.border = { top: { style: 'thin', color: { argb: 'FFE2E8F0' } }, left: { style: 'thin', color: { argb: 'FFE2E8F0' } }, bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }, right: { style: 'thin', color: { argb: 'FFE2E8F0' } } };

            const colKey = clientColsDef[colNumber - 1].key;
            if (colKey === 'dni' || colKey === 'num_reservas' || colKey === 'total_bungalows' || colKey === 'fechas_reservas') {
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
            } else {
                cell.alignment = { horizontal: 'left', vertical: 'middle' };
            }
        });

        clientRowNo++;
    });

    // ─── HOJAS MENSUALES DE DATOS CON FÓRMULAS ─────────────────────
    const columnsDef = [
        { header: 'Bungalow(s)', key: 'bungalow', width: 16 },                 // Col A (1)
        { header: 'Fecha Entrada', key: 'fecha_entrada', width: 14 },           // Col B (2)
        { header: 'Fecha Salida', key: 'fecha_salida', width: 14 },             // Col C (3)
        { header: 'Horario', key: 'horario', width: 16 },                      // Col D (4)
        { header: 'Cliente', key: 'cliente', width: 28 },                      // Col E (5)
        { header: 'DNI', key: 'dni', width: 14 },                              // Col F (6)
        { header: 'Teléfono', key: 'telefono', width: 14 },                    // Col G (7)
        { header: 'Asesor', key: 'asesor', width: 18 },                        // Col H (8)
        { header: 'Medio de Contacto', key: 'medio', width: 18 },              // Col I (9)
        { header: 'Tipo de Pago', key: 'tipo_pago', width: 16 },               // Col J (10)
        { header: 'Monto Total (S/.)', key: 'monto_total', width: 18 },        // Col K (11)
        { header: 'Adelanto (S/.)', key: 'monto_adelanto', width: 18 },        // Col L (12)
        { header: 'Saldo Pendiente (S/.)', key: 'saldo_pendiente', width: 18 },// Col M (13) -> Fórmula: =K - L
        { header: 'Depósito (S/.)', key: 'monto_efectivo', width: 18 },        // Col N (14)
        { header: 'Yape (S/.)', key: 'monto_yape', width: 18 },                // Col O (15)
        { header: 'Extra Personas (S/.)', key: 'monto_adic_personas', width: 20 }, // Col P (16)
        { header: 'Extra Horas (S/.)', key: 'monto_adic_horas', width: 20 },    // Col Q (17)
        { header: 'Estado', key: 'estado', width: 14 },                        // Col R (18)
        { header: 'Observaciones', key: 'observaciones', width: 32 },          // Col S (19)
        { header: 'Fecha Registro', key: 'registro', width: 22 }               // Col T (20)
    ];

    for (const [monthLabel, bookingsInMonth] of Object.entries(groups)) {
        const worksheet = workbook.addWorksheet(monthLabel);
        worksheet.views = [{ showGridLines: true }];
        worksheet.columns = columnsDef;
        worksheet.autoFilter = `A1:${getColLetter(columnsDef.length)}1`;

        // Style header row
        const headerRow = worksheet.getRow(1);
        headerRow.height = 26;
        headerRow.eachCell((cell) => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
            cell.font = { name: 'Outfit', color: { argb: 'FFFFFFFF' }, bold: true, size: 11 };
            cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
            cell.border = { top: { style: 'thin', color: { argb: 'FF1E293B' } }, left: { style: 'thin', color: { argb: 'FF1E293B' } }, bottom: { style: 'medium', color: { argb: 'FF1E293B' } }, right: { style: 'thin', color: { argb: 'FF1E293B' } } };
        });

        let rowNumber = 2;
        const consolidatedMonthBookings = consolidateBookings(bookingsInMonth);

        consolidatedMonthBookings.forEach(b => {
            const rowNum = rowNumber;
            const totVal = parseFloat(b.monto_total) || 0;
            const adeVal = parseFloat(b.monto_adelanto) || 0;
            const remVal = Math.max(0, totVal - adeVal);

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
                monto_total: totVal,
                monto_adelanto: adeVal,
                saldo_pendiente: { formula: `K${rowNum}-L${rowNum}`, result: remVal },
                monto_efectivo: parseFloat(b.monto_efectivo) || 0,
                monto_yape: parseFloat(b.monto_yape) || 0,
                monto_adic_personas: parseFloat(b.monto_adic_personas) || 0,
                monto_adic_horas: parseFloat(b.monto_adic_horas) || 0,
                estado: b.estado_reserva || '',
                observaciones: b.observaciones || b.notas || '',
                registro: b.created_at ? new Date(b.created_at).toLocaleString('es-PE') : ''
            });

            dataRow.height = 20;

            const isAlternate = (rowNumber % 2 === 0);
            dataRow.eachCell((cell, colNumber) => {
                cell.font = { name: 'Outfit', size: 10 };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isAlternate ? 'FFF8FAFC' : 'FFFFFFFF' } };
                cell.border = { top: { style: 'thin', color: { argb: 'FFE2E8F0' } }, left: { style: 'thin', color: { argb: 'FFE2E8F0' } }, bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }, right: { style: 'thin', color: { argb: 'FFE2E8F0' } } };

                const colKey = columnsDef[colNumber - 1].key;
                if (['fecha_entrada', 'fecha_salida', 'horario', 'dni', 'telefono', 'tipo_pago', 'medio', 'estado'].includes(colKey)) {
                    cell.alignment = { horizontal: 'center', vertical: 'middle' };
                } else if (['monto_total', 'monto_adelanto', 'saldo_pendiente', 'monto_efectivo', 'monto_yape', 'monto_adic_personas', 'monto_adic_horas'].includes(colKey)) {
                    cell.alignment = { horizontal: 'right', vertical: 'middle' };
                    cell.numFmt = '"S/. "#,##0.00';
                } else {
                    cell.alignment = { horizontal: 'left', vertical: 'middle' };
                }
            });

            rowNumber++;
        });

        // ─── FILA FINAL DE TOTALES CON FÓRMULAS DE EXCEL (=SUMA) ───
        const lastDataRow = rowNumber - 1;
        if (lastDataRow >= 2) {
            const totalRow = worksheet.getRow(rowNumber);
            totalRow.height = 24;

            worksheet.mergeCells(rowNumber, 1, rowNumber, 10);
            const labelCell = worksheet.getCell(rowNumber, 1);
            labelCell.value = 'TOTAL';
            labelCell.font = { name: 'Outfit', bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
            labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
            labelCell.alignment = { vertical: 'middle', horizontal: 'center' };
            labelCell.border = { top: { style: 'medium', color: { argb: 'FF0F766E' } }, bottom: { style: 'medium', color: { argb: 'FF0F766E' } }, left: { style: 'thin', color: { argb: 'FF0F766E' } }, right: { style: 'thin', color: { argb: 'FF0F766E' } } };

            // Solo columnas de dinero (la R es "Estado": sumarla dejaba "S/. 0.00" en esa columna)
            const formulaCols = [
                { col: 11, colLetter: 'K' }, // Monto Total
                { col: 12, colLetter: 'L' }, // Adelanto
                { col: 13, colLetter: 'M' }, // Saldo Pendiente
                { col: 14, colLetter: 'N' }, // Depósito
                { col: 15, colLetter: 'O' }, // Yape
                { col: 16, colLetter: 'P' }, // Extra Personas
                { col: 17, colLetter: 'Q' }  // Extra Horas
            ];

            formulaCols.forEach(({ col, colLetter }) => {
                const cell = worksheet.getCell(rowNumber, col);
                cell.value = { formula: `SUM(${colLetter}2:${colLetter}${lastDataRow})` };
                cell.numFmt = '"S/. "#,##0.00';
                cell.font = { name: 'Outfit', bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
                cell.alignment = { vertical: 'middle', horizontal: 'right' };
                cell.border = { top: { style: 'medium', color: { argb: 'FF0F766E' } }, bottom: { style: 'medium', color: { argb: 'FF0F766E' } }, left: { style: 'thin', color: { argb: 'FFE2E8F0' } }, right: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
            });

            // Celdas restantes (Estado, Observaciones, Fecha Registro = columnas R, S y T)
            for (let c = 18; c <= 20; c++) {
                const cell = worksheet.getCell(rowNumber, c);
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
                cell.border = { top: { style: 'medium', color: { argb: 'FF0F766E' } }, bottom: { style: 'medium', color: { argb: 'FF0F766E' } } };
            }
        }
    }

    workbook.xlsx.writeBuffer().then((buffer) => {
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'Reporte_Reservas_Bungalows_Octubre.xlsx';
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
    // Cada fila es un bungalow: una reserva de varios bungalows cuenta UNA vez en los contadores generales
    let totalRevenue = 0;
    let depositoTotal = 0;
    let otrosTotal = 0;
    let totalExtrasRevenue = 0;
    const allGroups = new Set();
    const categoryTotals = {
        dayNight: { groups: new Set(), revenue: 0 },
        fullDay: { groups: new Set(), revenue: 0 },
        extended: { groups: new Set(), revenue: 0 } // Horario Extendido y 9am a 12pm
    };

    // Per bungalow stats map
    const bungalowStats = {};
    for (let i = 1; i <= 6; i++) {
        bungalowStats[i] = {
            count: 0, revenue: 0, daysOccupied: 0, extras: 0,
            dayNightCount: 0, dayNightRevenue: 0, fullDayCount: 0, fullDayRevenue: 0, extendedCount: 0, extendedRevenue: 0
        };
    }

    // Client counts map
    const clientsMap = {};

    // Asesores stats map
    const asesoresMap = {};

    monthBookings.forEach(b => {
        const amount = parseFloat(b.monto_total) || 0;
        const groupKey = getBookingGroupKey(b);
        allGroups.add(groupKey);
        totalRevenue += amount;

        // Medio de pago (en "Dividido" la parte del depósito está en monto_efectivo)
        if (b.tipo_pago === 'Depósito') {
            depositoTotal += amount;
        } else if (b.tipo_pago === 'Yape' || b.tipo_pago === 'Efectivo') {
            otrosTotal += amount;
        } else if (b.tipo_pago === 'Dividido') {
            depositoTotal += parseFloat(b.monto_efectivo) || 0;
            otrosTotal += parseFloat(b.monto_yape) || 0;
        }

        // Turno y adicionales (personas adicionales + horas extra)
        const category = b.horario === 'Full Day' ? 'fullDay'
            : (b.horario === 'Horario Extendido' || b.horario === '9am a 12pm') ? 'extended' : 'dayNight';
        const extrasAmount = (parseFloat(b.adicional_personas) || 0) + getExtraHoursAmount(b);
        categoryTotals[category].groups.add(groupKey);
        categoryTotals[category].revenue += amount;
        totalExtrasRevenue += extrasAmount;

        // Por bungalow (aquí cuenta cada fila: es la reserva de ese bungalow)
        const stats = bungalowStats[b.bungalow_numero];
        if (stats) {
            stats.count++;
            stats.revenue += amount;
            stats.extras += extrasAmount;
            stats[category + 'Count']++;
            stats[category + 'Revenue'] += amount;
            stats.daysOccupied += calculateNights(b.fecha_ingreso, b.fecha_salida, b.horario);
        }

        // Directorio de clientes (cada reserva cuenta una vez aunque tenga varios bungalows)
        const clientKey = (b.dni_cliente || '').trim() || (b.nombre_cliente || '').trim();
        if (clientKey) {
            if (!clientsMap[clientKey]) {
                clientsMap[clientKey] = {
                    nombre: b.nombre_cliente,
                    dni: b.dni_cliente || 'N/A',
                    phone: b.telefono_cliente || 'N/A',
                    groups: new Set()
                };
            }
            clientsMap[clientKey].groups.add(groupKey);
        }

        // Populate Asesores stats
        let asesorNombre = b.asesor_registro ? b.asesor_registro.trim() : '';
        if (asesorNombre === '') asesorNombre = 'Sin Asesor';
        if (!asesoresMap[asesorNombre]) {
            asesoresMap[asesorNombre] = { groups: new Set(), revenue: 0, bungalows: {} };
        }
        const asesorStats = asesoresMap[asesorNombre];
        asesorStats.groups.add(groupKey);
        asesorStats.revenue += amount;
        asesorStats.bungalows[b.bungalow_numero] = (asesorStats.bungalows[b.bungalow_numero] || 0) + 1;
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
    document.getElementById('statsCountMonth').textContent = `${allGroups.size} reservas registradas (${rangeText})`;
    document.getElementById('statsDepositoMonth').textContent = `S/. ${depositoTotal.toFixed(2)}`;
    document.getElementById('statsOtrosMonth').textContent = `S/. ${otrosTotal.toFixed(2)}`;

    // Reservas e ingresos por turno
    document.getElementById('statsDayNightCount').textContent = categoryTotals.dayNight.groups.size;
    document.getElementById('statsDayNightRevenue').textContent = `S/. ${categoryTotals.dayNight.revenue.toFixed(2)}`;
    document.getElementById('statsFullDayCount').textContent = categoryTotals.fullDay.groups.size;
    document.getElementById('statsFullDayRevenue').textContent = `S/. ${categoryTotals.fullDay.revenue.toFixed(2)}`;
    document.getElementById('statsExtendedCount').textContent = categoryTotals.extended.groups.size;
    document.getElementById('statsExtendedRevenue').textContent = `S/. ${categoryTotals.extended.revenue.toFixed(2)}`;
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
            <td style="padding: 12px 16px; color: #e879f9;">${stats.extendedCount} res. (S/. ${stats.extendedRevenue.toFixed(2)})</td>
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

    const clientsList = Object.values(clientsMap).sort((a, b) => b.groups.size - a.groups.size);
    if (clientsList.length === 0) {
        tableClientsBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 20px;">No hay directorio compilado este mes.</td></tr>';
    } else {
        clientsList.forEach(c => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid var(--border-color)';
            tr.innerHTML = `
                <td style="padding: 12px 16px; font-weight: 600; color: white;">${escapeHTML(c.nombre)}</td>
                <td style="padding: 12px 16px;">${escapeHTML(c.dni)}</td>
                <td style="padding: 12px 16px;">${escapeHTML(c.phone)}</td>
                <td style="padding: 12px 16px; font-weight: 700; color: #fbbf24;">${c.groups.size} reserva(s)</td>
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
                        ${a.nombre === 'Sin Asesor' ? '<span style="color:var(--text-muted); font-style:italic;">Sin Asesor</span>' : escapeHTML(a.nombre)}
                    </td>
                    <td style="padding: 12px 16px;">${a.groups.size}</td>
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
    let url = document.getElementById('supabaseUrl').value.trim().replace(/\/+$/, '');
    const key = document.getElementById('supabaseKey').value.trim();
    const feedback = document.getElementById('settingsFeedback');

    feedback.textContent = '⏳ Conectando con Supabase...';
    feedback.style.color = '#fbbf24';

    try {
        const testClient = supabase.createClient(url, key);
        const { data, error } = await testClient.from('reservas_bungalows').select('id').limit(1);
        if (error) throw error;

        localStorage.setItem('canchapro_supabase_url', url);
        localStorage.setItem('canchapro_supabase_key', key);
        feedback.textContent = '✅ Credenciales válidas. Conexión establecida.';
        feedback.style.color = '#34d399';

        setTimeout(() => {
            closeModal('modalSettings');
            initDatabase().then(() => fetchBookings());
        }, 800);
    } catch (err) {
        feedback.textContent = '❌ Fallo en la conexión: ' + (err.message || err);
        feedback.style.color = '#ef4444';
    }
}

async function testSupabaseConnection() {
    let url = document.getElementById('supabaseUrl').value.trim().replace(/\/+$/, '');
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
        const testClient = supabase.createClient(url, key);
        const { data, error } = await testClient.from('reservas_bungalows').select('id').limit(1);
        if (error) throw error;

        feedback.textContent = '✅ Conexión exitosa con la base de datos Supabase.';
        feedback.style.color = '#34d399';
    } catch (e) {
        feedback.textContent = '❌ Error de conexión: ' + (e.message || e);
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

// Escapa texto antes de insertarlo como HTML (nombres, motivos, etc. escritos por los asesores)
function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>'"]/g,
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
// Medios de Contacto dinámicos (tabla medios_contacto)
// ============================================================
function normalizeMedioKey(name) {
    return (name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

function formatMedioName(name) {
    const clean = (name || '').replace(/\s+/g, ' ').trim();
    return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : '';
}

function mergeMedios(customList) {
    const result = [...DEFAULT_MEDIOS];
    const keys = new Set(result.map(normalizeMedioKey));
    (customList || []).forEach(m => {
        const key = normalizeMedioKey(m);
        if (key && !keys.has(key)) {
            keys.add(key);
            result.push(m);
        }
    });
    return result;
}

function loadCustomMediosLocal() {
    try {
        return JSON.parse(localStorage.getItem('canchapro_medios_contacto') || '[]');
    } catch (e) {
        return [];
    }
}

function saveCustomMedioLocal(name) {
    const list = loadCustomMediosLocal();
    if (!list.some(m => normalizeMedioKey(m) === normalizeMedioKey(name))) {
        list.push(name);
        localStorage.setItem('canchapro_medios_contacto', JSON.stringify(list));
    }
}

async function fetchMediosContacto() {
    let customList = [];
    if (dbMode === 'supabase' && supabaseClient) {
        try {
            const { data, error } = await supabaseClient
                .from('medios_contacto')
                .select('nombre')
                .order('created_at', { ascending: true });
            if (error) throw error;
            customList = (data || []).map(r => r.nombre);
        } catch (err) {
            console.warn("Tabla medios_contacto no disponible, usando respaldo local:", err.message);
            customList = loadCustomMediosLocal();
        }
    } else {
        customList = loadCustomMediosLocal();
    }
    mediosContactoList = mergeMedios(customList);

    // Refrescar el select conservando la selección actual
    const select = document.getElementById('bookingSource');
    if (select) {
        const current = select.value && select.value !== ADD_MEDIO_VALUE
            ? select.value
            : (select.dataset.prev || DEFAULT_MEDIOS[0]);
        populateMediosDropdown(current);
        // Si el panel de nuevo medio está abierto, mantener la opción "Agregar" seleccionada
        const panel = document.getElementById('customSourceGroup');
        if (panel && !panel.classList.contains('hidden')) select.value = ADD_MEDIO_VALUE;
    }
}

function populateMediosDropdown(selectedValue = '') {
    const select = document.getElementById('bookingSource');
    if (!select) return;
    if (mediosContactoList.length === 0) mediosContactoList = mergeMedios(loadCustomMediosLocal());

    select.innerHTML = '';
    mediosContactoList.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        select.appendChild(opt);
    });

    // Valor histórico que ya no está en la lista (ej: reservas antiguas con "Otro")
    if (selectedValue && selectedValue !== ADD_MEDIO_VALUE && !mediosContactoList.includes(selectedValue)) {
        const opt = document.createElement('option');
        opt.value = selectedValue;
        opt.textContent = selectedValue;
        select.appendChild(opt);
    }

    const optAdd = document.createElement('option');
    optAdd.value = ADD_MEDIO_VALUE;
    optAdd.textContent = '➕ Agregar otro medio...';
    optAdd.style.fontWeight = '600';
    optAdd.style.color = 'var(--primary)';
    select.appendChild(optAdd);

    select.value = selectedValue || DEFAULT_MEDIOS[0];
    if (!select.value) select.value = DEFAULT_MEDIOS[0];
    select.dataset.prev = select.value;
}

function setAddMedioHint(text, isError = false) {
    const hint = document.getElementById('addMedioHint');
    if (!hint) return;
    hint.textContent = text;
    hint.classList.toggle('error', isError);
}

function openAddMedioPanel() {
    const panel = document.getElementById('customSourceGroup');
    const input = document.getElementById('bookingSourceCustom');
    panel.classList.remove('hidden');
    input.value = '';
    setAddMedioHint('Se guardará para todos los asesores.');
    setTimeout(() => input.focus(), 50);
}

function closeAddMedioPanel(restorePrevious = true) {
    const panel = document.getElementById('customSourceGroup');
    const input = document.getElementById('bookingSourceCustom');
    const select = document.getElementById('bookingSource');
    if (panel) panel.classList.add('hidden');
    if (input) input.value = '';
    if (restorePrevious && select && select.value === ADD_MEDIO_VALUE) {
        select.value = select.dataset.prev || DEFAULT_MEDIOS[0];
    }
}

async function handleSaveNewMedio() {
    const input = document.getElementById('bookingSourceCustom');
    const btn = document.getElementById('btnSaveMedio');
    const select = document.getElementById('bookingSource');
    const cleanName = formatMedioName(input.value);

    if (!cleanName) {
        setAddMedioHint('Escribe el nombre del medio.', true);
        input.focus();
        return;
    }
    if (normalizeMedioKey(cleanName) === normalizeMedioKey(ADD_MEDIO_VALUE)) return;

    // Si ya existe (ignorando mayúsculas/tildes), solo se selecciona
    const existing = mediosContactoList.find(m => normalizeMedioKey(m) === normalizeMedioKey(cleanName));
    if (existing) {
        closeAddMedioPanel(false);
        populateMediosDropdown(existing);
        return;
    }

    btn.disabled = true;
    setAddMedioHint('Guardando...');
    let savedName = cleanName;

    if (dbMode === 'supabase' && supabaseClient) {
        try {
            const { error } = await supabaseClient
                .from('medios_contacto')
                .insert([{ nombre: cleanName, creado_por: activeOperator }]);
            // 23505 = ya registrado por otro asesor al mismo tiempo; se considera válido
            if (error && error.code !== '23505') throw error;
        } catch (err) {
            console.error("No se pudo guardar el medio en Supabase:", err);
            btn.disabled = false;
            setAddMedioHint('⚠️ No se pudo guardar en la base de datos. Verifica que exista la tabla "medios_contacto".', true);
            return;
        }
    } else {
        saveCustomMedioLocal(cleanName);
    }

    await fetchMediosContacto();
    const match = mediosContactoList.find(m => normalizeMedioKey(m) === normalizeMedioKey(cleanName));
    if (match) savedName = match;

    btn.disabled = false;
    closeAddMedioPanel(false);
    populateMediosDropdown(savedName);
    select.focus();

    if (typeof logSessionActivity === 'function') {
        logSessionActivity(`registró el nuevo medio de contacto: ${savedName}`);
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
            // Antes: toggle('open') || toggle('active') dejaba el fondo oscuro activo al cerrar
            const isOpen = sidebar.classList.toggle('open');
            sidebar.classList.remove('active');
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
