import sys
js_file = r'c:\Users\Usuario\Desktop\alquiler-canchas\bungalows.js'

with open(js_file, 'r', encoding='utf-8') as f:
    js = f.read()

validation_booking = """    // Obtener todos los bungalows seleccionados
    const selectedBungalows = Array.from(document.querySelectorAll('input[name="bungalowSelect"]:checked')).map(c => parseInt(c.value));
    if (selectedBungalows.length === 0) {
        errorEl.textContent = '⚠️ Por favor, seleccione al menos un Bungalow.';
        errorEl.style.display = 'block';
        return;
    }

    if (horario === '9am a 12pm') {
        const d = new Date(checkIn + 'T00:00:00');
        const dow = d.getDay();
        if (dow === 0 || dow === 5 || dow === 6) {
            errorEl.textContent = '⚠️ El turno de 9:00 AM a 12:00 PM del día siguiente solo está disponible para ingresos de Lunes a Jueves.';
            errorEl.style.display = 'block';
            return;
        }
    }"""

js = js.replace(
    """    // Obtener todos los bungalows seleccionados
    const selectedBungalows = Array.from(document.querySelectorAll('input[name="bungalowSelect"]:checked')).map(c => parseInt(c.value));
    if (selectedBungalows.length === 0) {
        errorEl.textContent = '⚠️ Por favor, seleccione al menos un Bungalow.';
        errorEl.style.display = 'block';
        return;
    }""",
    validation_booking
)

validation_checker = """    if (!inStr || !outStr) {
        resultsEl.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 10px;">Seleccione una fecha válida</div>';
        return;
    }

    if (horario === '9am a 12pm') {
        const d = new Date(inStr + 'T00:00:00');
        const dow = d.getDay();
        if (dow === 0 || dow === 5 || dow === 6) {
            resultsEl.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #ef4444; padding: 10px; font-weight: bold;">⚠️ El turno de 9am a 12pm sgte solo está disponible para ingresos de Lunes a Jueves.</div>';
            return;
        }
    }"""

js = js.replace(
    """    if (!inStr || !outStr) {
        resultsEl.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 10px;">Seleccione una fecha válida</div>';
        return;
    }""",
    validation_checker
)

calc_base = """    } else if (horario === '9am a 12pm') {
        const dayOfWeek = start.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6) {
            return 0; // Not allowed on weekends
        }
        return 250;"""

js = js.replace(
    """    } else if (horario === '9am a 12pm') {
        return 250;""",
    calc_base
)

with open(js_file, 'w', encoding='utf-8') as f:
    f.write(js)

print('Done!')
