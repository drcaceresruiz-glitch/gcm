# Manual de GCM

Cómo se usa el sistema, en lenguaje de obra. No hace falta saber de informática.

Si eres desarrollador y buscas el estado técnico del proyecto, ese documento es
`docs/ESTADO.md`. Lo que falta por hacer está en `docs/PENDIENTES.md`.

Última actualización: 10 de agosto de 2026 (tarde).

---

## El ciclo completo, en una frase

```
Cronograma  →  Lookahead  →  Plan Semanal  →  PPC y causas
(largo plazo)  (3-6 semanas)   (esta semana)    (aprendizaje)
     ↑                                                │
     └────────── lo aprendido afina la próxima ────────┘
```

**Project dice cuándo. El presupuesto dice cuánto. GCM dice qué se puede hacer
de verdad, qué se prometió y qué se cumplió.**

---

## El panel: los once indicadores

Lo primero que ves al entrar. Eliges una obra arriba y debajo salen sus
indicadores. Con **Configurar** enciendes y apagas los que quieras; el orden no
cambia nunca, para que cada cosa esté siempre en el mismo sitio.

| Indicador | Contesta a… |
|---|---|
| Avance físico | ¿Voy por delante o por detrás del plan? |
| Curva de avance | ¿Cómo he llegado hasta aquí y dónde acabo a este paso? |
| Plazo | ¿Cuántos días quedan, y cuántos de esos se trabaja? |
| Presupuesto | ¿Cuánto queda por comprometer? |
| **PPC** | ¿Se cumple lo que prometemos cada semana? |
| **Lookahead** | ¿Cuánto del trabajo que viene está liberado? |
| **Causa que más frena** | ¿Cuál es el cuello de botella que se repite? |
| Partidas atrasadas | ¿Cuál urge? |
| Cadena crítica | ¿Qué mueve la fecha de fin? |
| Capítulos | ¿Cuáles se desvían más? |
| Órdenes de compra | ¿Cuántas hay y en qué estado? |

Los tres en negrita son de Last Planner, y son los que avisan **antes**. Los
otros cuentan lo que ya pasó.

**La pareja que hay que leer junta es PPC y Lookahead.** El Lookahead dice
cuánto del trabajo que viene está liberado; el PPC, cuánto de lo prometido se
cumplió. Un Lookahead bajo hoy es un PPC bajo dentro de dos semanas, porque lo
que se compromete sin liberar es exactamente lo que se incumple.

Y se puede ir **al día en la curva con un PPC del 50 %**: significa que el ritmo
está tapando una planificación que no se cumple. Se paga más adelante, cuando
ya no queda holgura.

> Los avisos de arriba **no** se filtran por la obra elegida: son de toda la
> empresa. El problema que hay que ver es justo el de la obra que no estás
> mirando.

**Enciendes solo lo que quieres ver.** El panel trae únicamente los datos de
los módulos que tienes encendidos, así que apagar los que no miras hace que
cargue más rápido. Apagar un módulo es inmediato. Encender uno que estaba
apagado tarda un instante más la primera vez —tiene que ir a buscar sus datos—
y luego ya queda.

---

## Moverse por el sistema

**Dentro de una obra, las secciones van en dos filas.** Arriba, tres grupos;
debajo, las secciones del grupo que estés mirando:

| Grupo | Secciones |
|---|---|
| **Plan** | Presupuesto · Cronograma · Revisiones |
| **Ejecución** | Lookahead · Plan Semanal · Movimientos |
| **Compras** | Proveedores · Órdenes |

Elegir un grupo **no te saca de donde estás**: despliega sus secciones para que
las veas, y la pantalla no cambia hasta que pulsas una. Un puntito marca el
grupo donde está la sección que tienes abierta, para no perderte al curiosear.
Saltar de un grupo a otro cuesta un clic de más; dentro del ciclo diario
—Lookahead y Plan Semanal, que son el mismo grupo— sigues yendo de un clic.

**Arriba a la derecha, el menú de la empresa** reúne lo que se toca de vez en
cuando, en tres grupos: *Compras* (proveedores, formas de pago), *Personas*
(usuarios, permisos, solicitudes) y *Empresa* (datos). Si operas GCM para
varias constructoras, **Constructoras** es un botón aparte —dar de alta otra
empresa no es cosa de la tuya—.

**El logotipo GCM, arriba a la izquierda, te lleva siempre al panel.**

---

## 1. Cronograma

**Qué es.** El plan de fechas que sale de MS Project.

**Por qué importa.** Aquí hay un reparto que conviene entender: **Project manda
sobre el plan** (qué tareas hay, cuándo y en qué orden) y **GCM manda sobre el
avance real** (cuánto se hizo, quién lo reportó y cuándo). GCM no recalcula tu
ruta crítica contractual: la muestra.

Cada tarea se reconoce por su **UID**, un número interno del archivo que no
cambia aunque reimportes o se renumeren las filas. Por eso el avance no se
pierde entre versiones.

**Qué hago aquí.**

1. Sube el archivo cuando el plan cambie (acepta `.mpp` y `.xml`).
2. Si el plan no cambió, no crees una versión nueva.
3. **Enlaza las tareas con las partidas del presupuesto.** Esto es lo más
   importante que puedes hacer aquí, y se explica en la pregunta frecuente de
   abajo sobre el avance en soles.

---

## 2. Lookahead — la ventana de mediano plazo

**Qué es.** Una tabla con las tareas que el cronograma trae en las próximas
semanas, y el análisis de qué les falta para poder ejecutarse.

**Por qué importa.** Es el corazón del Last Planner. Sirve para pasar de *«lo
que toca hacer»* a *«lo que se PUEDE hacer»*. Todo lo que se compromete sin
estar liberado termina incumpliéndose, y eso es exactamente lo que este paso
evita.

**Qué hago aquí.**

1. Pulsa **«Sincronizar ventana»**: trae las tareas del cronograma vigente y
   les crea sus siete restricciones en blanco.
2. Marca cada flujo cuando quede resuelto de verdad.
3. Cuando los siete están marcados, la tarea pasa a **LISTA** y el porcentaje
   de confiabilidad sube.
4. Selecciona las listas y pulsa **«Comprometer al PTS»**.

**La ventana es configurable**: el selector admite de 3 a 12 semanas. Tres es el
mínimo útil; lo habitual son cuatro a seis. Una obra con acero importado
necesita mirar más lejos que una de acabados.

**En el móvil** la tabla se convierte en tarjetas: cada tarea muestra
«Restricciones 3/7 resueltas» y se despliega al tocarla.

---

## 3. Las 7 restricciones — la palabra SIEMPRE

Siete preguntas que hay que responder antes de prometer una tarea. Las
iniciales forman **SIEMPRE**, y así se recuerdan sin consultar nada:

| | Flujo | Está resuelto cuando… |
|---|---|---|
| **S** | Seguridad | Hay permisos, PETAR y ATS |
| **I** | Información | Los planos están aprobados y la RFI respondida |
| **E** | Espacio | El frente o la zona está liberada |
| **M** | Materiales | Están en obra o con entrega confirmada |
| **P** | Personas | La cuadrilla está asignada |
| **R** | Requisitos | Las tareas previas y los permisos están |
| **E** | Equipos | La maquinaria y la herramienta están disponibles |

**Si falta una sola, la tarea no está lista.** Comprometerla igual es la causa
número uno de incumplimiento en obra.

---

## 4. Plan Semanal (PTS)

**Qué es.** Lo que el equipo se compromete a hacer esta semana.

**Por qué importa.** Un compromiso es una promesa entre personas, no un deseo
del planificador. Por eso se compromete poco y se cumple, en vez de programar
mucho y fallar.

**Qué hago aquí.**

1. Revisa lo que llegó del Lookahead.
2. Ajusta **cantidad y unidad** (por ejemplo, 120 m²). Si la tarea tiene partida
   mapeada, viene propuesta.
3. Quita lo que no corresponda; añade líneas libres para trabajo que no está en
   Project.

---

## 5. Cierre de la semana: PPC y causas

**Qué es.** Marcar qué se cumplió, qué no y por qué.

**Por qué importa.** El PPC **no mide avance**: mide si cumples lo que
prometes. Una obra puede ir adelantada y tener un PPC malo — significa que
planifica mal, aunque el ritmo la salve. Y la **causa** es lo que de verdad
enseña: sin ella, cerrar la semana no sirve para nada.

**Qué hago aquí.**

1. Marca cumplido o no cumplido.
2. Anota **cuánto se ejecutó de verdad** (90 de los 120 m² comprometidos).
3. Si no se cumplió, elige la causa. Es obligatorio.
4. Mira el **Pareto**: la causa que más se repite es tu cuello de botella real.

**El PPC se calcula así:** tareas cumplidas ÷ tareas prometidas × 100. Nada más.
Una tarea a medias cuenta como no cumplida — esa dureza es intencional.

---

## Preguntas frecuentes

### ¿Por qué mi avance físico no está en soles?

Porque hoy se pondera por **duración**, que es lo único que trae el archivo de
Project. Un ejemplo con números reales:

| Tarea | Duración | Costo | Avance |
|---|---|---|---|
| Curado de concreto en zapatas | 60 d | S/ 10.000 | 20 % |
| Suministro y montaje de estructura | 5 d | S/ 200.000 | 100 % |

Ponderado por duración da **26 %**. Ponderado por dinero, **96 %**. El curado
dura mucho y no cuesta casi nada.

**La solución:** enlaza tareas con partidas en la pantalla de mapeo. Cada tarea
hereda el importe de sus partidas y el avance pasa a significar «qué porcentaje
del presupuesto está ejecutado» — que es lo único comparable con lo gastado.

No hace falta mapear todo: empieza por los capítulos que concentran el dinero.

### ¿Qué diferencia hay entre capítulo, partida y tarea?

- **Capítulo**: solo agrupa. No lleva metrado ni costo propio.
- **Partida**: la hoja del presupuesto. Lleva unidad, metrado y precio. Es la
  unidad de **dinero**.
- **Tarea**: viene de Project. Lleva fechas y duración. Es la unidad de
  **tiempo**.

Son dos árboles distintos, y se cruzan con un mapeo que confirma una persona.

### ¿Una tarea puede tener varias partidas?

Sí, y al revés también. «Instalaciones piso 1» puede tocar tubería, cableado y
accesorios. «Concreto en zapatas» puede repartirse en tres tareas por zonas.

Por eso, cuando una tarea toca partidas con unidades distintas (m² y kg), el
sistema **no inventa** una cantidad: te la pide.

### ¿El sistema no puede mapear solo las partidas?

Ya lo hace: te propone las que más se parecen. Lo que no hace es **confirmar**
solo, y hay una razón medida sobre tus propios archivos: de 56 coincidencias de
código, 36 apuntaban a otra cosa. Un mapeo equivocado no da síntoma — la curva
sale bonita y miente.

### ¿Qué es la ruta crítica?

La cadena de tareas donde **un día perdido es un día perdido de obra entera**.
Las demás tienen holgura.

Viene marcada por Project; GCM no la deduce. Lo que sí hace es quitar los
capítulos y los hitos, que Project también marca pero sobre los que no se puede
actuar: meter cuadrilla en un capítulo no significa nada.

### Marqué las 7 restricciones y la tarea no pasa a LISTA

Comprueba si dice **«Sin analizar»**. Eso significa que todavía no tiene
restricciones creadas: pulsa «Sincronizar ventana» primero.

### ¿Por qué me pide confirmar al comprometer?

Porque algo de lo que elegiste no está liberado, o ya está comprometido en otra
semana. No se prohíbe —la obra a veces arranca igual— pero queda constancia de
que se decidió a sabiendas.

### Cambié la meta de un compromiso y perdí la cantidad

Eso era un fallo y está corregido. Guardar la semana reemplaza los compromisos,
y antes se llevaba por delante lo que la pantalla no reenviaba. Ahora la
cantidad, la unidad y la zona sobreviven.

### El valor ganado no me muestra el EAC ni el VAC

Es a propósito, y llegó después de un susto: la pantalla llegó a anunciar en
verde un ahorro de **S/ 633.873** en CRIOCORD. Falso.

El «costo estimado al final» se calcula con lo que llevas gastado. Pero en GCM
el gasto son las **órdenes de compra aprobadas**, y las órdenes se aprueban
*después* del trabajo: cuando llevabas S/ 62.000 ganados solo había una orden
de S/ 11.000. Divide una cosa por la otra y sale que la obra costará la quinta
parte de lo presupuestado. Nadie construye tan barato.

Así que esas tres cifras —CPI, EAC y VAC— **no se muestran hasta que haya con
qué sostenerlas**: al menos un 15 % de obra ejecutada y que el costo registrado
cubra la mitad de lo ganado. Mientras tanto la pantalla dice por qué falta cada
una, en vez de dejar un guion.

Lo que **sí** puedes leer desde el primer día:

- **SPI y SV** — vas adelantado o atrasado. No dependen del gasto.
- **CV** (ganado menos gastado) — es un hecho de hoy, no una predicción.
- **La curva** de las tres líneas.

**Para que aparezcan antes:** registra las órdenes de compra al día. Cuanto
menos se retrase el papeleo respecto de la obra, antes sirve la proyección.

### La curva S dice que «no se llega». ¿Nunca?

Antes sí lo decía mal. Si ibas al 96 % del ritmo previsto, la curva no tocaba
el 100 % dentro del plazo y el sistema se rendía: ponía «no se llega», que se
lee como *jamás*. Ahora estima **cuánto te vas a pasar**: a mitad de ritmo,
tardas el doble de lo que queda.

Solo dice «no se llega» cuando el ritmo es **cero**. Ahí es literal: sin
avanzar nada, no se llega nunca.

Y el porcentaje de ritmo ya no redondea: un 99,6 % se muestra como 99,6 %, no
como «100 %». Decirle «vas al día» a quien no va es la peor ayuda posible.

### Aparecieron módulos nuevos en el panel y perdí mi configuración

Pasó una sola vez, y a propósito. El panel recordaba **qué módulos tenías
encendidos**, así que cualquier módulo que se añadiera después nacía apagado
para ti: tu preferencia no lo nombraba. Los tres de Last Planner —justo los
más importantes— no habrían aparecido nunca sin ir a buscarlos.

Ahora recuerda los que tienes **apagados**, así que lo nuevo entra encendido
solo. El precio fue reiniciar la selección una vez. No vuelve a ocurrir.

### Desplegué un cambio y no aparece

Desde el 10 de agosto de 2026 el despliegue es **automático**: al subir un
cambio, en menos de un minuto el servidor toma la versión nueva sin que nadie
toque nada. Da un margen de dos o tres minutos y recarga.

Si después de ese rato sigue sin aparecer, mira los detalles técnicos en
`docs/ESTADO.md` —sección del incidente del 10 de agosto—: ahí está cómo
comprobar que el paquete se aplicó.

---

## Glosario

| Término | Qué significa |
|---|---|
| **Last Planner** | Método de planificación donde quien ejecuta es quien compromete |
| **Lookahead** | La ventana de mediano plazo, donde se liberan restricciones |
| **PTS** | Plan de Trabajo Semanal: los compromisos de la semana |
| **PPC** | Porcentaje de Plan Cumplido: cumplidas ÷ prometidas |
| **CNC** | Causa de No Cumplimiento: por qué falló un compromiso |
| **Pareto** | El gráfico que ordena las causas de mayor a menor |
| **Confiabilidad** | Qué porcentaje de las tareas de la ventana está LISTA |
| **EVM / Valor ganado** | Compara lo planificado, lo ejecutado y lo gastado |
| **SPI / CPI** | Índices de rendimiento de plazo y de costo |
| **EAC** | Lo que costará la obra al final si sigues rindiendo igual |
| **VAC** | Lo que sobrará (o faltará) del presupuesto al terminar |
| **Ritmo** | A qué porcentaje del avance previsto vas realmente |
| **Días laborables** | De los días que quedan, los que se trabaja según el calendario |
| **EDT** | El árbol del presupuesto: capítulos y partidas |
| **UID** | El número que identifica una tarea entre versiones del cronograma |

---

## Qué falta por construir

**Fase 1** (hecha): calendario laboral editable · GCM se instala en el móvil
como una aplicación · Lookahead y PTS usables en obra · tablero con los
indicadores de Last Planner.

**Fase 2**: documentos — planos, protocolos y guías, con validación automática
de restricciones.

**Fase 3**: sectores de color en el PTS y aviso cuando dos cuadrillas coinciden
en el mismo sitio el mismo día.

**Fase 4**: que «cumplió» se calcule desde la cantidad ejecutada, y el
formulario de causa raíz y plan de recuperación.

**Fase 5**: sugerencias automáticas según la causa que más se repite.

> La lista completa y al día de lo que falta —con lo pendiente técnico, la
> seguridad y los defectos conocidos— vive en `docs/PENDIENTES.md`.
