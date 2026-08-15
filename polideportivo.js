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
let bookingModalIsAdmin = false;
let availabilityTimeFilter = 'pico';

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
const bookingStartTimeInput = {
    _changeListeners: new Set(),
    get value() {
        const h = document.getElementById('startHourSelect').value;
        const m = document.getElementById('startMinSelect').value;
        const ampm = document.getElementById('startAmpmSelect').value;
        if (!h || !m || !ampm) return "";
        let hour = parseInt(h, 10);
        if (ampm === 'pm' && hour < 12) hour += 12;
        if (ampm === 'am' && hour === 12) hour = 0;
        return `${String(hour).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    },
    set value(val) {
        if (!val) {
            document.getElementById('startHourSelect').value = "";
            document.getElementById('startMinSelect').value = "";
            document.getElementById('startAmpmSelect').value = "pm";
            return;
        }
        const parts = val.split(':');
        let h = parseInt(parts[0], 10);
        let m = parts[1];
        let ampm = h >= 12 ? 'pm' : 'am';
        let h12 = h % 12;
        if (h12 === 0) h12 = 12;
        document.getElementById('startHourSelect').value = String(h12);
        document.getElementById('startMinSelect').value = String(m).padStart(2, '0');
        document.getElementById('startAmpmSelect').value = ampm;
    },
    get disabled() {
        return document.getElementById('startHourSelect').disabled;
    },
    set disabled(val) {
        document.getElementById('startHourSelect').disabled = val;
        document.getElementById('startMinSelect').disabled = val;
        document.getElementById('startAmpmSelect').disabled = val;
    },
    addEventListener(event, callback) {
        if (event === 'change') {
            this._changeListeners.add(callback);
        } else {
            document.getElementById('startHourSelect').addEventListener(event, callback);
            document.getElementById('startMinSelect').addEventListener(event, callback);
            document.getElementById('startAmpmSelect').addEventListener(event, callback);
        }
    },
    removeEventListener(event, callback) {
        if (event === 'change') {
            this._changeListeners.delete(callback);
        } else {
            document.getElementById('startHourSelect').removeEventListener(event, callback);
            document.getElementById('startMinSelect').removeEventListener(event, callback);
            document.getElementById('startAmpmSelect').removeEventListener(event, callback);
        }
    },
    dispatchEvent(event) {
        if (event.type === 'change') {
            this._changeListeners.forEach(cb => cb(event));
        }
    }
};

const bookingEndTimeInput = {
    _changeListeners: new Set(),
    get value() {
        const h = document.getElementById('endHourSelect').value;
        const m = document.getElementById('endMinSelect').value;
        const ampm = document.getElementById('endAmpmSelect').value;
        if (!h || !m || !ampm) return "";
        let hour = parseInt(h, 10);
        if (ampm === 'pm' && hour < 12) hour += 12;
        if (ampm === 'am' && hour === 12) hour = 0;
        return `${String(hour).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    },
    set value(val) {
        if (!val) {
            document.getElementById('endHourSelect').value = "";
            document.getElementById('endMinSelect').value = "";
            document.getElementById('endAmpmSelect').value = "pm";
            return;
        }
        const parts = val.split(':');
        let h = parseInt(parts[0], 10);
        let m = parts[1];
        let ampm = h >= 12 ? 'pm' : 'am';
        let h12 = h % 12;
        if (h12 === 0) h12 = 12;
        document.getElementById('endHourSelect').value = String(h12);
        document.getElementById('endMinSelect').value = String(m).padStart(2, '0');
        document.getElementById('endAmpmSelect').value = ampm;
    },
    get disabled() {
        return document.getElementById('endHourSelect').disabled;
    },
    set disabled(val) {
        document.getElementById('endHourSelect').disabled = val;
        document.getElementById('endMinSelect').disabled = val;
        document.getElementById('endAmpmSelect').disabled = val;
    },
    addEventListener(event, callback) {
        if (event === 'change') {
            this._changeListeners.add(callback);
        } else {
            document.getElementById('endHourSelect').addEventListener(event, callback);
            document.getElementById('endMinSelect').addEventListener(event, callback);
            document.getElementById('endAmpmSelect').addEventListener(event, callback);
        }
    },
    removeEventListener(event, callback) {
        if (event === 'change') {
            this._changeListeners.delete(callback);
        } else {
            document.getElementById('endHourSelect').removeEventListener(event, callback);
            document.getElementById('endMinSelect').removeEventListener(event, callback);
            document.getElementById('endAmpmSelect').removeEventListener(event, callback);
        }
    },
    dispatchEvent(event) {
        if (event.type === 'change') {
            this._changeListeners.forEach(cb => cb(event));
        }
    }
};
const bookingNotesInput = document.getElementById('bookingNotes');
const bookingPelotaInput = document.getElementById('bookingPelota');
const bookingChalecoInput = document.getElementById('bookingChaleco');
const bookingError = document.getElementById('bookingError');
const bookingIsBlockInput = document.getElementById('bookingIsBlock');
const bookingIsAllDayInput = document.getElementById('bookingIsAllDay');

const btnNewReservation = document.getElementById('btnNewReservation');
const btnCloseBooking = document.getElementById('btnCloseBooking');
const btnDeleteBooking = document.getElementById('btnDeleteBooking');
const btnCopyReservation = document.getElementById('btnCopyReservation');
const bookingDniInput = document.getElementById('bookingDni');
const bookingSourceInput = document.getElementById('bookingSource');
const bookingPaymentTypeInput = document.getElementById('bookingPaymentType');
const customSourceGroup = document.getElementById('customSourceGroup');
const bookingSourceCustomInput = document.getElementById('bookingSourceCustom');
const splitPaymentRow = document.getElementById('splitPaymentRow');
const splitEfectivoInput = document.getElementById('splitEfectivo');
const splitYapeInput = document.getElementById('splitYape');
const bookingTotalContainer = document.getElementById('bookingTotalContainer');
const bookingTotalValue = document.getElementById('bookingTotalValue');
const bookingPriceInput = document.getElementById('bookingPriceInput');
const btnResetPrice = document.getElementById('btnResetPrice');
const bookingTotalNote = document.getElementById('bookingTotalNote');

let isPriceUserModified = false;
let currentAutoCalculatedTotal = 0;

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

    // 3.5 Populate time select dropdowns
    populateTimeSelects();

    // 4. Initialize Calendar
    initCalendar();

    // 5. Initialize Sidebar Collapsed State
    initSidebarState();

    // 6. Set up Event Listeners
    setupEventListeners();

    // 6. Update stats initially
    updateStats();

    // 7. Load activity history
    fetchAndRenderHistory();

    // 8. Initialize Court Availability Quick Checker
    initCourtAvailabilityChecker();

    // 9. Initialize Calendar Hours View Toggle (Tarde/Noche vs Todo el día)
    initCalendarHoursToggle();
});

let isFullDayCalendar = false;

function initCalendarHoursToggle() {
    const btn = document.getElementById('btnToggleCalendarHours');
    const textEl = document.getElementById('textToggleHours');
    const iconEl = document.getElementById('iconToggleHours');
    if (!btn) return;

    btn.addEventListener('click', () => {
        isFullDayCalendar = !isFullDayCalendar;
        const newMinTime = isFullDayCalendar ? '06:00:00' : '14:00:00';
        if (calendar) {
            calendar.setOption('slotMinTime', newMinTime);
        }

        if (isFullDayCalendar) {
            btn.classList.add('active');
            if (textEl) textEl.textContent = 'Ver solo tarde y noche (desde las 2:00 PM)';
            if (iconEl) iconEl.setAttribute('data-lucide', 'moon');
        } else {
            btn.classList.remove('active');
            if (textEl) textEl.textContent = 'Ver todo el día (desde las 6:00 AM)';
            if (iconEl) iconEl.setAttribute('data-lucide', 'sun-dim');
        }
        if (window.lucide) lucide.createIcons();
    });
}

// Initialize FullCalendar
function initCalendar() {
    const calendarEl = document.getElementById('calendar');

    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: window.innerWidth < 768 ? 'timeGridDay' : 'timeGridWeek',
        locale: 'es',
        firstDay: 1,
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
        slotMinTime: '14:00:00',
        slotMaxTime: '25:00:00',
        allDaySlot: false,
        slotDuration: '00:30:00',
        snapDuration: '00:30:00',
        slotLabelInterval: '01:00',
        slotLabelContent: function (arg) {
            const date = arg.date;
            let hours = date.getHours();
            const minutes = String(date.getMinutes()).padStart(2, '0');
            const ampm = hours >= 12 ? 'pm' : 'am';
            hours = hours % 12;
            hours = hours ? hours : 12;
            return `${hours}:${minutes} ${ampm}`;
        },
        eventTimeFormat: {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
            meridiem: 'short'
        },
        expandRows: true,
        stickyHeaderDates: true,
        selectable: true,
        selectMirror: true,
        editable: false,
        height: 'auto',
        nowIndicator: true,
        datesSet: function (info) {
            updateDailySummary();
            const currentCalendar = info.view.calendar;
            if (currentCalendar) {
                const currentDate = currentCalendar.getDate();
                const year = currentDate.getFullYear();
                const month = String(currentDate.getMonth() + 1).padStart(2, '0');
                const day = String(currentDate.getDate()).padStart(2, '0');
                const dateStr = `${year}-${month}-${day}`;
                highlightSelectedDay(dateStr);

                // Override title format in timeGridDay view to prevent showing a range
                if (info.view.type === 'timeGridDay') {
                    const titleEl = document.querySelector('.fc-toolbar-title');
                    if (titleEl) {
                        const options = { day: 'numeric', month: 'long', year: 'numeric' };
                        let formattedDate = currentDate.toLocaleDateString('es-ES', options);
                        if (titleEl.firstChild) {
                            titleEl.firstChild.nodeValue = formattedDate;
                        } else {
                            titleEl.textContent = formattedDate;
                        }
                    }
                }
            }
        },

        // Fetch Events Dynamically
        events: function (fetchInfo, successCallback, failureCallback) {
            fetchBookings().then(bookings => {
                allEvents = bookings;
                updateStats();
                updateDailySummary();
                updateCourtAvailabilityChecker();

                // Apply UI filters
                const filtered = filterEvents(bookings);

                // Convert to FullCalendar event format
                const fcEvents = filtered.map(b => {
                    let courtClass = 'event-cancha-grande';
                    const cStr = String(b.court || '');
                    if (cStr.includes('Pequeña')) {
                        courtClass = 'event-cancha-pequena';
                    } else if (cStr.includes('Vóley')) {
                        courtClass = 'event-cancha-voley';
                    }
                    const { start, end } = getStartAndEndDates(b.date, b.start_time, b.end_time);
                    const isBlock = b.sport === 'Bloqueo';
                    return {
                        id: b.id,
                        title: isBlock ? b.name : `${b.name} (${b.court})${b.pelota === true || b.pelota === 'true' ? (b.sport === 'Vóley' ? ' 🏐' : ' ⚽') : ''}${b.chaleco === true || b.chaleco === 'true' ? ' 🎽' : ''}`,
                        start: formatISOString(start),
                        end: formatISOString(end),
                        className: isBlock ? 'event-sport-bloqueo' : `${courtClass} ${b.sport === 'Fútbol' ? 'event-sport-futbol' : 'event-sport-voley'}`,
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
    // Mobile Sidebar Drawer Actions & Desktop Toggle
    if (btnToggleSidebar) {
        btnToggleSidebar.addEventListener('click', toggleSidebarHandler);
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
    const historySearchInput = document.getElementById('historySearchInput');
    if (btnOpenHistory) {
        btnOpenHistory.addEventListener('click', () => {
            closeSidebarDrawer();
            if (historySearchInput) historySearchInput.value = '';
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
    if (historySearchInput) {
        historySearchInput.addEventListener('input', fetchAndRenderHistory);
    }

    // Auto-adjust end time when start time changes to be at least 1 hour later
    if (bookingStartTimeInput && bookingEndTimeInput) {
        // Trigger custom wrapper change event when any inner select changes
        const triggerStartChange = (e) => {
            bookingStartTimeInput._changeListeners.forEach(cb => cb({ target: bookingStartTimeInput, originalEvent: e }));
        };
        const triggerEndChange = (e) => {
            bookingEndTimeInput._changeListeners.forEach(cb => cb({ target: bookingEndTimeInput, originalEvent: e }));
        };

        const startHourSelect = document.getElementById('startHourSelect');
        const startMinSelect = document.getElementById('startMinSelect');
        const startAmpmSelect = document.getElementById('startAmpmSelect');
        const endHourSelect = document.getElementById('endHourSelect');
        const endMinSelect = document.getElementById('endMinSelect');
        const endAmpmSelect = document.getElementById('endAmpmSelect');

        if (startHourSelect && startMinSelect && startAmpmSelect) {
            startHourSelect.addEventListener('change', triggerStartChange);
            startMinSelect.addEventListener('change', triggerStartChange);
            startAmpmSelect.addEventListener('change', triggerStartChange);
        }
        if (endHourSelect && endMinSelect && endAmpmSelect) {
            endHourSelect.addEventListener('change', triggerEndChange);
            endMinSelect.addEventListener('change', triggerEndChange);
            endAmpmSelect.addEventListener('change', triggerEndChange);
        }

        // Automated sync logic: changing any start field automatically adjusts the end time to be 1 hour later
        const syncEndTime = () => {
            const startHourVal = startHourSelect.value;
            const startMinVal = startMinSelect.value;
            const startAmpmVal = startAmpmSelect.value;

            if (!startHourVal || !startMinVal || !startAmpmVal) return;

            let hour = parseInt(startHourVal, 10);
            const minute = parseInt(startMinVal, 10);
            const ampm = startAmpmVal;

            if (ampm === 'pm' && hour < 12) hour += 12;
            if (ampm === 'am' && hour === 12) hour = 0;

            const startMins = hour * 60 + minute;
            const endMins = (startMins + 60) % 1440;

            let endHour24 = Math.floor(endMins / 60);
            let endMin = endMins % 60;
            let endAmpm = endHour24 >= 12 ? 'pm' : 'am';
            let endHour12 = endHour24 % 12;
            if (endHour12 === 0) endHour12 = 12;

            endHourSelect.value = String(endHour12);
            endMinSelect.value = String(endMin).padStart(2, '0');
            endAmpmSelect.value = endAmpm;
            triggerEndChange();
        };

        if (startHourSelect && startMinSelect && startAmpmSelect) {
            startHourSelect.addEventListener('change', syncEndTime);
            startMinSelect.addEventListener('change', syncEndTime);
            startAmpmSelect.addEventListener('change', syncEndTime);
        }

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
                const newEndMins = startMins + 60;
                let endHour = Math.floor(newEndMins / 60) % 24;
                let endMin = newEndMins % 60;

                // If it falls between 01:01 and 05:59, cap at 01:00 (1:00 am next day)
                const endTotalMins = endHour * 60 + endMin;
                if (endTotalMins > 60 && endTotalMins < 360) {
                    endHour = 1;
                    endMin = 0;
                }

                const formattedHour = String(endHour).padStart(2, '0');
                const formattedMin = String(endMin).padStart(2, '0');
                bookingEndTimeInput.value = `${formattedHour}:${formattedMin}`;
            }
        });
    }

    // Toggle buttons event listeners
    setupToggleListeners('pelota');
    setupToggleListeners('chaleco');

    if (bookingIsBlockInput) {
        bookingIsBlockInput.addEventListener('click', (e) => {
            const isChecking = bookingIsBlockInput.checked;
            const action = isChecking ? "bloquear la cancha" : "desbloquear la cancha";
            if (!requestAdminPassword(action)) {
                e.preventDefault();
                return;
            }
            toggleBlockFields(isChecking);
        });
    }

    if (bookingIsAllDayInput) {
        bookingIsAllDayInput.addEventListener('change', () => {
            toggleAllDayFields(bookingIsAllDayInput.checked);
        });
    }

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
    const btnExportStatsExcel = document.getElementById('btnExportStatsExcel');
    if (btnExportStatsExcel) {
        btnExportStatsExcel.addEventListener('click', exportAllDataToExcel);
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

    // Tabs in Daily Summary
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

    // Toggle hours in Availability Tab
    const btnHoursPico = document.getElementById('btnHoursPico');
    const btnHoursAll = document.getElementById('btnHoursAll');

    if (btnHoursPico && btnHoursAll) {
        btnHoursPico.addEventListener('click', () => {
            btnHoursPico.classList.add('active');
            btnHoursAll.classList.remove('active');
            availabilityTimeFilter = 'pico';
            updateAvailabilityGrid();
        });

        btnHoursAll.addEventListener('click', () => {
            btnHoursAll.classList.add('active');
            btnHoursPico.classList.remove('active');
            availabilityTimeFilter = 'all';
            updateAvailabilityGrid();
        });
    }

    // Make date input show its picker when clicking on the left icon (SVG)
    document.querySelectorAll('.input-wrapper').forEach(wrapper => {
        const input = wrapper.querySelector('input[type="date"]');
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
    document.addEventListener('click', function (e) {
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

    // Recalculate price when modal fields change
    if (bookingCourtInput) {
        bookingCourtInput.addEventListener('change', updateModalCalculatedTotal);
    }
    if (bookingDateInput) {
        bookingDateInput.addEventListener('change', updateModalCalculatedTotal);
    }
    if (bookingStartTimeInput) {
        bookingStartTimeInput.addEventListener('change', updateModalCalculatedTotal);
    }
    if (bookingEndTimeInput) {
        bookingEndTimeInput.addEventListener('change', updateModalCalculatedTotal);
    }

    // Toggle split payment inputs view
    if (bookingPaymentTypeInput) {
        bookingPaymentTypeInput.addEventListener('change', () => {
            if (bookingPaymentTypeInput.value === 'Dividido') {
                if (splitPaymentRow) splitPaymentRow.classList.remove('hidden');
                const total = updateModalCalculatedTotal();
                if (splitEfectivoInput && splitYapeInput) {
                    splitEfectivoInput.value = total.toFixed(2);
                    splitYapeInput.value = '0.00';
                }
            } else {
                if (splitPaymentRow) splitPaymentRow.classList.add('hidden');
            }
        });
    }

    // Auto-calculate values for split payment
    if (splitEfectivoInput && splitYapeInput) {
        splitEfectivoInput.addEventListener('input', () => {
            const total = updateModalCalculatedTotal();
            const cashVal = parseFloat(splitEfectivoInput.value) || 0;
            const yapeVal = Math.max(0, total - cashVal);
            splitYapeInput.value = yapeVal.toFixed(2);
        });

        splitYapeInput.addEventListener('input', () => {
            const total = updateModalCalculatedTotal();
            const yapeVal = parseFloat(splitYapeInput.value) || 0;
            const cashVal = Math.max(0, total - yapeVal);
            splitEfectivoInput.value = cashVal.toFixed(2);
        });
    }

    if (bookingDniInput) {
        bookingDniInput.addEventListener('input', function () {
            this.value = this.value.replace(/[^0-9]/g, '');
        });
    }
}

function toggleBlockFields(isBlock) {
    const groupDni = document.getElementById('groupDni');
    const groupSport = document.getElementById('groupSport');
    const rowEquipamiento = document.getElementById('rowEquipamiento');
    const rowMedioPago = document.getElementById('rowMedioPago');
    const labelName = document.querySelector('label[for="bookingName"]');
    const groupAllDay = document.getElementById('groupAllDay');

    if (isBlock) {
        if (groupDni) groupDni.style.display = 'none';
        if (groupSport) groupSport.style.display = 'none';
        if (rowEquipamiento) rowEquipamiento.style.display = 'none';
        if (rowMedioPago) rowMedioPago.style.display = 'none';
        if (labelName) labelName.innerHTML = 'Motivo del Bloqueo *';
        if (bookingNameInput) {
            bookingNameInput.placeholder = 'Ej. Mantenimiento, Evento privado...';
        }
        if (bookingSportInput) {
            bookingSportInput.value = 'Bloqueo';
            bookingSportInput.disabled = true;
        }

        // Toggle required attributes to prevent hidden browser validation failure
        if (bookingDniInput) bookingDniInput.required = false;
        if (bookingSportInput) bookingSportInput.required = false;
        if (bookingSourceInput) bookingSourceInput.required = false;
        if (bookingPaymentTypeInput) bookingPaymentTypeInput.required = false;
        if (bookingSourceCustomInput) bookingSourceCustomInput.required = false;

        // Add "Todas las Canchas" option if not already present, and set it as selected
        let todasOption = bookingCourtInput.querySelector('option[value="Todas"]');
        if (!todasOption) {
            todasOption = document.createElement('option');
            todasOption.value = 'Todas';
            todasOption.textContent = 'Todas las Canchas';
            bookingCourtInput.insertBefore(todasOption, bookingCourtInput.firstChild);
        }
        bookingCourtInput.value = 'Todas';

        if (groupAllDay) groupAllDay.style.display = 'flex';

    } else {
        if (groupDni) groupDni.style.display = '';
        if (groupSport) groupSport.style.display = '';
        if (rowEquipamiento) rowEquipamiento.style.display = '';
        if (rowMedioPago) rowMedioPago.style.display = '';
        if (labelName) labelName.innerHTML = 'Nombre del Cliente *';
        if (bookingNameInput) {
            bookingNameInput.placeholder = 'Nombre del cliente';
        }

        if (bookingSportInput) {
            bookingSportInput.disabled = false;
        }
        handleCourtSportDependency();

        // Restore required attributes for normal bookings (DNI is optional now)
        if (bookingDniInput) bookingDniInput.required = false;
        if (bookingSportInput) bookingSportInput.required = true;
        if (bookingSourceInput) bookingSourceInput.required = true;
        if (bookingPaymentTypeInput) bookingPaymentTypeInput.required = true;

        // Remove "Todas las Canchas" option if present, and fallback to "Cancha Grande"
        const todasOption = bookingCourtInput.querySelector('option[value="Todas"]');
        if (todasOption) {
            todasOption.remove();
        }
        if (bookingCourtInput.value === 'Todas') {
            bookingCourtInput.value = 'Cancha Grande';
        }

        if (groupAllDay) groupAllDay.style.display = 'none';
        if (bookingIsAllDayInput) {
            bookingIsAllDayInput.checked = false;
        }
        toggleAllDayFields(false);
    }
    updateModalCalculatedTotal();
}

function toggleAllDayFields(isAllDay) {
    if (isAllDay) {
        bookingStartTimeInput.value = "06:00";
        bookingEndTimeInput.value = "23:00";
        bookingStartTimeInput.disabled = true;
        bookingEndTimeInput.disabled = true;
    } else {
        bookingStartTimeInput.disabled = false;
        bookingEndTimeInput.disabled = false;
    }
}

function requestAdminPassword(actionDescription) {
    if (bookingModalIsAdmin) return true;
    const pwd = prompt(`Ingresa la contraseña de administrador para ${actionDescription}:`);
    if (pwd === 'Reservasupabase') {
        bookingModalIsAdmin = true;
        return true;
    }
    alert("Contraseña incorrecta. No tienes permiso para esta acción.");
    return false;
}

// Automatic lock/fill of sport based on court choice
function handleCourtSportDependency() {
    const isBlock = bookingIsBlockInput ? bookingIsBlockInput.checked : false;
    if (isBlock) {
        bookingSportInput.value = 'Bloqueo';
        bookingSportInput.disabled = true;
        return;
    }
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
            updateModalCalculatedTotal();
        });
    });
}

function populateTimeSelects() {
    // Statically populated via datalists in polideportivo.html
}

// Helper to transform any name to Title Case (Initial Uppercase, rest lowercase)
function formatAsesorName(name) {
    if (!name) return '';
    return name.trim().split(/\s+/).map(word => {
        if (!word) return '';
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }).filter(word => word.length > 0).join(' ');
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
        const formattedCurrentUser = formatAsesorName(currentUser);
        if (formattedCurrentUser) advisors.add(formattedCurrentUser);
    }

    // Add unique notes (advisor) from all events
    allEvents.forEach(e => {
        if (e.notes && e.notes.trim() && e.notes !== 'Otro...') {
            const formatted = formatAsesorName(e.notes);
            if (formatted) advisors.add(formatted);
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

    const formattedSelectedValue = formatAsesorName(selectedValue);

    if (formattedSelectedValue && !advisors.has(formattedSelectedValue) && formattedSelectedValue !== 'Otro...') {
        // If the saved value is not in our set, it means it's a custom value
        const optionCustom = document.createElement('option');
        optionCustom.value = formattedSelectedValue;
        optionCustom.textContent = formattedSelectedValue;
        select.insertBefore(optionCustom, optionOtro);
        select.value = formattedSelectedValue;
        customGroup.classList.add('hidden');
        customInput.required = false;
    } else if (formattedSelectedValue) {
        select.value = formattedSelectedValue;
        if (formattedSelectedValue === 'Otro...') {
            customGroup.classList.remove('hidden');
            customInput.required = true;
        } else {
            customGroup.classList.add('hidden');
            customInput.required = false;
        }
    } else {
        // Default to current user
        const formattedCurrentUser = formatAsesorName(currentUser);
        if (formattedCurrentUser && advisors.has(formattedCurrentUser)) {
            select.value = formattedCurrentUser;
        }
        customGroup.classList.add('hidden');
        customInput.required = false;
    }
}

// Open Booking Modal (Null = New, Object = Edit)
function openBookingModal(booking = null, defaults = null) {
    bookingModalIsAdmin = false;
    if (booking === null && modalBooking.classList.contains('active')) {
        return; // Prevent duplicate triggers if already open for new booking
    }
    formBooking.reset();
    bookingError.style.display = 'none';

    const btnSave = document.getElementById('btnSaveBooking');
    if (btnSave) {
        btnSave.disabled = false;
        btnSave.textContent = 'Guardar Reserva';
    }

    // Close mobile drawer if open
    closeSidebarDrawer();

    if (booking) {
        // Edit Mode
        modalTitle.textContent = 'Editar Reserva';
        bookingIdInput.value = booking.id;

        const isBlock = booking.sport === 'Bloqueo';
        if (bookingIsBlockInput) {
            bookingIsBlockInput.checked = isBlock;
        }
        toggleBlockFields(isBlock);

        let cleanName = booking.name;
        if (isBlock) {
            if (cleanName.startsWith('🔒 Bloqueo: ')) {
                cleanName = cleanName.replace('🔒 Bloqueo: ', '');
            } else if (cleanName.startsWith('🔒 Bloqueo:')) {
                cleanName = cleanName.replace('🔒 Bloqueo:', '');
            }
        }
        bookingNameInput.value = cleanName;
        if (bookingDniInput) bookingDniInput.value = isBlock ? '' : (booking.dni || '');
        bookingCourtInput.value = booking.court;
        bookingSportInput.value = isBlock ? 'Fútbol' : booking.sport;
        bookingDateInput.value = booking.date;
        bookingStartTimeInput.value = booking.start_time ? booking.start_time.substring(0, 5) : "";
        bookingEndTimeInput.value = booking.end_time ? booking.end_time.substring(0, 5) : "";

        // Check if it is an all-day block ("06:00" to "23:00")
        const isAllDay = isBlock &&
            (booking.start_time.startsWith("06:00") || booking.start_time === "06:00:00") &&
            (booking.end_time.startsWith("23:00") || booking.end_time === "23:00:00");
        if (bookingIsAllDayInput) {
            bookingIsAllDayInput.checked = isAllDay;
        }
        toggleAllDayFields(isAllDay);

        // Populate and select correct advisor
        populateAsesoresDropdown(booking.notes || '');

        // Set pelota and chaleco state
        const pelotaVal = booking.pelota === true || booking.pelota === 'true';
        const chalecoVal = booking.chaleco === true || booking.chaleco === 'true';
        setToggleValue('pelota', pelotaVal);
        setToggleValue('chaleco', chalecoVal);

        btnDeleteBooking.classList.remove('hidden');

        // Populate and select correct Medio
        if (bookingSourceInput) {
            const savedMedio = booking.medio || 'Cliente frecuente';
            const standardMedios = ['Facebook', 'TikTok', 'Instagram', 'Msg masivo', 'Cliente frecuente', 'Recomendación'];
            if (standardMedios.includes(savedMedio) && !isBlock) {
                bookingSourceInput.value = savedMedio;
                if (customSourceGroup) customSourceGroup.classList.add('hidden');
                if (bookingSourceCustomInput) bookingSourceCustomInput.required = false;
            } else {
                if (isBlock) {
                    bookingSourceInput.value = 'Cliente frecuente';
                    if (customSourceGroup) customSourceGroup.classList.add('hidden');
                    if (bookingSourceCustomInput) bookingSourceCustomInput.required = false;
                } else {
                    // Fallback for legacy custom values: dynamically add them to select if they exist
                    let customOption = bookingSourceInput.querySelector(`option[value="${savedMedio}"]`);
                    if (!customOption) {
                        customOption = document.createElement('option');
                        customOption.value = savedMedio;
                        customOption.textContent = savedMedio;
                        bookingSourceInput.appendChild(customOption);
                    }
                    bookingSourceInput.value = savedMedio;
                    if (customSourceGroup) customSourceGroup.classList.add('hidden');
                    if (bookingSourceCustomInput) bookingSourceCustomInput.required = false;
                }
            }
        }

        // Populate correct Payment Type
        if (bookingPaymentTypeInput) {
            const rawPaymentType = isBlock ? 'Efectivo' : (booking.tipo_pago || 'Efectivo');
            if (rawPaymentType.startsWith('Dividido')) {
                bookingPaymentTypeInput.value = 'Dividido';
                if (splitPaymentRow) splitPaymentRow.classList.remove('hidden');
                const split = parseSplitPayment(rawPaymentType);
                if (split) {
                    if (splitEfectivoInput) splitEfectivoInput.value = split.efectivo.toFixed(2);
                    if (splitYapeInput) splitYapeInput.value = split.yape.toFixed(2);
                } else {
                    const total = updateModalCalculatedTotal();
                    if (splitEfectivoInput) splitEfectivoInput.value = (total / 2).toFixed(2);
                    if (splitYapeInput) splitYapeInput.value = (total / 2).toFixed(2);
                }
            } else {
                bookingPaymentTypeInput.value = rawPaymentType;
                if (splitPaymentRow) splitPaymentRow.classList.add('hidden');
            }
        }
    } else {
        // New Mode
        modalTitle.textContent = 'Nueva Reserva';
        bookingIdInput.value = '';
        if (bookingIsBlockInput) {
            bookingIsBlockInput.checked = false;
        }
        if (bookingIsAllDayInput) {
            bookingIsAllDayInput.checked = false;
        }
        toggleBlockFields(false);
        toggleAllDayFields(false);
        btnDeleteBooking.classList.add('hidden');

        // Reset Medio to default Cliente frecuente
        if (bookingSourceInput && customSourceGroup && bookingSourceCustomInput) {
            bookingSourceInput.value = 'Cliente frecuente';
            customSourceGroup.classList.add('hidden');
            bookingSourceCustomInput.required = false;
        }

        // Reset Payment Type to default Yape
        if (bookingPaymentTypeInput) {
            bookingPaymentTypeInput.value = 'Yape';
        }
        if (splitPaymentRow) {
            splitPaymentRow.classList.add('hidden');
        }

        // Reset toggles to default false
        setToggleValue('pelota', false);
        setToggleValue('chaleco', false);

        // Apply defaults if clicked on calendar
        if (defaults) {
            bookingDateInput.value = defaults.date;
            bookingStartTimeInput.value = defaults.start_time ? defaults.start_time.substring(0, 5) : "";

            // Ensure end time is at least 1 hour after start time
            const duration = getDurationInMinutes(defaults.start_time, defaults.end_time);
            if (duration < 60) {
                const startMins = parseTimeToMinutes(defaults.start_time);
                let endHour = Math.floor((startMins + 60) / 60) % 24;
                let endMin = (startMins + 60) % 60;

                const endTotalMins = endHour * 60 + endMin;
                if (endTotalMins > 60 && endTotalMins < 360) {
                    endHour = 1;
                    endMin = 0;
                }

                const formattedHour = String(endHour).padStart(2, '0');
                const formattedMin = String(endMin).padStart(2, '0');
                bookingEndTimeInput.value = `${formattedHour}:${formattedMin}`;
            } else {
                bookingEndTimeInput.value = defaults.end_time ? defaults.end_time.substring(0, 5) : "";
            }

            if (defaults.court) {
                bookingCourtInput.value = defaults.court;
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

    isPriceUserModified = false;
    updateModalCalculatedTotal();
    openModal(modalBooking);
    lucide.createIcons(); // Refresh modal icons
}

if (bookingPriceInput) {
    bookingPriceInput.addEventListener('input', () => {
        isPriceUserModified = true;
        updateModalCalculatedTotal();
    });
}

if (btnResetPrice) {
    btnResetPrice.addEventListener('click', () => {
        isPriceUserModified = false;
        if (bookingPriceInput) {
            bookingPriceInput.value = currentAutoCalculatedTotal.toFixed(2);
        }
        updateModalCalculatedTotal();
    });
}

function closeBookingModal() {
    closeModal(modalBooking);
}

// Mobile sidebar controls & Desktop Collapsible Sidebar
function toggleSidebarHandler() {
    if (window.innerWidth <= 1024) {
        if (sidebar) {
            const isOpen = sidebar.classList.toggle('open');
            if (sidebarBackdrop) sidebarBackdrop.classList.toggle('active', isOpen);
        }
    } else {
        const appContainer = document.querySelector('.app-container');
        if (appContainer) {
            const isCollapsed = appContainer.classList.toggle('sidebar-collapsed');
            localStorage.setItem('canchapro_sidebar_collapsed', isCollapsed ? 'true' : 'false');
        }
    }
    updateBodyScroll();
}

function openSidebarDrawer() {
    if (window.innerWidth <= 1024) {
        if (sidebar) sidebar.classList.add('open');
        if (sidebarBackdrop) sidebarBackdrop.classList.add('active');
    } else {
        const appContainer = document.querySelector('.app-container');
        if (appContainer) {
            appContainer.classList.remove('sidebar-collapsed');
            localStorage.setItem('canchapro_sidebar_collapsed', 'false');
        }
    }
    updateBodyScroll();
}

function closeSidebarDrawer() {
    if (window.innerWidth <= 1024) {
        if (sidebar) sidebar.classList.remove('open');
        if (sidebarBackdrop) sidebarBackdrop.classList.remove('active');
    } else {
        const appContainer = document.querySelector('.app-container');
        if (appContainer) {
            appContainer.classList.add('sidebar-collapsed');
            localStorage.setItem('canchapro_sidebar_collapsed', 'true');
        }
    }
    updateBodyScroll();
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
            let allData = [];
            let from = 0;
            const step = 1000;
            let hasMore = true;

            while (hasMore) {
                const { data, error } = await supabaseClient
                    .from('reservas')
                    .select('*')
                    .order('date', { ascending: true })
                    .order('start_time', { ascending: true })
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
            bookings = getLocalBookings();
        }
    } else {
        bookings = getLocalBookings();
    }

    // Filter to only include Polideportivo courts to prevent data contamination from other complexes
    const polideportivoCourts = [
        'Cancha Grande 1', 'Cancha Grande 2', 'Cancha Grande 3', 'Cancha Grande',
        'Cancha Pequeña 1', 'Cancha Pequeña 2', 'Cancha Pequeña 3', 'Cancha Pequeña 4', 'Cancha Pequeña',
        'Cancha de Vóley 1', 'Cancha de Vóley 2', 'Cancha de Vóley 3', 'Cancha de Vóley 4', 'Cancha de Vóley',
        'Todas'
    ];
    return bookings.filter(b => polideportivoCourts.some(c => b.court === c || (b.court && b.court.startsWith(c))));
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
        const c = b.court || '';
        if (c.includes('Grande') && filterCanchaGrande.checked) courtMatch = true;
        else if (c.includes('Pequeña') && filterCanchaPequena.checked) courtMatch = true;
        else if (c.includes('Vóley') && filterCanchaVoley.checked) courtMatch = true;
        else if (c === 'Todas' && (filterCanchaGrande.checked || filterCanchaPequena.checked || filterCanchaVoley.checked)) courtMatch = true;

        if (b.sport === 'Bloqueo') {
            return courtMatch;
        }

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

    // Collect overlapping bookings for the same court category
    const overlappingEvents = [];

    for (const event of allEvents) {
        // Skip current event if editing
        if (event.id === id) continue;

        if (court === 'Todas' || event.court === 'Todas' || event.court === court) {
            const { start: existStart, end: existEnd } = getStartAndEndDates(event.date, event.start_time, event.end_time);

            // Overlap check formula: (StartA < EndB) AND (EndA > StartB)
            if (isOverlap(newStart, newEnd, existStart, existEnd)) {
                if (court === 'Todas' || event.court === 'Todas') {
                    let eventCourtName = event.court === 'Todas' ? 'Todas las Canchas' : event.court;
                    let targetCourtName = court === 'Todas' ? 'Todas las Canchas' : court;
                    return `Conflicto de horario: Hay un bloqueo o reserva activa (${event.name} en ${eventCourtName}) que interfiere con este bloqueo/reserva total en ${targetCourtName} (${event.date} ${event.start_time} - ${event.end_time}).`;
                }
                overlappingEvents.push({ event, start: existStart, end: existEnd });
            }
        }
    }

    // If total overlapping events is less than capacity, it's physically impossible to exceed capacity at any point.
    if (overlappingEvents.length >= capacity) {
        // Find all critical points (instants of time when bookings start or end)
        // within the new booking's interval [newStart, newEnd]
        const timePointsMap = new Map();
        timePointsMap.set(newStart.getTime(), newStart);
        timePointsMap.set(newEnd.getTime(), newEnd);

        for (const e of overlappingEvents) {
            if (e.start > newStart && e.start < newEnd) {
                timePointsMap.set(e.start.getTime(), e.start);
            }
            if (e.end > newStart && e.end < newEnd) {
                timePointsMap.set(e.end.getTime(), e.end);
            }
        }

        // Sort unique time points chronologically
        const sortedTimes = Array.from(timePointsMap.values()).sort((a, b) => a - b);

        // Check each sub-interval
        for (let i = 0; i < sortedTimes.length - 1; i++) {
            const tStart = sortedTimes[i];
            const tEnd = sortedTimes[i + 1];
            // Get midpoint of this sub-interval
            const tMid = new Date((tStart.getTime() + tEnd.getTime()) / 2);

            // Find all events active at tMid
            const activeAtMid = overlappingEvents.filter(e => e.start <= tMid && tMid < e.end);

            if (activeAtMid.length >= capacity) {
                const overlappingDetails = activeAtMid.map(e => `${e.event.name} (${e.event.date} ${e.event.start_time} - ${e.event.end_time})`);
                return `Conflicto de horario: Las ${capacity} canchas del tipo "${court}" ya están reservadas en este horario por:\n` +
                    overlappingDetails.join(', ');
            }
        }
    }

    return null; // No conflict, capacity is not exceeded!
}

function parseTimeToMinutes(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
}

function parseSplitPayment(tipoPagoStr) {
    if (!tipoPagoStr || !tipoPagoStr.startsWith('Dividido')) {
        return null;
    }
    const efectivoMatch = tipoPagoStr.match(/Efectivo\s*S\/\.\s*([\d.]+)/i);
    const yapeMatch = tipoPagoStr.match(/Yape\s*S\/\.\s*([\d.]+)/i);

    if (efectivoMatch || yapeMatch) {
        return {
            efectivo: efectivoMatch ? parseFloat(efectivoMatch[1]) : 0,
            yape: yapeMatch ? parseFloat(yapeMatch[1]) : 0
        };
    }
    return null;
}

function updateModalCalculatedTotal() {
    const isBlock = bookingIsBlockInput ? bookingIsBlockInput.checked : false;

    if (isBlock) {
        if (bookingTotalContainer) bookingTotalContainer.style.display = 'none';
        return 0;
    }
    if (bookingTotalContainer) bookingTotalContainer.style.display = 'flex';

    const court = String(bookingCourtInput ? bookingCourtInput.value : '');
    let courtRate = 0;
    if (court.includes('Grande')) {
        courtRate = parseFloat(localStorage.getItem('canchapro_rate_grande_poli') || '30');
    } else if (court.includes('Pequeña')) {
        courtRate = parseFloat(localStorage.getItem('canchapro_rate_pequena_poli') || '30');
    } else if (court.includes('Vóley')) {
        courtRate = parseFloat(localStorage.getItem('canchapro_rate_voley_poli') || '30');
    }

    const pelotaRate = parseFloat(localStorage.getItem('canchapro_rate_pelota_poli') || '5');
    const chalecoRate = parseFloat(localStorage.getItem('canchapro_rate_chaleco_poli') || '5');

    const startTime = bookingStartTimeInput.value;
    const endTime = bookingEndTimeInput.value;

    let start = startTime ? parseTimeToMinutes(startTime) : 0;
    let end = endTime ? parseTimeToMinutes(endTime) : 0;
    if (end <= start && startTime && endTime) {
        end += 1440;
    }
    const durationHours = (startTime && endTime) ? (end - start) / 60 : 0;

    const pelotaVal = bookingPelotaInput.value === 'true';
    const chalecoVal = bookingChalecoInput.value === 'true';

    const courtIncome = durationHours * courtRate;
    const pelotaIncome = pelotaVal ? pelotaRate : 0;
    const chalecoIncome = chalecoVal ? chalecoRate : 0;
    const calculatedTotal = courtIncome + pelotaIncome + chalecoIncome;
    currentAutoCalculatedTotal = calculatedTotal;

    let finalTotal = currentAutoCalculatedTotal;

    if (bookingPriceInput) {
        if (!isPriceUserModified || bookingPriceInput.value === '') {
            bookingPriceInput.value = currentAutoCalculatedTotal.toFixed(2);
            if (bookingTotalNote) bookingTotalNote.textContent = "Calculado automáticamente";
        } else {
            finalTotal = parseFloat(bookingPriceInput.value) || 0;
            if (bookingTotalNote) bookingTotalNote.textContent = "Modificado manualmente";
        }
    }

    if (bookingTotalValue) {
        bookingTotalValue.textContent = `S/. ${finalTotal.toFixed(2)}`;
    }

    // Keep split payment Yape up to date if they change the total
    if (bookingPaymentTypeInput && bookingPaymentTypeInput.value === 'Dividido' && splitEfectivoInput && splitYapeInput) {
        const cashVal = parseFloat(splitEfectivoInput.value) || 0;
        const yapeVal = Math.max(0, finalTotal - cashVal);
        splitYapeInput.value = yapeVal.toFixed(2);
    }

    return finalTotal;
}

// Handle saving a booking (Create or Update)
async function handleSaveBooking(e) {
    e.preventDefault();
    bookingError.style.display = 'none';

    const btnSave = document.getElementById('btnSaveBooking');
    if (btnSave) {
        btnSave.disabled = true;
        btnSave.textContent = 'Guardando...';
    }

    let newId = '';
    try {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            newId = crypto.randomUUID();
        }
    } catch (e) {
        console.warn("crypto.randomUUID failed:", e);
    }
    if (!newId) {
        newId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
    const id = bookingIdInput.value || newId;
    const isBlock = bookingIsBlockInput ? bookingIsBlockInput.checked : false;
    if (isBlock) {
        if (!requestAdminPassword("guardar este bloqueo")) {
            if (btnSave) {
                btnSave.disabled = false;
                btnSave.textContent = 'Guardar Reserva';
            }
            return;
        }
    }
    let name = bookingNameInput.value.trim();
    let dni = bookingDniInput ? bookingDniInput.value.trim() : '';
    const court = bookingCourtInput.value;
    let sport = bookingSportInput.value;
    const date = bookingDateInput.value;
    const startTime = bookingStartTimeInput.value;
    const endTime = bookingEndTimeInput.value;
    let notes = bookingNotesInput.value;
    if (notes === 'Otro...') {
        notes = document.getElementById('bookingNotesCustom').value.trim();
    } else {
        notes = notes.trim();
    }
    notes = formatAsesorName(notes);
    let medio = bookingSourceInput ? bookingSourceInput.value : '';
    if (medio === 'Otro...') {
        medio = bookingSourceCustomInput ? bookingSourceCustomInput.value.trim() : '';
    } else {
        medio = medio ? medio.trim() : '';
    }
    let pelota = bookingPelotaInput.value === 'true';
    let chaleco = bookingChalecoInput.value === 'true';
    let tipo_pago = bookingPaymentTypeInput ? bookingPaymentTypeInput.value : 'Efectivo';

    if (isBlock) {
        if (!name.startsWith('🔒 Bloqueo:')) {
            name = `🔒 Bloqueo: ${name}`;
        }
        dni = '-';
        sport = 'Bloqueo';
        pelota = false;
        chaleco = false;
        medio = '-';
        tipo_pago = 'Efectivo';
    } else if (tipo_pago === 'Dividido') {
        if (splitEfectivoInput && splitYapeInput) {
            const cashVal = parseFloat(splitEfectivoInput.value) || 0;
            const yapeVal = parseFloat(splitYapeInput.value) || 0;
            const calculatedTotal = updateModalCalculatedTotal();
            const sum = cashVal + yapeVal;

            if (Math.abs(sum - calculatedTotal) > 0.05) {
                showBookingError(`El monto ingresado (Efectivo S/. ${cashVal.toFixed(2)} + Yape S/. ${yapeVal.toFixed(2)} = S/. ${sum.toFixed(2)}) no coincide con el total calculado (S/. ${calculatedTotal.toFixed(2)}).`);
                if (btnSave) {
                    btnSave.disabled = false;
                    btnSave.textContent = 'Guardar Reserva';
                }
                return;
            }
            tipo_pago = `Dividido: Efectivo S/. ${cashVal.toFixed(2)} / Yape S/. ${yapeVal.toFixed(2)}`;
        }
    }

    // 1. Validation for empty inputs
    if (isBlock) {
        if (!name || !date || !startTime || !endTime) {
            showBookingError("Por favor completa el motivo del bloqueo, fecha y horarios.");
            if (btnSave) {
                btnSave.disabled = false;
                btnSave.textContent = 'Guardar Reserva';
            }
            return;
        }
    } else {
        if (!name || !date || !startTime || !endTime || !medio) {
            showBookingError("Por favor completa todos los campos requeridos.");
            if (btnSave) {
                btnSave.disabled = false;
                btnSave.textContent = 'Guardar Reserva';
            }
            return;
        }
    }

    // 2. Validate time overlaps
    const overlapMsg = checkOverlaps(bookingIdInput.value, court, date, startTime, endTime);
    if (overlapMsg) {
        showBookingError(overlapMsg);
        if (btnSave) {
            btnSave.disabled = false;
            btnSave.textContent = 'Guardar Reserva';
        }
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
        tipo_pago
    };

    try {
        let currentPayload = bookingData;
        if (dbMode === 'supabase' && supabaseClient) {
            // Guardar en Supabase
            let query;
            if (bookingIdInput.value) {
                // Actualizar
                query = supabaseClient.from('reservas').update(bookingData).eq('id', id);
            } else {
                // Insertar nuevo
                const insertData = { ...bookingData };
                delete insertData.id;
                currentPayload = insertData;
                query = supabaseClient.from('reservas').insert([insertData]);
            }

            const res = await query;
            const error = res.error;
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
        let logDetails;
        if (isBlock) {
            logDetails = `${isUpdate ? 'modificó el' : 'creó un'} bloqueo (${name}) para la cancha ${court} el ${formattedDate} de ${formattedStart} a ${formattedEnd}`;
        } else {
            logDetails = `${isUpdate ? 'modificó la' : 'creó una'} reserva para ${name} (${court} - ${sport}${pelota ? ' + Pelota' : ''}${chaleco ? ' + Chaleco' : ''}) el ${formattedDate} de ${formattedStart} a ${formattedEnd}`;
        }
        await addHistoryEntry(logAction, logDetails);

        // Refresh Calendar UI & Close modal
        closeBookingModal();
        if (calendar) calendar.refetchEvents();
        updateStats();

    } catch (err) {
        console.error("Error al guardar reserva:", err);
        showBookingError("Error de base de datos: " + err.message);
        if (btnSave) {
            btnSave.disabled = false;
            btnSave.textContent = 'Guardar Reserva';
        }
    }
}

// Handle deleting a booking
async function handleDeleteBooking() {
    const id = bookingIdInput.value;
    if (!id) return;

    const isBlock = bookingIsBlockInput ? bookingIsBlockInput.checked : false;
    if (isBlock) {
        if (!requestAdminPassword("eliminar este bloqueo")) {
            return;
        }
    }

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
    const isBlock = bookingIsBlockInput ? bookingIsBlockInput.checked : false;

    if (isBlock) {
        const clientName = bookingNameInput.value.trim();
        const courtText = bookingCourtInput.value;
        let dateText = bookingDateInput.value;
        const startTime = bookingStartTimeInput.value;
        const endTime = bookingEndTimeInput.value;

        let advisorText = bookingNotesInput.value;
        if (advisorText === 'Otro...') {
            advisorText = document.getElementById('bookingNotesCustom').value.trim();
        } else {
            advisorText = advisorText ? advisorText.trim() : '';
        }

        // Validate if everything is filled
        if (!clientName || !courtText || !dateText || !startTime || !endTime) {
            showBookingError("Por favor completa el motivo del bloqueo, fecha y horarios antes de copiar.");
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

        // Format court name for WhatsApp copy
        let courtFormatted = courtText;
        if (courtText === 'Cancha Grande') {
            courtFormatted = 'Cancha Grande de Fútbol';
        } else if (courtText === 'Cancha Pequeña') {
            courtFormatted = 'Cancha Pequeña de Fútbol';
        }

        const message = `*BLOQUEO DE CANCHA POLIDEPORTIVO*

Cancha: ${courtFormatted}
Fecha: ${dateText}
Hora: ${formatTimeHHMM(startTime)} - ${formatTimeHHMM(endTime)}
Motivo: ${clientName}
Registrado por: ${advisorText}`;

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
        return;
    }

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

    // Validate if everything is filled (DNI is optional)
    if (!clientName || !courtText || !dateText || !startTime || !endTime || !advisorText || !medioText) {
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

    const timeText = `${formatTimeHHMM(startTime)} - ${formatTimeHHMM(endTime)}`;
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

    let tipoPagoText = bookingPaymentTypeInput ? bookingPaymentTypeInput.value : 'Efectivo';
    if (tipoPagoText === 'Dividido') {
        tipoPagoText = 'Dividido';
    }

    const message = `*RESERVA DE CANCHA POLIDEPORTIV0*

Nombre del cliente: ${clientName}
DNI: ${dniText || '-'}
Cancha: ${courtFormatted}
Fecha: ${dateText}
Hora: ${timeText} ${timeEmoji}
Pelota: ${pelotaText}
Chalecos: ${chalecoText}
Tipo de pago: ${tipoPagoText}
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

    // Filter events belonging to today's business day, excluding blocks
    const todayEvents = allEvents.filter(e => getBusinessDate(e.date, e.start_time) === todayStr && e.sport !== 'Bloqueo');

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

        if (e.court && e.court.includes('Grande')) {
            hoursFutbolGrande += diffHours;
        } else if (e.court && e.court.includes('Pequeña')) {
            hoursFutbolChico += diffHours;
        } else if (e.court && e.court.includes('Vóley')) {
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

    updateAvailabilityGrid();
    if (typeof updateCourtAvailabilityChecker === 'function') {
        updateCourtAvailabilityChecker();
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
        const isBlock = e.sport === 'Bloqueo';
        if (isBlock) {
            html += `
                <div class="summary-item-card event-sport-bloqueo" onclick="openEditFromSummary('${e.id}')" style="cursor: pointer; border-left: 5px solid #ef4444 !important;">
                    <div class="summary-item-header">
                        <span class="summary-item-time" style="color: #e5e7eb;">${formatTimeHHMM(e.start_time)} - ${formatTimeHHMM(e.end_time)}</span>
                        <span class="summary-item-court court-badge-bloqueo" style="background: #ef4444; color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px;">Bloqueo: ${e.court === 'Todas' ? 'Todas las Canchas' : e.court}</span>
                    </div>
                    <div class="summary-item-client" style="color: #ffffff; font-weight: bold;">${escapeHTML(e.name)}</div>
                    <div class="summary-item-details" style="color: #d1d5db;">
                        <span class="summary-detail-tag" style="color: #e5e7eb;"><i data-lucide="user"></i> ${escapeHTML(e.notes || 'Sin detalle')}</span>
                    </div>
                </div>
            `;
        } else {
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
                    ${(pelotaVal || chalecoVal) ? `
                    <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: -4px; margin-bottom: 2px;">
                        ${pelotaVal ? `<span class="summary-detail-tag" style="color:#34d399;">⚽ Pelota</span>` : ''}
                        ${chalecoVal ? `<span class="summary-detail-tag" style="color:#34d399;">🎽 Chaleco</span>` : ''}
                    </div>
                    ` : ''}
                    <div class="summary-item-details" style="flex-direction: column; align-items: flex-start; gap: 8px;">
                        <div style="display: flex; flex-wrap: wrap; gap: 12px;">
                            <span class="summary-detail-tag">DNI: ${escapeHTML(e.dni || '-')}</span>
                            <span class="summary-detail-tag"><i data-lucide="user"></i> ${escapeHTML(e.notes || 'Sin asesor')}</span>
                        </div>
                        <div style="display: flex; flex-wrap: wrap; gap: 12px;">
                            <span class="summary-detail-tag"><i data-lucide="share-2"></i> ${escapeHTML(e.medio || 'Otro')}</span>
                            <span class="summary-detail-tag"><i data-lucide="wallet"></i> ${escapeHTML(e.tipo_pago || 'Efectivo')}</span>
                        </div>
                    </div>
                </div>
            `;
        }
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

// Rate calculator helper for Polideportivo
function calculateBookingIncome(params) {
    const { court, startTime, endTime, sport, pelota, chaleco } = params;
    if (sport === 'Bloqueo') {
        return { total: 0, courtIncome: 0, pelotaIncome: 0, chalecoIncome: 0, durationHours: 0 };
    }
    let courtRate = 30;
    const courtStr = String(court || '');
    if (courtStr.includes('Grande')) {
        courtRate = parseFloat(localStorage.getItem('canchapro_rate_grande_poli') || '30');
    } else if (courtStr.includes('Pequeña')) {
        courtRate = parseFloat(localStorage.getItem('canchapro_rate_pequena_poli') || '30');
    } else if (courtStr.includes('Vóley')) {
        courtRate = parseFloat(localStorage.getItem('canchapro_rate_voley_poli') || '30');
    }

    const pelotaRate = parseFloat(localStorage.getItem('canchapro_rate_pelota_poli') || '5');
    const chalecoRate = parseFloat(localStorage.getItem('canchapro_rate_chaleco_poli') || '5');

    let start = startTime ? parseTimeToMinutes(startTime) : 0;
    let end = endTime ? parseTimeToMinutes(endTime) : 0;
    if (end <= start && startTime && endTime) {
        end += 1440;
    }
    const durationHours = (startTime && endTime) ? (end - start) / 60 : 0;

    const courtIncome = durationHours * courtRate;
    const pelotaIncome = pelota ? pelotaRate : 0;
    const chalecoIncome = chaleco ? chalecoRate : 0;
    const total = courtIncome + pelotaIncome + chalecoIncome;

    return { total, courtIncome, pelotaIncome, chalecoIncome, durationHours };
}

// =============================================================
// Smart Availability Quick Checker Logic ("¿Qué canchas están disponibles?")
// =============================================================

function getCheckerCourtStartTime() {
    const h = document.getElementById('checkCourtStartHour')?.value?.trim();
    const m = document.getElementById('checkCourtStartMin')?.value?.trim();
    const ampm = document.getElementById('checkCourtStartAmpm')?.value;
    if (!h || !m || !ampm) return "";
    let hour = parseInt(h, 10);
    let min = parseInt(m, 10);
    if (isNaN(hour) || isNaN(min)) return "";
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function setCheckerCourtStartTime(val) {
    if (!val) {
        if (document.getElementById('checkCourtStartHour')) document.getElementById('checkCourtStartHour').value = "";
        if (document.getElementById('checkCourtStartMin')) document.getElementById('checkCourtStartMin').value = "";
        if (document.getElementById('checkCourtStartAmpm')) document.getElementById('checkCourtStartAmpm').value = "pm";
        return;
    }
    const parts = val.split(':');
    let h = parseInt(parts[0], 10);
    let m = parts[1] || '00';
    let ampm = h >= 12 ? 'pm' : 'am';
    let h12 = h % 12;
    if (h12 === 0) h12 = 12;
    if (document.getElementById('checkCourtStartHour')) document.getElementById('checkCourtStartHour').value = String(h12);
    if (document.getElementById('checkCourtStartMin')) document.getElementById('checkCourtStartMin').value = String(m).padStart(2, '0');
    if (document.getElementById('checkCourtStartAmpm')) document.getElementById('checkCourtStartAmpm').value = ampm;
}

function getCheckerCourtEndTime() {
    const h = document.getElementById('checkCourtEndHour')?.value?.trim();
    const m = document.getElementById('checkCourtEndMin')?.value?.trim();
    const ampm = document.getElementById('checkCourtEndAmpm')?.value;
    if (!h || !m || !ampm) return "";
    let hour = parseInt(h, 10);
    let min = parseInt(m, 10);
    if (isNaN(hour) || isNaN(min)) return "";
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function setCheckerCourtEndTime(val) {
    if (!val) {
        if (document.getElementById('checkCourtEndHour')) document.getElementById('checkCourtEndHour').value = "";
        if (document.getElementById('checkCourtEndMin')) document.getElementById('checkCourtEndMin').value = "";
        if (document.getElementById('checkCourtEndAmpm')) document.getElementById('checkCourtEndAmpm').value = "pm";
        return;
    }
    const parts = val.split(':');
    let h = parseInt(parts[0], 10);
    let m = parts[1] || '00';
    let ampm = h >= 12 ? 'pm' : 'am';
    let h12 = h % 12;
    if (h12 === 0) h12 = 12;
    if (document.getElementById('checkCourtEndHour')) document.getElementById('checkCourtEndHour').value = String(h12);
    if (document.getElementById('checkCourtEndMin')) document.getElementById('checkCourtEndMin').value = String(m).padStart(2, '0');
    if (document.getElementById('checkCourtEndAmpm')) document.getElementById('checkCourtEndAmpm').value = ampm;
}

function initCourtAvailabilityChecker() {
    const checkDate = document.getElementById('checkCourtDate');
    const startHour = document.getElementById('checkCourtStartHour');
    const startMin = document.getElementById('checkCourtStartMin');
    const startAmpm = document.getElementById('checkCourtStartAmpm');
    const endHour = document.getElementById('checkCourtEndHour');
    const endMin = document.getElementById('checkCourtEndMin');
    const endAmpm = document.getElementById('checkCourtEndAmpm');
    const checkSport = document.getElementById('checkCourtSport');
    const btnQuickToday = document.getElementById('btnCourtQuickToday');
    const btnQuickTomorrow = document.getElementById('btnCourtQuickTomorrow');
    const btnQuickWeekend = document.getElementById('btnCourtQuickWeekend');
    const resultsEl = document.getElementById('checkerCourtResultsGrid');

    if (!checkDate || !startHour || !startMin || !startAmpm || !endHour || !endMin || !endAmpm || !resultsEl) return;

    // Initial default values
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    checkDate.value = todayStr;

    // Smart default hour: if between 6 AM and 10 PM, select next full hour; otherwise select 19:00 (7:00 PM)
    const currentHour = today.getHours();
    let defaultStart = '19:00';
    if (currentHour >= 6 && currentHour < 23) {
        defaultStart = String(currentHour + 1).padStart(2, '0') + ':00';
    }
    setCheckerCourtStartTime(defaultStart);

    // Default End Time is 1 hour after default Start Time
    const startMins = parseTimeToMinutes(defaultStart);
    const endH = Math.floor((startMins + 60) / 60) % 24;
    const endM = (startMins + 60) % 60;
    const defaultEnd = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
    setCheckerCourtEndTime(defaultEnd);

    // Input handlers for quick typing, auto-select and auto-tabbing
    const setupNumericTimeInput = (inputEl, maxVal, nextEl, prevEl) => {
        if (!inputEl) return;

        // Auto-select entire text on focus or click for instant replacement
        inputEl.addEventListener('focus', () => {
            inputEl.select();
        });
        inputEl.addEventListener('click', (e) => {
            e.stopPropagation();
            inputEl.select();
        });

        inputEl.addEventListener('input', () => {
            // Keep only digits
            inputEl.value = inputEl.value.replace(/[^0-9]/g, '');
            const valNum = parseInt(inputEl.value, 10);
            if (!isNaN(valNum) && valNum > maxVal) {
                inputEl.value = String(maxVal);
            }
            if (inputEl.value.length === 2 && nextEl) {
                nextEl.focus();
                if (nextEl.select) nextEl.select();
            }
            updateCourtAvailabilityChecker();
        });

        inputEl.addEventListener('keydown', (e) => {
            // Backspace on empty jumps to previous input
            if (e.key === 'Backspace' && inputEl.value === '' && prevEl) {
                prevEl.focus();
                if (prevEl.select) prevEl.select();
            }
        });

        inputEl.addEventListener('blur', () => {
            if (inputEl.value.length === 1) {
                inputEl.value = '0' + inputEl.value;
            }
            updateCourtAvailabilityChecker();
        });
    };

    setupNumericTimeInput(startHour, 12, startMin, null);
    setupNumericTimeInput(startMin, 59, startAmpm, startHour);
    setupNumericTimeInput(endHour, 12, endMin, null);
    setupNumericTimeInput(endMin, 59, endAmpm, endHour);

    // Clicking anywhere on the box focuses the hours
    const groupStart = document.getElementById('groupCourtStartTime');
    if (groupStart) {
        groupStart.addEventListener('click', (e) => {
            if (e.target !== startMin && e.target !== startAmpm) {
                startHour.focus();
                startHour.select();
            }
        });
    }
    const groupEnd = document.getElementById('groupCourtEndTime');
    if (groupEnd) {
        groupEnd.addEventListener('click', (e) => {
            if (e.target !== endMin && e.target !== endAmpm) {
                endHour.focus();
                endHour.select();
            }
        });
    }

    // Auto-sync end time (+1 hour) when start time changes
    const syncCheckerEndTime = () => {
        const startTime = getCheckerCourtStartTime();
        if (!startTime) return;
        const sM = parseTimeToMinutes(startTime);
        const eM = (sM + 60) % 1440;
        const eh = Math.floor(eM / 60);
        const em = eM % 60;
        const newEndTime = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
        setCheckerCourtEndTime(newEndTime);
        updateCourtAvailabilityChecker();
    };

    startHour.addEventListener('change', syncCheckerEndTime);
    startMin.addEventListener('change', syncCheckerEndTime);
    startAmpm.addEventListener('change', syncCheckerEndTime);

    endHour.addEventListener('change', updateCourtAvailabilityChecker);
    endMin.addEventListener('change', updateCourtAvailabilityChecker);
    endAmpm.addEventListener('change', updateCourtAvailabilityChecker);
    checkDate.addEventListener('change', updateCourtAvailabilityChecker);

    if (checkSport) {
        checkSport.addEventListener('change', updateCourtAvailabilityChecker);
    }

    // Quick Date Buttons
    if (btnQuickToday) {
        btnQuickToday.addEventListener('click', () => {
            checkDate.value = todayStr;
            updateCourtAvailabilityChecker();
        });
    }

    if (btnQuickTomorrow) {
        btnQuickTomorrow.addEventListener('click', () => {
            const tmrw = new Date(today);
            tmrw.setDate(tmrw.getDate() + 1);
            checkDate.value = `${tmrw.getFullYear()}-${String(tmrw.getMonth() + 1).padStart(2, '0')}-${String(tmrw.getDate()).padStart(2, '0')}`;
            updateCourtAvailabilityChecker();
        });
    }

    if (btnQuickWeekend) {
        btnQuickWeekend.addEventListener('click', () => {
            const sat = new Date(today);
            const dayOfWeek = sat.getDay();
            const daysUntilSat = (6 - dayOfWeek + 7) % 7 || 7;
            sat.setDate(sat.getDate() + daysUntilSat);
            checkDate.value = `${sat.getFullYear()}-${String(sat.getMonth() + 1).padStart(2, '0')}-${String(sat.getDate()).padStart(2, '0')}`;
            updateCourtAvailabilityChecker();
        });
    }

    updateCourtAvailabilityChecker();
}

function updateCourtAvailabilityChecker() {
    const checkDate = document.getElementById('checkCourtDate');
    const checkSport = document.getElementById('checkCourtSport');
    const resultsEl = document.getElementById('checkerCourtResultsGrid');

    if (!checkDate || !resultsEl) return;

    const dateStr = checkDate.value;
    const startTime = getCheckerCourtStartTime();
    const endTime = getCheckerCourtEndTime();
    const selectedSport = checkSport ? checkSport.value : 'Fútbol';

    if (!dateStr || !startTime || !endTime) {
        resultsEl.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 14px; background: rgba(255,255,255,0.02); border: 1px dashed rgba(255,255,255,0.1); border-radius: var(--radius-sm);"><i data-lucide="clock" style="width: 18px; height: 18px; vertical-align: middle; margin-right: 6px; color: var(--primary);"></i> Ingrese la fecha, hora de inicio y salida para ver la disponibilidad en vivo.</div>';
        if (window.lucide) lucide.createIcons();
        return;
    }

    let startMins = parseTimeToMinutes(startTime);
    let endMins = parseTimeToMinutes(endTime);
    if (endMins <= startMins && startTime && endTime) {
        endMins += 1440;
    }
    const durationMins = endMins - startMins;
    const durationHours = durationMins / 60;
    const durationText = durationHours === 1 ? '1h' : (durationHours % 1 === 0 ? durationHours + 'h' : durationHours.toFixed(1) + 'h');

    const { start: queryStart, end: queryEnd } = getStartAndEndDates(dateStr, startTime, endTime);

    // Format helper for 12h display
    const formatTime12H = (tStr) => {
        if (!tStr) return '';
        const parts = tStr.split(':');
        let h = parseInt(parts[0], 10);
        const m = parts[1] || '00';
        const ampm = (h >= 12 && h < 24) ? 'PM' : 'AM';
        let h12 = h % 12;
        if (h12 === 0) h12 = 12;
        return `${h12}:${m} ${ampm}`;
    };

    // 11 Courts in Polideportivo grouped into 3 categories
    const courtGroups = [
        {
            title: '⚽ Canchas Grandes de Fútbol (3 canchas)',
            sport: 'Fútbol',
            groupKeyword: 'Grande',
            courts: [
                { id: 'Cancha Grande 1', name: '1 Cancha Grande', dotClass: 'dot-grande', groupSport: 'Fútbol' },
                { id: 'Cancha Grande 2', name: '2 Cancha Grande', dotClass: 'dot-grande', groupSport: 'Fútbol' },
                { id: 'Cancha Grande 3', name: '3 Cancha Grande', dotClass: 'dot-grande', groupSport: 'Fútbol' }
            ]
        },
        {
            title: '⚽ Canchas Pequeñas de Fútbol (4 canchas)',
            sport: 'Fútbol',
            groupKeyword: 'Pequeña',
            courts: [
                { id: 'Cancha Pequeña 1', name: '1 Cancha Pequeña', dotClass: 'dot-pequena', groupSport: 'Fútbol' },
                { id: 'Cancha Pequeña 2', name: '2 Cancha Pequeña', dotClass: 'dot-pequena', groupSport: 'Fútbol' },
                { id: 'Cancha Pequeña 3', name: '3 Cancha Pequeña', dotClass: 'dot-pequena', groupSport: 'Fútbol' },
                { id: 'Cancha Pequeña 4', name: '4 Cancha Pequeña', dotClass: 'dot-pequena', groupSport: 'Fútbol' }
            ]
        },
        {
            title: '🏐 Canchas de Vóley (4 canchas)',
            sport: 'Vóley',
            groupKeyword: 'Vóley',
            courts: [
                { id: 'Cancha de Vóley 1', name: '1 Cancha Vóley', dotClass: 'dot-voley', groupSport: 'Vóley' },
                { id: 'Cancha de Vóley 2', name: '2 Cancha Vóley', dotClass: 'dot-voley', groupSport: 'Vóley' },
                { id: 'Cancha de Vóley 3', name: '3 Cancha Vóley', dotClass: 'dot-voley', groupSport: 'Vóley' },
                { id: 'Cancha de Vóley 4', name: '4 Cancha Vóley', dotClass: 'dot-voley', groupSport: 'Vóley' }
            ]
        }
    ];

    let fullHtml = '<div class="checker-groups-container">';

    courtGroups.forEach(group => {
        // Collect all active overlapping events for this group
        const groupOverlappingEvents = [];
        for (const event of allEvents) {
            const eventCourt = event.court || '';
            const matchesGroup = (eventCourt === 'Todas') || eventCourt.includes(group.groupKeyword);
            if (matchesGroup) {
                const { start: existStart, end: existEnd } = getStartAndEndDates(event.date, event.start_time, event.end_time);
                if (queryStart < existEnd && queryEnd > existStart) {
                    groupOverlappingEvents.push(event);
                }
            }
        }

        // Assign events to court slots
        const courtOccupant = {}; // courtId -> event

        // 1. Check for 'Todas' (occupies all courts in group)
        const todasEvent = groupOverlappingEvents.find(e => e.court === 'Todas');
        if (todasEvent) {
            group.courts.forEach(c => {
                courtOccupant[c.id] = todasEvent;
            });
        } else {
            // 2. Specific numbered court assignments first
            const unassignedGenericEvents = [];
            groupOverlappingEvents.forEach(event => {
                const exactCourt = group.courts.find(c => c.id === event.court);
                if (exactCourt && !courtOccupant[exactCourt.id]) {
                    courtOccupant[exactCourt.id] = event;
                } else {
                    unassignedGenericEvents.push(event);
                }
            });

            // 3. Generic events (e.g. 'Cancha Grande', 'Cancha Pequeña', 'Cancha de Vóley')
            // sequentially fill first available unassigned court slots
            unassignedGenericEvents.forEach(event => {
                const freeSlot = group.courts.find(c => !courtOccupant[c.id]);
                if (freeSlot) {
                    courtOccupant[freeSlot.id] = event;
                }
            });
        }

        let groupCardsHtml = '';
        let freeCount = 0;

        group.courts.forEach(c => {
            const collision = courtOccupant[c.id];
            const courtSport = c.groupSport || selectedSport;

            if (!collision) {
                freeCount++;
                // Court is FREE
                const inc = calculateBookingIncome({ court: c.id, startTime, endTime, sport: courtSport, pelota: false, chaleco: false });
                const estIncome = inc ? inc.total : 0;

                groupCardsHtml += `
                <div class="checker-court-card available" onclick="quickBookCourtFromChecker('${c.id}', '${dateStr}', '${startTime}', '${endTime}', '${courtSport}')" title="Clic para reservar ${c.name}">
                    <div class="checker-card-header">
                        <div class="checker-card-name">
                            <span class="court-dot ${c.dotClass}"></span>
                            <span>${c.name}</span>
                        </div>
                        <span class="checker-status-badge free"><i data-lucide="check-circle-2"></i> Libre</span>
                    </div>
                    <div class="checker-card-body">
                        <div class="checker-price-row">
                            <span class="checker-price-label">Tarifa estimada:</span>
                            <span class="checker-price-value">S/. ${estIncome.toFixed(2)}</span>
                        </div>
                        <div class="checker-time-info">
                            <i data-lucide="clock" style="width: 12px; height: 12px; color: var(--primary);"></i>
                            ${formatTime12H(startTime)} - ${formatTime12H(endTime)} (${durationText})
                        </div>
                    </div>
                    <div class="checker-card-action">
                        <button type="button" class="btn-book"><i data-lucide="plus"></i> Reservar</button>
                    </div>
                </div>`;
            } else {
                // Court is OCCUPIED or BLOCKED
                const isBlocked = collision.sport === 'Bloqueo';
                let clientName = collision.name || 'Ocupado';
                if (clientName.startsWith('🔒 Bloqueo: ')) clientName = clientName.replace('🔒 Bloqueo: ', '');
                else if (clientName.startsWith('🔒 Bloqueo:')) clientName = clientName.replace('🔒 Bloqueo:', '');

                groupCardsHtml += `
                <div class="checker-court-card occupied" onclick="openEditFromSummary('${collision.id}')" title="Ocupado por ${escapeHTML(clientName)} - Clic para ver detalles">
                    <div class="checker-card-header">
                        <div class="checker-card-name">
                            <span class="court-dot ${c.dotClass}"></span>
                            <span>${c.name}</span>
                        </div>
                        <span class="checker-status-badge busy">${isBlocked ? '<i data-lucide="lock"></i> Bloqueo' : '<i data-lucide="x-circle"></i> Ocupado'}</span>
                    </div>
                    <div class="checker-card-body">
                        <div class="checker-occupied-info">
                            <strong>${escapeHTML(clientName)}</strong>
                        </div>
                        <div class="checker-time-info" style="color: #f87171;">
                            <i data-lucide="calendar" style="width: 12px; height: 12px;"></i>
                            ${formatTime12H(collision.start_time)} - ${formatTime12H(collision.end_time)}
                            <span style="font-size: 10px; background: rgba(239, 68, 68, 0.2); padding: 1px 5px; border-radius: 4px; margin-left: 4px;">${collision.sport || courtSport}</span>
                        </div>
                    </div>
                    <div class="checker-card-action">
                        <span class="checker-view-link">Ver reserva &rarr;</span>
                    </div>
                </div>`;
            }
        });

        const countBadgeClass = freeCount > 0 ? 'checker-group-count' : 'checker-group-count none-free';
        fullHtml += `
        <div class="checker-group-section">
            <div class="checker-group-header">
                <span class="checker-group-title">${group.title}</span>
                <span class="${countBadgeClass}">${freeCount} / ${group.courts.length} libres</span>
            </div>
            <div class="checker-cards-subgrid">
                ${groupCardsHtml}
            </div>
        </div>`;
    });

    fullHtml += '</div>';

    resultsEl.innerHTML = fullHtml;
    if (window.lucide) lucide.createIcons();
}

window.quickBookCourtFromChecker = function (court, dateStr, startTime, endTime, sport) {
    openBookingModal(null, {
        court: court,
        date: dateStr,
        start_time: startTime,
        end_time: endTime,
        sport: sport
    });
    const nameInput = document.getElementById('bookingName');
    if (nameInput) {
        setTimeout(() => nameInput.focus(), 150);
    }
};

// Render interactive court availability grid for Polideportivo
function updateAvailabilityGrid() {
    if (!calendar) return;
    const tabAvailabilityContent = document.getElementById('tabAvailabilityContent');
    if (!tabAvailabilityContent || tabAvailabilityContent.style.display === 'none') return;

    const currentDate = calendar.getDate();
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    const courts = ['Cancha Grande', 'Cancha Pequeña', 'Cancha de Vóley'];

    const capacities = {
        'Cancha Grande': 3,
        'Cancha Pequeña': 4,
        'Cancha de Vóley': 4
    };

    // Generate slots
    const slotDuration = 30; // minutes
    const numSlots = (19 * 60) / slotDuration; // 19 hours from 06:00 to 01:00 AM

    const slots = [];
    const yr = parseInt(year, 10);
    const mo = parseInt(month, 10) - 1;
    const dy = parseInt(day, 10);

    for (let i = 0; i < numSlots; i++) {
        const startOffset = i * slotDuration;
        const endOffset = (i + 1) * slotDuration;

        const startTotalMins = 360 + startOffset;
        const endTotalMins = 360 + endOffset;

        const startDayOffset = Math.floor(startTotalMins / 1440);
        const startHour = Math.floor((startTotalMins % 1440) / 60);
        const startMin = (startTotalMins % 1440) % 60;

        const endDayOffset = Math.floor(endTotalMins / 1440);
        const endHour = Math.floor((endTotalMins % 1440) / 60);
        const endMin = (endTotalMins % 1440) % 60;

        const slotStartDate = new Date(yr, mo, dy + startDayOffset, startHour, startMin, 0);
        const slotEndDate = new Date(yr, mo, dy + endDayOffset, endHour, endMin, 0);

        const startTimeStr = `${String(startHour).padStart(2, '0')}:${String(startMin).padStart(2, '0')}`;
        const endTimeStr = `${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`;

        const bookingDate = new Date(yr, mo, dy + startDayOffset);
        const bookingDateStr = `${bookingDate.getFullYear()}-${String(bookingDate.getMonth() + 1).padStart(2, '0')}-${String(bookingDate.getDate()).padStart(2, '0')}`;

        // Filter by peak hours if active: starts between 13:00 and 01:00 (ends 01:00 next day)
        if (availabilityTimeFilter === 'pico') {
            if ((startDayOffset === 0 && startHour < 13) || (startDayOffset === 1 && startHour >= 1) || startDayOffset > 1) {
                continue;
            }
        }

        slots.push({
            startStr: startTimeStr,
            endStr: endTimeStr,
            bookingDateStr: bookingDateStr,
            startDate: slotStartDate,
            endDate: slotEndDate,
            displayTime: `${formatTimeHHMM(startTimeStr)} - ${formatTimeHHMM(endTimeStr)}`
        });
    }

    let html = '';
    let totalFreeCourtsToday = 0;
    let totalPossibleCourtsToday = 0;

    slots.forEach(slot => {
        html += `<tr>`;
        html += `<td style="padding: 10px 16px; font-weight: 600; color: var(--text-primary); border-bottom: 1px solid rgba(255, 255, 255, 0.04);">${slot.displayTime}</td>`;

        courts.forEach(court => {
            const capacity = capacities[court];
            totalPossibleCourtsToday += capacity;

            // Check if there is an overlapping total block ("Todas")
            const totalBlock = allEvents.find(e => {
                if (e.court === 'Todas') {
                    const { start: existStart, end: existEnd } = getStartAndEndDates(e.date, e.start_time, e.end_time);
                    return existStart < slot.endDate && existEnd > slot.startDate;
                }
                return false;
            });

            html += `<td style="padding: 6px 8px; border-bottom: 1px solid rgba(255, 255, 255, 0.04); vertical-align: top;">`;

            if (totalBlock) {
                let blockReason = totalBlock.name;
                if (blockReason.startsWith('🔒 Bloqueo: ')) {
                    blockReason = blockReason.replace('🔒 Bloqueo: ', '');
                } else if (blockReason.startsWith('🔒 Bloqueo:')) {
                    blockReason = blockReason.replace('🔒 Bloqueo:', '');
                }
                html += `<span class="availability-blocked-badge" onclick="openEditFromSummary('${totalBlock.id}')" title="🔒 Bloqueo Total: ${escapeHTML(blockReason)}" style="margin-bottom: 4px;">🔒 Bloqueo Total: ${escapeHTML(blockReason)}</span>`;
            } else {
                // Find all bookings for this court category overlapping with this slot
                const activeBookings = allEvents.filter(e => {
                    if (e.court === court) {
                        const { start: existStart, end: existEnd } = getStartAndEndDates(e.date, e.start_time, e.end_time);
                        return existStart < slot.endDate && existEnd > slot.startDate;
                    }
                    return false;
                });

                // Display active bookings
                activeBookings.forEach(booking => {
                    const isBlock = booking.sport === 'Bloqueo';
                    if (isBlock) {
                        let blockReason = booking.name;
                        if (blockReason.startsWith('🔒 Bloqueo: ')) {
                            blockReason = blockReason.replace('🔒 Bloqueo: ', '');
                        } else if (blockReason.startsWith('🔒 Bloqueo:')) {
                            blockReason = blockReason.replace('🔒 Bloqueo:', '');
                        }
                        html += `<span class="availability-blocked-badge" onclick="openEditFromSummary('${booking.id}')" title="🔒 Bloqueo: ${escapeHTML(blockReason)}" style="margin-bottom: 4px; display: block;">🔒 ${escapeHTML(blockReason)}</span>`;
                    } else {
                        let courtClass = 'court-grande';
                        if (court === 'Cancha Pequeña') courtClass = 'court-pequena';
                        if (court === 'Cancha de Vóley') courtClass = 'court-voley';
                        const sportEmoji = booking.sport === 'Vóley' ? '🏐' : '⚽';
                        html += `<span class="availability-booked-badge ${courtClass}" onclick="openEditFromSummary('${booking.id}')" title="Reservado: ${escapeHTML(booking.name)} (${booking.sport})" style="margin-bottom: 4px; display: block;">${sportEmoji} ${escapeHTML(booking.name)}</span>`;
                    }
                });

                // Display quick booking button if there is remaining capacity
                const freeCount = capacity - activeBookings.length;
                if (freeCount > 0) {
                    totalFreeCourtsToday += freeCount;
                    let buttonText = `+ Reservar (${freeCount} Libres)`;

                    html += `<button type="button" class="availability-slot-btn" data-free="${freeCount}" onclick="openBookingFromGrid('${slot.bookingDateStr}', '${slot.startStr}', '${slot.endStr}', '${court}')">
                        <i data-lucide="plus" style="width: 11px; height: 11px;"></i> ${buttonText}
                    </button>`;
                } else {
                    html += `<div style="font-size: 10px; color: var(--danger); font-weight: 700; text-align: center; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.5px;">🔴 Completo</div>`;
                }
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

// Global function to trigger modal open from availability grid cells
window.openBookingFromGrid = function (dateStr, startTime, endTime, court) {
    openBookingModal(null, {
        date: dateStr,
        start_time: startTime,
        end_time: endTime,
        court: court
    });
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
        details: details.startsWith('[Polideportivo]') ? details : `[Polideportivo] ${details}`,
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
        const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        return history.filter(e => new Date(e.created_at).getTime() > sevenDaysAgo);
    } catch (e) {
        return [];
    }
}

async function fetchAndRenderHistory() {
    let entries = [];
    const sevenDaysAgoISO = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000)).toISOString();

    if (dbMode === 'supabase' && supabaseClient) {
        try {
            // Prune database logs older than 7 days
            await supabaseClient
                .from('historial')
                .delete()
                .lt('created_at', sevenDaysAgoISO);

            // Fetch remaining active logs for the last 7 days
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

    // Filter to only include Polideportivo logs (and fallback for legacy logs without prefix)
    entries = entries.filter(e => {
        const d = e.details || '';
        if (d.startsWith('[Polideportivo]')) return true;
        // Legacy logs fallback: exclude other systems
        const otherPrefixes = ['[Canchas]', '[Bungalows]', '[Locales]', '[Asistencia]'];
        if (otherPrefixes.some(p => d.startsWith(p))) return false;
        // Also apply the old filter to separate from old Canchas logs
        return !d.includes('(Grande -') && !d.includes('(Pequeña -');
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

    if (!activityList) return;

    if (entries.length === 0) {
        activityList.innerHTML = '<p class="no-activity">No se encontraron registros en el historial.</p>';
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
            const timeAgo = formatTimeAgo(new Date(entry.created_at));

            let badgeColor = '#10b981'; // green for crear
            let badgeBg = 'rgba(16, 185, 129, 0.1)';
            let actionTextLabel = 'Crear';

            if (entry.action === 'editar') {
                badgeColor = '#f59e0b'; // orange for editar
                badgeBg = 'rgba(245, 158, 11, 0.1)';
                actionTextLabel = 'Editar';
            } else if (entry.action === 'eliminar') {
                badgeColor = '#ef4444'; // red for eliminar
                badgeBg = 'rgba(239, 68, 68, 0.1)';
                actionTextLabel = 'Eliminar';
            }

            // Clean details (removing system prefix if present)
            let cleanDetails = entry.details || '';
            const systemPrefixes = ['[Canchas] ', '[Polideportivo] ', '[Bungalows] ', '[Locales] ', '[Asistencia] '];
            systemPrefixes.forEach(pref => {
                if (cleanDetails.startsWith(pref)) {
                    cleanDetails = cleanDetails.substring(pref.length);
                }
            });

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

// Utility to normalize times to 12-hour AM/PM format (removing seconds if any)
function formatTimeHHMM(timeStr) {
    if (!timeStr) return '';
    if (timeStr === '0' || timeStr === '00' || timeStr === 0) {
        return '12:00 am';
    }
    const parts = timeStr.split(':');
    if (parts.length >= 2) {
        let hour = parseInt(parts[0], 10);
        const min = parts[1].padStart(2, '0');
        const ampm = hour >= 12 ? 'pm' : 'am';
        hour = hour % 12;
        if (hour === 0) hour = 12;
        return `${hour}:${min} ${ampm}`;
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
    try {
        if (!allEvents || allEvents.length === 0) {
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

        function getMondayDateString(dateStr) {
            const parts = dateStr.split('-');
            if (parts.length < 3) return '9999-12-31';
            const year = parseInt(parts[0]);
            const month = parseInt(parts[1]) - 1;
            const day = parseInt(parts[2]);
            const d = new Date(year, month, day);
            const dayOfWeek = d.getDay();
            const mondayDiff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
            const mondayDate = new Date(d);
            mondayDate.setDate(d.getDate() + mondayDiff);

            const y = mondayDate.getFullYear();
            const m = String(mondayDate.getMonth() + 1).padStart(2, '0');
            const dd = String(mondayDate.getDate()).padStart(2, '0');
            return `${y}-${m}-${dd}`;
        }

        function getWeekRangeString(dateStr) {
            const parts = dateStr.split('-');
            if (parts.length < 3) return 'Otros';
            const year = parseInt(parts[0]);
            const month = parseInt(parts[1]) - 1;
            const day = parseInt(parts[2]);

            const mondayDate = new Date(year, month, day);
            const sundayDate = new Date(mondayDate);
            sundayDate.setDate(mondayDate.getDate() + 6);

            const formatOption = { day: 'numeric', month: 'long' };
            const formatter = new Intl.DateTimeFormat('es-ES', formatOption);

            const monStr = formatter.format(mondayDate);
            const sunStr = formatter.format(sundayDate);

            const capitalizeWords = str => str.replace(/(^\w|\s\w)/g, m => m.toUpperCase());

            const monYear = mondayDate.getFullYear();
            const sunYear = sundayDate.getFullYear();
            const yearStr = monYear === sunYear ? ` ${monYear}` : ` ${monYear}/${sunYear}`;

            return `Lunes ${capitalizeWords(monStr)} - Domingo ${capitalizeWords(sunStr)}${yearStr}`;
        }

        function getDailyLabel(dateStr) {
            const parts = dateStr.split('-');
            if (parts.length < 3) return dateStr;
            const year = parseInt(parts[0]);
            const month = parseInt(parts[1]) - 1;
            const day = parseInt(parts[2]);
            const d = new Date(year, month, day);

            const formatOption = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
            const formatter = new Intl.DateTimeFormat('es-ES', formatOption);
            const formatted = formatter.format(d);

            return formatted.replace(/(^\w|\s\w)/g, m => m.toUpperCase());
        }

        summaryWs.getColumn(1).width = 30;
        summaryWs.getColumn(2).width = 20;
        summaryWs.getColumn(3).width = 20;
        summaryWs.getColumn(4).width = 20;
        summaryWs.getColumn(5).width = 20;
        summaryWs.getColumn(6).width = 20;
        summaryWs.getColumn(7).width = 20;

        let sr = 1;
        const monthColorsS = ['FFFFFFFF', 'FFF8FAFC'];

        // Title Block
        summaryWs.mergeCells(sr, 1, sr, 7);
        const mainTitleCell = summaryWs.getCell(sr, 1);
        styleTitle(mainTitleCell, "REPORTE GENERAL DE RESERVAS Y ESTADÍSTICAS - POLIDEPORTIVO", 'FF0F766E', 'FFFFFFFF', 14);
        summaryWs.getRow(sr).height = 40;
        sr += 2; // Blank row

        // Group events by Month
        const groups = {};
        allEvents.forEach(e => {
            if (!e.date) return;
            const dateParts = e.date.split('-');
            if (dateParts.length < 2) return;
            const year = dateParts[0];
            const monthIndex = parseInt(dateParts[1]) - 1;
            const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
            const monthName = months[monthIndex] || 'Otros';
            const label = `${monthName} ${year}`;
            if (!groups[label]) {
                groups[label] = [];
            }
            groups[label].push(e);
        });

        // 1. Month Summary Block
        summaryWs.mergeCells(sr, 1, sr, 7);
        styleTitle(summaryWs.getCell(sr, 1), "INGRESOS Y USOS MENSUALES", 'FF334155', 'FFFFFFFF', 11);
        summaryWs.getRow(sr).height = 24; sr++;

        const headersM = ["Mes / Período", "Reservas", "Monto Cancha", "Monto Accesorios", "Total Facturado", "Efectivo", "Yape"];
        headersM.forEach((h, idx) => {
            styleTitle(summaryWs.getCell(sr, idx + 1), h, 'FF1E293B', 'FFFFFFFF', 10);
        });
        summaryWs.getRow(sr).height = 22; sr++;

        let grandTotalBookings = 0;
        let grandTotalCancha = 0;
        let grandTotalAcc = 0;
        let grandTotalSum = 0;
        let grandTotalEfectivo = 0;
        let grandTotalYape = 0;

        let rowIdx = 0;
        for (const [monthLabel, events] of Object.entries(groups)) {
            const bg = monthColorsS[rowIdx % 2];
            const activeEvents = events.filter(e => e.sport !== 'Bloqueo');

            let count = activeEvents.length;
            let cMonto = 0;
            let accMonto = 0;
            let tMonto = 0;
            let efectivoMonto = 0;
            let yapeMonto = 0;

            activeEvents.forEach(e => {
                const inc = getEventIncome(e);
                cMonto += inc.courtIncome;
                accMonto += inc.pelotaIncome + inc.chalecoIncome;
                tMonto += inc.total;

                const payType = e.tipo_pago || 'Efectivo';
                if (payType.startsWith('Dividido')) {
                    const split = parseSplitPayment(payType);
                    if (split) {
                        efectivoMonto += split.efectivo;
                        yapeMonto += split.yape;
                    } else {
                        const half = inc.total / 2;
                        efectivoMonto += half;
                        yapeMonto += half;
                    }
                } else if (payType === 'Yape') {
                    yapeMonto += inc.total;
                } else {
                    efectivoMonto += inc.total;
                }
            });

            grandTotalBookings += count;
            grandTotalCancha += cMonto;
            grandTotalAcc += accMonto;
            grandTotalSum += tMonto;
            grandTotalEfectivo += efectivoMonto;
            grandTotalYape += yapeMonto;

            const c1 = summaryWs.getCell(sr, 1);
            c1.value = monthLabel; c1.font = { name: 'Outfit', bold: true, size: 10, color: { argb: 'FF1E293B' } };
            c1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
            c1.alignment = { vertical: 'middle', horizontal: 'left' };
            c1.border = { top: { style: 'thin', color: { argb: 'FFE2E8F0' } }, left: { style: 'thin', color: { argb: 'FFE2E8F0' } }, bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }, right: { style: 'thin', color: { argb: 'FFE2E8F0' } } };

            styleValue(summaryWs.getCell(sr, 2), count, false);
            styleValue(summaryWs.getCell(sr, 3), cMonto, true);
            styleValue(summaryWs.getCell(sr, 4), accMonto, true);
            styleValue(summaryWs.getCell(sr, 5), tMonto, true);
            styleValue(summaryWs.getCell(sr, 6), efectivoMonto, true);
            styleValue(summaryWs.getCell(sr, 7), yapeMonto, true);

            // Apply row BG to values
            for (let col = 2; col <= 7; col++) {
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
        styleValue(summaryWs.getCell(sr, 3), grandTotalCancha, true);
        styleValue(summaryWs.getCell(sr, 4), grandTotalAcc, true);
        styleValue(summaryWs.getCell(sr, 5), grandTotalSum, true);
        styleValue(summaryWs.getCell(sr, 6), grandTotalEfectivo, true);
        styleValue(summaryWs.getCell(sr, 7), grandTotalYape, true);

        for (let col = 2; col <= 7; col++) {
            summaryWs.getCell(sr, col).font.color = { argb: 'FFFFFFFF' };
            summaryWs.getCell(sr, col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
        }
        summaryWs.getRow(sr).height = 22;
        sr += 3; // Blank rows

        const activeAll = allEvents.filter(e => e.sport !== 'Bloqueo');

        // 2. Cancha breakdown Block (grouped by Month)
        summaryWs.mergeCells(sr, 1, sr, 3);
        styleTitle(summaryWs.getCell(sr, 1), "INGRESOS POR TIPO DE CANCHA Y MES", 'FF334155', 'FFFFFFFF', 11);
        summaryWs.getRow(sr).height = 24; sr++;

        const headersC = ["Cancha", "Reservas", "Monto Canchas"];
        headersC.forEach((h, idx) => {
            styleTitle(summaryWs.getCell(sr, idx + 1), h, 'FF1E293B', 'FFFFFFFF', 10);
        });
        summaryWs.getRow(sr).height = 22; sr++;

        let cIdx = 0;
        for (const [monthLabel, events] of Object.entries(groups)) {
            // Subtle month separator row
            const cellMonth = summaryWs.getCell(sr, 1);
            cellMonth.value = `📅 ${monthLabel.toUpperCase()}`;
            cellMonth.font = { name: 'Outfit', bold: true, size: 10, color: { argb: 'FF0F766E' } };
            cellMonth.alignment = { vertical: 'middle', horizontal: 'left' };

            for (let col = 1; col <= 3; col++) {
                const cell = summaryWs.getCell(sr, col);
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                    left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                    bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                    right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
                };
            }
            summaryWs.getRow(sr).height = 22;
            sr++;

            const activeEvents = events.filter(e => e.sport !== 'Bloqueo');
            const courtsMap = {
                'Cancha Grande': { count: 0, income: 0 },
                'Cancha Pequeña': { count: 0, income: 0 },
                'Cancha de Vóley': { count: 0, income: 0 }
            };
            activeEvents.forEach(e => {
                const cType = e.court || 'Cancha Grande';
                const inc = getEventIncome(e);
                if (courtsMap[cType]) {
                    courtsMap[cType].count++;
                    courtsMap[cType].income += inc.courtIncome;
                }
            });

            [['Cancha Grande', courtsMap['Cancha Grande'].count, courtsMap['Cancha Grande'].income],
            ['Cancha Pequeña', courtsMap['Cancha Pequeña'].count, courtsMap['Cancha Pequeña'].income],
            ['Cancha de Vóley', courtsMap['Cancha de Vóley'].count, courtsMap['Cancha de Vóley'].income]].forEach(([courtLabel, cnt, inc], rIdx) => {
                const bg = monthColorsS[rIdx % 2];

                const cellCourt = summaryWs.getCell(sr, 1);
                cellCourt.value = courtLabel;
                cellCourt.font = { name: 'Outfit', bold: true, size: 10, color: { argb: 'FF1E293B' } };
                cellCourt.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
                cellCourt.alignment = { vertical: 'middle', horizontal: 'left' };
                cellCourt.border = {
                    top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                    left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                    bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                    right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
                };

                styleValue(summaryWs.getCell(sr, 2), cnt, false);
                styleValue(summaryWs.getCell(sr, 3), inc, true);

                for (let col = 2; col <= 3; col++) {
                    summaryWs.getCell(sr, col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
                }

                summaryWs.getRow(sr).height = 20;
                sr++;
            });

            cIdx++;
        }
        sr += 2;

        // 3. Accessories breakdown Block (grouped by Month)
        summaryWs.mergeCells(sr, 1, sr, 3);
        styleTitle(summaryWs.getCell(sr, 1), "ADICIONALES Y ACCESORIOS POR MES", 'FF334155', 'FFFFFFFF', 11);
        summaryWs.getRow(sr).height = 24; sr++;

        const headersA = ["Accesorio", "Usos", "Monto Alquiler"];
        headersA.forEach((h, idx) => {
            styleTitle(summaryWs.getCell(sr, idx + 1), h, 'FF1E293B', 'FFFFFFFF', 10);
        });
        summaryWs.getRow(sr).height = 22; sr++;

        let aIdx = 0;
        for (const [monthLabel, events] of Object.entries(groups)) {
            // Subtle month separator row
            const cellMonth = summaryWs.getCell(sr, 1);
            cellMonth.value = `📅 ${monthLabel.toUpperCase()}`;
            cellMonth.font = { name: 'Outfit', bold: true, size: 10, color: { argb: 'FF0F766E' } };
            cellMonth.alignment = { vertical: 'middle', horizontal: 'left' };

            for (let col = 1; col <= 3; col++) {
                const cell = summaryWs.getCell(sr, col);
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                    left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                    bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                    right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
                };
            }
            summaryWs.getRow(sr).height = 22;
            sr++;

            let pelotaCount = 0;
            let pelotaInc = 0;
            let chalecoCount = 0;
            let chalecoInc = 0;

            const activeEvents = events.filter(e => e.sport !== 'Bloqueo');
            activeEvents.forEach(e => {
                const inc = getEventIncome(e);
                if (e.pelota === true || e.pelota === 'true') {
                    pelotaCount++;
                    pelotaInc += inc.pelotaIncome;
                }
                if (e.chaleco === true || e.chaleco === 'true') {
                    chalecoCount++;
                    chalecoInc += inc.chalecoIncome;
                }
            });

            [['⚽ Pelota', pelotaCount, pelotaInc], ['🎽 Chalecos', chalecoCount, chalecoInc]].forEach(([label, cnt, inc], rIdx) => {
                const bg = monthColorsS[rIdx % 2];
                const c1 = summaryWs.getCell(sr, 1);
                c1.value = label; c1.font = { name: 'Outfit', bold: true, size: 10, color: { argb: 'FF1E293B' } };
                c1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
                c1.alignment = { vertical: 'middle', horizontal: 'left' };
                c1.border = { top: { style: 'thin', color: { argb: 'FFE2E8F0' } }, left: { style: 'thin', color: { argb: 'FFE2E8F0' } }, bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }, right: { style: 'thin', color: { argb: 'FFE2E8F0' } } };

                styleValue(summaryWs.getCell(sr, 2), cnt, false);
                styleValue(summaryWs.getCell(sr, 3), inc, true);

                summaryWs.getCell(sr, 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
                summaryWs.getCell(sr, 3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };

                summaryWs.getRow(sr).height = 20;
                sr++;
            });

            aIdx++;
        }

        // 4. Weekly Summary Block (Current Week Only)
        sr += 3;
        summaryWs.mergeCells(sr, 1, sr, 7);
        styleTitle(summaryWs.getCell(sr, 1), "INGRESOS Y USOS DE LA SEMANA ACTUAL", 'FF334155', 'FFFFFFFF', 11);
        summaryWs.getRow(sr).height = 24; sr++;

        const headersW = ["Semana / Período", "Reservas", "Monto Cancha", "Monto Accesorios", "Total Facturado", "Efectivo", "Yape"];
        headersW.forEach((h, idx) => {
            styleTitle(summaryWs.getCell(sr, idx + 1), h, 'FF1E293B', 'FFFFFFFF', 10);
        });
        summaryWs.getRow(sr).height = 22; sr++;

        // Get current week's Monday
        const todayObj = new Date();
        const currentY = todayObj.getFullYear();
        const currentM = String(todayObj.getMonth() + 1).padStart(2, '0');
        const currentD = String(todayObj.getDate()).padStart(2, '0');
        const todayStr = `${currentY}-${currentM}-${currentD}`;
        const currentMondayStr = getMondayDateString(todayStr);
        const currentWeekLabel = getWeekRangeString(currentMondayStr);

        const currentWeekEvents = activeAll.filter(e => e.date && getMondayDateString(e.date) === currentMondayStr);

        let wCount = currentWeekEvents.length;
        let wCancha = 0;
        let wAcc = 0;
        let wSum = 0;
        let wEfectivo = 0;
        let wYape = 0;

        currentWeekEvents.forEach(e => {
            const inc = getEventIncome(e);
            wCancha += inc.courtIncome;
            wAcc += inc.pelotaIncome + inc.chalecoIncome;
            wSum += inc.total;

            const payType = e.tipo_pago || 'Efectivo';
            if (payType.startsWith('Dividido')) {
                const split = parseSplitPayment(payType);
                if (split) {
                    wEfectivo += split.efectivo;
                    wYape += split.yape;
                } else {
                    const half = inc.total / 2;
                    wEfectivo += half;
                    wYape += half;
                }
            } else if (payType === 'Yape') {
                wYape += inc.total;
            } else {
                wEfectivo += inc.total;
            }
        });

        const cw1 = summaryWs.getCell(sr, 1);
        cw1.value = currentWeekLabel; cw1.font = { name: 'Outfit', bold: true, size: 10, color: { argb: 'FF1E293B' } };
        cw1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
        cw1.alignment = { vertical: 'middle', horizontal: 'left' };
        cw1.border = { top: { style: 'thin', color: { argb: 'FFE2E8F0' } }, left: { style: 'thin', color: { argb: 'FFE2E8F0' } }, bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }, right: { style: 'thin', color: { argb: 'FFE2E8F0' } } };

        styleValue(summaryWs.getCell(sr, 2), wCount, false);
        styleValue(summaryWs.getCell(sr, 3), wCancha, true);
        styleValue(summaryWs.getCell(sr, 4), wAcc, true);
        styleValue(summaryWs.getCell(sr, 5), wSum, true);
        styleValue(summaryWs.getCell(sr, 6), wEfectivo, true);
        styleValue(summaryWs.getCell(sr, 7), wYape, true);

        summaryWs.getRow(sr).height = 22;
        sr++;

        // 5. Daily Summary Block (Today Only)
        sr += 3;
        summaryWs.mergeCells(sr, 1, sr, 7);
        styleTitle(summaryWs.getCell(sr, 1), "INGRESOS Y USOS DEL DÍA DE HOY (DÍA DE LA DESCARGA)", 'FF334155', 'FFFFFFFF', 11);
        summaryWs.getRow(sr).height = 24; sr++;

        const headersD = ["Fecha / Día", "Reservas", "Monto Cancha", "Monto Accesorios", "Total Facturado", "Efectivo", "Yape"];
        headersD.forEach((h, idx) => {
            styleTitle(summaryWs.getCell(sr, idx + 1), h, 'FF1E293B', 'FFFFFFFF', 10);
        });
        summaryWs.getRow(sr).height = 22; sr++;

        const todayLabel = getDailyLabel(todayStr);
        const todayEvents = activeAll.filter(e => e.date === todayStr);

        let dCount = todayEvents.length;
        let dCancha = 0;
        let dAcc = 0;
        let dSum = 0;
        let dEfectivo = 0;
        let dYape = 0;

        todayEvents.forEach(e => {
            const inc = getEventIncome(e);
            dCancha += inc.courtIncome;
            dAcc += inc.pelotaIncome + inc.chalecoIncome;
            dSum += inc.total;

            const payType = e.tipo_pago || 'Efectivo';
            if (payType.startsWith('Dividido')) {
                const split = parseSplitPayment(payType);
                if (split) {
                    dEfectivo += split.efectivo;
                    dYape += split.yape;
                } else {
                    const half = inc.total / 2;
                    dEfectivo += half;
                    dYape += half;
                }
            } else if (payType === 'Yape') {
                dYape += inc.total;
            } else {
                dEfectivo += inc.total;
            }
        });

        const cd1 = summaryWs.getCell(sr, 1);
        cd1.value = todayLabel; cd1.font = { name: 'Outfit', bold: true, size: 10, color: { argb: 'FF1E293B' } };
        cd1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
        cd1.alignment = { vertical: 'middle', horizontal: 'left' };
        cd1.border = { top: { style: 'thin', color: { argb: 'FFE2E8F0' } }, left: { style: 'thin', color: { argb: 'FFE2E8F0' } }, bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }, right: { style: 'thin', color: { argb: 'FFE2E8F0' } } };

        styleValue(summaryWs.getCell(sr, 2), dCount, false);
        styleValue(summaryWs.getCell(sr, 3), dCancha, true);
        styleValue(summaryWs.getCell(sr, 4), dAcc, true);
        styleValue(summaryWs.getCell(sr, 5), dSum, true);
        styleValue(summaryWs.getCell(sr, 6), dEfectivo, true);
        styleValue(summaryWs.getCell(sr, 7), dYape, true);

        summaryWs.getRow(sr).height = 22;
        sr++;

        // ─── CLIENTS WORKSHEET ─────────────────────────────────────────
        const clientsWs = workbook.addWorksheet('👥 CLIENTES', { properties: { tabColor: { argb: 'FF10B981' } } });
        clientsWs.views = [{ showGridLines: true }];

        const clientColsDef = [
            { header: 'Nombre del Cliente', key: 'nombre', width: 35 },
            { header: 'DNI', key: 'dni', width: 16 },
            { header: 'Asesores que lo atendieron', key: 'asesores', width: 35 },
            { header: 'Medios de Contacto', key: 'medios', width: 30 },
            { header: 'Veces Alquiladas', key: 'cantidad', width: 18 }
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
        const clientsMap = {};
        const activeAllEvents = allEvents.filter(e => e.sport !== 'Bloqueo');
        activeAllEvents.forEach(e => {
            const name = capitalizeName(e.name || 'Desconocido');
            const dni = (e.dni || '').trim();
            const key = dni !== '' ? dni : `nodni_${name.toLowerCase()}`;

            if (!clientsMap[key]) {
                clientsMap[key] = {
                    name: name,
                    dni: dni,
                    advisors: new Set(),
                    medios: new Set(),
                    count: 0
                };
            }

            if (name !== 'Desconocido') {
                clientsMap[key].name = name;
            }

            const advisor = capitalizeName(e.notes || '');
            if (advisor && advisor.toLowerCase() !== 'sin asesor') {
                clientsMap[key].advisors.add(advisor);
            }

            const medio = (e.medio || '').trim();
            if (medio) {
                clientsMap[key].medios.add(medio);
            }

            clientsMap[key].count++;
        });

        const clientsList = Object.values(clientsMap).sort((a, b) => b.count - a.count);

        let clientRowNo = 2;
        clientsList.forEach(c => {
            const advisorsStr = Array.from(c.advisors).join(', ') || 'Sin asesor';
            const mediosStr = Array.from(c.medios).join(', ') || 'Ninguno';

            const dataRow = clientsWs.addRow({
                nombre: c.name,
                dni: c.dni || 'Sin DNI',
                asesores: advisorsStr,
                medios: mediosStr,
                cantidad: c.count
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
                if (colKey === 'dni' || colKey === 'cantidad') {
                    cell.alignment = { horizontal: 'center', vertical: 'middle' };
                } else {
                    cell.alignment = { horizontal: 'left', vertical: 'middle' };
                }
            });

            clientRowNo++;
        });

        clientsWs.autoFilter = `A1:E1`;

        // ─── DATA WORKSEETS ───────────────────────────────────────────
        const columnsDef = [
            { header: 'Fecha', key: 'fecha', width: 14 },
            { header: 'Hora Inicio', key: 'hora_inicio', width: 12 },
            { header: 'Hora Fin', key: 'hora_fin', width: 12 },
            { header: 'Cliente', key: 'cliente', width: 25 },
            { header: 'DNI', key: 'dni', width: 12 },
            { header: 'Cancha', key: 'cancha', width: 16 },
            { header: 'Deporte', key: 'deporte', width: 12 },
            { header: 'Asesor', key: 'asesor', width: 16 },
            { header: 'Pelota', key: 'pelota', width: 10 },
            { header: 'Chaleco', key: 'chaleco', width: 10 },
            { header: 'Medio de Contacto', key: 'medio', width: 18 },
            { header: 'Duracion (Horas)', key: 'duracion', width: 16 },
            { header: 'Monto Cancha (S/.)', key: 'monto_cancha', width: 18 },
            { header: 'Monto Pelota (S/.)', key: 'monto_pelota', width: 18 },
            { header: 'Monto Chaleco (S/.)', key: 'monto_chaleco', width: 18 },
            { header: 'Yape (S/.)', key: 'yape', width: 16 },
            { header: 'Efectivo (S/.)', key: 'efectivo', width: 16 },
            { header: 'Monto Total (S/.)', key: 'monto_total', width: 18 }
        ];

        for (const [monthLabel, eventsInMonth] of Object.entries(groups)) {
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
            eventsInMonth.forEach(e => {
                if (e.sport === 'Bloqueo') return;

                const inc = getEventIncome(e);

                const payType = e.tipo_pago || 'Efectivo';
                let payYape = 0;
                let payEfectivo = 0;
                if (payType.startsWith('Dividido')) {
                    const split = parseSplitPayment(payType);
                    if (split) {
                        payEfectivo = split.efectivo;
                        payYape = split.yape;
                    } else {
                        const half = inc.total / 2;
                        payEfectivo = half;
                        payYape = half;
                    }
                } else if (payType === 'Yape') {
                    payYape = inc.total;
                } else {
                    payEfectivo = inc.total;
                }

                const dataRow = worksheet.addRow({
                    fecha: e.date || '',
                    hora_inicio: e.start_time || '',
                    hora_fin: e.end_time || '',
                    cliente: capitalizeName(e.name || ''),
                    dni: e.dni || '',
                    cancha: e.court || '',
                    deporte: e.sport || '',
                    asesor: capitalizeName(e.notes || ''),
                    pelota: (e.pelota === true || e.pelota === 'true') ? 'Sí' : 'No',
                    chaleco: (e.chaleco === true || e.chaleco === 'true') ? 'Sí' : 'No',
                    medio: e.medio || '',
                    duracion: parseFloat(inc.durationHours.toFixed(2)),
                    monto_cancha: parseFloat(inc.courtIncome.toFixed(2)),
                    monto_pelota: parseFloat(inc.pelotaIncome.toFixed(2)),
                    monto_chaleco: parseFloat(inc.chalecoIncome.toFixed(2)),
                    yape: payYape > 0 ? parseFloat(payYape.toFixed(2)) : '-',
                    efectivo: payEfectivo > 0 ? parseFloat(payEfectivo.toFixed(2)) : '-',
                    monto_total: parseFloat(inc.total.toFixed(2))
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
                    if (['fecha', 'hora_inicio', 'hora_fin', 'dni', 'pelota', 'chaleco', 'medio'].includes(colKey)) {
                        cell.alignment = { horizontal: 'center', vertical: 'middle' };
                    } else if (['duracion', 'monto_cancha', 'monto_pelota', 'monto_chaleco', 'yape', 'efectivo', 'monto_total'].includes(colKey)) {
                        cell.alignment = { horizontal: 'right', vertical: 'middle' };
                        if (colKey !== 'duracion') {
                            cell.numFmt = '"S/. "#,##0.00';
                        }
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
            link.download = 'Reporte_Reservas_Polideportivo.xlsx';
            link.click();
        }).catch(err => {
            console.error("Error al exportar:", err);
            alert("Ocurrió un error al generar el archivo Excel: " + err.message);
        });
    } catch (err) {
        console.error("Error crítico al exportar:", err);
        alert("Error crítico al exportar Excel: " + (err.stack || err.message));
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
    if (e.sport === 'Bloqueo') {
        return {
            durationHours: 0,
            courtIncome: 0,
            pelotaIncome: 0,
            chalecoIncome: 0,
            total: 0
        };
    }

    let courtRate = 0;
    const courtStr = String(e.court || '');
    if (courtStr.includes('Grande')) {
        courtRate = parseFloat(localStorage.getItem('canchapro_rate_grande_poli') || '30');
    } else if (courtStr.includes('Pequeña')) {
        courtRate = parseFloat(localStorage.getItem('canchapro_rate_pequena_poli') || '30');
    } else if (courtStr.includes('Vóley')) {
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

    const todayEvents = allEvents.filter(e => getBusinessDate(e.date, e.start_time) === todayStr && e.sport !== 'Bloqueo');
    const weekEvents = allEvents.filter(e => isSameBusinessWeek(getBusinessDate(e.date, e.start_time), todayStr) && e.sport !== 'Bloqueo');
    const monthEvents = allEvents.filter(e => getBusinessDate(e.date, e.start_time).startsWith(currentMonthPrefix) && e.sport !== 'Bloqueo');

    // Calculate historical/previous periods
    // Yesterday
    const currentDate = new Date(todayStr + 'T12:00:00');
    const yesterday = new Date(currentDate);
    yesterday.setDate(currentDate.getDate() - 1);
    const yesterdayStr = formatISOString(yesterday).substring(0, 10);
    const yesterdayEvents = allEvents.filter(e => getBusinessDate(e.date, e.start_time) === yesterdayStr && e.sport !== 'Bloqueo');
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
        return d >= prevMondayStr && d <= prevSundayStr && e.sport !== 'Bloqueo';
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
    const prevMonthEvents = allEvents.filter(e => getBusinessDate(e.date, e.start_time).startsWith(prevMonthPrefix) && e.sport !== 'Bloqueo');
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
        if (payType.startsWith('Dividido')) {
            const split = parseSplitPayment(payType);
            if (split) {
                if (split.yape > 0) {
                    metrics.Yape.today.count++;
                    metrics.Yape.today.income += split.yape;
                }
                if (split.efectivo > 0) {
                    metrics.Efectivo.today.count++;
                    metrics.Efectivo.today.income += split.efectivo;
                }
            } else {
                const half = inc.total / 2;
                metrics.Yape.today.count++;
                metrics.Yape.today.income += half;
                metrics.Efectivo.today.count++;
                metrics.Efectivo.today.income += half;
            }
        } else if (payType === 'Yape') {
            metrics.Yape.today.count++;
            metrics.Yape.today.income += inc.total;
        } else {
            metrics.Efectivo.today.count++;
            metrics.Efectivo.today.income += inc.total;
        }

        if (e.court && e.court.includes('Grande')) {
            metrics.Grande.today.count++;
            metrics.Grande.today.hours += inc.durationHours;
            metrics.Grande.today.income += inc.courtIncome;
        } else if (e.court && e.court.includes('Pequeña')) {
            metrics.Pequena.today.count++;
            metrics.Pequena.today.hours += inc.durationHours;
            metrics.Pequena.today.income += inc.courtIncome;
        } else if (e.court && e.court.includes('Vóley')) {
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
        if (payType.startsWith('Dividido')) {
            const split = parseSplitPayment(payType);
            if (split) {
                if (split.yape > 0) {
                    metrics.Yape.week.count++;
                    metrics.Yape.week.income += split.yape;
                }
                if (split.efectivo > 0) {
                    metrics.Efectivo.week.count++;
                    metrics.Efectivo.week.income += split.efectivo;
                }
            } else {
                const half = inc.total / 2;
                metrics.Yape.week.count++;
                metrics.Yape.week.income += half;
                metrics.Efectivo.week.count++;
                metrics.Efectivo.week.income += half;
            }
        } else if (payType === 'Yape') {
            metrics.Yape.week.count++;
            metrics.Yape.week.income += inc.total;
        } else {
            metrics.Efectivo.week.count++;
            metrics.Efectivo.week.income += inc.total;
        }

        if (e.court && e.court.includes('Grande')) {
            metrics.Grande.week.count++;
            metrics.Grande.week.hours += inc.durationHours;
            metrics.Grande.week.income += inc.courtIncome;
        } else if (e.court && e.court.includes('Pequeña')) {
            metrics.Pequena.week.count++;
            metrics.Pequena.week.hours += inc.durationHours;
            metrics.Pequena.week.income += inc.courtIncome;
        } else if (e.court && e.court.includes('Vóley')) {
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
        if (payType.startsWith('Dividido')) {
            const split = parseSplitPayment(payType);
            if (split) {
                if (split.yape > 0) {
                    metrics.Yape.month.count++;
                    metrics.Yape.month.income += split.yape;
                }
                if (split.efectivo > 0) {
                    metrics.Efectivo.month.count++;
                    metrics.Efectivo.month.income += split.efectivo;
                }
            } else {
                const half = inc.total / 2;
                metrics.Yape.month.count++;
                metrics.Yape.month.income += half;
                metrics.Efectivo.month.count++;
                metrics.Efectivo.month.income += half;
            }
        } else if (payType === 'Yape') {
            metrics.Yape.month.count++;
            metrics.Yape.month.income += inc.total;
        } else {
            metrics.Efectivo.month.count++;
            metrics.Efectivo.month.income += inc.total;
        }

        if (e.court && e.court.includes('Grande')) {
            metrics.Grande.month.count++;
            metrics.Grande.month.hours += inc.durationHours;
            metrics.Grande.month.income += inc.courtIncome;
        } else if (e.court && e.court.includes('Pequeña')) {
            metrics.Pequena.month.count++;
            metrics.Pequena.month.hours += inc.durationHours;
            metrics.Pequena.month.income += inc.courtIncome;
        } else if (e.court && e.court.includes('Vóley')) {
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

    // Calculate range strings
    const monthsShort = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

    // Today
    const formattedToday = `${currentDate.getDate()} ${monthsShort[currentDate.getMonth()]}`;

    // Week (Monday of current business week to Sunday)
    const currentSunday = new Date(currentMonday);
    currentSunday.setDate(currentMonday.getDate() + 6);
    const weekRangeStr = `${currentMonday.getDate()} ${monthsShort[currentMonday.getMonth()]} al ${currentSunday.getDate()} ${monthsShort[currentSunday.getMonth()]}`;

    // Month (1st of the month to currentDate/today)
    const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const monthRangeStr = `${firstDayOfMonth.getDate()} ${monthsShort[firstDayOfMonth.getMonth()]} al ${currentDate.getDate()} ${monthsShort[currentDate.getMonth()]}`;

    // Update dashboard labels & comparisons
    document.getElementById('statsIncomeToday').textContent = `S/. ${metrics.Total.today.income.toFixed(2)}`;
    document.getElementById('statsCountToday').textContent = `${metrics.Total.today.count} reservas (${formattedToday})`;
    document.getElementById('statsCompareToday').innerHTML = renderCompareBadge(metrics.Total.today.income, yesterdayIncome);

    document.getElementById('statsIncomeWeek').textContent = `S/. ${metrics.Total.week.income.toFixed(2)}`;
    document.getElementById('statsCountWeek').textContent = `${metrics.Total.week.count} reservas (${weekRangeStr})`;
    document.getElementById('statsCompareWeek').innerHTML = renderCompareBadge(metrics.Total.week.income, prevWeekIncome);

    document.getElementById('statsIncomeMonth').textContent = `S/. ${metrics.Total.month.income.toFixed(2)}`;
    document.getElementById('statsCountMonth').textContent = `${metrics.Total.month.count} reservas (${monthRangeStr})`;
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
            if (cleaned.includes('whatsapp') || cleaned.includes('masivo') || cleaned.includes('wsp')) return 'Msg masivo';
            if (cleaned.includes('facebook')) return 'Facebook';
            if (cleaned.includes('instagram')) return 'Instagram';
            if (cleaned.includes('tiktok')) return 'TikTok';
            if (cleaned.includes('cliente frecuente')) return 'Cliente frecuente';
            if (cleaned.includes('recomendación') || cleaned.includes('recomendacion')) return 'Recomendación';
            return 'Otros';
        };

        const channels = ['Msg masivo', 'Facebook', 'Instagram', 'TikTok', 'Cliente frecuente', 'Recomendación', 'Otros'];
        const channelCounts = {
            'Msg masivo': { today: 0, week: 0, month: 0 },
            Facebook: { today: 0, week: 0, month: 0 },
            Instagram: { today: 0, week: 0, month: 0 },
            TikTok: { today: 0, week: 0, month: 0 },
            'Cliente frecuente': { today: 0, week: 0, month: 0 },
            'Recomendación': { today: 0, week: 0, month: 0 },
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
                if (ch === 'Msg masivo') color = '#25d366';
                else if (ch === 'Facebook') color = '#1877f2';
                else if (ch === 'Instagram') color = '#e1306c';
                else if (ch === 'TikTok') color = '#00f2fe';
                else if (ch === 'Cliente frecuente') color = '#f59e0b';
                else if (ch === 'Recomendación') color = '#a78bfa';

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
            if (e.sport === 'Bloqueo') return;
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

window.toggleClientDetails = function (detailId) {
    const detailRow = document.getElementById(detailId);
    if (detailRow) {
        const isVisible = detailRow.style.display === 'table-row';
        detailRow.style.display = isVisible ? 'none' : 'table-row';
    }
};



