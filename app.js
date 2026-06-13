// ==========================================
// CanchaPro JavaScript App Logic
// ==========================================

// State Management
let dbMode = 'local'; // 'local' or 'supabase'
let supabaseClient = null;
let calendar = null;
let allEvents = []; // Cache for local/downloaded events
let statsCountdownInterval = null;

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
const bookingPelotaInput = document.getElementById('bookingPelota');
const bookingChalecoInput = document.getElementById('bookingChaleco');
const bookingError = document.getElementById('bookingError');

const btnNewReservation = document.getElementById('btnNewReservation');
const btnCloseBooking = document.getElementById('btnCloseBooking');
const btnDeleteBooking = document.getElementById('btnDeleteBooking');
const btnCopyReservation = document.getElementById('btnCopyReservation');
const bookingDniInput = document.getElementById('bookingDni');
const bookingSourceInput = document.getElementById('bookingSource');
const customSourceGroup = document.getElementById('customSourceGroup');
const bookingSourceCustomInput = document.getElementById('bookingSourceCustom');

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

// Stats Modal DOM Elements
const btnOpenStats = document.getElementById('btnOpenStats');
const modalStatsAuth = document.getElementById('modalStatsAuth');
const btnCloseStatsAuth = document.getElementById('btnCloseStatsAuth');
const formStatsAuth = document.getElementById('formStatsAuth');
const statsPasswordInput = document.getElementById('statsPassword');
const statsAuthError = document.getElementById('statsAuthError');

const modalStats = document.getElementById('modalStats');
const btnCloseStatsModal = document.getElementById('btnCloseStatsModal');
const btnLockStats = document.getElementById('btnLockStats');
const tabButtons = document.querySelectorAll('.stats-tabs .tab-btn');
const tabContents = document.querySelectorAll('#modalStats .tab-content');

const ratesFormRow = document.getElementById('ratesFormRow');
const formStatsRates = document.getElementById('formStatsRates');
const statsRatesFeedback = document.getElementById('statsRatesFeedback');


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
        slotMaxTime: '25:00:00',
        allDaySlot: false,
        slotDuration: '00:30:00',
        snapDuration: '00:30:00',
        slotLabelInterval: '01:00',
        slotLabelContent: function (arg) {
            if (arg.text === '0') return '00';
            if (arg.text === '1') return '01';
            return arg.text;
        },
        expandRows: true,
        stickyHeaderDates: true,
        selectable: true,
        selectMirror: true,
        editable: false,
        height: 'auto',
        nowIndicator: true,
        datesSet: function () {
            updateDailySummary();
        },

        // Fetch Events Dynamically
        events: function (fetchInfo, successCallback, failureCallback) {
            fetchBookings().then(bookings => {
                allEvents = bookings;
                updateStats();
                updateDailySummary();

                // Apply UI filters
                const filtered = filterEvents(bookings);

                // Convert to FullCalendar event format
                const fcEvents = filtered.map(b => {
                    const { start, end } = getStartAndEndDates(b.date, b.start_time, b.end_time);
                    return {
                        id: b.id,
                        title: `${b.name} (${b.sport})${b.pelota === true || b.pelota === 'true' ? (b.sport === 'Vóley' ? ' 🏐' : ' ⚽') : ''}${b.chaleco === true || b.chaleco === 'true' ? ' 🎽' : ''}`,
                        start: formatISOString(start),
                        end: formatISOString(end),
                        className: `${b.court === 'Grande' ? 'event-cancha-grande' : 'event-cancha-pequena'} ${b.sport === 'Fútbol' ? 'event-sport-futbol' : 'event-sport-voley'}`,
                        extendedProps: b // Keep original data
                    };
                });

                successCallback(fcEvents);
            }).catch(err => {
                console.error("Error cargando reservas:", err);
                failureCallback(err);
            });
        },

        // Click and drag to create event
        select: function (selectionInfo) {
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
        eventClick: function (info) {
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
    btnDeleteBooking.addEventListener('click', handleDeleteBooking);
    if (btnCopyReservation) {
        btnCopyReservation.addEventListener('click', handleCopyReservation);
    }
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

    // Auto-adjust end time when start time changes to be at least 1 hour later
    if (bookingStartTimeInput && bookingEndTimeInput) {
        bookingStartTimeInput.addEventListener('change', () => {
            const startTime = bookingStartTimeInput.value;
            if (!startTime) return;

            const startMins = parseTimeToMinutes(startTime);
            const endTime = bookingEndTimeInput.value;

            let adjust = false;
            if (endTime) {
                const duration = getDurationInMinutes(startTime, endTime);
                if (duration < 60) {
                    adjust = true;
                }
            } else {
                adjust = true;
            }

            if (adjust) {
                const newEndMins = (startMins + 60) % 1440;
                const newEndHour = Math.floor(newEndMins / 60);
                const newEndMin = newEndMins % 60;
                const formattedHour = String(newEndHour).padStart(2, '0');
                const formattedMin = String(newEndMin).padStart(2, '0');
                bookingEndTimeInput.value = `${formattedHour}:${formattedMin}`;
            }
        });
    }

    // Toggle buttons event listeners
    setupToggleListeners('pelota');
    setupToggleListeners('chaleco');

    // Asesor select dropdown change listener
    const selectAsesor = document.getElementById('bookingNotes');
    const customGroup = document.getElementById('customAsesorGroup');
    const customInput = document.getElementById('bookingNotesCustom');

    if (selectAsesor && customGroup && customInput) {
        selectAsesor.addEventListener('change', () => {
            if (selectAsesor.value === 'Otro...') {
                customGroup.classList.remove('hidden');
                customInput.value = '';
                customInput.required = true;
                customInput.focus();
            } else {
                customGroup.classList.add('hidden');
                customInput.required = false;
            }
        });
    }

    // Medio select dropdown change listener
    if (bookingSourceInput && customSourceGroup && bookingSourceCustomInput) {
        bookingSourceInput.addEventListener('change', () => {
            if (bookingSourceInput.value === 'Otro...') {
                customSourceGroup.classList.remove('hidden');
                bookingSourceCustomInput.value = '';
                bookingSourceCustomInput.required = true;
                bookingSourceCustomInput.focus();
            } else {
                customSourceGroup.classList.add('hidden');
                bookingSourceCustomInput.required = false;
            }
        });
    }

    // Stats Dashboard Actions
    if (btnOpenStats) {
        btnOpenStats.addEventListener('click', handleOpenStatsClick);
    }
    if (btnCloseStatsAuth) {
        btnCloseStatsAuth.addEventListener('click', () => {
            if (statsCountdownInterval) {
                clearInterval(statsCountdownInterval);
                statsCountdownInterval = null;
            }
            closeModal(modalStatsAuth);
        });
    }
    if (formStatsAuth) {
        formStatsAuth.addEventListener('submit', handleStatsAuthSubmit);
    }
    if (btnCloseStatsModal) {
        btnCloseStatsModal.addEventListener('click', () => closeModal(modalStats));
    }
    if (btnLockStats) {
        btnLockStats.addEventListener('click', handleLockStatsClick);
    }
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');
            tabButtons.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => {
                c.classList.remove('active');
                c.style.display = 'none';
            });
            btn.classList.add('active');
            const targetContent = document.getElementById(tabId);
            if (targetContent) {
                targetContent.classList.add('active');
                targetContent.style.display = 'block';
            }
        });
    });
    if (formStatsRates) {
        formStatsRates.addEventListener('submit', handleStatsRatesSave);
    }
}

// Helper to set toggle button active states and hidden input value
function setToggleValue(type, value) {
    const input = document.getElementById(`booking${type.charAt(0).toUpperCase() + type.slice(1)}`);
    if (!input) return;
    input.value = value ? 'true' : 'false';

    const toggleGroup = document.getElementById(`${type}Toggle`);
    if (!toggleGroup) return;

    const buttons = toggleGroup.querySelectorAll('.btn-toggle');
    buttons.forEach(btn => {
        const btnVal = btn.getAttribute('data-value') === 'true';
        if (btnVal === value) {
            btn.classList.add(value ? 'active-si' : 'active-no');
        } else {
            btn.classList.remove('active-si', 'active-no');
        }
    });
}

// Helper to set up event listeners for custom toggles
function setupToggleListeners(type) {
    const toggleGroup = document.getElementById(`${type}Toggle`);
    if (!toggleGroup) return;

    const buttons = toggleGroup.querySelectorAll('.btn-toggle');
    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            const val = btn.getAttribute('data-value') === 'true';
            setToggleValue(type, val);
        });
    });
}

// Helper to populate the dropdown of advisors with unique previous entries
function populateAsesoresDropdown(selectedValue = '') {
    const select = document.getElementById('bookingNotes');
    if (!select) return;

    // Clear dropdown
    select.innerHTML = '';

    // Collect unique advisor names
    const advisors = new Set();

    // Add current user
    const currentUser = localStorage.getItem('canchapro_user_name');
    if (currentUser) {
        advisors.add(currentUser);
    }

    // Add unique notes (advisor) from all events
    allEvents.forEach(e => {
        if (e.notes && e.notes.trim() && e.notes !== 'Otro...') {
            advisors.add(e.notes.trim());
        }
    });

    // Add options to select
    advisors.forEach(advisor => {
        const option = document.createElement('option');
        option.value = advisor;
        option.textContent = advisor;
        select.appendChild(option);
    });

    // Add "Otro..." option to allow typing a new name
    const optionOtro = document.createElement('option');
    optionOtro.value = 'Otro...';
    optionOtro.textContent = 'Otro... (Escribir nombre)';
    select.appendChild(optionOtro);

    const customGroup = document.getElementById('customAsesorGroup');
    const customInput = document.getElementById('bookingNotesCustom');

    if (selectedValue && !advisors.has(selectedValue) && selectedValue !== 'Otro...') {
        // If the saved value is not in our set, it means it's a custom value
        const optionCustom = document.createElement('option');
        optionCustom.value = selectedValue;
        optionCustom.textContent = selectedValue;
        select.insertBefore(optionCustom, optionOtro);
        select.value = selectedValue;
        customGroup.classList.add('hidden');
        customInput.required = false;
    } else if (selectedValue) {
        select.value = selectedValue;
        if (selectedValue === 'Otro...') {
            customGroup.classList.remove('hidden');
            customInput.required = true;
        } else {
            customGroup.classList.add('hidden');
            customInput.required = false;
        }
    } else {
        // Default to current user
        if (currentUser && advisors.has(currentUser)) {
            select.value = currentUser;
        }
        customGroup.classList.add('hidden');
        customInput.required = false;
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
        if (bookingDniInput) bookingDniInput.value = booking.dni || '';
        bookingCourtInput.value = booking.court;
        bookingSportInput.value = booking.sport;
        bookingDateInput.value = booking.date;
        bookingStartTimeInput.value = booking.start_time;
        bookingEndTimeInput.value = booking.end_time;

        // Populate and select correct advisor
        populateAsesoresDropdown(booking.notes || '');

        // Set pelota and chaleco state
        const pelotaVal = booking.pelota === true || booking.pelota === 'true';
        const chalecoVal = booking.chaleco === true || booking.chaleco === 'true';
        setToggleValue('pelota', pelotaVal);
        setToggleValue('chaleco', chalecoVal);

        btnDeleteBooking.classList.remove('hidden');

        // Populate and select correct Medio
        if (bookingSourceInput && customSourceGroup && bookingSourceCustomInput) {
            const savedMedio = booking.medio || 'Facebook';
            const standardMedios = ['Facebook', 'TikTok', 'Instagram', 'WhatsApp'];
            if (standardMedios.includes(savedMedio)) {
                bookingSourceInput.value = savedMedio;
                customSourceGroup.classList.add('hidden');
                bookingSourceCustomInput.required = false;
            } else {
                bookingSourceInput.value = 'Otro...';
                customSourceGroup.classList.remove('hidden');
                bookingSourceCustomInput.value = savedMedio;
                bookingSourceCustomInput.required = true;
            }
        }
    } else {
        // New Mode
        modalTitle.textContent = 'Nueva Reserva';
        bookingIdInput.value = '';
        btnDeleteBooking.classList.add('hidden');

        // Reset Medio to default Facebook
        if (bookingSourceInput && customSourceGroup && bookingSourceCustomInput) {
            bookingSourceInput.value = 'Facebook';
            customSourceGroup.classList.add('hidden');
            bookingSourceCustomInput.required = false;
        }

        // Reset toggles to default false
        setToggleValue('pelota', false);
        setToggleValue('chaleco', false);

        // Apply defaults if clicked on calendar
        if (defaults) {
            bookingDateInput.value = defaults.date;
            bookingStartTimeInput.value = defaults.start_time;

            // Ensure end time is at least 1 hour after start time
            const duration = getDurationInMinutes(defaults.start_time, defaults.end_time);
            if (duration < 60) {
                const startMins = parseTimeToMinutes(defaults.start_time);
                const newEndMins = (startMins + 60) % 1440;
                const newEndHour = Math.floor(newEndMins / 60);
                const newEndMin = newEndMins % 60;
                const formattedHour = String(newEndHour).padStart(2, '0');
                const formattedMin = String(newEndMin).padStart(2, '0');
                bookingEndTimeInput.value = `${formattedHour}:${formattedMin}`;
            } else {
                bookingEndTimeInput.value = defaults.end_time;
            }
        } else {
            // Standard defaults
            const today = new Date().toISOString().split('T')[0];
            bookingDateInput.value = today;
            bookingStartTimeInput.value = '14:00';
            bookingEndTimeInput.value = '15:00';
        }

        // Populate and default advisor to active operator
        const activeUser = localStorage.getItem('canchapro_user_name') || '';
        populateAsesoresDropdown(activeUser);
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
    let bookings = [];
    if (dbMode === 'supabase' && supabaseClient) {
        try {
            const { data, error } = await supabaseClient
                .from('reservas')
                .select('*')
                .order('date', { ascending: true })
                .order('start_time', { ascending: true });

            if (error) throw error;
            bookings = data || [];
        } catch (err) {
            console.error("Fallo al obtener de Supabase, usando respaldo local:", err);
            bookings = getLocalBookings();
        }
    } else {
        bookings = getLocalBookings();
    }

    // Filter to only include Los Pinos courts to prevent data contamination from other complexes
    const losPinosCourts = ['Grande', 'Pequeña'];
    return bookings.filter(b => losPinosCourts.includes(b.court));
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
    const { start: newStart, end: newEnd } = getStartAndEndDates(date, startTime, endTime);

    if (newStart >= newEnd) {
        return "La hora de inicio debe ser anterior a la hora de fin.";
    }

    // Operating hours check: Closed from 01:00 AM to 06:00 AM
    const closedStart = new Date(newStart);
    closedStart.setHours(1, 0, 0, 0);

    const closedEnd = new Date(newStart);
    closedEnd.setHours(6, 0, 0, 0);

    const isOverlap = (startA, endA, startB, endB) => startA < endB && endA > startB;

    if (isOverlap(newStart, newEnd, closedStart, closedEnd)) {
        return "El local está cerrado de 01:00 AM a 06:00 AM. Por favor elige otro horario.";
    }

    // Also check next day closed window in case it crosses midnight
    const closedStartNext = new Date(closedStart);
    closedStartNext.setDate(closedStartNext.getDate() + 1);
    const closedEndNext = new Date(closedEnd);
    closedEndNext.setDate(closedEndNext.getDate() + 1);

    if (isOverlap(newStart, newEnd, closedStartNext, closedEndNext)) {
        return "El local está cerrado de 01:00 AM a 06:00 AM. Por favor elige otro horario.";
    }

    // Check conflicts on the same court (considering midnight crossing)
    for (const event of allEvents) {
        // Skip current event if editing
        if (event.id === id) continue;

        if (event.court === court) {
            const { start: existStart, end: existEnd } = getStartAndEndDates(event.date, event.start_time, event.end_time);

            // Overlap check formula: (StartA < EndB) AND (EndA > StartB)
            if (isOverlap(newStart, newEnd, existStart, existEnd)) {
                return `Conflicto de horario: La ${court === 'Grande' ? 'Cancha Grande' : 'Cancha Pequeña'} ya está reservada por ${event.name} en este horario (${event.date} ${event.start_time} - ${event.end_time}).`;
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
    const dni = bookingDniInput ? bookingDniInput.value.trim() : '';
    const court = bookingCourtInput.value;
    const sport = bookingSportInput.value;
    const date = bookingDateInput.value;
    const startTime = bookingStartTimeInput.value;
    const endTime = bookingEndTimeInput.value;
    let notes = bookingNotesInput.value;
    if (notes === 'Otro...') {
        notes = document.getElementById('bookingNotesCustom').value.trim();
    } else {
        notes = notes.trim();
    }
    let medio = bookingSourceInput ? bookingSourceInput.value : '';
    if (medio === 'Otro...') {
        medio = bookingSourceCustomInput ? bookingSourceCustomInput.value.trim() : '';
    } else {
        medio = medio ? medio.trim() : '';
    }
    const pelota = bookingPelotaInput.value === 'true';
    const chaleco = bookingChalecoInput.value === 'true';

    // 1. Validation for empty inputs
    if (!name || !dni || !date || !startTime || !endTime || !medio) {
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
        dni,
        court,
        sport,
        date,
        start_time: startTime,
        end_time: endTime,
        notes,
        pelota,
        chaleco,
        medio
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
        const formattedDate = formatDateDDMMYYYY(date);
        const formattedStart = formatTimeHHMM(startTime);
        const formattedEnd = formatTimeHHMM(endTime);
        const logDetails = `${isUpdate ? 'modificó la' : 'creó una'} reserva para ${name} (${court} - ${sport}${pelota ? ' + Pelota' : ''}${chaleco ? ' + Chaleco' : ''}) el ${formattedDate} de ${formattedStart} a ${formattedEnd}`;
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
        const formattedDate = formatDateDDMMYYYY(date);
        const formattedStart = formatTimeHHMM(startTime);
        const formattedEnd = formatTimeHHMM(endTime);
        const logDetails = `eliminó la reserva de ${name} (${court} - ${sport}) del ${formattedDate} de ${formattedStart} a ${formattedEnd}`;
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

// Format and copy the reservation details to the clipboard
function handleCopyReservation() {
    const clientName = bookingNameInput.value.trim();
    const dniText = bookingDniInput ? bookingDniInput.value.trim() : '';
    const courtRaw = bookingCourtInput.value;
    const courtText = (courtRaw === 'Pequeña' || courtRaw === 'Chica') ? 'Chica' : 'Grande';
    let dateText = bookingDateInput.value;
    const startTime = bookingStartTimeInput.value;
    const endTime = bookingEndTimeInput.value;

    let advisorText = bookingNotesInput.value;
    if (advisorText === 'Otro...') {
        advisorText = document.getElementById('bookingNotesCustom').value.trim();
    } else {
        advisorText = advisorText ? advisorText.trim() : '';
    }

    let medioText = bookingSourceInput ? bookingSourceInput.value : '';
    if (medioText === 'Otro...') {
        medioText = bookingSourceCustomInput ? bookingSourceCustomInput.value.trim() : '';
    } else {
        medioText = medioText ? medioText.trim() : '';
    }

    // Validate if everything is filled
    if (!clientName || !dniText || !courtRaw || !dateText || !startTime || !endTime || !advisorText || !medioText) {
        showBookingError("Por favor completa todos los campos obligatorios (*) antes de copiar la reserva.");
        return;
    }

    // Clear any previous error
    bookingError.style.display = 'none';

    // Format date from YYYY-MM-DD to DD/MM/YYYY
    if (dateText && dateText.includes('-')) {
        const parts = dateText.split('-');
        if (parts.length === 3) {
            dateText = `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
    }

    const timeText = `${startTime} - ${endTime}`;
    const sportVal = bookingSportInput.value;
    const pelotaVal = bookingPelotaInput.value === 'true';
    const chalecoVal = bookingChalecoInput.value === 'true';

    // Show ball emoji only if pelota is Yes
    const pelotaBallEmoji = sportVal === 'Vóley' ? '🏐' : '⚽';
    const pelotaText = pelotaVal ? `Si ${pelotaBallEmoji}` : 'No';

    // Show vest emoji only if chalecos is Yes
    const chalecoText = chalecoVal ? `Si 🎽` : 'No';

    // Choose clock/sun/moon emoji based on booking start hour
    const startHour = parseInt(startTime.split(':')[0]);
    let timeEmoji = '⏰';
    if (!isNaN(startHour)) {
        if (startHour < 12) {
            timeEmoji = '☀️'; // Morning
        } else if (startHour < 18) {
            timeEmoji = '🌤️'; // Afternoon
        } else {
            timeEmoji = '🌙'; // Night
        }
    }

    const message = `*RESERVA DE CANCHA LOS PINOS*

Nombre del cliente: ${clientName}
DNI: ${dniText}
Cancha (Chica o Grande): ${courtText}
Fecha: ${dateText}
Hora: ${timeText} ${timeEmoji}
Pelota: ${pelotaText}
Chalecos: ${chalecoText}
Medio: ${medioText}
Asesor(a): ${advisorText}

*No se acepta reprogramación de fecha ni de hora*
*No se acepta devolución de dinero*`;

    // Copy to clipboard
    navigator.clipboard.writeText(message).then(() => {
        // Change button style/content temporarily to show success
        const originalHtml = btnCopyReservation.innerHTML;
        btnCopyReservation.innerHTML = '<i data-lucide="check"></i> ¡Copiado!';
        btnCopyReservation.style.backgroundColor = '#16a34a'; // green-600
        if (window.lucide) lucide.createIcons();

        setTimeout(() => {
            btnCopyReservation.innerHTML = originalHtml;
            btnCopyReservation.style.backgroundColor = ''; // Reverts to CSS
            if (window.lucide) lucide.createIcons();
        }, 2000);
    }).catch(err => {
        console.error('No se pudo copiar el texto: ', err);
    });
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
        return {
            valid: false, suggestion: correctedUrl,
            message: `❌ Pegaste la URL del panel de Supabase.\nLa URL correcta es: ${correctedUrl}`
        };
    }
    if (!url.includes('.supabase.co')) {
        return {
            valid: false, suggestion: null,
            message: `❌ La URL debe tener el formato:\nhttps://XXXXXXXXXXXXXXXX.supabase.co`
        };
    }
    return { valid: true, message: null, suggestion: null };
}

function validateKey(rawKey) {
    const key = rawKey.trim();
    // Clave secreta - nunca usar en el navegador
    if (key.startsWith('sb_secret_') || key.startsWith('sb_live_')) {
        return {
            valid: false,
            message: `❌ Pegaste la CLAVE SECRETA. Esta clave NUNCA debe usarse en un navegador.\n\n✅ Ve a Configuración → Claves API → pestaña "Legacy anon" y copia la clave "anon | public" (empieza con eyJ...)`
        };
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
    return {
        valid: false, suggestion: null,
        message: `❌ La clave no parece correcta.\n\nDebe empezar con "eyJ..." (Clave anon heredada).\nVe a Configuración → Claves API → pestaña "Legacy anon".`
    };
}

async function checkSupabaseReachable(url) {
    try {
        const res = await fetch(`${url}/rest/v1/`, { method: 'HEAD' });
        return true; // Any response means reachable
    } catch (e) {
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
    const todayStr = getCurrentBusinessDate();

    // Filter events belonging to today's business day
    const todayEvents = allEvents.filter(e => getBusinessDate(e.date, e.start_time) === todayStr);

    statTodayReservations.textContent = todayEvents.length;

    let hoursGrande = 0;
    let hoursPequena = 0;

    todayEvents.forEach(e => {
        let start = parseTimeToMinutes(e.start_time);
        let end = parseTimeToMinutes(e.end_time);
        if (end <= start) {
            end += 1440; // Add 24 hours in minutes
        }
        const diffHours = (end - start) / 60;

        if (e.court === 'Grande') {
            hoursGrande += diffHours;
        } else if (e.court === 'Pequeña') {
            hoursPequena += diffHours;
        }
    });

    statCanchaGrande.textContent = `${hoursGrande.toFixed(1)} h`;
    statCanchaPequena.textContent = `${hoursPequena.toFixed(1)} h`;

    // Refresh statistics dashboard if it's active
    if (modalStats && modalStats.classList.contains('active')) {
        updateStatsDashboard();
    }
}

// Render a summary list of all bookings for the currently selected day in the calendar
function updateDailySummary() {
    if (!calendar) return;

    const currentDate = calendar.getDate();
    // format as YYYY-MM-DD in local time
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    // Update label text e.g. "Lunes, 8 de Junio de 2026"
    const labelOptions = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
    const formattedLabel = currentDate.toLocaleDateString('es-ES', labelOptions);
    const summaryDateLabel = document.getElementById('summaryDateLabel');
    if (summaryDateLabel) {
        summaryDateLabel.textContent = formattedLabel.charAt(0).toUpperCase() + formattedLabel.slice(1);
    }

    const summaryListContainer = document.getElementById('dailySummaryList');
    if (!summaryListContainer) return;

    // Filter events for this business day
    const dayEvents = allEvents.filter(e => getBusinessDate(e.date, e.start_time) === dateStr);

    // Sort by actual chronological start date/time
    dayEvents.sort((a, b) => {
        const dateA = new Date(`${a.date}T${a.start_time}`);
        const dateB = new Date(`${b.date}T${b.start_time}`);
        return dateA - dateB;
    });

    if (dayEvents.length === 0) {
        summaryListContainer.innerHTML = '<p class="no-activity" style="width: 100%;">No hay reservas programadas para este día.</p>';
        return;
    }

    let html = '';
    dayEvents.forEach(e => {
        let badgeClass = 'court-badge-grande';
        if (e.court === 'Pequeña') badgeClass = 'court-badge-pequena';

        const pelotaVal = e.pelota === true || e.pelota === 'true';
        const chalecoVal = e.chaleco === true || e.chaleco === 'true';

        html += `
            <div class="summary-item-card" onclick="openEditFromSummary('${e.id}')" style="cursor: pointer;">
                <div class="summary-item-header">
                    <span class="summary-item-time">${formatTimeHHMM(e.start_time)} - ${formatTimeHHMM(e.end_time)}</span>
                    <span class="summary-item-court ${badgeClass}">Cancha ${e.court}</span>
                </div>
                <div class="summary-item-client">${escapeHTML(e.name)}</div>
                <div class="summary-item-details">
                    <span class="summary-detail-tag">DNI: ${escapeHTML(e.dni)}</span>
                    <span class="summary-detail-tag"><i data-lucide="user"></i> ${escapeHTML(e.notes || 'Sin asesor')}</span>
                    <span class="summary-detail-tag"><i data-lucide="share-2"></i> ${escapeHTML(e.medio || 'Otro')}</span>
                    ${pelotaVal ? `<span class="summary-detail-tag" style="color:#34d399;">⚽ Pelota</span>` : ''}
                    ${chalecoVal ? `<span class="summary-detail-tag" style="color:#34d399;">🎽 Chaleco</span>` : ''}
                </div>
            </div>
        `;
    });

    summaryListContainer.innerHTML = html;
    if (window.lucide) lucide.createIcons();
}

// Global function to trigger modal edit directly from summary click
window.openEditFromSummary = function (id) {
    const booking = allEvents.find(e => e.id === id);
    if (booking) {
        openBookingModal(booking);
    }
};

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

    // Save to localStorage immediately so that addHistoryEntry uses the correct operator name
    localStorage.setItem('canchapro_user_name', formattedName);
    displayUserName.textContent = formattedName;
    closeModal(modalUserOnboarding);

    if (oldName && oldName !== formattedName) {
        await addHistoryEntry('editar', `cambió su nombre (antes: ${oldName})`);
    } else if (!oldName) {
        await addHistoryEntry('crear', `ingresó al sistema`);
    }

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
    if (!data) return [];
    try {
        const history = JSON.parse(data);
        const threeDaysAgo = Date.now() - (3 * 24 * 60 * 60 * 1000);
        return history.filter(e => new Date(e.created_at).getTime() > threeDaysAgo);
    } catch (e) {
        return [];
    }
}

async function fetchAndRenderHistory() {
    let entries = [];
    const threeDaysAgoISO = new Date(Date.now() - (3 * 24 * 60 * 60 * 1000)).toISOString();

    if (dbMode === 'supabase' && supabaseClient) {
        try {
            // Prune database logs older than 3 days
            await supabaseClient
                .from('historial')
                .delete()
                .lt('created_at', threeDaysAgoISO);

            // Fetch remaining active logs for the last 3 days
            const { data, error } = await supabaseClient
                .from('historial')
                .select('*')
                .gt('created_at', threeDaysAgoISO)
                .order('created_at', { ascending: false });

            if (error) throw error;
            entries = data || [];

            // Filter out entries that belong to Polideportivo complex
            const polideportivoCourts = ['Cancha Grande', 'Cancha Pequeña', 'Cancha de Vóley'];
            entries = entries.filter(e => {
                const d = e.details || '';
                return !polideportivoCourts.some(court => d.includes(`(${court} -`));
            });

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

    if (!activityList) return;

    if (entries.length === 0) {
        activityList.innerHTML = '<p class="no-activity">No hay actividad registrada.</p>';
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
        html += `<div class="activity-day-group">${dayLabel}</div>`;
        html += groupEntries.map(entry => {
            const timeAgo = formatTimeAgo(new Date(entry.created_at));
            let actionClass = 'crear';

            if (entry.action === 'editar') {
                actionClass = 'editar';
            } else if (entry.action === 'eliminar') {
                actionClass = 'eliminar';
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

    activityList.innerHTML = html;
}

function getDayGroupLabel(dateStr) {
    const today = new Date();
    const target = new Date(dateStr);

    // Compare dates ignoring time
    const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const targetDate = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();

    const diffDays = Math.round((todayDate - targetDate) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
        return "Hoy";
    } else if (diffDays === 1) {
        return "Ayer";
    } else {
        // Format date: e.g. "Lunes, 8 de Junio"
        let label = target.toLocaleDateString('es-ES', {
            weekday: 'long',
            day: 'numeric',
            month: 'long'
        });
        return label.charAt(0).toUpperCase() + label.slice(1);
    }
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

// Utility to normalize times to HH:MM format (removing seconds if any)
function formatTimeHHMM(timeStr) {
    if (!timeStr) return '';
    const parts = timeStr.split(':');
    if (parts.length >= 2) {
        const hour = parts[0].padStart(2, '0');
        const min = parts[1].padStart(2, '0');
        return `${hour}:${min}`;
    }
    if (timeStr === '0' || timeStr === '00' || timeStr === 0) {
        return '00:00';
    }
    return timeStr;
}

// Utility to normalize dates to DD/MM/YYYY format
function formatDateDDMMYYYY(dateStr) {
    if (dateStr && dateStr.includes('-')) {
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
    }
    return dateStr;
}

// ==========================================
// Helper functions for crossing midnight and business days
// ==========================================
function getStartAndEndDates(dateStr, startTimeStr, endTimeStr) {
    const start = new Date(`${dateStr}T${startTimeStr}`);
    let end = new Date(`${dateStr}T${endTimeStr}`);
    if (end <= start) {
        end.setDate(end.getDate() + 1);
    }
    return { start, end };
}

function formatISOString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}:00`;
}

function getBusinessDate(dateStr, startTimeStr) {
    const hours = parseInt(startTimeStr.split(':')[0], 10);
    if (hours < 6) {
        const date = new Date(`${dateStr}T12:00:00`);
        date.setDate(date.getDate() - 1);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    return dateStr;
}

function getCurrentBusinessDate() {
    const now = new Date();
    const hours = now.getHours();
    if (hours < 6) {
        now.setDate(now.getDate() - 1);
    }
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getDurationInMinutes(startTime, endTime) {
    const startMins = parseTimeToMinutes(startTime);
    let endMins = parseTimeToMinutes(endTime);
    if (endMins <= startMins) {
        endMins += 1440;
    }
    return endMins - startMins;
}

// ==========================================
// Statistics & Earnings Logic
// ==========================================
function handleOpenStatsClick() {
    closeSidebarDrawer();
    const isUnlocked = localStorage.getItem('canchapro_stats_unlocked') === 'true';
    if (isUnlocked) {
        openStatsDashboard();
    } else {
        if (statsCountdownInterval) {
            clearInterval(statsCountdownInterval);
            statsCountdownInterval = null;
        }
        statsPasswordInput.value = '';
        statsAuthError.style.display = 'none';
        openModal(modalStatsAuth);
        setTimeout(() => statsPasswordInput.focus(), 100);
    }
}

function handleStatsAuthSubmit(e) {
    e.preventDefault();
    const pwd = statsPasswordInput.value;

    if (statsCountdownInterval) {
        clearInterval(statsCountdownInterval);
        statsCountdownInterval = null;
    }

    if (pwd === 'Reservasupabase') {
        localStorage.setItem('canchapro_stats_unlocked', 'true');
        closeModal(modalStatsAuth);
        openStatsDashboard();
    } else {
        let seconds = 15;
        statsAuthError.textContent = `🚨 ¡ADVERTENCIA! Contraseña incorrecta. Su computadora explotará en ${seconds} segundos... Ingresa la contraseña correcta o sal de la ventana`;
        statsAuthError.style.display = 'block';
        statsPasswordInput.focus();

        statsCountdownInterval = setInterval(() => {
            seconds--;
            if (seconds > 0) {
                statsAuthError.textContent = `🚨 ¡ADVERTENCIA! Contraseña incorrecta. Su computadora explotará en ${seconds} segundos... Ingresa la contraseña correcta o sal de la ventana`;
            } else if (seconds === 0) {
                statsAuthError.textContent = `🚨 ¡ADVERTENCIA! Contraseña incorrecta. Su computadora explotará en 0 segundos... Ingresa la contraseña correcta o sal de la ventana`;
            } else {
                clearInterval(statsCountdownInterval);
                statsCountdownInterval = null;
                statsAuthError.textContent = 'Naaa mentira xD';
            }
        }, 1000);
    }
}

function handleLockStatsClick() {
    localStorage.removeItem('canchapro_stats_unlocked');
    closeModal(modalStats);
}

function openStatsDashboard() {
    // Reset tabs
    tabButtons.forEach(b => b.classList.remove('active'));
    tabContents.forEach(c => {
        c.classList.remove('active');
        c.style.display = 'none';
    });

    // Set to first tab (report)
    const reportTabBtn = document.querySelector('[data-tab="tab-report"]');
    if (reportTabBtn) reportTabBtn.classList.add('active');
    const reportTabContent = document.getElementById('tab-report');
    if (reportTabContent) {
        reportTabContent.classList.add('active');
        reportTabContent.style.display = 'block';
    }

    // Build rates inputs dynamically
    buildRatesForm();

    // Calculate and render stats
    updateStatsDashboard();

    // Open modal
    openModal(modalStats);
}

function buildRatesForm() {
    if (!ratesFormRow) return;
    ratesFormRow.innerHTML = `
        <div class="form-group">
            <label for="rateGrande">Hora Cancha Grande (S/.) *</label>
            <div class="input-wrapper">
                <i data-lucide="dollar-sign"></i>
                <input type="number" id="rateGrande" required min="0" step="0.5" value="${localStorage.getItem('canchapro_rate_grande') || '25'}">
            </div>
        </div>
        <div class="form-group">
            <label for="ratePequena">Hora Cancha Pequeña (S/.) *</label>
            <div class="input-wrapper">
                <i data-lucide="dollar-sign"></i>
                <input type="number" id="ratePequena" required min="0" step="0.5" value="${localStorage.getItem('canchapro_rate_pequena') || '25'}">
            </div>
        </div>
        <div class="form-group">
            <label for="ratePelota">Alquiler de Pelota (S/.) *</label>
            <div class="input-wrapper">
                <i data-lucide="dollar-sign"></i>
                <input type="number" id="ratePelota" required min="0" step="0.5" value="${localStorage.getItem('canchapro_rate_pelota') || '5'}">
            </div>
        </div>
        <div class="form-group">
            <label for="rateChaleco">Alquiler de Chalecos (S/.) *</label>
            <div class="input-wrapper">
                <i data-lucide="dollar-sign"></i>
                <input type="number" id="rateChaleco" required min="0" step="0.5" value="${localStorage.getItem('canchapro_rate_chaleco') || '5'}">
            </div>
        </div>
    `;
    if (window.lucide) lucide.createIcons();
}

function handleStatsRatesSave(e) {
    e.preventDefault();
    const rGrande = document.getElementById('rateGrande').value;
    const rPequena = document.getElementById('ratePequena').value;
    const rPelota = document.getElementById('ratePelota').value;
    const rChaleco = document.getElementById('rateChaleco').value;

    localStorage.setItem('canchapro_rate_grande', rGrande);
    localStorage.setItem('canchapro_rate_pequena', rPequena);
    localStorage.setItem('canchapro_rate_pelota', rPelota);
    localStorage.setItem('canchapro_rate_chaleco', rChaleco);

    statsRatesFeedback.className = 'settings-feedback success';
    statsRatesFeedback.textContent = '¡Tarifas guardadas y aplicadas con éxito! ✅';
    statsRatesFeedback.style.display = 'block';

    // Recalculate dashboard immediately
    updateStatsDashboard();

    setTimeout(() => {
        statsRatesFeedback.style.display = 'none';
    }, 2000);
}

function isSameBusinessWeek(eventDateStr, currentBusinessDateStr) {
    const eventDate = new Date(eventDateStr + 'T12:00:00');
    const currentDate = new Date(currentBusinessDateStr + 'T12:00:00');

    const currentDay = currentDate.getDay();
    const diffToMonday = currentDay === 0 ? -6 : 1 - currentDay; // Monday is 1
    const monday = new Date(currentDate);
    monday.setDate(currentDate.getDate() + diffToMonday);
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    return eventDate >= monday && eventDate <= sunday;
}

function getEventIncome(e) {
    let courtRate = 0;
    if (e.court === 'Grande') {
        courtRate = parseFloat(localStorage.getItem('canchapro_rate_grande') || '25');
    } else if (e.court === 'Pequeña') {
        courtRate = parseFloat(localStorage.getItem('canchapro_rate_pequena') || '25');
    }

    const pelotaRate = parseFloat(localStorage.getItem('canchapro_rate_pelota') || '5');
    const chalecoRate = parseFloat(localStorage.getItem('canchapro_rate_chaleco') || '5');

    let start = parseTimeToMinutes(e.start_time);
    let end = parseTimeToMinutes(e.end_time);
    if (end <= start) {
        end += 1440;
    }
    const durationHours = (end - start) / 60;

    const courtIncome = durationHours * courtRate;
    const pelotaIncome = (e.pelota === true || e.pelota === 'true') ? pelotaRate : 0;
    const chalecoIncome = (e.chaleco === true || e.chaleco === 'true') ? chalecoRate : 0;

    return {
        durationHours,
        courtIncome,
        pelotaIncome,
        chalecoIncome,
        total: courtIncome + pelotaIncome + chalecoIncome
    };
}

function updateStatsDashboard() {
    const todayStr = getCurrentBusinessDate();
    const currentMonthPrefix = todayStr.substring(0, 7);

    const todayEvents = allEvents.filter(e => getBusinessDate(e.date, e.start_time) === todayStr);
    const weekEvents = allEvents.filter(e => isSameBusinessWeek(getBusinessDate(e.date, e.start_time), todayStr));
    const monthEvents = allEvents.filter(e => getBusinessDate(e.date, e.start_time).startsWith(currentMonthPrefix));

    const metrics = {
        Grande: {
            today: { count: 0, hours: 0, income: 0 },
            week: { count: 0, hours: 0, income: 0 },
            month: { count: 0, hours: 0, income: 0 }
        },
        Pequena: {
            today: { count: 0, hours: 0, income: 0 },
            week: { count: 0, hours: 0, income: 0 },
            month: { count: 0, hours: 0, income: 0 }
        },
        Extras: {
            today: { income: 0 },
            week: { income: 0 },
            month: { income: 0 }
        },
        Total: {
            today: { count: 0, income: 0 },
            week: { count: 0, income: 0 },
            month: { count: 0, income: 0 }
        }
    };

    // Today metrics
    todayEvents.forEach(e => {
        const inc = getEventIncome(e);
        metrics.Total.today.count++;
        metrics.Total.today.income += inc.total;
        metrics.Extras.today.income += inc.pelotaIncome + inc.chalecoIncome;

        if (e.court === 'Grande') {
            metrics.Grande.today.count++;
            metrics.Grande.today.hours += inc.durationHours;
            metrics.Grande.today.income += inc.courtIncome;
        } else if (e.court === 'Pequeña') {
            metrics.Pequena.today.count++;
            metrics.Pequena.today.hours += inc.durationHours;
            metrics.Pequena.today.income += inc.courtIncome;
        }
    });

    // Week metrics
    weekEvents.forEach(e => {
        const inc = getEventIncome(e);
        metrics.Total.week.count++;
        metrics.Total.week.income += inc.total;
        metrics.Extras.week.income += inc.pelotaIncome + inc.chalecoIncome;

        if (e.court === 'Grande') {
            metrics.Grande.week.count++;
            metrics.Grande.week.hours += inc.durationHours;
            metrics.Grande.week.income += inc.courtIncome;
        } else if (e.court === 'Pequeña') {
            metrics.Pequena.week.count++;
            metrics.Pequena.week.hours += inc.durationHours;
            metrics.Pequena.week.income += inc.courtIncome;
        }
    });

    // Month metrics
    monthEvents.forEach(e => {
        const inc = getEventIncome(e);
        metrics.Total.month.count++;
        metrics.Total.month.income += inc.total;
        metrics.Extras.month.income += inc.pelotaIncome + inc.chalecoIncome;

        if (e.court === 'Grande') {
            metrics.Grande.month.count++;
            metrics.Grande.month.hours += inc.durationHours;
            metrics.Grande.month.income += inc.courtIncome;
        } else if (e.court === 'Pequeña') {
            metrics.Pequena.month.count++;
            metrics.Pequena.month.hours += inc.durationHours;
            metrics.Pequena.month.income += inc.courtIncome;
        }
    });

    // Update dashboard labels
    document.getElementById('statsIncomeToday').textContent = `S/. ${metrics.Total.today.income.toFixed(2)}`;
    document.getElementById('statsCountToday').textContent = `${metrics.Total.today.count} reservas`;

    document.getElementById('statsIncomeWeek').textContent = `S/. ${metrics.Total.week.income.toFixed(2)}`;
    document.getElementById('statsCountWeek').textContent = `${metrics.Total.week.count} reservas`;

    document.getElementById('statsIncomeMonth').textContent = `S/. ${metrics.Total.month.income.toFixed(2)}`;
    document.getElementById('statsCountMonth').textContent = `${metrics.Total.month.count} reservas`;

    // Render breakdown table rows
    const tbody = document.getElementById('statsBreakdownTableBody');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td>
                    <strong style="color: var(--text-primary);">Cancha Grande</strong><br>
                    <span style="font-size: 11px; color: var(--text-muted);">Alquileres / Horas</span>
                </td>
                <td style="text-align: right;">
                    <strong>S/. ${metrics.Grande.today.income.toFixed(2)}</strong><br>
                    <span style="font-size: 11px; color: var(--text-muted);">${metrics.Grande.today.count} res. / ${metrics.Grande.today.hours.toFixed(1)}h</span>
                </td>
                <td style="text-align: right;">
                    <strong>S/. ${metrics.Grande.week.income.toFixed(2)}</strong><br>
                    <span style="font-size: 11px; color: var(--text-muted);">${metrics.Grande.week.count} res. / ${metrics.Grande.week.hours.toFixed(1)}h</span>
                </td>
                <td style="text-align: right;">
                    <strong>S/. ${metrics.Grande.month.income.toFixed(2)}</strong><br>
                    <span style="font-size: 11px; color: var(--text-muted);">${metrics.Grande.month.count} res. / ${metrics.Grande.month.hours.toFixed(1)}h</span>
                </td>
            </tr>
            <tr>
                <td>
                    <strong style="color: var(--text-primary);">Cancha Pequeña</strong><br>
                    <span style="font-size: 11px; color: var(--text-muted);">Alquileres / Horas</span>
                </td>
                <td style="text-align: right;">
                    <strong>S/. ${metrics.Pequena.today.income.toFixed(2)}</strong><br>
                    <span style="font-size: 11px; color: var(--text-muted);">${metrics.Pequena.today.count} res. / ${metrics.Pequena.today.hours.toFixed(1)}h</span>
                </td>
                <td style="text-align: right;">
                    <strong>S/. ${metrics.Pequena.week.income.toFixed(2)}</strong><br>
                    <span style="font-size: 11px; color: var(--text-muted);">${metrics.Pequena.week.count} res. / ${metrics.Pequena.week.hours.toFixed(1)}h</span>
                </td>
                <td style="text-align: right;">
                    <strong>S/. ${metrics.Pequena.month.income.toFixed(2)}</strong><br>
                    <span style="font-size: 11px; color: var(--text-muted);">${metrics.Pequena.month.count} res. / ${metrics.Pequena.month.hours.toFixed(1)}h</span>
                </td>
            </tr>
            <tr>
                <td>
                    <strong style="color: var(--text-primary);">Extras (Pelota + Chaleco)</strong><br>
                    <span style="font-size: 11px; color: var(--text-muted);">Servicios adicionales</span>
                </td>
                <td style="text-align: right;">
                    <strong>S/. ${metrics.Extras.today.income.toFixed(2)}</strong>
                </td>
                <td style="text-align: right;">
                    <strong>S/. ${metrics.Extras.week.income.toFixed(2)}</strong>
                </td>
                <td style="text-align: right;">
                    <strong>S/. ${metrics.Extras.month.income.toFixed(2)}</strong>
                </td>
            </tr>
            <tr style="background: rgba(16, 185, 129, 0.08); font-weight: 600; border-top: 1px solid var(--primary);">
                <td>
                    <strong style="color: var(--primary);">Total General</strong><br>
                    <span style="font-size: 11px; color: var(--primary); opacity: 0.8;">Ventas Totales</span>
                </td>
                <td style="text-align: right; color: #34d399;">
                    <strong>S/. ${metrics.Total.today.income.toFixed(2)}</strong><br>
                    <span style="font-size: 11px; color: var(--text-secondary);">${metrics.Total.today.count} res.</span>
                </td>
                <td style="text-align: right; color: #34d399;">
                    <strong>S/. ${metrics.Total.week.income.toFixed(2)}</strong><br>
                    <span style="font-size: 11px; color: var(--text-secondary);">${metrics.Total.week.count} res.</span>
                </td>
                <td style="text-align: right; color: #34d399;">
                    <strong>S/. ${metrics.Total.month.income.toFixed(2)}</strong><br>
                    <span style="font-size: 11px; color: var(--text-secondary);">${metrics.Total.month.count} res.</span>
                </td>
            </tr>
        `;
    }
}


