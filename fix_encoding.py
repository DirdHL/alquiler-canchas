import sys

with open('carritos.js', 'r', encoding='utf-8') as f:
    text = f.read()

fixes = {
    'Ã¡': 'á', 'Ã©': 'é', 'Ã­': 'í', 'Ã³': 'ó', 'Ãº': 'ú',
    'Ã±': 'ñ', 'Ã‘': 'Ñ', 'Â¿': '¿', 'Ã ': 'Í',
    'Ã ': 'Á', 'Ã‰': 'É', 'Ã“': 'Ó', 'Ãš': 'Ú',
    'â Œ': '❌', 'âœ…1': '✅', 'âš': '⚠',
    'Ã\xad': 'í', 'ESTADÃ STICAS': 'ESTADÍSTICAS' 
}

for bad, good in fixes.items():
    text = text.replace(bad, good)

with open('carritos.js', 'w', encoding='utf-8') as f:
    f.write(text)

print("Done")
