import codecs
import re

html_file = 'C:/Users/Usuario/Desktop/alquiler-canchas/brisas.html'
js_file = 'C:/Users/Usuario/Desktop/alquiler-canchas/brisas.js'

with codecs.open(html_file, 'r', 'utf-8') as f:
    html = f.read()

# 1. Quitar el campo "Deporte" del Checker en vivo
checker_field_regex = r'<div class="checker-field">\s*<label for="checkCourtSport">.*?</label>\s*<select id="checkCourtSport".*?>\s*<option value="Todos".*?>.*?</option>\s*</select>\s*</div>'
html = re.sub(checker_field_regex, '', html, flags=re.DOTALL)

# 2. Hacer que groupSport sea !important invisible (o quitar el display: '')
group_sport_regex = r'<div class="form-group" id="groupSport" style="display: none;">'
html = html.replace('<div class="form-group" id="groupSport" style="display: none;">', '<div class="form-group" id="groupSport" style="display: none !important;">')

with codecs.open(html_file, 'w', 'utf-8') as f:
    f.write(html)

with codecs.open(js_file, 'r', 'utf-8') as f:
    js = f.read()

# 3. Quitar el display = '' en brisas.js
js = js.replace("if (groupSport) groupSport.style.display = '';", "// if (groupSport) groupSport.style.display = '';")

with codecs.open(js_file, 'w', 'utf-8') as f:
    f.write(js)
print("Removed redundant sport fields!")
