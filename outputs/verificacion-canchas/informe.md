# Verificación de alquiler de canchas

Fecha: 30 de octubre de 2026.

## Correcciones

| Sede | Error reproducido | Resultado |
| --- | --- | --- |
| Las tres sedes | Las horas AM podían convertirse a PM o desaparecer al asignarlas desde el formulario. | Se conservan las horas de mañana, los bloqueos desde las 06:00 y el final a medianoche. |
| Las tres sedes | La consulta ofrecía reservar durante el cierre de 01:00 a 06:00. | La disponibilidad informa el cierre y aplica las restricciones del guardado. |
| Sport Victoria, Los Pinos | La reserva rápida de vóley abría el formulario con fútbol. | Conserva el deporte seleccionado. |
| Sport Victoria, Los Pinos | La tarifa de madrugada podía cambiar al comenzar otra fecha, dentro del mismo día operativo. | Usa el día operativo anterior antes de las 06:00. |
| Polideportivo | Las reservas antiguas por categoría no ocupaban las nuevas canchas numeradas correctamente. | Guardado, mapa y consulta utilizan una asignación común que respeta las reservas numeradas y las antiguas. |
| Polideportivo | Dos reservas consecutivas en la misma cancha aparecían como dos canchas ocupadas. | Se cuenta la cancha física y se permiten reservas contiguas. |
| Polideportivo | La ocupación mensual usaba tres canchas y 17 horas. | Utiliza las 11 canchas del catálogo y 19 horas de apertura. |
| Brisas | Los bloqueos globales se guardaban, pero desaparecían al cargarlos. | Se cargan, aparecen en el calendario y bloquean las cinco canchas. |
| Brisas | La opción de bloqueo global se duplicaba y quedaba al volver a una reserva normal. | Existe una sola opción y se retira al desactivar el bloqueo. |
| Brisas | Existían dos funciones de lectura con almacenes locales distintos. | Se conservan los registros de ambas versiones y las eliminaciones no reaparecen. |
| Brisas | Los reportes todavía clasificaban canchas con nombres antiguos. | Clasifican las canchas actuales de fútbol y vóley y desglosan las cinco canchas en Excel. |
| Brisas | La promoción se aplicaba desde las 06:00, a diferencia del tarifario. | Se aplica de 15:00 a 18:00, según la confirmación del usuario, con cálculo proporcional al cruzar las franjas. |
| Brisas | El editor de tarifas compartía la configuración de Los Pinos y sus valores no alimentaban el cálculo de Brisas. | Utiliza configuración propia de Brisas y sus canchas actuales. |

Los HTML cargan una nueva versión de sus scripts para que el navegador reciba las correcciones.

## Validación

Resultado final: 162 pruebas aprobadas, sin fallos.

Preferencia de operación actualizada: las tres sedes abren con AM desactivado y con horario predeterminado de 14:00 a 15:00, tanto en la consulta de disponibilidad como en las reservas nuevas. La hora de entrada de la vendedora ya no selecciona automáticamente una reserva por la mañana.

- Pruebas de regresión de horarios, límites de franjas, bloqueos, disponibilidad, reservas antiguas y reportes.
- Pruebas de integración de los scripts completos: creación, edición y eliminación local; aislamiento de reservas entre sedes; consulta de nube simulada; representación de medianoche en el calendario.
- Revisión de sintaxis JavaScript y de errores de formato del diff.
- Comprobación en navegador local de horarios cerrados, final a medianoche y tarifas de Brisas antes y durante la promoción.

Comandos:

```powershell
node --test tests/*.test.cjs
node --check app.js
node --check polideportivo.js
node --check brisas.js
git diff --check
```

Las consultas de Supabase se simularon en las pruebas; la base de datos real no fue validada por esta ejecución.

## Hallazgo pendiente: el precio manual no se conserva

Se confirmó en las tres sedes: una reserva con precio manual de S/17 muestra ese importe en el formulario, pero el objeto que se guarda no contiene ningún monto. Al abrirla o consultar reportes, el sistema vuelve a calcular la tarifa; en el caso de prueba fue S/25 en Los Pinos y Brisas, y S/30 en Polideportivo.

Esto afecta los ingresos de los reportes y Excel. En pagos divididos, los importes guardados pueden no coincidir con el total recalculado. Cambiar las tarifas también puede alterar los ingresos históricos calculados.

El esquema de `reservas` incluido en el proyecto no tiene un campo para el monto. La reparación requiere agregar un campo numérico para el total acordado, guardarlo en altas y ediciones, y hacer que reapertura y reportes lo utilicen. Los registros antiguos sin monto necesitan conservar el cálculo como respaldo. Esta migración y su integración no forman parte de las correcciones realizadas.
