// ==========================================================================
// Nuevo Horizonte - Control de Asistencias (JavaScript Modern Engine)
// Reconstrucción desde cero: Lógica de Horarios, Tardanzas, Extras y Sincronización
// ==========================================================================

let dbMode = 'local'; // 'supabase' o 'local'
let supabaseClient = null;
let realtimeChannel = null;

// Application State
let activeWorkers = []; // [{ name: 'Rogger', emoji: '🚬🗿', is_active: true }]
let workerSchedules = {}; // { 'Rogger': { lunes: { active: true, in: '08:00', out: '16:30', lunch: true, netMinutes: 450 }, ... , weeklyTarget: 45 } }
let attendanceRecords = []; // All attendance records loaded
let selectedWorker = null; // Currently selected worker object
let isPunchInProgress = false;

// DOM Element References
const liveClockEl = document.getElementById('liveClock');
const liveDateEl = document.getElementById('liveDate');
const statusDotEl = document.getElementById('statusDot');
const statusTextEl = document.getElementById('statusText');
const statusDescEl = document.getElementById('statusDesc');

const employeeSelect = document.getElementById('employeeSelect');
const workerScheduleBanner = document.getElementById('workerScheduleBanner');
const badgeScheduleDay = document.getElementById('badgeScheduleDay');
const workerScheduleHours = document.getElementById('workerScheduleHours');
const workerScheduleLunchInfo = document.getElementById('workerScheduleLunchInfo');

const employeeStatusBox = document.getElementById('employeeStatusBox');
const earlyCheckinCard = document.getElementById('earlyCheckinCard');
const earlyCheckinCheckbox = document.getElementById('earlyCheckinCheckbox');
const earlyCheckinTitle = document.getElementById('earlyCheckinTitle');
const earlyCheckinDesc = document.getElementById('earlyCheckinDesc');

const lunchToggleGroup = document.getElementById('lunchToggleGroup');
const lunchCheckbox = document.getElementById('lunchCheckbox');
const btnToggleAttendance = document.getElementById('btnToggleAttendance');
const btnPunchText = document.getElementById('btnPunchText');

// Right Collapsible Stats Panel
const attendanceLayout = document.getElementById('attendanceLayout');
const btnToggleStatsPanel = document.getElementById('btnToggleStatsPanel');
const iconToggleStats = document.getElementById('iconToggleStats');
const textToggleStats = document.getElementById('textToggleStats');

const progressEmployeeTitle = document.getElementById('progressEmployeeTitle');
const lblSelectedWorkerMeta = document.getElementById('lblSelectedWorkerMeta');
const progressPercentageText = document.getElementById('progressPercentageText');
const weeklyGoalHoursText = document.getElementById('weeklyGoalHoursText');
const goalProgressBar = document.getElementById('goalProgressBar');

const metricWorkedHours = document.getElementById('metricWorkedHours');
const metricLateHours = document.getElementById('metricLateHours');
const metricOwedHours = document.getElementById('metricOwedHours');
const metricExtraHours = document.getElementById('metricExtraHours');
const metricJustifiedHours = document.getElementById('metricJustifiedHours');
const btnEditWorkerSchedule = document.getElementById('btnEditWorkerSchedule');
const btnDeleteWorker = document.getElementById('btnDeleteWorker');

// History Table & Filters
const filterEmployee = document.getElementById('filterEmployee');
const filterMonth = document.getElementById('filterMonth');
const filterWeek = document.getElementById('filterWeek');
const filterType = document.getElementById('filterType');
const attendanceTableBody = document.getElementById('attendanceTableBody');
const btnExportExcel = document.getElementById('btnExportExcel');

// Wizard Elements
const btnOpenAddWorkerModal = document.getElementById('btnOpenAddWorkerModal');
const modalAddWorkerWizard = document.getElementById('modalAddWorkerWizard');
const btnCloseAddWorkerWizard = document.getElementById('btnCloseAddWorkerWizard');
const newWorkerNameInput = document.getElementById('newWorkerName');
const emojiPickerGrid = document.getElementById('emojiPickerGrid');
const selectedWorkerEmojiInput = document.getElementById('selectedWorkerEmoji');
const workerPreviewText = document.getElementById('workerPreviewText');

const stepIndicator1 = document.getElementById('stepIndicator1');
const stepIndicator2 = document.getElementById('stepIndicator2');
const stepIndicator3 = document.getElementById('stepIndicator3');
const wizardPage1 = document.getElementById('wizardPage1');
const wizardPage2 = document.getElementById('wizardPage2');
const wizardPage3 = document.getElementById('wizardPage3');

const btnWizardNext1 = document.getElementById('btnWizardNext1');
const btnWizardBack2 = document.getElementById('btnWizardBack2');
const btnWizardSave = document.getElementById('btnWizardSave');
const btnWizardFinish = document.getElementById('btnWizardFinish');
const scheduleDaysContainer = document.getElementById('scheduleDaysContainer');
const wizardTotalWeeklyHours = document.getElementById('wizardTotalWeeklyHours');
const wizardSuccessMsg = document.getElementById('wizardSuccessMsg');

// Admin / Holiday Modal Elements
const btnAdminActions = document.getElementById('btnAdminActions');
const modalAdminRegister = document.getElementById('modalAdminRegister');
const btnCloseAdminRegister = document.getElementById('btnCloseAdminRegister');
const formAdminRegister = document.getElementById('formAdminRegister');
const adminRegisterType = document.getElementById('adminRegisterType');
const adminEmployeeSelectGroup = document.getElementById('adminEmployeeSelectGroup');
const adminEmployeeSelect = document.getElementById('adminEmployeeSelect');
const adminRegisterDate = document.getElementById('adminRegisterDate');
const adminRegisterHours = document.getElementById('adminRegisterHours');
const adminRegisterMinutes = document.getElementById('adminRegisterMinutes');
const adminRegisterNotes = document.getElementById('adminRegisterNotes');

// Confirm Delete Modal Elements
const modalConfirmAction = document.getElementById('modalConfirmAction');
const btnCancelConfirm = document.getElementById('btnCancelConfirm');
const btnExecuteConfirm = document.getElementById('btnExecuteConfirm');
const confirmModalTitle = document.getElementById('confirmModalTitle');
const confirmModalText = document.getElementById('confirmModalText');
let confirmActionCallback = null;

// Sidebar Mobile Elements
const sidebar = document.getElementById('sidebar');
const sidebarBackdrop = document.getElementById('sidebarBackdrop');
const btnToggleSidebar = document.getElementById('btnToggleSidebar');
const btnCloseSidebar = document.getElementById('btnCloseSidebar');

// ==========================================================================
// 1. TIME UTILITIES & LIVE CLOCK
// ==========================================================================

const DAYS_ES = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const DAYS_CAP = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function updateLiveClock() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    if (liveClockEl) {
        liveClockEl.textContent = `${hours}:${minutes}:${seconds}`;
    }

    if (liveDateEl) {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const dateStr = now.toLocaleDateString('es-PE', options);
        liveDateEl.textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
    }
}

function timeStringToMinutes(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.split(':');
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    return (h * 60) + m;
}

function minutesToHoursMinutes(totalMinutes) {
    if (!totalMinutes || totalMinutes <= 0) return '0h 00m';
    const hours = Math.floor(totalMinutes / 60);
    const mins = Math.round(totalMinutes % 60);
    return `${hours}h ${String(mins).padStart(2, '0')}m`;
}

function minutesToColonFormat(totalMinutes) {
    if (!totalMinutes || totalMinutes <= 0) return '0:00';
    const hours = Math.floor(totalMinutes / 60);
    const mins = Math.round(totalMinutes % 60);
    return `${hours}:${String(mins).padStart(2, '0')}`;
}

function formatTimeTo12H(timeStr) {
    if (!timeStr) return '';
    const parts = timeStr.split(':');
    let h = parseInt(parts[0], 10);
    const m = parts[1] || '00';
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    h = h ? h : 12; // 0 becomes 12
    return `${h}:${m} ${ampm}`;
}

function getTodayDateString() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function generateUUID() {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// ==========================================================================
// 2. SUPABASE INITIALIZATION & DATA SYNC
// ==========================================================================

function initDatabase() {
    // Limpieza de datos antiguos para reiniciar el sistema a 0
    localStorage.removeItem('canchapro_asistencias');
    localStorage.removeItem('canchapro_personal');
    localStorage.removeItem('canchapro_horarios');
    localStorage.removeItem('canchapro_workers');
    localStorage.removeItem('canchapro_schedules');

    const url = localStorage.getItem('canchapro_supabase_url');
    const key = localStorage.getItem('canchapro_supabase_key');

    if (url && key && window.supabase) {
        try {
            supabaseClient = window.supabase.createClient(url, key);
            dbMode = 'supabase';
            updateConnectionStatus(true);
            setupRealtimeSubscription();
            loadAllData();
            return;
        } catch (err) {
            console.warn("Supabase init error:", err);
        }
    }
    dbMode = 'local';
    updateConnectionStatus(false);
    loadAllData();
}

function updateConnectionStatus(connected) {
    if (statusDotEl && statusTextEl && statusDescEl) {
        if (connected) {
            statusDotEl.className = 'status-dot connected';
            statusTextEl.textContent = 'Conectado a la Nube (Supabase)';
            statusDescEl.textContent = 'Las asistencias están sincronizadas en tiempo real.';
        } else {
            statusDotEl.className = 'status-dot disconnected';
            statusTextEl.textContent = 'Modo Local (Sin Conexión)';
            statusDescEl.textContent = 'Los registros se guardan en este navegador.';
        }
    }
}

function setupRealtimeSubscription() {
    if (!supabaseClient) return;
    if (realtimeChannel) {
        supabaseClient.removeChannel(realtimeChannel);
    }
    realtimeChannel = supabaseClient.channel('realtime_asistencias_v2')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'asistencias_v2' }, () => {
            loadAttendanceRecords();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'personal_asistencia_v2' }, () => {
            loadWorkersAndSchedules();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'horarios_personal_v2' }, () => {
            loadWorkersAndSchedules();
        })
        .subscribe();
}

// Load all data (Workers, Schedules, Attendance records)
async function loadAllData() {
    await loadWorkersAndSchedules();
    await loadAttendanceRecords();
}

async function loadWorkersAndSchedules() {
    // 1. Try to load from Supabase
    if (dbMode === 'supabase' && supabaseClient) {
        try {
            const { data: workerData, error: wError } = await supabaseClient
                .from('personal_asistencia_v2')
                .select('*')
                .eq('is_active', true)
                .order('name', { ascending: true });

            const { data: schedData, error: sError } = await supabaseClient
                .from('horarios_personal_v2')
                .select('*');

            if (!wError && workerData) {
                activeWorkers = workerData.map(w => ({
                    name: w.name,
                    emoji: extractEmojiFromName(w.name) || w.emoji || '🌸',
                    is_active: w.is_active
                }));
            }

            if (!sError && schedData) {
                workerSchedules = {};
                schedData.forEach(row => {
                    workerSchedules[row.employee_name] = row.schedule_data;
                });
            }
        } catch (err) {
            console.warn("Error fetching workers from Supabase, using local fallback:", err);
            loadLocalWorkersAndSchedules();
        }
    } else {
        loadLocalWorkersAndSchedules();
    }

    // Populate dropdowns & refresh UI
    renderWorkerDropdowns();
    if (selectedWorker) {
        const found = activeWorkers.find(w => w.name === selectedWorker.name);
        if (found) {
            employeeSelect.value = found.name;
            handleWorkerChange();
        }
    }
}

function loadLocalWorkersAndSchedules() {
    const savedWorkers = localStorage.getItem('canchapro_workers_v2');
    const savedSchedules = localStorage.getItem('canchapro_schedules_v2');

    if (savedWorkers) {
        try {
            activeWorkers = JSON.parse(savedWorkers);
        } catch (e) {
            activeWorkers = [];
        }
    } else {
        activeWorkers = [];
    }

    if (savedSchedules) {
        try {
            workerSchedules = JSON.parse(savedSchedules);
        } catch (e) {
            workerSchedules = {};
        }
    } else {
        workerSchedules = {};
    }
}

function saveLocalWorkersAndSchedules() {
    localStorage.setItem('canchapro_workers_v2', JSON.stringify(activeWorkers));
    localStorage.setItem('canchapro_schedules_v2', JSON.stringify(workerSchedules));
}

async function loadAttendanceRecords() {
    if (dbMode === 'supabase' && supabaseClient) {
        try {
            const { data, error } = await supabaseClient
                .from('asistencias_v2')
                .select('*')
                .order('date', { ascending: false })
                .order('check_in', { ascending: false });

            if (!error && data) {
                attendanceRecords = data;
            } else {
                attendanceRecords = getLocalAttendance();
            }
        } catch (e) {
            attendanceRecords = getLocalAttendance();
        }
    } else {
        attendanceRecords = getLocalAttendance();
    }

    populateMonthFilter();
    renderAttendanceTable();
    updateWorkerStats();
    updatePunchButtonState();
}

function getLocalAttendance() {
    const saved = localStorage.getItem('canchapro_asistencias_v2');
    if (!saved) return [];
    try {
        return JSON.parse(saved);
    } catch (e) {
        return [];
    }
}

function saveLocalAttendance(records) {
    localStorage.setItem('canchapro_asistencias_v2', JSON.stringify(records));
}

function extractEmojiFromName(name) {
    if (!name) return '';
    const match = name.match(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u);
    return match ? match[0] : '';
}

// Clean name without trailing emojis
function getCleanName(name) {
    if (!name) return '';
    return name.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/ug, '').trim();
}

// ==========================================================================
// 3. WORKER SELECTION & TODAY'S SCHEDULE BANNER
// ==========================================================================

function renderWorkerDropdowns() {
    // 1. Punch Clock dropdown
    const currentVal = employeeSelect.value;
    employeeSelect.innerHTML = '<option value="" disabled selected>-- Elige tu Nombre --</option>';

    activeWorkers.forEach(w => {
        const opt = document.createElement('option');
        opt.value = w.name;
        opt.textContent = `${w.emoji} ${w.name}`;
        employeeSelect.appendChild(opt);
    });

    if (currentVal && activeWorkers.some(w => w.name === currentVal)) {
        employeeSelect.value = currentVal;
    }

    // 2. Filter dropdown
    filterEmployee.innerHTML = '<option value="todos">Todos los trabajadores</option>';
    activeWorkers.forEach(w => {
        const opt = document.createElement('option');
        opt.value = w.name;
        opt.textContent = `${w.emoji} ${w.name}`;
        filterEmployee.appendChild(opt);
    });

    // 3. Admin register employee dropdown
    adminEmployeeSelect.innerHTML = '';
    activeWorkers.forEach(w => {
        const opt = document.createElement('option');
        opt.value = w.name;
        opt.textContent = `${w.emoji} ${w.name}`;
        adminEmployeeSelect.appendChild(opt);
    });
}

function handleWorkerChange() {
    const workerName = employeeSelect.value;
    selectedWorker = activeWorkers.find(w => w.name === workerName) || null;

    if (!selectedWorker) {
        workerScheduleBanner.style.display = 'none';
        earlyCheckinCard.style.display = 'none';
        lunchToggleGroup.style.display = 'none';
        btnToggleAttendance.disabled = true;
        btnPunchText.textContent = 'Marcar Asistencia';
        employeeStatusBox.innerHTML = '<span class="status-title" style="color: var(--text-muted);">Selecciona un colaborador arriba para comenzar</span>';
        updateWorkerStats();
        return;
    }

    // Today's day in lowercase
    const todayDayIndex = new Date().getDay();
    const todayDayKey = DAYS_ES[todayDayIndex];
    const todayCap = DAYS_CAP[todayDayIndex];

    const schedule = workerSchedules[selectedWorker.name] || {};
    const todaySchedule = schedule[todayDayKey];

    // Show schedule banner
    workerScheduleBanner.style.display = 'flex';
    badgeScheduleDay.textContent = `Hoy: ${todayCap}`;

    if (todaySchedule && todaySchedule.active) {
        workerScheduleHours.textContent = `Horario: ${formatTimeTo12H(todaySchedule.in)} a ${formatTimeTo12H(todaySchedule.out)}`;
        workerScheduleLunchInfo.textContent = todaySchedule.lunch ? '🍴 Almuerzo configurado: 1 hora' : '⚡ Jornada sin almuerzo';
        // Pre-configure lunch checkbox
        lunchCheckbox.checked = !!todaySchedule.lunch;
    } else {
        workerScheduleHours.textContent = 'Día libre (Sin horario oficial)';
        workerScheduleLunchInfo.textContent = 'Cualquier turno hoy contará como horas laboradas';
        lunchCheckbox.checked = true;
    }

    updatePunchButtonState();
    updateWorkerStats();
}

function updatePunchButtonState() {
    if (!selectedWorker) return;

    const todayStr = getTodayDateString();
    const workerRecordsToday = attendanceRecords.filter(r => r.employee_name === selectedWorker.name && r.date === todayStr);
    const activeShift = workerRecordsToday.find(r => r.check_in && !r.check_out);

    if (activeShift) {
        // Active shift in progress
        employeeStatusBox.innerHTML = `
            <div class="status-active-shift">
                <div class="active-shift-title"><i data-lucide="play-circle"></i> En jornada activa (Entrada: ${formatTimeTo12H(activeShift.check_in)})</div>
                <div class="active-shift-timer" id="shiftTimerDisplay">Calculando tiempo...</div>
            </div>
        `;
        if (window.lucide) lucide.createIcons();

        btnToggleAttendance.disabled = false;
        btnToggleAttendance.className = 'btn btn-primary btn-punch-action in-shift';
        btnPunchText.textContent = 'Marcar Salida';

        lunchToggleGroup.style.display = 'block';
        earlyCheckinCard.style.display = 'none';

        // Update timer
        updateShiftDurationTimer(activeShift.check_in);
    } else {
        // Not in shift (Ready to Check In)
        btnToggleAttendance.disabled = false;
        btnToggleAttendance.className = 'btn btn-primary btn-punch-action';
        btnPunchText.textContent = 'Marcar Entrada';
        lunchToggleGroup.style.display = 'none';

        // Check if arriving early or late compared to today's schedule
        evaluateCheckInTiming();
    }
}

function updateShiftDurationTimer(checkInTimeStr) {
    const now = new Date();
    const nowMinutes = (now.getHours() * 60) + now.getMinutes();
    const checkInMinutes = timeStringToMinutes(checkInTimeStr);
    const elapsedMinutes = Math.max(0, nowMinutes - checkInMinutes);

    const timerDisplay = document.getElementById('shiftTimerDisplay');
    if (timerDisplay) {
        timerDisplay.textContent = `Tiempo transcurrido: ${minutesToHoursMinutes(elapsedMinutes)}`;
    }
}

function evaluateCheckInTiming() {
    if (!selectedWorker) return;
    const now = new Date();
    const nowMinutes = (now.getHours() * 60) + now.getMinutes();

    const todayDayKey = DAYS_ES[now.getDay()];
    const schedule = workerSchedules[selectedWorker.name] || {};
    const todaySchedule = schedule[todayDayKey];

    if (!todaySchedule || !todaySchedule.active) {
        // No schedule today: standard entry
        earlyCheckinCard.style.display = 'none';
        employeeStatusBox.innerHTML = '<span class="status-title" style="color: var(--primary);">Listo para iniciar turno</span>';
        return;
    }

    const scheduledInMinutes = timeStringToMinutes(todaySchedule.in);
    const diffMinutes = scheduledInMinutes - nowMinutes;

    if (diffMinutes > 0) {
        // Arrived EARLIER than official start time
        earlyCheckinCard.style.display = 'block';
        earlyCheckinCheckbox.checked = true;
        earlyCheckinTitle.textContent = `⏰ ¿Iniciar labores a las ${formatTimeTo12H(todaySchedule.in)}?`;
        earlyCheckinDesc.textContent = `Llegaste ${diffMinutes} min antes. Dejando marcada la casilla, tu ingreso formal iniciará a las ${formatTimeTo12H(todaySchedule.in)}. Si la desmarcas, se registrará a las ${formatTimeTo12H(now.toTimeString().substring(0, 5))} abonando ${diffMinutes} min como horas extras (en verde).`;

        employeeStatusBox.innerHTML = `
            <span class="status-title" style="color: #047857; font-weight: 700;">
                🟢 Llegada anticipada: ${diffMinutes} minutos antes de tu hora oficial
            </span>
        `;
    } else if (diffMinutes < 0) {
        // LATE arrival
        earlyCheckinCard.style.display = 'none';
        const lateMins = Math.abs(diffMinutes);
        employeeStatusBox.innerHTML = `
            <span class="status-title" style="color: var(--color-tardanza); font-weight: 700;">
                🔴 Tardanza detectada: ${minutesToHoursMinutes(lateMins)} después de tu hora oficial (${formatTimeTo12H(todaySchedule.in)})
            </span>
        `;
    } else {
        // Right on time
        earlyCheckinCard.style.display = 'none';
        employeeStatusBox.innerHTML = `
            <span class="status-title" style="color: #059669; font-weight: 700;">
                ⭐ ¡Llegada exacta a tiempo! (${formatTimeTo12H(todaySchedule.in)})
            </span>
        `;
    }
}

// ==========================================================================
// 4. PUNCH ATTENDANCE ENGINE (Check-In & Check-Out)
// ==========================================================================

async function handleAttendancePunch() {
    if (!selectedWorker || isPunchInProgress) return;
    isPunchInProgress = true;
    btnToggleAttendance.disabled = true;

    try {
        const todayStr = getTodayDateString();
        const now = new Date();
        const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`;
        const currentMinutes = (now.getHours() * 60) + now.getMinutes();

        const todayDayKey = DAYS_ES[now.getDay()];
        const schedule = workerSchedules[selectedWorker.name] || {};
        const todaySchedule = schedule[todayDayKey];

        const activeShift = attendanceRecords.find(r =>
            r.employee_name === selectedWorker.name &&
            r.date === todayStr &&
            r.check_in && !r.check_out
        );

        if (activeShift) {
            // ==============================================================
            // CHECK-OUT OPERATION
            // ==============================================================
            const checkInMinutes = timeStringToMinutes(activeShift.check_in);
            const checkOutMinutes = currentMinutes;
            const grossShiftMinutes = Math.max(0, checkOutMinutes - checkInMinutes);

            // Lunch deduction logic: if lunch checkbox is checked
            const tookLunch = lunchCheckbox.checked;
            const lunchDeductionMinutes = tookLunch ? 60 : 0;
            const netShiftMinutes = Math.max(0, grossShiftMinutes - lunchDeductionMinutes);

            let lateMinutes = activeShift.late_minutes || 0;
            let extraMinutes = activeShift.extra_minutes || 0;
            let owedMinutes = 0;

            let notes = `Salida a las ${formatTimeTo12H(currentTimeStr.substring(0, 5))}.`;
            if (tookLunch) {
                notes += ' Con refrigerio (-1h).';
            } else {
                notes += ' Sin refrigerio (jornada corrida).';
            }

            // Check if leaving before or after official scheduled exit
            if (todaySchedule && todaySchedule.active) {
                const scheduledOutMinutes = timeStringToMinutes(todaySchedule.out);
                const diffOut = scheduledOutMinutes - checkOutMinutes;

                if (diffOut > 5) {
                    // Left earlier than scheduled
                    owedMinutes = diffOut;
                    notes += ` Salió ${minutesToHoursMinutes(diffOut)} antes de su hora oficial.`;
                } else if (diffOut < -5) {
                    // Left later than scheduled -> Overtime (in green)
                    const stayLateMins = Math.abs(diffOut);
                    extraMinutes += stayLateMins;
                    notes += ` Horas extras trabajadas al final de la jornada: ${minutesToHoursMinutes(stayLateMins)}.`;
                }
            }

            const updatedShift = {
                ...activeShift,
                check_out: currentTimeStr,
                hours_credited: Number((netShiftMinutes / 60).toFixed(2)),
                late_minutes: lateMinutes,
                extra_minutes: extraMinutes,
                owed_minutes: owedMinutes,
                notes: notes
            };

            if (dbMode === 'supabase' && supabaseClient) {
                const { error } = await supabaseClient
                    .from('asistencias_v2')
                    .update({
                        check_out: updatedShift.check_out,
                        hours_credited: updatedShift.hours_credited,
                        late_minutes: updatedShift.late_minutes,
                        extra_minutes: updatedShift.extra_minutes,
                        owed_minutes: updatedShift.owed_minutes,
                        notes: updatedShift.notes
                    })
                    .eq('id', activeShift.id);

                if (error) throw error;
            } else {
                let localList = getLocalAttendance();
                localList = localList.map(r => r.id === activeShift.id ? updatedShift : r);
                saveLocalAttendance(localList);
            }

        } else {
            // ==============================================================
            // CHECK-IN OPERATION
            // ==============================================================
            let officialInTime = currentTimeStr;
            let lateMinutes = 0;
            let extraMinutes = 0;
            let notes = `Entrada registrada a las ${formatTimeTo12H(currentTimeStr.substring(0, 5))}.`;

            if (todaySchedule && todaySchedule.active) {
                const scheduledInMinutes = timeStringToMinutes(todaySchedule.in);
                const diffMinutes = scheduledInMinutes - currentMinutes;

                if (diffMinutes > 0) {
                    // Arrived early
                    if (earlyCheckinCheckbox && earlyCheckinCheckbox.checked) {
                        // User chose to start officially at scheduled start
                        officialInTime = `${todaySchedule.in}:00`;
                        notes += ` Inicia a la hora oficial (${formatTimeTo12H(todaySchedule.in)}).`;
                    } else {
                        // User chose to start at actual early time -> extra minutes
                        extraMinutes = diffMinutes;
                        notes += ` Ingreso anticipado voluntario (+${diffMinutes} min extras en verde).`;
                    }
                } else if (diffMinutes < 0) {
                    // Arrived late
                    lateMinutes = Math.abs(diffMinutes);
                    notes += ` Tardanza de ${minutesToHoursMinutes(lateMinutes)} respecto a la hora oficial (${formatTimeTo12H(todaySchedule.in)}).`;
                }
            }

            const newShift = {
                id: generateUUID(),
                employee_name: selectedWorker.name,
                date: todayStr,
                check_in: officialInTime,
                check_out: null,
                type: 'Trabajo',
                hours_credited: 0,
                late_minutes: lateMinutes,
                extra_minutes: extraMinutes,
                owed_minutes: 0,
                notes: notes
            };

            if (dbMode === 'supabase' && supabaseClient) {
                const { error } = await supabaseClient
                    .from('asistencias_v2')
                    .insert([newShift]);

                if (error) throw error;
            } else {
                const localList = getLocalAttendance();
                localList.unshift(newShift);
                saveLocalAttendance(localList);
            }
        }

        // Reload data
        await loadAttendanceRecords();
        handleWorkerChange();

    } catch (err) {
        console.error("Error saving attendance record:", err);
        alert("Ocurrió un error al registrar la marcación: " + err.message);
    } finally {
        isPunchInProgress = false;
        btnToggleAttendance.disabled = false;
    }
}

// ==========================================================================
// 5. WORKER KPIS & CALCULATIONS ("CUADRO QUE SE ESCONDE")
// ==========================================================================

function updateWorkerStats() {
    if (!selectedWorker) {
        progressEmployeeTitle.innerHTML = '<span>⭐ Resumen del Trabajador</span>';
        lblSelectedWorkerMeta.textContent = 'Selecciona a alguien para ver sus horas';
        progressPercentageText.textContent = '0%';
        weeklyGoalHoursText.textContent = '0.0 / 48.0 h';
        goalProgressBar.style.width = '0%';

        metricWorkedHours.textContent = '0:00';
        metricLateHours.textContent = '0:00';
        metricOwedHours.textContent = '0:00';
        metricExtraHours.textContent = '0:00';
        metricJustifiedHours.textContent = '0:00 h';
        return;
    }

    // Schedule info
    const schedule = workerSchedules[selectedWorker.name] || {};
    
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    // Calculate current Monday of the week
    const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1; // 0=Monday, 6=Sunday
    const mondayDate = new Date(now);
    mondayDate.setDate(now.getDate() - dayOfWeek);
    mondayDate.setHours(0, 0, 0, 0);

    // Dynamic Weekly Target Logic
    let weeklyTarget = schedule.weeklyTarget || 48.0;
    const workerCreatedAt = selectedWorker.created_at || schedule.created_at;
    
    if (workerCreatedAt) {
        const createdDate = new Date(workerCreatedAt + 'T00:00:00');
        // If worker was created this exact week, we adjust their goal to start from creation date
        if (createdDate >= mondayDate && createdDate <= now) {
            let dynamicTargetMinutes = 0;
            // Iterate from Monday to Sunday of the current week
            for (let i = 0; i < 7; i++) {
                const iterDate = new Date(mondayDate);
                iterDate.setDate(mondayDate.getDate() + i);
                
                // Only count days from their start date onwards
                if (iterDate >= createdDate) {
                    const dayName = DAYS_ES[i];
                    if (schedule[dayName] && schedule[dayName].active) {
                        dynamicTargetMinutes += (schedule[dayName].netMinutes || 0);
                    }
                }
            }
            weeklyTarget = Number((dynamicTargetMinutes / 60).toFixed(1));
        }
    }

    progressEmployeeTitle.innerHTML = `<span>${selectedWorker.emoji} Resumen: ${selectedWorker.name}</span>`;
    lblSelectedWorkerMeta.textContent = `Meta semanal fijada: ${weeklyTarget.toFixed(1)} horas`;

    const workerRecords = attendanceRecords.filter(r => r.employee_name === selectedWorker.name);

    let weeklyCreditedHours = 0;
    let totalWorkedMinutes = 0;
    let totalLateMinutes = 0;
    let totalOwedMinutes = 0;
    let totalExtraMinutes = 0;
    let totalJustifiedMinutes = 0;

    workerRecords.forEach(r => {
        const recordDate = new Date(r.date + 'T00:00:00');

        // Check if record is within current month
        if (recordDate.getFullYear() === currentYear && recordDate.getMonth() === currentMonth) {
            if (r.type === 'Feriado' || r.type === 'Permiso') {
                totalJustifiedMinutes += (r.hours_credited || 8) * 60;
            } else {
                totalWorkedMinutes += (r.hours_credited || 0) * 60;
            }
            totalLateMinutes += (r.late_minutes || 0);
            totalOwedMinutes += (r.owed_minutes || 0);
            totalExtraMinutes += (r.extra_minutes || 0);
        }

        // Check if record is within current week
        if (recordDate >= mondayDate) {
            weeklyCreditedHours += (r.hours_credited || 0);
        }
    });

    // Update Progress Bar
    const progressPct = weeklyTarget > 0 ? Math.min(100, Math.round((weeklyCreditedHours / weeklyTarget) * 100)) : 0;
    progressPercentageText.textContent = `${progressPct}%`;
    weeklyGoalHoursText.textContent = `${weeklyCreditedHours.toFixed(1)} / ${weeklyTarget.toFixed(1)} h`;
    goalProgressBar.style.width = `${progressPct}%`;

    // 4 KPI Cards
    metricWorkedHours.textContent = minutesToColonFormat(totalWorkedMinutes);
    metricLateHours.textContent = minutesToColonFormat(totalLateMinutes);
    metricOwedHours.textContent = minutesToColonFormat(totalOwedMinutes);
    metricExtraHours.textContent = minutesToColonFormat(totalExtraMinutes);
    metricJustifiedHours.textContent = `${minutesToColonFormat(totalJustifiedMinutes)} h`;
}

// ==========================================================================
// 6. HISTORY TABLE & ADVANCED FILTERS
// ==========================================================================

function populateMonthFilter() {
    const currentVal = filterMonth.value;
    filterMonth.innerHTML = '';

    const monthsSet = new Set();
    const now = new Date();
    const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    monthsSet.add(currentMonthStr);

    attendanceRecords.forEach(r => {
        if (r.date) {
            const m = r.date.substring(0, 7);
            monthsSet.add(m);
        }
    });

    const sortedMonths = Array.from(monthsSet).sort().reverse();
    sortedMonths.forEach(mStr => {
        const [year, month] = mStr.split('-');
        const dateObj = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
        const label = dateObj.toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });
        const capLabel = label.charAt(0).toUpperCase() + label.slice(1);

        const opt = document.createElement('option');
        opt.value = mStr;
        opt.textContent = capLabel;
        filterMonth.appendChild(opt);
    });

    if (currentVal && sortedMonths.includes(currentVal)) {
        filterMonth.value = currentVal;
    } else {
        filterMonth.value = currentMonthStr;
    }
}

function renderAttendanceTable() {
    if (!attendanceTableBody) return;

    const selEmp = filterEmployee.value;
    const selMonth = filterMonth.value;
    const selWeek = filterWeek.value;
    const selType = filterType.value;

    let filtered = attendanceRecords.filter(r => {
        // Employee filter
        if (selEmp !== 'todos' && r.employee_name !== selEmp) return false;

        // Month filter
        if (selMonth && r.date && !r.date.startsWith(selMonth)) return false;

        // Type filter
        if (selType === 'Trabajo' && r.type !== 'Trabajo') return false;
        if (selType === 'Tardanza' && (!r.late_minutes || r.late_minutes <= 0)) return false;
        if (selType === 'Extra' && (!r.extra_minutes || r.extra_minutes <= 0)) return false;
        if (selType === 'Feriado' && r.type !== 'Feriado') return false;
        if (selType === 'Permiso' && r.type !== 'Permiso') return false;

        // Week filter
        if (selWeek !== 'todas' && r.date) {
            const dayNum = parseInt(r.date.split('-')[2], 10);
            const weekNum = Math.ceil(dayNum / 7);
            if (String(weekNum) !== selWeek) return false;
        }

        return true;
    });

    if (filtered.length === 0) {
        attendanceTableBody.innerHTML = `
            <tr>
                <td colspan="10" class="empty-state" style="padding: 30px; text-align: center; color: var(--text-muted);">
                    No hay marcaciones que coincidan con los filtros seleccionados.
                </td>
            </tr>
        `;
        return;
    }

    attendanceTableBody.innerHTML = '';

    filtered.forEach(record => {
        const tr = document.createElement('tr');

        // Worker name + emoji
        const workerObj = activeWorkers.find(w => w.name === record.employee_name);
        const emoji = workerObj ? workerObj.emoji : '👤';

        // Format dates
        const dateParts = record.date ? record.date.split('-') : ['2026', '01', '01'];
        const formattedDate = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;

        // Chips for Late, Extra, Type
        const lateChip = record.late_minutes > 0
            ? `<span class="chip chip-tardanza">🔴 +${minutesToHoursMinutes(record.late_minutes)}</span>`
            : `<span class="chip-empty">-</span>`;

        const extraChip = record.extra_minutes > 0
            ? `<span class="chip chip-extra">🟢 +${minutesToHoursMinutes(record.extra_minutes)}</span>`
            : `<span class="chip-empty">-</span>`;

        let typeChip = `<span class="chip chip-regular">☀️ Trabajo</span>`;
        if (record.type === 'Feriado') {
            typeChip = `<span class="chip chip-permiso">🟣 Feriado</span>`;
        } else if (record.type === 'Permiso') {
            typeChip = `<span class="chip chip-permiso">🟣 Permiso</span>`;
        } else if (record.type === 'Falta') {
            typeChip = `<span class="chip chip-tardanza">🔴 Inasistencia</span>`;
        }

        tr.innerHTML = `
            <td><strong>${emoji} ${record.employee_name}</strong></td>
            <td>${formattedDate}</td>
            <td>${record.check_in ? formatTimeTo12H(record.check_in.substring(0, 5)) : '-'}</td>
            <td>${record.check_out ? formatTimeTo12H(record.check_out.substring(0, 5)) : '<span style="color: #059669; font-weight: 700;">En turno</span>'}</td>
            <td><strong style="color: var(--primary); font-size: 14px;">${record.hours_credited ? record.hours_credited.toFixed(1) + ' h' : '0.0 h'}</strong></td>
            <td>${lateChip}</td>
            <td>${extraChip}</td>
            <td>${typeChip}</td>
            <td style="max-width: 260px; font-size: 12px; color: var(--text-secondary);">${record.notes || '-'}</td>
            <td style="text-align: center;">
                <button type="button" class="btn-row-action" title="Eliminar marcación" onclick="confirmDeleteAttendanceRecord('${record.id}')">
                    <i data-lucide="trash-2" style="width: 15px; height: 15px;"></i>
                </button>
            </td>
        `;

        attendanceTableBody.appendChild(tr);
    });

    if (window.lucide) lucide.createIcons();
}

// Global function to trigger confirm delete modal
window.confirmDeleteAttendanceRecord = function (recordId) {
    confirmModalTitle.textContent = '¿Eliminar Marcación?';
    confirmModalText.textContent = 'Esta marcación será eliminada del historial y se recalcularán las horas del colaborador.';
    modalConfirmAction.classList.add('active');

    confirmActionCallback = async () => {
        try {
            if (dbMode === 'supabase' && supabaseClient) {
                const { error } = await supabaseClient.from('asistencias_v2').delete().eq('id', recordId);
                if (error) throw error;
            } else {
                let localList = getLocalAttendance();
                localList = localList.filter(r => r.id !== recordId);
                saveLocalAttendance(localList);
            }
            await loadAttendanceRecords();
        } catch (err) {
            alert('Error al eliminar registro: ' + err.message);
        }
    };
};

// ==========================================================================
// 7. WIZARD: AGREGAR NUEVO TRABAJADOR (3 PASOS)
// ==========================================================================

function setupAddWorkerWizard() {
    // Open Wizard
    if (btnOpenAddWorkerModal) {
        btnOpenAddWorkerModal.addEventListener('click', () => {
            resetWizardForm();
            modalAddWorkerWizard.classList.add('active');
        });
    }

    if (btnCloseAddWorkerWizard) {
        btnCloseAddWorkerWizard.addEventListener('click', () => {
            modalAddWorkerWizard.classList.remove('active');
        });
    }

    // Emoji picker click
    const emojiBtns = emojiPickerGrid.querySelectorAll('.emoji-opt-btn');
    emojiBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            emojiBtns.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            const emoji = btn.getAttribute('data-emoji');
            selectedWorkerEmojiInput.value = emoji;
            updateWorkerPreview();
        });
    });

    if (newWorkerNameInput) {
        newWorkerNameInput.addEventListener('input', updateWorkerPreview);
    }

    function updateWorkerPreview() {
        const name = newWorkerNameInput.value.trim() || 'Nombre';
        const emoji = selectedWorkerEmojiInput.value || '🌸';
        workerPreviewText.textContent = `${emoji} ${name}`;
    }

    // Step 1 -> Step 2
    btnWizardNext1.addEventListener('click', () => {
        const name = newWorkerNameInput.value.trim();
        if (!name) {
            alert('Por favor, ingresa el nombre del nuevo colaborador.');
            newWorkerNameInput.focus();
            return;
        }

        // Check if name already exists
        if (activeWorkers.some(w => w.name.toLowerCase() === name.toLowerCase())) {
            alert('Ya existe un trabajador con ese nombre. Por favor, elige otro o agrega un apellido.');
            newWorkerNameInput.focus();
            return;
        }

        // Switch to Step 2
        wizardPage1.classList.remove('active');
        wizardPage2.classList.add('active');
        stepIndicator1.classList.remove('active');
        stepIndicator2.classList.add('active');
        recalculateWizardWeeklyHours();
    });

    // Step 2 -> Step 1
    btnWizardBack2.addEventListener('click', () => {
        wizardPage2.classList.remove('active');
        wizardPage1.classList.add('active');
        stepIndicator2.classList.remove('active');
        stepIndicator1.classList.add('active');
    });

    // Schedule Row inputs change -> Recalculate daily & weekly
    const scheduleRows = scheduleDaysContainer.querySelectorAll('.schedule-day-card');
    scheduleRows.forEach(row => {
        const cbActive = row.querySelector('.day-active-cb');
        const timeIn = row.querySelector('.time-in');
        const timeOut = row.querySelector('.time-out');
        const cbLunch = row.querySelector('.lunch-cb');

        [cbActive, timeIn, timeOut, cbLunch].forEach(input => {
            input.addEventListener('change', () => {
                recalculateDayCardHours(row);
                recalculateWizardWeeklyHours();
            });
        });
    });

    // Save Worker (Step 2 -> Step 3)
    btnWizardSave.addEventListener('click', async () => {
        const name = newWorkerNameInput.value.trim();
        const emoji = selectedWorkerEmojiInput.value || '🌸';

        // Extract schedule from wizard inputs
        const newSchedule = {};
        let totalNetWeeklyMinutes = 0;

        scheduleRows.forEach(row => {
            const dayKey = row.getAttribute('data-day');
            const isActive = row.querySelector('.day-active-cb').checked;
            const inVal = row.querySelector('.time-in').value || '08:00';
            const outVal = row.querySelector('.time-out').value || '16:30';
            const hasLunch = row.querySelector('.lunch-cb').checked;

            const inMins = timeStringToMinutes(inVal);
            const outMins = timeStringToMinutes(outVal);
            const grossMins = Math.max(0, outMins - inMins);
            const netMins = isActive ? Math.max(0, grossMins - (hasLunch ? 60 : 0)) : 0;

            if (isActive) totalNetWeeklyMinutes += netMins;

            newSchedule[dayKey] = {
                active: isActive,
                in: inVal,
                out: outVal,
                lunch: hasLunch,
                netMinutes: netMins
            };
        });

        const weeklyTargetHours = Number((totalNetWeeklyMinutes / 60).toFixed(1));
        newSchedule.weeklyTarget = weeklyTargetHours;

        btnWizardSave.disabled = true;
        btnWizardSave.textContent = 'Guardando...';

        try {
            const todayStr = getTodayDateString();
            const newWorkerObj = { name, emoji, is_active: true, created_at: todayStr };
            newSchedule.created_at = todayStr;

            // 1. Save to Supabase or Local
            if (dbMode === 'supabase' && supabaseClient) {
                // Table personal_asistencia_v2
                const { error: wError } = await supabaseClient
                    .from('personal_asistencia_v2')
                    .upsert([{ name: newWorkerObj.name, emoji: newWorkerObj.emoji, is_active: true }]);
                if (wError) throw wError;

                // Table horarios_personal_v2
                const { error: sError } = await supabaseClient
                    .from('horarios_personal_v2')
                    .upsert([{
                        employee_name: newWorkerObj.name,
                        schedule_data: newSchedule,
                        updated_at: new Date().toISOString()
                    }]);
                if (sError) throw sError;
            }

            // Update in-memory and local storage
            activeWorkers.push(newWorkerObj);
            workerSchedules[name] = newSchedule;
            saveLocalWorkersAndSchedules();

            // Refresh UI
            renderWorkerDropdowns();
            employeeSelect.value = name;

            // Move to Step 3 (Success)
            wizardPage2.classList.remove('active');
            wizardPage3.classList.add('active');
            stepIndicator2.classList.remove('active');
            stepIndicator3.classList.add('active');

            wizardSuccessMsg.textContent = `El colaborador ${emoji} ${name} ha sido configurado con una meta de ${weeklyTargetHours} horas semanales.`;

        } catch (err) {
            console.error("Error saving worker:", err);
            alert("Ocurrió un error al guardar el trabajador: " + err.message);
        } finally {
            btnWizardSave.disabled = false;
            btnWizardSave.textContent = 'Guardar Trabajador ✅';
        }
    });

    // Finish Wizard
    btnWizardFinish.addEventListener('click', () => {
        modalAddWorkerWizard.classList.remove('active');
        handleWorkerChange();
    });
}

function resetWizardForm() {
    newWorkerNameInput.value = '';
    selectedWorkerEmojiInput.value = '🌸';
    workerPreviewText.textContent = '🌸 Nombre';

    const emojiBtns = emojiPickerGrid.querySelectorAll('.emoji-opt-btn');
    emojiBtns.forEach(b => b.classList.remove('selected'));
    if (emojiBtns[0]) emojiBtns[0].classList.add('selected');

    // Reset wizard steps
    wizardPage1.classList.add('active');
    wizardPage2.classList.remove('active');
    wizardPage3.classList.remove('active');

    stepIndicator1.classList.add('active');
    stepIndicator2.classList.remove('active');
    stepIndicator3.classList.remove('active');

    // Reset default schedule rows
    const scheduleRows = scheduleDaysContainer.querySelectorAll('.schedule-day-card');
    scheduleRows.forEach(row => {
        row.querySelector('.day-active-cb').checked = true;
        row.querySelector('.time-in').value = '08:00';
        row.querySelector('.time-out').value = '16:30';
        row.querySelector('.lunch-cb').checked = true;
        recalculateDayCardHours(row);
    });

    recalculateWizardWeeklyHours();
}

function recalculateDayCardHours(row) {
    const isActive = row.querySelector('.day-active-cb').checked;
    const inVal = row.querySelector('.time-in').value || '08:00';
    const outVal = row.querySelector('.time-out').value || '16:30';
    const hasLunch = row.querySelector('.lunch-cb').checked;
    const calcEl = row.querySelector('.day-calc-hours');

    if (!isActive) {
        calcEl.textContent = 'Libre';
        calcEl.style.color = 'var(--text-muted)';
        calcEl.style.background = '#f3f4f6';
        return;
    }

    const inMins = timeStringToMinutes(inVal);
    const outMins = timeStringToMinutes(outVal);
    const grossMins = Math.max(0, outMins - inMins);
    const netMins = Math.max(0, grossMins - (hasLunch ? 60 : 0));

    calcEl.textContent = minutesToHoursMinutes(netMins);
    calcEl.style.color = 'var(--primary)';
    calcEl.style.background = '#fff0f5';
}

function recalculateWizardWeeklyHours() {
    let totalMinutes = 0;
    const scheduleRows = scheduleDaysContainer.querySelectorAll('.schedule-day-card');

    scheduleRows.forEach(row => {
        const isActive = row.querySelector('.day-active-cb').checked;
        if (isActive) {
            const inVal = row.querySelector('.time-in').value || '08:00';
            const outVal = row.querySelector('.time-out').value || '16:30';
            const hasLunch = row.querySelector('.lunch-cb').checked;

            const inMins = timeStringToMinutes(inVal);
            const outMins = timeStringToMinutes(outVal);
            const grossMins = Math.max(0, outMins - inMins);
            const netMins = Math.max(0, grossMins - (hasLunch ? 60 : 0));
            totalMinutes += netMins;
        }
    });

    wizardTotalWeeklyHours.textContent = minutesToHoursMinutes(totalMinutes);
}

// Edit schedule of existing worker
function setupEditWorkerSchedule() {
    if (!btnEditWorkerSchedule) return;

    btnEditWorkerSchedule.addEventListener('click', () => {
        if (!selectedWorker) return;

        resetWizardForm();
        newWorkerNameInput.value = selectedWorker.name;
        selectedWorkerEmojiInput.value = selectedWorker.emoji;
        workerPreviewText.textContent = `${selectedWorker.emoji} ${selectedWorker.name}`;

        // Select emoji
        const emojiBtns = emojiPickerGrid.querySelectorAll('.emoji-opt-btn');
        emojiBtns.forEach(b => {
            b.classList.toggle('selected', b.getAttribute('data-emoji') === selectedWorker.emoji);
        });

        // Populate existing schedule
        const currentSched = workerSchedules[selectedWorker.name];
        if (currentSched) {
            const scheduleRows = scheduleDaysContainer.querySelectorAll('.schedule-day-card');
            scheduleRows.forEach(row => {
                const dayKey = row.getAttribute('data-day');
                const dayData = currentSched[dayKey];
                if (dayData) {
                    row.querySelector('.day-active-cb').checked = !!dayData.active;
                    row.querySelector('.time-in').value = dayData.in || '08:00';
                    row.querySelector('.time-out').value = dayData.out || '16:30';
                    row.querySelector('.lunch-cb').checked = !!dayData.lunch;
                    recalculateDayCardHours(row);
                }
            });
            recalculateWizardWeeklyHours();
        }

        // Jump straight to Step 2
        wizardPage1.classList.remove('active');
        wizardPage2.classList.add('active');
        stepIndicator1.classList.remove('active');
        stepIndicator2.classList.add('active');

        modalAddWorkerWizard.classList.add('active');
    });
}

// Delete Worker
function setupDeleteWorker() {
    if (!btnDeleteWorker) return;

    btnDeleteWorker.addEventListener('click', () => {
        if (!selectedWorker) return;

        confirmModalTitle.textContent = `¿Dar de baja a ${selectedWorker.name}?`;
        confirmModalText.textContent = `El colaborador no aparecerá más en la lista de marcaciones activas. Sus registros históricos se mantendrán.`;
        modalConfirmAction.classList.add('active');

        confirmActionCallback = async () => {
            try {
                if (dbMode === 'supabase' && supabaseClient) {
                    await supabaseClient
                        .from('personal_asistencia_v2')
                        .update({ is_active: false })
                        .eq('name', selectedWorker.name);
                }

                activeWorkers = activeWorkers.filter(w => w.name !== selectedWorker.name);
                saveLocalWorkersAndSchedules();

                selectedWorker = null;
                renderWorkerDropdowns();
                handleWorkerChange();
                alert('Colaborador dado de baja.');
            } catch (err) {
                alert('Error al dar de baja: ' + err.message);
            }
        };
    });
}

// ==========================================================================
// 8. MODAL: REGISTRAR FERIADO / PERMISO ESPECIAL (MORADO)
// ==========================================================================

function setupAdminRegisterModal() {
    if (btnAdminActions) {
        btnAdminActions.addEventListener('click', () => {
            adminRegisterDate.value = getTodayDateString();
            adminRegisterHours.value = '8';
            adminRegisterMinutes.value = '0';
            adminRegisterNotes.value = '';
            adminRegisterType.value = 'Feriado';
            adminEmployeeSelectGroup.style.display = 'none';
            modalAdminRegister.classList.add('active');
        });
    }

    if (btnCloseAdminRegister) {
        btnCloseAdminRegister.addEventListener('click', () => {
            modalAdminRegister.classList.remove('active');
        });
    }

    adminRegisterType.addEventListener('change', () => {
        const val = adminRegisterType.value;
        if (val === 'Permiso' || val === 'Falta') {
            adminEmployeeSelectGroup.style.display = 'block';
        } else {
            adminEmployeeSelectGroup.style.display = 'none';
        }
    });

    formAdminRegister.addEventListener('submit', async (e) => {
        e.preventDefault();

        const type = adminRegisterType.value;
        const dateVal = adminRegisterDate.value;
        const hours = parseFloat(adminRegisterHours.value) || 0;
        const mins = parseFloat(adminRegisterMinutes.value) || 0;
        const credited = Number((hours + (mins / 60)).toFixed(2));
        const notes = adminRegisterNotes.value.trim() || `${type} justificado`;

        if (!dateVal) {
            alert('Por favor selecciona una fecha.');
            return;
        }

        const workersToCredit = [];
        if (type === 'Feriado') {
            // Apply to all active workers
            activeWorkers.forEach(w => workersToCredit.push(w.name));
        } else {
            const target = adminEmployeeSelect.value;
            if (target) workersToCredit.push(target);
        }

        if (workersToCredit.length === 0) {
            alert('No hay colaboradores seleccionados.');
            return;
        }

        const recordsToInsert = workersToCredit.map(workerName => ({
            id: generateUUID(),
            employee_name: workerName,
            date: dateVal,
            check_in: '08:00:00',
            check_out: '16:00:00',
            type: type,
            hours_credited: credited,
            late_minutes: 0,
            extra_minutes: 0,
            owed_minutes: 0,
            notes: notes
        }));

        try {
            if (dbMode === 'supabase' && supabaseClient) {
                const { error } = await supabaseClient
                    .from('asistencias')
                    .insert(recordsToInsert);
                if (error) throw error;
            } else {
                const localList = getLocalAttendance();
                recordsToInsert.forEach(r => localList.unshift(r));
                saveLocalAttendance(localList);
            }

            modalAdminRegister.classList.remove('active');
            await loadAttendanceRecords();
            alert(`¡${type} registrado con éxito!`);
        } catch (err) {
            alert('Error al registrar feriado/permiso: ' + err.message);
        }
    });
}

// Setup Confirmation Modal
function setupConfirmModal() {
    btnCancelConfirm.addEventListener('click', () => {
        modalConfirmAction.classList.remove('active');
        confirmActionCallback = null;
    });

    btnExecuteConfirm.addEventListener('click', async () => {
        if (confirmActionCallback) {
            await confirmActionCallback();
        }
        modalConfirmAction.classList.remove('active');
        confirmActionCallback = null;
    });
}

// ==========================================================================
// 9. EXCEL EXPORT (ExcelJS)
// ==========================================================================

function setupExcelExport() {
    if (!btnExportExcel) return;

    btnExportExcel.addEventListener('click', async () => {
        if (typeof ExcelJS === 'undefined') {
            alert("Librería ExcelJS no disponible. Verifica tu conexión a internet.");
            return;
        }

        try {
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Control de Asistencias');

            worksheet.columns = [
                { header: 'Colaborador', key: 'colaborador', width: 22 },
                { header: 'Fecha', key: 'fecha', width: 14 },
                { header: 'Entrada', key: 'entrada', width: 12 },
                { header: 'Salida', key: 'salida', width: 12 },
                { header: 'Horas Abonadas', key: 'horas', width: 16 },
                { header: 'Tardanza (min)', key: 'tardanza', width: 16 },
                { header: 'Horas Extras', key: 'extras', width: 16 },
                { header: 'Tipo', key: 'tipo', width: 15 },
                { header: 'Observaciones', key: 'notas', width: 35 }
            ];

            // Title styling
            worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
            worksheet.getRow(1).fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFFF3385' }
            };

            const selEmp = filterEmployee.value;
            const selMonth = filterMonth.value;

            const recordsToExport = attendanceRecords.filter(r => {
                if (selEmp !== 'todos' && r.employee_name !== selEmp) return false;
                if (selMonth && r.date && !r.date.startsWith(selMonth)) return false;
                return true;
            });

            recordsToExport.forEach(r => {
                worksheet.addRow({
                    colaborador: r.employee_name,
                    fecha: r.date,
                    entrada: r.check_in ? formatTimeTo12H(r.check_in.substring(0, 5)) : '',
                    salida: r.check_out ? formatTimeTo12H(r.check_out.substring(0, 5)) : 'En turno',
                    horas: r.hours_credited || 0,
                    tardanza: r.late_minutes || 0,
                    extras: r.extra_minutes || 0,
                    tipo: r.type,
                    notas: r.notes || ''
                });
            });

            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Asistencias_NuevoHorizonte_${selMonth || 'Reporte'}.xlsx`;
            a.click();
            window.URL.revokeObjectURL(url);

        } catch (err) {
            console.error("Error exporting Excel:", err);
            alert("Error al generar el archivo Excel: " + err.message);
        }
    });
}

// ==========================================================================
// 10. COLLAPSIBLE PANEL & MOBILE DRAWER
// ==========================================================================

function setupCollapsiblePanel() {
    if (!btnToggleStatsPanel) return;

    btnToggleStatsPanel.addEventListener('click', () => {
        const isCollapsed = attendanceLayout.classList.toggle('stats-collapsed');
        if (isCollapsed) {
            textToggleStats.textContent = 'Mostrar Panel';
            if (iconToggleStats) iconToggleStats.setAttribute('data-lucide', 'panel-right-open');
        } else {
            textToggleStats.textContent = 'Ocultar Panel';
            if (iconToggleStats) iconToggleStats.setAttribute('data-lucide', 'panel-right-close');
        }
        if (window.lucide) lucide.createIcons();
    });
}

function setupMobileSidebar() {
    if (btnToggleSidebar && sidebar && sidebarBackdrop) {
        btnToggleSidebar.addEventListener('click', () => {
            sidebar.classList.add('mobile-open');
            sidebarBackdrop.classList.add('active');
        });

        const closeSidebar = () => {
            sidebar.classList.remove('mobile-open');
            sidebarBackdrop.classList.remove('active');
        };

        if (btnCloseSidebar) btnCloseSidebar.addEventListener('click', closeSidebar);
        sidebarBackdrop.addEventListener('click', closeSidebar);
    }
}

// ==========================================================================
// 11. INITIALIZATION ON DOM READY
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
    // 1. Start live clock
    updateLiveClock();
    setInterval(updateLiveClock, 1000);

    // 2. Initialize Icons
    if (window.lucide) lucide.createIcons();

    // 3. Event Listeners
    if (employeeSelect) {
        employeeSelect.addEventListener('change', handleWorkerChange);
    }

    if (btnToggleAttendance) {
        btnToggleAttendance.addEventListener('click', handleAttendancePunch);
    }

    // Filter listeners
    [filterEmployee, filterMonth, filterWeek, filterType].forEach(el => {
        if (el) el.addEventListener('change', renderAttendanceTable);
    });

    // 4. Setup Modals & Handlers
    setupAddWorkerWizard();
    setupEditWorkerSchedule();
    setupDeleteWorker();
    setupAdminRegisterModal();
    setupConfirmModal();
    setupExcelExport();

    // 5. Connect Database & Load Data
    initDatabase();
});
