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
let autoCheckoutPromise = null;
let lastAttendanceMinute = '';
let automaticCheckoutRepairPromise = null;

const ADMIN_PASSWORD = "Reservasupabase";

function requireAdmin(callback) {
    if (localStorage.getItem('canchapro_admin_auth') === 'true') {
        callback();
        return;
    }

    const input = prompt("Se requiere contraseña de administrador para realizar esta acción:");
    if (input === null) return;
    if (input === ADMIN_PASSWORD) {
        localStorage.setItem('canchapro_admin_auth', 'true');
        alert("Autenticación exitosa.");
        callback();
    } else {
        alert("Contraseña incorrecta.");
    }
}

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
const metricAbsenceHours = document.getElementById('metricAbsenceHours');
const metricOwedHours = document.getElementById('metricOwedHours');
const metricExtraHours = document.getElementById('metricExtraHours');
const metricJustifiedHours = document.getElementById('metricJustifiedHours');

// Dedicated Absences Card Elements
const workerAbsencesCard = document.getElementById('workerAbsencesCard');
const absencesCardTitle = document.getElementById('absencesCardTitle');
const badgeAbsencesCount = document.getElementById('badgeAbsencesCount');
const absencesListContainer = document.getElementById('absencesListContainer');

const btnEditWorkerSchedule = document.getElementById('btnEditWorkerSchedule');
const btnReduceDebt = document.getElementById('btnReduceDebt');
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

// Manual Regularization Modal Elements
const modalManualPunch = document.getElementById('modalManualPunch');
const btnCloseManualPunch = document.getElementById('btnCloseManualPunch');
const formManualPunch = document.getElementById('formManualPunch');
const manualPunchWorker = document.getElementById('manualPunchWorker');
const manualPunchDate = document.getElementById('manualPunchDate');
const manualPunchIn = document.getElementById('manualPunchIn');
const manualPunchOut = document.getElementById('manualPunchOut');
const manualPunchLunch = document.getElementById('manualPunchLunch');
const manualPunchNotes = document.getElementById('manualPunchNotes');

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

    const minuteKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()} ${hours}:${minutes}`;
    if (minuteKey !== lastAttendanceMinute) {
        lastAttendanceMinute = minuteKey;
        renderTeamLiveStatus();
        if (selectedWorker) {
            const activeShift = attendanceRecords.find(r =>
                r.employee_name === selectedWorker.name && r.date === getTodayDateString() && r.check_in && !r.check_out
            );
            if (activeShift) updateShiftDurationTimer(activeShift.check_in);
        }
        updateWeeklyGoalProgress(now);
        autoCheckoutActiveShifts();
    } else if (now.getSeconds() === 30) {
        renderTeamLiveStatus();
    }
}

function getRecordDaySchedule(record) {
    const date = new Date(record.date + 'T12:00:00');
    return workerSchedules[record.employee_name]?.[DAYS_ES[date.getDay()]];
}

function hasScheduledWork(record, schedule) {
    return schedule?.active && record.check_in &&
        timeStringToMinutes(record.check_in) < timeStringToMinutes(schedule.out) &&
        (!record.check_out || timeStringToMinutes(record.check_out) > timeStringToMinutes(schedule.in));
}

function isOutsideScheduledShift(record, schedule) {
    return !schedule?.active || timeStringToMinutes(record.check_in) >= timeStringToMinutes(schedule.out);
}

function isScheduledShiftDue(record, now = new Date()) {
    if (record.type !== 'Trabajo' || !record.check_in || record.check_out || record.date > getTodayDateString()) return false;
    const schedule = getRecordDaySchedule(record);
    if (!schedule?.active || !schedule.out || isOutsideScheduledShift(record, schedule)) return false;
    return record.date < getTodayDateString() ||
        now.getHours() * 60 + now.getMinutes() >= timeStringToMinutes(schedule.out);
}

function calculateShiftAccounting(record, checkoutTime, schedule) {
    const checkIn = timeStringToMinutes(record.check_in);
    const checkOut = timeStringToMinutes(checkoutTime);
    const netMinutes = Math.max(0, checkOut - checkIn - (getRecordLunchChoice(record) ? 60 : 0));
    let extraMinutes = netMinutes;
    let owedMinutes = 0;
    let lateMinutes = 0;
    if (schedule?.active) {
        const scheduledIn = timeStringToMinutes(schedule.in);
        const scheduledOut = timeStringToMinutes(schedule.out);
        const beforeSchedule = Math.max(0, Math.min(checkOut, scheduledIn) - checkIn);
        const afterSchedule = Math.max(0, checkOut - Math.max(checkIn, scheduledOut));
        extraMinutes = Math.min(netMinutes, beforeSchedule + afterSchedule);
        if (checkIn < scheduledOut && checkOut > scheduledIn) {
            lateMinutes = Number(record.late_minutes) || 0;
            const isRecovery = /Turno de recuperación dentro del horario|Turno extra\/recuperación en el mismo día/i.test(record.notes || '');
            if (!isRecovery && scheduledOut - checkOut > 5) owedMinutes = scheduledOut - checkOut;
        }
    }
    return {
        hours_credited: Number((netMinutes / 60).toFixed(2)),
        late_minutes: lateMinutes,
        extra_minutes: extraMinutes,
        owed_minutes: owedMinutes
    };
}

async function autoCheckoutActiveShifts(reconcilePunch = false) {
    if (autoCheckoutPromise) return autoCheckoutPromise;
    if ((isPunchInProgress && !reconcilePunch) || !attendanceRecords.length) return [];
    autoCheckoutPromise = (async () => {
        const now = new Date();
        const closedIds = [];
        const dueShifts = attendanceRecords.filter(record => isScheduledShiftDue(record, now));
        for (const shift of dueShifts) {
            const schedule = getRecordDaySchedule(shift);
            const checkout = schedule.out.substring(0, 5) + ':00';
            const update = {
                check_out: checkout,
                ...calculateShiftAccounting(shift, checkout, schedule),
                notes: `${shift.notes ? shift.notes + ' | ' : ''}Salida automática a la hora programada (${formatTimeTo12H(checkout)}). ${getRecordLunchChoice(shift) ? 'Refrigerio descontado (-1h).' : 'Jornada corrida.'}`
            };
            try {
                if (dbMode === 'supabase' && supabaseClient) {
                    const { data, error } = await supabaseClient.from('asistencias_v2')
                        .update(update).eq('id', shift.id).is('check_out', null).select('id');
                    if (error) throw error;
                    if (!data?.length) continue;
                } else {
                    saveLocalAttendance(getLocalAttendance().map(record =>
                        record.id === shift.id && !record.check_out ? { ...record, ...update } : record
                    ));
                }
                attendanceRecords = attendanceRecords.map(record =>
                    record.id === shift.id && !record.check_out ? { ...record, ...update } : record
                );
                closedIds.push(shift.id);
            } catch (error) {
                console.warn('No se pudo cerrar el turno programado:', error);
            }
        }
        if (closedIds.length) {
            renderTeamLiveStatus();
            updatePunchButtonState();
            renderAttendanceTable();
            updateWorkerStats();
        }
        return closedIds;
    })();
    try {
        return await autoCheckoutPromise;
    } finally {
        autoCheckoutPromise = null;
    }
}

function getRecordLunchChoice(record) {
    return typeof record.lunch === 'boolean'
        ? record.lunch
        : !/sin refrigerio/i.test(record.notes || '');
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
    await autoCheckoutActiveShifts();
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
                    is_active: w.is_active,
                    created_at: typeof w.created_at === 'string' ? w.created_at.slice(0, 10) : undefined
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
    renderTeamLiveStatus();
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
                attendanceRecords = data.map(r => ({
                    ...r,
                    lunch: getRecordLunchChoice(r)
                }));
            } else {
                attendanceRecords = getLocalAttendance();
            }
        } catch (e) {
            attendanceRecords = getLocalAttendance();
        }
    } else {
        attendanceRecords = getLocalAttendance();
    }

    await repairInvalidAutomaticCheckouts();
    populateMonthFilter();
    renderAttendanceTable();
    updateWorkerStats();
    updatePunchButtonState();
    renderTeamLiveStatus();
}

function isInvalidAutomaticCheckout(record) {
    return record.type === 'Trabajo' && record.check_in && record.check_out &&
        /Salida autom[aá]tica del sistema a las/i.test(record.notes || '') &&
        Number(record.hours_credited || 0) === 0 &&
        timeStringToMinutes(record.check_out) < timeStringToMinutes(record.check_in);
}

function getAutomaticCheckoutCorrection(record) {
    if (!record.id || !isInvalidAutomaticCheckout(record) || record.date >= getTodayDateString()) return null;
    const date = new Date(record.date + 'T12:00:00');
    const schedule = workerSchedules[record.employee_name]?.[DAYS_ES[date.getDay()]];
    if (!schedule?.active || !schedule.out) return null;

    const checkOut = schedule.out.substring(0, 5) + ':00';
    const grossMinutes = timeStringToMinutes(checkOut) - timeStringToMinutes(record.check_in);
    if (grossMinutes <= 0) return null;
    const tookLunch = getRecordLunchChoice(record);
    const netMinutes = Math.max(0, grossMinutes - (tookLunch ? 60 : 0));
    return {
        check_out: checkOut,
        hours_credited: Number((netMinutes / 60).toFixed(2)),
        late_minutes: Number(record.late_minutes) || 0,
        extra_minutes: Number(record.extra_minutes) || 0,
        owed_minutes: 0,
        notes: `${record.notes || ''} | Corrección de cierre automático inválido: salida anterior ${record.check_out}; recalculada a ${checkOut} según horario programado. ${tookLunch ? 'Refrigerio descontado (-1h).' : 'Sin descuento de refrigerio.'}`
    };
}

async function repairInvalidAutomaticCheckouts() {
    if (automaticCheckoutRepairPromise) return automaticCheckoutRepairPromise;
    automaticCheckoutRepairPromise = (async () => {
        const corrections = attendanceRecords.map(record => ({
            record, update: getAutomaticCheckoutCorrection(record)
        })).filter(item => item.update);
        if (!corrections.length) return;

        if (dbMode === 'supabase' && supabaseClient) {
            for (const { record, update } of corrections) {
                try {
                    const { data, error } = await supabaseClient.from('asistencias_v2')
                        .update(update).eq('id', record.id).eq('check_out', record.check_out).select('id');
                    if (error) throw error;
                    if (!data?.length) continue;
                    attendanceRecords = attendanceRecords.map(current =>
                        current.id === record.id && current.check_out === record.check_out
                            ? { ...current, ...update } : current
                    );
                } catch (error) {
                    console.warn('No se pudo corregir el cierre automático:', error);
                }
            }
        } else {
            const updates = new Map(corrections.map(({ record, update }) => [record.id, update]));
            const repaired = attendanceRecords.map(record =>
                updates.has(record.id) ? { ...record, ...updates.get(record.id) } : record
            );
            try {
                saveLocalAttendance(repaired);
                attendanceRecords = repaired;
            } catch (error) {
                console.warn('No se pudieron guardar los cierres corregidos:', error);
            }
        }
    })();
    try {
        await automaticCheckoutRepairPromise;
    } finally {
        automaticCheckoutRepairPromise = null;
    }
}

function getLocalAttendance() {
    const saved = localStorage.getItem('canchapro_asistencias_v2');
    if (!saved) return [];
    try {
        const list = JSON.parse(saved);
        return list.map(r => ({
            ...r,
            lunch: getRecordLunchChoice(r)
        }));
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

// Render real-time team attendance status (green dot = active, red dot = missing, etc.)
function renderTeamLiveStatus() {
    const grid = document.getElementById('teamRealtimeGrid');
    const badge = document.getElementById('teamActiveCountBadge');
    if (!grid) return;

    if (!activeWorkers || activeWorkers.length === 0) {
        grid.innerHTML = '<div style="font-size: 11.5px; color: var(--text-muted); padding: 4px;">No hay colaboradores registrados.</div>';
        if (badge) badge.textContent = '0 en turno';
        return;
    }

    const todayStr = getTodayDateString();
    const now = new Date();
    const todayDayKey = DAYS_ES[now.getDay()];

    let activeCount = 0;
    grid.innerHTML = '';

    activeWorkers.forEach(worker => {
        const workerRecordsToday = attendanceRecords.filter(r => r.employee_name === worker.name && r.date === todayStr);
        const activeShift = workerRecordsToday.find(r => r.check_in && !r.check_out);
        const completedShift = workerRecordsToday.find(r => r.type === 'Trabajo' && r.check_in && r.check_out);
        const justifiedRecord = workerRecordsToday.find(r => r.type === 'Permiso' || r.type === 'Feriado');

        const schedule = workerSchedules[worker.name] || {};
        const todaySchedule = schedule[todayDayKey];

        let statusClass = 'status-missing';
        let stateText = 'Sin marcar';
        let titleAttr = `${worker.name}: Falta marcar ingreso hoy`;

        if (activeShift) {
            activeCount++;
            statusClass = 'status-active';
            stateText = `En turno (${formatTimeTo12H(activeShift.check_in.substring(0, 5))})`;
            titleAttr = `${worker.name}: En jornada activa (Entró a las ${formatTimeTo12H(activeShift.check_in.substring(0, 5))})`;
        } else if (completedShift) {
            statusClass = 'status-checkout';
            stateText = `Salió ${formatTimeTo12H(completedShift.check_out.substring(0, 5))}`;
            titleAttr = `${worker.name}: Jornada cumplida hoy (Salida: ${formatTimeTo12H(completedShift.check_out.substring(0, 5))})`;
        } else if (justifiedRecord) {
            statusClass = 'status-justified';
            stateText = justifiedRecord.type;
            titleAttr = `${worker.name}: ${justifiedRecord.type} registrado`;
        } else if (!todaySchedule || !todaySchedule.active) {
            statusClass = 'status-free';
            stateText = 'Día libre';
            titleAttr = `${worker.name}: Día libre según su horario`;
        } else {
            statusClass = 'status-missing';
            stateText = 'No ha entrado';
            titleAttr = `${worker.name}: Falta marcar (Horario oficial: ${formatTimeTo12H(todaySchedule.in)} a ${formatTimeTo12H(todaySchedule.out)})`;
        }

        const isCurrentlySelected = selectedWorker && selectedWorker.name === worker.name;

        const chip = document.createElement('div');
        chip.className = `worker-status-chip ${statusClass}`;
        chip.setAttribute('data-worker', worker.name);
        chip.title = `${titleAttr} (Haz clic para seleccionarlo)`;
        if (isCurrentlySelected) {
            chip.style.outline = '2px solid var(--primary)';
            chip.style.outlineOffset = '1px';
        }

        chip.innerHTML = `
            <span class="status-dot-indicator"></span>
            <div class="worker-chip-info">
                <span class="worker-chip-name">${escapeAttendanceHtml(worker.emoji || '👤')} ${escapeAttendanceHtml(worker.name)}</span>
                <span class="worker-chip-state">${escapeAttendanceHtml(stateText)}</span>
            </div>
        `;

        chip.addEventListener('click', () => {
            if (employeeSelect) {
                employeeSelect.value = worker.name;
                handleWorkerChange();
                document.querySelectorAll('.worker-status-chip').forEach(c => c.style.outline = 'none');
                chip.style.outline = '2px solid var(--primary)';
                chip.style.outlineOffset = '1px';
            }
        });

        grid.appendChild(chip);
    });

    if (badge) {
        badge.textContent = `${activeCount} de ${activeWorkers.length} en turno`;
    }
}

function handleWorkerChange() {
    const workerName = employeeSelect.value;
    selectedWorker = activeWorkers.find(w => w.name === workerName) || null;

    // Highlight selected worker in real-time board
    document.querySelectorAll('.worker-status-chip').forEach(c => {
        if (selectedWorker && c.getAttribute('data-worker') === selectedWorker.name) {
            c.style.outline = '2px solid var(--primary)';
            c.style.outlineOffset = '1px';
        } else {
            c.style.outline = 'none';
        }
    });

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
        workerScheduleLunchInfo.textContent = 'Los turnos de hoy cuentan como horas extras';
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
        // Active shift in progress - Marcar Salida directo sin opciones adicionales
        const shiftTookLunch = getRecordLunchChoice(activeShift);

        employeeStatusBox.innerHTML = `
            <div class="status-active-shift">
                <div class="active-shift-title"><i data-lucide="play-circle"></i> En jornada activa (Entrada: ${formatTimeTo12H(activeShift.check_in)})</div>
                <div class="active-shift-timer" id="shiftTimerDisplay">Calculando tiempo...</div>
                <div style="font-size: 12px; margin-top: 5px; color: var(--text-secondary); display: flex; align-items: center; justify-content: center; gap: 5px;">
                    ${shiftTookLunch ? '🍴 Refrigerio programado: 1 hora' : '⚡ Jornada corrida (sin refrigerio)'}
                </div>
            </div>
        `;
        if (window.lucide) lucide.createIcons();

        btnToggleAttendance.disabled = false;
        btnToggleAttendance.className = 'btn btn-primary btn-punch-action in-shift';
        btnPunchText.textContent = isOutsideScheduledShift(activeShift, getRecordDaySchedule(activeShift)) ? 'Marcar Salida Extra' : 'Marcar Salida';

        // Una vez que entras, ya no se muestran opciones adicionales (solo Marcar Salida directo)
        lunchToggleGroup.style.display = 'none';
        earlyCheckinCard.style.display = 'none';

        // Update timer
        updateShiftDurationTimer(activeShift.check_in);
    } else {
        // Not in shift (Ready to Check In)
        btnToggleAttendance.disabled = false;
        btnToggleAttendance.className = 'btn btn-primary btn-punch-action';
        btnPunchText.textContent = 'Marcar Entrada';

        // Las condiciones (refrigerio y horario) se definen antes de marcar entrada
        lunchToggleGroup.style.display = 'block';

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
    const todayStr = getTodayDateString();

    const todayDayKey = DAYS_ES[now.getDay()];
    const schedule = workerSchedules[selectedWorker.name] || {};
    const todaySchedule = schedule[todayDayKey];

    const hasCompletedShiftToday = attendanceRecords.some(record =>
        record.employee_name === selectedWorker.name && record.date === todayStr &&
        record.type === 'Trabajo' && record.check_in && record.check_out && hasScheduledWork(record, todaySchedule)
    );

    if (!todaySchedule?.active || nowMinutes >= timeStringToMinutes(todaySchedule.out)) {
        earlyCheckinCard.style.display = 'none';
        lunchToggleGroup.style.display = 'none';
        lunchCheckbox.checked = false;
        btnPunchText.textContent = 'Marcar Entrada Extra';
        employeeStatusBox.innerHTML = '<span class="status-title" style="color: #047857; font-weight: 700;">Turno extra fuera de horario. Cuenta desde esta nueva entrada hasta marcar salida.</span>';
        return;
    }
    if (hasCompletedShiftToday) {
        earlyCheckinCard.style.display = 'none';
        lunchCheckbox.checked = false;
        employeeStatusBox.innerHTML = '<span class="status-title" style="color: #6366f1; font-weight: 700;">Recuperación dentro del horario (sin nueva tardanza).</span>';
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
    const punchWorkerName = selectedWorker.name;
    const previousShift = attendanceRecords.find(record =>
        record.employee_name === punchWorkerName && record.date === getTodayDateString() && record.check_in && !record.check_out
    );
    const mustCloseScheduledShift = previousShift && isScheduledShiftDue(previousShift);
    isPunchInProgress = true;
    btnToggleAttendance.disabled = true;

    try {
        const closedIds = await autoCheckoutActiveShifts(true);
        if (selectedWorker?.name !== punchWorkerName) return;
        if (previousShift && (closedIds.includes(previousShift.id) ||
            !attendanceRecords.some(record => record.id === previousShift.id && !record.check_out))) {
            handleWorkerChange();
            return;
        }
        if (mustCloseScheduledShift || (previousShift && isScheduledShiftDue(previousShift))) {
            alert('No se pudo cerrar la jornada programada. Reintenta antes de iniciar horas extras.');
            return;
        }
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
            const tookLunch = getRecordLunchChoice(activeShift);
            const accounting = calculateShiftAccounting(activeShift, currentTimeStr, todaySchedule);
            const updatedShift = {
                ...activeShift,
                check_out: currentTimeStr,
                ...accounting,
                lunch: tookLunch,
                notes: `${activeShift.notes ? activeShift.notes + ' | ' : ''}Salida a las ${formatTimeTo12H(currentTimeStr)}. ${tookLunch ? 'Refrigerio descontado (-1h).' : 'Jornada corrida (sin descuento de refrigerio).'}${accounting.extra_minutes > 0 ? ' Tiempo extra trabajado: ' + minutesToHoursMinutes(accounting.extra_minutes) + '.' : ''}`
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
            const isExtraEntry = !todaySchedule?.active || currentMinutes >= timeStringToMinutes(todaySchedule.out);
            const tookLunch = !isExtraEntry && Boolean(lunchCheckbox?.checked);
            let officialInTime = currentTimeStr;
            let lateMinutes = 0;
            let extraMinutes = 0;
            let notes = `Entrada registrada a las ${formatTimeTo12H(currentTimeStr.substring(0, 5))}.`;
            if (tookLunch) {
                notes += ' [Con refrigerio: -1h].';
            } else {
                notes += ' [Sin refrigerio: jornada corrida].';
            }

            const hasCompletedShiftToday = attendanceRecords.some(r =>
                r.employee_name === selectedWorker.name &&
                r.date === todayStr &&
                r.type === 'Trabajo' && r.check_in && Boolean(r.check_out) && hasScheduledWork(r, todaySchedule)
            );

            if (isExtraEntry) {
                notes += ' [Turno extra fuera de horario].';
            } else if (hasCompletedShiftToday) {
                notes += ' [Turno de recuperación dentro del horario].';
            } else if (todaySchedule && todaySchedule.active) {
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
                        notes += ` Ingreso anticipado voluntario; los minutos extras se calculan según el tiempo trabajado antes del horario.`;
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
                lunch: tookLunch,
                notes: notes
            };

            if (dbMode === 'supabase' && supabaseClient) {
                const { error } = await supabaseClient
                    .from('asistencias_v2')
                    .insert([{
                        id: newShift.id,
                        employee_name: newShift.employee_name,
                        date: newShift.date,
                        check_in: newShift.check_in,
                        check_out: newShift.check_out,
                        type: newShift.type,
                        hours_credited: newShift.hours_credited,
                        late_minutes: newShift.late_minutes,
                        extra_minutes: newShift.extra_minutes,
                        owed_minutes: newShift.owed_minutes,
                        notes: newShift.notes
                    }]);

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
        btnToggleAttendance.disabled = !selectedWorker;
    }
}

// ==========================================================================
// 5. WORKER KPIS, ABSENCE DETECTION & CALCULATIONS ("CUADRO QUE SE ESCONDE")
// ==========================================================================

// Detect missing scheduled workdays in the past for workers
function escapeAttendanceHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
}

function populateWeekFilter() {
    if (!filterWeek) return;
    const previousValue = filterWeek.value;
    const selectedMonth = filterMonth.value || getTodayDateString().slice(0, 7);
    const [year, month] = selectedMonth.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    filterWeek.innerHTML = '';

    const allWeeks = document.createElement('option');
    allWeeks.value = 'todas';
    allWeeks.textContent = 'Todas las semanas';
    filterWeek.appendChild(allWeeks);
    const validValues = ['todas'];
    for (let week = 1; week <= Math.ceil(daysInMonth / 7); week++) {
        const firstDay = (week - 1) * 7 + 1;
        const lastDay = Math.min(week * 7, daysInMonth);
        const option = document.createElement('option');
        option.value = String(week);
        option.textContent = `Semana ${week} (${firstDay}-${lastDay})`;
        validValues.push(option.value);
        filterWeek.appendChild(option);
    }
    filterWeek.value = validValues.includes(previousValue) ? previousValue : 'todas';
}

function getFilteredAttendanceRecords() {
    const selEmp = filterEmployee.value;
    const selMonth = filterMonth.value;
    const selWeek = filterWeek.value;
    const selType = filterType.value;
    return getCombinedAttendanceRecords(selMonth).filter(record => {
        if (selEmp !== 'todos' && record.employee_name !== selEmp) return false;
        if (selMonth && record.date && !record.date.startsWith(selMonth)) return false;
        if (selType === 'Tardanza') {
            if (!(Number(record.late_minutes) > 0)) return false;
        } else if (selType === 'Extra') {
            if (!(Number(record.extra_minutes) > 0)) return false;
        } else if (selType && selType !== 'todos' && record.type !== selType) {
            return false;
        }
        if (selWeek !== 'todas' && record.date) {
            if (String(Math.ceil(Number(record.date.split('-')[2]) / 7)) !== selWeek) return false;
        }
        return true;
    });
}

function getDetectedAbsences(forMonth = null, workerName = null) {
    const absences = [];
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    // Target Year & Month
    let targetYear = currentYear;
    let targetMonthIdx = currentMonth;
    if (forMonth && forMonth.includes('-')) {
        const parts = forMonth.split('-');
        targetYear = parseInt(parts[0], 10);
        targetMonthIdx = parseInt(parts[1], 10) - 1;
    }

    const daysInMonth = new Date(targetYear, targetMonthIdx + 1, 0).getDate();

    // If target month is current month, only evaluate strictly past days (< today).
    // Today's shift allows checking in during the day until the day passes.
    let endDay = daysInMonth;
    if (targetYear === currentYear && targetMonthIdx === currentMonth) {
        endDay = Math.max(0, now.getDate() - 1);
    } else if (new Date(targetYear, targetMonthIdx, 1) > now) {
        // Future month: no past absences
        return [];
    }

    const workersToCheck = workerName 
        ? activeWorkers.filter(w => w.name === workerName)
        : activeWorkers;

    workersToCheck.forEach(worker => {
        const schedule = workerSchedules[worker.name];
        if (!schedule) return;

        const workerCreatedAt = worker.created_at || schedule.created_at;
        let startDay = 1;

        if (workerCreatedAt) {
            const [cYear, cMonth, cDay] = workerCreatedAt.split('-').map(Number);
            if (cYear === targetYear && (cMonth - 1) === targetMonthIdx) {
                startDay = Math.max(1, cDay);
            } else if (new Date(workerCreatedAt + 'T00:00:00') > new Date(targetYear, targetMonthIdx, daysInMonth)) {
                // Worker joined after this month
                return;
            }
        }

        for (let day = startDay; day <= endDay; day++) {
            const dateStr = `${targetYear}-${String(targetMonthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dateObj = new Date(targetYear, targetMonthIdx, day);
            const dayKey = DAYS_ES[dateObj.getDay()];
            const daySched = schedule[dayKey];

            // If scheduled to work on this day
            if (daySched && daySched.active) {
                // A permission credits the debt but does not remove the historical absence.
                const hasRecord = attendanceRecords.some(record => {
                    if (record.employee_name !== worker.name || record.date !== dateStr || record.type === 'Ajuste' || record.type === 'Permiso') return false;
                    if (record.type !== 'Trabajo' || !record.check_in) return true;
                    return hasScheduledWork(record, daySched);
                });
                if (!hasRecord) {
                    let netMins = daySched.netMinutes;
                    if (netMins === undefined || netMins === null || netMins === 0) {
                        const inMins = timeStringToMinutes(daySched.in || '08:00');
                        const outMins = timeStringToMinutes(daySched.out || '16:30');
                        const gross = Math.max(0, outMins - inMins);
                        netMins = Math.max(0, gross - (daySched.lunch ? 60 : 0));
                    }

                    absences.push({
                        id: `auto-falta-${worker.name}-${dateStr}`,
                        employee_name: worker.name,
                        date: dateStr,
                        check_in: null,
                        check_out: null,
                        type: 'Falta',
                        hours_credited: 0,
                        late_minutes: 0,
                        extra_minutes: 0,
                        owed_minutes: netMins,
                        scheduled_in: daySched.in || '08:00',
                        scheduled_out: daySched.out || '16:30',
                        scheduled_lunch: daySched.lunch !== false,
                        notes: `Ausencia registrada: no registró asistencia en su horario oficial (${formatTimeTo12H(daySched.in)} a ${formatTimeTo12H(daySched.out)} • ${minutesToHoursMinutes(netMins)} no laboradas).`,
                        is_auto_absence: true
                    });
                }
            }
        }
    });

    return absences;
}

function getAbsenceRecordedMinutes(record) {
    const value = record.absence_minutes ?? record.owed_minutes;
    const recorded = Number(value);
    if (value != null && value !== '' && Number.isFinite(recorded) && recorded >= 0) return Math.round(recorded);
    const schedule = getRecordDaySchedule(record);
    if (!schedule?.active) return 0;
    const netMinutes = schedule.netMinutes != null ? Number(schedule.netMinutes)
        : timeStringToMinutes(schedule.out) - timeStringToMinutes(schedule.in) - (schedule.lunch ? 60 : 0);
    return Math.max(0, Math.round(netMinutes) || 0);
}

function getJustificationMinutes(record) {
    return record.type === 'Permiso' || record.type === 'Feriado'
        ? Math.max(0, Math.round((Number(record.hours_credited) || 0) * 60)) : 0;
}

function attachAbsenceJustifications(records) {
    const credits = new Map();
    const keyFor = record => JSON.stringify([record.employee_name, record.date]);
    records.forEach(record => {
        const key = keyFor(record);
        credits.set(key, (credits.get(key) || 0) + getJustificationMinutes(record));
    });
    return records.map(record => {
        if (record.type !== 'Falta') return record;
        const originalMinutes = getAbsenceRecordedMinutes(record);
        const justifiedMinutes = Math.min(originalMinutes, credits.get(keyFor(record)) || 0);
        const schedule = getRecordDaySchedule(record);
        return {
            ...record,
            absence_minutes: originalMinutes,
            justified_absence_minutes: justifiedMinutes,
            pending_absence_minutes: Math.max(0, originalMinutes - justifiedMinutes),
            is_fully_justified: originalMinutes > 0 && justifiedMinutes >= originalMinutes,
            is_partially_justified: justifiedMinutes > 0 && justifiedMinutes < originalMinutes,
            scheduled_in: record.scheduled_in || schedule?.in,
            scheduled_out: record.scheduled_out || schedule?.out,
            scheduled_lunch: record.scheduled_lunch ?? schedule?.lunch
        };
    });
}

function calculateMonthlyAttendanceSummary(workerName, month, records, now = new Date()) {
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const summary = {
        workedMinutes: 0, lateMinutes: 0, absenceMinutes: 0, absenceCount: 0,
        owedMinutes: 0, extraMinutes: 0, justifiedMinutes: 0, absences: []
    };
    const days = new Map();
    let adjustments = 0;
    for (const record of attachAbsenceJustifications(records)) {
        if (record.employee_name !== workerName || !record.date?.startsWith(month) || record.date > today) continue;
        if (!days.has(record.date)) days.set(record.date, { late: 0, earlyLeave: 0, absence: null, credits: 0 });
        const day = days.get(record.date);
        if (record.type === 'Ajuste') {
            adjustments += Number(record.owed_minutes) || 0;
        } else if (record.type === 'Permiso' || record.type === 'Feriado') {
            const credit = getJustificationMinutes(record);
            day.credits += credit;
            summary.justifiedMinutes += credit;
        } else if (record.type === 'Falta') {
            if (!day.absence || record.absence_minutes > day.absence.absence_minutes) day.absence = record;
        } else {
            const late = Math.max(0, Number(record.late_minutes) || 0);
            day.late += late;
            summary.lateMinutes += late;
            const earlyLeave = Number(record.owed_minutes) || 0;
            day.earlyLeave += Math.max(0, earlyLeave);
            adjustments += Math.min(0, earlyLeave);
            summary.workedMinutes += Math.max(0, Math.round((Number(record.hours_credited) || 0) * 60));
            summary.extraMinutes += Math.max(0, Number(record.extra_minutes) || 0);
        }
    }
    for (const day of days.values()) {
        const absentMinutes = day.absence?.absence_minutes || 0;
        if (day.absence) {
            summary.absenceCount++;
            summary.absenceMinutes += absentMinutes;
            summary.absences.push(day.absence);
        }
        summary.owedMinutes += Math.max(0, day.late + day.earlyLeave + absentMinutes - day.credits);
    }
    summary.owedMinutes = Math.max(0, summary.owedMinutes + adjustments);
    return summary;
}

// Get all attendance records merged with automatically detected absences
function getCombinedAttendanceRecords(month = null) {
    const autoAbsences = getDetectedAbsences(month);
    const combined = attachAbsenceJustifications([...attendanceRecords, ...autoAbsences]);
    return combined.sort((a, b) => {
        if (a.date !== b.date) {
            return b.date.localeCompare(a.date);
        }
        return (b.check_in || '').localeCompare(a.check_in || '');
    });
}

function calculateWeeklyGoal(worker, schedule, records, now = new Date()) {
    const monday = new Date(now);
    monday.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1));
    monday.setHours(0, 0, 0, 0);
    const nextMonday = new Date(monday);
    nextMonday.setDate(monday.getDate() + 7);
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    let targetHours = schedule.weeklyTarget == null ? 48 : Number(schedule.weeklyTarget);
    if (!Number.isFinite(targetHours) || targetHours < 0) targetHours = 48;
    const createdAt = worker.created_at || schedule.created_at;
    const created = createdAt ? new Date(String(createdAt).slice(0, 10) + 'T00:00:00') : null;
    if (created && created >= monday && created <= now) {
        let targetMinutes = 0;
        for (let day = 0; day < 7; day++) {
            const date = new Date(monday);
            date.setDate(monday.getDate() + day);
            const daySchedule = schedule[DAYS_ES[date.getDay()]];
            if (date < created || !daySchedule?.active) continue;
            const storedNetMinutes = Number(daySchedule.netMinutes);
            targetMinutes += daySchedule.netMinutes != null && Number.isFinite(storedNetMinutes)
                ? Math.max(0, storedNetMinutes)
                : Math.max(0, timeStringToMinutes(daySchedule.out) - timeStringToMinutes(daySchedule.in) - (daySchedule.lunch ? 60 : 0));
        }
        targetHours = targetMinutes / 60;
    }

    let confirmedMinutes = 0;
    let liveMinutes = 0;
    let liveExtraMinutes = 0;
    let pendingScheduledClosures = 0;
    let lunchPending = false;
    let invalidClosures = 0;
    for (const record of records) {
        if (record.employee_name !== worker.name || !record.date || record.date > today) continue;
        const date = new Date(record.date + 'T00:00:00');
        if (!(date >= monday && date < nextMonday)) continue;
        if (isInvalidAutomaticCheckout(record)) invalidClosures++;
        if (record.type === 'Falta' || record.type === 'Ajuste') continue;

        if (record.type === 'Trabajo' && record.date === today && record.check_in && !record.check_out) {
            const daySchedule = schedule[DAYS_ES[date.getDay()]];
            const isScheduled = daySchedule?.active && !isOutsideScheduledShift(record, daySchedule);
            const nowMinutes = now.getHours() * 60 + now.getMinutes();
            const endMinutes = isScheduled ? Math.min(nowMinutes, timeStringToMinutes(daySchedule.out)) : nowMinutes;
            const reachedEnd = isScheduled && nowMinutes >= timeStringToMinutes(daySchedule.out);
            const deductLunch = reachedEnd && getRecordLunchChoice(record);
            const elapsed = Math.max(0, endMinutes - timeStringToMinutes(record.check_in) - (deductLunch ? 60 : 0));
            liveMinutes += elapsed;
            const checkout = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}:00`;
            liveExtraMinutes += calculateShiftAccounting({ ...record, lunch: deductLunch }, checkout, daySchedule).extra_minutes;
            if (reachedEnd) pendingScheduledClosures++;
            if (elapsed > 0 && !reachedEnd && getRecordLunchChoice(record)) lunchPending = true;
        } else {
            const creditedHours = Number(record.hours_credited);
            if (Number.isFinite(creditedHours) && creditedHours > 0) confirmedMinutes += creditedHours * 60;
        }
    }
    return { targetHours, confirmedMinutes, liveMinutes, liveExtraMinutes, pendingScheduledClosures, lunchPending, invalidClosures };
}

function updateWeeklyGoalProgress(now = new Date()) {
    const help = document.getElementById('weeklyGoalHelpText');
    if (!selectedWorker) {
        progressPercentageText.textContent = '0%';
        weeklyGoalHoursText.textContent = '0.0 / 48.0 h';
        goalProgressBar.style.width = '0%';
        goalProgressBar.setAttribute('aria-valuenow', '0');
        if (help) help.textContent = 'Selecciona un colaborador para ver su avance de esta semana.';
        return;
    }
    const state = calculateWeeklyGoal(selectedWorker, workerSchedules[selectedWorker.name] || {}, attendanceRecords, now);
    const hours = (state.confirmedMinutes + state.liveMinutes) / 60;
    const percent = state.targetHours > 0 ? Math.min(100, hours / state.targetHours * 100) : 0;
    lblSelectedWorkerMeta.textContent = `Meta semanal fijada: ${state.targetHours.toFixed(1)} horas`;
    progressPercentageText.textContent = `${Math.round(percent)}%`;
    weeklyGoalHoursText.textContent = `${hours.toFixed(1)} / ${state.targetHours.toFixed(1)} h`;
    goalProgressBar.style.width = `${percent.toFixed(2)}%`;
    goalProgressBar.setAttribute('aria-valuenow', String(Math.round(percent)));
    const currentMonth = getTodayDateString().slice(0, 7);
    const confirmedExtraMinutes = attendanceRecords.filter(record =>
        record.employee_name === selectedWorker.name && record.date?.startsWith(currentMonth) && record.date <= getTodayDateString() &&
        (!record.check_in || record.check_out)
    ).reduce((total, record) => total + (Number(record.extra_minutes) || 0), 0);
    metricExtraHours.textContent = minutesToColonFormat(confirmedExtraMinutes + state.liveExtraMinutes);
    if (help) {
        help.textContent = state.liveMinutes > 0
            ? `Incluye ${minutesToHoursMinutes(state.liveMinutes)} en curso${state.lunchPending ? '; el refrigerio se descontará al cerrar' : ''}.`
            : 'Horas confirmadas de esta semana, de lunes a domingo.';
        if (state.pendingScheduledClosures > 0) {
            help.textContent += ' La jornada está pendiente de cierre automático; no se suman horas fuera del horario sin una nueva entrada.';
        }
        if (state.invalidClosures > 0) {
            help.textContent += ` Hay ${state.invalidClosures} cierre(s) automático(s) pendiente(s) de corregir.`;
        }
    }
}

function updateWorkerStats() {
    const now = new Date();
    const monthPeriod = document.getElementById('monthlySummaryPeriod');
    if (monthPeriod) {
        const label = now.toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });
        monthPeriod.textContent = label.charAt(0).toUpperCase() + label.slice(1);
    }
    if (!selectedWorker) {
        progressEmployeeTitle.innerHTML = '<span>⭐ Resumen del Trabajador</span>';
        lblSelectedWorkerMeta.textContent = 'Selecciona a alguien para ver sus horas';
        progressPercentageText.textContent = '0%';
        weeklyGoalHoursText.textContent = '0.0 / 48.0 h';
        goalProgressBar.style.width = '0%';

        metricWorkedHours.textContent = '0:00';
        metricLateHours.textContent = '0:00';
        if (metricAbsenceHours) metricAbsenceHours.textContent = '0:00';
        metricOwedHours.textContent = '0:00';
        metricExtraHours.textContent = '0:00';
        metricJustifiedHours.textContent = '0:00 h';
        if (workerAbsencesCard) workerAbsencesCard.style.display = 'none';
        updateWeeklyGoalProgress();
        return;
    }

    // Schedule info
    const schedule = workerSchedules[selectedWorker.name] || {};
    
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const currentMonthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;

    progressEmployeeTitle.innerHTML = `<span>${escapeAttendanceHtml(selectedWorker.emoji)} Resumen: ${escapeAttendanceHtml(selectedWorker.name)}</span>`;

    // Fetch combined records (actual records + detected unfulfilled scheduled days)
    const combinedMonthRecords = getCombinedAttendanceRecords(currentMonthStr);
    const workerRecords = combinedMonthRecords.filter(r => r.employee_name === selectedWorker.name);

    const summary = calculateMonthlyAttendanceSummary(selectedWorker.name, currentMonthStr, workerRecords, now);
    const {
        workedMinutes: totalWorkedMinutes,
        lateMinutes: totalLateMinutes,
        absenceMinutes: totalAbsenceMinutes,
        absenceCount: totalAbsenceCount,
        owedMinutes: totalOwedMinutes,
        extraMinutes: totalExtraMinutes,
        justifiedMinutes: totalJustifiedMinutes,
        absences: workerAbsencesList
    } = summary;

    // 5 KPI Cards
    metricWorkedHours.textContent = minutesToColonFormat(totalWorkedMinutes);
    metricLateHours.textContent = minutesToColonFormat(totalLateMinutes);
    if (metricAbsenceHours) {
        metricAbsenceHours.textContent = totalAbsenceCount > 0 
            ? `${totalAbsenceCount} (${minutesToColonFormat(totalAbsenceMinutes)})`
            : '0:00';
    }
    metricOwedHours.textContent = minutesToColonFormat(totalOwedMinutes);
    metricExtraHours.textContent = minutesToColonFormat(totalExtraMinutes);
    metricJustifiedHours.textContent = `${minutesToColonFormat(totalJustifiedMinutes)} h`;
    updateWeeklyGoalProgress(now);

    // Render Dedicated Absences / Faltas Box ("Cuadro de Faltas")
    if (workerAbsencesCard && absencesListContainer) {
        workerAbsencesCard.style.display = 'block';
        badgeAbsencesCount.textContent = `${totalAbsenceCount} ${totalAbsenceCount === 1 ? 'falta' : 'faltas'}`;

        if (totalAbsenceCount === 0) {
            absencesListContainer.innerHTML = `
                <div class="absence-item-empty">
                    <span>✨</span>
                    <strong>Sin faltas registradas este mes</strong>
                    <small>Las tardanzas se muestran por separado en el resumen mensual.</small>
                </div>
            `;
        } else {
            // Sort absences descending by date
            workerAbsencesList.sort((a, b) => b.date.localeCompare(a.date));
            absencesListContainer.innerHTML = '';

            const yesterdayDate = new Date(now);
            yesterdayDate.setDate(now.getDate() - 1);
            const yesterdayStr = `${yesterdayDate.getFullYear()}-${String(yesterdayDate.getMonth() + 1).padStart(2, '0')}-${String(yesterdayDate.getDate()).padStart(2, '0')}`;

            workerAbsencesList.forEach(abs => {
                const dateParts = abs.date.split('-');
                const dObj = new Date(parseInt(dateParts[0], 10), parseInt(dateParts[1], 10) - 1, parseInt(dateParts[2], 10));
                const dayName = DAYS_CAP[dObj.getDay()];
                const formattedDate = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;

                let relativeBadge = `${dayName} ${dateParts[2]}`;
                if (abs.date === yesterdayStr) {
                    relativeBadge = `⭐ Ayer (${dayName} ${dateParts[2]})`;
                }

                const item = document.createElement('div');
                item.className = 'absence-item-card';
                item.innerHTML = `
                    <div class="absence-item-header">
                        <div class="absence-item-date">
                            <span style="font-size: 16px;">📅</span>
                            <strong>${relativeBadge} - ${formattedDate}</strong>
                        </div>
                        <span class="badge-absence-hours">🚨 ${minutesToHoursMinutes(abs.absence_minutes)} de ausencia registrada</span>
                    </div>
                    <div class="absence-item-details">
                        <div>⏰ <strong>Horario programado:</strong> ${escapeAttendanceHtml(formatTimeTo12H(abs.scheduled_in || '08:00'))} a ${escapeAttendanceHtml(formatTimeTo12H(abs.scheduled_out || '16:30'))} (${abs.scheduled_lunch ? 'Con refrigerio' : 'Sin refrigerio'})</div>
                        <div style="margin-top: 3px; font-weight: 600; color: ${abs.is_fully_justified ? '#7e22ce' : '#b91c1c'};">
                            ${abs.is_fully_justified ? 'Justificada · se conserva en el historial.' : abs.is_partially_justified ? 'Justificada parcialmente · pendiente: ' + minutesToHoursMinutes(abs.pending_absence_minutes) + '.' : 'Sin justificar · se conserva en el historial del mes.'}
                        </div>
                    </div>
                    <div class="absence-item-actions">
                        <button type="button" class="btn btn-secondary btn-action-justify" data-action="justify" ${abs.pending_absence_minutes <= 0 ? 'disabled' : ''}>
                            <i data-lucide="gift" style="width: 13px; height: 13px; vertical-align: middle;"></i> ${abs.is_fully_justified ? 'Justificada' : abs.is_partially_justified ? 'Justificar pendiente' : 'Justificar Permiso'}
                        </button>
                        <button type="button" class="btn btn-secondary btn-action-regularize" data-action="regularize">
                            <i data-lucide="clock" style="width: 13px; height: 13px; vertical-align: middle;"></i> Regularizar Marcación
                        </button>
                    </div>
                `;
                item.querySelector('[data-action="justify"]').addEventListener('click', () => {
                    window.quickJustifyAbsence(abs.employee_name, abs.date, abs.pending_absence_minutes);
                });
                item.querySelector('[data-action="regularize"]').addEventListener('click', () => {
                    window.quickRegularizePunch(abs.employee_name, abs.date, abs.scheduled_in || '08:00', abs.scheduled_out || '16:30', abs.scheduled_lunch !== false);
                });
                absencesListContainer.appendChild(item);
            });

            if (window.lucide) lucide.createIcons();
        }
    }
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

    populateWeekFilter();
    const filtered = getFilteredAttendanceRecords();

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
    const todayStr = getTodayDateString();

    filtered.forEach(record => {
        const tr = document.createElement('tr');
        const isToday = record.date === todayStr;
        if (isToday) {
            tr.classList.add('row-today');
        }

        // Worker name + emoji
        const workerObj = activeWorkers.find(w => w.name === record.employee_name);
        const emoji = workerObj ? workerObj.emoji : '👤';

        // Format dates
        const dateParts = record.date ? record.date.split('-') : ['2026', '01', '01'];
        let formattedDate = escapeAttendanceHtml(`${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`);
        if (isToday) {
            formattedDate = `<span style="font-weight: 700; color: #be185d;">${formattedDate}</span> <span class="badge-today-tag">HOY</span>`;
        }

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
            typeChip = `<span class="chip chip-falta">🔴 Inasistencia (Falta)</span>`;
        } else if (record.type === 'Ajuste') {
            typeChip = `<span class="chip" style="background: #fef3c7; color: #b45309; border: 1px solid #fde68a; padding: 2px 8px; border-radius: 12px; font-weight: 600;">🟠 Ajuste / Perdón</span>`;
        }

        const inDisplay = (record.type === 'Falta' || record.type === 'Ajuste')
            ? `<span class="chip-absence">-</span>`
            : (record.check_in ? escapeAttendanceHtml(formatTimeTo12H(record.check_in.substring(0, 5))) : '-');

        const outDisplay = (record.type === 'Falta' || record.type === 'Ajuste')
            ? `<span class="chip-absence">-</span>`
            : (record.check_out ? escapeAttendanceHtml(formatTimeTo12H(record.check_out.substring(0, 5))) : '<span style="color: #059669; font-weight: 700;">En turno</span>');

        const hoursDisplay = record.type === 'Falta'
            ? `<strong style="color: var(--text-muted); font-size: 13.5px;">0.0 h</strong>`
            : `<strong style="color: var(--primary); font-size: 14px;">${record.hours_credited ? record.hours_credited.toFixed(1) + ' h' : '0.0 h'}</strong>`;

        let actionsCol = '';
        if (record.is_auto_absence) {
            actionsCol = `
                <div style="display: flex; gap: 4px; justify-content: center;">
                    <button type="button" class="btn-row-action btn-action-justify" title="${record.is_fully_justified ? 'Ausencia ya justificada' : 'Justificar con Permiso'}" data-action="justify" ${record.pending_absence_minutes <= 0 ? 'disabled' : ''}>
                        <i data-lucide="gift" style="width: 15px; height: 15px;"></i>
                    </button>
                    <button type="button" class="btn-row-action btn-action-regularize" title="Regularizar Marcación (si asistió)" data-action="regularize">
                        <i data-lucide="clock" style="width: 15px; height: 15px;"></i>
                    </button>
                </div>
            `;
        } else {
            actionsCol = `
                <button type="button" class="btn-row-action" title="Eliminar marcación" data-action="delete">
                    <i data-lucide="trash-2" style="width: 15px; height: 15px;"></i>
                </button>
            `;
        }

        tr.innerHTML = `
            <td><strong>${escapeAttendanceHtml(emoji)} ${escapeAttendanceHtml(record.employee_name)}</strong></td>
            <td>${formattedDate}</td>
            <td>${inDisplay}</td>
            <td>${outDisplay}</td>
            <td>${hoursDisplay}</td>
            <td>${lateChip}</td>
            <td>${extraChip}</td>
            <td>${typeChip}</td>
            <td style="max-width: 260px; font-size: 12px; color: var(--text-secondary);">
                ${escapeAttendanceHtml(record.notes || '-')}
                ${record.type === 'Falta' ? `<br><span class="badge-owed-mini">Ausencia registrada: ${minutesToHoursMinutes(record.absence_minutes)}</span><br><span class="${record.is_fully_justified ? 'chip-permiso' : 'chip-absence'}">${record.is_fully_justified ? 'Justificada · conservada en el historial' : record.is_partially_justified ? 'Justificada parcialmente' : 'Sin justificar'}</span>` : ''}
            </td>
            <td style="text-align: center;">
                ${actionsCol}
            </td>
        `;

        tr.querySelector('[data-action="justify"]')?.addEventListener('click', () => {
            window.quickJustifyAbsence(record.employee_name, record.date, record.pending_absence_minutes);
        });
        tr.querySelector('[data-action="regularize"]')?.addEventListener('click', () => {
            window.quickRegularizePunch(record.employee_name, record.date, record.scheduled_in || '08:00', record.scheduled_out || '16:30', record.scheduled_lunch !== false);
        });
        tr.querySelector('[data-action="delete"]')?.addEventListener('click', () => {
            window.confirmDeleteAttendanceRecord(record.id);
        });
        attendanceTableBody.appendChild(tr);
    });

    if (window.lucide) lucide.createIcons();
}

// Global function to trigger confirm delete modal
window.confirmDeleteAttendanceRecord = function (recordId) {
    requireAdmin(() => {
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
    });
};

// ==========================================================================
// 7. WIZARD: AGREGAR NUEVO TRABAJADOR (3 PASOS)
// ==========================================================================

let editingWorkerName = null;

function setupAddWorkerWizard() {
    // Open Wizard
    if (btnOpenAddWorkerModal) {
        btnOpenAddWorkerModal.addEventListener('click', () => {
            requireAdmin(() => {
                resetWizardForm();
                modalAddWorkerWizard.classList.add('active');
            });
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
        if (activeWorkers.some(w => w.name.toLowerCase() === name.toLowerCase() && w.name !== editingWorkerName)) {
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
        const isEditing = editingWorkerName !== null;
        const name = isEditing ? editingWorkerName : newWorkerNameInput.value.trim();
        const existingWorker = activeWorkers.find(w => w.name.toLowerCase() === name.toLowerCase());
        if (!name || (!isEditing && existingWorker)) {
            alert('Ingresa un nombre nuevo para registrar un colaborador.');
            return;
        }
        const emoji = selectedWorkerEmojiInput.value || '🌸';

        // Extract schedule from wizard inputs
        const newSchedule = {};
        let totalNetWeeklyMinutes = 0;

        for (const row of scheduleRows) {
            const dayKey = row.getAttribute('data-day');
            const isActive = row.querySelector('.day-active-cb').checked;
            const inVal = row.querySelector('.time-in').value || '08:00';
            const outVal = row.querySelector('.time-out').value || '18:00';
            const hasLunch = row.querySelector('.lunch-cb').checked;

            const inMins = timeStringToMinutes(inVal);
            const outMins = timeStringToMinutes(outVal);
            if (isActive && (!inVal || !outVal || outMins <= inMins)) {
                alert('La hora de salida debe ser posterior a la entrada en cada día activo.');
                row.querySelector('.time-out').focus();
                return;
            }
            const grossMins = outMins - inMins;
            const netMins = isActive ? Math.max(0, grossMins - (hasLunch ? 60 : 0)) : 0;

            if (isActive) totalNetWeeklyMinutes += netMins;

            newSchedule[dayKey] = {
                active: isActive,
                in: inVal,
                out: outVal,
                lunch: hasLunch,
                netMinutes: netMins
            };
        }

        const weeklyTargetHours = Number((totalNetWeeklyMinutes / 60).toFixed(1));
        newSchedule.weeklyTarget = weeklyTargetHours;

        btnWizardSave.disabled = true;
        btnWizardSave.textContent = 'Guardando...';

        try {
            const todayStr = getTodayDateString();
            const createdAt = existingWorker?.created_at || workerSchedules[name]?.created_at || todayStr;
            const newWorkerObj = { ...existingWorker, name, emoji, is_active: true, created_at: createdAt };
            newSchedule.created_at = createdAt;

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
            if (isEditing) {
                const workerIndex = activeWorkers.findIndex(w => w.name === name);
                activeWorkers = activeWorkers.filter(w => w.name !== name);
                activeWorkers.splice(workerIndex < 0 ? activeWorkers.length : workerIndex, 0, newWorkerObj);
            } else {
                activeWorkers.push(newWorkerObj);
            }
            workerSchedules[name] = newSchedule;
            saveLocalWorkersAndSchedules();

            // Refresh UI
            renderWorkerDropdowns();
            renderTeamLiveStatus();
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
    editingWorkerName = null;
    newWorkerNameInput.readOnly = false;
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
        row.querySelector('.time-out').value = '18:00';
        row.querySelector('.lunch-cb').checked = true;
        recalculateDayCardHours(row);
    });

    recalculateWizardWeeklyHours();
}

function recalculateDayCardHours(row) {
    const isActive = row.querySelector('.day-active-cb').checked;
    const inVal = row.querySelector('.time-in').value || '08:00';
    const outVal = row.querySelector('.time-out').value || '18:00';
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
            const outVal = row.querySelector('.time-out').value || '18:00';
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

        requireAdmin(() => {
            resetWizardForm();
            editingWorkerName = selectedWorker.name;
            newWorkerNameInput.readOnly = true;
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
    });
}

// Reduce Debt
function setupReduceDebt() {
    if (!btnReduceDebt) return;

    const modalReduceDebt = document.getElementById('modalReduceDebt');
    const btnCloseReduceDebt = document.getElementById('btnCloseReduceDebt');
    const formReduceDebt = document.getElementById('formReduceDebt');
    const reduceDebtWorkerName = document.getElementById('reduceDebtWorkerName');
    const reduceDebtCurrentValue = document.getElementById('reduceDebtCurrentValue');
    const reduceDebtHours = document.getElementById('reduceDebtHours');
    const reduceDebtMinutes = document.getElementById('reduceDebtMinutes');
    const reduceDebtNotes = document.getElementById('reduceDebtNotes');

    if (btnCloseReduceDebt) {
        btnCloseReduceDebt.addEventListener('click', () => {
            modalReduceDebt.classList.remove('active');
        });
    }

    btnReduceDebt.addEventListener('click', () => {
        if (!selectedWorker) return;

        requireAdmin(() => {
            const currentOwedStr = metricOwedHours.textContent;
            
            reduceDebtWorkerName.textContent = selectedWorker.name;
            reduceDebtCurrentValue.textContent = currentOwedStr;
            reduceDebtHours.value = 0;
            reduceDebtMinutes.value = 0;
            reduceDebtNotes.value = '';

            modalReduceDebt.classList.add('active');
        });
    });

    if (formReduceDebt) {
        formReduceDebt.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!selectedWorker) return;

            const h = parseInt(reduceDebtHours.value, 10) || 0;
            const m = parseInt(reduceDebtMinutes.value, 10) || 0;
            const mins = (h * 60) + m;

            if (mins <= 0) {
                alert("Por favor ingresa un tiempo mayor a 0.");
                return;
            }

            const confirmMsg = `¿Confirmas que deseas perdonar ${h}h ${m}m a ${selectedWorker.name}?`;
            if (!confirm(confirmMsg)) return;

            const dateVal = getTodayDateString();
            const notesVal = reduceDebtNotes.value.trim() || `Ajuste manual: reducción de deuda (${h}h ${m}m).`;
            
            const newRecord = {
                id: generateUUID(),
                employee_name: selectedWorker.name,
                date: dateVal,
                check_in: null,
                check_out: null,
                type: 'Ajuste',
                hours_credited: 0,
                late_minutes: 0,
                extra_minutes: 0,
                owed_minutes: -mins,
                notes: notesVal
            };

            try {
                if (dbMode === 'supabase' && supabaseClient) {
                    const { error } = await supabaseClient
                        .from('asistencias_v2')
                        .insert([newRecord]);
                    if (error) throw error;
                } else {
                    const localList = getLocalAttendance();
                    localList.unshift(newRecord);
                    saveLocalAttendance(localList);
                }

                modalReduceDebt.classList.remove('active');
                await loadAttendanceRecords();
                handleWorkerChange(); // Refresh UI for the worker
                alert('Deuda reducida con éxito.');
            } catch (err) {
                alert('Error al reducir deuda: ' + err.message);
            }
        });
    }
}

// Delete Worker
function setupDeleteWorker() {
    if (!btnDeleteWorker) return;

    btnDeleteWorker.addEventListener('click', () => {
        if (!selectedWorker) return;

        requireAdmin(() => {
            confirmModalTitle.textContent = `¿Dar de baja a ${selectedWorker.name}?`;
            confirmModalText.textContent = `El colaborador no aparecerá más en la lista de marcaciones activas. Sus registros históricos se mantendrán.`;
            modalConfirmAction.classList.add('active');

            confirmActionCallback = async () => {
                try {
                    if (dbMode === 'supabase' && supabaseClient) {
                        const { error } = await supabaseClient
                            .from('personal_asistencia_v2')
                            .update({ is_active: false })
                            .eq('name', selectedWorker.name);
                        if (error) throw error;
                    }

                    activeWorkers = activeWorkers.filter(w => w.name !== selectedWorker.name);
                    saveLocalWorkersAndSchedules();

                    selectedWorker = null;
                    renderWorkerDropdowns();
                    renderTeamLiveStatus();
                    handleWorkerChange();
                    alert('Colaborador dado de baja.');
                } catch (err) {
                    alert('Error al dar de baja: ' + err.message);
                }
            };
        });
    });
}

// ==========================================================================
// 8. MODAL: REGISTRAR FERIADO / PERMISO ESPECIAL (MORADO)
// ==========================================================================

function setupAdminRegisterModal() {
    if (btnAdminActions) {
        btnAdminActions.addEventListener('click', () => {
            requireAdmin(() => {
                adminRegisterDate.value = getTodayDateString();
                adminRegisterHours.value = '8';
                adminRegisterMinutes.value = '0';
                adminRegisterNotes.value = '';
                adminRegisterType.value = 'Feriado';
                adminEmployeeSelectGroup.style.display = 'none';
                modalAdminRegister.classList.add('active');
            });
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

        let creditedHours = credited;
        let owedMins = 0;
        let checkIn = '08:00:00';
        let checkOut = '16:00:00';

        if (type === 'Falta') {
            creditedHours = 0; // Faltas no deben sumar horas abonadas
            owedMins = Math.round((hours * 60) + mins);
            checkIn = null;
            checkOut = null;
        }

        const recordsToInsert = workersToCredit.map(workerName => ({
            id: generateUUID(),
            employee_name: workerName,
            date: dateVal,
            check_in: checkIn,
            check_out: checkOut,
            type: type,
            hours_credited: creditedHours,
            late_minutes: 0,
            extra_minutes: 0,
            owed_minutes: owedMins,
            notes: notes
        }));

        try {
            if (dbMode === 'supabase' && supabaseClient) {
                const { error } = await supabaseClient
                    .from('asistencias_v2')
                    .insert(recordsToInsert);
                if (error) throw error;
            } else {
                const localList = getLocalAttendance();
                recordsToInsert.forEach(r => localList.unshift(r));
                saveLocalAttendance(localList);
            }

            modalAdminRegister.classList.remove('active');
            await loadAttendanceRecords();
            if (selectedWorker) {
                updateWorkerStats();
            }

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
// 9. MODAL: REGULARIZAR MARCACIÓN OLVIDADA
// ==========================================================================

function setupManualPunchModal() {
    if (!formManualPunch) return;

    if (btnCloseManualPunch) {
        btnCloseManualPunch.addEventListener('click', () => {
            modalManualPunch.classList.remove('active');
        });
    }

    formManualPunch.addEventListener('submit', async (e) => {
        e.preventDefault();
        let authorized = false;
        requireAdmin(() => { authorized = true; });
        if (!authorized) return;
        const workerName = manualPunchWorker.value;
        const dateVal = manualPunchDate.value;
        const inVal = manualPunchIn.value;
        const outVal = manualPunchOut.value;
        const tookLunch = manualPunchLunch.checked;
        const notesVal = manualPunchNotes.value.trim() || 'Marcación regularizada por olvido';

        if (!workerName || !dateVal || !inVal || !outVal) {
            alert('Por favor completa todos los campos requeridos.');
            return;
        }

        const inMins = timeStringToMinutes(inVal);
        const outMins = timeStringToMinutes(outVal);
        if (outMins <= inMins) {
            alert('La hora de salida debe ser posterior a la entrada.');
            manualPunchOut.focus();
            return;
        }
        const grossMins = outMins - inMins;
        const lunchDeduction = tookLunch ? 60 : 0;
        const netMins = Math.max(0, grossMins - lunchDeduction);
        const credited = Number((netMins / 60).toFixed(2));

        // Evaluate against worker schedule
        const d = new Date(dateVal + 'T00:00:00');
        const dayKey = DAYS_ES[d.getDay()];
        const sched = (workerSchedules[workerName] && workerSchedules[workerName][dayKey]) || null;

        const accounting = calculateShiftAccounting({
            check_in: inVal,
            lunch: tookLunch,
            late_minutes: sched?.active && inMins > timeStringToMinutes(sched.in) && inMins < timeStringToMinutes(sched.out)
                ? inMins - timeStringToMinutes(sched.in) : 0,
            notes: notesVal
        }, outVal, sched);
        const lateMins = accounting.late_minutes;
        const extraMins = accounting.extra_minutes;
        const owedMins = accounting.owed_minutes;

        const newShift = {
            id: generateUUID(),
            employee_name: workerName,
            date: dateVal,
            check_in: `${inVal}:00`,
            check_out: `${outVal}:00`,
            type: 'Trabajo',
            hours_credited: credited,
            late_minutes: lateMins,
            extra_minutes: extraMins,
            owed_minutes: owedMins,
            notes: `${notesVal} (${tookLunch ? 'Con refrigerio -1h' : 'Sin refrigerio'}).`
        };

        try {
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

            modalManualPunch.classList.remove('active');
            await loadAttendanceRecords();
            if (selectedWorker && selectedWorker.name === workerName) {
                updateWorkerStats();
            }
            alert('¡Marcación regularizada guardada con éxito! La jornada ha sido contabilizada.');
        } catch (err) {
            alert('Error al guardar marcación: ' + err.message);
        }
    });
}

// Global Quick Action Triggers
window.quickJustifyAbsence = function (workerName, dateStr, owedMinutes) {
    if (!modalAdminRegister) return;
    const pendingMinutes = Math.max(0, Math.round(Number(owedMinutes) || 0));
    if (pendingMinutes <= 0) return;
    requireAdmin(() => {
        adminRegisterType.value = 'Permiso';
        adminEmployeeSelectGroup.style.display = 'block';
        adminEmployeeSelect.value = workerName;
        adminRegisterDate.value = dateStr;

        const hours = Math.floor(pendingMinutes / 60);
        const mins = pendingMinutes % 60;
        adminRegisterHours.value = String(hours);
        adminRegisterMinutes.value = String(mins);
        adminRegisterNotes.value = 'Permiso justificado por inasistencia';
        modalAdminRegister.classList.add('active');
    });
};

window.quickRegularizePunch = function (workerName, dateStr, schedIn, schedOut, schedLunch) {
    if (!modalManualPunch) return;
    requireAdmin(() => {
        manualPunchWorker.value = workerName;
        manualPunchDate.value = dateStr;
        manualPunchIn.value = schedIn || '08:00';
        manualPunchOut.value = schedOut || '16:30';
        manualPunchLunch.checked = schedLunch !== false;
        manualPunchNotes.value = 'Marcación regularizada por olvido en sistema';
        modalManualPunch.classList.add('active');
    });
};

// ==========================================================================
// 10. EXCEL EXPORT (ExcelJS)
// ==========================================================================

function setupExcelExport() {
    const excelButtons = document.querySelectorAll('#btnExportExcel, .btn-excel');
    if (!excelButtons || excelButtons.length === 0) return;

    excelButtons.forEach(btn => {
        btn.addEventListener('click', async () => {
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
                { header: 'Tipo', key: 'tipo', width: 20 },
                { header: 'Observaciones', key: 'notas', width: 40 }
            ];

            // Title styling
            worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
            worksheet.getRow(1).fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFFF3385' }
            };

            const selMonth = filterMonth.value;
            const recordsToExport = getFilteredAttendanceRecords();

            recordsToExport.forEach(r => {
                let entradaVal = '';
                let salidaVal = '';
                if (r.type === 'Falta') {
                    entradaVal = 'Sin marcar';
                    salidaVal = 'Sin marcar';
                } else {
                    entradaVal = r.check_in ? formatTimeTo12H(r.check_in.substring(0, 5)) : '-';
                    salidaVal = r.check_out ? formatTimeTo12H(r.check_out.substring(0, 5)) : 'En turno';
                }

                worksheet.addRow({
                    colaborador: r.employee_name,
                    fecha: r.date,
                    entrada: entradaVal,
                    salida: salidaVal,
                    horas: r.hours_credited || 0,
                    tardanza: r.late_minutes || 0,
                    extras: r.extra_minutes || 0,
                    tipo: r.type === 'Falta' ? 'Inasistencia (Falta)' : r.type,
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

function setupAccessibleModals() {
    const modals = Array.from(document.querySelectorAll('.modal-backdrop'));
    const openModals = [];
    const returnFocus = new WeakMap();
    const topModal = () => openModals[openModals.length - 1];

    const focusableElements = modal => Array.from(modal.querySelectorAll(
        'a[href], button, input, select, textarea, [tabindex]'
    )).filter(element =>
        !element.disabled && element.type !== 'hidden' && element.tabIndex >= 0 &&
        !element.closest('[inert]') && element.getClientRects().length > 0
    );

    function focusModal(modal) {
        const elements = focusableElements(modal);
        const target = elements.find(element => element.matches('input, select, textarea')) ||
            elements[0] || modal.querySelector('.modal-card');
        if (target) target.focus();
    }

    function syncModal(modal) {
        const isOpen = modal.classList.contains('active');
        const openIndex = openModals.indexOf(modal);
        if (isOpen) {
            modal.inert = false;
            modal.setAttribute('aria-hidden', 'false');
            if (openIndex === -1) {
                returnFocus.set(modal, document.activeElement);
                openModals.push(modal);
                focusModal(modal);
            }
            return;
        }

        if (openIndex !== -1) openModals.splice(openIndex, 1);
        if (modal.contains(document.activeElement)) {
            const opener = returnFocus.get(modal);
            if (topModal()) focusModal(topModal());
            else if (opener && opener.isConnected) opener.focus();
            if (modal.contains(document.activeElement)) document.activeElement.blur();
        }
        modal.inert = true;
        modal.setAttribute('aria-hidden', 'true');
    }

    modals.forEach(modal => {
        syncModal(modal);
        new MutationObserver(() => syncModal(modal)).observe(modal, {
            attributes: true, attributeFilter: ['class']
        });
    });

    document.addEventListener('keydown', event => {
        const modal = topModal();
        if (!modal) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            const closeButton = modal.querySelector('.btn-close, #btnCancelConfirm');
            if (closeButton) closeButton.click();
            else modal.classList.remove('active');
            return;
        }
        if (event.key !== 'Tab') return;
        const elements = focusableElements(modal);
        if (!elements.length) {
            event.preventDefault();
            focusModal(modal);
            return;
        }
        const active = document.activeElement;
        if (event.shiftKey && (active === elements[0] || !elements.includes(active))) {
            event.preventDefault();
            elements[elements.length - 1].focus();
        } else if (!event.shiftKey && (active === elements[elements.length - 1] || !elements.includes(active))) {
            event.preventDefault();
            elements[0].focus();
        }
    });

    document.addEventListener('focusin', event => {
        const modal = topModal();
        if (modal && !modal.contains(event.target)) focusModal(modal);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    setupAccessibleModals();
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
    setupReduceDebt();
    setupDeleteWorker();
    setupAdminRegisterModal();
    setupManualPunchModal();
    setupConfirmModal();
    setupExcelExport();

    // 5. Connect Database & Load Data
    initDatabase();
});
