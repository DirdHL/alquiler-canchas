// ==========================================
// CanchaPro JavaScript App Logic - Polideportivo
// ==========================================

// State Management
let dbMode = 'local'; // 'local' or 'supabase'
let supabaseClient = null;
let calendar = null;
let allEvents = []; // Cache for local/downloaded events
let cachedClientsData = [];
let currentClientsFilter = '';
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
const bookingPaymentTypeInput = document.getElementById('bookingPaymentType');
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

// Filters - simplified groups
const filterCanchaGrande = document.getElementById('filterCanchaGrande');
const filterCanchaPequena = document.getElementById('filterCanchaPequena');
const filterCanchaVoley = document.getElementById('filterCanchaVoley');
const filterFutbol = document.getElementById('filterFutbol');
const filterVoley = document.getElementById('filterVoley');

// Stats
const statTodayReservations = document.getElementById('statTodayReservations');
const statFutbolGrande = document.getElementById('statFutbolGrande');
const statFutbolChico = document.getElementById('statFutbolChico');
const statVoley = document.getElementById('statVoley');

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

    // 2. Initialize Operator Identity (canchapro_user_name is shared)
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
            if (calendar) {
                const currentDate = calendar.getDate();
                const year = currentDate.getFullYear();
                const month = String(currentDate.getMonth() + 1).padStart(2, '0');
                const day = String(currentDate.getDate()).padStart(2, '0');
                const dateStr = `${year}-${month}-${day}`;
                highlightSelectedDay(dateStr);
            }
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
                    let courtClass = 'event-cancha-grande';
                    if (b.court === 'Cancha Pequeña') {
                        courtClass = 'event-cancha-pequena';
                    } else if (b.court === 'Cancha de Vóley') {
                        courtClass = 'event-cancha-voley';
                    }
                    const { start, end } = getStartAndEndDates(b.date, b.start_time, b.end_time);
                    return {
                        id: b.id,
                        title: `${b.name} (${b.court})${b.pelota === true || b.pelota === 'true' ? (b.sport === 'Vóley' ? ' 🏐' : ' ⚽') : ''}${b.chaleco === true || b.chaleco === 'true' ? ' 🎽' : ''}`,
                        start: formatISOString(start),
                        end: formatISOString(end),
                        className: `${courtClass} ${b.sport === 'Fútbol' ? 'event-sport-futbol' : 'event-sport-voley'}`,
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

        // Click/tap on a cell to create an event (optimized for mobile)
        dateClick: function (info) {
            if (window.innerWidth >= 768) return; // Managed by select callback on desktop
            
            const dateStr = info.dateStr.split('T')[0];
            let startTimeStr = '14:00';
            let endTimeStr = '15:00';

            if (info.dateStr.includes('T')) {
                startTimeStr = formatTime(info.date);
                
                // End time: start time + 1 hour
                const startMins = info.date.getHours() * 60 + info.date.getMinutes();
                const newEndMins = (startMins + 60) % 1440;
                const newEndHour = Math.floor(newEndMins / 60);
                const newEndMin = newEndMins % 60;
                const formattedHour = String(newEndHour).padStart(2, '0');
                const formattedMin = String(newEndMin).padStart(2, '0');
                endTimeStr = `${formattedHour}:${formattedMin}`;
            }

            openBookingModal(null, {
                date: dateStr,
                start_time: startTimeStr,
                end_time: endTimeStr
            });
        },

        // Click event to view/edit
        eventClick: function (info) {
            if (info.jsEvent) {
                info.jsEvent.stopPropagation();
            }
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

    // Checkbox Filters - Bind simplified court checkboxes + sport checkboxes
    [
        filterCanchaGrande, filterCanchaPequena, filterCanchaVoley,
        filterFutbol, filterVoley
    ].forEach(checkbox => {
        if (checkbox) {
            checkbox.addEventListener('change', () => {
                if (calendar) calendar.refetchEvents();
            });
        }
    });

    // Court select dependency rule
    if (bookingCourtInput) {
        bookingCourtInput.addEventListener('change', handleCourtSportDependency);
    }

    // Responsive views adjust
    let lastWidth = window.innerWidth;
    window.addEventListener('resize', () => {
        const currentWidth = window.innerWidth;
        if (currentWidth >= 900) {
            closeSidebarDrawer();
        }
        if (!calendar) {
            lastWidth = currentWidth;
            return;
        }
        const wasMobile = lastWidth < 768;
        const isMobile = currentWidth < 768;
        if (wasMobile !== isMobile) {
            const newView = isMobile ? 'timeGridDay' : 'timeGridWeek';
            calendar.changeView(newView);
        }
        lastWidth = currentWidth;
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
    const searchInput = document.getElementById('statsClientesSearch');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            currentClientsFilter = e.target.value.trim().toLowerCase();
            renderClientsTable(currentClientsFilter);
        });
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

    // Make date and time inputs show their picker when clicking on the left icon (SVG)
    document.querySelectorAll('.input-wrapper').forEach(wrapper => {
        const input = wrapper.querySelector('input[type="date"], input[type="time"]');
        if (input) {
            wrapper.addEventListener('click', function (e) {
                // Trigger showPicker only if they clicked the left SVG icon (or inside it)
                const svg = wrapper.querySelector('svg');
                if (svg && (e.target === svg || svg.contains(e.target))) {
                    try {
                        input.showPicker();
                    } catch (err) {
                        console.error("showPicker no está soportado en este navegador:", err);
                    }
                }
            });
        }
    });

    // Click header cell to navigate & select day
    document.addEventListener('click', function(e) {
        const header = e.target.closest('.fc-col-header-cell[data-date]');
        if (header && calendar) {
            const dateStr = header.getAttribute('data-date');
            if (dateStr) {
                const parts = dateStr.split('-');
                const localDate = new Date(parts[0], parts[1] - 1, parts[2]);
                calendar.gotoDate(localDate);
                updateDailySummary();
                highlightSelectedDay(dateStr);
            }
        }
    });
}

// Automatic lock/fill of sport based on court choice
function handleCourtSportDependency() {
    const court = bookingCourtInput.value;
    if (court.includes('Vóley')) {
        bookingSportInput.value = 'Vóley';
        bookingSportInput.disabled = true;
    } else {
        bookingSportInput.value = 'Fútbol';
        bookingSportInput.disabled = true;
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
    if (booking === null && modalBooking.classList.contains('active')) {
        return; // Prevent duplicate triggers if already open for new booking
    }
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

        // Populate correct Payment Type
        if (bookingPaymentTypeInput) {
            bookingPaymentTypeInput.value = booking.tipo_pago || 'Efectivo';
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

        // Reset Payment Type to default Yape
        if (bookingPaymentTypeInput) {
            bookingPaymentTypeInput.value = 'Yape';
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

    // Call the dependency rule to disable/select sport based on the current court value
    handleCourtSportDependency();

    openModal(modalBooking);
    lucide.createIcons(); // Refresh modal icons
}

function closeBookingModal() {
    closeModal(modalBooking);
}

// Mobile sidebar controls
// Using a separate declaration from global app.js elements
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
        document.documentElement.classList.add('no-scroll');
    } else {
        document.body.classList.remove('no-scroll');
        document.documentElement.classList.remove('no-scroll');
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
                .or('negocio.eq.Polideportivo,negocio.is.null')
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

    // Filter to only include Polideportivo courts to prevent data contamination from other complexes
    const polideportivoCourts = ['Cancha Grande', 'Cancha Pequeña', 'Cancha de Vóley'];
    return bookings.filter(b => polideportivoCourts.includes(b.court));
}

// Local Storage Helper: Get (Polideportivo isolated namespace)
function getLocalBookings() {
    const data = localStorage.getItem('canchapro_reservas_poli');
    return data ? JSON.parse(data) : [];
}

// Local Storage Helper: Save (Polideportivo isolated namespace)
function saveLocalBookings(bookings) {
    localStorage.setItem('canchapro_reservas_poli', JSON.stringify(bookings));
}

// Filter bookings based on UI checkboxes
function filterEvents(bookings) {
    return bookings.filter(b => {
        let courtMatch = false;
        if (b.court === 'Cancha Grande' && filterCanchaGrande.checked) courtMatch = true;
        else if (b.court === 'Cancha Pequeña' && filterCanchaPequena.checked) courtMatch = true;
        else if (b.court === 'Cancha de Vóley' && filterCanchaVoley.checked) courtMatch = true;

        const sportMatch = (b.sport === 'Fútbol' && filterFutbol.checked) ||
            (b.sport === 'Vóley' && filterVoley.checked);

        return courtMatch && sportMatch;
    });
}

// Check overlapping bookings taking physical court capacity into account
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
        return "El polideportivo está cerrado de 01:00 AM a 06:00 AM. Por favor elige otro horario.";
    }

    // Also check next day closed window in case it crosses midnight
    const closedStartNext = new Date(closedStart);
    closedStartNext.setDate(closedStartNext.getDate() + 1);
    const closedEndNext = new Date(closedEnd);
    closedEndNext.setDate(closedEndNext.getDate() + 1);

    if (isOverlap(newStart, newEnd, closedStartNext, closedEndNext)) {
        return "El polideportivo está cerrado de 01:00 AM a 06:00 AM. Por favor elige otro horario.";
    }

    // Determine the physical capacity of this type of court
    let capacity = 1;
    if (court === 'Cancha Grande') {
        capacity = 3;
    } else if (court === 'Cancha Pequeña') {
        capacity = 4;
    } else if (court === 'Cancha de Vóley') {
        capacity = 4;
    }

    // Count overlapping bookings for the same court category
    let overlapCount = 0;
    const overlappingDetails = [];

    for (const event of allEvents) {
        // Skip current event if editing
        if (event.id === id) continue;

        if (event.court === court) {
            const { start: existStart, end: existEnd } = getStartAndEndDates(event.date, event.start_time, event.end_time);

            // Overlap check formula: (StartA < EndB) AND (EndA > StartB)
            if (isOverlap(newStart, newEnd, existStart, existEnd)) {
                overlapCount++;
                overlappingDetails.push(`${event.name} (${event.date} ${event.start_time} - ${event.end_time})`);
            }
        }
    }

    // Block only if we have exceeded the physical capacity of courts
    if (overlapCount >= capacity) {
        return `Conflicto de horario: Las ${capacity} canchas del tipo "${court}" ya están reservadas en este horario por:\n` +
            overlappingDetails.join(', ');
    }

    return null; // No conflict, capacity is not exceeded!
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
    const tipo_pago = bookingPaymentTypeInput ? bookingPaymentTypeInput.value : 'Efectivo';

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
        medio,
        tipo_pago,
        negocio: 'Polideportivo'
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

// Format and copy the reservation details to the clipboard (Polideportivo specialized)
function handleCopyReservation() {
    const clientName = bookingNameInput.value.trim();
    const dniText = bookingDniInput ? bookingDniInput.value.trim() : '';
    const courtText = bookingCourtInput.value; // Keeps exact court string e.g. "Fútbol Grande 1" or "Vóley 2"
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
    if (!clientName || !dniText || !courtText || !dateText || !startTime || !endTime || !advisorText || !medioText) {
        showBookingError("Por favor completa todos los campos obligatorios (*) antes de copiar la reserva.");
        return;
    }

    // Clear any previous error
    bookingError.style.display = 'none';

    // Format court name for WhatsApp copy
    let courtFormatted = courtText;
    if (courtText === 'Cancha Grande') {
        courtFormatted = 'Cancha Grande de Fútbol';
    } else if (courtText === 'Cancha Pequeña') {
        courtFormatted = 'Cancha Pequeña de Fútbol';
    }

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

    const message = `*RESERVA DE CANCHA POLIDEPORTIV0*

Nombre del cliente: ${clientName}
DNI: ${dniText}
Cancha: ${courtFormatted}
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

// Load Supabase settings and attempt initialization (Polideportivo isolated namespace)
function loadDatabaseSettings() {
    const url = localStorage.getItem('canchapro_supabase_url_poli');
    const key = localStorage.getItem('canchapro_supabase_key_poli');

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
        statusDesc.textContent = 'Las reservas están sincronizadas con la nube del Polideportivo y compartidas en tiempo real.';

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

    realtimeChannel = supabaseClient.channel('realtime_db_poli')
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

// Handle saving database settings form (Polideportivo isolated namespace)
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
        localStorage.setItem('canchapro_supabase_url_poli', url);
        localStorage.setItem('canchapro_supabase_key_poli', key);

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

// Update Dashboard Statistics Card (Polideportivo specialized)
function updateStats() {
    const todayStr = getCurrentBusinessDate();

    // Filter events belonging to today's business day
    const todayEvents = allEvents.filter(e => getBusinessDate(e.date, e.start_time) === todayStr);

    statTodayReservations.textContent = todayEvents.length;

    let hoursFutbolGrande = 0;
    let hoursFutbolChico = 0;
    let hoursVoley = 0;

    todayEvents.forEach(e => {
        let start = parseTimeToMinutes(e.start_time);
        let end = parseTimeToMinutes(e.end_time);
        if (end <= start) {
            end += 1440; // Add 24 hours in minutes
        }
        const diffHours = (end - start) / 60;

        if (e.court === 'Cancha Grande') {
            hoursFutbolGrande += diffHours;
        } else if (e.court === 'Cancha Pequeña') {
            hoursFutbolChico += diffHours;
        } else if (e.court === 'Cancha de Vóley') {
            hoursVoley += diffHours;
        }
    });

    if (statFutbolGrande) statFutbolGrande.textContent = `${hoursFutbolGrande.toFixed(1)} h`;
    if (statFutbolChico) statFutbolChico.textContent = `${hoursFutbolChico.toFixed(1)} h`;
    if (statVoley) statVoley.textContent = `${hoursVoley.toFixed(1)} h`;

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
        if (e.court === 'Cancha Pequeña') badgeClass = 'court-badge-pequena';
        if (e.court === 'Cancha de Vóley') badgeClass = 'court-badge-voley';

        const pelotaVal = e.pelota === true || e.pelota === 'true';
        const chalecoVal = e.chaleco === true || e.chaleco === 'true';

        html += `
            <div class="summary-item-card" onclick="openEditFromSummary('${e.id}')" style="cursor: pointer;">
                <div class="summary-item-header">
                    <span class="summary-item-time">${formatTimeHHMM(e.start_time)} - ${formatTimeHHMM(e.end_time)}</span>
                    <span class="summary-item-court ${badgeClass}">${e.court}</span>
                </div>
                <div class="summary-item-client">${escapeHTML(e.name)}</div>
                <div class="summary-item-details">
                    <span class="summary-detail-tag">DNI: ${escapeHTML(e.dni)}</span>
                    <span class="summary-detail-tag"><i data-lucide="user"></i> ${escapeHTML(e.notes || 'Sin asesor')}</span>
                    <span class="summary-detail-tag"><i data-lucide="share-2"></i> ${escapeHTML(e.medio || 'Otro')}</span>
                    <span class="summary-detail-tag"><i data-lucide="wallet"></i> ${escapeHTML(e.tipo_pago || 'Efectivo')}</span>
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

function highlightSelectedDay(dateStr) {
    document.querySelectorAll('.fc-day-selected').forEach(el => {
        el.classList.remove('fc-day-selected');
    });
    document.querySelectorAll(`[data-date="${dateStr}"]`).forEach(el => {
        el.classList.add('fc-day-selected');
    });
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

    // Clean duplicate spaces and capitalize each word
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

// Polideportivo isolated namespace
function saveHistoryEntryLocal(entry) {
    let history = getHistoryLocal();
    history.unshift(entry);
    if (history.length > 50) history = history.slice(0, 50);
    localStorage.setItem('canchapro_historial_poli', JSON.stringify(history));
    fetchAndRenderHistory();
}

// Polideportivo isolated namespace
function getHistoryLocal() {
    const data = localStorage.getItem('canchapro_historial_poli');
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

            // Filter out entries that belong to Los Pinos complex
            entries = entries.filter(e => {
                const d = e.details || '';
                return !d.includes('(Grande -') && !d.includes('(Pequeña -');
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

// Polideportivo isolated namespace
function clearHistoryLocal() {
    if (confirm("¿Estás seguro de que deseas limpiar el historial local? Esto no afectará la base de datos Supabase.")) {
        localStorage.removeItem('canchapro_historial_poli');
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
// Statistics & Earnings Logic (Polideportivo)
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

    if (pwd === 'Reservasupabase') {
        if (statsCountdownInterval) {
            clearInterval(statsCountdownInterval);
            statsCountdownInterval = null;
        }
        localStorage.setItem('canchapro_stats_unlocked', 'true');
        closeModal(modalStatsAuth);
        openStatsDashboard();
    } else {
        statsPasswordInput.focus();
        if (statsCountdownInterval) {
            // Already running! Do not reset the countdown.
            return;
        }

        let seconds = 15;
        statsAuthError.textContent = `🚨 ¡ADVERTENCIA! Contraseña incorrecta. Su computadora explotará en ${seconds} segundos... Ingresa la contraseña correcta o sal de la ventana`;
        statsAuthError.style.display = 'block';

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
                <input type="number" id="rateGrande" required min="0" step="0.5" value="${localStorage.getItem('canchapro_rate_grande_poli') || '30'}">
            </div>
        </div>
        <div class="form-group">
            <label for="ratePequena">Hora Cancha Pequeña (S/.) *</label>
            <div class="input-wrapper">
                <i data-lucide="dollar-sign"></i>
                <input type="number" id="ratePequena" required min="0" step="0.5" value="${localStorage.getItem('canchapro_rate_pequena_poli') || '30'}">
            </div>
        </div>
        <div class="form-group">
            <label for="rateVoley">Hora Cancha de Vóley (S/.) *</label>
            <div class="input-wrapper">
                <i data-lucide="dollar-sign"></i>
                <input type="number" id="rateVoley" required min="0" step="0.5" value="${localStorage.getItem('canchapro_rate_voley_poli') || '30'}">
            </div>
        </div>
        <div class="form-group">
            <label for="ratePelota">Alquiler de Pelota (S/.) *</label>
            <div class="input-wrapper">
                <i data-lucide="dollar-sign"></i>
                <input type="number" id="ratePelota" required min="0" step="0.5" value="${localStorage.getItem('canchapro_rate_pelota_poli') || '5'}">
            </div>
        </div>
        <div class="form-group">
            <label for="rateChaleco">Alquiler de Chalecos (S/.) *</label>
            <div class="input-wrapper">
                <i data-lucide="dollar-sign"></i>
                <input type="number" id="rateChaleco" required min="0" step="0.5" value="${localStorage.getItem('canchapro_rate_chaleco_poli') || '5'}">
            </div>
        </div>
    `;
    if (window.lucide) lucide.createIcons();
}

function handleStatsRatesSave(e) {
    e.preventDefault();
    const rGrande = document.getElementById('rateGrande').value;
    const rPequena = document.getElementById('ratePequena').value;
    const rVoley = document.getElementById('rateVoley').value;
    const rPelota = document.getElementById('ratePelota').value;
    const rChaleco = document.getElementById('rateChaleco').value;

    localStorage.setItem('canchapro_rate_grande_poli', rGrande);
    localStorage.setItem('canchapro_rate_pequena_poli', rPequena);
    localStorage.setItem('canchapro_rate_voley_poli', rVoley);
    localStorage.setItem('canchapro_rate_pelota_poli', rPelota);
    localStorage.setItem('canchapro_rate_chaleco_poli', rChaleco);

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
    if (e.court === 'Cancha Grande') {
        courtRate = parseFloat(localStorage.getItem('canchapro_rate_grande_poli') || '30');
    } else if (e.court === 'Cancha Pequeña') {
        courtRate = parseFloat(localStorage.getItem('canchapro_rate_pequena_poli') || '30');
    } else if (e.court === 'Cancha de Vóley') {
        courtRate = parseFloat(localStorage.getItem('canchapro_rate_voley_poli') || '30');
    }

    const pelotaRate = parseFloat(localStorage.getItem('canchapro_rate_pelota_poli') || '5');
    const chalecoRate = parseFloat(localStorage.getItem('canchapro_rate_chaleco_poli') || '5');

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

    // Calculate historical/previous periods
    // Yesterday
    const currentDate = new Date(todayStr + 'T12:00:00');
    const yesterday = new Date(currentDate);
    yesterday.setDate(currentDate.getDate() - 1);
    const yesterdayStr = formatISOString(yesterday).substring(0, 10);
    const yesterdayEvents = allEvents.filter(e => getBusinessDate(e.date, e.start_time) === yesterdayStr);
    let yesterdayIncome = 0;
    yesterdayEvents.forEach(e => { yesterdayIncome += getEventIncome(e).total; });

    // Previous Week
    const currentDay = currentDate.getDay();
    const diffToMonday = currentDay === 0 ? -6 : 1 - currentDay;
    const currentMonday = new Date(currentDate);
    currentMonday.setDate(currentDate.getDate() + diffToMonday);
    const prevMonday = new Date(currentMonday);
    prevMonday.setDate(currentMonday.getDate() - 7);
    const prevSunday = new Date(prevMonday);
    prevSunday.setDate(prevMonday.getDate() + 6);
    const prevMondayStr = formatISOString(prevMonday).substring(0, 10);
    const prevSundayStr = formatISOString(prevSunday).substring(0, 10);
    const prevWeekEvents = allEvents.filter(e => {
        const d = getBusinessDate(e.date, e.start_time);
        return d >= prevMondayStr && d <= prevSundayStr;
    });
    let prevWeekIncome = 0;
    prevWeekEvents.forEach(e => { prevWeekIncome += getEventIncome(e).total; });

    // Previous Month
    const currentYear = parseInt(currentMonthPrefix.split('-')[0], 10);
    const currentMonth = parseInt(currentMonthPrefix.split('-')[1], 10);
    let prevYear = currentYear;
    let prevMonth = currentMonth - 1;
    if (prevMonth === 0) {
        prevMonth = 12;
        prevYear--;
    }
    const prevMonthPrefix = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
    const prevMonthEvents = allEvents.filter(e => getBusinessDate(e.date, e.start_time).startsWith(prevMonthPrefix));
    let prevMonthIncome = 0;
    prevMonthEvents.forEach(e => { prevMonthIncome += getEventIncome(e).total; });

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
        Voley: {
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
        },
        Yape: {
            today: { count: 0, income: 0 },
            week: { count: 0, income: 0 },
            month: { count: 0, income: 0 }
        },
        Efectivo: {
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

        const payType = e.tipo_pago || 'Efectivo';
        if (payType === 'Yape') {
            metrics.Yape.today.count++;
            metrics.Yape.today.income += inc.total;
        } else {
            metrics.Efectivo.today.count++;
            metrics.Efectivo.today.income += inc.total;
        }

        if (e.court === 'Cancha Grande') {
            metrics.Grande.today.count++;
            metrics.Grande.today.hours += inc.durationHours;
            metrics.Grande.today.income += inc.courtIncome;
        } else if (e.court === 'Cancha Pequeña') {
            metrics.Pequena.today.count++;
            metrics.Pequena.today.hours += inc.durationHours;
            metrics.Pequena.today.income += inc.courtIncome;
        } else if (e.court === 'Cancha de Vóley') {
            metrics.Voley.today.count++;
            metrics.Voley.today.hours += inc.durationHours;
            metrics.Voley.today.income += inc.courtIncome;
        }
    });

    // Week metrics
    weekEvents.forEach(e => {
        const inc = getEventIncome(e);
        metrics.Total.week.count++;
        metrics.Total.week.income += inc.total;
        metrics.Extras.week.income += inc.pelotaIncome + inc.chalecoIncome;

        const payType = e.tipo_pago || 'Efectivo';
        if (payType === 'Yape') {
            metrics.Yape.week.count++;
            metrics.Yape.week.income += inc.total;
        } else {
            metrics.Efectivo.week.count++;
            metrics.Efectivo.week.income += inc.total;
        }

        if (e.court === 'Cancha Grande') {
            metrics.Grande.week.count++;
            metrics.Grande.week.hours += inc.durationHours;
            metrics.Grande.week.income += inc.courtIncome;
        } else if (e.court === 'Cancha Pequeña') {
            metrics.Pequena.week.count++;
            metrics.Pequena.week.hours += inc.durationHours;
            metrics.Pequena.week.income += inc.courtIncome;
        } else if (e.court === 'Cancha de Vóley') {
            metrics.Voley.week.count++;
            metrics.Voley.week.hours += inc.durationHours;
            metrics.Voley.week.income += inc.courtIncome;
        }
    });

    // Month metrics
    monthEvents.forEach(e => {
        const inc = getEventIncome(e);
        metrics.Total.month.count++;
        metrics.Total.month.income += inc.total;
        metrics.Extras.month.income += inc.pelotaIncome + inc.chalecoIncome;

        const payType = e.tipo_pago || 'Efectivo';
        if (payType === 'Yape') {
            metrics.Yape.month.count++;
            metrics.Yape.month.income += inc.total;
        } else {
            metrics.Efectivo.month.count++;
            metrics.Efectivo.month.income += inc.total;
        }

        if (e.court === 'Cancha Grande') {
            metrics.Grande.month.count++;
            metrics.Grande.month.hours += inc.durationHours;
            metrics.Grande.month.income += inc.courtIncome;
        } else if (e.court === 'Cancha Pequeña') {
            metrics.Pequena.month.count++;
            metrics.Pequena.month.hours += inc.durationHours;
            metrics.Pequena.month.income += inc.courtIncome;
        } else if (e.court === 'Cancha de Vóley') {
            metrics.Voley.month.count++;
            metrics.Voley.month.hours += inc.durationHours;
            metrics.Voley.month.income += inc.courtIncome;
        }
    });

    // Helper to render comparison text
    function renderCompareBadge(current, previous) {
        if (previous === 0) {
            if (current > 0) return `<span style="color: #34d399; font-weight: 500;">↑ +100% vs per. ant.</span>`;
            return `<span style="color: var(--text-muted);">0% vs per. ant.</span>`;
        }
        const diff = ((current - previous) / previous) * 100;
        if (diff > 0) return `<span style="color: #34d399; font-weight: 500;">↑ +${diff.toFixed(0)}% vs per. ant.</span>`;
        if (diff < 0) return `<span style="color: #f87171; font-weight: 500;">↓ ${Math.abs(diff).toFixed(0)}% vs per. ant.</span>`;
        return `<span style="color: var(--text-muted);">= 0% vs per. ant.</span>`;
    }

    // Update dashboard labels & comparisons
    document.getElementById('statsIncomeToday').textContent = `S/. ${metrics.Total.today.income.toFixed(2)}`;
    document.getElementById('statsCountToday').textContent = `${metrics.Total.today.count} reservas`;
    document.getElementById('statsCompareToday').innerHTML = renderCompareBadge(metrics.Total.today.income, yesterdayIncome);

    document.getElementById('statsIncomeWeek').textContent = `S/. ${metrics.Total.week.income.toFixed(2)}`;
    document.getElementById('statsCountWeek').textContent = `${metrics.Total.week.count} reservas`;
    document.getElementById('statsCompareWeek').innerHTML = renderCompareBadge(metrics.Total.week.income, prevWeekIncome);

    document.getElementById('statsIncomeMonth').textContent = `S/. ${metrics.Total.month.income.toFixed(2)}`;
    document.getElementById('statsCountMonth').textContent = `${metrics.Total.month.count} reservas`;
    document.getElementById('statsCompareMonth').innerHTML = renderCompareBadge(metrics.Total.month.income, prevMonthIncome);

    // Calculate Month efficiency (Capacity & Duration)
    const numberCourts = 3; // Cancha Grande, Cancha Pequeña, Cancha de Vóley
    const hoursPerDay = 17; // e.g. 7 AM to 12 AM
    const dailyCapacity = numberCourts * hoursPerDay;
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const monthlyCapacity = dailyCapacity * daysInMonth;

    let totalMonthHours = 0;
    monthEvents.forEach(e => { totalMonthHours += getEventIncome(e).durationHours; });
    const occupationPct = monthlyCapacity > 0 ? ((totalMonthHours / monthlyCapacity) * 100).toFixed(1) : '0.0';
    const totalMonthCount = monthEvents.length;
    const avgDuration = totalMonthCount > 0 ? (totalMonthHours / totalMonthCount).toFixed(1) : '0.0';

    document.getElementById('statsOcupacionMonth').textContent = `${occupationPct}%`;
    document.getElementById('statsDurationMonth').textContent = `Duración prom: ${avgDuration} h`;

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
                    <strong style="color: var(--text-primary);">Cancha de Vóley</strong><br>
                    <span style="font-size: 11px; color: var(--text-muted);">Alquileres / Horas</span>
                </td>
                <td style="text-align: right;">
                    <strong>S/. ${metrics.Voley.today.income.toFixed(2)}</strong><br>
                    <span style="font-size: 11px; color: var(--text-muted);">${metrics.Voley.today.count} res. / ${metrics.Voley.today.hours.toFixed(1)}h</span>
                </td>
                <td style="text-align: right;">
                    <strong>S/. ${metrics.Voley.week.income.toFixed(2)}</strong><br>
                    <span style="font-size: 11px; color: var(--text-muted);">${metrics.Voley.week.count} res. / ${metrics.Voley.week.hours.toFixed(1)}h</span>
                </td>
                <td style="text-align: right;">
                    <strong>S/. ${metrics.Voley.month.income.toFixed(2)}</strong><br>
                    <span style="font-size: 11px; color: var(--text-muted);">${metrics.Voley.month.count} res. / ${metrics.Voley.month.hours.toFixed(1)}h</span>
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
            <tr style="border-top: 2px solid var(--border-color); background: rgba(255, 255, 255, 0.01);">
                <td colspan="4" style="padding: 8px 16px; font-weight: 600; color: var(--text-secondary); font-size: 12px; text-transform: uppercase;">
                    Resumen por Tipo de Pago
                </td>
            </tr>
            <tr>
                <td>
                    <strong style="color: #60a5fa;">Yape</strong><br>
                    <span style="font-size: 11px; color: var(--text-muted);">Pagos digitales</span>
                </td>
                <td style="text-align: right;">
                    <strong>S/. ${metrics.Yape.today.income.toFixed(2)}</strong><br>
                    <span style="font-size: 11px; color: var(--text-muted);">${metrics.Yape.today.count} res.</span>
                </td>
                <td style="text-align: right;">
                    <strong>S/. ${metrics.Yape.week.income.toFixed(2)}</strong><br>
                    <span style="font-size: 11px; color: var(--text-muted);">${metrics.Yape.week.count} res.</span>
                </td>
                <td style="text-align: right;">
                    <strong>S/. ${metrics.Yape.month.income.toFixed(2)}</strong><br>
                    <span style="font-size: 11px; color: var(--text-muted);">${metrics.Yape.month.count} res.</span>
                </td>
            </tr>
            <tr>
                <td>
                    <strong style="color: #fbbf24;">Efectivo</strong><br>
                    <span style="font-size: 11px; color: var(--text-muted);">Dinero físico</span>
                </td>
                <td style="text-align: right;">
                    <strong>S/. ${metrics.Efectivo.today.income.toFixed(2)}</strong><br>
                    <span style="font-size: 11px; color: var(--text-muted);">${metrics.Efectivo.today.count} res.</span>
                </td>
                <td style="text-align: right;">
                    <strong>S/. ${metrics.Efectivo.week.income.toFixed(2)}</strong><br>
                    <span style="font-size: 11px; color: var(--text-muted);">${metrics.Efectivo.week.count} res.</span>
                </td>
                <td style="text-align: right;">
                    <strong>S/. ${metrics.Efectivo.month.income.toFixed(2)}</strong><br>
                    <span style="font-size: 11px; color: var(--text-muted);">${metrics.Efectivo.month.count} res.</span>
                </td>
            </tr>
        `;
    }



    // Calculate advisor statistics
    const activeAdvisors = new Set();
    const getAdvisorName = (notes) => {
        if (!notes || !notes.trim()) return 'Sin Asesor';
        return notes.trim();
    };

    todayEvents.forEach(e => activeAdvisors.add(getAdvisorName(e.notes)));
    weekEvents.forEach(e => activeAdvisors.add(getAdvisorName(e.notes)));
    monthEvents.forEach(e => activeAdvisors.add(getAdvisorName(e.notes)));

    const advisorMetrics = {};
    activeAdvisors.forEach(adv => {
        advisorMetrics[adv] = {
            today: { count: 0, income: 0 },
            week: { count: 0, income: 0 },
            month: { count: 0, income: 0 }
        };
    });

    todayEvents.forEach(e => {
        const adv = getAdvisorName(e.notes);
        const inc = getEventIncome(e);
        if (advisorMetrics[adv]) {
            advisorMetrics[adv].today.count++;
            advisorMetrics[adv].today.income += inc.total;
        }
    });

    weekEvents.forEach(e => {
        const adv = getAdvisorName(e.notes);
        const inc = getEventIncome(e);
        if (advisorMetrics[adv]) {
            advisorMetrics[adv].week.count++;
            advisorMetrics[adv].week.income += inc.total;
        }
    });

    monthEvents.forEach(e => {
        const adv = getAdvisorName(e.notes);
        const inc = getEventIncome(e);
        if (advisorMetrics[adv]) {
            advisorMetrics[adv].month.count++;
            advisorMetrics[adv].month.income += inc.total;
        }
    });

    const sortedAdvisors = Array.from(activeAdvisors).map(adv => ({
        name: adv,
        ...advisorMetrics[adv]
    }));

    sortedAdvisors.sort((a, b) => {
        if (b.month.income !== a.month.income) {
            return b.month.income - a.month.income;
        }
        if (b.month.count !== a.month.count) {
            return b.month.count - a.month.count;
        }
        return b.week.income - a.week.income;
    });

    const asesoresTbody = document.getElementById('statsAsesoresTableBody');
    if (asesoresTbody) {
        if (sortedAdvisors.length === 0) {
            asesoresTbody.innerHTML = `
                <tr>
                    <td colspan="4" style="text-align: center; padding: 24px; color: var(--text-muted);">
                        No hay reservas registradas con asesores en este período.
                    </td>
                </tr>
            `;
        } else {
            const maxAdvIncome = Math.max(...sortedAdvisors.map(adv => adv.month.income), 1);
            asesoresTbody.innerHTML = sortedAdvisors.map(adv => {
                const isSinAsesor = adv.name === 'Sin Asesor';
                const nameStyle = isSinAsesor ? 'color: var(--text-muted); font-style: italic;' : 'color: var(--text-primary); font-weight: 500;';
                const todayCountLabel = adv.today.count === 1 ? '1 cancha' : `${adv.today.count} canchas`;
                const weekCountLabel = adv.week.count === 1 ? '1 cancha' : `${adv.week.count} canchas`;
                const monthCountLabel = adv.month.count === 1 ? '1 cancha' : `${adv.month.count} canchas`;
                const advMonthPct = maxAdvIncome > 0 ? ((adv.month.income / maxAdvIncome) * 100).toFixed(0) : 0;
                return `
                    <tr>
                        <td style="padding: 12px 16px;">
                            <span style="${nameStyle}">${escapeHTML(adv.name)}</span><br>
                            <div style="width: 80px; background: rgba(255,255,255,0.05); height: 4px; border-radius: 2px; margin-top: 4px; overflow: hidden;">
                                <div style="width: ${advMonthPct}%; background: var(--primary); height: 100%; border-radius: 2px;"></div>
                            </div>
                        </td>
                        <td style="padding: 12px 16px; text-align: right;">
                            <strong>S/. ${adv.today.income.toFixed(2)}</strong><br>
                            <span style="font-size: 11px; color: var(--text-muted);">${todayCountLabel}</span>
                        </td>
                        <td style="padding: 12px 16px; text-align: right;">
                            <strong>S/. ${adv.week.income.toFixed(2)}</strong><br>
                            <span style="font-size: 11px; color: var(--text-muted);">${weekCountLabel}</span>
                        </td>
                        <td style="padding: 12px 16px; text-align: right;">
                            <strong>S/. ${adv.month.income.toFixed(2)}</strong><br>
                            <span style="font-size: 11px; color: var(--text-muted);">${monthCountLabel}</span>
                        </td>
                    </tr>
                `;
            }).join('');
        }
    }

    // ==========================================
    // Advanced Statistics: Usage & Channels
    // ==========================================
    const statsMediosTbody = document.getElementById('statsMediosTableBody');
    const statsEquipamientoTbody = document.getElementById('statsEquipamientoTableBody');
    const statsHorasPicoList = document.getElementById('statsHorasPicoList');
    const statsClientesVipList = document.getElementById('statsClientesVipList');
    const statsDiasDemandaContainer = document.getElementById('statsDiasDemandaContainer');

    if (statsMediosTbody || statsEquipamientoTbody || statsHorasPicoList || statsClientesVipList || statsDiasDemandaContainer) {
        // 1. Contact channels (medio)
        const normalizeChannel = (m) => {
            if (!m) return 'Otros';
            const cleaned = m.trim().toLowerCase();
            if (cleaned.includes('whatsapp')) return 'WhatsApp';
            if (cleaned.includes('facebook')) return 'Facebook';
            if (cleaned.includes('instagram')) return 'Instagram';
            if (cleaned.includes('tiktok')) return 'TikTok';
            return 'Otros';
        };

        const channels = ['WhatsApp', 'Facebook', 'Instagram', 'TikTok', 'Otros'];
        const channelCounts = {
            WhatsApp: { today: 0, week: 0, month: 0 },
            Facebook: { today: 0, week: 0, month: 0 },
            Instagram: { today: 0, week: 0, month: 0 },
            TikTok: { today: 0, week: 0, month: 0 },
            Otros: { today: 0, week: 0, month: 0 }
        };

        let totalToday = todayEvents.length;
        let totalWeek = weekEvents.length;
        let totalMonth = monthEvents.length;

        todayEvents.forEach(e => {
            const ch = normalizeChannel(e.medio);
            if (channelCounts[ch]) channelCounts[ch].today++;
        });
        weekEvents.forEach(e => {
            const ch = normalizeChannel(e.medio);
            if (channelCounts[ch]) channelCounts[ch].week++;
        });
        monthEvents.forEach(e => {
            const ch = normalizeChannel(e.medio);
            if (channelCounts[ch]) channelCounts[ch].month++;
        });

        if (statsMediosTbody) {
            statsMediosTbody.innerHTML = channels.map(ch => {
                const todayVal = channelCounts[ch].today;
                const weekVal = channelCounts[ch].week;
                const monthVal = channelCounts[ch].month;

                const todayPct = totalToday > 0 ? ((todayVal / totalToday) * 100).toFixed(0) : 0;
                const weekPct = totalWeek > 0 ? ((weekVal / totalWeek) * 100).toFixed(0) : 0;
                const monthPct = totalMonth > 0 ? ((monthVal / totalMonth) * 100).toFixed(0) : 0;

                let color = 'var(--text-primary)';
                if (ch === 'WhatsApp') color = '#25d366';
                else if (ch === 'Facebook') color = '#1877f2';
                else if (ch === 'Instagram') color = '#e1306c';
                else if (ch === 'TikTok') color = '#00f2fe';

                return `
                    <tr style="border-bottom: 1px solid var(--border-color);">
                        <td style="padding: 10px 4px;">
                            <strong style="color: ${color};">${ch}</strong><br>
                            <div style="width: 80px; background: rgba(255,255,255,0.05); height: 4px; border-radius: 2px; margin-top: 4px; overflow: hidden;">
                                <div style="width: ${monthPct}%; background: ${color}; height: 100%; border-radius: 2px;"></div>
                            </div>
                        </td>
                        <td style="padding: 10px 4px; text-align: right;">
                            <strong>${todayVal}</strong> <span style="font-size: 11px; color: var(--text-muted);">(${todayPct}%)</span>
                        </td>
                        <td style="padding: 10px 4px; text-align: right;">
                            <strong>${weekVal}</strong> <span style="font-size: 11px; color: var(--text-muted);">(${weekPct}%)</span>
                        </td>
                        <td style="padding: 10px 4px; text-align: right;">
                            <strong>${monthVal}</strong> <span style="font-size: 11px; color: var(--text-muted);">(${monthPct}%)</span>
                        </td>
                    </tr>
                `;
            }).join('');
        }

        // 2. Extra equipment count
        const eqCounts = {
            Pelotas: { today: 0, week: 0, month: 0 },
            Chalecos: { today: 0, week: 0, month: 0 }
        };

        todayEvents.forEach(e => {
            if (e.pelota === true || e.pelota === 'true') eqCounts.Pelotas.today++;
            if (e.chaleco === true || e.chaleco === 'true') eqCounts.Chalecos.today++;
        });
        weekEvents.forEach(e => {
            if (e.pelota === true || e.pelota === 'true') eqCounts.Pelotas.week++;
            if (e.chaleco === true || e.chaleco === 'true') eqCounts.Chalecos.week++;
        });
        monthEvents.forEach(e => {
            if (e.pelota === true || e.pelota === 'true') eqCounts.Pelotas.month++;
            if (e.chaleco === true || e.chaleco === 'true') eqCounts.Chalecos.month++;
        });

        if (statsEquipamientoTbody) {
            statsEquipamientoTbody.innerHTML = `
                <tr style="border-bottom: 1px solid var(--border-color);">
                    <td style="padding: 10px 4px;"><strong style="color: #60a5fa;">⚽ Pelotas</strong></td>
                    <td style="padding: 10px 4px; text-align: right;"><strong>${eqCounts.Pelotas.today}</strong></td>
                    <td style="padding: 10px 4px; text-align: right;"><strong>${eqCounts.Pelotas.week}</strong></td>
                    <td style="padding: 10px 4px; text-align: right;"><strong>${eqCounts.Pelotas.month}</strong></td>
                </tr>
                <tr style="border-bottom: 1px solid var(--border-color);">
                    <td style="padding: 10px 4px;"><strong style="color: #fca5a5;">🎽 Chalecos</strong></td>
                    <td style="padding: 10px 4px; text-align: right;"><strong>${eqCounts.Chalecos.today}</strong></td>
                    <td style="padding: 10px 4px; text-align: right;"><strong>${eqCounts.Chalecos.week}</strong></td>
                    <td style="padding: 10px 4px; text-align: right;"><strong>${eqCounts.Chalecos.month}</strong></td>
                </tr>
            `;
        }

        // 3. Peak hours
        if (statsHorasPicoList) {
            const hourCounts = {};
            monthEvents.forEach(e => {
                const hhmm = formatTimeHHMM(e.start_time);
                if (hhmm) {
                    hourCounts[hhmm] = (hourCounts[hhmm] || 0) + 1;
                }
            });
            const sortedHours = Object.keys(hourCounts)
                .map(h => ({ hour: h, count: hourCounts[h] }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 3);

            if (sortedHours.length === 0) {
                statsHorasPicoList.innerHTML = `<li style="color: var(--text-muted);">No hay reservas en este mes.</li>`;
            } else {
                statsHorasPicoList.innerHTML = sortedHours.map((sh, idx) => {
                    const label = sh.count === 1 ? '1 reserva' : `${sh.count} reservas`;
                    return `
                        <li>
                            <span style="font-weight: 600; color: var(--primary);">${idx + 1}. Hora: ${sh.hour}</span> 
                            <span style="color: var(--text-secondary);"> - ${label}</span>
                        </li>
                    `;
                }).join('');
            }
        }

        // 4. VIP clients
        if (statsClientesVipList) {
            const clientCounts = {};
            monthEvents.forEach(e => {
                if (e.name && e.name.trim()) {
                    const key = e.name.trim().toLowerCase();
                    if (!clientCounts[key]) {
                        clientCounts[key] = { name: e.name.trim(), dni: e.dni ? e.dni.trim() : '', count: 0 };
                    }
                    clientCounts[key].count++;
                }
            });
            const sortedClients = Object.values(clientCounts)
                .sort((a, b) => b.count - a.count)
                .slice(0, 5);

            if (sortedClients.length === 0) {
                statsClientesVipList.innerHTML = `<li style="color: var(--text-muted);">No hay reservas en este mes.</li>`;
            } else {
                statsClientesVipList.innerHTML = sortedClients.map((sc, idx) => {
                    const label = sc.count === 1 ? '1 reserva' : `${sc.count} reservas`;
                    const dniText = sc.dni ? ` (DNI: ${sc.dni})` : '';
                    return `
                        <li>
                            <span style="font-weight: 600; color: var(--primary);">${idx + 1}. ${escapeHTML(sc.name)}</span>
                            <span style="font-size: 11px; color: var(--text-muted);">${dniText}</span>
                            <span style="color: var(--text-secondary);"> - ${label}</span>
                        </li>
                    `;
                }).join('');
            }
        }

        // 5. Weekday Demands (Mes)
        if (statsDiasDemandaContainer) {
            const daysOfWeekNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
            const weekdayStats = daysOfWeekNames.map(name => ({ name, count: 0, income: 0 }));
            monthEvents.forEach(e => {
                const eventBusDate = getBusinessDate(e.date, e.start_time);
                const dateObj = new Date(eventBusDate + 'T12:00:00');
                const dayIndex = dateObj.getDay();
                const inc = getEventIncome(e);
                weekdayStats[dayIndex].count++;
                weekdayStats[dayIndex].income += inc.total;
            });
            weekdayStats.sort((a, b) => b.count - a.count || b.income - a.income);

            const maxCount = Math.max(...weekdayStats.map(d => d.count), 1);
            statsDiasDemandaContainer.innerHTML = weekdayStats.map((d, idx) => {
                if (d.count === 0) return '';
                const pct = ((d.count / maxCount) * 100).toFixed(0);
                const countLabel = d.count === 1 ? '1 reserva' : `${d.count} reservas`;
                return `
                    <div style="margin-bottom: 6px;">
                        <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 2px;">
                            <span style="font-weight: 600; color: var(--text-primary);">${idx + 1}. ${d.name}</span>
                            <span style="color: var(--text-secondary); font-size: 11px;">${countLabel} - S/. ${d.income.toFixed(0)}</span>
                        </div>
                        <div style="width: 100%; background: rgba(255,255,255,0.05); height: 6px; border-radius: 3px; overflow: hidden;">
                            <div style="width: ${pct}%; background: linear-gradient(90deg, var(--primary), #3b82f6); height: 100%; border-radius: 3px;"></div>
                        </div>
                    </div>
                `;
            }).join('') || '<div style="color: var(--text-muted); font-size: 13px;">No hay reservas este mes.</div>';
        }

        // 6. Consolidated Clients List (DNI / Name unifications)
        const clientsMap = new Map();
        allEvents.forEach(e => {
            const name = (e.name || '').trim();
            const dni = (e.dni || '').trim();
            if (!name) return;

            const hasDni = dni && dni.length >= 6 && !/^0+$/.test(dni);
            const key = hasDni ? `dni:${dni}` : `name:${name.toLowerCase()}`;

            if (!clientsMap.has(key)) {
                clientsMap.set(key, {
                    key,
                    name: name,
                    namesUsed: new Set([name]),
                    dni: hasDni ? dni : '',
                    totalBookings: 0,
                    totalSpend: 0,
                    courts: {},
                    bookings: []
                });
            }

            const client = clientsMap.get(key);
            client.namesUsed.add(name);
            if (name.length > client.name.length) {
                client.name = name;
            }
            if (!client.dni && hasDni) {
                client.dni = dni;
            }

            const inc = getEventIncome(e);
            client.totalBookings++;
            client.totalSpend += inc.total;
            client.courts[e.court] = (client.courts[e.court] || 0) + 1;

            client.bookings.push({
                date: e.date,
                start_time: e.start_time,
                end_time: e.end_time,
                court: e.court,
                income: inc.total,
                tipo_pago: e.tipo_pago || 'Efectivo'
            });
        });

        cachedClientsData = Array.from(clientsMap.values()).map(c => {
            c.bookings.sort((a, b) => {
                if (b.date !== a.date) return b.date.localeCompare(a.date);
                return b.start_time.localeCompare(a.start_time);
            });
            return c;
        });

        cachedClientsData.sort((a, b) => b.totalBookings - a.totalBookings || b.totalSpend - a.totalSpend);
        
        renderClientsTable(currentClientsFilter);

        if (window.lucide) {
            lucide.createIcons();
        }
    }
}

function renderClientsTable(filterText = '') {
    const tbody = document.getElementById('statsClientesTableBody');
    if (!tbody) return;

    const filtered = cachedClientsData.filter(c => {
        return c.name.toLowerCase().includes(filterText) || c.dni.includes(filterText);
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; padding: 24px; color: var(--text-muted);">
                    No se encontraron clientes que coincidan con la búsqueda.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = filtered.map((c, idx) => {
        const detailId = `client-detail-${idx}`;
        
        // Build court preferences text
        const courtPrefs = Object.entries(c.courts)
            .map(([court, count]) => `<li><strong>${court}:</strong> ${count} ${count === 1 ? 'alquiler' : 'alquileres'}</li>`)
            .join('');

        // Build history rows (limit to last 10 bookings)
        const historyRows = c.bookings.slice(0, 10).map(b => {
            const dateParts = b.date.split('-');
            const formattedDate = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
            const timeRange = `${formatTimeHHMM(b.start_time)} - ${formatTimeHHMM(b.end_time)}`;
            return `
                <tr style="border-bottom: 1px dashed rgba(255,255,255,0.05);">
                    <td style="padding: 6px 8px; text-align: left;">${formattedDate}</td>
                    <td style="padding: 6px 8px; text-align: left;">${timeRange}</td>
                    <td style="padding: 6px 8px; text-align: left; color: var(--text-primary); font-weight: 500;">${b.court}</td>
                    <td style="padding: 6px 8px; text-align: right; color: #34d399; font-weight: 600;">S/. ${b.income.toFixed(2)}</td>
                    <td style="padding: 6px 8px; text-align: center; color: var(--text-muted); font-size: 10px;">${b.tipo_pago || 'Efectivo'}</td>
                </tr>
            `;
        }).join('');

        const dniDisplay = c.dni ? escapeHTML(c.dni) : '<span style="color: var(--text-muted); font-style: italic;">Sin DNI</span>';

        const nameVariationsText = c.namesUsed.size > 1
            ? `<br><span style="font-size: 11px; color: var(--text-muted); font-style: italic;">(Nombres usados: ${Array.from(c.namesUsed).map(n => escapeHTML(n)).join(', ')})</span>`
            : '';

        return `
            <tr style="border-bottom: 1px solid var(--border-color); cursor: pointer;" onclick="toggleClientDetails('${detailId}')">
                <td style="padding: 12px 16px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <i data-lucide="user" style="width: 16px; height: 16px; color: var(--primary);"></i>
                        <div>
                            <strong style="color: var(--text-primary);">${escapeHTML(c.name)}</strong>
                            ${nameVariationsText}
                        </div>
                    </div>
                </td>
                <td style="padding: 12px 16px; color: var(--text-secondary);">${dniDisplay}</td>
                <td style="padding: 12px 16px; text-align: right; font-weight: 600; color: var(--primary);">${c.totalBookings}</td>
                <td style="padding: 12px 16px; text-align: right; font-weight: 600; color: #34d399;">S/. ${c.totalSpend.toFixed(2)}</td>
                <td style="padding: 12px 16px; text-align: center;">
                    <button class="btn btn-secondary btn-sm" style="padding: 4px 8px; font-size: 11px; gap: 4px; display: inline-flex; align-items: center;">
                        <i data-lucide="history" style="width: 12px; height: 12px;"></i> Historial
                    </button>
                </td>
            </tr>
            <tr class="client-detail-row" id="${detailId}" style="display: none; background: rgba(255, 255, 255, 0.01);">
                <td colspan="5" style="padding: 16px; border-bottom: 1px solid var(--border-color);">
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; font-size: 13px;">
                        <div>
                            <h5 style="margin: 0 0 8px 0; color: var(--primary); font-size: 14px; display: flex; align-items: center; gap: 6px;">
                                <i data-lucide="layout-grid" style="width: 14px; height: 14px;"></i> Preferencia de Canchas
                            </h5>
                            <ul style="padding-left: 20px; margin: 0; line-height: 1.6; color: var(--text-secondary);">
                                ${courtPrefs}
                            </ul>
                        </div>
                        <div style="grid-column: span 2;">
                            <h5 style="margin: 0 0 8px 0; color: var(--primary); font-size: 14px; display: flex; align-items: center; gap: 6px;">
                                <i data-lucide="history" style="width: 14px; height: 14px;"></i> Historial de Alquileres (Últimas 10)
                            </h5>
                            <div style="max-height: 180px; overflow-y: auto; border: 1px solid rgba(255,255,255,0.05); border-radius: var(--radius-sm);">
                                <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                                    <thead>
                                        <tr style="border-bottom: 1px solid var(--border-color); background: rgba(255,255,255,0.02); color: var(--text-secondary);">
                                            <th style="padding: 6px 8px; text-align: left;">Fecha</th>
                                            <th style="padding: 6px 8px; text-align: left;">Horario</th>
                                            <th style="padding: 6px 8px; text-align: left;">Cancha</th>
                                            <th style="padding: 6px 8px; text-align: right;">Monto</th>
                                            <th style="padding: 6px 8px; text-align: center;">Pago</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${historyRows}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    if (window.lucide) {
        lucide.createIcons({
            attrs: {
                class: 'lucide'
            },
            nameAttr: 'data-lucide',
            nodeOrTagName: tbody
        });
    }
}

window.toggleClientDetails = function(detailId) {
    const detailRow = document.getElementById(detailId);
    if (detailRow) {
        const isVisible = detailRow.style.display === 'table-row';
        detailRow.style.display = isVisible ? 'none' : 'table-row';
    }
};



