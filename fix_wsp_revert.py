import codecs

js_file = 'C:/Users/Usuario/Desktop/alquiler-canchas/brisas.js'

with codecs.open(js_file, 'r', 'utf-8') as f:
    js = f.read()

# 1. Revert logic to just courtRaw
logic_old = '''        let courtText = courtRaw;
        if (courtRaw.includes('Cancha 1') || courtRaw.includes('Cancha 2')) courtText = 'Chica';
        else if (courtRaw.includes('Cancha 3')) courtText = 'Grande';'''
js = js.replace(logic_old, "        const courtText = courtRaw;")

logic_old_2 = '''    let courtText = courtRaw;
    if (courtRaw.includes('Cancha 1') || courtRaw.includes('Cancha 2')) courtText = 'Chica';
    else if (courtRaw.includes('Cancha 3')) courtText = 'Grande';'''
js = js.replace(logic_old_2, "    const courtText = courtRaw;")

# 2. Revert template text
js = js.replace("Cancha (Chica o Grande): ", "Cancha: ")

with codecs.open(js_file, 'w', 'utf-8') as f:
    f.write(js)
print("Reverted to Cancha: courtName")
