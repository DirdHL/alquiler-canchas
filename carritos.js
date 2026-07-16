// =======================================================
// Carritos e inflables - Sistema de Reservas
// =======================================================

let dbMode = 'local';
let supabaseClient = null;
let realtimeChannel = null;
let calendar = null;
let bookings = [];
let activeOperator = 'Invitado';

document.addEventListener('DOMContentLoaded', async () => {
    lucide.createIcons();
    setupEventListeners();
    loadOperatorSession();
    await initDatabase();
    initCalendar();
    await fetchBookings();
});

function loadOperatorSession() {
    const savedOperator = localStorage.getItem('canchapro_user_name');
    if (savedOperator) {
        activeOperator = savedOperator;
        document.getElementById('displayUserName').textContent = activeOperator;
    }
}

function setupEventListeners() {
    document.getElementById('btnToggleSidebar').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('active'));
    document.getElementById('btnCloseSidebar').addEventListener('click', () => document.getElementById('sidebar').classList.remove('active'));
    document.getElementById('btnNewReservation').addEventListener('click', () => openBookingModal());
    document.getElementById('btnCloseBooking').addEventListener('click', () => closeModal('modalBooking'));
    document.getElementById('btnOpenSettings').addEventListener('click', () => openModal('modalSettings'));
    document.getElementById('btnCloseSettings').addEventListener('click', () => closeModal('modalSettings'));
    document.getElementById('formSettings').addEventListener('submit', handleSaveSettings);
    document.getElementById('formBooking').addEventListener('submit', handleSaveBooking);
    document.getElementById('btnDeleteBooking').addEventListener('click', handleDeleteBooking);
    const historySearchInput = document.getElementById('historySearchInput');
    const btnClearHistoryLocal = document.getElementById('btnClearHistoryLocal');
    
    document.getElementById('btnOpenHistory').addEventListener('click', () => {
        if (historySearchInput) historySearchInput.value = '';
        openHistoryModal();
    });
    document.getElementById('btnCloseHistory').addEventListener('click', () => closeModal('modalHistory'));
    if (historySearchInput) {
        historySearchInput.addEventListener('input', openHistoryModal);
    }
    if (btnClearHistoryLocal) {
        btnClearHistoryLocal.addEventListener('click', () => {
            if (confirm("¿Estás seguro de que deseas limpiar el historial local? Esto no afectará la base de datos Supabase.")) {
                localStorage.removeItem('canchapro_historial_carritos');
                openHistoryModal();
            }
        });
    }

    // Dynamic calculations
    document.getElementById('bookingTotal').addEventListener('input', runDynamicCalculations);
    document.getElementById('bookingAdelanto').addEventListener('input', runDynamicCalculations);

    const bookingDniInput = document.getElementById('bookingDni');
    if (bookingDniInput) {
        bookingDniInput.addEventListener('input', function () {
            this.value = this.value.replace(/[^0-9]/g, '');
        });
    }

    const bookingCategoria = document.getElementById('bookingCategoria');
    if (bookingCategoria) {
        bookingCategoria.addEventListener('change', function () {
            updateBookingLocalOptions(this.value);
        });
    }


    // Stats Event Listeners
    document.getElementById('btnOpenStats').addEventListener('click', () => openStatsAuthModal());
    document.getElementById('btnCloseStatsAuth').addEventListener('click', () => closeModal('modalStatsAuth'));
    document.getElementById('btnCloseStatsModal').addEventListener('click', () => closeModal('modalStats'));
    document.getElementById('btnExportStatsExcel').addEventListener('click', exportAllDataToExcel);
    document.getElementById('formStatsAuth').addEventListener('submit', handleStatsAuth);

    // Stats Tabs Navigation
    const statsTabBtns = document.querySelectorAll('#modalStats .tab-btn');
    const statsTabContents = document.querySelectorAll('#modalStats .tab-content');
    statsTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');
            statsTabBtns.forEach(b => b.classList.remove('active'));
            statsTabContents.forEach(c => {
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

    // Auto-update and sync start/end dates and times
    const bookingFecha = document.getElementById('bookingFecha');
    const bookingFechaFin = document.getElementById('bookingFechaFin');
    const bookingHoraInicio = document.getElementById('bookingHoraInicio');
    const bookingHoraFin = document.getElementById('bookingHoraFin');

    function updateEndDate() {
        if (!bookingFecha || !bookingFecha.value || !bookingFechaFin) return;
        
        bookingFechaFin.min = bookingFecha.value;
        
        const startVal = bookingHoraInicio ? bookingHoraInicio.value : '';
        const endVal = bookingHoraFin ? bookingHoraFin.value : '';
        
        if (startVal && endVal && endVal <= startVal) {
            // Crossed midnight: set end date to the next day
            const dateParts = bookingFecha.value.split('-');
            const nextDay = new Date(dateParts[0], dateParts[1] - 1, parseInt(dateParts[2]) + 1);
            const yyyy = nextDay.getFullYear();
            const mm = String(nextDay.getMonth() + 1).padStart(2, '0');
            const dd = String(nextDay.getDate()).padStart(2, '0');
            bookingFechaFin.value = `${yyyy}-${mm}-${dd}`;
        } else {
            // Same day
            bookingFechaFin.value = bookingFecha.value;
        }
    }

    if (bookingFecha) {
        bookingFecha.addEventListener('change', updateEndDate);
    }
    if (bookingHoraInicio) {
        bookingHoraInicio.addEventListener('change', updateEndDate);
    }
    if (bookingHoraFin) {
        bookingHoraFin.addEventListener('change', updateEndDate);
    }
    if (bookingFechaFin) {
        bookingFechaFin.addEventListener('change', function () {
            if (bookingFecha.value && this.value < bookingFecha.value) {
                this.value = bookingFecha.value;
            }
        });
    }
}

function runDynamicCalculations() {
    const total = parseFloat(document.getElementById('bookingTotal').value) || 0;
    const adelanto = parseFloat(document.getElementById('bookingAdelanto').value) || 0;
    document.getElementById('bookingPendiente').value = Math.max(0, total - adelanto).toFixed(2);
}

function updateBookingLocalOptions(categoryValue, selectedValue = null) {
    const bookingLocal = document.getElementById('bookingLocal');
    if (!bookingLocal) return;

    bookingLocal.innerHTML = '';

    if (!categoryValue) {
        bookingLocal.disabled = true;
        const opt = document.createElement('option');
        opt.value = '';
        opt.disabled = true;
        opt.selected = true;
        opt.textContent = 'Seleccione categoría primero...';
        bookingLocal.appendChild(opt);
        return;
    }

    bookingLocal.disabled = false;
    const placeholderOpt = document.createElement('option');
    placeholderOpt.value = '';
    placeholderOpt.disabled = true;
    placeholderOpt.selected = !selectedValue;
    placeholderOpt.textContent = 'Seleccione artículo...';
    bookingLocal.appendChild(placeholderOpt);

    const articles = {
        'Carrito Snacks': [
            { value: 'Carrito Snacks|Pop corn', text: 'Pop corn' },
            { value: 'Carrito Snacks|Algodón dulce', text: 'Algodón dulce' },
            { value: 'Carrito Snacks|Manzana acaramelada', text: 'Manzana acaramelada' },
            { value: 'Carrito Snacks|Manzana achocolatada', text: 'Manzana achocolatada' },
            { value: 'Carrito Snacks|Churros', text: 'Churros' },
            { value: 'Carrito Snacks|Donuts', text: 'Donuts' },
            { value: 'Carrito Snacks|Mazamorra morada', text: 'Mazamorra morada' },
            { value: 'Carrito Snacks|Arroz con leche', text: 'Arroz con leche' },
            { value: 'Carrito Snacks|Combinado', text: 'Combinado' },
            { value: 'Carrito Snacks|Helado', text: 'Helado' },
            { value: 'Carrito Snacks|Panchos', text: 'Panchos' },
            { value: 'Carrito Snacks|Pan con hot dog', text: 'Pan con hot dog' },
            { value: 'Carrito Snacks|Hamburguesa', text: 'Hamburguesa' },
            { value: 'Carrito Snacks|Brochetas', text: 'Brochetas' },
            { value: 'Carrito Snacks|Choripan', text: 'Choripan' },
            { value: 'Carrito Snacks|Mini salchipapa', text: 'Mini salchipapa' },
            { value: 'Carrito Snacks|Mini pan hot dog', text: 'Mini pan hot dog' },
            { value: 'Carrito Snacks|Mini Burger', text: 'Mini Burger' },
            { value: 'Carrito Snacks|Mini choripan', text: 'Mini choripan' },
            { value: 'Carrito Snacks|Wafles', text: 'Wafles' },
            { value: 'Carrito Snacks|Chicha morada', text: 'Chicha morada' },
            { value: 'Carrito Snacks|Inca Kola 300 ml', text: 'Inca Kola 300 ml' },
            { value: 'Carrito Snacks|Coca Cola 300 ml', text: 'Coca Cola 300 ml' },
            { value: 'Carrito Snacks|Fanta 300 ml', text: 'Fanta 300 ml' },
            { value: 'Carrito Snacks|Agua cielo kids', text: 'Agua cielo kids' }
        ],
        'Magia del rebote': [
            { value: 'Magia del rebote|INFLABLE FUNCITY', text: 'INFLABLE FUNCITY' },
            { value: 'Magia del rebote|Cuatruple Resbalin', text: 'Cuatruple Resbalin' },
            { value: 'Magia del rebote|Escalando', text: 'Escalando' },
            { value: 'Magia del rebote|Triple Resbalin', text: 'Triple Resbalin' },
            { value: 'Magia del rebote|Pista de Obstaculos', text: 'Pista de Obstaculos' },
            { value: 'Magia del rebote|Inflables de destreza', text: 'Inflables de destreza' },
            { value: 'Magia del rebote|Castillo de obstaculos', text: 'Castillo de obstaculos' },
            { value: 'Magia del rebote|Tobogan Arcohiris', text: 'Tobogan Arcohiris' },
            { value: 'Magia del rebote|Castillo saltarin', text: 'Castillo saltarin' },
            { value: 'Magia del rebote|Tortuga saltarina', text: 'Tortuga saltarina' },
            { value: 'Magia del rebote|Bolikche Bunker', text: 'Bolikche Bunker' },
            { value: 'Magia del rebote|Rueda Rueda', text: 'Rueda Rueda' },
            { value: 'Magia del rebote|Campo de Fútbol', text: 'Campo de Fútbol' },
            { value: 'Magia del rebote|Bumper Balls', text: 'Bumper Balls' }
        ]
    };

    let found = false;
    const categoryArticles = articles[categoryValue] || [];
    categoryArticles.forEach(art => {
        const opt = document.createElement('option');
        opt.value = art.value;
        opt.textContent = art.text;
        if (selectedValue && (art.value === selectedValue || 
            (selectedValue.startsWith('Juego Inflable|') && art.value === selectedValue.replace('Juego Inflable|', 'Magia del rebote|')))) {
            opt.selected = true;
            found = true;
        }
        bookingLocal.appendChild(opt);
    });

    if (selectedValue && !found) {
        // Legacy option compatibility
        const opt = document.createElement('option');
        opt.value = selectedValue;
        const parts = selectedValue.split('|');
        opt.textContent = parts[1] || parts[0];
        opt.selected = true;
        bookingLocal.appendChild(opt);
    }
}

function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

function openBookingModal(booking = null, defaultDate = null) {
    document.getElementById('formBooking').reset();
    document.getElementById('bookingId').value = '';
    document.getElementById('bookingError').textContent = '';
    
    // Operators
    const selectAsesor = document.getElementById('bookingNotes');
    selectAsesor.innerHTML = `<option value="${activeOperator}" selected>${activeOperator}</option>`;
    
    if (defaultDate) {
        document.getElementById('bookingFecha').value = defaultDate;
        const finInput = document.getElementById('bookingFechaFin');
        if (finInput) finInput.value = defaultDate;
    } else {
        const todayStr = new Date().toISOString().split('T')[0];
        document.getElementById('bookingFecha').value = todayStr;
        const finInput = document.getElementById('bookingFechaFin');
        if (finInput) finInput.value = todayStr;
    }
    
    if (booking) {
        document.getElementById('modalTitle').textContent = 'Editar Reserva';
        document.getElementById('bookingId').value = booking.id;
        document.getElementById('bookingName').value = booking.nombre_cliente || '';
        document.getElementById('bookingDni').value = booking.telefono_cliente || '';
        
        // Cargar Categoría y Artículo dinámicamente
        const categorySelect = document.getElementById('bookingCategoria');
        if (categorySelect) {
            let cat = booking.categoria || '';
            if (cat === 'Juego Inflable') cat = 'Magia del rebote';
            categorySelect.value = cat;
            updateBookingLocalOptions(cat, `${booking.categoria}|${booking.item}`);
        } else {
            document.getElementById('bookingLocal').value = `${booking.categoria}|${booking.item}`;
        }
        document.getElementById('bookingFecha').value = booking.fecha_reserva;
        document.getElementById('bookingHoraInicio').value = booking.hora_inicio.substring(0, 5);
        document.getElementById('bookingHoraFin').value = booking.hora_fin.substring(0, 5);
        
        // Calculate and set Fecha Fin
        const finInput = document.getElementById('bookingFechaFin');
        if (finInput) {
            let fechaFinStr = booking.fecha_reserva;
            if (booking.hora_fin && booking.hora_inicio && booking.hora_fin.substring(0, 5) <= booking.hora_inicio.substring(0, 5)) {
                const dateParts = booking.fecha_reserva.split('-');
                const nextDay = new Date(dateParts[0], dateParts[1] - 1, parseInt(dateParts[2]) + 1);
                const yyyy = nextDay.getFullYear();
                const mm = String(nextDay.getMonth() + 1).padStart(2, '0');
                const dd = String(nextDay.getDate()).padStart(2, '0');
                fechaFinStr = `${yyyy}-${mm}-${dd}`;
            }
            finInput.value = fechaFinStr;
        }
        document.getElementById('bookingSource').value = booking.medio_contacto || 'Msg masivo';
        document.getElementById('bookingTotal').value = booking.monto_total;
        document.getElementById('bookingAdelanto').value = booking.monto_adelanto;
        document.getElementById('bookingComment').value = booking.notas || '';
        document.getElementById('bookingIsBlock').checked = booking.estado_reserva === 'Bloqueado';
        document.getElementById('btnDeleteBooking').classList.remove('hidden');
    } else {
        document.getElementById('modalTitle').textContent = 'Nueva Reserva de Artículo';
        document.getElementById('btnDeleteBooking').classList.add('hidden');
        
        // Reset Categoría y Artículo
        const categorySelect = document.getElementById('bookingCategoria');
        if (categorySelect) {
            categorySelect.value = '';
        }
        updateBookingLocalOptions('');
    }
    
    runDynamicCalculations();
    openModal('modalBooking');
}

async function handleSaveBooking(e) {
    e.preventDefault();
    const isBlock = document.getElementById('bookingIsBlock').checked;
    
    const [categoria, item] = document.getElementById('bookingLocal').value.split('|');
    const payload = {
        categoria: categoria,
        item: item,
        nombre_cliente: document.getElementById('bookingName').value,
        telefono_cliente: document.getElementById('bookingDni').value,
        fecha_reserva: document.getElementById('bookingFecha').value,
        hora_inicio: document.getElementById('bookingHoraInicio').value,
        hora_fin: document.getElementById('bookingHoraFin').value,
        tipo_evento: '',
        monto_total: parseFloat(document.getElementById('bookingTotal').value) || 0,
        monto_adelanto: parseFloat(document.getElementById('bookingAdelanto').value) || 0,
        medio_contacto: document.getElementById('bookingSource').value,
        estado_reserva: isBlock ? 'Bloqueado' : 'Confirmado',
        notas: document.getElementById('bookingComment').value,
        asesor_registro: document.getElementById('bookingNotes').value
    };

    const bookingId = document.getElementById('bookingId').value;
    
    if (dbMode === 'supabase' && supabaseClient) {
        let error;
        if (bookingId) {
            const res = await supabaseClient.from('reservas_carritos').update(payload).eq('id', bookingId);
            error = res.error;
        } else {
            const res = await supabaseClient.from('reservas_carritos').insert([payload]);
            error = res.error;
        }
        
        if (error) {
            document.getElementById('bookingError').textContent = 'Error al guardar: ' + error.message;
            return;
        }
    } else {
        // Local mode fallback
        if (bookingId) {
            const idx = bookings.findIndex(b => b.id === bookingId);
            if (idx >= 0) bookings[idx] = { ...bookings[idx], ...payload };
        } else {
            payload.id = Date.now().toString();
            bookings.push(payload);
        }
        localStorage.setItem('canchapro_reservas_carritos', JSON.stringify(bookings));
    }

    // Log history
    const isEdit = !!bookingId;
    const actionVerb = isEdit ? 'editar' : 'crear';
    const detailMessage = `${isEdit ? 'Editó' : 'Creó'} reserva para ${payload.nombre_cliente} (${payload.categoria} - ${payload.item}) el ${payload.fecha_reserva} de ${payload.hora_inicio} a ${payload.hora_fin}`;
    await addHistoryEntry(actionVerb, detailMessage);
    
    closeModal('modalBooking');
    if (dbMode === 'local') await fetchBookings();
}

async function handleDeleteBooking() {
    if (!confirm('¿Estás seguro de eliminar esta reserva?')) return;
    const bookingId = document.getElementById('bookingId').value;
    
    const targetBooking = bookings.find(b => b.id === bookingId);
    const clientName = targetBooking ? targetBooking.nombre_cliente : 'Desconocido';
    const detailStr = targetBooking 
        ? `Eliminó reserva para ${clientName} (${targetBooking.categoria} - ${targetBooking.item}) del ${targetBooking.fecha_reserva}`
        : `Eliminó reserva ID: ${bookingId}`;

    if (dbMode === 'supabase' && supabaseClient) {
        await supabaseClient.from('reservas_carritos').delete().eq('id', bookingId);
    } else {
        bookings = bookings.filter(b => b.id !== bookingId);
        localStorage.setItem('canchapro_reservas_carritos', JSON.stringify(bookings));
    }

    await addHistoryEntry('eliminar', detailStr);

    closeModal('modalBooking');
    if (dbMode === 'local') await fetchBookings();
}

function formatClientName(fullName) {
    if (!fullName) return '';
    const parts = fullName.trim().split(/\s+/);
    if (parts.length <= 1) return fullName;
    if (parts.length === 2) return `${parts[0]} ${parts[1]}`;
    
    const commonMiddleNames = [
        'maria', 'maría', 'carlos', 'jose', 'josé', 'luis', 'ana', 'juan', 
        'antonio', 'manuel', 'francisco', 'jesus', 'jesús', 'miguel', 'angel', 
        'ángel', 'pedro', 'javier', 'david', 'daniel', 'fernando', 'andres', 
        'andrés', 'ramon', 'ramón', 'jorge', 'alberto', 'eduardo', 'alejandro', 
        'enrique', 'diego', 'sergio', 'victor', 'víctor', 'carmen', 'pilar', 
        'isabel', 'dolores', 'teresa', 'rosa', 'sofia', 'sofía', 'elena', 
        'margarita', 'lucia', 'lucía', 'patricia', 'laura', 'marta', 'cristina', 
        'mercedes', 'raquel', 'irene', 'beatriz', 'sandra', 'monica', 'mónica',
        'de', 'del', 'la', 'las', 'los'
    ];
    
    const secondPartLower = parts[1].toLowerCase();
    if (commonMiddleNames.includes(secondPartLower)) {
        if (parts.length >= 3) {
            const thirdPartLower = parts[2].toLowerCase();
            if (commonMiddleNames.includes(thirdPartLower) && parts.length >= 4) {
                return `${parts[0]} ${parts[3]}`;
            }
            return `${parts[0]} ${parts[2]}`;
        }
    }
    return `${parts[0]} ${parts[1]}`;
}

function initCalendar() {
    const calendarEl = document.getElementById('calendar');
    const isMobile = window.innerWidth < 768;
    
    calendar = new FullCalendar.Calendar(calendarEl, {
        locale: 'es',
        firstDay: 1, // 1 = Lunes
        height: 'auto',
        initialView: 'multiMonthYear',
        multiMonthMaxColumns: isMobile ? 1 : 2,
        dayMaxEvents: isMobile ? false : 2,
        headerToolbar: isMobile ? {
            left: 'prev,next',
            center: 'title',
            right: 'multiMonthYear,dayGridMonth'
        } : {
            left: 'prev,next today',
            center: 'title',
            right: 'multiMonthYear,dayGridMonth,timeGridWeek,timeGridDay'
        },
        buttonText: {
            today: 'Hoy',
            month: 'Mes',
            week: 'Semana',
            day: 'Día',
            multiMonthYear: 'Año'
        },
        dateClick: function(info) {
            openBookingModal(null, info.dateStr);
        },
        eventClick: function(info) {
            openBookingModal(info.event.extendedProps.rawBooking);
        },
        eventDidMount: function(info) {
            const b = info.event.extendedProps.rawBooking;
            if (!b) return;

            let tooltip = document.getElementById('calendar-tooltip');
            if (!tooltip) {
                tooltip = document.createElement('div');
                tooltip.id = 'calendar-tooltip';
                tooltip.className = 'calendar-tooltip';
                document.body.appendChild(tooltip);
            }

            info.el.addEventListener('mouseenter', function(e) {
                const clientName = formatClientName(b.nombre_cliente);
                const startTime = b.hora_inicio ? b.hora_inicio.substring(0, 5) : '';
                const endTime = b.hora_fin ? b.hora_fin.substring(0, 5) : '';
                const eventType = b.tipo_evento;
                const advisor = b.asesor_registro || 'No asignado';
                const categoria = b.categoria || 'Carritos';
                const item = b.item || '';
                const isBlocked = b.estado_reserva === 'Bloqueado';

                let contentHtml = '';
                if (isBlocked) {
                    contentHtml = `
                        <div class="tooltip-header tooltip-blocked">
                            <span class="tooltip-icon">🔒</span>
                            <strong>Artículo Bloqueado</strong>
                        </div>
                        <div class="tooltip-body">
                            <p><strong>Artículo:</strong> ${categoria} - ${item}</p>
                            <p><strong>Horario:</strong> ${startTime} - ${endTime}</p>
                            ${b.notas ? `<p><strong>Motivo:</strong> ${b.notas}</p>` : ''}
                            <p><strong>Asesor:</strong> ${advisor}</p>
                        </div>
                    `;
                } else {
                    const categoryClass = categoria.toLowerCase().replace(/\s+/g, '-');
                    contentHtml = `
                        <div class="tooltip-header tooltip-categoria-${categoryClass}">
                            <span class="tooltip-icon">🍭</span>
                            <strong>${categoria} - ${item}</strong>
                        </div>
                        <div class="tooltip-body">
                            <p><strong>Cliente:</strong> ${clientName}</p>
                            <p><strong>Horario:</strong> ${startTime} - ${endTime}</p>
                            ${eventType ? `<p><strong>Evento:</strong> ${eventType}</p>` : ''}
                            <p><strong>Asesor@:</strong> ${advisor}</p>
                        </div>
                    `;
                }

                tooltip.innerHTML = contentHtml;
                tooltip.classList.add('show');

                const rect = info.el.getBoundingClientRect();
                const tooltipWidth = tooltip.offsetWidth || 220;
                const tooltipHeight = tooltip.offsetHeight || 130;

                let top = rect.top + window.scrollY - tooltipHeight - 10;
                let left = rect.left + window.scrollX + (rect.width / 2) - (tooltipWidth / 2);

                if (left < 10) left = 10;
                if (left + tooltipWidth > window.innerWidth - 10) {
                    left = window.innerWidth - tooltipWidth - 10;
                }
                if (rect.top - tooltipHeight - 10 < 10) {
                    top = rect.bottom + window.scrollY + 10;
                }

                tooltip.style.top = `${top}px`;
                tooltip.style.left = `${left}px`;
            });

            info.el.addEventListener('mouseleave', function() {
                tooltip.classList.remove('show');
            });

            info.el.addEventListener('click', function() {
                tooltip.classList.remove('show');
            });
        },
        events: []
    });
    calendar.render();

    let lastWidth = window.innerWidth;
    window.addEventListener('resize', () => {
        const currentWidth = window.innerWidth;
        if (!calendar) {
            lastWidth = currentWidth;
            return;
        }
        const wasMobile = lastWidth < 768;
        const isMobile = currentWidth < 768;
        if (wasMobile !== isMobile) {
            calendar.setOption('multiMonthMaxColumns', isMobile ? 1 : 2);
            calendar.setOption('dayMaxEvents', isMobile ? false : 2);
            calendar.setOption('headerToolbar', isMobile ? {
                left: 'prev,next',
                center: 'title',
                right: 'multiMonthYear,dayGridMonth'
            } : {
                left: 'prev,next today',
                center: 'title',
                right: 'multiMonthYear,dayGridMonth,timeGridWeek,timeGridDay'
            });
        }
        lastWidth = currentWidth;
    });
}

function renderCalendarEvents() {
    const events = [];
    bookings.forEach(b => {
        let filterId = '';
        let color = '#ec4899'; 
        let titlePrefix = `[${b.item || ''}]`;
        let customClass = '';
        
        let cat = b.categoria;
        if (cat === 'Juego Inflable') cat = 'Magia del rebote';

        if (cat === 'Carrito Snacks') {
            color = '#db2777'; 
            customClass = 'event-popcorn';
        } else if (cat === 'Magia del rebote') {
            color = '#0284c7';
            customClass = 'event-castillo';
        }
        
        let title = `${titlePrefix} ${b.nombre_cliente}${b.tipo_evento ? ' - ' + b.tipo_evento : ''}`;
        if (b.estado_reserva === 'Bloqueado') {
            title = `🔒 BLOQUEADO ${titlePrefix}`;
            color = '#ef4444';
            customClass = 'event-bloqueado';
        }
        
        let endIso = `${b.fecha_reserva}T${b.hora_fin}`;
        if (b.hora_fin && b.hora_inicio && b.hora_fin <= b.hora_inicio) {
            const dateParts = b.fecha_reserva.split('-');
            const nextDay = new Date(dateParts[0], dateParts[1] - 1, parseInt(dateParts[2]) + 1);
            const yyyy = nextDay.getFullYear();
            const mm = String(nextDay.getMonth() + 1).padStart(2, '0');
            const dd = String(nextDay.getDate()).padStart(2, '0');
            endIso = `${yyyy}-${mm}-${dd}T${b.hora_fin}`;
        }

        events.push({
            id: b.id,
            title: title,
            start: `${b.fecha_reserva}T${b.hora_inicio}`,
            end: endIso,
            backgroundColor: color,
            borderColor: color,
            classNames: [customClass],
            extendedProps: { rawBooking: b }
        });
    });
    
    calendar.removeAllEvents();
    calendar.addEventSource(events);
    
    // Update daily summary
    const today = new Date().toISOString().split('T')[0];
    const todayEvents = bookings.filter(b => b.fecha_reserva === today);
    document.getElementById('statTodayOccupied').textContent = `${todayEvents.length} Alquileres`;
}

// ==========================================
// SUPABASE / DB LOGIC
// ==========================================
async function initDatabase() {
    const savedUrl = localStorage.getItem('canchapro_supabase_url');
    const savedKey = localStorage.getItem('canchapro_supabase_key');
    
    if (savedUrl && savedKey) {
        try {
            supabaseClient = window.supabase.createClient(savedUrl, savedKey);
            dbMode = 'supabase';
            
            // Subscribe to real-time changes
            realtimeChannel = supabaseClient.channel('custom-all-channel-carritos')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'reservas_carritos' }, payload => {
                    fetchBookings();
                })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'historial' }, payload => {
                    const modal = document.getElementById('modalHistory');
                    if (modal && modal.classList.contains('active')) {
                        openHistoryModal();
                    }
                })
                .subscribe();
                
            document.getElementById('statusDot').className = 'status-dot connected';
            document.getElementById('statusText').textContent = 'Conectado a la Nube (Supabase)';
            document.getElementById('statusDesc').textContent = 'Sincronización en tiempo real activa.';
        } catch (e) {
            console.error('Supabase init error:', e);
            dbMode = 'local';
        }
    }
}

function handleSaveSettings(e) {
    e.preventDefault();
    const url = document.getElementById('supabaseUrl').value.trim();
    const key = document.getElementById('supabaseKey').value.trim();
    localStorage.setItem('canchapro_supabase_url', url);
    localStorage.setItem('canchapro_supabase_key', key);
    window.location.reload();
}

async function fetchBookings() {
    if (dbMode === 'supabase' && supabaseClient) {
        const { data, error } = await supabaseClient.from('reservas_carritos').select('*');
        if (!error && data) {
            bookings = data;
        }
    } else {
        const localData = localStorage.getItem('canchapro_reservas_carritos');
        if (localData) {
            try {
                bookings = JSON.parse(localData);
            } catch (e) {
                bookings = [];
            }
        }
    }
    renderCalendarEvents();
}

// ==========================================
// HISTORY / LOGGING LOGIC
// ==========================================
async function addHistoryEntry(action, details) {
    const entry = {
        action,
        user_name: activeOperator,
        details: `[Carritos] ${details}`,
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
    localStorage.setItem('canchapro_historial_carritos', JSON.stringify(history));
}

function getHistoryLocal() {
    const data = localStorage.getItem('canchapro_historial_carritos');
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

    // Filter to only include Carritos logs
    entries = entries.filter(e => {
        const d = e.details || '';
        return d.startsWith('[Carritos]');
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
            if (cleanDetails.startsWith('[Carritos] ')) {
                cleanDetails = cleanDetails.substring('[Carritos] '.length);
            }

            // Format timestamp relative
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

function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

// ----------------------------------------------------
// Statistics Dashboard Engine - Carritos e inflables
// ----------------------------------------------------
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

function loadStatsDashboard() {
    openModal('modalStats');

    // Reset tabs on load
    const statsTabBtns = document.querySelectorAll('#modalStats .tab-btn');
    const statsTabContents = document.querySelectorAll('#modalStats .tab-content');
    statsTabBtns.forEach(b => b.classList.remove('active'));
    statsTabContents.forEach(c => {
        c.classList.remove('active');
        c.style.display = 'none';
    });
    if (statsTabBtns[0]) statsTabBtns[0].classList.add('active');
    if (statsTabContents[0]) {
        statsTabContents[0].classList.add('active');
        statsTabContents[0].style.display = 'block';
    }

    const today = new Date();
    const thisMonth = today.getMonth();
    const thisYear = today.getFullYear();

    // 1. Gather bookings this month
    const monthBookings = bookings.filter(b => {
        if (b.estado_reserva === 'Bloqueado') return false;
        if (!b.fecha_reserva) return false;
        const start = new Date(b.fecha_reserva + 'T00:00:00');
        return (start.getMonth() === thisMonth && start.getFullYear() === thisYear);
    });

    // 2. Calculations
    let totalRevenue = 0;
    let depositoTotal = 0;
    let otrosTotal = 0;

    const itemsMap = {
        'Carrito Snacks - Popcorn': { count: 0, revenue: 0, hours: 0, daysOccupied: 0 },
        'Carrito Snacks - Algodón de Azúcar': { count: 0, revenue: 0, hours: 0, daysOccupied: 0 },
        'Carrito Snacks - Hot Dogs': { count: 0, revenue: 0, hours: 0, daysOccupied: 0 },
        'Carrito Snacks - Manzanas Acarameladas': { count: 0, revenue: 0, hours: 0, daysOccupied: 0 },
        'Juego Inflable - Castillo Inflable': { count: 0, revenue: 0, hours: 0, daysOccupied: 0 },
        'Juego Inflable - Tobogán Gigante': { count: 0, revenue: 0, hours: 0, daysOccupied: 0 },
        'Juego Inflable - Cama Elástica': { count: 0, revenue: 0, hours: 0, daysOccupied: 0 },
        'Juego Inflable - Toro Mecánico': { count: 0, revenue: 0, hours: 0, daysOccupied: 0 }
    };

    const clientsMap = {};
    const asesoresMap = {};

    monthBookings.forEach(b => {
        const tot = parseFloat(b.monto_total) || 0;
        const adelanto = parseFloat(b.monto_adelanto) || 0;
        totalRevenue += tot;

        if (b.tipo_pago === 'Depósito') {
            depositoTotal += tot;
        } else if (b.tipo_pago === 'Yape' || b.tipo_pago === 'Efectivo') {
            otrosTotal += tot;
        } else {
            depositoTotal += adelanto;
            otrosTotal += Math.max(0, tot - adelanto);
        }

        // Calculate hours
        let rentHours = 0;
        if (b.hora_inicio && b.hora_fin) {
            const startMins = parseTimeToMinutes(b.hora_inicio);
            let endMins = parseTimeToMinutes(b.hora_fin);
            if (endMins <= startMins) endMins += 1440;
            rentHours = (endMins - startMins) / 60;
        }

        // Item mapping
        const key = `${b.categoria} - ${b.item}`;
        if (itemsMap[key]) {
            itemsMap[key].count++;
            itemsMap[key].revenue += tot;
            itemsMap[key].hours += rentHours;
            itemsMap[key].daysOccupied++;
        }

        // Client counts
        const clientName = b.nombre_cliente || 'Desconocido';
        const clientDni = b.telefono_cliente || '';
        const cKey = `${clientName}|${clientDni}`;
        if (!clientsMap[cKey]) {
            clientsMap[cKey] = { name: clientName, dni: clientDni, count: 0 };
        }
        clientsMap[cKey].count++;

        // Asesores stats
        const asesorName = b.asesor_registro || 'Invitado';
        if (!asesoresMap[asesorName]) {
            asesoresMap[asesorName] = { name: asesorName, count: 0, revenue: 0, items: {} };
        }
        asesoresMap[asesorName].count++;
        asesoresMap[asesorName].revenue += tot;
        const sKey = b.item || 'Popcorn';
        asesoresMap[asesorName].items[sKey] = (asesoresMap[asesorName].items[sKey] || 0) + 1;
    });

    // Write metric cards
    document.getElementById('statsIncomeMonth').textContent = `S/. ${totalRevenue.toFixed(2)}`;
    document.getElementById('statsCountMonth').textContent = `${monthBookings.length} reservas`;
    document.getElementById('statsDepositoMonth').textContent = `S/. ${depositoTotal.toFixed(2)}`;
    document.getElementById('statsOtrosMonth').textContent = `S/. ${otrosTotal.toFixed(2)}`;

    // Fill tableStatsReport
    const reportTbody = document.querySelector('#tableStatsReport tbody');
    if (reportTbody) {
        reportTbody.innerHTML = Object.entries(itemsMap).map(([itemName, data]) => {
            return `
                <tr style="border-bottom: 1px solid var(--border-color);">
                    <td style="padding: 12px 16px; font-weight: 500;">${itemName}</td>
                    <td style="padding: 12px 16px;">${data.count}</td>
                    <td style="padding: 12px 16px;">${data.hours.toFixed(1)} h</td>
                    <td style="padding: 12px 16px; font-weight: 600; color: #34d399;">S/. ${data.revenue.toFixed(2)}</td>
                </tr>
            `;
        }).join('');
    }

    // Fill ocupacionContainer (monthly progress bars)
    const ocupacionContainer = document.getElementById('ocupacionContainer');
    if (ocupacionContainer) {
        const daysInMonth = new Date(thisYear, thisMonth + 1, 0).getDate();
        ocupacionContainer.innerHTML = Object.entries(itemsMap).map(([itemName, data]) => {
            const pct = Math.min(100, Math.round((data.daysOccupied / daysInMonth) * 100));
            return `
                <div>
                    <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px;">
                        <span style="font-weight: 500;">${itemName}</span>
                        <span style="color: var(--text-secondary);">${data.daysOccupied} / ${daysInMonth} días (${pct}%)</span>
                    </div>
                    <div style="background: rgba(255, 255, 255, 0.05); height: 8px; border-radius: 4px; overflow: hidden;">
                        <div style="background: var(--primary); width: ${pct}%; height: 100%; border-radius: 4px; transition: width 0.3s ease;"></div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Fill tableStatsClients (top clients)
    const clientsTbody = document.querySelector('#tableStatsClients tbody');
    if (clientsTbody) {
        const sortedClients = Object.values(clientsMap).sort((a, b) => b.count - a.count).slice(0, 10);
        if (sortedClients.length === 0) {
            clientsTbody.innerHTML = `<tr><td colspan="3" style="padding: 16px; text-align: center; color: var(--text-muted);">Sin datos de clientes este mes</td></tr>`;
        } else {
            clientsTbody.innerHTML = sortedClients.map(c => `
                <tr style="border-bottom: 1px solid var(--border-color);">
                    <td style="padding: 12px 16px; font-weight: 500;">${escapeHTML(c.name)}</td>
                    <td style="padding: 12px 16px; color: var(--text-secondary);">${escapeHTML(c.dni || '-')}</td>
                    <td style="padding: 12px 16px; font-weight: 600; text-align: right; color: var(--primary);">${c.count} reservas</td>
                </tr>
            `).join('');
        }
    }

    // Fill tableStatsAsesores
    const asesoresTbody = document.querySelector('#tableStatsAsesores tbody');
    if (asesoresTbody) {
        const sortedAsesores = Object.values(asesoresMap).sort((a, b) => b.revenue - a.revenue);
        if (sortedAsesores.length === 0) {
            asesoresTbody.innerHTML = `<tr><td colspan="4" style="padding: 16px; text-align: center; color: var(--text-muted);">Sin datos de asesores este mes</td></tr>`;
        } else {
            asesoresTbody.innerHTML = sortedAsesores.map(a => {
                const favItem = Object.entries(a.items).sort((x, y) => y[1] - x[1])[0]?.[0] || 'Ninguno';
                return `
                    <tr style="border-bottom: 1px solid var(--border-color);">
                        <td style="padding: 12px 16px; font-weight: 500;">${escapeHTML(a.name)}</td>
                        <td style="padding: 12px 16px;">${a.count}</td>
                        <td style="padding: 12px 16px; font-weight: 600; color: #34d399;">S/. ${a.revenue.toFixed(2)}</td>
                        <td style="padding: 12px 16px; color: var(--text-secondary);">${escapeHTML(favItem)}</td>
                    </tr>
                `;
            }).join('');
        }
    }
}

function parseTimeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.split(':');
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
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
            top:{style:'thin',color:{argb:'FFE2E8F0'}}, 
            left:{style:'thin',color:{argb:'FFE2E8F0'}}, 
            bottom:{style:'thin',color:{argb:'FFE2E8F0'}}, 
            right:{style:'thin',color:{argb:'FFE2E8F0'}} 
        };
    }
    function styleValue(cell, value, isMoney = false) {
        cell.value = isMoney ? parseFloat(parseFloat(value).toFixed(2)) : value;
        if (isMoney) cell.numFmt = '"S/. "#,##0.00';
        cell.font = { name: 'Outfit', bold: true, size: 10, color: { argb: 'FF0F766E' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
        cell.alignment = { vertical: 'middle', horizontal: isMoney ? 'right' : 'left' };
        cell.border = { 
            top:{style:'thin',color:{argb:'FFE2E8F0'}}, 
            left:{style:'thin',color:{argb:'FFE2E8F0'}}, 
            bottom:{style:'thin',color:{argb:'FFE2E8F0'}}, 
            right:{style:'thin',color:{argb:'FFE2E8F0'}} 
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
    styleTitle(mainTitleCell, "REPORTE GENERAL DE RESERVAS Y ESTADÍSTICAS - CARRITOS E INFLABLES", 'FF0F766E', 'FFFFFFFF', 14);
    summaryWs.getRow(sr).height = 40;
    sr += 2; // Blank row

    // Group events by Month based on fecha_reserva
    const groups = {};
    bookings.forEach(b => {
        if (!b.fecha_reserva) return;
        const dateParts = b.fecha_reserva.split('-');
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

    const headersM = ["Mes / Período", "Reservas", "Monto Cobrado", "Monto Adelanto", "Total Facturado"];
    headersM.forEach((h, idx) => {
        styleTitle(summaryWs.getCell(sr, idx + 1), h, 'FF1E293B', 'FFFFFFFF', 10);
    });
    summaryWs.getRow(sr).height = 22; sr++;

    let grandTotalBookings = 0;
    let grandTotalCobrado = 0;
    let grandTotalAdelanto = 0;
    let grandTotalSum = 0;

    let rowIdx = 0;
    for (const [monthLabel, items] of Object.entries(groups)) {
        const bg = monthColorsS[rowIdx % 2];
        const activeItems = items.filter(b => b.estado_reserva !== 'Bloqueado');
        
        let count = activeItems.length;
        let cMonto = 0;
        let aMonto = 0;
        let tMonto = 0;

        activeItems.forEach(b => {
            const tot = parseFloat(b.monto_total) || 0;
            const adelanto = parseFloat(b.monto_adelanto) || 0;
            cMonto += Math.max(0, tot - adelanto);
            aMonto += adelanto;
            tMonto += tot;
        });

        grandTotalBookings += count;
        grandTotalCobrado += cMonto;
        grandTotalAdelanto += aMonto;
        grandTotalSum += tMonto;

        const c1 = summaryWs.getCell(sr, 1);
        c1.value = monthLabel; c1.font = { name: 'Outfit', bold: true, size: 10, color: { argb: 'FF1E293B' } };
        c1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        c1.alignment = { vertical: 'middle', horizontal: 'left' };
        c1.border = { top:{style:'thin',color:{argb:'FFE2E8F0'}}, left:{style:'thin',color:{argb:'FFE2E8F0'}}, bottom:{style:'thin',color:{argb:'FFE2E8F0'}}, right:{style:'thin',color:{argb:'FFE2E8F0'}} };

        styleValue(summaryWs.getCell(sr, 2), count, false);
        styleValue(summaryWs.getCell(sr, 3), cMonto, true);
        styleValue(summaryWs.getCell(sr, 4), aMonto, true);
        styleValue(summaryWs.getCell(sr, 5), tMonto, true);

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
    totalCell.border = { top:{style:'thin',color:{argb:'FF0F766E'}}, left:{style:'thin',color:{argb:'FF0F766E'}}, bottom:{style:'thin',color:{argb:'FF0F766E'}}, right:{style:'thin',color:{argb:'FF0F766E'}} };

    styleValue(summaryWs.getCell(sr, 2), grandTotalBookings, false);
    styleValue(summaryWs.getCell(sr, 3), grandTotalCobrado, true);
    styleValue(summaryWs.getCell(sr, 4), grandTotalAdelanto, true);
    styleValue(summaryWs.getCell(sr, 5), grandTotalSum, true);

    for (let col = 2; col <= 5; col++) {
        summaryWs.getCell(sr, col).font.color = { argb: 'FFFFFFFF' };
        summaryWs.getCell(sr, col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
    }
    summaryWs.getRow(sr).height = 22;
    sr += 3; // Blank rows

    // 2. Item breakdown Block
    summaryWs.mergeCells(sr, 1, sr, 3);
    styleTitle(summaryWs.getCell(sr, 1), "INGRESOS POR ARTÍCULO", 'FF334155', 'FFFFFFFF', 11);
    summaryWs.getRow(sr).height = 24; sr++;

    const headersL = ["Categoría / Artículo", "Reservas", "Monto Alquileres"];
    headersL.forEach((h, idx) => {
        styleTitle(summaryWs.getCell(sr, idx + 1), h, 'FF1E293B', 'FFFFFFFF', 10);
    });
    summaryWs.getRow(sr).height = 22; sr++;

    const activeAll = bookings.filter(b => b.estado_reserva !== 'Bloqueado');
    const itemsBreakdownMap = {};
    activeAll.forEach(b => {
        const key = `${b.categoria || 'Desconocida'} - ${b.item || 'Popcorn'}`;
        if (!itemsBreakdownMap[key]) {
            itemsBreakdownMap[key] = { count: 0, revenue: 0 };
        }
        itemsBreakdownMap[key].count++;
        itemsBreakdownMap[key].revenue += parseFloat(b.monto_total) || 0;
    });

    Object.entries(itemsBreakdownMap).sort((a,b) => a[0].localeCompare(b[0])).forEach(([keyName, data], lIdx) => {
        const bg = monthColorsS[lIdx % 2];
        const c1 = summaryWs.getCell(sr, 1);
        c1.value = keyName; c1.font = { name: 'Outfit', bold: true, size: 10, color: { argb: 'FF1E293B' } };
        c1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        c1.alignment = { vertical: 'middle', horizontal: 'left' };
        c1.border = { top:{style:'thin',color:{argb:'FFE2E8F0'}}, left:{style:'thin',color:{argb:'FFE2E8F0'}}, bottom:{style:'thin',color:{argb:'FFE2E8F0'}}, right:{style:'thin',color:{argb:'FFE2E8F0'}} };
        
        styleValue(summaryWs.getCell(sr, 2), data.count, false);
        styleValue(summaryWs.getCell(sr, 3), data.revenue, true);
        
        summaryWs.getCell(sr, 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        summaryWs.getCell(sr, 3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        
        summaryWs.getRow(sr).height = 20;
        sr++;
    });

    // ─── DATA WORKSHEETS ───────────────────────────────────────────
    const columnsDef = [
        { header: 'Categoría', key: 'categoria', width: 18 },
        { header: 'Artículo', key: 'item', width: 22 },
        { header: 'Cliente', key: 'cliente', width: 25 },
        { header: 'DNI / Teléfono', key: 'celular', width: 14 },
        { header: 'Fecha Reserva', key: 'fecha_reserva', width: 14 },
        { header: 'Hora Inicio', key: 'hora_inicio', width: 12 },
        { header: 'Hora Fin', key: 'hora_fin', width: 12 },
        { header: 'Tipo Evento', key: 'tipo_evento', width: 20 },
        { header: 'Monto Total (S/.)', key: 'monto_total', width: 18 },
        { header: 'Adelanto (S/.)', key: 'monto_adelanto', width: 18 },
        { header: 'Medio de Contacto', key: 'medio', width: 18 },
        { header: 'Estado', key: 'estado', width: 14 },
        { header: 'Asesor', key: 'asesor', width: 16 },
        { header: 'Notas / Observaciones', key: 'notas', width: 30 },
        { header: 'Fecha Registro', key: 'registro', width: 22 }
    ];

    for (const [monthLabel, bookingsInMonth] of Object.entries(groups)) {
        const worksheet = workbook.addWorksheet(monthLabel);
        
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
                categoria: b.categoria || '',
                item: b.item || '',
                cliente: capitalizeName(b.nombre_cliente || ''),
                celular: b.telefono_cliente || '',
                fecha_reserva: b.fecha_reserva || '',
                hora_inicio: b.hora_inicio || '',
                hora_fin: b.hora_fin || '',
                tipo_evento: b.tipo_evento || '',
                monto_total: b.monto_total ? parseFloat(b.monto_total) : 0,
                monto_adelanto: b.monto_adelanto ? parseFloat(b.monto_adelanto) : 0,
                medio: b.medio_contacto || '',
                estado: b.estado_reserva || '',
                asesor: capitalizeName(b.asesor_registro || ''),
                notas: b.notas || '',
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
                if (['fecha_reserva', 'hora_inicio', 'hora_fin', 'celular', 'medio', 'estado'].includes(colKey)) {
                    cell.alignment = { horizontal: 'center', vertical: 'middle' };
                } else if (['monto_total', 'monto_adelanto'].includes(colKey)) {
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
        link.download = 'Reporte_Reservas_Carritos_e_inflables.xlsx';
        link.click();
    }).catch(err => {
        console.error("Error al exportar:", err);
        alert("Ocurrió un error al generar el archivo Excel: " + err.message);
    });
}
