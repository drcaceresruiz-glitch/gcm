---
name: e2e-golden-path-verificado
description: "El flujo completo de GCM (crear obra -> presupuesto -> EDT -> linea base -> movimientos -> encargos/ordenes -> Last Planner) se verifico de punta a punta en navegador real el 21 de agosto de 2026 -- que cubre, que confirmo, y dos lecciones de metodo"
metadata: 
  node_type: memory
  type: project
  originSessionId: 4952c5a1-0464-46be-bb3b-af22c4881667
  modified: 2026-08-22T00:08:42.529Z
---

El 21 de agosto de 2026, con navegador real (Claude in Chrome) conectado a
la sesion, se recorrio el ciclo de vida completo de una obra en GCM —el
pedido original del usuario, "pruebes tu mismo, desde crear una obra,
usuarios, permisos todo, y verifiques que realmente todo funciona"—. Sirve
como mapa de referencia de la app entera y como punto de partida para la
proxima vez que haga falta re-verificar un flujo grande.

## Que se cubrio, en orden, con clics reales

1. **Crear obra** (`/obras/nueva`) — obra nueva "OBRA E2E - PRUEBA CLAUDE"
   (OB-000004), sandbox limpio en la BD de dev, junto a la ya existente
   "OBRA DE PRUEBAS (local)".
2. **Presupuesto meta**: plantilla generada con la funcion real
   (`generarPlantillaMeta`), con una partida (1.1) fechada 01-15/09/2026 y
   el resto sin fecha, subida por el formulario real.
3. **Generar contractual** desde el real (recargo por capitulo aplicado
   correctamente).
4. **Generar la EDT desde el presupuesto**: confirmo en vivo que la
   funcionalidad de fechas opcionales (construida la misma tarde, ver
   [[fechas-en-plantilla]] si existe) funciona de punta a punta — la
   partida 1.1 salio programada (`sinProgramar: false`, 01/09-15/09, 13
   dias laborables) y el resto con el relleno de siempre (21/08, 0 dias).
   La curva de avance se destapo sola por tener al menos una tarea
   programada.
5. **Revision del presupuesto** (gastos generales, utilidad) y
   **aprobar y congelar como linea base v1**.
6. **Iniciar ejecucion** (cambio de estado Planificacion -> En ejecucion).
7. **Movimiento presupuestal** (adicional): creado como borrador y
   aprobado; el presupuesto vigente se recalculo correctamente.
8. **Proveedor + encargo**: encargo real contra un proveedor existente de
   la empresa, con partida marcada y monto contratado.
9. **Orden de compra**: creada, repartida contra partida, aprobada. Al
   aprobarla disparo sola la alerta real de "partida comprometida por
   encima de su presupuesto" (encargo + orden sueltas sumaban mas que el
   presupuesto vigente de esa partida) — confirma que esa alerta funciona
   en produccion real, no solo en las pruebas.
10. **Parte del dia**: avance reportado para varias tareas.
11. **Last Planner completo**: nueva semana, compromisos con meta % por
    tarea, cierre de semana con correccion manual de un compromiso
    (ejecutado 3.75 de 12.5 m3), causa de incumplimiento ("Materiales") y
    **PPC calculado correcto: 4/5 cumplidos, 80%**.

Nada de esto fallo por un bug real de la aplicacion. Todo funciono como el
codigo dice que deberia funcionar.

## Dos lecciones de metodo, para no repetir la busqueda

- **Tras `prisma migrate dev` o `prisma generate` en medio de una sesion,
  el dev server YA CORRIENDO se queda con el Prisma Client viejo en
  memoria** y falla con `Unknown argument` en cualquier campo nuevo —
  parece un bug de la app y no lo es. Hay que matar el proceso (`netstat
  -ano | grep :3000` para el PID) y relanzar `npm run dev`. Bug real
  encontrado y resuelto asi durante esta auditoria.
- **El tool de automatizacion de navegador (`form_input`) no siempre
  registra checkboxes ni `<select>` de forma fiable** en componentes
  React controlados de este proyecto (paso con un checkbox de partida en
  encargos y, sospechosamente, con un radio de tipo de movimiento). Un
  `computer left_click` real es mas confiable para esos casos. Los inputs
  de texto con `form_input` si funcionaron bien siempre.

## Dos casos que parecian bug y no lo eran (para no re-investigarlos)

- **Plan Semanal, al cerrar la semana, precarga "ejecutado" con la
  cantidad COMPROMETIDA completa** (no con lo realmente reportado en
  Parte del dia). Es DELIBERADO y esta comentado en
  `src/lib/plan-semanal.ts` (`construirFilasCierre`): "se arranca de lo
  comprometido, que es la respuesta mas probable ('se hizo lo previsto')
  y se corrige encima". Quien cierra la semana tiene que corregirlo a
  mano si la realidad fue distinta -exactamente lo que se hizo en esta
  prueba, y el calculo de "% alcanzado" (interpolacion entre el avance
  anterior y la meta pactada) salio exacto.
- **"Crear revision" (presupuesto) parecia no hacer nada al primer clic**:
  no era el boton, era la latencia de compilacion de Next.js en dev la
  primera vez que se visita una ruta (Turbopack compila bajo demanda). Un
  segundo click, esperando un poco mas, funciono limpio.

## Donde queda el rastro

- Obra de prueba: "OBRA E2E - PRUEBA CLAUDE" (OB-000004), BD de desarrollo
  (`gcm_dev`), no tocar como si fuera real.
- El detalle completo de la primera pasada (permisos por rol via HTTP) y
  el hallazgo de ALMACENERO minimo-deliberado esta en `PENDIENTES.md`,
  punto 13.

**El sintoma exacto de no reiniciar el servidor tras `prisma generate`:** la
pantalla revienta con `Cannot read properties of undefined (reading 'count')`
—o cualquier metodo sobre un modelo nuevo—, porque el proceso lleva en memoria
un cliente de Prisma que no conoce ese modelo. Parece un fallo de codigo y no
lo es. Comprobarlo comparando la fecha del proceso (`Get-CimInstance
Win32_Process`) con la de `src/generated/prisma/`. Paso el 24 de agosto de
2026 y me llevo un rato de susto antes de mirar las dos fechas.
