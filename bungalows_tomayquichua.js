// ==========================================
// CanchaPro - Bungalows Tomayquichua JS Logic
// ==========================================

let dbMode = 'local';
let supabaseClient = null;
let calendar = null;
let allEvents = [];

// DOM Elements
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const statusDesc = document.getElementById('statusDesc');

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

