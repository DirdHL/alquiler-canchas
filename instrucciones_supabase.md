# Guía Paso a Paso: Configurar Supabase para Sport Victoria

Esta guía te enseñará cómo crear tu base de datos gratuita en la nube con **Supabase** para que tus compañeras y tú puedan compartir y gestionar las reservas en tiempo real.

---

## Paso 1: Crear una Cuenta y un Proyecto en Supabase

1. Entra a [https://supabase.com/](https://supabase.com/) y haz clic en **"Start your project"** o **"Sign In"**.
2. Regístrate usando tu cuenta de GitHub o tu correo electrónico (es completamente gratuito).
3. Una vez en el panel (Dashboard), haz clic en el botón **"New Project"** (Nuevo Proyecto).
4. Configura los datos de tu nuevo proyecto:
   - **Organization**: Selecciona tu organización por defecto.
   - **Name**: Escribe `CanchaPro`.
   - **Database Password**: Escribe una contraseña segura (guárdala bien, aunque no la necesitaremos escribir en el código).
   - **Region**: Elige una región cercana (por ejemplo, `South America (São Paulo)` o `East US`).
   - **Pricing Plan**: Asegúrate de seleccionar el plan **Free** (Gratuito).
5. Haz clic en **"Create new project"**. Espera unos 2 minutos a que el servidor termine de configurarse.

---

## Paso 2: Crear la Tabla de Reservas en la Base de Datos

Una vez que tu proyecto se haya creado, debes estructurar la base de datos para almacenar la información de los alquileres:

1. En el menú lateral izquierdo de tu proyecto de Supabase, busca y haz clic en el ícono de la consola **"SQL Editor"** (se ve como un ícono de terminal con el símbolo `>_`).
2. Haz clic en el botón **"+ New query"** (Nueva Consulta) para abrir una hoja en blanco.
3. Copia **todo** el siguiente código SQL (son 4 partes, cada una hace una cosa diferente):

```sql
-- ✅ PARTE 1: Crear la tabla donde se guardarán las reservas
-- (Si ya existe, no la borra ni da error, simplemente la deja como está)
CREATE TABLE IF NOT EXISTS reservas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,  -- Número único por reserva
  name TEXT NOT NULL,        -- Nombre del cliente
  court TEXT NOT NULL,       -- Cancha: "Grande" o "Pequeña"
  sport TEXT NOT NULL,       -- Deporte: "Fútbol" o "Vóley"
  date DATE NOT NULL,        -- Fecha de la reserva
  start_time TIME NOT NULL,  -- Hora de inicio
  end_time TIME NOT NULL,    -- Hora de fin
  notes TEXT,                -- Notas adicionales (opcional)
  created_at TIMESTAMPTZ DEFAULT now()  -- Fecha/hora en que se registró
);

-- ✅ PARTE 2: Activar la "seguridad por filas" (Row Level Security)
-- Esto es obligatorio en el nuevo Supabase para que la página web
-- pueda leer y escribir datos. Sin esta línea, todo queda bloqueado.
ALTER TABLE reservas ENABLE ROW LEVEL SECURITY;

-- ✅ PARTE 3: Crear una regla de acceso público
-- Le dice a Supabase: "permite que cualquiera con la clave pública
-- pueda ver, agregar, editar y eliminar reservas".
-- Es seguro porque la clave pública (anon key) solo da acceso
-- a esta tabla, no a nada más de tu cuenta.
CREATE POLICY "Acceso publico" ON reservas FOR ALL USING (true) WITH CHECK (true);

-- ✅ PARTE 4: Activar actualizaciones en tiempo real
-- Esto hace que cuando una compañera registre una reserva,
-- aparezca automáticamente en tu pantalla sin recargar la página.
ALTER PUBLICATION supabase_realtime ADD TABLE reservas;
```

4. Pégalo en el editor SQL en Supabase y haz clic en el botón verde **"Run"** (o presiona `Ctrl + Enter`).
5. Abajo del editor deberías ver el mensaje **"Success. No rows returned"**, lo que significa que la tabla se creó correctamente.

---

## Paso 3: Obtener las Credenciales de Conexión (URL y API Key)

> ⚠️ **Nota importante:** Supabase actualizó su sistema de API Keys. Ahora muestra "Publishable key" y "Secret key". **NO uses ninguna de esas dos.** Debes usar la clave antigua (`eyJ...`) que se llama **"Legacy anon key"**.

Necesitas dos datos: la **clave anon** y la **URL del proyecto**. Están en lugares diferentes:

### 🔑 Dato 1: La clave anon (API Key)

1. En el menú lateral izquierdo, haz clic en **"Settings"** (engranaje ⚙️).
2. Haz clic en **"API Keys"**.
3. En la parte superior verás dos pestañas — haz clic en **`Legacy anon, service_role API keys`**.
4. Verás una fila que dice **`anon | public`** con una clave larga (`eyJhbGci...`).
5. Haz clic en el botón **"Copy"** que está a la derecha. ✅
6. ❌ **NO copies** la fila de abajo que dice `service_role | secret`.

### 🌐 Dato 2: La URL del proyecto

La URL **NO está** en la página de API Keys. Hay dos formas de obtenerla:

**Opción A (más fácil):** Mira la barra de direcciones de tu navegador mientras estás en Supabase. Verás algo como:
```
supabase.com/dashboard/project/XXXXXXXXXXXXXXXX/settings/...
```
Ese código entre `project/` y `/settings` es el ID de tu proyecto. Tu URL es:
```
https://XXXXXXXXXXXXXXXX.supabase.co
```
(Reemplaza `XXXXXXXXXXXXXXXX` con el código que ves en tu barra de direcciones)

**Opción B:** En el menú lateral, ve a **Settings → API** (no "API Keys", sino solo "API"). Ahí verás la **Project URL** directamente.

---

## Paso 4: Conectar CanchaPro con la Nube

1. Abre el archivo `index.html` de CanchaPro en tu navegador.
2. En la barra lateral izquierda, verás un botón que dice **"Configurar Base de Datos"**. Haz clic en él.
3. Se abrirá una ventana donde debes pegar:
   - **Supabase Project URL** (el que empieza con `https://`)
   - **Supabase Publishable Key** → pega la **Legacy anon key** (`eyJ...`) que copiaste en el Paso 3
4. Haz clic en **"Probar Conexión"**. Si todo está bien, verás un mensaje verde de éxito.
5. Haz clic en **"Guardar Credenciales"**.

¡Listo! El indicador de la esquina superior izquierda cambiará a un círculo verde con el texto **"Conectado a la Nube (Supabase)"**.
 
---

## Paso 5: ¿Cómo lo manejan tus compañeras?

1. **Comparte el proyecto**: Solo necesitas enviarles la carpeta del proyecto (`alquiler-canchas`) que contiene los archivos `index.html`, `style.css` y `app.js`. Puedes comprimirla en un archivo ZIP y enviársela por WhatsApp, correo, o subirla a GitHub Pages.
2. **Ingresar credenciales**: Tus compañeras solo deben abrir el archivo `index.html` en su computadora, hacer clic en **"Configurar Base de Datos"** y pegar la **misma URL** y **Legacy Anon Key** (`eyJ...`) que obtuviste en el Paso 3.
3. ¡Todo se sincronizará automáticamente! Si una de ellas registra una reserva, la verás aparecer en tu pantalla al instante en tiempo real sin necesidad de recargar la página.
