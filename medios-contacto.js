// =======================================================
// Medios de Contacto dinámicos (módulo compartido)
// Usado por: Canchas (index), Polideportivo, Brisas, Locales, Carritos.
//
// - Toma como medios base las opciones estáticas del <select id="bookingSource">.
// - Agrega la opción "➕ Agregar otro medio..." que abre un panel inline.
// - Guarda los nuevos medios en la tabla Supabase `medios_contacto`
//   (misma tabla que Bungalows) con respaldo en localStorage en modo local.
// - Se sincroniza en tiempo real para todos los asesores.
//
// Lee las variables globales de cada página (`supabaseClient`, `dbMode`),
// por eso debe cargarse DESPUÉS del script principal de la página.
// =======================================================
(function () {
    'use strict';

    const ADD_VALUE = '_add_medio_';
    const LEGACY_OTHER_VALUES = ['otro', 'otro...', 'otros'];
    const LS_KEY = 'canchapro_medios_contacto';
    const TABLE = 'medios_contacto';
    const nativeValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');

    let select, panel, input, btnSave, btnCancel, hint;
    let defaultMedios = [];
    let defaultSelected = '';
    let customMedios = [];
    let lastClient;
    let channel = null;

    // ---------- Helpers ----------
    const normalizeKey = (name) => (name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

    function formatName(name) {
        const clean = (name || '').replace(/\s+/g, ' ').trim();
        return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : '';
    }

    function getClient() {
        try {
            if (typeof dbMode !== 'undefined' && dbMode !== 'supabase') return null;
            return (typeof supabaseClient !== 'undefined' && supabaseClient) ? supabaseClient : null;
        } catch (e) {
            return null; // Variable aún no inicializada (TDZ)
        }
    }

    function getValue() { return nativeValue.get.call(select); }
    function setNativeValue(v) { nativeValue.set.call(select, v); }

    function allMedios() {
        const result = [...defaultMedios];
        const keys = new Set(result.map(normalizeKey));
        customMedios.forEach(m => {
            const k = normalizeKey(m);
            if (k && !keys.has(k)) {
                keys.add(k);
                result.push(m);
            }
        });
        return result;
    }

    function findExisting(name) {
        return allMedios().find(m => normalizeKey(m) === normalizeKey(name));
    }

    function hasOption(value) {
        return Array.from(select.options).some(o => o.value === value);
    }

    // Agrega una opción si no existe (ej: medio histórico de una reserva antigua)
    function ensureOption(value) {
        if (!value || value === ADD_VALUE || hasOption(value)) return;
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = value;
        const addOpt = select.querySelector(`option[value="${ADD_VALUE}"]`);
        select.insertBefore(opt, addOpt || null);
    }

    function isPanelOpen() {
        return panel && !panel.classList.contains('hidden');
    }

    // ---------- Render ----------
    function render(selectedValue) {
        const target = selectedValue !== undefined ? selectedValue : getValue();
        select.innerHTML = '';

        allMedios().forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.textContent = m;
            if (m === defaultSelected) opt.defaultSelected = true; // Respeta form.reset()
            select.appendChild(opt);
        });

        const optAdd = document.createElement('option');
        optAdd.value = ADD_VALUE;
        optAdd.textContent = '➕ Agregar otro medio...';
        optAdd.style.fontWeight = '600';
        optAdd.style.color = 'var(--primary)';
        select.appendChild(optAdd);

        if (isPanelOpen()) {
            setNativeValue(ADD_VALUE);
        } else {
            const finalValue = (target && target !== ADD_VALUE) ? target : (select.dataset.prev || defaultSelected || defaultMedios[0] || '');
            ensureOption(finalValue);
            setNativeValue(finalValue);
            select.dataset.prev = getValue();
        }
    }

    // ---------- Datos ----------
    function loadLocal() {
        try {
            return JSON.parse(localStorage.getItem(LS_KEY) || '[]');
        } catch (e) {
            return [];
        }
    }

    function saveLocal(name) {
        const list = loadLocal();
        if (!list.some(m => normalizeKey(m) === normalizeKey(name))) {
            list.push(name);
            localStorage.setItem(LS_KEY, JSON.stringify(list));
        }
    }

    async function fetchMedios() {
        const client = getClient();
        if (client) {
            try {
                const { data, error } = await client
                    .from(TABLE)
                    .select('nombre')
                    .order('created_at', { ascending: true });
                if (error) throw error;
                customMedios = (data || []).map(r => r.nombre);
            } catch (err) {
                console.warn('Tabla medios_contacto no disponible, usando respaldo local:', err.message);
                customMedios = loadLocal();
            }
        } else {
            customMedios = loadLocal();
        }
        render();
    }

    function subscribe(client) {
        try {
            channel = client
                .channel('realtime_medios_contacto')
                .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, () => fetchMedios())
                .subscribe();
        } catch (e) {
            console.warn('No se pudo suscribir a medios_contacto en tiempo real:', e);
        }
    }

    // Detecta cuando la página conecta/cambia el cliente de Supabase
    function syncClient() {
        const client = getClient();
        if (client === lastClient) return;
        if (channel && lastClient) {
            try { lastClient.removeChannel(channel); } catch (e) { /* ignore */ }
        }
        channel = null;
        lastClient = client;
        if (client) subscribe(client);
        fetchMedios();
    }

    // ---------- Panel inline ----------
    function setHint(text, isError = false) {
        if (!hint) return;
        hint.textContent = text;
        hint.classList.toggle('error', isError);
    }

    function openPanel() {
        panel.classList.remove('hidden');
        input.value = '';
        btnSave.disabled = false;
        setHint('Se guardará para todos los asesores.');
        setTimeout(() => input.focus(), 50);
    }

    function closePanel(restorePrevious = true) {
        panel.classList.add('hidden');
        input.value = '';
        if (restorePrevious && getValue() === ADD_VALUE) {
            setNativeValue(select.dataset.prev || defaultSelected || defaultMedios[0] || '');
        }
    }

    function selectMedio(name) {
        closePanel(false);
        ensureOption(name);
        setNativeValue(name);
        select.dataset.prev = name;
        // Notifica a la página por si escucha cambios del select
        select.dispatchEvent(new Event('change', { bubbles: true }));
        select.focus();
    }

    async function handleSave() {
        const cleanName = formatName(input.value);
        if (!cleanName) {
            setHint('Escribe el nombre del medio.', true);
            input.focus();
            return;
        }
        if (LEGACY_OTHER_VALUES.includes(normalizeKey(cleanName))) {
            setHint('Escribe el nombre real del medio (ej: Radio).', true);
            input.focus();
            return;
        }

        // Ya existe (ignorando mayúsculas/tildes): solo se selecciona
        const existing = findExisting(cleanName);
        if (existing) {
            selectMedio(existing);
            return;
        }

        btnSave.disabled = true;
        setHint('Guardando...');

        const client = getClient();
        if (client) {
            try {
                const operator = localStorage.getItem('canchapro_user_name') || 'Invitado';
                const { error } = await client.from(TABLE).insert([{ nombre: cleanName, creado_por: operator }]);
                // 23505 = otro asesor lo registró al mismo tiempo; se considera válido
                if (error && error.code !== '23505') throw error;
            } catch (err) {
                console.error('No se pudo guardar el medio en Supabase:', err);
                btnSave.disabled = false;
                setHint('⚠️ No se pudo guardar en la base de datos. Verifica que exista la tabla "medios_contacto".', true);
                return;
            }
        } else {
            saveLocal(cleanName);
        }

        // Cerrar el panel antes de refrescar para que render() no mantenga "Agregar" seleccionado
        closePanel(false);
        setNativeValue(select.dataset.prev || defaultMedios[0] || '');
        await fetchMedios();
        btnSave.disabled = false;
        selectMedio(findExisting(cleanName) || cleanName);

        if (typeof logSessionActivity === 'function') {
            try { logSessionActivity(`registró el nuevo medio de contacto: ${cleanName}`); } catch (e) { /* ignore */ }
        }
    }

    // ---------- Init ----------
    function init() {
        select = document.getElementById('bookingSource');
        panel = document.getElementById('customSourceGroup');
        input = document.getElementById('bookingSourceCustom');
        btnSave = document.getElementById('btnSaveMedio');
        btnCancel = document.getElementById('btnCancelMedio');
        hint = document.getElementById('addMedioHint');
        if (!select || !panel || !input || !btnSave || !btnCancel) return;

        // Medios base = opciones estáticas del HTML (sin "Otro")
        Array.from(select.options).forEach(o => {
            if (LEGACY_OTHER_VALUES.includes(o.value.trim().toLowerCase()) || o.value === ADD_VALUE || !o.value) return;
            defaultMedios.push(o.value);
            if (o.defaultSelected) defaultSelected = o.value;
        });
        if (!defaultSelected) defaultSelected = defaultMedios[0] || '';

        // Si la página asigna un valor que no está en la lista (reservas antiguas
        // o medios aún no cargados), se agrega la opción para no perder el dato.
        Object.defineProperty(select, 'value', {
            configurable: true,
            get() { return nativeValue.get.call(this); },
            set(v) {
                const val = v == null ? '' : String(v);
                if (val !== ADD_VALUE && isPanelOpen()) closePanel(false);
                ensureOption(val);
                nativeValue.set.call(this, val);
                if (val && val !== ADD_VALUE) this.dataset.prev = val;
            }
        });

        customMedios = loadLocal();
        render(defaultSelected);

        select.addEventListener('focus', () => {
            if (getValue() !== ADD_VALUE) select.dataset.prev = getValue();
        });
        select.addEventListener('change', () => {
            if (getValue() === ADD_VALUE) {
                openPanel();
            } else {
                select.dataset.prev = getValue();
                if (isPanelOpen()) closePanel(false);
            }
        });

        btnSave.addEventListener('click', handleSave);
        btnCancel.addEventListener('click', () => closePanel(true));
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault(); // No enviar el formulario de la reserva
                handleSave();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                closePanel(true);
            }
        });

        const form = select.closest('form');
        if (form) {
            // Bloquea el guardado de la reserva si el nuevo medio no se ha confirmado
            // (captura en document: corre antes que el handler de la página)
            document.addEventListener('submit', (e) => {
                if (e.target === form && getValue() === ADD_VALUE) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    setHint('⚠️ Guarda o cancela el nuevo medio antes de guardar la reserva.', true);
                    input.focus();
                }
            }, true);
            form.addEventListener('reset', () => setTimeout(() => closePanel(false), 0));
        }

        syncClient();
        setInterval(syncClient, 3000);
        window.addEventListener('focus', () => { if (!isPanelOpen()) fetchMedios(); });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.MediosContacto = { refresh: fetchMedios };
})();
