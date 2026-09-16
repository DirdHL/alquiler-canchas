import codecs

js_file = 'C:/Users/Usuario/Desktop/alquiler-canchas/brisas.js'
with codecs.open(js_file, 'r', 'utf-8') as f:
    js = f.read()

new_logic = '''            if (!bookingIdInput.value) {
                const isVoley = String(bookingCourtInput.value || '').includes('Vóley');
                if (isVoley) {
                    setToggleValue('pelota', true);
                    setToggleValue('chaleco', false);
                } else {
                    const dateVal = bookingDateInput.value;
                    let isWeekend = false;
                    if (dateVal) {
                        const dateObj = new Date(dateVal + 'T12:00:00');
                        const day = dateObj.getDay();
                        isWeekend = (day === 0 || day === 5 || day === 6);
                    }
                    if (isWeekend) {
                        setToggleValue('pelota', true);
                        setToggleValue('chaleco', true);
                    } else {
                        setToggleValue('pelota', false);
                        setToggleValue('chaleco', false);
                    }
                }
            }'''

old_logic = '''            if (!bookingIdInput.value) {
                if (isVoley) {
                    setToggleValue('pelota', true);
                } else {
                    setToggleValue('pelota', false);
                }
            }'''

js = js.replace(old_logic, new_logic)

date_logic = '''    if (bookingDateInput) {
        bookingDateInput.addEventListener('change', updateModalCalculatedTotal);
    }'''
    
date_new = '''    if (bookingDateInput) {
        bookingDateInput.addEventListener('change', function() {
            updateModalCalculatedTotal();
            if (bookingCourtInput) bookingCourtInput.dispatchEvent(new Event('change'));
        });
    }'''

js = js.replace(date_logic, date_new)

with codecs.open(js_file, 'w', 'utf-8') as f:
    f.write(js)
print("Updated defaults for weekend futbol!")
