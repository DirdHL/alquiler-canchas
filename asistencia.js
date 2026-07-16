// ==========================================================================
// CanchaPro - Attendance System Javascript Logic
// ==========================================================================

let dbMode = 'local'; // 'local' or 'supabase'
let supabaseClient = null;
let allAttendanceRecords = [];
let employeeList = ['Admin', 'Rogger', 'Vicky'];
let activeEmployeesList = ['Admin', 'Rogger', 'Vicky'];
let selectedEmployeeName = '';
let realtimeChannel = null;
let adminAuthCallback = null;
let isCheckingAutoCheckout = false; // Guard to prevent infinite recursion during updates

// Employee emojis mapping helper
function getEmployeeNameWithEmoji(name) {
    if (!name) return '';
    const emojiMap = {
        'Ana': '🌸',
        'Jonathan': '🦉',
        'Ximena': '👹',
        'Rogger': '🚬🗿',
        'Angelica': '🎀',
        'Alison': '🦋🌙'
    };

    // Try exact match first
    if (emojiMap[name]) {
        return `${name} ${emojiMap[name]}`;
    }

    // Try case-insensitive partial match (so full names like "Ana Maria" or "Jonathan Silva" still match)
    const lowerName = name.toLowerCase();
    for (const key in emojiMap) {
        if (lowerName.includes(key.toLowerCase())) {
            return `${name} ${emojiMap[key]}`;
        }
    }
    return name;
}

// DOM Elements
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const statusDesc = document.getElementById('statusDesc');

const liveClock = document.getElementById('liveClock');
const liveDate = document.getElementById('liveDate');
const employeeSelect = document.getElementById('employeeSelect');
const employeeStatusBox = document.getElementById('employeeStatusBox');
const btnToggleAttendance = document.getElementById('btnToggleAttendance');

const progressEmployeeTitle = document.getElementById('progressEmployeeTitle');
const progressPercentageText = document.getElementById('progressPercentageText');
const goalProgressBar = document.getElementById('goalProgressBar');
const progressCurrentText = document.getElementById('progressCurrentText');

const metricWorkedHours = document.getElementById('metricWorkedHours');
const metricJustifiedHours = document.getElementById('metricJustifiedHours');
const metricOwedHours = document.getElementById('metricOwedHours');

const filterEmployee = document.getElementById('filterEmployee');
const filterMonth = document.getElementById('filterMonth');
const attendanceTableBody = document.getElementById('attendanceTableBody');

// Monthly metrics elements
const statsWorkedHours = document.getElementById('statsWorkedHours');
const statsJustifiedHours = document.getElementById('statsJustifiedHours');
const statsTotalMonthHours = document.getElementById('statsTotalMonthHours');
const statsRequiredHours = document.getElementById('statsRequiredHours');
const statsOwedHours = document.getElementById('statsOwedHours');
const labelRequiredHours = document.getElementById('labelRequiredHours');
const statsDaysWorked = document.getElementById('statsDaysWorked');
const statsDaysJustified = document.getElementById('statsDaysJustified');
const statsMonthlyOvertime = document.getElementById('statsMonthlyOvertime');

const btnAdminActions = document.getElementById('btnAdminActions');
const modalAdminAuth = document.getElementById('modalAdminAuth');
const btnCloseAdminAuth = document.getElementById('btnCloseAdminAuth');
const formAdminAuth = document.getElementById('formAdminAuth');
const adminPasswordInput = document.getElementById('adminPassword');
const adminAuthError = document.getElementById('adminAuthError');

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
const adminRegisterError = document.getElementById('adminRegisterError');

const modalUserOnboarding = document.getElementById('modalUserOnboarding');
const formUserOnboarding = document.getElementById('formUserOnboarding');
const onboardingNameInput = document.getElementById('onboardingName');
const displayUserName = document.getElementById('displayUserName');
const btnEditUser = document.getElementById('btnEditUser');

// System Guide Elements
const btnOpenGuide = document.getElementById('btnOpenGuide');
const modalSystemGuide = document.getElementById('modalSystemGuide');
const btnCloseGuide = document.getElementById('btnCloseGuide');
const btnCloseGuideBtn = document.getElementById('btnCloseGuideBtn');

// Lunch Toggle Elements
const lunchToggleGroup = document.getElementById('lunchToggleGroup');
const lunchCheckbox = document.getElementById('lunchCheckbox');

// Early Start Elements
const earlyStartToggleGroup = document.getElementById('earlyStartToggleGroup');
const earlyStartCheckbox = document.getElementById('earlyStartCheckbox');
const earlyStartLabel = document.getElementById('earlyStartLabel');
const earlyStartHelp = document.getElementById('earlyStartHelp');

// Auto Check-out Elements
const autoCheckoutToggleGroup = document.getElementById('autoCheckoutToggleGroup');
const autoCheckoutEnabled = document.getElementById('autoCheckoutEnabled');
const autoCheckoutDetails = document.getElementById('autoCheckoutDetails');
const autoCheckoutTimeInput = document.getElementById('autoCheckoutTimeInput');
const autoCheckoutAmpmSelect = document.getElementById('autoCheckoutAmpmSelect');

// Sidebar toggle for mobile drawer
const sidebar = document.getElementById('sidebar');
const sidebarBackdrop = document.getElementById('sidebarBackdrop');
const btnToggleSidebar = document.getElementById('btnToggleSidebar');
const btnCloseSidebar = document.getElementById('btnCloseSidebar');

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Icons
    if (window.lucide) lucide.createIcons();

    // 2. Start Live clock
    startClock();

    // 3. Check Operator Identity
    checkOperatorIdentity();

    // 4. Setup Event Listeners
    setupEventListeners();

    // 5. Connect to database
    loadDatabaseSettings();
});

// Live Clock function
function startClock() {
    const updateTime = () => {
        const now = new Date();

        // Time HH:MM:SS
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        liveClock.textContent = `${hours}:${minutes}:${seconds}`;

        // Date Spanish
        const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
        liveDate.textContent = `🌸 ${now.toLocaleDateString('es-ES', options)} 🌸`;

        // Every minute (on second 00), check auto-checkouts
        if (seconds === '00') {
            if (!isCheckingAutoCheckout) {
                isCheckingAutoCheckout = true;
                checkAndProcessAutoCheckouts().finally(() => {
                    isCheckingAutoCheckout = false;
                });
            }
        }
    };

    updateTime();
    setInterval(updateTime, 1000);
}

// Check Operator Identity
function checkOperatorIdentity() {
    const savedName = localStorage.getItem('canchapro_user_name');
    if (!savedName) {
        openModal(modalUserOnboarding);
        setTimeout(() => onboardingNameInput.focus(), 100);
    } else {
        displayUserName.textContent = savedName;
    }
}

// Handle Operator Identity form
if (formUserOnboarding) {
    formUserOnboarding.addEventListener('submit', (e) => {
        e.preventDefault();
        const rawName = onboardingNameInput.value.trim();
        if (rawName) {
            const formattedName = rawName
                .split(/\s+/)
                .map(word => {
                    if (!word) return '';
                    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
                })
                .filter(word => word.length > 0)
                .join(' ');
            localStorage.setItem('canchapro_user_name', formattedName);
            displayUserName.textContent = formattedName;
            closeModal(modalUserOnboarding);
            addHistoryEntry('crear', `inició sesión en control de asistencia`);
        }
    });
}

if (btnEditUser) {
    btnEditUser.addEventListener('click', () => {
        const currentName = localStorage.getItem('canchapro_user_name') || '';
        onboardingNameInput.value = currentName;
        openModal(modalUserOnboarding);
    });
}

// Load Supabase Settings
function loadDatabaseSettings() {
    const url = localStorage.getItem('canchapro_supabase_url');
    const key = localStorage.getItem('canchapro_supabase_key');

    if (url && key) {
        try {
            supabaseClient = supabase.createClient(url, key);
            dbMode = 'supabase';
            testSupabaseSilent();
        } catch (e) {
            console.error("Supabase client init error:", e);
            setLocalMode();
        }
    } else {
        setLocalMode();
    }
}

function setLocalMode() {
    dbMode = 'local';
    supabaseClient = null;
    updateStatusUI(false);
    fetchAttendanceRecords();
}

function updateStatusUI(connected, errorMsg = null) {
    if (connected) {
        statusDot.className = 'status-dot connected';
        statusText.textContent = 'Conectado a la Nube (Supabase)';
        statusDesc.textContent = 'Las asistencias están sincronizadas con la nube en tiempo real.';
    } else {
        statusDot.className = 'status-dot disconnected';
        if (errorMsg) {
            statusText.textContent = 'Error de Conexión (Supabase)';
            statusDesc.textContent = errorMsg;
        } else {
            statusText.textContent = 'Modo Sin Conexión (Local)';
            statusDesc.textContent = 'Las asistencias se guardarán de forma local en este navegador.';
        }
    }
}

async function testSupabaseSilent() {
    try {
        const { error } = await supabaseClient.from('asistencias').select('id').limit(1);
        if (error) throw error;

        updateStatusUI(true);
        setupRealtimeSubscription();
        fetchAttendanceRecords();
    } catch (err) {
        console.warn("Supabase table error:", err.message);
        updateStatusUI(false, 'Configurado, pero no pudimos conectar a la tabla "asistencias". ¿Ejecutaste el SQL?');
        fetchAttendanceRecords(); // Fallback to local data
    }
}

// Realtime Sync Subscription
function setupRealtimeSubscription() {
    if (!supabaseClient) return;

    if (realtimeChannel) {
        supabaseClient.removeChannel(realtimeChannel);
    }

    realtimeChannel = supabaseClient.channel('realtime_asistencias')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'asistencias' }, () => {
            fetchAttendanceRecords();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'personal_asistencia' }, () => {
            fetchAttendanceRecords();
        })
        .subscribe();
}

// Fetch Attendance records
async function fetchAttendanceRecords() {
    try {
        if (dbMode === 'supabase' && supabaseClient) {
            // 1. Fetch attendance records
            const { data, error } = await supabaseClient
                .from('asistencias')
                .select('*')
                .order('date', { ascending: false })
                .order('check_in', { ascending: false });

            if (error) throw error;
            allAttendanceRecords = data || [];

            // 2. Fetch active employees from personal_asistencia
            try {
                const { data: empData, error: empError } = await supabaseClient
                    .from('personal_asistencia')
                    .select('name')
                    .eq('is_active', true)
                    .order('name', { ascending: true });

                if (empError) throw empError;

                if (empData && empData.length > 0) {
                    activeEmployeesList = empData.map(e => e.name);
                } else {
                    activeEmployeesList = ['Admin', 'Rogger', 'Vicky'];
                }
            } catch (empErr) {
                console.warn("Table personal_asistencia not found or failed, using localStorage fallback:", empErr.message);
                loadActiveEmployeesFromLocal();
            }
        } else {
            allAttendanceRecords = getLocalAttendance();
            loadActiveEmployeesFromLocal();
        }
    } catch (err) {
        console.error("Error fetching attendance:", err);
        allAttendanceRecords = getLocalAttendance();
        loadActiveEmployeesFromLocal();
    }

    // Refresh dynamic list of employee names based on records and defaults
    refreshEmployeeList();

    // Re-populate select boxes
    populateEmployeeDropdowns();
    populateMonthFilter();

    // Render Table and Recalculate stats
    renderAttendanceTable();
    updateEmployeeStats();

    // Run auto-checkout check if not already running
    if (!isCheckingAutoCheckout) {
        isCheckingAutoCheckout = true;
        checkAndProcessAutoCheckouts().finally(() => {
            isCheckingAutoCheckout = false;
        });
    }
}

function loadActiveEmployeesFromLocal() {
    try {
        let savedCustom = localStorage.getItem('canchapro_custom_employees');
        if (savedCustom === null) {
            const defaults = ['Admin', 'Rogger', 'Vicky'];
            localStorage.setItem('canchapro_custom_employees', JSON.stringify(defaults));
            activeEmployeesList = defaults;
        } else {
            activeEmployeesList = JSON.parse(savedCustom);
        }
    } catch (e) {
        console.warn("Error loading custom employee list from local:", e);
        activeEmployeesList = ['Admin', 'Rogger', 'Vicky'];
    }
}

// Refresh employee names dynamically (combines active + historical records)
function refreshEmployeeList() {
    const recordNames = new Set(allAttendanceRecords.map(r => r.employee_name).filter(name => name && name !== 'Todos'));

    // Also include active workers
    activeEmployeesList.forEach(name => recordNames.add(name));

    employeeList = Array.from(recordNames).sort();
}

// Populate dropdown select inputs
function populateEmployeeDropdowns() {
    // Save current selection to restore it
    const currentSelVal = employeeSelect.value;
    const currentFilterVal = filterEmployee.value;
    const currentAdminVal = adminEmployeeSelect.value;

    const activeEmployees = activeEmployeesList;

    // 1. Mark Clock dropdown (Active employees only)
    employeeSelect.innerHTML = '<option value="" disabled selected>-- Elige tu Nombre --</option>';
    activeEmployees.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = getEmployeeNameWithEmoji(name);
        employeeSelect.appendChild(option);
    });

    // Admin option to register new worker
    const optAdd = document.createElement('option');
    optAdd.value = '_add_new_';
    optAdd.textContent = '➕ Agregar nuevo trabajador...';
    optAdd.style.fontWeight = '600';
    optAdd.style.color = 'var(--primary)';
    employeeSelect.appendChild(optAdd);

    // Admin option to delete a worker
    const optDel = document.createElement('option');
    optDel.value = '_delete_';
    optDel.textContent = '➖ Eliminar trabajador...';
    optDel.style.fontWeight = '600';
    optDel.style.color = 'var(--danger)';
    employeeSelect.appendChild(optDel);

    // 2. Filter Table dropdown (All employees who have records + active ones)
    filterEmployee.innerHTML = '<option value="todos">Todos los trabajadores</option>';
    employeeList.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = getEmployeeNameWithEmoji(name);
        filterEmployee.appendChild(option);
    });

    // 3. Admin register employee dropdown (Active employees only)
    adminEmployeeSelect.innerHTML = '';
    activeEmployees.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = getEmployeeNameWithEmoji(name);
        adminEmployeeSelect.appendChild(option);
    });

    // Restore selections if valid
    if (employeeSelect.querySelector(`option[value="${currentSelVal}"]`)) {
        employeeSelect.value = currentSelVal;
    }
    if (currentFilterVal === 'todos' || employeeList.includes(currentFilterVal)) {
        filterEmployee.value = currentFilterVal;
    }
    if (activeEmployees.includes(currentAdminVal)) {
        adminEmployeeSelect.value = currentAdminVal;
    }
}

// Populate Month filter list dynamically
function populateMonthFilter() {
    const currentSelMonth = filterMonth.value;
    const months = new Set();

    // Add current month always
    const today = new Date();
    const currentYearMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    months.add(currentYearMonth);

    // Add unique months from all attendance records
    allAttendanceRecords.forEach(r => {
        if (r.date) {
            const parts = r.date.split('-'); // YYYY-MM-DD
            if (parts.length === 3) {
                months.add(`${parts[0]}-${parts[1]}`);
            }
        }
    });

    // Sort months descending
    const sortedMonths = Array.from(months).sort().reverse();

    filterMonth.innerHTML = '';
    sortedMonths.forEach(ym => {
        const option = document.createElement('option');
        option.value = ym;

        const [year, month] = ym.split('-');
        const dateObj = new Date(year, month - 1, 1);
        const monthName = dateObj.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
        option.textContent = monthName.charAt(0).toUpperCase() + monthName.slice(1);

        filterMonth.appendChild(option);
    });

    if (sortedMonths.includes(currentSelMonth)) {
        filterMonth.value = currentSelMonth;
    } else {
        filterMonth.value = currentYearMonth;
    }
    updateWeekFilterOptions();
}

// Calculate weeks of the month (starting Monday, ending Sunday or end of month)
function getWeeksOfMonth(yearMonthStr) {
    const [year, month] = yearMonthStr.split('-').map(Number);
    const jsMonth = month - 1;
    const lastDay = new Date(year, month, 0).getDate();

    const weeks = [];
    let currentWeek = { start: 1, end: 1 };

    for (let day = 1; day <= lastDay; day++) {
        const d = new Date(year, jsMonth, day);
        const dayOfWeek = d.getDay(); // 0 = Sunday, 1 = Monday, ...

        if (day === 1) {
            currentWeek.start = 1;
        }

        if (dayOfWeek === 0 || day === lastDay) {
            currentWeek.end = day;
            weeks.push({ ...currentWeek });
            if (day < lastDay) {
                currentWeek = { start: day + 1, end: day + 1 };
            }
        }
    }
    return weeks;
}

// Update options for the week selector dropdown
function updateWeekFilterOptions() {
    const filterWeek = document.getElementById('filterWeek');
    if (!filterWeek) return;

    const selectedMonth = filterMonth.value;
    if (!selectedMonth) {
        filterWeek.innerHTML = '<option value="todas">Todas las semanas</option>';
        return;
    }

    const weeks = getWeeksOfMonth(selectedMonth);
    let html = '<option value="todas">Todas las semanas</option>';
    weeks.forEach((w, index) => {
        const startFormatted = String(w.start).padStart(2, '0');
        const endFormatted = String(w.end).padStart(2, '0');
        const [, month] = selectedMonth.split('-');
        html += `<option value="${w.start}-${w.end}">Semana ${index + 1} (${startFormatted}/${month} al ${endFormatted}/${month})</option>`;
    });
    filterWeek.innerHTML = html;
}

// LocalStorage helpers for attendance
function getLocalAttendance() {
    const data = localStorage.getItem('canchapro_asistencias_local');
    if (!data) return [];
    try {
        return JSON.parse(data);
    } catch (e) {
        return [];
    }
}

function saveLocalAttendance(list) {
    localStorage.setItem('canchapro_asistencias_local', JSON.stringify(list));
}

// Dynamic state box updates when employee is selected
async function handleEmployeeChange() {
    selectedEmployeeName = employeeSelect.value;

    // Add new worker logic (admin auth guarded)
    if (selectedEmployeeName === '_add_new_') {
        const pwd = prompt("Ingrese la contraseña de administrador para registrar un nuevo trabajador:");
        if (pwd === 'Reservasupabase') {
            const newName = prompt("Ingrese el nombre completo del nuevo trabajador:");
            if (newName && newName.trim()) {
                const cleanName = newName
                    .trim()
                    .split(/\s+/)
                    .map(word => {
                        if (!word) return '';
                        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
                    })
                    .filter(word => word.length > 0)
                    .join(' ');

                if (!activeEmployeesList.includes(cleanName)) {
                    if (dbMode === 'supabase' && supabaseClient) {
                        try {
                            const { error: insErr } = await supabaseClient
                                .from('personal_asistencia')
                                .insert([{ name: cleanName, is_active: true }]);

                            if (insErr) {
                                // Try updating if it was inactive previously
                                const { error: updErr } = await supabaseClient
                                    .from('personal_asistencia')
                                    .update({ is_active: true })
                                    .eq('name', cleanName);
                                if (updErr) throw updErr;
                            }
                        } catch (err) {
                            console.warn("Could not save new employee to Supabase, saving locally:", err.message);
                            saveNewEmployeeLocal(cleanName);
                        }
                    } else {
                        saveNewEmployeeLocal(cleanName);
                    }
                }

                // Reload data and dropdowns
                await fetchAttendanceRecords();

                // Select newly registered worker
                employeeSelect.value = cleanName;
                selectedEmployeeName = cleanName;

                await addHistoryEntry('crear', `registró al nuevo trabajador: ${cleanName}`);
            } else {
                employeeSelect.value = '';
                selectedEmployeeName = '';
            }
        } else {
            if (pwd !== null) alert("Contraseña incorrecta o cancelado.");
            employeeSelect.value = '';
            selectedEmployeeName = '';
        }
    }

    // Delete worker logic (admin auth guarded)
    if (selectedEmployeeName === '_delete_') {
        const pwd = prompt("Ingrese la contraseña de administrador para eliminar un trabajador:");
        if (pwd === 'Reservasupabase') {
            if (activeEmployeesList.length === 0) {
                alert("No hay trabajadores guardados para eliminar.");
                employeeSelect.value = '';
                selectedEmployeeName = '';
                return;
            }

            const listStr = activeEmployeesList.join(', ');
            const nameToDelete = prompt(`Trabajadores eliminables:\n[ ${listStr} ]\n\nEscriba el nombre exacto del trabajador que desea eliminar:`);

            if (nameToDelete) {
                const cleanName = nameToDelete.trim();
                if (activeEmployeesList.includes(cleanName)) {
                    if (dbMode === 'supabase' && supabaseClient) {
                        try {
                            const { error: delErr } = await supabaseClient
                                .from('personal_asistencia')
                                .update({ is_active: false })
                                .eq('name', cleanName);

                            if (delErr) throw delErr;
                        } catch (err) {
                            console.warn("Could not deactivate employee in Supabase, updating locally:", err.message);
                            deleteEmployeeLocal(cleanName);
                        }
                    } else {
                        deleteEmployeeLocal(cleanName);
                    }

                    // Reload data and dropdowns
                    await fetchAttendanceRecords();

                    employeeSelect.value = '';
                    selectedEmployeeName = '';
                    await addHistoryEntry('eliminar', `eliminó al trabajador: ${cleanName}`);
                    alert(`El trabajador "${cleanName}" fue eliminado correctamente.`);
                } else {
                    alert(`El nombre "${cleanName}" no coincide con ningún trabajador de la lista.`);
                    employeeSelect.value = '';
                    selectedEmployeeName = '';
                }
            } else {
                employeeSelect.value = '';
                selectedEmployeeName = '';
            }
        } else {
            if (pwd !== null) alert("Contraseña incorrecta o cancelado.");
            employeeSelect.value = '';
            selectedEmployeeName = '';
        }
    }

    // Helper functions for local storage operations
    function saveNewEmployeeLocal(cleanName) {
        let customNames = [];
        try {
            const savedCustom = localStorage.getItem('canchapro_custom_employees');
            if (savedCustom) {
                customNames = JSON.parse(savedCustom);
            } else {
                customNames = ['Admin', 'Rogger', 'Vicky'];
            }
        } catch (e) {
            console.warn(e);
        }
        if (!customNames.includes(cleanName)) {
            customNames.push(cleanName);
            localStorage.setItem('canchapro_custom_employees', JSON.stringify(customNames));
        }
    }

    function deleteEmployeeLocal(cleanName) {
        let customNames = [];
        try {
            const savedCustom = localStorage.getItem('canchapro_custom_employees');
            if (savedCustom) {
                customNames = JSON.parse(savedCustom);
            } else {
                customNames = ['Admin', 'Rogger', 'Vicky'];
            }
        } catch (e) {
            console.warn(e);
        }
        customNames = customNames.filter(name => name !== cleanName);
        localStorage.setItem('canchapro_custom_employees', JSON.stringify(customNames));
    }

    if (!selectedEmployeeName) {
        employeeStatusBox.innerHTML = '<span class="status-title" style="color: var(--text-muted);">Selecciona un empleado para comenzar</span>';
        if (lunchToggleGroup) lunchToggleGroup.style.display = 'none';
        if (earlyStartToggleGroup) {
            earlyStartToggleGroup.style.display = 'none';
            earlyStartCheckbox.checked = false;
        }
        if (autoCheckoutToggleGroup) {
            autoCheckoutToggleGroup.style.display = 'none';
            if (autoCheckoutEnabled) autoCheckoutEnabled.checked = false;
            if (autoCheckoutDetails) autoCheckoutDetails.style.display = 'none';
        }
        btnToggleAttendance.disabled = true;
        btnToggleAttendance.className = 'btn btn-primary';
        btnToggleAttendance.innerHTML = '<i data-lucide="fingerprint"></i> Marcar Asistencia';
        if (window.lucide) lucide.createIcons();
        return;
    }

    // Find active shift or shift status today
    const todayStr = getLocalDateString(new Date());
    const employeeShiftsToday = allAttendanceRecords.filter(r => r.employee_name === selectedEmployeeName && r.date === todayStr && r.type === 'Trabajo');

    const activeShift = employeeShiftsToday.find(r => r.check_in && !r.check_out);

    // Check if early start checkbox should be shown
    const now = new Date();
    const currentHour = now.getHours();
    const currentMin = now.getMinutes();

    let showEarlyStart = false;
    let targetStartTime = "";
    let earlyStartMsg = "";

    if (currentHour === 7 && currentMin >= 20) {
        showEarlyStart = true;
        targetStartTime = "08:00:00";
        earlyStartMsg = "8:00 AM";
    } else if (currentHour === 8 && currentMin >= 20) {
        showEarlyStart = true;
        targetStartTime = "09:00:00";
        earlyStartMsg = "9:00 AM";
    }

    if (!activeShift && showEarlyStart) {
        if (earlyStartToggleGroup) {
            earlyStartToggleGroup.style.display = 'block';
            earlyStartCheckbox.checked = true;
            earlyStartCheckbox.setAttribute('data-target-time', targetStartTime);
            if (earlyStartLabel) {
                earlyStartLabel.textContent = `⏰ ¿Iniciar labores a las ${earlyStartMsg}?`;
            }
            if (earlyStartHelp) {
                earlyStartHelp.textContent = `Si marcas esta opción, tu hora de entrada oficial empezará a las ${earlyStartMsg}.`;
            }
        }
    } else {
        if (earlyStartToggleGroup) {
            earlyStartToggleGroup.style.display = 'none';
            earlyStartCheckbox.checked = false;
            earlyStartCheckbox.removeAttribute('data-target-time');
        }
    }

    btnToggleAttendance.disabled = false;

    if (activeShift) {
        // Shift in progress -> Action: CHECK OUT
        if (lunchToggleGroup) {
            lunchToggleGroup.style.display = 'block';
            lunchCheckbox.checked = true;
        }
        if (autoCheckoutToggleGroup) {
            autoCheckoutToggleGroup.style.display = 'none';
        }

        let autoTimeMsg = '';
        if (activeShift.notes) {
            const autoMatch = activeShift.notes.match(/\[Auto-(\d{2}:\d{2})\]/);
            if (autoMatch) {
                autoTimeMsg = `<br><span style="color: var(--primary); font-weight: 600;">⏰ Salida automática a las ${formatTime12h(autoMatch[1])} programada.</span>`;
            } else if (activeShift.notes.includes('[Auto-6PM]')) {
                autoTimeMsg = '<br><span style="color: var(--primary); font-weight: 600;">⏰ Salida automática a las 6:00 PM programada.</span>';
            }
        }

        employeeStatusBox.className = 'employee-status-box active-shift';
        employeeStatusBox.innerHTML = `
            <span class="status-title" style="color: #fbbf24; display: flex; align-items: center; gap: 6px;">
                <i data-lucide="play" class="animate-pulse" style="width: 16px; height: 16px;"></i> Turno Activo
            </span>
            <span class="status-desc">Ingresaste hoy a las <strong>${activeShift.check_in.substring(0, 5)}</strong>. Haz clic para registrar tu salida.${autoTimeMsg}</span>
        `;
        btnToggleAttendance.className = 'btn btn-danger';
        btnToggleAttendance.innerHTML = '<i data-lucide="log-out"></i> Marcar Salida (Check-Out)';
        btnToggleAttendance.style.background = '';
        btnToggleAttendance.style.boxShadow = '';
    } else if (employeeShiftsToday.length > 0 && employeeShiftsToday[employeeShiftsToday.length - 1].check_out) {
        // Workday completed or shift completed -> Action: CHECK IN AGAIN
        if (lunchToggleGroup) lunchToggleGroup.style.display = 'none';

        // Show auto-checkout options
        if (autoCheckoutToggleGroup) {
            autoCheckoutToggleGroup.style.display = 'block';
            if (autoCheckoutEnabled) {
                if (currentHour < 18) {
                    autoCheckoutEnabled.checked = true;
                    if (autoCheckoutDetails) autoCheckoutDetails.style.display = 'flex';
                    if (autoCheckoutTimeInput) autoCheckoutTimeInput.value = '6:00';
                    if (autoCheckoutAmpmSelect) autoCheckoutAmpmSelect.value = 'PM';
                } else {
                    autoCheckoutEnabled.checked = false;
                    if (autoCheckoutDetails) autoCheckoutDetails.style.display = 'none';
                }
            }
        }

        const lastShift = employeeShiftsToday[employeeShiftsToday.length - 1];
        employeeStatusBox.className = 'employee-status-box completed-shift';
        employeeStatusBox.innerHTML = `
            <span class="status-title" style="color: #10b981; display: flex; align-items: center; gap: 6px;">
                <i data-lucide="check-circle-2" style="width: 16px; height: 16px;"></i> Jornada Registrada
            </span>
            <span class="status-desc">Completaste un turno hoy (${lastShift.check_in.substring(0, 5)} - ${lastShift.check_out.substring(0, 5)}). Haz clic si deseas iniciar uno nuevo.</span>
        `;
        btnToggleAttendance.className = 'btn btn-primary';
        btnToggleAttendance.innerHTML = '<i data-lucide="play"></i> Iniciar Nuevo Turno (Check-In)';
        btnToggleAttendance.style.background = 'var(--primary)';
        btnToggleAttendance.style.boxShadow = '0 4px 14px var(--primary-glow)';
    } else {
        // No attendance recorded today -> Action: CHECK IN
        if (lunchToggleGroup) lunchToggleGroup.style.display = 'none';

        // Show auto-checkout options
        if (autoCheckoutToggleGroup) {
            autoCheckoutToggleGroup.style.display = 'block';
            if (autoCheckoutEnabled) {
                if (currentHour < 18) {
                    autoCheckoutEnabled.checked = true;
                    if (autoCheckoutDetails) autoCheckoutDetails.style.display = 'flex';
                    if (autoCheckoutTimeInput) autoCheckoutTimeInput.value = '6:00';
                    if (autoCheckoutAmpmSelect) autoCheckoutAmpmSelect.value = 'PM';
                } else {
                    autoCheckoutEnabled.checked = false;
                    if (autoCheckoutDetails) autoCheckoutDetails.style.display = 'none';
                }
            }
        }

        employeeStatusBox.className = 'employee-status-box';
        employeeStatusBox.innerHTML = `
            <span class="status-title" style="color: var(--text-primary);">Entrada Pendiente</span>
            <span class="status-desc">Aún no has registrado tu ingreso de hoy. Haz clic para registrar entrada.</span>
        `;
        btnToggleAttendance.className = 'btn btn-primary';
        btnToggleAttendance.innerHTML = '<i data-lucide="log-in"></i> Marcar Entrada (Check-In)';
        btnToggleAttendance.style.background = 'var(--primary)';
        btnToggleAttendance.style.boxShadow = '0 4px 14px var(--primary-glow)';
    }

    if (window.lucide) lucide.createIcons();

    // Update worked progress metrics
    updateEmployeeStats();
}

// Mark attendance button clicked (Entry/Exit)
async function handleToggleAttendance() {
    if (!selectedEmployeeName) return;

    const now = new Date();
    const todayStr = getLocalDateString(now);
    const timeStr = getLocalTimeString(now);

    const employeeShiftsToday = allAttendanceRecords.filter(r => r.employee_name === selectedEmployeeName && r.date === todayStr && r.type === 'Trabajo');
    const activeShift = employeeShiftsToday.find(r => r.check_in && !r.check_out);

    // Set loading state on the button to give visual feedback while querying Supabase
    btnToggleAttendance.disabled = true;
    if (activeShift) {
        btnToggleAttendance.innerHTML = '<span class="spinner-inline"></span> Guardando salida...';
    } else {
        btnToggleAttendance.innerHTML = '<span class="spinner-inline"></span> Guardando entrada...';
    }

    try {
        if (activeShift) {
            // CHECK OUT OPERATION
            const checkInTime = activeShift.check_in;
            const roundedTimeStr = roundCheckoutTime(timeStr);
            const inTimeHHMM = checkInTime.substring(0, 5);
            const outTimeHHMM = roundedTimeStr.substring(0, 5);
            const diffHours = calculateDurationInHours(activeShift.date, inTimeHHMM, todayStr, outTimeHHMM);

            // Check checkbox status (default to true if not available)
            const tookLunch = lunchCheckbox ? lunchCheckbox.checked : true;

            // Deduct 1 hour for lunch if shift duration is > 5 hours AND they took lunch
            const lunchDeducted = diffHours > 5 && tookLunch;
            const finalHours = lunchDeducted ? Math.max(0, diffHours - 1) : diffHours;

            let checkoutNotes = `Salida registrada automáticamente a las ${roundedTimeStr.substring(0, 5)}`;
            if (lunchDeducted) {
                checkoutNotes += ' (Descuento 1h almuerzo)';
            } else if (diffHours > 5 && !tookLunch) {
                checkoutNotes += ' (Sin almuerzo)';
            }

            const updatedShift = {
                ...activeShift,
                check_out: roundedTimeStr,
                hours_credited: Number(finalHours.toFixed(2)),
                notes: checkoutNotes
            };

            if (dbMode === 'supabase' && supabaseClient) {
                const { error } = await supabaseClient
                    .from('asistencias')
                    .update({
                        check_out: updatedShift.check_out,
                        hours_credited: updatedShift.hours_credited,
                        notes: updatedShift.notes
                    })
                    .eq('id', activeShift.id);

                if (error) throw error;
            } else {
                let localList = getLocalAttendance();
                localList = localList.map(r => r.id === activeShift.id ? updatedShift : r);
                saveLocalAttendance(localList);
            }

            const formattedHoursStr = formatHoursText(finalHours);
            await addHistoryEntry('editar', `marcó SALIDA de la oficina (${formattedHoursStr})`);
        } else {
            // CHECK IN OPERATION
            let checkInTime = timeStr;
            let checkInNotes = `Entrada registrada automáticamente a las ${timeStr.substring(0, 5)}`;

            const isEarlyStart = earlyStartToggleGroup && earlyStartToggleGroup.style.display !== 'none' && earlyStartCheckbox && earlyStartCheckbox.checked;

            if (isEarlyStart) {
                const targetTime = earlyStartCheckbox.getAttribute('data-target-time');
                if (targetTime) {
                    checkInTime = targetTime;
                    checkInNotes = `Entrada programada a las ${targetTime.substring(0, 5)} (Marcado temprano a las ${timeStr.substring(0, 5)})`;
                }
            }

            const isAutoCheckout = autoCheckoutToggleGroup && autoCheckoutToggleGroup.style.display !== 'none' && autoCheckoutEnabled && autoCheckoutEnabled.checked;
            if (isAutoCheckout) {
                const timeInputVal = autoCheckoutTimeInput ? autoCheckoutTimeInput.value : '';
                const ampmVal = autoCheckoutAmpmSelect ? autoCheckoutAmpmSelect.value : 'PM';
                const parsedTime = parseInputTime(timeInputVal, ampmVal);
                if (!parsedTime) {
                    alert("Por favor ingrese una hora de salida válida (ej: 6:00, 5:30, 8).");
                    // Restore button state
                    btnToggleAttendance.disabled = false;
                    btnToggleAttendance.className = 'btn btn-primary';
                    const hasShiftsToday = employeeShiftsToday.length > 0 && employeeShiftsToday[employeeShiftsToday.length - 1].check_out;
                    btnToggleAttendance.innerHTML = hasShiftsToday ? 
                        '<i data-lucide="play"></i> Iniciar Nuevo Turno (Check-In)' : 
                        '<i data-lucide="log-in"></i> Marcar Entrada (Check-In)';
                    btnToggleAttendance.style.background = 'var(--primary)';
                    btnToggleAttendance.style.boxShadow = '0 4px 14px var(--primary-glow)';
                    if (window.lucide) lucide.createIcons();
                    return;
                }
                checkInNotes = `[Auto-${parsedTime}] ${checkInNotes}`;
            }

            const newShift = {
                id: generateUUID(),
                employee_name: selectedEmployeeName,
                date: todayStr,
                check_in: checkInTime,
                check_out: null,
                type: 'Trabajo',
                hours_credited: 0,
                notes: checkInNotes
            };

            if (dbMode === 'supabase' && supabaseClient) {
                const { error } = await supabaseClient
                    .from('asistencias')
                    .insert([newShift]);

                if (error) throw error;
            } else {
                const localList = getLocalAttendance();
                localList.unshift(newShift);
                saveLocalAttendance(localList);
            }

            await addHistoryEntry('crear', `marcó ENTRADA en la oficina a las ${checkInTime.substring(0, 5)} (Marcado temprano a las ${timeStr.substring(0, 5)})`);
        }

        // Fetch latest
        await fetchAttendanceRecords();

        // Refresh display
        handleEmployeeChange();

    } catch (err) {
        console.error("Error registering attendance:", err);
        alert("Ocurrió un error al guardar en la base de datos: " + err.message);
        handleEmployeeChange();
    }
}

// Calculate hours stats for selected employee (Weekly progress + Monthly stats)
function updateEmployeeStats() {
    const selectedName = selectedEmployeeName || employeeSelect.value;
    progressEmployeeTitle.textContent = selectedName ? `Progreso de ${getEmployeeNameWithEmoji(selectedName)}` : 'Progreso de Horas';

    if (!selectedName) {
        // Reset metrics UI
        progressPercentageText.textContent = '0%';
        goalProgressBar.style.width = '0%';
        progressCurrentText.textContent = '0 h acumuladas esta semana';
        metricWorkedHours.textContent = '0';
        if (metricJustifiedHours) metricJustifiedHours.textContent = '0';
        if (metricOwedHours) metricOwedHours.textContent = '48';

        // Reset monthly detailed metrics
        if (statsWorkedHours) statsWorkedHours.textContent = '0 h';
        if (statsJustifiedHours) statsJustifiedHours.textContent = '0 h';
        if (statsTotalMonthHours) statsTotalMonthHours.textContent = '0 h';
        if (statsRequiredHours) statsRequiredHours.textContent = '0 h';
        if (statsOwedHours) statsOwedHours.textContent = '0 h';
        if (labelRequiredHours) labelRequiredHours.textContent = 'Horas Requeridas:';
        if (statsDaysWorked) statsDaysWorked.textContent = '0 días';
        if (statsDaysJustified) statsDaysJustified.textContent = '0 días';
        if (statsMonthlyOvertime) statsMonthlyOvertime.textContent = '0 h';
        return;
    }

    // --- 1. WEEKLY PROGRESS METRICS ---
    const now = new Date();
    const { monday, sunday } = getMondayAndSundayOfDate(now);
    const mondayStr = getLocalDateString(monday);
    const sundayStr = getLocalDateString(sunday);

    const weekRecords = allAttendanceRecords.filter(r =>
        r.employee_name === selectedName &&
        r.date >= mondayStr &&
        r.date <= sundayStr
    );

    let weeklyWorked = 0;
    let weeklyJustified = 0;
    weekRecords.forEach(r => {
        const hours = getRealHoursCredited(r);
        if (r.type === 'Trabajo') {
            weeklyWorked += hours;
        } else if (r.type === 'Feriado' || r.type === 'Permiso') {
            weeklyJustified += hours;
        }
    });

    const weeklyTotal = weeklyWorked + weeklyJustified;
    const targetGoal = 48.0;
    const weeklyOwed = Math.max(0, targetGoal - weeklyTotal);
    const percent = Math.min(100, (weeklyTotal / targetGoal) * 100);

    progressPercentageText.textContent = `${percent.toFixed(0)}%`;
    goalProgressBar.style.width = `${percent}%`;
    progressCurrentText.textContent = `${formatHoursToHHMM(weeklyTotal, true)} acumuladas esta semana`;
    if (metricWorkedHours) metricWorkedHours.textContent = formatHoursToHHMM(weeklyWorked, false);
    if (metricJustifiedHours) metricJustifiedHours.textContent = formatHoursToHHMM(weeklyJustified, false);
    if (metricOwedHours) metricOwedHours.textContent = formatHoursToHHMM(weeklyOwed, false);

    if (percent < 30) {
        goalProgressBar.style.background = 'var(--progress-low, #ff758c)';
    } else if (percent < 80) {
        goalProgressBar.style.background = 'var(--progress-medium, #fbd07c)';
    } else {
        goalProgressBar.style.background = 'var(--progress-high, var(--rainbow-gradient))';
    }

    // --- 2. MONTHLY ACCUMULATED STATS ---
    const selectedMonth = filterMonth.value; // e.g. "YYYY-MM"
    const monthRecords = allAttendanceRecords.filter(r =>
        r.employee_name === selectedName &&
        r.date.startsWith(selectedMonth)
    );

    let workedHours = 0;
    let justifiedHours = 0;
    let daysWorked = 0;
    let daysJustified = 0;

    monthRecords.forEach(r => {
        const hours = getRealHoursCredited(r);
        if (r.type === 'Trabajo') {
            workedHours += hours;
            if (r.check_in) {
                daysWorked++;
            }
        } else if (r.type === 'Feriado' || r.type === 'Permiso') {
            justifiedHours += hours;
            daysJustified++;
        }
    });

    const totalMonthHours = workedHours + justifiedHours;

    // Calculate Monthly Overtime (Horas Extra del Mes)
    // We group by weeks (Monday-Sunday) whose Sunday date falls within the selected month.
    let monthlyOvertime = 0;
    const employeeAllRecords = allAttendanceRecords.filter(r => r.employee_name === selectedName);
    const uniqueMondays = new Set();

    employeeAllRecords.forEach(r => {
        if (!r.date) return;
        const parts = r.date.split('-');
        if (parts.length !== 3) return;

        const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        const { monday, sunday } = getMondayAndSundayOfDate(d);
        const sundayStr = getLocalDateString(sunday);

        if (sundayStr.startsWith(selectedMonth)) {
            uniqueMondays.add(getLocalDateString(monday));
        }
    });

    uniqueMondays.forEach(mondayStr => {
        const mondayParts = mondayStr.split('-');
        const monDate = new Date(Number(mondayParts[0]), Number(mondayParts[1]) - 1, Number(mondayParts[2]));
        const sunDate = new Date(monDate.getTime());
        sunDate.setDate(monDate.getDate() + 6);

        const sunStr = getLocalDateString(sunDate);

        const weekRecords = allAttendanceRecords.filter(r =>
            r.employee_name === selectedName &&
            r.date >= mondayStr &&
            r.date <= sunStr
        );

        let weekTotal = 0;
        weekRecords.forEach(wr => {
            weekTotal += getRealHoursCredited(wr);
        });

        if (weekTotal > 48) {
            monthlyOvertime += (weekTotal - 48);
        }
    });

    const expectedHours = getExpectedHoursForMonth(selectedMonth);
    const hoursOwed = Math.max(0, expectedHours - totalMonthHours);


    if (labelRequiredHours) {
        labelRequiredHours.textContent = 'Horas Requeridas:';
    }
    if (statsRequiredHours) {
        statsRequiredHours.textContent = formatHoursToHHMM(expectedHours, true);
    }
    if (statsOwedHours) {
        statsOwedHours.textContent = formatHoursToHHMM(hoursOwed, true);
    }
    if (statsWorkedHours) statsWorkedHours.textContent = formatHoursToHHMM(workedHours, true);
    if (statsJustifiedHours) statsJustifiedHours.textContent = formatHoursToHHMM(justifiedHours, true);
    if (statsTotalMonthHours) statsTotalMonthHours.textContent = formatHoursToHHMM(totalMonthHours, true);
    if (statsDaysWorked) statsDaysWorked.textContent = `${daysWorked} ${daysWorked === 1 ? 'día' : 'días'}`;
    if (statsDaysJustified) statsDaysJustified.textContent = `${daysJustified} ${daysJustified === 1 ? 'día' : 'días'}`;
    if (statsMonthlyOvertime) statsMonthlyOvertime.textContent = formatHoursToHHMM(monthlyOvertime, true);
}

// Render Attendance list Table
function renderAttendanceTable() {
    if (!attendanceTableBody) return;

    const filterName = filterEmployee.value;
    const filterSelectedMonth = filterMonth.value; // format: "YYYY-MM"

    let filtered = allAttendanceRecords;

    // 1. Filter by employee name (supporting general holidays mapped to 'Todos' or specific employee)
    if (filterName !== 'todos') {
        filtered = filtered.filter(r => r.employee_name === filterName || r.employee_name === 'Todos');
    }

    // 2. Filter by selected Month
    if (filterSelectedMonth) {
        filtered = filtered.filter(r => {
            if (!r.date) return false;
            return r.date.startsWith(filterSelectedMonth);
        });
    }

    // 3. Filter by selected Week
    const filterWeek = document.getElementById('filterWeek');
    const filterSelectedWeek = filterWeek ? filterWeek.value : 'todas';
    if (filterSelectedMonth && filterSelectedWeek && filterSelectedWeek !== 'todas') {
        const [startDay, endDay] = filterSelectedWeek.split('-').map(Number);
        const [year, month] = filterSelectedMonth.split('-');
        const startDateStr = `${year}-${month}-${String(startDay).padStart(2, '0')}`;
        const endDateStr = `${year}-${month}-${String(endDay).padStart(2, '0')}`;

        filtered = filtered.filter(r => {
            if (!r.date) return false;
            return r.date >= startDateStr && r.date <= endDateStr;
        });
    }

    if (filtered.length === 0) {
        attendanceTableBody.innerHTML = `
            <tr>
                <td colspan="8" class="empty-state">
                    <i data-lucide="calendar-x"></i>
                    <p>No se encontraron registros de asistencias con los filtros aplicados.</p>
                </td>
            </tr>
        `;
        if (window.lucide) lucide.createIcons();
        return;
    }

    const todayStr = getLocalDateString(new Date());
    attendanceTableBody.innerHTML = filtered.map(r => {
        const isToday = r.date === todayStr;
        const rowClass = isToday ? 'class="today-record-row"' : '';
        const dateFormatted = formatDateDDMMYYYY(r.date);
        const dateDisplay = isToday ? `${dateFormatted} <span class="today-tag">Hoy</span>` : dateFormatted;
        const inFormatted = r.check_in ? r.check_in.substring(0, 5) : '--:--';
        const outFormatted = r.check_out ? r.check_out.substring(0, 5) : '--:--';

        let typeBadgeClass = 'status-badge';
        if (r.type === 'Trabajo') typeBadgeClass += ' presente';
        else if (r.type === 'Feriado') typeBadgeClass += ' feriado';
        else if (r.type === 'Permiso') typeBadgeClass += ' permiso';
        else if (r.type === 'Falta') typeBadgeClass += ' falta';

        const typeLabel = r.type === 'Trabajo' ? 'Trabajo Presencial' : (r.type === 'Falta' ? 'Falta / Inasistencia' : r.type);

        // Calculate actual hours and see if lunch was deducted
        const realHours = getRealHoursCredited(r);
        const elapsed = r.check_in && r.check_out ? calculateDurationInHours(r.date, r.check_in, r.date, r.check_out) : 0;
        const lunchDeducted = r.type === 'Trabajo' && elapsed > 5;
        const lunchIcon = lunchDeducted ? ` <span style="color: #fbbf24; font-size: 11px; cursor: help;" title="Se descontó 1 hora de almuerzo (turno > 5h)">🍴 1h</span>` : '';

        return `
            <tr ${rowClass}>
                <td data-label="Colaborador"><strong>${escapeHTML(getEmployeeNameWithEmoji(r.employee_name))}</strong></td>
                <td data-label="Fecha">${dateDisplay}</td>
                <td data-label="Entrada">${inFormatted}</td>
                <td data-label="Salida">${outFormatted}</td>
                <td data-label="Horas Abonadas" style="font-weight: 600;">${formatHoursToHHMM(realHours, true)}${lunchIcon}</td>
                <td data-label="Tipo"><span class="${typeBadgeClass}">${typeLabel}</span></td>
                <td data-label="Notas" style="font-size: 11px; color: var(--text-secondary); max-width: 220px; word-break: break-word; line-height: 1.3;" title="${escapeHTML(r.notes || '')}">
                    ${escapeHTML(r.notes || '')}
                </td>
                <td data-label="Acción" style="text-align: center;">
                    <button class="btn-action-icon delete" onclick="handleDeleteRecord('${r.id}')" title="Eliminar Registro">
                        <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    if (window.lucide) lucide.createIcons();
}

// Admin Action trigger (opens unlock dialog)
function handleAdminActionsClick() {
    // If already authenticated during session, open directly
    const sessionAuth = sessionStorage.getItem('canchapro_admin_authenticated');
    if (sessionAuth === 'true') {
        openAdminRegisterModal();
    } else {
        adminAuthCallback = openAdminRegisterModal;
        openModal(modalAdminAuth);
        adminPasswordInput.value = '';
        adminAuthError.style.display = 'none';
        setTimeout(() => adminPasswordInput.focus(), 100);
    }
}

// Unlock admin form submission
function handleAdminAuthSubmit(e) {
    e.preventDefault();
    const pwd = adminPasswordInput.value;

    if (pwd === 'Reservasupabase') {
        sessionStorage.setItem('canchapro_admin_authenticated', 'true');
        closeModal(modalAdminAuth);
        if (typeof adminAuthCallback === 'function') {
            adminAuthCallback();
            adminAuthCallback = null;
        }
    } else {
        adminAuthError.textContent = '❌ Contraseña incorrecta. Inténtelo nuevamente.';
        adminAuthError.style.display = 'block';
        adminPasswordInput.focus();
    }
}

function openAdminRegisterModal() {
    formAdminRegister.reset();
    adminRegisterDate.value = getLocalDateString(new Date());
    adminRegisterHours.value = "8";
    if (adminRegisterMinutes) adminRegisterMinutes.value = "0";
    adminRegisterHours.disabled = false;
    if (adminRegisterMinutes) adminRegisterMinutes.disabled = false;
    adminRegisterError.style.display = 'none';

    // Handle conditional fields
    toggleAdminEmployeeSelect();

    openModal(modalAdminRegister);
}

function toggleAdminEmployeeSelect() {
    const type = adminRegisterType.value;
    const hoursLabel = document.getElementById('labelAdminRegisterTime') || document.querySelector('label[for="adminRegisterHours"]');

    if (type === 'Feriado') {
        adminEmployeeSelectGroup.style.display = 'none';
        adminEmployeeSelect.required = false;
        adminRegisterHours.value = "8";
        if (adminRegisterMinutes) adminRegisterMinutes.value = "0";
        adminRegisterHours.disabled = false;
        if (adminRegisterMinutes) adminRegisterMinutes.disabled = false;
        if (hoursLabel) hoursLabel.textContent = "Tiempo Justificado Abonado *";
    } else if (type === 'Falta') {
        adminEmployeeSelectGroup.style.display = 'block';
        adminEmployeeSelect.required = true;
        adminRegisterHours.value = "0";
        if (adminRegisterMinutes) adminRegisterMinutes.value = "0";
        adminRegisterHours.disabled = true;
        if (adminRegisterMinutes) adminRegisterMinutes.disabled = true;
        if (hoursLabel) hoursLabel.textContent = "Tiempo Abonado (Falta = 0h) *";
    } else { // Permiso
        adminEmployeeSelectGroup.style.display = 'block';
        adminEmployeeSelect.required = true;
        adminRegisterHours.value = "8";
        if (adminRegisterMinutes) adminRegisterMinutes.value = "0";
        adminRegisterHours.disabled = false;
        if (adminRegisterMinutes) adminRegisterMinutes.disabled = false;
        if (hoursLabel) hoursLabel.textContent = "Tiempo Justificado Abonado *";
    }
}

// Handle administrative saving of Feriados / Permisos
async function handleAdminRegisterSubmit(e) {
    e.preventDefault();
    adminRegisterError.style.display = 'none';

    const type = adminRegisterType.value;
    const date = adminRegisterDate.value;
    const isFalta = type === 'Falta';
    
    let hours = 0;
    if (!isFalta) {
        const hrsVal = Number(adminRegisterHours.value || 0);
        const minsVal = adminRegisterMinutes ? Number(adminRegisterMinutes.value || 0) : 0;
        hours = hrsVal + (minsVal / 60);
    }
    const notes = adminRegisterNotes.value.trim();

    if (!date || isNaN(hours) || (hours <= 0 && !isFalta)) {
        adminRegisterError.textContent = '⚠️ Complete todos los campos con valores válidos.';
        adminRegisterError.style.display = 'block';
        return;
    }

    try {
        const recordsToInsert = [];

        if (type === 'Feriado') {
            // Option 1: Insert record for "Todos"
            // Option 2: Insert individual record for every active employee so it displays in their metrics
            // We do Option 2 to keep metrics functional!
            employeeList.forEach(empName => {
                recordsToInsert.push({
                    id: generateUUID(),
                    employee_name: empName,
                    date: date,
                    check_in: null,
                    check_out: null,
                    type: 'Feriado',
                    hours_credited: hours,
                    notes: notes || 'Feriado Nacional'
                });
            });
        } else {
            const employeeName = adminEmployeeSelect.value;
            if (!employeeName) {
                adminRegisterError.textContent = '⚠️ Seleccione un trabajador.';
                adminRegisterError.style.display = 'block';
                return;
            }
            recordsToInsert.push({
                id: generateUUID(),
                employee_name: employeeName,
                date: date,
                check_in: null,
                check_out: null,
                type: type, // 'Permiso' or 'Falta'
                hours_credited: type === 'Falta' ? 0 : hours,
                notes: notes || (type === 'Falta' ? 'Falta / Inasistencia' : 'Permiso Especial')
            });
        }

        // Save records to database
        if (dbMode === 'supabase' && supabaseClient) {
            const { error } = await supabaseClient
                .from('asistencias')
                .insert(recordsToInsert);

            if (error) throw error;
        } else {
            const localList = getLocalAttendance();
            recordsToInsert.forEach(rec => {
                localList.unshift(rec);
            });
            saveLocalAttendance(localList);
        }

        // Add history log entry
        let detailsLog = '';
        if (type === 'Feriado') {
            detailsLog = `registró feriado nacional del ${formatDateDDMMYYYY(date)}: ${notes || 'Feriado'}`;
        } else if (type === 'Falta') {
            detailsLog = `registró falta para ${adminEmployeeSelect.value} del ${formatDateDDMMYYYY(date)}: ${notes || 'Falta'}`;
        } else {
            detailsLog = `registró permiso para ${adminEmployeeSelect.value} del ${formatDateDDMMYYYY(date)}: ${notes || 'Permiso'}`;
        }

        await addHistoryEntry('crear', detailsLog);

        closeModal(modalAdminRegister);
        await fetchAttendanceRecords();

    } catch (err) {
        console.error("Error registering admin action:", err);
        adminRegisterError.textContent = '❌ Error al guardar en base de datos: ' + err.message;
        adminRegisterError.style.display = 'block';
    }
}

// Delete attendance record
async function handleDeleteRecord(id) {
    // Requires admin authentication
    const sessionAuth = sessionStorage.getItem('canchapro_admin_authenticated');

    const executeDelete = async () => {
        if (!confirm("¿Estás seguro de que deseas eliminar este registro de asistencia?")) {
            return;
        }

        const targetRecord = allAttendanceRecords.find(r => r.id === id);
        if (!targetRecord) return;

        try {
            if (dbMode === 'supabase' && supabaseClient) {
                const { error } = await supabaseClient
                    .from('asistencias')
                    .delete()
                    .eq('id', id);

                if (error) throw error;
            } else {
                let localList = getLocalAttendance();
                localList = localList.filter(r => r.id !== id);
                saveLocalAttendance(localList);
            }

            await addHistoryEntry('eliminar', `eliminó registro de asistencia de ${targetRecord.employee_name} del ${formatDateDDMMYYYY(targetRecord.date)}`);
            await fetchAttendanceRecords();

        } catch (err) {
            console.error("Error deleting record:", err);
            alert("Error al eliminar el registro: " + err.message);
        }
    };

    if (sessionAuth === 'true') {
        await executeDelete();
    } else {
        // Authenticate first
        adminAuthCallback = executeDelete;
        openModal(modalAdminAuth);
        adminPasswordInput.value = '';
        adminAuthError.style.display = 'none';
        setTimeout(() => adminPasswordInput.focus(), 100);
    }
}

// Shared helper to insert logs into the 'historial' table
async function addHistoryEntry(action, details) {
    const userName = localStorage.getItem('canchapro_user_name') || 'Invitado';
    const entry = {
        action,
        user_name: userName,
        details: `[Asistencia] ${details}`,
        created_at: new Date().toISOString()
    };

    if (dbMode === 'supabase' && supabaseClient) {
        try {
            await supabaseClient.from('historial').insert([entry]);
        } catch (e) {
            console.error("Failed to save history entry in Supabase:", e);
            saveHistoryEntryLocal(entry);
        }
    } else {
        saveHistoryEntryLocal(entry);
    }
}

function saveHistoryEntryLocal(entry) {
    try {
        const historyData = localStorage.getItem('canchapro_historial_asistencia');
        let history = [];
        if (historyData) {
            history = JSON.parse(historyData);
        }
        history.unshift(entry);
        if (history.length > 50) history = history.slice(0, 50);
        localStorage.setItem('canchapro_historial_asistencia', JSON.stringify(history));
    } catch (e) {
        console.warn("Could not save history entry locally:", e);
    }
}

// Setup Event Listeners
function setupEventListeners() {
    // Sidebar Mobile Drawer
    if (btnToggleSidebar) {
        btnToggleSidebar.addEventListener('click', () => {
            sidebar.classList.add('open');
            sidebarBackdrop.classList.add('active');
        });
    }
    if (btnCloseSidebar) {
        btnCloseSidebar.addEventListener('click', closeSidebarDrawer);
    }
    if (sidebarBackdrop) {
        sidebarBackdrop.addEventListener('click', closeSidebarDrawer);
    }

    // System Guide Modal Listeners
    if (btnOpenGuide) {
        btnOpenGuide.addEventListener('click', () => {
            openModal(modalSystemGuide);
        });
    }
    if (btnCloseGuide) {
        btnCloseGuide.addEventListener('click', () => {
            closeModal(modalSystemGuide);
        });
    }
    if (btnCloseGuideBtn) {
        btnCloseGuideBtn.addEventListener('click', () => {
            closeModal(modalSystemGuide);
        });
    }

    // Employee selection changes
    employeeSelect.addEventListener('change', handleEmployeeChange);

    // Toggle auto-checkout details visibility
    if (autoCheckoutEnabled && autoCheckoutDetails) {
        autoCheckoutEnabled.addEventListener('change', () => {
            autoCheckoutDetails.style.display = autoCheckoutEnabled.checked ? 'flex' : 'none';
        });
    }

    // Trigger marker entry/exit button
    btnToggleAttendance.addEventListener('click', handleToggleAttendance);

    // Filters
    filterEmployee.addEventListener('change', () => {
        renderAttendanceTable();
        updateEmployeeStats();
    });
    filterMonth.addEventListener('change', () => {
        updateWeekFilterOptions();
        renderAttendanceTable();
        updateEmployeeStats();
    });

    const filterWeek = document.getElementById('filterWeek');
    if (filterWeek) {
        filterWeek.addEventListener('change', () => {
            renderAttendanceTable();
        });
    }

    // Admin dialogs
    btnAdminActions.addEventListener('click', handleAdminActionsClick);
    btnCloseAdminAuth.addEventListener('click', () => closeModal(modalAdminAuth));
    formAdminAuth.addEventListener('submit', handleAdminAuthSubmit);

    btnCloseAdminRegister.addEventListener('click', () => closeModal(modalAdminRegister));
    formAdminRegister.addEventListener('submit', handleAdminRegisterSubmit);
    adminRegisterType.addEventListener('change', toggleAdminEmployeeSelect);

    // Toggle layout width (expand/collapse table)
    const btnToggleLayout = document.getElementById('btnToggleLayout');
    const attendanceLayout = document.getElementById('attendanceLayout');
    const toggleLayoutText = document.getElementById('toggleLayoutText');

    if (btnToggleLayout && attendanceLayout) {
        btnToggleLayout.addEventListener('click', () => {
            const isExpanded = attendanceLayout.classList.toggle('expanded-table');
            if (toggleLayoutText) {
                toggleLayoutText.textContent = isExpanded ? 'Ver normal' : 'Ver completo';
            }
        });
    }
}

function closeSidebarDrawer() {
    sidebar.classList.remove('open');
    sidebarBackdrop.classList.remove('active');
}

// Modal Helpers
function openModal(modalEl) {
    if (!modalEl) return;
    modalEl.classList.add('active');
    document.body.classList.add('no-scroll');
}

function closeModal(modalEl) {
    if (!modalEl) return;
    modalEl.classList.remove('active');
    document.body.classList.remove('no-scroll');
}

// Date & Time Utility helpers
function formatTime12h(timeStr) {
    if (!timeStr) return '';
    const parts = timeStr.split(':');
    if (parts.length < 2) return timeStr;
    let hour = parseInt(parts[0], 10);
    const min = parts[1];
    const ampm = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12;
    hour = hour ? hour : 12;
    return `${hour}:${min} ${ampm}`;
}

function parseInputTime(timeStr, ampm) {
    if (!timeStr) return null;
    const cleanStr = timeStr.trim().replace(/\s+/g, '');
    const match = cleanStr.match(/^(\d{1,2})(?:[:.](\d{2}))?$/);
    if (!match) return null;
    let hours = parseInt(match[1], 10);
    let minutes = match[2] ? parseInt(match[2], 10) : 0;
    if (hours < 1 || hours > 12) return null;
    if (minutes < 0 || minutes > 59) return null;
    if (ampm === 'PM') {
        if (hours < 12) hours += 12;
    } else {
        if (hours === 12) hours = 0;
    }
    const hStr = String(hours).padStart(2, '0');
    const mStr = String(minutes).padStart(2, '0');
    return `${hStr}:${mStr}`;
}

function getLocalDateString(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function getLocalTimeString(date) {
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
}

function getMondayAndSundayOfDate(d) {
    const date = new Date(d.getTime());
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Monday
    const monday = new Date(date.setDate(diff));
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday.getTime());
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    return { monday, sunday };
}

function roundCheckoutTime(timeStr) {
    if (!timeStr) return timeStr;
    const parts = timeStr.split(':');
    if (parts.length < 2) return timeStr;

    let hour = parseInt(parts[0], 10);
    let min = parseInt(parts[1], 10);

    // Solo aplica para salidas a partir de las 14:00 (2 PM) en adelante
    const isAfternoon = (hour >= 14);

    if (isAfternoon) {
        if (min > 0 && min <= 5) {
            min = 0;
        }
    }

    const hStr = String(hour).padStart(2, '0');
    const mStr = String(min).padStart(2, '0');
    const sStr = parts[2] ? '00' : '';

    return sStr ? `${hStr}:${mStr}:${sStr}` : `${hStr}:${mStr}`;
}

function calculateDurationInHours(startDateStr, startTimeStr, endDateStr, endTimeStr) {
    const startObj = new Date(`${startDateStr}T${startTimeStr}`);
    const endObj = new Date(`${endDateStr}T${endTimeStr}`);

    // Difference in milliseconds
    const diffMs = endObj - startObj;
    if (diffMs < 0) return 0;

    // Convert to hours
    return diffMs / (1000 * 60 * 60);
}

function formatHoursText(hoursDecimal) {
    const hours = Math.floor(hoursDecimal);
    const minutes = Math.round((hoursDecimal - hours) * 60);

    let text = '';
    if (hours > 0) text += `${hours} h `;
    if (minutes > 0 || hours === 0) text += `${minutes} min`;
    return text.trim();
}

function formatHoursToHHMM(hoursDecimal, includeSuffix = true) {
    if (hoursDecimal === null || hoursDecimal === undefined || isNaN(hoursDecimal)) {
        return includeSuffix ? '0 h' : '0';
    }
    const totalMinutes = Math.round(hoursDecimal * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;

    if (m === 0) {
        return includeSuffix ? `${h} h` : `${h}`;
    } else {
        return includeSuffix ? `${h}:${String(m).padStart(2, '0')} h` : `${h}:${String(m).padStart(2, '0')}`;
    }
}

function formatDateDDMMYYYY(dateStr) {
    if (!dateStr || !dateStr.includes('-')) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[2].length === 4 ? parts[0] : parts[0]}`;
    }
    return dateStr;
}

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g,
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

// Calculate expected working hours for a given month (Mon-Sat, 8h/day) for the entire month.
function getExpectedHoursForMonth(yearMonthStr) {
    const [year, month] = yearMonthStr.split('-').map(Number);
    const jsMonth = month - 1;

    const lastDay = new Date(year, month, 0).getDate();

    let workingDays = 0;
    for (let day = 1; day <= lastDay; day++) {
        const date = new Date(year, jsMonth, day);
        const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
        if (dayOfWeek !== 0) { // Exclude Sunday
            workingDays++;
        }
    }
    return workingDays * 8;
}

// Get real credited hours, deducting 1 hour for lunch if it's a Trabajo shift > 5 hours
function getRealHoursCredited(r) {
    if (r.type !== 'Trabajo' || !r.check_in || !r.check_out) {
        return Number(r.hours_credited || 0);
    }

    // Si la nota indica expresamente que no almorzó, no se descuenta
    const noLunch = r.notes && (r.notes.includes('Sin almuerzo') || r.notes.includes('Sin refrigerio') || r.notes.includes('no almorzó'));

    // Usamos solo las horas y minutos (HH:MM) para evitar diferencias de segundos
    const inTime = r.check_in.substring(0, 5);
    const outTime = r.check_out.substring(0, 5);
    const elapsed = calculateDurationInHours(r.date, inTime, r.date, outTime);

    if (elapsed > 5 && !noLunch) {
        return Math.max(0, elapsed - 1);
    }
    return elapsed;
}

// Check and process automatic checkouts
async function checkAndProcessAutoCheckouts() {
    const now = new Date();
    const todayStr = getLocalDateString(now);
    const currentTimeStr = getLocalTimeString(now);

    // Find shifts that are open and have either the [Auto-6PM] tag or the new [Auto-HH:MM] tag
    const pendingShifts = allAttendanceRecords.filter(r => 
        r.type === 'Trabajo' && 
        r.check_in && 
        !r.check_out && 
        r.notes && 
        (r.notes.includes('[Auto-6PM]') || r.notes.includes('[Auto-'))
    );

    if (pendingShifts.length === 0) return;

    let updatedAny = false;

    for (const shift of pendingShifts) {
        let autoOutTime = '18:00:00'; // Default fallback
        
        // Parse the scheduled checkout time from the notes
        const match = shift.notes.match(/\[Auto-(\d{2}:\d{2})\]/);
        if (match) {
            autoOutTime = match[1] + ':00';
        } else if (shift.notes.includes('[Auto-6PM]')) {
            autoOutTime = '18:00:00';
        } else {
            continue; // Not a valid auto checkout shift
        }

        // Trigger auto check-out if it's a past date or today past the scheduled time
        const isPastDate = shift.date < todayStr;
        const isTodayAndPastTime = shift.date === todayStr && currentTimeStr >= autoOutTime;

        if (isPastDate || isTodayAndPastTime) {
            const inTimeHHMM = shift.check_in.substring(0, 5);
            const outTimeHHMM = autoOutTime.substring(0, 5);
            
            const diffHours = calculateDurationInHours(shift.date, inTimeHHMM, shift.date, outTimeHHMM);
            const tookLunch = true; // Default to taking lunch for a standard full day
            const lunchDeducted = diffHours > 5 && tookLunch;
            const finalHours = lunchDeducted ? Math.max(0, diffHours - 1) : diffHours;

            const timeFormatted12h = formatTime12h(outTimeHHMM);
            let checkoutNotes = `Salida automática a las ${timeFormatted12h}`;
            if (lunchDeducted) {
                checkoutNotes += ' (Descuento 1h almuerzo)';
            }

            const updatedShift = {
                ...shift,
                check_out: autoOutTime,
                hours_credited: Number(finalHours.toFixed(2)),
                notes: checkoutNotes
            };

            try {
                if (dbMode === 'supabase' && supabaseClient) {
                    const { error } = await supabaseClient
                        .from('asistencias')
                        .update({
                            check_out: updatedShift.check_out,
                            hours_credited: updatedShift.hours_credited,
                            notes: updatedShift.notes
                        })
                        .eq('id', shift.id);

                    if (error) throw error;
                } else {
                    let localList = getLocalAttendance();
                    localList = localList.map(r => r.id === shift.id ? updatedShift : r);
                    saveLocalAttendance(localList);
                }

                // Add log entry
                const operatorName = localStorage.getItem('canchapro_user_name') || 'Sistema';
                const entry = {
                    action: 'editar',
                    user_name: operatorName,
                    details: `[Asistencia] salida automática a las ${timeFormatted12h} de ${shift.employee_name} (${formatHoursText(finalHours)})`,
                    created_at: new Date().toISOString()
                };

                if (dbMode === 'supabase' && supabaseClient) {
                    await supabaseClient.from('historial').insert([entry]);
                } else {
                    saveHistoryEntryLocal(entry);
                }

                updatedAny = true;
            } catch (err) {
                console.error(`Error during auto-checkout for ${shift.employee_name}:`, err);
            }
        }
    }

    if (updatedAny) {
        await fetchAttendanceRecords();
        handleEmployeeChange();
    }
}

// Expose handleDeleteRecord globally for inline onclick
window.handleDeleteRecord = handleDeleteRecord;
