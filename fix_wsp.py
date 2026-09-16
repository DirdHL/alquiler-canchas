import codecs

js_file = 'C:/Users/Usuario/Desktop/alquiler-canchas/brisas.js'

with codecs.open(js_file, 'r', 'utf-8') as f:
    js = f.read()

# Fix WhatsApp logic 1
js = js.replace("const courtText = (courtRaw === 'Brisas Pequeña' || courtRaw === 'Chica') ? 'Chica' : 'Brisas Grande';", "const courtText = courtRaw;")
js = js.replace("const courtText = (courtRaw === 'Brisas Pequeña' || courtRaw === 'Chica') ? 'Chica' : 'Brisas Grande';", "const courtText = courtRaw;") # There might be un-encoded utf-8 chars, let's use regex

import re
js = re.sub(r"const courtText = \(courtRaw === 'Brisas Peque[^']*' \|\| courtRaw === 'Chica'\) \? 'Chica' : 'Brisas Grande';", "const courtText = courtRaw;", js)

# Fix WhatsApp template text
js = js.replace("Cancha (Chica o Grande): ", "Cancha: ")

with codecs.open(js_file, 'w', 'utf-8') as f:
    f.write(js)
print("WhatsApp copy fixed!")
