import glob
import codecs
import re

files = glob.glob('C:/Users/Usuario/Desktop/alquiler-canchas/*.html')

new_link = '''
                <a href="brisas.html" class="btn btn-secondary btn-sm btn-sidebar-action btn-brisas"
                    style="text-decoration: none; display: flex; align-items: center; gap: 8px; margin-top: 8px;">
                    <i data-lucide="map" style="width: 16px; height: 16px;"></i> Sport Victoria (Las Brisas)
                </a>
            </nav>'''

for file in files:
    if 'brisas.html' in file:
        continue
    
    with codecs.open(file, 'r', 'utf-8') as f:
        content = f.read()
    
    if 'Otras Sedes' in content and 'brisas.html' not in content:
        # Reemplazar la etiqueta de cierre </nav> (o similar) por la nueva opcion
        content = re.sub(r'</nav>', new_link, content, count=1)
        
        with codecs.open(file, 'w', 'utf-8') as f:
            f.write(content)
        print(f"Updated {file}")
