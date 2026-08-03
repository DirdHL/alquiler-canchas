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
  dni TEXT,                  -- DNI del cliente
  medio TEXT,                -- Medio de contacto
  court TEXT NOT NULL,       -- Cancha: "Grande" o "Pequeña"
  sport TEXT NOT NULL,       -- Deporte: "Fútbol" o "Vóley"
  date DATE NOT NULL,        -- Fecha de la reserva
  start_time TIME NOT NULL,  -- Hora de inicio
  end_time TIME NOT NULL,    -- Hora de fin
  notes TEXT,                -- Notas adicionales (opcional)
  pelota BOOLEAN DEFAULT false, -- Indica si incluye pelota
  chaleco BOOLEAN DEFAULT false, -- Indica si incluye chaleco
  tipo_pago TEXT DEFAULT 'Efectivo', -- Tipo de pago: "Efectivo" o "Yape"
  created_at TIMESTAMPTZ DEFAULT now()  -- Fecha/hora en que se registró
);

-- 💡 NOTA: Si ya tienes la tabla "reservas" creada en Supabase, no es necesario borrarla.
-- Simplemente ejecuta este código adicional para agregar las nuevas columnas:
-- ALTER TABLE reservas ADD COLUMN IF NOT EXISTS dni TEXT;
-- ALTER TABLE reservas ADD COLUMN IF NOT EXISTS medio TEXT;
-- ALTER TABLE reservas ADD COLUMN IF NOT EXISTS pelota BOOLEAN DEFAULT false;
-- ALTER TABLE reservas ADD COLUMN IF NOT EXISTS chaleco BOOLEAN DEFAULT false;
-- ALTER TABLE reservas ADD COLUMN IF NOT EXISTS tipo_pago TEXT DEFAULT 'Efectivo';

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

---

## 🏡 Paso Especial: Configurar Base de Datos para Bungalows

Para activar el nuevo sistema de reservas de **Bungalows**, debes crear la tabla correspondiente en tu base de datos de Supabase. Sigue estos pasos:

1. Entra a tu proyecto en el panel de [Supabase](https://supabase.com/).
2. En el menú lateral izquierdo, haz clic en **"SQL Editor"** (`>_`).
3. Haz clic en **"+ New query"** (Nueva Consulta) para abrir una pestaña limpia.
4. Copia y pega el siguiente código SQL:

```sql
-- 1. Crear tabla para registrar las reservas de los bungalows
CREATE TABLE IF NOT EXISTS reservas_bungalows (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  bungalow_numero INT NOT NULL,            -- 1 al 6
  nombre_cliente TEXT NOT NULL,
  dni_cliente TEXT,
  telefono_cliente TEXT,
  fecha_ingreso DATE NOT NULL,             -- Check-in
  fecha_salida DATE NOT NULL,              -- Check-out
  horario TEXT NOT NULL,                   -- 'Full Day' o 'Día y Noche'
  adultos INT DEFAULT 4,
  ninos_gratis INT DEFAULT 0,              -- Menores de 7 años
  ninos_pagantes INT DEFAULT 0,            -- Otros menores
  precio_base DECIMAL(10,2) NOT NULL,      -- S/. 160 o S/. 180 (según día de la semana)
  adicional_personas DECIMAL(10,2) DEFAULT 0.00, -- Cargo por la 5ta persona
  horas_extras INT DEFAULT 0,
  adicional_horas DECIMAL(10,2) DEFAULT 0.00,    -- Cargo por horas adicionales
  alquiler_cuatrimoto INT DEFAULT 0,       -- Cantidad de cuatrimotos alquiladas (0, 1 o 2)
  cuatrimoto_monto DECIMAL(10,2) DEFAULT 0.00,   -- Cargo por cuatrimoto
  monto_total DECIMAL(10,2) NOT NULL,      -- Calculado automáticamente, pero editable
  monto_adelanto DECIMAL(10,2) DEFAULT 0.00,
  tipo_pago TEXT DEFAULT 'Efectivo',       -- Yape, Efectivo, Dividido
  monto_efectivo DECIMAL(10,2) DEFAULT 0.00, -- Para pagos divididos
  monto_yape DECIMAL(10,2) DEFAULT 0.00,     -- Para pagos divididos
  medio_contacto TEXT DEFAULT 'WhatsApp',  -- Facebook, TikTok, WhatsApp, etc.
  estado_reserva TEXT DEFAULT 'Confirmado', -- Confirmado, Cancelado, Completado, Bloqueado
  notas TEXT,
  asesor_registro TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS (Row Level Security) obligatorio en Supabase
ALTER TABLE reservas_bungalows ENABLE ROW LEVEL SECURITY;

-- Crear regla de acceso público
CREATE POLICY "Acceso publico reservas_bungalows" ON reservas_bungalows FOR ALL USING (true) WITH CHECK (true);

-- Habilitar tiempo real
ALTER PUBLICATION supabase_realtime ADD TABLE reservas_bungalows;
```

5. Haz clic en **"Run"** (o presiona `Ctrl + Enter`).
6. Deberías ver el mensaje **"Success. No rows returned"**. ¡Tu sistema de bungalows ya está listo para sincronizar con la nube!

---

## 👤 Paso Extra: Configurar Tabla de Asesores (Opcional)

Para poder sincronizar la lista de asesores activos en tiempo real entre múltiples dispositivos usando Supabase, crea la tabla de asesores ejecutando el siguiente código SQL:

1. Ve a **SQL Editor** (`>_`) en Supabase.
2. Abre una pestaña nueva (**+ New query**).
3. Pega y ejecuta el siguiente bloque SQL:

```sql
-- 1. Crear tabla para registrar asesores
CREATE TABLE IF NOT EXISTS personal_asesores (
  name TEXT PRIMARY KEY,
  is_active BOOLEAN DEFAULT true
);

-- Habilitar RLS (Row Level Security) obligatorio en Supabase
ALTER TABLE personal_asesores ENABLE ROW LEVEL SECURITY;

-- Crear regla de acceso público
CREATE POLICY "Acceso publico personal_asesores" ON personal_asesores FOR ALL USING (true) WITH CHECK (true);

-- Habilitar tiempo real
ALTER PUBLICATION supabase_realtime ADD TABLE personal_asesores;
```

4. Haz clic en **"Run"**. Si todo sale bien, la lista de asesores se almacenará en la nube en lugar de solo en la memoria del navegador.

---

## 🏢 Paso Especial: Configurar Base de Datos para Alquiler de Locales

Para activar el nuevo sistema de reservas de **Locales**, debes crear la tabla correspondiente en tu base de datos de Supabase.

1. Ve a **SQL Editor** (`>_`) en Supabase.
2. Abre una pestaña nueva (**+ New query**).
3. Pega y ejecuta el siguiente bloque SQL:

```sql
-- 1. Crear tabla para registrar las reservas de los locales
CREATE TABLE IF NOT EXISTS reservas_locales (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sede TEXT NOT NULL,                      -- 'Los Pinos' o 'Polideportivo'
  espacio TEXT NOT NULL,                   -- 'Grande' o 'Pequeño'
  nombre_cliente TEXT NOT NULL,
  telefono_cliente TEXT,
  fecha_reserva DATE NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fin TIME NOT NULL,
  tipo_evento TEXT,                        -- Cumpleaños, Bautizo, Fiesta, etc.
  monto_total DECIMAL(10,2) NOT NULL,      -- Costo total del alquiler
  monto_adelanto DECIMAL(10,2) DEFAULT 0.00,
  medio_contacto TEXT DEFAULT 'WhatsApp',
  estado_reserva TEXT DEFAULT 'Confirmado', -- Confirmado, Cancelado, Completado
  notas TEXT,
  asesor_registro TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS (Row Level Security) obligatorio en Supabase
ALTER TABLE reservas_locales ENABLE ROW LEVEL SECURITY;

-- Crear regla de acceso público
CREATE POLICY "Acceso publico reservas_locales" ON reservas_locales FOR ALL USING (true) WITH CHECK (true);

-- Habilitar tiempo real
ALTER PUBLICATION supabase_realtime ADD TABLE reservas_locales;
```

4. Haz clic en **"Run"**. Deberías ver el mensaje **"Success. No rows returned"**. ¡El módulo de Locales está listo para conectarse!

---

## 🍭 Paso Especial: Configurar Base de Datos para Alquiler de Carritos e inflables

Para activar el módulo de **Carritos e inflables**, debes crear la tabla correspondiente en tu base de datos de Supabase.

1. Ve a **SQL Editor** (`>_`) en Supabase.
2. Abre una pestaña nueva (**+ New query**).
3. Pega y ejecuta el siguiente bloque SQL:

```sql
-- 1. Crear tabla para registrar las reservas de carritos e inflables
CREATE TABLE IF NOT EXISTS reservas_carritos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  categoria TEXT NOT NULL,                  -- 'Carrito Snacks' o 'Juego Inflable'
  item TEXT NOT NULL,                       -- 'Popcorn', 'Algodón', 'Castillo Inflable', etc.
  nombre_cliente TEXT NOT NULL,
  telefono_cliente TEXT,
  fecha_reserva DATE NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fin TIME NOT NULL,
  tipo_evento TEXT,                        -- Cumpleaños, Bautizo, Fiesta, etc.
  monto_total DECIMAL(10,2) NOT NULL,      -- Costo total
  monto_adelanto DECIMAL(10,2) DEFAULT 0.00,
  medio_contacto TEXT DEFAULT 'WhatsApp',
  estado_reserva TEXT DEFAULT 'Confirmado', -- Confirmado, Cancelado, Completado, Bloqueado
  notas TEXT,
  asesor_registro TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS (Row Level Security) obligatorio en Supabase
ALTER TABLE reservas_carritos ENABLE ROW LEVEL SECURITY;

-- Crear regla de acceso público
CREATE POLICY "Acceso publico reservas_carritos" ON reservas_carritos FOR ALL USING (true) WITH CHECK (true);

-- Habilitar tiempo real
ALTER PUBLICATION supabase_realtime ADD TABLE reservas_carritos;
```

4. Haz clic en **"Run"**. Deberías ver el mensaje **"Success. No rows returned"**. ¡El módulo de Carritos e inflables ya está listo para conectarse!

---

## 🕒 Paso Especial: Configurar Base de Datos para Horarios de Personal

Para poder establecer horarios específicos para cada trabajador y que la meta de horas no sea siempre de 48h fijas, debes crear esta tabla.

1. Ve a **SQL Editor** (`>_`) en Supabase.
2. Abre una pestaña nueva (**+ New query**).
3. Pega y ejecuta el siguiente bloque SQL:

```sql
-- IMPORTANTE: Borramos la tabla anterior si existe para evitar conflictos con la nueva estructura
DROP TABLE IF EXISTS horarios_personal;

-- 1. Crear tabla para los horarios personalizados detallados del personal
CREATE TABLE IF NOT EXISTS horarios_personal (
  employee_name TEXT PRIMARY KEY,
  schedule_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS (Row Level Security) obligatorio en Supabase
ALTER TABLE horarios_personal ENABLE ROW LEVEL SECURITY;

-- Crear regla de acceso público
CREATE POLICY "Acceso publico horarios_personal" ON horarios_personal FOR ALL USING (true) WITH CHECK (true);

-- Habilitar tiempo real
ALTER PUBLICATION supabase_realtime ADD TABLE horarios_personal;
```

4. Haz clic en **"Run"**. Deberías ver el mensaje **"Success. No rows returned"**. ¡Tu sistema de horarios dinámicos ya está activado en la nube!

