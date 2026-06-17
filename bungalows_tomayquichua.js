// ==========================================
// CanchaPro - Bungalows Tomayquichua JS Logic
// ==========================================

let dbMode = 'local';
let supabaseClient = null;
let calendar = null;
let allEvents = [];
let cachedClientsData = [];
let currentClientsFilter = '';
let statsCountdownInterval = null;

// DOM Elements
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const statusDesc = document.getElementById('statusDesc');

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

const modalBooking = document.getElementById('modalBooking');
const formBooking = document.getElementById('formBooking');
const modalTitle = document.getElementById('modalTitle');
const bookingIdInput = document.getElementById('bookingId');
const bookingNameInput = document.getElementById('bookingName');
const bookingDniInput = document.getElementById('bookingDni');
const bookingCourtInput = document.getElementById('bookingCourt');
const bookingSportInput = document.getElementById('bookingSport');
const bookingDateInput = document.getElementById('bookingDate');
const bookingStartTimeInput = document.getElementById('bookingStartTime');
const bookingEndTimeInput = document.getElementById('bookingEndTime');
const bookingNotesInput = document.getElementById('bookingNotes');
const bookingPelotaInput = document.getElementById('bookingPelota');
const bookingChalecoInput = document.getElementById('bookingChaleco');
const bookingSourceInput = document.getElementById('bookingSource');
const bookingSourceCustomInput = document.getElementById('bookingSourceCustom');
const customSourceGroup = document.getElementById('customSourceGroup');
const bookingPaymentTypeInput = document.getElementById('bookingPaymentType');
const bookingError = document.getElementById('bookingError');

const btnNewReservation = document.getElementById('btnNewReservation');
const btnCloseBooking = document.getElementById('btnCloseBooking');
const btnDeleteBooking = document.getElementById('btnDeleteBooking');
const btnCopyReservation = document.getElementById('btnCopyReservation');

const modalSettings = document.getElementById('modalSettings');
const btnOpenSettings = document.getElementById('btnOpenSettings');
const btnCloseSettings = document.getElementById('btnCloseSettings');
const formSettings = document.getElementById('formSettings');
const supabaseUrlInput = document.getElementById('supabaseUrl');
const supabaseKeyInput = document.getElementById('supabaseKey');
const settingsFeedback = document.getElementById('settingsFeedback');
const btnTestSupabase = document.getElementById('btnTestSupabase');

const modalHistory = document.getElementById('modalHistory');
const btnOpenHistory = document.getElementById('btnOpenHistory');
const btnCloseHistory = document.getElementById('btnCloseHistory');
const activityList = document.getElementById('activityList');

const modalUserOnboarding = document.getElementById('modalUserOnboarding');
const formUserOnboarding = document.getElementById('formUserOnboarding');
const onboardingNameInput = document.getElementById('onboardingName');
const displayUserName = document.getElementById('displayUserName');
const btnEditUser = document.getElementById('btnEditUser');

// Sidebar filters for 6 bungalows
const filterB1 = document.getElementById('filterB1');
const filterB2 = document.getElementById('filterB2');
const filterB3 = document.getElementById('filterB3');
const filterB4 = document.getElementById('filterB4');
const filterB5 = document.getElementById('filterB5');
const filterB6 = document.getElementById('filterB6');

const filterHospedaje = document.getElementById('filterHospedaje');
const filterPasadia = document.getElementById('filterPasadia');

const statTodayReservations = document.getElementById('statTodayReservations');
const statPart1 = document.getElementById('statPart1');
const statPart2 = document.getElementById('statPart2');

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    lucide.createIcons();
    checkOperatorIdentity();
    loadDatabaseSettings();
    initCalendar();
    setupEventListeners();
    updateStats();
    fetchAndRenderHistory();
});

// Initialize FullCalendar
function initCalendar() {
    const calendarEl = document.getElementById('calendar');
    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        locale: 'es',
        firstDay: 1, // Start week on Monday
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,dayGridWeek,listWeek'
        },
        buttonText: {
            today: 'Hoy',
            month: 'Mes',
            week: 'Semana',
            day: 'Lista'
        },
        editable: false,
        height: 'auto',
        nowIndicator: true,
        selectable: true,
        selectMirror: true,
        datesSet: function () {
            updateDailySummary();
        },
        events: function (fetchInfo, successCallback, failureCallback) {
            fetchBookings().then(bookings => {
                allEvents = bookings;
                updateStats();
                updateDailySummary();

                const filtered = filterEvents(bookings);

                const fcEvents = filtered.map(b => {
                    const { start, end } = getReservationInterval(b.date, b.start_time, b.end_time, b.sport);
                    
                    // Assign class depending on bungalow number
                    let bungalowClass = 'event-bungalow-1';
                    if (b.court === 'Bungalow 2') bungalowClass = 'event-bungalow-2';
                    else if (b.court === 'Bungalow 3') bungalowClass = 'event-bungalow-3';
                    else if (b.court === 'Bungalow 4') bungalowClass = 'event-bungalow-4';
                    else if (b.court === 'Bungalow 5') bungalowClass = 'event-bungalow-5';
                    else if (b.court === 'Bungalow 6') bungalowClass = 'event-bungalow-6';

                    let typeClass = b.sport === 'Día y Noche' ? 'event-type-hospedaje' : 'event-type-pasadia';
                    const emoji = b.sport === 'Día y Noche' ? '🌙' : '☀️';
                    const sportTag = b.sport === 'Día y Noche' ? '[D&N]' : '[FD]';
                    const breakfastEmoji = b.pelota === true || b.pelota === 'true' ? ' 🍳' : '';

                    return {
                        id: b.id,
                        title: `${emoji} ${sportTag} ${b.name} (${b.court})${breakfastEmoji}`,
                        start: start.toISOString(),
                        end: end.toISOString(),
                        className: `${bungalowClass} ${typeClass}`,
                        extendedProps: b
                    };
                });
                successCallback(fcEvents);
            }).catch(err => {
                console.error("Error cargando reservas:", err);
                failureCallback(err);
            });
        },
        select: function (selectionInfo) {
            const startDateObj = new Date(selectionInfo.startStr);
            const endDateObj = new Date(selectionInfo.endStr);
            const dateStr = selectionInfo.startStr.split('T')[0];
            const startTimeStr = formatTime(startDateObj);
            const endTimeStr = formatTime(endDateObj);

            openBookingModal(null, {
                date: dateStr,
                start_time: startTimeStr,
                end_time: endTimeStr
            });
        },
        eventClick: function (info) {
            if (info.jsEvent) info.jsEvent.stopPropagation();
            openBookingModal(info.event.extendedProps);
        }
    });
    calendar.render();
}

function formatTime(date) {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

// Event Listeners
function setupEventListeners() {
    btnNewReservation.addEventListener('click', () => openBookingModal());
    btnCloseBooking.addEventListener('click', closeBookingModal);
    btnDeleteBooking.addEventListener('click', handleDeleteBooking);
    
    const btnThemeToggle = document.getElementById('btnThemeToggle');
    if (btnThemeToggle) {
        btnThemeToggle.addEventListener('click', toggleTheme);
    }
    btnCopyReservation.addEventListener('click', handleCopyReservation);
    formBooking.addEventListener('submit', handleSaveBooking);

    btnOpenSettings.addEventListener('click', () => {
        openModal(modalSettings);
        settingsFeedback.className = 'settings-feedback';
        settingsFeedback.textContent = '';
    });
    btnCloseSettings.addEventListener('click', () => closeModal(modalSettings));
    btnTestSupabase.addEventListener('click', testSupabaseConnection);
    formSettings.addEventListener('submit', handleSaveSettings);

    [filterB1, filterB2, filterB3, filterB4, filterB5, filterB6, filterHospedaje, filterPasadia].forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            if (calendar) calendar.refetchEvents();
        });
    });

    if (formUserOnboarding) {
        formUserOnboarding.addEventListener('submit', handleSaveOnboardingName);
    }
    if (btnEditUser) {
        btnEditUser.addEventListener('click', openOperatorEditModal);
    }

    if (btnOpenHistory) {
        btnOpenHistory.addEventListener('click', () => {
            openModal(modalHistory);
            fetchAndRenderHistory();
        });
    }
    if (btnCloseHistory) {
        btnCloseHistory.addEventListener('click', () => closeModal(modalHistory));
    }

    if (bookingSportInput) {
        bookingSportInput.addEventListener('change', updateTimesForSport);
    }
    const extraHoursInput = document.getElementById('bookingExtraHours');
    if (extraHoursInput) {
        extraHoursInput.addEventListener('input', updateTimesForSport);
    }

    setupToggleListeners('pelota');
    setupToggleListeners('chaleco');

    if (bookingSourceInput && customSourceGroup && bookingSourceCustomInput) {
        bookingSourceInput.addEventListener('change', () => {
            if (bookingSourceInput.value === 'Otro...') {
                customSourceGroup.classList.remove('hidden');
                bookingSourceCustomInput.required = true;
                bookingSourceCustomInput.focus();
            } else {
                customSourceGroup.classList.add('hidden');
                bookingSourceCustomInput.required = false;
            }
        });
    }

    const selectAsesor = document.getElementById('bookingNotes');
    const customAsesorGroup = document.getElementById('customAsesorGroup');
    const customAsesorInput = document.getElementById('bookingNotesCustom');
    if (selectAsesor && customAsesorGroup && customAsesorInput) {
        selectAsesor.addEventListener('change', () => {
            if (selectAsesor.value === 'Otro...') {
                customAsesorGroup.classList.remove('hidden');
                customAsesorInput.required = true;
                customAsesorInput.focus();
            } else {
                customAsesorGroup.classList.add('hidden');
                customAsesorInput.required = false;
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
}

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

function setupToggleListeners(type) {
    const toggleGroup = document.getElementById(`${type}Toggle`);
    if (!toggleGroup) return;
    const buttons = toggleGroup.querySelectorAll('.btn-toggle');
    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            setToggleValue(type, btn.getAttribute('data-value') === 'true');
        });
    });
}

function populateAsesoresDropdown(selectedValue = '') {
    const select = document.getElementById('bookingNotes');
    if (!select) return;
    select.innerHTML = '';
    const advisors = new Set();
    const currentUser = localStorage.getItem('canchapro_user_name');
    if (currentUser) advisors.add(currentUser);

    allEvents.forEach(e => {
        if (e.notes && e.notes.trim() && e.notes !== 'Otro...') {
            advisors.add(e.notes.trim());
        }
    });

    advisors.forEach(adv => {
        const option = document.createElement('option');
        option.value = adv;
        option.textContent = adv;
        select.appendChild(option);
    });

    const optionOtro = document.createElement('option');
    optionOtro.value = 'Otro...';
    optionOtro.textContent = 'Otro... (Escribir nombre)';
    select.appendChild(optionOtro);

    const customGroup = document.getElementById('customAsesorGroup');
    if (selectedValue && !advisors.has(selectedValue) && selectedValue !== 'Otro...') {
        const optionCustom = document.createElement('option');
        optionCustom.value = selectedValue;
        optionCustom.textContent = selectedValue;
        select.insertBefore(optionCustom, optionOtro);
        select.value = selectedValue;
        customGroup.classList.add('hidden');
    } else if (selectedValue) {
        select.value = selectedValue;
        if (selectedValue === 'Otro...') customGroup.classList.remove('hidden');
    } else {
        if (currentUser && advisors.has(currentUser)) select.value = currentUser;
        customGroup.classList.add('hidden');
    }
}

function getReservationInterval(dateStr, startTimeStr, endTimeStr, sport) {
    const start = new Date(`${dateStr}T${startTimeStr}`);
    let end = new Date(`${dateStr}T${endTimeStr}`);
    if (sport === 'Día y Noche') {
        end.setDate(end.getDate() + 1);
    } else if (end <= start) {
        end.setDate(end.getDate() + 1);
    }
    return { start, end };
}

function parseExtraHoursToMinutes(val) {
    if (!val) return 0;
    val = val.trim();
    if (val.includes(':')) {
        const parts = val.split(':');
        const h = parseInt(parts[0], 10) || 0;
        const m = parseInt(parts[1], 10) || 0;
        return h * 60 + m;
    }
    const num = parseFloat(val);
    if (!isNaN(num)) {
        return Math.round(num * 60);
    }
    return 0;
}

function calculateExtraHours(sport, startTime, endTime) {
    if (!startTime || !endTime) return "0";
    const [startH, startM] = startTime.split(':').map(Number);
    let [endH, endM] = endTime.split(':').map(Number);
    
    const startTotal = startH * 60 + startM;
    let endTotal = endH * 60 + endM;
    
    let baseEndTotal = 12 * 60; // Día y Noche defaults to 12:00
    if (sport === 'Full Day') {
        baseEndTotal = 18 * 60; // Full Day defaults to 18:00
        if (endTotal < baseEndTotal) {
            endTotal += 24 * 60; // Add 24 hours if crossed midnight
        }
    } else {
        if (endTotal < baseEndTotal) {
            endTotal += 24 * 60; // If end time is earlier than 12:00 (e.g. 02:00 AM next day)
        }
    }
    
    const diffMins = Math.max(0, endTotal - baseEndTotal);
    if (diffMins === 0) return "0";
    
    const h = Math.floor(diffMins / 60);
    const m = diffMins % 60;
    if (m === 0) {
        return String(h);
    }
    return `${h}:${String(m).padStart(2, '0')}`;
}

function updateTimesForSport() {
    const sport = bookingSportInput.value;
    const extraHoursInput = document.getElementById('bookingExtraHours');
    const extraMins = parseExtraHoursToMinutes(extraHoursInput ? extraHoursInput.value : '0');
    
    let startHour = 15;
    let startMin = 0;
    let endHour = 12;
    let endMin = 0;
    
    if (sport === 'Full Day') {
        startHour = 9;
        endHour = 18;
    }
    
    const totalEndMins = endHour * 60 + endMin + extraMins;
    const finalEndHour = Math.floor(totalEndMins / 60);
    const finalEndMin = totalEndMins % 60;
    
    const formattedStart = String(startHour).padStart(2, '0') + ':00';
    const formattedEnd = String(finalEndHour % 24).padStart(2, '0') + ':' + String(finalEndMin).padStart(2, '0');
    
    bookingStartTimeInput.value = formattedStart;
    bookingEndTimeInput.value = formattedEnd;
    bookingStartTimeInput.readOnly = true;
    bookingEndTimeInput.readOnly = true;
}

function openBookingModal(booking = null, defaults = null) {
    formBooking.reset();
    bookingError.style.display = 'none';

    if (booking) {
        modalTitle.textContent = 'Editar Reserva';
        bookingIdInput.value = booking.id;
        bookingNameInput.value = booking.name;
        bookingDniInput.value = booking.dni || '';
        bookingCourtInput.value = booking.court;
        bookingSportInput.value = booking.sport;
        bookingDateInput.value = booking.date;
        bookingStartTimeInput.value = booking.start_time;
        bookingEndTimeInput.value = booking.end_time;
        
        const extraHoursInput = document.getElementById('bookingExtraHours');
        if (extraHoursInput) {
            extraHoursInput.value = calculateExtraHours(booking.sport, booking.start_time, booking.end_time);
        }
        updateTimesForSport();

        populateAsesoresDropdown(booking.notes || '');
        setToggleValue('pelota', booking.pelota === true || booking.pelota === 'true');
        setToggleValue('chaleco', booking.chaleco === true || booking.chaleco === 'true');

        if (bookingSourceInput && customSourceGroup && bookingSourceCustomInput) {
            const savedMedio = booking.medio || 'WhatsApp';
            const standards = ['Facebook', 'TikTok', 'Instagram', 'WhatsApp'];
            if (standards.includes(savedMedio)) {
                bookingSourceInput.value = savedMedio;
                customSourceGroup.classList.add('hidden');
            } else {
                bookingSourceInput.value = 'Otro...';
                customSourceGroup.classList.remove('hidden');
                bookingSourceCustomInput.value = savedMedio;
            }
        }
        if (bookingPaymentTypeInput) {
            bookingPaymentTypeInput.value = booking.tipo_pago || 'Transferencia';
        }
        btnDeleteBooking.classList.remove('hidden');
    } else {
        modalTitle.textContent = 'Nueva Reserva';
        bookingIdInput.value = '';
        btnDeleteBooking.classList.add('hidden');

        setToggleValue('pelota', false);
        setToggleValue('chaleco', false);
        const extraHoursSelect = document.getElementById('bookingExtraHours');
        if (extraHoursSelect) {
            extraHoursSelect.value = '0';
        }

        if (defaults) {
            bookingDateInput.value = defaults.date;
            if (defaults.start_time) {
                const hour = parseInt(defaults.start_time.split(':')[0], 10);
                if (hour >= 13) {
                    bookingSportInput.value = 'Día y Noche';
                } else {
                    bookingSportInput.value = 'Full Day';
                }
            } else {
                bookingSportInput.value = 'Día y Noche';
            }
        } else {
            bookingDateInput.value = new Date().toISOString().split('T')[0];
            bookingSportInput.value = 'Día y Noche';
        }
        updateTimesForSport();
        populateAsesoresDropdown(localStorage.getItem('canchapro_user_name') || '');
    }
    openModal(modalBooking);
}

function closeBookingModal() {
    closeModal(modalBooking);
}

function openModal(modal) {
    modal.classList.add('active');
}

function closeModal(modal) {
    modal.classList.remove('active');
}

async function fetchBookings() {
    let bookings = [];
    if (dbMode === 'supabase' && supabaseClient) {
        try {
            const { data, error } = await supabaseClient
                .from('reservas')
                .select('*')
                .eq('negocio', 'Tomayquichua')
                .order('date', { ascending: true });

            if (error) throw error;
            bookings = data || [];
        } catch (err) {
            console.error("Fallo Supabase, usando local:", err);
            bookings = getLocalBookings();
        }
    } else {
        bookings = getLocalBookings();
    }
    
    // Filter to only include Bungalows to prevent data contamination from other complexes or legacy test records
    const bungalowCourts = ['Bungalow 1', 'Bungalow 2', 'Bungalow 3', 'Bungalow 4', 'Bungalow 5', 'Bungalow 6'];
    return bookings.filter(b => bungalowCourts.includes(b.court));
}

function getLocalBookings() {
    const data = localStorage.getItem('canchapro_reservas_tomay');
    return data ? JSON.parse(data) : [];
}

function saveLocalBookings(bookings) {
    localStorage.setItem('canchapro_reservas_tomay', JSON.stringify(bookings));
}

function filterEvents(bookings) {
    return bookings.filter(b => {
        let courtMatch = false;
        if (b.court === 'Bungalow 1' && filterB1.checked) courtMatch = true;
        else if (b.court === 'Bungalow 2' && filterB2.checked) courtMatch = true;
        else if (b.court === 'Bungalow 3' && filterB3.checked) courtMatch = true;
        else if (b.court === 'Bungalow 4' && filterB4.checked) courtMatch = true;
        else if (b.court === 'Bungalow 5' && filterB5.checked) courtMatch = true;
        else if (b.court === 'Bungalow 6' && filterB6.checked) courtMatch = true;

        const typeMatch = (b.sport === 'Día y Noche' && filterHospedaje.checked) ||
            (b.sport === 'Full Day' && filterPasadia.checked);

        return courtMatch && typeMatch;
    });
}

function checkOverlaps(id, court, date, startTime, endTime) {
    const sport = bookingSportInput.value;
    const { start, end } = getReservationInterval(date, startTime, endTime, sport);

    for (const event of allEvents) {
        if (event.id === id) continue;
        if (event.court === court) {
            const { start: eStart, end: eEnd } = getReservationInterval(event.date, event.start_time, event.end_time, event.sport);
            if (start < eEnd && end > eStart) {
                return `El "${court}" ya está ocupado en ese horario.`;
            }
        }
    }
    return null;
}

async function handleSaveBooking(e) {
    e.preventDefault();
    bookingError.style.display = 'none';

    const id = bookingIdInput.value || crypto.randomUUID();
    const name = bookingNameInput.value.trim();
    const dni = bookingDniInput.value.trim();
    const court = bookingCourtInput.value;
    const sport = bookingSportInput.value;
    const date = bookingDateInput.value;
    const startTime = bookingStartTimeInput.value;
    const endTime = bookingEndTimeInput.value;
    let notes = bookingNotesInput.value;
    if (notes === 'Otro...') notes = document.getElementById('bookingNotesCustom').value.trim();
    let medio = bookingSourceInput.value;
    if (medio === 'Otro...') medio = bookingSourceCustomInput.value.trim();
    const pelota = bookingPelotaInput.value === 'true';
    const chaleco = bookingChalecoInput.value === 'true';
    const tipo_pago = bookingPaymentTypeInput.value;

    const overlap = checkOverlaps(bookingIdInput.value, court, date, startTime, endTime);
    if (overlap) {
        bookingError.textContent = overlap;
        bookingError.style.display = 'block';
        return;
    }

    const bookingData = {
        id, name, dni, court, sport, date,
        start_time: startTime, end_time: endTime,
        notes, pelota, chaleco, medio, tipo_pago,
        negocio: 'Tomayquichua'
    };

    try {
        if (dbMode === 'supabase' && supabaseClient) {
            let query = bookingIdInput.value ?
                supabaseClient.from('reservas').update(bookingData).eq('id', id) :
                supabaseClient.from('reservas').insert([bookingData]);

            const { error } = await query;
            if (error) throw error;
        } else {
            let local = getLocalBookings();
            local = bookingIdInput.value ? local.map(b => b.id === id ? bookingData : b) : [...local, bookingData];
            saveLocalBookings(local);
        }

        closeBookingModal();
        if (calendar) calendar.refetchEvents();
        updateStats();
    } catch (err) {
        bookingError.textContent = "Error: " + err.message;
        bookingError.style.display = 'block';
    }
}

async function handleDeleteBooking() {
    const id = bookingIdInput.value;
    if (!id || !confirm("¿Eliminar esta reserva?")) return;

    try {
        if (dbMode === 'supabase' && supabaseClient) {
            const { error } = await supabaseClient.from('reservas').delete().eq('id', id);
            if (error) throw error;
        } else {
            const filtered = getLocalBookings().filter(b => b.id !== id);
            saveLocalBookings(filtered);
        }
        closeBookingModal();
        if (calendar) calendar.refetchEvents();
        updateStats();
    } catch (err) {
        alert("Error al eliminar: " + err.message);
    }
}

function handleCopyReservation() {
    const name = bookingNameInput.value.trim();
    const dni = bookingDniInput.value.trim();
    const court = bookingCourtInput.value;
    const date = bookingDateInput.value;
    const start = bookingStartTimeInput.value;
    const end = bookingEndTimeInput.value;
    const payment = bookingPaymentTypeInput.value;
    const extraHoursSelect = document.getElementById('bookingExtraHours');
    const extraHours = parseInt(extraHoursSelect ? extraHoursSelect.value : '0', 10);

    let horarioMsg = `${start} - ${end}`;
    if (bookingSportInput.value === 'Día y Noche') {
        const [y, m, d] = date.split('-').map(Number);
        const checkInDate = new Date(y, m - 1, d);
        const checkOutDate = new Date(checkInDate);
        checkOutDate.setDate(checkOutDate.getDate() + 1);
        const checkOutYear = checkOutDate.getFullYear();
        const checkOutMonth = String(checkOutDate.getMonth() + 1).padStart(2, '0');
        const checkOutDay = String(checkOutDate.getDate()).padStart(2, '0');
        const checkOutDateStr = `${checkOutYear}-${checkOutMonth}-${checkOutDay}`;
        horarioMsg = `${start} del ${date} hasta las ${end} del ${checkOutDateStr}`;
    }

    let extraMsg = '';
    if (extraHours > 0) {
        extraMsg = `\nHoras Extras: +${extraHours} h`;
    }

    const msg = `*RESERVA BUNGALOWS DE TOMAYQUICHUA*
Nombre: ${name}
DNI: ${dni}
Bungalow: ${court}
Fecha: ${date}
Horario: ${horarioMsg}${extraMsg}
Pago: ${payment}
Por favor conserve sus llaves. ¡Que disfrute su estancia!`;

    navigator.clipboard.writeText(msg).then(() => {
        btnCopyReservation.textContent = "¡Copiado!";
        setTimeout(() => btnCopyReservation.innerHTML = '<i data-lucide="copy"></i> Copiar Detalles', 2000);
        lucide.createIcons();
    });
}

function parseTimeToMinutes(t) {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
}

function updateStats() {
    const today = new Date().toISOString().split('T')[0];
    const todays = allEvents.filter(e => e.date === today);
    statTodayReservations.textContent = todays.length;

    let part1Hrs = 0; // Bungalow 1, 2, 3
    let part2Hrs = 0; // Bungalow 4, 5, 6

    todays.forEach(e => {
        const { start, end } = getReservationInterval(e.date, e.start_time, e.end_time);
        const hrs = (end - start) / (1000 * 60 * 60); // Difference in hours
        
        if (e.court === 'Bungalow 1' || e.court === 'Bungalow 2' || e.court === 'Bungalow 3') {
            part1Hrs += hrs;
        } else if (e.court === 'Bungalow 4' || e.court === 'Bungalow 5' || e.court === 'Bungalow 6') {
            part2Hrs += hrs;
        }
    });

    statPart1.textContent = part1Hrs + " h";
    statPart2.textContent = part2Hrs + " h";
}

function updateDailySummary() {
    const dateLabel = document.getElementById('summaryDateLabel');
    if (!dateLabel) return;
    const dateStr = calendar ? calendar.getDate().toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
    dateLabel.textContent = dateStr;

    const list = document.getElementById('dailySummaryList');
    if (!list) return;
    list.innerHTML = '';

    const dayBookings = allEvents.filter(e => e.date === dateStr);
    if (dayBookings.length === 0) {
        list.innerHTML = '<div style="color:var(--text-muted);font-size:14px;">No hay reservas para este día.</div>';
        return;
    }

    dayBookings.forEach(b => {
        const div = document.createElement('div');
        div.style.padding = '12px';
        div.style.borderBottom = '1px solid var(--border-color)';
        div.style.fontSize = '14px';
        div.style.display = 'flex';
        div.style.alignItems = 'center';
        div.style.justifyContent = 'space-between';
        div.style.flexWrap = 'wrap';
        div.style.gap = '8px';

        const isHospedaje = b.sport === 'Día y Noche';
        const badgeStyle = isHospedaje 
            ? 'background: rgba(56, 189, 248, 0.12); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3);'
            : 'background: rgba(249, 115, 22, 0.12); color: #f97316; border: 1px solid rgba(249, 115, 22, 0.3);';
        const badgeText = isHospedaje ? '🌙 Día y Noche' : '☀️ Full Day';

        div.innerHTML = `
            <div>
                <strong>${b.start_time} - ${b.end_time}</strong>: ${b.name} 
                <span style="color: var(--text-muted); margin-left: 6px;">(${b.court})</span>
            </div>
            <span style="${badgeStyle} padding: 2px 8px; border-radius: 100px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; display: inline-flex; align-items: center; gap: 4px;">
                ${badgeText}
            </span>
        `;
        list.appendChild(div);
    });
}

function loadDatabaseSettings() {
    let url = localStorage.getItem('canchapro_supabase_url_tomay');
    let key = localStorage.getItem('canchapro_supabase_key_tomay');
    if (!url || !key) {
        url = localStorage.getItem('canchapro_supabase_url');
        key = localStorage.getItem('canchapro_supabase_key');
    }

    if (url && key) {
        supabaseUrlInput.value = url;
        supabaseKeyInput.value = key;
        try {
            supabaseClient = supabase.createClient(url, key);
            dbMode = 'supabase';
            statusDot.className = 'status-dot connected';
            statusText.textContent = 'Conectado a la Nube (Tomayquichua)';
            statusDesc.textContent = 'Sincronizando reservas en tiempo real.';
        } catch (e) {
            console.error(e);
            dbMode = 'local';
            statusDot.className = 'status-dot disconnected';
        }
    } else {
        dbMode = 'local';
        statusDot.className = 'status-dot disconnected';
        statusText.textContent = 'Modo Local (Sin Conexión)';
    }
}

async function testSupabaseConnection() {
    const url = supabaseUrlInput.value.trim();
    const key = supabaseKeyInput.value.trim();
    settingsFeedback.textContent = "Probando...";
    try {
        const testClient = supabase.createClient(url, key);
        const { error } = await testClient.from('reservas').select('id').limit(1);
        if (error) throw error;
        settingsFeedback.textContent = "Conexión Exitosa ✓";
        settingsFeedback.className = "settings-feedback success";
    } catch (e) {
        settingsFeedback.textContent = "Error: " + e.message;
        settingsFeedback.className = "settings-feedback error";
    }
}

function handleSaveSettings(e) {
    e.preventDefault();
    const url = supabaseUrlInput.value.trim();
    const key = supabaseKeyInput.value.trim();
    localStorage.setItem('canchapro_supabase_url_tomay', url);
    localStorage.setItem('canchapro_supabase_key_tomay', key);
    closeModal(modalSettings);
    loadDatabaseSettings();
    if (calendar) calendar.refetchEvents();
}

function checkOperatorIdentity() {
    let name = localStorage.getItem('canchapro_user_name');
    if (!name) {
        openModal(modalUserOnboarding);
    } else {
        displayUserName.textContent = name;
    }
}

function handleSaveOnboardingName(e) {
    e.preventDefault();
    const name = onboardingNameInput.value.trim();
    localStorage.setItem('canchapro_user_name', name);
    displayUserName.textContent = name;
    closeModal(modalUserOnboarding);
}

function openOperatorEditModal() {
    onboardingNameInput.value = localStorage.getItem('canchapro_user_name') || '';
    openModal(modalUserOnboarding);
}

function fetchAndRenderHistory() {
    activityList.innerHTML = '<p class="no-activity">Historial local activo en localStorage.</p>';
}

// Theme Toggle Logic
function toggleTheme() {
    const isDark = document.body.classList.toggle('dark-theme');
    localStorage.setItem('canchapro_theme_tomay', isDark ? 'dark' : 'light');
    updateThemeUI(isDark);
}

function updateThemeUI(isDark) {
    const btnThemeToggle = document.getElementById('btnThemeToggle');
    if (!btnThemeToggle) return;
    
    const icon = btnThemeToggle.querySelector('i');
    const text = btnThemeToggle.querySelector('.btn-text');
    
    if (isDark) {
        if (icon) icon.setAttribute('data-lucide', 'sun');
        if (text) text.textContent = 'Modo Rústico';
        btnThemeToggle.title = 'Cambiar a Modo Rústico Claro';
    } else {
        if (icon) icon.setAttribute('data-lucide', 'moon');
        if (text) text.textContent = 'Modo Noche';
        btnThemeToggle.title = 'Cambiar a Modo Noche Oscuro';
    }
    
    // Refresh icons via Lucide
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

function initTheme() {
    const savedTheme = localStorage.getItem('canchapro_theme_tomay');
    const isDark = (savedTheme === 'dark');
    if (isDark) {
        document.body.classList.add('dark-theme');
    } else {
        document.body.classList.remove('dark-theme');
    }
    updateThemeUI(isDark);
}

// ==========================================
// Statistics & Earnings Logic
// ==========================================
function escapeHTML(str) {
    if (!str) return '';
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function getBusinessDate(dateStr) {
    return dateStr;
}

function getCurrentBusinessDate() {
    return new Date().toISOString().split('T')[0];
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

function formatTimeHHMM(timeStr) {
    if (!timeStr) return '';
    return timeStr.substring(0, 5);
}

function getEventIncome(e) {
    const rateMonThu = parseFloat(localStorage.getItem('canchapro_rate_mon_thu') || '160');
    const rateFriSun = parseFloat(localStorage.getItem('canchapro_rate_fri_sun') || '180');
    const rateBreakfast = parseFloat(localStorage.getItem('canchapro_rate_breakfast') || '15');

    const parts = e.date.split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const dateObj = new Date(year, month, day);
    const dayOfWeek = dateObj.getDay();

    let stayRate = rateMonThu;
    if (dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === 0) { // Friday, Saturday, Sunday
        stayRate = rateFriSun;
    }

    const courtIncome = stayRate;
    const pelotaIncome = (e.pelota === true || e.pelota === 'true') ? rateBreakfast : 0;

    return {
        durationHours: 0,
        courtIncome,
        pelotaIncome,
        chalecoIncome: 0,
        total: courtIncome + pelotaIncome
    };
}

function handleOpenStatsClick() {
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
    tabButtons.forEach(b => b.classList.remove('active'));
    tabContents.forEach(c => {
        c.classList.remove('active');
        c.style.display = 'none';
    });

    const reportTabBtn = document.querySelector('[data-tab="tab-report"]');
    if (reportTabBtn) reportTabBtn.classList.add('active');
    const reportTabContent = document.getElementById('tab-report');
    if (reportTabContent) {
        reportTabContent.classList.add('active');
        reportTabContent.style.display = 'block';
    }

    buildRatesForm();
    updateStatsDashboard();
    openModal(modalStats);
}

function buildRatesForm() {
    if (!ratesFormRow) return;
    ratesFormRow.innerHTML = `
        <div class="form-group">
            <label for="rateMonThu">Tarifa Lunes a Jueves (S/.) *</label>
            <div class="input-wrapper">
                <i data-lucide="dollar-sign"></i>
                <input type="number" id="rateMonThu" required min="0" step="1" value="${localStorage.getItem('canchapro_rate_mon_thu') || '160'}">
            </div>
        </div>
        <div class="form-group">
            <label for="rateFriSun">Tarifa Viernes a Domingo (S/.) *</label>
            <div class="input-wrapper">
                <i data-lucide="dollar-sign"></i>
                <input type="number" id="rateFriSun" required min="0" step="1" value="${localStorage.getItem('canchapro_rate_fri_sun') || '180'}">
            </div>
        </div>
        <div class="form-group">
            <label for="rateBreakfast">Alquiler de Desayuno (S/.) *</label>
            <div class="input-wrapper">
                <i data-lucide="dollar-sign"></i>
                <input type="number" id="rateBreakfast" required min="0" step="0.5" value="${localStorage.getItem('canchapro_rate_breakfast') || '15'}">
            </div>
        </div>
    `;
    if (window.lucide) lucide.createIcons();
}

function handleStatsRatesSave(e) {
    e.preventDefault();
    const rMonThu = document.getElementById('rateMonThu').value;
    const rFriSun = document.getElementById('rateFriSun').value;
    const rBreakfast = document.getElementById('rateBreakfast').value;

    localStorage.setItem('canchapro_rate_mon_thu', rMonThu);
    localStorage.setItem('canchapro_rate_fri_sun', rFriSun);
    localStorage.setItem('canchapro_rate_breakfast', rBreakfast);

    statsRatesFeedback.className = 'settings-feedback success';
    statsRatesFeedback.textContent = '¡Tarifas guardadas y aplicadas con éxito! ✅';
    statsRatesFeedback.style.display = 'block';

    updateStatsDashboard();

    setTimeout(() => {
        statsRatesFeedback.style.display = 'none';
    }, 2000);
}

function updateStatsDashboard() {
    const todayStr = getCurrentBusinessDate();
    const currentMonthPrefix = todayStr.substring(0, 7);

    const todayEvents = allEvents.filter(e => getBusinessDate(e.date) === todayStr);
    const weekEvents = allEvents.filter(e => isSameBusinessWeek(getBusinessDate(e.date), todayStr));
    const monthEvents = allEvents.filter(e => getBusinessDate(e.date).startsWith(currentMonthPrefix));

    // Previous periods calculations
    const currentDate = new Date(todayStr + 'T12:00:00');
    const yesterday = new Date(currentDate);
    yesterday.setDate(currentDate.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    const yesterdayEvents = allEvents.filter(e => getBusinessDate(e.date) === yesterdayStr);
    let yesterdayIncome = 0;
    yesterdayEvents.forEach(e => { yesterdayIncome += getEventIncome(e).total; });

    const currentDay = currentDate.getDay();
    const diffToMonday = currentDay === 0 ? -6 : 1 - currentDay;
    const currentMonday = new Date(currentDate);
    currentMonday.setDate(currentDate.getDate() + diffToMonday);
    const prevMonday = new Date(currentMonday);
    prevMonday.setDate(currentMonday.getDate() - 7);
    const prevSunday = new Date(prevMonday);
    prevSunday.setDate(prevMonday.getDate() + 6);
    const prevMondayStr = prevMonday.toISOString().split('T')[0];
    const prevSundayStr = prevSunday.toISOString().split('T')[0];
    const prevWeekEvents = allEvents.filter(e => {
        const d = getBusinessDate(e.date);
        return d >= prevMondayStr && d <= prevSundayStr;
    });
    let prevWeekIncome = 0;
    prevWeekEvents.forEach(e => { prevWeekIncome += getEventIncome(e).total; });

    const currentYear = parseInt(currentMonthPrefix.split('-')[0], 10);
    const currentMonth = parseInt(currentMonthPrefix.split('-')[1], 10);
    let prevYear = currentYear;
    let prevMonth = currentMonth - 1;
    if (prevMonth === 0) {
        prevMonth = 12;
        prevYear--;
    }
    const prevMonthPrefix = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
    const prevMonthEvents = allEvents.filter(e => getBusinessDate(e.date).startsWith(prevMonthPrefix));
    let prevMonthIncome = 0;
    prevMonthEvents.forEach(e => { prevMonthIncome += getEventIncome(e).total; });

    // Initializing structure for the 6 Bungalows
    const courtsList = ['Bungalow 1', 'Bungalow 2', 'Bungalow 3', 'Bungalow 4', 'Bungalow 5', 'Bungalow 6'];
    const metrics = {
        Extras: { today: 0, week: 0, month: 0 },
        Total: { today: { count: 0, income: 0 }, week: { count: 0, income: 0 }, month: { count: 0, income: 0 } },
        Yape: { today: { count: 0, income: 0 }, week: { count: 0, income: 0 }, month: { count: 0, income: 0 } },
        Transferencia: { today: { count: 0, income: 0 }, week: { count: 0, income: 0 }, month: { count: 0, income: 0 } }
    };
    
    courtsList.forEach(c => {
        metrics[c] = {
            today: { count: 0, income: 0 },
            week: { count: 0, income: 0 },
            month: { count: 0, income: 0 }
        };
    });

    // Populate Today
    todayEvents.forEach(e => {
        const inc = getEventIncome(e);
        metrics.Total.today.count++;
        metrics.Total.today.income += inc.total;
        metrics.Extras.today += inc.pelotaIncome;

        const payType = e.tipo_pago === 'Yape' ? 'Yape' : 'Transferencia';
        metrics[payType].today.count++;
        metrics[payType].today.income += inc.total;

        if (metrics[e.court]) {
            metrics[e.court].today.count++;
            metrics[e.court].today.income += inc.courtIncome;
        }
    });

    // Populate Week
    weekEvents.forEach(e => {
        const inc = getEventIncome(e);
        metrics.Total.week.count++;
        metrics.Total.week.income += inc.total;
        metrics.Extras.week += inc.pelotaIncome;

        const payType = e.tipo_pago === 'Yape' ? 'Yape' : 'Transferencia';
        metrics[payType].week.count++;
        metrics[payType].week.income += inc.total;

        if (metrics[e.court]) {
            metrics[e.court].week.count++;
            metrics[e.court].week.income += inc.courtIncome;
        }
    });

    // Populate Month
    monthEvents.forEach(e => {
        const inc = getEventIncome(e);
        metrics.Total.month.count++;
        metrics.Total.month.income += inc.total;
        metrics.Extras.month += inc.pelotaIncome;

        const payType = e.tipo_pago === 'Yape' ? 'Yape' : 'Transferencia';
        metrics[payType].month.count++;
        metrics[payType].month.income += inc.total;

        if (metrics[e.court]) {
            metrics[e.court].month.count++;
            metrics[e.court].month.income += inc.courtIncome;
        }
    });

    // Helper comparison badge
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

    // Dashboard values
    document.getElementById('statsIncomeToday').textContent = `S/. ${metrics.Total.today.income.toFixed(2)}`;
    document.getElementById('statsCountToday').textContent = `${metrics.Total.today.count} reservas`;
    document.getElementById('statsCompareToday').innerHTML = renderCompareBadge(metrics.Total.today.income, yesterdayIncome);

    document.getElementById('statsIncomeWeek').textContent = `S/. ${metrics.Total.week.income.toFixed(2)}`;
    document.getElementById('statsCountWeek').textContent = `${metrics.Total.week.count} reservas`;
    document.getElementById('statsCompareWeek').innerHTML = renderCompareBadge(metrics.Total.week.income, prevWeekIncome);

    document.getElementById('statsIncomeMonth').textContent = `S/. ${metrics.Total.month.income.toFixed(2)}`;
    document.getElementById('statsCountMonth').textContent = `${metrics.Total.month.count} reservas`;
    document.getElementById('statsCompareMonth').innerHTML = renderCompareBadge(metrics.Total.month.income, prevMonthIncome);

    // Month Capacity (6 Bungalows * 1 stay per day)
    const totalMonthCount = monthEvents.length;
    const capacityDaily = 6;
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const capacityMonthly = capacityDaily * daysInMonth;
    const occupationPct = capacityMonthly > 0 ? ((totalMonthCount / capacityMonthly) * 100).toFixed(1) : '0.0';

    document.getElementById('statsOcupacionMonth').textContent = `${occupationPct}%`;
    document.getElementById('statsDurationMonth').textContent = `Reservas: ${totalMonthCount}`;

    // Render table breakdown rows
    const tbody = document.getElementById('statsBreakdownTableBody');
    if (tbody) {
        let rowsHtml = '';
        courtsList.forEach(c => {
            rowsHtml += `
                <tr>
                    <td>
                        <strong style="color: var(--text-primary);">${c}</strong><br>
                        <span style="font-size: 11px; color: var(--text-muted);">Ingresos / Cantidad</span>
                    </td>
                    <td style="text-align: right;">
                        <strong>S/. ${metrics[c].today.income.toFixed(2)}</strong><br>
                        <span style="font-size: 11px; color: var(--text-muted);">${metrics[c].today.count} res.</span>
                    </td>
                    <td style="text-align: right;">
                        <strong>S/. ${metrics[c].week.income.toFixed(2)}</strong><br>
                        <span style="font-size: 11px; color: var(--text-muted);">${metrics[c].week.count} res.</span>
                    </td>
                    <td style="text-align: right;">
                        <strong>S/. ${metrics[c].month.income.toFixed(2)}</strong><br>
                        <span style="font-size: 11px; color: var(--text-muted);">${metrics[c].month.count} res.</span>
                    </td>
                </tr>
            `;
        });
        
        // Extras
        rowsHtml += `
            <tr>
                <td>
                    <strong style="color: var(--text-primary);">Extras (Desayunos)</strong><br>
                    <span style="font-size: 11px; color: var(--text-muted);">Servicios adicionales</span>
                </td>
                <td style="text-align: right;">
                    <strong>S/. ${metrics.Extras.today.toFixed(2)}</strong>
                </td>
                <td style="text-align: right;">
                    <strong>S/. ${metrics.Extras.week.toFixed(2)}</strong>
                </td>
                <td style="text-align: right;">
                    <strong>S/. ${metrics.Extras.month.toFixed(2)}</strong>
                </td>
            </tr>
        `;

        // Total
        rowsHtml += `
            <tr style="background: rgba(27, 76, 51, 0.08); font-weight: 600; border-top: 1px solid var(--primary);">
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

        // Payment type headers
        rowsHtml += `
            <tr style="border-top: 2px solid var(--border-color); background: rgba(255, 255, 255, 0.01);">
                <td colspan="4" style="padding: 8px 16px; font-weight: 600; color: var(--text-secondary); font-size: 12px; text-transform: uppercase;">
                    Resumen por Tipo de Pago
                </td>
            </tr>
        `;

        // Yape
        rowsHtml += `
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
        `;

        // Transferencia
        rowsHtml += `
            <tr>
                <td>
                    <strong style="color: #fbbf24;">Transferencia</strong><br>
                    <span style="font-size: 11px; color: var(--text-muted);">Pagos bancarios</span>
                </td>
                <td style="text-align: right;">
                    <strong>S/. ${metrics.Transferencia.today.income.toFixed(2)}</strong><br>
                    <span style="font-size: 11px; color: var(--text-muted);">${metrics.Transferencia.today.count} res.</span>
                </td>
                <td style="text-align: right;">
                    <strong>S/. ${metrics.Transferencia.week.income.toFixed(2)}</strong><br>
                    <span style="font-size: 11px; color: var(--text-muted);">${metrics.Transferencia.week.count} res.</span>
                </td>
                <td style="text-align: right;">
                    <strong>S/. ${metrics.Transferencia.month.income.toFixed(2)}</strong><br>
                    <span style="font-size: 11px; color: var(--text-muted);">${metrics.Transferencia.month.count} res.</span>
                </td>
            </tr>
        `;

        tbody.innerHTML = rowsHtml;
    }

    // Advisors Calculations
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

    sortedAdvisors.sort((a, b) => b.month.income - a.month.income || b.month.count - a.month.count);

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
                const todayCountLabel = adv.today.count === 1 ? '1 reserva' : `${adv.today.count} reservas`;
                const weekCountLabel = adv.week.count === 1 ? '1 reserva' : `${adv.week.count} reservas`;
                const monthCountLabel = adv.month.count === 1 ? '1 reserva' : `${adv.month.count} reservas`;
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

    // Media & Channel & Clients VIP Calculations
    const statsMediosTbody = document.getElementById('statsMediosTableBody');
    const statsEquipamientoTbody = document.getElementById('statsEquipamientoTableBody');
    const statsHorasPicoList = document.getElementById('statsHorasPicoList');
    const statsClientesVipList = document.getElementById('statsClientesVipList');
    const statsDiasDemandaContainer = document.getElementById('statsDiasDemandaContainer');

    if (statsMediosTbody || statsEquipamientoTbody || statsHorasPicoList || statsClientesVipList || statsDiasDemandaContainer) {
        // Channels
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

        // Breakfasts
        const eqCounts = {
            Breakfasts: { today: 0, week: 0, month: 0 }
        };

        todayEvents.forEach(e => {
            if (e.pelota === true || e.pelota === 'true') eqCounts.Breakfasts.today++;
        });
        weekEvents.forEach(e => {
            if (e.pelota === true || e.pelota === 'true') eqCounts.Breakfasts.week++;
        });
        monthEvents.forEach(e => {
            if (e.pelota === true || e.pelota === 'true') eqCounts.Breakfasts.month++;
        });

        if (statsEquipamientoTbody) {
            statsEquipamientoTbody.innerHTML = `
                <tr style="border-bottom: 1px solid var(--border-color);">
                    <td style="padding: 10px 4px;"><strong style="color: #fbbf24;">🍳 Desayunos</strong></td>
                    <td style="padding: 10px 4px; text-align: right;"><strong>${eqCounts.Breakfasts.today}</strong></td>
                    <td style="padding: 10px 4px; text-align: right;"><strong>${eqCounts.Breakfasts.week}</strong></td>
                    <td style="padding: 10px 4px; text-align: right;"><strong>${eqCounts.Breakfasts.month}</strong></td>
                </tr>
            `;
        }

        // Stay type distribution (Full Day vs Día y Noche)
        if (statsHorasPicoList) {
            const stayCounts = { 'Día y Noche': 0, 'Full Day': 0 };
            monthEvents.forEach(e => {
                if (e.sport === 'Día y Noche' || e.sport === 'Full Day') {
                    stayCounts[e.sport] = (stayCounts[e.sport] || 0) + 1;
                }
            });
            const sortedStays = Object.keys(stayCounts)
                .map(k => ({ stay: k, count: stayCounts[k] }))
                .sort((a, b) => b.count - a.count);

            statsHorasPicoList.innerHTML = sortedStays.map((ss, idx) => {
                const label = ss.count === 1 ? '1 reserva' : `${ss.count} reservas`;
                const icon = ss.stay === 'Día y Noche' ? '🌙' : '☀️';
                return `
                    <li>
                        <span style="font-weight: 600; color: var(--primary);">${idx + 1}. ${icon} ${ss.stay}</span> 
                        <span style="color: var(--text-secondary);"> - ${label}</span>
                    </li>
                `;
            }).join('');
        }

        // VIP clients
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

        // Weekday demand
        if (statsDiasDemandaContainer) {
            const daysOfWeekNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
            const weekdayStats = daysOfWeekNames.map(name => ({ name, count: 0, income: 0 }));
            monthEvents.forEach(e => {
                const dateObj = new Date(e.date + 'T12:00:00');
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
                            <div style="width: ${pct}%; background: linear-gradient(90deg, var(--primary), #fbbf24); height: 100%; border-radius: 3px;"></div>
                        </div>
                    </div>
                `;
            }).join('') || '<div style="color: var(--text-muted); font-size: 13px;">No hay reservas este mes.</div>';
        }

        // Consolidated Clients List
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
                tipo_pago: e.tipo_pago || 'Transferencia'
            });
        });

        cachedClientsData = Array.from(clientsMap.values()).map(c => {
            c.bookings.sort((a, b) => b.date.localeCompare(a.date));
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
        
        const courtPrefs = Object.entries(c.courts)
            .map(([court, count]) => `<li><strong>${court}:</strong> ${count} ${count === 1 ? 'reserva' : 'reservas'}</li>`)
            .join('');

        const historyRows = c.bookings.slice(0, 10).map(b => {
            const dateParts = b.date.split('-');
            const formattedDate = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
            const timeRange = `${b.start_time} - ${b.end_time}`;
            return `
                <tr style="border-bottom: 1px dashed rgba(255,255,255,0.05);">
                    <td style="padding: 6px 8px; text-align: left;">${formattedDate}</td>
                    <td style="padding: 6px 8px; text-align: left;">${timeRange}</td>
                    <td style="padding: 6px 8px; text-align: left; color: var(--text-primary); font-weight: 500;">${b.court}</td>
                    <td style="padding: 6px 8px; text-align: right; color: #34d399; font-weight: 600;">S/. ${b.income.toFixed(2)}</td>
                    <td style="padding: 6px 8px; text-align: center; color: var(--text-muted); font-size: 10px;">${b.tipo_pago || 'Transferencia'}</td>
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
                                <i data-lucide="layout-grid" style="width: 14px; height: 14px;"></i> Preferencia de Bungalows
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
                                            <th style="padding: 6px 8px; text-align: left;">Bungalow</th>
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
            attrs: { class: 'lucide' },
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


