# Pendientes de GCM

Lo que falta, ordenado por lo que duele antes. Este documento y `ESTADO.md`
son la unica memoria entre sesiones: lo que no esta escrito aqui, se pierde.

Ultima revision: 21 de agosto de 2026.

## Lo que dejo la tarde del 21 de agosto: auditoria del tablero y la cola que sigue

Una sesion larga cerro cuatro pendientes de la lista de abajo (despliegue
varado, `?siguiente=` del correo, plan de skills, Notas E1) y de paso el
usuario fue navegando la app en vivo, encontrando cosas que no estaban en
ningun documento. Queda una cola clara, en el orden acordado con el usuario:

1. ~~**Rol GERENTE de verdad, con interruptor de "ver como".**~~ **HECHO el
   21 de agosto de 2026.** `GERENTE` es ahora un rol propio del enum `Role`
   (migracion `rol_gerente_y_vista_previa`), con permisos derivados —no
   enumerados a mano— de `TODO_LO_QUE_SE_LEE` en `rbac.ts`: todo permiso que
   termina en `:leer` salvo el innegociable `permiso:leer`. Ve toda la
   cartera (se sumo a `VE_TODAS_LAS_OBRAS` en `alcance-obras.ts`, junto a
   ADMIN), no administra ni aprueba nada.

   El interruptor de "ver como" vive en `src/lib/vista-rol.ts`
   (`vistaEfectiva`, funcion pura y probada con 10 casos): los permisos de la
   simulacion son la INTERSECCION entre el rol simulado y los reales de la
   cuenta, nunca una sustitucion, asi que no hay forma de ganar privilegio
   manipulando la cookie a mano —eso se verifico en pruebas, no solo se
   afirma—. Solo una cuenta ADMIN puede activarlo, y solo si la empresa lo
   enciende en `/empresa/configuracion` (`permitirVistaPreviaRoles`, apagado
   por defecto). El control esta en el menu de la cuenta, y una franja fija
   avisa mientras la vista previa esta activa.

   **Un bug real que se encontro probandolo en vivo, no en las pruebas
   automatizadas**: los dos formularios de "Ver como" y "Volver a mi vista"
   viven dentro del desplegable del menu de cuenta, que se cierra al primer
   clic dentro de si mismo —exactamente el mismo problema que el propio
   codigo ya documentaba junto a `BotonSalir` ("Salir"), y que se me olvido
   replicar al escribir el componente nuevo—. El clic burbujeaba, cerraba y
   desmontaba el formulario antes de que el envio llegara a ejecutarse: el
   boton no hacia nada, en silencio, y typecheck/lint/2450 pruebas seguian en
   verde porque nada de eso ejercita un clic real de mouse. Se arreglo con el
   mismo `onClick={(e) => e.stopPropagation()}` que `BotonSalir` ya usaba.
   **Leccion:** una funcionalidad que depende de un evento de clic dentro de
   un menu desplegable hay que probarla con un clic de verdad, no solo con
   las pruebas automatizadas —esas prueban la logica, no la interaccion—.

   `/gerencia` tuvo su primera y segunda entrega de rediseno el 22 de agosto
   de 2026 (ocho secciones en total, ver el punto 7 de aqui abajo); lo que
   queda sin empezar es filtros, exportacion y el paso a pestanas si la
   pantalla se siente larga con las ocho tarjetas.

2. **Auditoria del tablero de la obra — ENTREGADA.** Agente de exploracion
   completo sobre `tablero.service.ts`, `pendientes.ts`, `modulos.tsx` y los
   servicios de dominio que alimentan cada modulo. Hallazgos confirmados, de
   mas a menos impacto:
   - El modulo "Valor ganado (EVM)" del tablero usa `presupuesto.total` como
     BAC en vez de `bacDeObra()` (que SI suma los adicionales aprobados de
     la linea base vigente). Es el mismo bug que se dio por arreglado el 10
     de agosto, pero el arreglo (`bacDeObra`) solo se conecto en
     `evm.service.ts`, no en `tablero.service.ts:357-358`. En una obra con
     adicionales aprobados, el tablero puede mostrar SPI/CPI peor que la
     pantalla EVM real de la misma obra el mismo dia.
   - La "ponderacion por dinero" que el manual y los comentarios prometen
     para cuando el mapeo tarea-partida pase del 60 % **nunca se
     implemento**: `ponderarPorDuracion` es la unica funcion de ponderacion
     que se llama en todo el repo. Avance fisico, curva y capitulos siempre
     pesan por duracion, nunca por dinero, con o sin mapeo completo.
   - ~~`calendario.ts` (`diaIso`, `diasLaborablesEntre`) sigue usando hora
     LOCAL en vez de UTC~~ **HECHO el 21 de agosto de 2026** (ver el
     detalle completo en la seccion 7 mas abajo, que es donde este mismo
     hallazgo ya estaba anotado desde antes).
   - ~~Solo el modulo "Que falta" enlaza a la vista EXACTA~~ **HECHO el 21
     de agosto de 2026, para 11 de los 14 modulos restantes.** Se anadio
     `id`/`scroll-mt-20` a las secciones que no lo tenian —curva de
     avance, valor ganado, "que esta frenando la obra", ruta critica,
     avance por capitulo (cronograma); el resumen de confiabilidad
     (lookahead) y la tendencia del PPC (plan semanal); una fila de nota
     por su id (recordatorios)— y se enlazo `causas` al `#pareto` que ya
     existia (construido para "Que falta" pero sin reusar). `capitulos`
     se redirigio del informe semanal (que no es la misma vista) a la
     seccion equivalente del propio cronograma. `confiabilidad` suma
     ademas `?semanas=` con la misma ventana que la tarjeta esta
     contando. `ordenes` se dejo tal cual: la tarjeta resume los tres
     estados a la vez, asi que filtrar a uno seria arbitrario.
     **Quedan fuera a proposito, por ser trabajo de otra naturaleza (no
     un enlace que arreglar, sino una vista que no existe)**: `plazo`
     enlaza a la ficha de la obra porque no hay pantalla dedicada a
     "dias consumidos y restantes"; `liberacion` (Demora por flujo) no
     tiene ningun sitio en `/lookahead` que muestre el desglose por
     flujo que la tarjeta ya calcula —haria falta construir esa vista
     ahi, no solo enlazarla—.
   - EAC y VAC (cuanto va a costar la obra al final, si sigue asi) ya estan
     calculados en `metricasEvm()` y nunca se muestran en el tablero — la
     cifra mas predictiva del sistema, sin coste de consulta extra.
   - No hay ningun aviso de sobregiro PROYECTADO (comparando % comprometido
     vs % de avance fisico por partida), solo del que ya ocurrio.
   - Menor: `pendientesDeLaObra` en `tablero.service.ts:848-855` no filtra
     `restriccion` por `companyId` (si por `projectId`, y `obraId` ya viene
     validado antes, asi que no es explotable hoy, pero rompe el estandar
     del resto del archivo).

3. **Auditoria de "todo lo demas" — ENTREGADA el 21 de agosto de 2026.**
   Cuatro agentes de exploracion en paralelo, mismo metodo que el punto 2:
   curvas/EVM/calculos, plantillas preconfiguradas, pantallas de ejecucion y
   compras no cubiertas por la prueba E2E, y configuracion/menus/navegacion.
   Hallazgos confirmados leyendo el codigo, de mas a menos impacto:

   **Critico/alto:**
   - ~~**El rol GERENTE no se puede editar en la matriz de permisos.**~~
     **ARREGLADO el 21 de agosto de 2026.** `empresa/permisos/acciones.ts:33`
     validaba los cambios contra un `z.enum` escrito a mano con los 5 roles
     de antes de que GERENTE existiera (commit `129411a`). La rejilla SI
     pintaba su columna (`obtenerMatriz` ya usa `ROLES` completo), pero en
     cuanto se guardaba un lote que incluia un cambio de GERENTE, Zod lo
     rechazaba entero con "La matriz llego incompleta" — y como valida el
     array completo, tiraba abajo tambien los cambios de otros roles en el
     mismo lote. El servicio (`permisos.service.ts`) ya soportaba GERENTE
     bien; el bug estaba aislado en esta validacion de forma. Se anadio
     `"GERENTE"` al enum.
   - ~~**La pantalla de la meta promete una hoja "Gastos Generales" que ya
     no existe.**~~ **ARREGLADO el 21 de agosto de 2026.** El 21/08
     (commit `34c883c`) se borro esa hoja de `plantilla-meta.ts` y la
     funcion que la escalaba al plazo de la obra, pero
     `FormularioMeta.tsx:128-133,150-152` y
     `obras/[id]/meta/page.tsx:262-267` nunca se actualizaron y le seguian
     diciendo al usuario que iba a descargar "las dos hojas —Costo Directo
     y Gastos Generales—". Corregido el texto en los tres sitios para
     hablar solo de la hoja "Costo Directo" y del plazo comprometido, sin
     mencionar gastos generales ni un "sobrecosto de plazo" que nunca se
     muestra (ver el hallazgo nuevo, justo abajo). La accion de importar
     ya rechazaba correctamente un archivo que trajera esa hoja — eso no
     cambio.
   - ~~Consecuencia encadenada: el aviso "N gasto(s) general(es) duran mas
     que la obra" y su boton de ajuste (`PanelBolsa.tsx`,
     `BotonAjustarMeses.tsx`) quedan inalcanzables — codigo muerto
     candidato a retirar.~~ **YA NO APLICA, confirmado el 22 de agosto de
     2026**: `BotonAjustarMeses.tsx` ya no existe como archivo,
     `PanelBolsa.tsx` no referencia nada de esta maquinaria, y en
     `meta.service.ts` `AvisoPlazo`/`costeMensualDelAtraso`/
     `lineasMasLargasQueLaObra` ya no existen en absoluto (cero resultados
     por grep). Solo queda `resumenGastosGenerales`, llamada con un array
     SIEMPRE vacio en `meta.service.ts:431` (documentado en el propio
     comentario: "LOS GASTOS GENERALES YA NO SON DE LA META") — no es
     codigo muerto: la misma funcion sigue viva y con datos reales en
     `excel-meta.ts:278`, para avisar de lo que trae un Excel viejo. No
     queda nada que conectar ni retirar.
   - **Patron sistematico de consultas sin filtro `companyId`**, el mismo
     descuido que ya causo la fuga real de `tablero.service.ts`, repetido
     en cuatro servicios distintos (hoy no explotable en ninguno porque la
     obra ya se valida antes en la misma funcion, pero rompe el estandar
     que el propio proyecto se exige y documenta en varios comentarios):
     - `cronograma.service.ts`: `avanceTarea.findMany` sin `companyId` en
       TRES funciones (`obtenerCronograma` usada por Gantt,
       `informeAlCorte` e `informeSemanal` usadas por el Informe, y
       `datosCurvaS`), mientras la consulta hermana de cada una si lo
       lleva.
     - `pagos.service.ts`: `panelDeValorizaciones` consulta
       `encargoProveedor` sin `companyId`, mientras `registrarPago`,
       `fijarCadencia` y `listarPagos` del mismo archivo si lo llevan.
     - `revisiones.service.ts`: `crearRevision` — la funcion que CONGELA
       el presupuesto que despues se aprueba como linea base — consulta
       `wbsItem` sin `companyId`, 35 lineas debajo de
       `obtenerCostoDirectoActual`, que si lo lleva sobre el mismo modelo.
     - `kanban.service.ts`: `compromisosDelTablero` consulta `planSemanal`
       (columnas Comprometida/Cerrada) sin `companyId`.
   - **El EVM del tablero sigue sin `bacDeObra()`.** El bug que se dio por
     arreglado el 10 de agosto (ver arriba, este mismo punto 2) solo se
     conecto en `evm.service.ts`; `tablero.service.ts:363` sigue usando
     `presupuesto.total` (sin los ajustes de la linea base aprobada) como
     BAC. Confirmado: sigue vivo hoy.
   - **El aviso de "ponderacion por dinero al pasar el 60% de mapeo"
     desaparece sin que el calculo cambie.** Confirmado por grep
     exhaustivo: NINGUNA parte del codigo pondera por dinero, solo por
     duracion (`ponderarPorDuracion` es la unica funcion de ponderacion
     que se llama en todo el repo). `PanelEvm.tsx:221-232` solo muestra el
     aviso mientras `coberturaMapeo < 60`; si una obra supera el 60% de
     mapeo, el aviso se apaga en silencio como si el calculo hubiera
     pasado a ser mas fino, cuando en realidad sigue exactamente igual.

   **Medio-alto:**
   - ~~`empresa/permisos/page.tsx:73-81` dice "Cuatro permisos no se tocan";
     hoy `INNEGOCIABLES` (`rbac.ts`) tiene NUEVE.~~ **YA NO APLICA,
     confirmado el 22 de agosto de 2026**: el texto ya lee
     `{INNEGOCIABLES.length} permisos no se tocan`, dinamico. Se arreglo en
     algun punto de la tanda de hallazgos del 21/08 sin que este documento
     se actualizara.
   - ~~"Archivo" (`/empresa/archivo`) y "Llevarse la empresa"
     (`/empresa/migracion`) solo tienen enlace desde `/panel`~~ **YA NO
     APLICA, confirmado el 22 de agosto de 2026**: `layout.tsx` (la
     cabecera) ya incluye las dos en el desplegable "Empresa".
   - ~~`datos-de-ejemplo.ts`: el detector de "esta obra es la plantilla de
     ejemplo" compara contra `TOTAL_EJEMPLO` de la plantilla CONTRACTUAL
     huerfana~~ **YA NO APLICA, confirmado el 22 de agosto de 2026**: el
     archivo ya separa `TOTAL_CONTRACTUAL_EJEMPLO` de `TOTAL_COSTO_EJEMPLO`,
     cada detector contra el total que le corresponde.
   - ~~`msproject-xml-escribir.ts:191-195` afirma en un comentario que el
     "% Planeado" se recupera igual que en la plantilla de Excel~~
     **ARREGLADO el 21 de agosto de 2026: se corrigio el comentario, no el
     comportamiento.** Investigado a fondo: el lector de MS Project
     (`msproject-xml.ts`) SI deja el campo en 0.00 sin repartir nada —eso
     era cierto—, pero es la cabecera del propio archivo la que lo exige
     ("nada se deduce ni se recalcula: MS Project manda sobre el plan e
     inventar una cifra que el planificador no escribio descuadraria el
     informe que el cliente ya emite"). Portar el reparto lineal de Excel
     ahi habria sido romper esa regla a proposito, no arreglar un bug. Se
     dejo el comportamiento igual y se reescribio el comentario del
     escritor para que diga la verdad. La prueba "avisa cuando una tarea
     no trae % planeado y la deja en cero" (`msproject-xml.test.ts`) ya
     cubria este caso — el "sin test que lo cubra" tambien era impreciso.
   - ~~Kanban: `TableroKanban.tsx` documenta ser "DE LECTURA" a proposito,
     pero pinta el boton "Empezo en obra" sin comprobar permiso~~ **YA NO
     APLICA, confirmado el 22 de agosto de 2026**: el boton ya esta detras
     de `puedeMarcarEnEjecucion={puede(sesion, "plan_semanal:gestionar")}`
     en `TableroKanban.tsx:202` y en la pagina que lo llama.
   - El "SPI" de `PanelEvm.tsx` y el "SPI por duracion" de gerencia son,
     algebraicamente, el mismo ratio (el BAC se cancela: EV/PV =
     %real/%planeado, y las dos pantallas ponderan por duracion). Difieren
     solo en la FUENTE (linea base congelada vs. cronograma vigente) y en
     si excluyen tareas `sinProgramar`. Gerencia se cuida de rotular
     "SPI por duracion, nunca SPI a secas"; el EVM del cronograma solo
     dice "SPI", sin la misma advertencia.

   **Medio:**
   - ~~"Solicitudes de perfil" solo tiene enlace en la cabecera; el badge de
     pendientes en el panel lo cuelga de la seccion "Personas", que enlaza
     a `/empresa/usuarios` — no a `/empresa/solicitudes`, donde de verdad
     se aprueban.~~ **ARREGLADO el 22 de agosto de 2026.** La tarjeta
     "Personas" de `/panel` ahora enlaza a `/empresa/solicitudes` cuando
     hay solicitudes pendientes Y la sesion puede aprobarlas
     (`usuario:editar` — esa pantalla redirige sola sin el permiso, asi que
     mandar ahi a quien solo tiene `usuario:leer` habria sido peor); sin
     pendientes, o sin el permiso, sigue yendo a `/empresa/usuarios` como
     siempre.
   - ~~`/empresa/datos` se enlaza con permisos distintos segun el menu~~
     **YA NO APLICA, confirmado el 22 de agosto de 2026**: la cabecera
     (`layout.tsx`) ya exige `empresa:leer`, igual que el panel.
   - ~~`migas.ts`: 5 rutas reales de `empresa/*` sin entrada~~ **YA NO
     APLICA, confirmado el 22 de agosto de 2026**: las 11 rutas citadas
     (archivo, migracion, contratos/mensajes de proveedor,
     puesta-en-marcha, `/gerencia`, `/manual`, equipo, notas,
     valorizaciones, `/operador/[id]`) ya tienen entrada en `migas.ts`, y
     la entrada muerta de `/obras/:obra/respaldo` ya no esta.
   - ~~El color del `GaugeIndice.tsx` decide el semaforo con el indice SIN
     redondear~~ **YA NO APLICA, confirmado el 22 de agosto de 2026**: ya
     redondea con `redondearA(indice, 2)` antes de decidir el semaforo,
     con un comentario que cita explicitamente este mismo hallazgo.
   - ~~Dos definiciones de "comprometido" con el mismo nombre y sin
     remision cruzada: el AC del EVM cuenta SOLO ordenes `APROBADA`; el
     "economico" de Fisico vs. Economico suma tambien encargos vigentes
     aun no formalizados en orden.~~ **YA NO APLICA, confirmado el 22 de
     agosto de 2026**: las dos pantallas ya se remiten la una a la otra.
     `PanelEvm.tsx` rotula "Costo real (AC, órdenes aprobadas)", nunca
     "Comprometido" a secas; `evm.service.ts:26-32` documenta por que
     difiere del "Comprometido" de las demas pantallas. Y
     `FisicoVsEconomico.tsx:59` lleva un `title` textual: "Distinto del
     «Costo real (AC)» del EVM, que solo cuenta órdenes ya aprobadas."
   - ~~Contractual: un comentario en `importacion.service.ts:53-55` afirma
     que "la pantalla ya exige `partida:importar`"~~ **YA NO APLICA,
     confirmado el 22 de agosto de 2026**: `contractual/page.tsx` exige
     `meta:leer` para VER la pantalla y `partida:importar` para el boton de
     generar/reemplazar (`puedeGenerar`) — el comentario ya dice la verdad.
   - ~~Personal: `nombresDe` en `avisos-auditoria.ts` resuelve nombres de
     `contactoAviso` SIN ningun filtro de pertenencia~~ **YA NO APLICA,
     confirmado el 22 de agosto de 2026**: la funcion ya recibe y aplica
     `companyId` en las dos consultas (usuarios y contactos).
   - ~~Plantilla de proveedores: unica de las cuatro plantillas sin test de
     ida y vuelta~~ **HECHO el 21 de agosto de 2026.** `CAMPOS_EXCEL`
     (`proveedores-excel.ts`) gano `maxLargo` por campo, reflejando los
     `@db.VarChar` de `Proveedor` en el esquema (razonSocial 200,
     contactoNombre 150, contactoTelefono 30, email 150, banco 80,
     cuentaBancaria/cci/cuentaDetraccion 40 cada uno). `leerFila` recorta y
     avisa por fila en vez de dejar que `saneado()`
     (`proveedores.service.ts`) trunque en silencio -mismo patron que
     `MAX_UNIDAD`/`MAX_CODIGO` de `excel-presupuesto.ts`-, y el aviso llega
     hasta la pantalla (`ResumenImportacion.avisos`,
     `ImportarProveedores.tsx`). Se extrajo `leerFilasDelLibro` (parte pura
     de `importarProveedores`, antes mezclada con la escritura en base)
     para poder escribir el test de ida y vuelta que faltaba,
     `proveedores-excel.service.test.ts`.

   **Bajo:**
   - ~~`MatrizPermisos.tsx`: 10 de los 18 dominios de permiso no tienen
     etiqueta en `ETIQUETA_DOMINIO`~~ **YA NO APLICA, confirmado el 22 de
     agosto de 2026**: los 18 dominios ya tienen etiqueta.
   - Umbrales de `capacidad.ts` (1.0 / 1.4) confirmados, de nuevo, como
     arbitrarios — coincide con lo ya anotado en el punto 3 de la seccion
     de abajo, sin dato nuevo que lo cierre. **Sigue bloqueado**: no es
     algo que se resuelva escribiendo codigo, hace falta acumular semanas
     cerradas de datos reales.
   - ~~`propuesta/excel/route.ts:316,331` compara importes de dinero con
     `Number()` en vez de `esCero`~~ **YA NO APLICA, confirmado el 22 de
     agosto de 2026**: esas mismas lineas ya usan `esCero`/`restar`.
   - ~~`plantilla-presupuesto.ts` confirmado huerfano por grep exhaustivo~~
     **BORRADO el 22 de agosto de 2026**, junto con su
     `plantilla-presupuesto.test.ts`: sin ruta, sin import, confirmado de
     nuevo por grep antes de borrar.

   **Revisado sin hallazgos de peso**: Lookahead, Galeria, Mapeo, Equipo,
   `empresa/configuracion` (y sus componentes), `empresa/permisos` en su
   defensa de `INNEGOCIABLES`, `empresa/formas-pago`, `empresa/proveedores`,
   `empresa/usuarios`. Confirmado tambien en positivo: a diferencia del
   tablero, el EVM del cronograma (`PanelEvm.tsx`) SI muestra EAC y VAC.

4. **Estado de la obra (Planificacion/Ejecucion/Paralizada/Cerrada) —
   AUDITADA el 21 de agosto de 2026.** Agente de exploracion sobre la
   maquina de estados (`src/lib/obras.ts`), la guarda central
   (`motivoSiObraCerrada` en `obra-abierta.ts`, usada por ~24 servicios) y
   cada transicion. Hallazgos confirmados, de mas a menos impacto:

   **Bugs reales (la guarda se saltaba, no era cuestion de diseno) —
   ARREGLADOS el 21 de agosto de 2026:**
   - ~~**`partidas.service.ts` y `evidencia.service.ts` no comprueban
     `empresaEnMigracion`.**~~ Ambos reimplementaban la guarda a mano en
     vez de llamar a `motivoSiObraCerrada`, y su `select` de la obra nunca
     traia `company.enMigracionAt`, asi que esa rama de
     `motivoNoAdmiteCambios` nunca se disparaba ahi: mientras la empresa
     estaba congelada para exportarse —cuyo propio mensaje
     (`EMPRESA_EN_MIGRACION`) promete "nadie puede escribir mientras
     dure"— el presupuesto entero (`actualizarPartida`, `eliminarPartida`,
     `crearPartida`, `renumerarPartidas`, `agruparEnSumaAlzada`) se seguia
     pudiendo editar, y un pase de campo activo seguia pudiendo subir
     fotos. Se anadio `company: { select: { enMigracionAt: true } } }` a
     los cinco `select` (4 en `partidas.service.ts`, 1 en
     `subirEvidenciaConPase`) y se paso `empresaEnMigracion` a
     `motivoNoAdmiteCambios`.
   - ~~**`pase.service.ts` no comprueba el estado de la obra en
     absoluto.**~~ `crearPase`, `editarPase`, `eliminarPase` y
     `cambiarEstadoPase` (que incluye REACTIVAR un pase) ni siquiera pedian
     `estado` en su `select` de la obra: se podia dar de alta o reactivar
     un pase de campo para una obra CERRADA, archivada o con la empresa en
     migracion. Las cuatro escrituras ahora consultan
     `estado`/`archivadaEn`/`company.enMigracionAt` y llaman a
     `motivoNoAdmiteCambios` antes de escribir —`cambiarEstadoPase` no
     traia la obra en absoluto antes del `updateMany`, asi que ahora hace
     un `findFirst` previo—. 2461 pruebas en verde, typecheck/lint/build
     limpios.

   **Confirmado, y es una decision sin tomar, no un bug de codigo:**
   - **PARALIZADA no bloquea NINGUNA escritura**, verificado caso por caso:
     se puede crear una orden de compra nueva, aprobar un movimiento
     presupuestal, crear un Plan Semanal y comprometer tareas de Last
     Planner, y registrar el parte de avance diario, todo en una obra
     paralizada. `motivoNoAdmiteCambios` nunca menciona `PARALIZADA`. Esto
     ya estaba anotado en este mismo documento como "pedido, no empezado":
     no es una decision tomada, es lo que quedo por defecto al construir
     el estado.
   - **`avisos-reloj.ts:169`** filtra "obras vivas" con `obraAdmiteCambios`,
     que incluye PARALIZADA: se siguen mandando recordatorios de
     restriccion por vencer, resumenes diarios y avisos de valorizacion
     pendiente en una obra parada, gastando el mismo presupuesto de SMS.
   - ~~**Dos nociones de "obra viva" que no coinciden.**~~ **UNIFICADO el 22
     de agosto de 2026.** `gerencia.service.ts` ya contaba PARALIZADA como
     obra viva (SPI/alertas de atraso); `obras.service.ts`
     (`obtenerResumenEmpresa`, las tarjetas de dinero del panel) filtraba
     estrictamente `EN_EJECUCION` y la excluia — el dinero comprometido
     desaparecia de las cifras del panel al paralizar, aunque la deuda con
     el proveedor seguia existiendo. Se agrego `ESTADOS_OBRA_CON_EXPOSICION`
     (`lib/obras.ts`: `EN_EJECUCION` + `PARALIZADA`, PLANIFICACION y CERRADA
     quedan fuera a proposito) y se uso en las tres cifras de dinero del
     panel (`totalDeEmpresa`, ahora acepta uno o varios estados; los dos
     agregados de comprometido) y en el conteo de `obrasConPlazoVencido`.
     Tambien se corrigio el mismo patron en el aviso de "plazo vencido" por
     TARJETA en `/panel` (`page.tsx`), que solo miraba `EN_EJECUCION` y
     habria quedado inconsistente con el conteo agregado si no se tocaba a
     la vez. 2516 pruebas, typecheck, lint, build y `scripts/humo.ts` (83
     rutas, incluidas `/panel` y `/gerencia`) en verde.
   - **Paralizar no pide motivo ni fecha estimada de reanudacion.** El
     modelo `Project` no tiene ningun campo para esto (a diferencia de
     `Restriccion`, que exige responsable+fecha, o del propio mensaje de
     `EMPRESA_EN_MIGRACION`, que explica que es temporal y quien lo
     levanta). Solo "Cerrar" pide confirmacion (un `window.confirm`, no un
     motivo); "Paralizar" no pide nada.

   **Confirmado en positivo, sin hallazgos:**
   - El borrado de obra (`obra-borrado.service.ts`) tiene realmente CINCO
     puertas, no cuatro: permiso innegociable, alcance, `CERRADA`, nombre
     tecleado, contrasena — y ademas exige un respaldo reciente utilizable.
     Ninguna se debilito en sesiones recientes.
   - Las transiciones (`accionCambiarEstadoObra` → `cambiarEstadoObra` →
     `puedeTransicionarObra`) no tienen fuga: no hay forma de mandar un
     estado fuera de `TRANSICIONES_OBRA` desde el formulario ni desde la
     accion de servidor.
   - ~~Nota menor, sin decidir: `equipo.service.ts`
     (`asignarAObra`/`quitarDeObra`) y
     `mensajes-contratista.service.ts:266` tampoco comprueban el estado de
     la obra.~~ **DECIDIDO el 22 de agosto de 2026, dos reglas distintas
     porque son dos cosas distintas:**
     - `equipo.service.ts` es control de ACCESO, asi que sigue la MISMA
       guarda que todo lo demas: `asignarAObra` (abrir) llama a
       `motivoSiObraCerrada` sin excepcion; `quitarDeObra` (cerrar, revocar
       un acceso que ya estaba) la llama con `{ permiteEnParalizada: true }`,
       mismo criterio que `aprobarMovimiento`. De regalo, esto cierra un
       hueco de ALCANCE que no estaba pedido: `motivoSiObraCerrada` tambien
       comprueba que la obra este dentro de `obrasAsignadas` de quien
       escribe, y ninguna de las dos funciones lo hacia antes.
     - `mensajes-contratista.service.ts` es COMUNICACION con un tercero, no
       datos de la obra: escribirle a un contratista sobre un pago final,
       una pausa o un cierre es justo el mensaje que tiene sentido seguir
       mandando en esos momentos, asi que CERRADA y PARALIZADA NO bloquean.
       Solo se bloquea si la empresa esta en migracion (nadie escribe nada
       mientras dure) o si la obra ligada es una copia archivada (escribir
       "en nombre" de una obra congelada no tiene sentido). `datosParaEscribir`
       gano `obraArchivada`/`empresaEnMigracion` para que la pantalla de
       redaccion (que tambien usa esa funcion, solo para LEER) siga
       abriendo con normalidad — el bloqueo vive en `escribirAlContratista`,
       no en el dato compartido.
     Verificado con typecheck, lint, build y las 2534 pruebas existentes en
     verde; ninguno de los dos servicios tenia archivo de pruebas propio
     antes de este cambio y sigue sin tenerlo — deuda preexistente, no
     introducida aqui.

   ~~**Recomendacion del agente, sin decidir todavia:** separar las
   escrituras de PARALIZADA en dos grupos en vez de bloquear todo o nada.~~
   **HECHO el 22 de agosto de 2026**, con el alcance que el usuario decidio:
   - `motivoNoAdmiteCambios`/`motivoSiObraCerrada` ganan un segundo
     parametro `{ permiteEnParalizada?: boolean }`, con default `false`
     (deny-by-default, mismo criterio que `rbac.ts`): de las ~76 escrituras
     que pasan por la guarda, la inmensa mayoria son "abrir algo nuevo" y
     quedan protegidas SIN tocarlas. Solo siete llamadas piden la excepcion
     explicita porque "cierran" lo que ya estaba en curso:
     `aprobarMovimiento`, `cerrarPlanSemanal`, `levantarRestricciones`,
     `levantarTodasDeTareas`, `comprometerRestricciones`, `subirEvidencia`,
     `subirEvidenciaConPase`. `fijarFlujos` y `marcarSinRestricciones`
     comparten codigo (`analizar()` en `lookahead.service.ts`) y se dejaron
     BLOQUEADAS a proposito, por simplicidad: pueden crear restricciones
     nuevas, no solo cerrarlas.
   - `Project` gana `motivoParalizacion` (`VarChar(300)`),
     `fechaEstimadaReanudacion` (`@db.Date`, OPCIONAL — a veces de verdad no
     se sabe cuando se reanuda) y `paralizadaEn`. `cambiarEstadoObra` exige
     el motivo al paralizar y limpia los tres a `null` al salir (reanudar o
     cerrar), mismo criterio que `PaseObra.revocadoAt/revocadoPor`.
   - `EstadoObra.tsx` gano `FormularioParalizar`, mismo patron
     reveal-en-vez-de-un-clic que `FormularioReabrir` (textarea de motivo
     obligatorio + fecha opcional + Confirmar/Cancelar), y muestra el
     motivo/fecha junto al chip cuando la obra esta parada.
   - **`avisos-reloj.ts` y `gerencia.service.ts` NO cambiaron de
     comportamiento a proposito**: los dos seguian tratando PARALIZADA como
     "obra viva" (avisos automaticos, alertas de atraso), y el default
     restrictivo nuevo de `obraAdmiteCambios` los habria excluido sin
     querer. Los dos ahora llaman con `{ permiteEnParalizada: true }`
     explicitamente para conservar el comportamiento que ya tenian —
     unificar esas dos nociones de "obra viva" sigue siendo un pendiente
     aparte, sin tocar.
   - 2511 pruebas en verde (motivoNoAdmiteCambios con y sin la excepcion;
     `cambiarEstadoObra` exige motivo, valida la fecha, limpia al salir;
     `aprobarMovimiento` pide la excepcion, `crearMovimiento` NO la pide —
     control de que el default restrictivo protege de verdad), typecheck,
     lint y build limpios, y `scripts/humo.ts` (83 rutas contra la base de
     desarrollo real) sin ninguna rota.

5. ~~**Prueba de extremo a extremo real.**~~ **HECHA el 21 de agosto de
   2026** — ver el punto 13 de esta misma lista, con el detalle completo.

6. **Manual completo** — pedido, pero **APLAZADO A PROPOSITO por el usuario
   el 21 de agosto de 2026**: "lo dejamos para el final porque vamos a
   seguir cambiando cosas". Escribirlo ahora, con la app todavia moviendose
   tanto (297 commits entre el 12 y el 21 de agosto, ver mas abajo), lo
   dejaria desactualizado antes de terminarlo. No retomar sin que el
   usuario lo pida. Cuando llegue el momento: actualizado, intuitivo,
   paginado, con hipervinculos entre capitulos (hoy los capitulos se
   nombran unos a otros en prosa, nunca con un enlace — séria un cambio de
   estilo del manual entero, no algo que meter en un solo capitulo sin
   criterio), con ejemplos, con video si es viable. Notas ya tiene su
   primer capitulo (`src/components/manual/capitulos.tsx`, slug `notas`);
   el resto del
   manual sigue con el estilo de antes.

7. **Dos hallazgos sueltos de UX, vistos en vivo con el usuario**:
   - El panel (`/panel`) pone "5" en grande en la tarjeta "Obras" justo al
     lado de las tarjetas de dinero, que en realidad solo cuentan la obra
     "en ejecucion" (dice "1 en ejecución", pero en gris y pequeño debajo
     del numero grande). No es un bug de calculo —`ResumenEmpresaPanel.tsx`
     lo hace a proposito, y lo explica en su comentario— pero la jerarquia
     visual induce a leer las cifras de dinero como si fueran de las 5.
     ~~HECHO el 21 de agosto de 2026, en tres pasadas~~. Primero: el
     usuario vio en vivo el panel con varias obras y pregunto "a quien
     corresponden estas cifras" — un primer intento le agrego texto
     aclarando la suma, y lo rechazo: un resumen de dinero de varias obras
     mezcladas "ahi no tiene sentido", diga lo que diga el texto. Se dejo
     asi: Presupuesto/Comprometido/Saldo SOLO se muestran con exactamente
     una obra en ejecucion —donde la suma y esa obra son la misma cifra—;
     con mas de una, se ocultan. En su lugar se sumo un semaforo de salud
     por obra (punto 12): a diferencia del dinero, un punto de color por
     obra SI tiene sentido con varias, porque no mezcla ninguna escala
     entre ellas. Tercero, y lo que cerro el hallazgo del todo: aunque ya
     no hubiera ambigüedad de ESCALA, seguia habiendo ambigüedad VISUAL —
     las cuatro tarjetas en la misma rejilla seguian pareciendo del mismo
     ambito—. `ResumenEmpresaPanel.tsx` ya no pone "Obras" en la misma
     rejilla que el dinero: "Obras" queda sola, y Presupuesto/Comprometido/
     Saldo van dentro de su propia caja con el titulo "La obra en
     ejecución", que no necesita nombrar la obra porque solo se muestra
     cuando hay exactamente una. Verificado en vivo en los dos casos.
   - ~~`/gerencia` (`src/app/(dashboard)/gerencia/page.tsx`) solo trae dos
     bloques (semaforo de partidas criticas por SPI, adicionales sin
     aprobar). El usuario lo considera insuficiente para lo que un gerente
     de una constructora esperaria.~~ **REDISENADA (primera entrega) el 22
     de agosto de 2026.** Investigado que consolidados de cartera NO existen
     hoy en ningun sitio de la app (ni de obra individual), clasificados por
     costo real de consulta, y elegidas por el usuario tres secciones
     nuevas, las tres BARATAS de pagar (sin cargar cronogramas de mas):
     **sobregiro proyectado** (compara %comprometido vs %avance fisico por
     obra — la unica de las tres que no existia ni a nivel de obra, avisa
     ANTES de que el sobregiro sea real), **compras/encargos sin aprobar**
     (calco de la tarjeta de Adicionales, sobre `OrdenCompra` en borrador),
     y **restricciones de Lookahead vencidas o por vencer** (agregado de
     cartera, sin tocar el cronograma). Detalle tecnico: `semaforoDeCartera`
     y `sobregiroProyectadoDeCartera` comparten el mismo lote de cronograma
     vigente via un helper `loteConAvanceMedido` envuelto en `cache()` de
     React —mismo patron que `datosAlertasEmpresa` en `obras.service.ts`—,
     asi que pedir las cinco secciones juntas no duplica la consulta mas
     cara de la pantalla. 2500 pruebas en verde (7 nuevas, en
     `gerencia.service.test.ts`, archivo que antes no existia), typecheck,
     lint, build y `scripts/humo.ts` en verde (`/gerencia` sin romperse,
     488 ms contra 415 ms antes de anadir las tres secciones — sin salto
     brusco).

     **SEGUNDA ENTREGA, el mismo 22 de agosto de 2026.** El usuario pidio
     retomar los tres descartes de la primera entrega —EVM consolidado, PPC
     consolidado, valorizaciones consolidadas— mas un grafico. Investigado
     de nuevo (no se reuso la conclusion vieja): con `loteConAvanceMedido`
     ya construido, tres de los cuatro descartes ya no aplicaban tal como se
     habian escrito. **EVM de cartera** salio como PROXY barato: el
     %avance que hace falta para PV/EV es la MISMA cuenta que ya paga
     `sobregiroProyectadoDeCartera` (rotulada "avance fisico"), asi que solo
     hizo falta una consulta nueva (AC = ordenes aprobadas, agregado);
     `metricasEvm`/`textoSinCosto` de `@/lib/evm` (ya existian, sin tocar)
     explican en pantalla por que falta CPI/EAC/VAC en vez de inventar un
     numero — mismo criterio del incidente de CRIOCORD documentado en la
     cabecera de ese archivo. **Confiabilidad de cartera (PPC)** exporto
     `ppcDeLaUltimaCerrada` (antes privada en `plan-semanal.service.ts`,
     usada por `/panel`) sin tocar su formula: la ultima semana cerrada de
     cada obra, sin promediar el historico. **Valorizaciones de cartera**
     resulto ser la unica pieza real (el descarte de "se solapa con
     `/panel`" era falso: `/panel` solo muestra comprometido, nunca estado
     de pago) y la unica de coste MEDIO —no BARATO— de toda la pantalla:
     carga filas completas con relaciones anidadas (fechas pactadas +
     ultima valorizacion + pagos) reusando `estadoDeCadencia`/
     `importeValorizado` de `pagos.service.ts`, sin duplicar esa logica. El
     **grafico** (`BarraSobregiro.tsx`, SVG a mano sin libreria, mismo
     patron que `CurvaS.tsx`/`GraficosPpc.tsx`) fue el de sobregiro
     proyectado por ser el de coste cero: el dato ya estaba en pantalla, es
     trabajo de presentacion puro. La pagina paso de 5 a 8 llamadas en
     `Promise.all`. Verificado: 2534 pruebas en verde (12 nuevas),
     typecheck, lint, build y `scripts/humo.ts` en verde. Cronometrado en
     serio esta vez —8 cargas seguidas contra la base real, no una
     muestra suelta—: la primera entrega promediaba ~579 ms tras el
     calentamiento; con las tres secciones nuevas y el grafico, ~683-800 ms
     (el propio script de medicion, temporal, se borro tras usarlo). El
     salto es real pero moderado, sin romper el segundo de carga; si algun
     dia pesa, la primera candidata a revisar es valorizaciones, ya
     documentado como la seccion MEDIA en el comentario de
     `valorizacionesDeCartera`.

     Lo que sigue sin empezar, a proposito: tendencia de PPC de cartera en
     el tiempo (reabriria la decision de "PPC consolidado" con una pieza de
     bucketing por semana de calendario, es su propia conversacion), BAC
     "real" con ajustes de linea base (el proxy de costo directo sigue
     siendo suficiente por ahora), filtros, exportacion, y pestanas —la
     pantalla llego a las ocho tarjetas que la primera entrega ya marco
     como el borde para considerarlas, pero el usuario no las pidio esta
     vez—. Plan completo (con lo descartado y por que, las dos entregas):
     `C:\Users\USER\.claude\plans\declarative-spinning-clock.md`.

8. ~~**Bug en produccion visto en vivo: `/obras/.../meta` se rompia al
   cargar**~~ **CERRADO el 21 de agosto de 2026.** El usuario mando una
   captura de "Esta pantalla no se pudo cargar" en `gcm.drcaceresruiz.com`.
   Diagnostico por lectura de codigo: todo apuntaba a una condicion de
   carrera del propio desplegador —`desplegar.sh` cambia de version con un
   `mv` por entrada de nivel superior, no atomico, y el SHA del pie de
   pagina y el de `/api/health` no coincidian justo en ese momento, con una
   latencia anormal (392 ms contra 1-4 ms normales)—. El usuario confirmo
   ("SI") que recargar la pagina lo resolvio, y no volvio a repetirse en el
   resto de la sesion. Diagnostico dado por bueno; si vuelve a pasar de
   forma estable (no solo una vez, tras un recargar), investigar mas a
   fondo en vez de asumir la misma causa.

9. ~~**Cronograma: demasiada informacion antes de llegar a la tabla, al
   generar la EDT desde presupuesto**~~ **HECHO el 21 de agosto de 2026.**
   El usuario reporto (captura en mano) que al generar la EDT y entrar a
   `cronograma` tenia que desplazarse mucho para llegar a la tabla donde de
   verdad se cargan las fechas. Causa: `generarEdtDesdePresupuesto` marca
   cada tarea `sinProgramar: true` con la fecha de inicio de obra como
   relleno, y la pantalla mostraba igual las ocho tarjetas analiticas
   (curva, EVM, ritmo, hitos, hitos propuestos, que frena la obra, ruta
   critica, avance por capitulo) aunque no tuvieran ninguna fecha real que
   medir. Se anadio `TareaDelPlan.sinProgramar` a `cronograma.service.ts` y
   en la pantalla (`obras/[id]/cronograma/page.tsx`) esas ocho tarjetas y
   el aviso de desajuste de plazo se ocultan mientras TODAS las tareas
   sigan sin programar, con un mensaje que apunta a la tabla de abajo. En
   cuanto una sola tarea tiene fecha real, todo vuelve a aparecer.

10. ~~**Fechas opcionales en la plantilla de presupuesto, hasta la
    EDT.**~~ **HECHO el 21 de agosto de 2026.** La plantilla de la meta
    (`/plantilla-meta`, hoja "Costo Directo") gano dos columnas opcionales
    al final, "Fecha Inicio" y "Fecha Fin" — al final a proposito, para no
    correr las referencias de columna de `formulaContractual`—. La fecha
    viaja intacta por el pipeline ya existente (`analizarExcel` →
    `PresupuestoMetaItem` → el contractual generado desde la meta →
    `WbsItem.fechaInicioPlan/fechaFinPlan`, dos migraciones aditivas) y
    `generarEdtDesdePresupuesto` la usa si esta: la tarea nace programada
    (`sinProgramar: false`) con su duracion real en dias laborables
    (`diasEntre`, ya existia), en vez del relleno de siempre. Sin fecha en
    el archivo, todo sigue exactamente igual que antes — confirmado con
    pruebas, no solo afirmado. `edtDesdePresupuesto` ahora conecta
    `subirFechas` (ya existia, nunca se usaba): un resumen toma la fecha de
    sus hojas programadas aunque solo alguna de ellas la traiga, el mismo
    criterio que ya usa la pantalla del cronograma (punto 9) para decidir
    cuando mostrar las tarjetas analiticas — las dos entregas encajan solas.
    La idea del contratista por RUC se dejo fuera a proposito, ver mas
    abajo.

11. ~~**Contratista por RUC en la plantilla de presupuesto**~~ **DESCARTADO
    el 21 de agosto de 2026, por decision del usuario.** No se sigue con
    esta idea.

12. ~~**Semaforo de salud de la cartera en el panel.**~~ **HECHO el 21 de
    agosto de 2026.** Se le mostraron al usuario varias referencias visuales
    (Triskell, dashboards de deliverables, informes semanales de una
    pagina); casi todo lo que traian ya existe en GCM con otra piel (curva
    S, avance por capitulo, informe semanal), salvo el semaforo de salud
    por obra — y ese YA estaba construido, solo que enterrado en
    `/gerencia` (`semaforoDeCartera`, SPI por duracion + color
    verde/ambar/rojo, con tope de `MAX_OBRAS_POR_CARGA` obras por carga).
    Se reuso el mismo servicio, sin logica nueva, en un componente
    compacto (`SemaforoCarteraPanel.tsx`): un punto de color y el SPI por
    obra, con enlace a Gerencia para el detalle de partidas criticas.
    `/gerencia` en si sigue igual — su rediseno de fondo (punto 1 del
    anexo anterior) sigue pendiente.

13. ~~**Prueba de extremo a extremo.**~~ **HECHA el 21 de agosto de 2026,
    en dos pasadas.** Primera pasada, permisos por rol vía
    HTTP real: cubre solo el ACCESO A PANTALLAS por rol, no los flujos de escritura completos
    (crear obra desde cero, ciclo completo de un encargo, etc.), que siguen
    pendientes. Metodo: sesiones fabricadas (mismo `hashToken` que usa el
    login real) para los 4 roles de prueba +RESIDENTE, contra
    "OBRA DE PRUEBAS (local)" y contra CRIOCORD (para probar aislamiento
    entre obras), pidiendo las paginas por HTTP y comparando con lo que
    `rbac.ts` dice que cada rol deberia ver. Sesiones borradas al terminar.

    **Resultado: CERO permisos rotos encontrados.** Cada caso que parecia
    sospechoso a primera vista resulto ser correcto al verificarlo:
    - El aislamiento entre obras funciona: los 4 roles con
      `obrasAsignadas` limitado a la obra de pruebas NUNCA vieron un dato
      real de CRIOCORD, ni en `/obras/[id]` ni en `/obras/[id]/movimientos`
      —siempre `notFound()`, nunca la pantalla con contenido ajeno—.
    - RESIDENTE y ADMIN_OBRA SI ven `/empresa/usuarios` (tienen
      `usuario:leer` en la matriz) y ALMACENERO/CONSULTOR no: la primera
      vez pareció un error, pero es exactamente lo que dice `rbac.ts`.
    - ADMIN_OBRA parecia bloqueado de `/obras/[id]/movimientos/nuevo` pese
      a tener `movimiento:crear`: no es permiso, es que la obra de pruebas
      no tiene linea base fijada todavia y esa pantalla redirige a
      cualquiera sin ella (`SinLineaBaseError`), sin mirar el rol.
    - Aviso de metodo para la proxima vez que alguien pruebe asi: en
      Next.js 16 dev, un `redirect()` llamado DESPUES de un `await` no
      manda un 307 limpio — manda HTTP 200 con un
      `<meta http-equiv="refresh">` embebido. Verificar con el codigo de
      estado a secas da falsos "todos entran"; hay que mirar el cuerpo.

    **Hallazgo de producto, confirmado y CERRADO**: el rol **ALMACENERO**
    hoy solo tiene `["obra:leer", "partida:leer"]` en la matriz — ni
    siquiera `proveedor:leer`, nada de contratistas, encargos ni ordenes de
    compra. El usuario confirmo el 21 de agosto de 2026 que es
    DELIBERADO: un rol minimo dejado para una fase futura, no un hueco que
    arreglar ahora. No tocar `rbac.ts` en este punto sin que el usuario
    pida ampliarlo primero.

    ~~Falta para completar esta prueba: los flujos de ESCRITURA
    completos~~ **HECHO el 21 de agosto de 2026**, con navegador real
    (Claude in Chrome) conectado a la sesion. Se recorrio el ciclo
    completo con clics reales: crear obra -> presupuesto meta con fechas
    -> generar contractual -> generar EDT (confirmo en vivo la
    funcionalidad de fechas del punto 10) -> revision y linea base ->
    iniciar ejecucion -> movimiento presupuestal (crear y aprobar) ->
    encargo a un proveedor real -> orden de compra (crear y aprobar, con
    la alerta real de sobregiro disparandose sola) -> parte del dia ->
    Last Planner completo (semana, compromisos con meta %, cierre con
    correccion manual, PPC 80% calculado correcto). Cero bugs reales de
    la app; un bug de entorno (el dev server con el Prisma Client viejo
    tras el `prisma generate` de la sesion, resuelto reiniciandolo) y dos
    comportamientos que parecian bug y resultaron ser diseño deliberado
    ya documentado en el codigo. Detalle completo en la memoria
    `e2e-golden-path-verificado` (`docs/memoria/`).

14. **`/operador` no tenia licencia, pago ni soporte — visto en vivo el 21
    de agosto de 2026, las dos entregas HECHAS el 22.** El usuario, mirando
    su propia pantalla de
    superadministrador (`/operador`, la lista de constructoras clientes),
    noto que no hay forma de saber COMO pago cada empresa, cuanto dura su
    licencia, ni de comunicarse con ellas (sin ticket de soporte, sin canal
    bidireccional), ni de dar de alta un acceso en modo demo. Confirmado
    leyendo el codigo: `Company` (`schema.prisma:116-205`) no tiene ningun
    campo de plan, vencimiento ni pago — la unica palanca es
    `activa: Boolean`, y el propio comentario de `operador/page.tsx:18-24`
    dice que la pantalla es deliberadamente minima ("solo metadatos... da
    de alta, corrige la identificacion y suspende"). Metido en la cola,
    sin folletear todavia — el usuario pidio guardarlo, no construirlo
    ahora. Se le planteo que son dos entregas de tamano muy distinto:
    - ~~**Registro manual de licencia** (chica): campos en `Company` como
      fecha de vencimiento, plan/modalidad ("Demo", "Anual") y notas de
      pago, visibles en `/operador/[id]`.~~ **HECHO el 22 de agosto de
      2026.** `Company` gano `licenciaModalidad`, `licenciaVence` y
      `licenciaNotas` (los tres opcionales, sin backfill), editables desde
      un bloque propio en `/operador/[id]`
      (`editarLicenciaConstructora`/`LicenciaConstructora.tsx`), aparte
      del bloque que corrige identificacion: uno valida con
      `validarAltaEmpresa`, esto no valida nada de negocio porque no hay
      ninguna pasarela detras que lo exija. Sin integrar pago de verdad,
      tal como se pidio — solo deja anotar lo que ya se sabe por fuera.
      **A proposito no bloquea con la empresa congelada** (a diferencia de
      `editarConstructora`): no es un dato que viaje en la copia
      exportada, es contabilidad del operador sobre la relacion comercial,
      y bloquearlo obligaria a descongelar una empresa justo para anotar
      que se le vencio la licencia. **A proposito no toca `activa`**: una
      licencia vencida no suspende sola, eso lo sigue decidiendo el
      operador a mano — fingir ese automatismo prometeria un cobro que
      este registro no hace. Verificado con 17 pruebas en el archivo (7
      nuevas), typecheck, lint, build y `scripts/humo.ts` en verde.
    - ~~**Canal de soporte/tickets** (grande): un sistema de mensajeria
      nuevo entre el operador y cada constructora.~~ **HECHO el 22 de
      agosto de 2026.** Investigado antes de construir (dos agentes de
      exploracion en paralelo) que la referencia original a
      "ContactoAviso/MensajeSms" ya no era exacta —`ContactoAviso` es un
      listado de contactos externos por obra, sin relacion con esto— y
      que esta es la PRIMERA pieza del sistema que se lee y se escribe
      legitimamente desde los dos lados de la pared operador/empresa:
      `aislamiento.test.ts` (la prueba que impide fugas entre empresas)
      estructuralmente no cubre sesiones `esOperador`, asi que hizo falta
      una prueba de aislamiento propia para este modelo, no reusar esa.
      `MensajeSoporte` (`prisma/schema.prisma`) es un hilo CONTINUO por
      empresa —sin estado de ticket (abierto/cerrado/prioridad), que no
      se pidio—, con permiso nuevo `soporte:usar` (innegociable, como
      `configuracion:editar`) del lado empresa y `sesion.esOperador` del
      lado operador. A diferencia de `MensajeContratista` (para
      contratistas que NO son usuarios de GCM, con correo/SMS/WhatsApp),
      aqui los dos lados YA estan logueados en GCM: el canal vive DENTRO
      de la app —badge de no-leidos real en el menu de "Empresa"
      (`EnlaceEmpresa.badge`, mecanismo que ya existia y no se uso hasta
      ahora) y en la lista `/operador`— con un correo de aviso
      best-effort como recordatorio ("tienes un mensaje nuevo, entra a
      verlo"), nunca como el canal en si: sin IMAP, sin token de hilo por
      correo, sin SMS ni WhatsApp — complejidad de `MensajeContratista`
      que aqui no hacia falta. `src/services/soporte.service.ts` tiene
      funciones SEPARADAS y EXPLICITAS por lado (nunca una funcion con
      una rama interna que decida el permiso segun `esOperador`), y el
      lado operador exige el `empresaId` de forma explicita en cada
      llamada. Verificado con 13 pruebas nuevas (aislamiento entre
      empresas verificado de forma explicita, no solo asumido),
      typecheck, lint, build y `scripts/humo.ts` en verde.

      **Verificado en navegador real el 22 de agosto de 2026** (con
      Claude in Chrome) y cazo un bug de verdad, no hipotetico: la
      empresa propia del operador SI puede escribir a soporte —nada en
      `/empresa/soporte` se lo impide, es el mismo enlace que ve
      cualquier otra empresa—, la insignia de `/operador` SI contaba ese
      mensaje como sin leer, pero la ficha ocultaba el bloque de Soporte
      para `esLaPropia` "porque no tiene sentido hablar con uno mismo":
      un mensaje real, contado como pendiente, sin ningun sitio donde
      leerlo ni contestarlo. Se probo en vivo —se escribio un mensaje
      real, la insignia aparecio, se abrio la ficha y el bloque no
      estaba— antes de arreglarlo: se quito la exclusion de `esLaPropia`
      para `SoporteConstructora` (a diferencia de suspender/eliminar, que
      si siguen sin ofrecerse ahi, porque esas si son actos sobre un
      tercero). Round-trip completo verificado en vivo despues: empresa
      escribe -> aparece en `/operador` -> operador lo lee (marca
      `leidoPorOperadorAt`) y responde -> la respuesta aparece en
      `/empresa/soporte`.

    **Lo que queda sin tocar de este hallazgo**: "dar de alta un acceso
    en modo demo" no se construyo — las dos entregas de hoy fueron
    licencia (registro manual) y soporte (mensajeria); un flujo de alta
    en modo demo es una pieza distinta, sin disenar todavia.

15. ~~**Cobertura de pruebas para las funciones que dependen de
    `sesion.esOperador`.**~~ **HECHO el 22 de agosto de 2026.**
    `aislamiento.test.ts` (la prueba que impide fugas entre empresas)
    estructuralmente NO puede cubrir estas funciones —legitimamente no
    filtran por el `companyId` de quien pregunta, es la sesion del
    OPERADOR mirando la empresa de un tercero—, asi que hacia falta un
    contrato aparte. `src/services/esOperador-guarda.test.ts` (nuevo)
    formaliza un contrato general reutilizable, mismo metodo que
    `empresa-congelada.test.ts` (lee el codigo como texto, no lo
    ejecuta): un registro (`FUNCIONES`) declara que funciones de que
    archivos deberian tener la guarda, y la prueba confirma dos cosas —
    (1) cada funcion registrada contiene `sesion.esOperador` ANTES de su
    primera llamada a Prisma, y (2) ninguna funcion de
    `src/services/*.service.ts` que SI menciona `sesion.esOperador` se
    quedo fuera del registro, barriendo el directorio entero—. La
    segunda mitad se probo de verdad, no solo se escribio: se quito
    `contadorSoportePorEmpresa` del registro a proposito, la prueba fallo
    nombrando exactamente esa funcion, y se devolvio. Cubre las 6
    funciones de `operador.service.ts`, `motivoSiNoSePuedeBorrar` de
    `empresa-borrado.service.ts` y las 3 del lado operador de
    `soporte.service.ts`. 12 pruebas nuevas, typecheck, lint y build en
    verde.

**Avisado, no pedido todavia**: pagina de marketing y venta, exponer la app
web y la autoinstalable (`docs/instalable.md` ya documenta esta ultima),
creacion de usuarios/reportes de cara al negocio, y migracion a otro hosting
y dominio. El usuario dijo explicitamente que por ahora es aviso de lo que
se viene, no trabajo de esta sesion.

## Lo ultimo: 297 commits que este documento no habia visto (21 de agosto)

Entre el 12 y el 21 de agosto entraron **297 commits** y este documento se
quedo en el 12. **Lo construido esta en el anexo «del 11 al 21 de agosto» de
[`ESTADO.md`](ESTADO.md)**; aqui solo va lo que sigue abierto.

Dos avisos antes de leer nada de mas abajo:

> **El presupuesto cambio de sentido el 20 de agosto.** Ya no se importa el
> contractual: se carga el REAL y el contractual se genera desde el. La
> pantalla `/obras/[id]/importar` **ya no existe**, asi que todo lo que la
> seccion 6 dice sobre el importador describe un flujo retirado.

> **Los gastos generales dejaron de ser de la obra el 21 de agosto.** Con
> ellos se retiraron la pantalla del criterio, `criterio-obra.service`,
> `bolsa-gastos-generales` y `deficit-estructura`. Nada de eso existe ya.

### Lo que hay que mirar primero

> **Del 21 de agosto: el despliegue estuvo dos horas sin poder aplicarse y la
> culpa era de la palabra `localhost`. La base NUNCA se cayo** —el diagnostico
> de «parpadeo transitorio de MariaDB» que estuvo escrito aqui era falso—. El
> relato con las medidas esta en la seccion 17 de [`ESTADO.md`](ESTADO.md).
>
> ~~Cambiar `localhost` por `127.0.0.1` en el `DATABASE_URL` de la app.~~
> **HECHO**, en *cPanel > Setup Node.js App*. `getent hosts localhost` en ese
> servidor devuelve **solo `::1`**, y MariaDB no atiende por IPv6. De regalo, la
> latencia de `/api/health` **paso de 273 ms a 1 ms**: la aplicacion llevaba
> meses pagando el intento IPv6 fallido en cada conexion sin que nadie lo
> relacionara.
>
> > **REGLA: NUNCA `localhost` en una URL de base en este hosting. Siempre
> > `127.0.0.1`.**
>
> ~~Corregir el comentario de `desplegar.sh`.~~ **HECHO**: afirmaba que el
> `DATABASE_URL` salia de `~/.gcm-despliegue.env`, y no es cierto —el selector
> de Node de CloudLinux pisa el entorno del shell en todo proceso `node`, asi
> que esa linea es decorativa y Prisma lee siempre la de cPanel—. Buscar el
> fallo en ese archivo costo horas.
>
> ~~**Que `desplegar.sh` DEVUELVA el paquete a `gcm.tar.gz` cuando
> `migrate deploy` falle**~~ **HECHO el 21 de agosto de 2026.** Antes dejaba
> `gcm.tar.gz.desplegando` esperando a que una persona entrara al servidor a
> renombrarlo; ahora `devolver_paquete()` lo hace sola en cuanto la migracion
> falla (y tambien si no se puede crear `.siguiente`). Reintenta hasta 30 veces
> —una por minuto de cron, ~media hora— y si se agotan **deja de tocarlo y lo
> dice en la bitacora**, para no encadenar arranques de Prisma sin fin como el
> `nproc` que se agoto el 21. La cuenta vive en `tmp/intentos-migracion`, va
> ligada al paquete concreto (tamano+fecha) para no arrastrarla a una subida
> nueva, y se borra sola al aplicar bien.
>
> Lo que NO se puede hacer sigue igual: aplicar el paquete sin migrar. Codigo
> nuevo contra tablas viejas tira la aplicacion entera, que es el fallo que la
> receta de cambio de esquema lleva meses evitando.
>
> ~~**El texto que el workflow imprime al fallar induce al error.**~~ **HECHO
> el 21 de agosto de 2026.** Decia «el paquete llego pero el CRON no lo
> aplico» como lectura unica; ahora manda a `tail -40 tmp/despliegue.log`
> primero y distingue las causas que esa bitacora puede decir (cron parado,
> migracion fallida, paquete roto, Node sin rehacer) de lo que solo dice
> `/api/health` (que hay algo pendiente, no por que).
>
> ---
>
> **Reglas nuevas para tocar el despliegue a mano** (hallazgo 3 de ese dia):
>
> - **No encadenar intentos manuales de `desplegar.sh`.** Cada intento fallido
>   deja zombis —`bash`, `npm exec`, `node`, el schema-engine de Prisma— y con
>   varios acumulados se agota el **`nproc` de LVE**: `node` deja de poder crear
>   hilos y muere con `pthread_create: Resource temporarily unavailable` /
>   `Aborted (core dumped)`, codigo 134, en 0,4 s. **No es memoria** —habia
>   86 GB libres—, y por eso engana.
> - **Lanzarlo con `nohup`**: sin el, muere con la sesion (SIGHUP) y deja mas
>   restos.
> - **Limpiar con `pkill -f prisma` antes de reintentar. NUNCA `pkill node` a
>   secas: ahi vive la aplicacion.**
> - **Ante la duda, dejar que lo haga el cron solo.**
>
> **Correcciones de metodo, que valieron mas que el arreglo:**
>
> - **Se dieron por buenas TRES causas falsas antes de la correcta**: cron roto,
>   desajuste de host entre cron y app, y parpadeo de la base. **Lo que las
>   descarto fue MEDIR, no razonar**: `getent hosts localhost` tumbo la caida de
>   la base, el `MARCADOR` en `node -e` tumbo que `~/.gcm-despliegue.env`
>   pintara algo, y `ps -u` con `etime` tumbo que los intentos manuales fueran
>   inocuos. Cuando un sintoma sobrevive a dos diagnosticos, deja de pensar y ve
>   a medir en la maquina.
> - **No relanzar un despliegue «por si acaso»** sin saber la causa: se hizo, y
>   fallo exactamente igual.
> - **El texto que el workflow imprime al fallar induce al error**: dice «el
>   paquete llego pero el CRON no lo aplico» como unica lectura de un sintoma
>   que tiene varias causas. Conviene arreglarlo.
> - Por si alguien la busca: **el aviso de la seccion 0 —«vigilar que el cron
>   exista»— NO se ha cumplido**. El cron existe y funciona.

1. ~~**`835d988 WIP antes de reinstalar Claude` quedo a medias.**~~ **CERRADO
   el 21 de agosto de 2026.** Ya no queda nada sin terminar en el
   repositorio.

   Lo que hizo el WIP: `ValorizacionEncargo` gana `projectId`, `numeroObra` y
   `numeroEncargo`. **Dos series independientes**: la de la OBRA —que es EL
   numero del papel, porque el documento lo emite la obra— y la del ENCARGO,
   que es por encargo y no por proveedor, porque el mismo contratista puede
   llevar dos frentes en la misma obra. La migracion esta escrita a mano
   porque ademas RELLENA las que ya existian, ordenando por `fecha`,
   `createdAt` e `id` —el tercer desempate no es adorno: sin un criterio
   total, `ROW_NUMBER` podria dar dos ordenes distintos en dos ejecuciones—.
   `valorizarEncargo` asigna los dos dentro de la transaccion y captura el
   P2002 con un mensaje que invita a repetir.

   **Lo que faltaba y ya esta:**

   - **Las pruebas del comportamiento nuevo**, cinco, sobre el andamio que el
     WIP dejo montado y sin usar (`estado.puerta` y `choqueDeUnicidad`): que
     las dos series avanzan por separado, que cada una mira SU alcance
     —`projectId` una, `encargoId` la otra—, que el corte guarda la obra del
     encargo, y dos del choque de unicidad, una por cada carrera real (dos
     personas en la misma obra, dos en el mismo contrato). **La del cruce de
     alcances se comprobo mutando el servicio a proposito**: cambiar el
     `where` de la serie de obra por `encargoId` la hace fallar, que es la
     unica forma de saber que una prueba muerde.
   - **Los dos numeros se leen y se ven.** `obtenerEncargo` y
     `listarEncargos` los piden, `EncargoDetalle.valorizaciones` los lleva, la
     tabla «Historial de valorizaciones» abre con una columna «N.º» —el de
     obra grande, el del encargo entre parentesis, con una linea que explica
     cual es cual— y la tarjeta del encargo dice «Última valorización N.º 12 …
     · 3.ª de este encargo» en vez de solo la fecha.
   - `avanceVigente` (`@/lib/encargos`) pasa a ser **generica sobre la fila**,
     para devolver la MISMA que entro con los correlativos encima. Fijada en
     `Valorizacion` a secas obligaba a volver a buscar la fila por fecha, que
     es como dos elecciones de «la vigente» acaban discrepando.
   - De paso, ese commit arrastra un `prisma format` que reflujo
     `schema.prisma` entero y **quito las lineas en blanco de los comentarios
     largos**. Es ruido, no un fallo, pero explica por que el diff del
     esquema son 220 lineas. Se deja como esta: revertir el reflujo seria
     otro diff de 220 lineas por nada.

   > **NO EDITAR ARCHIVOS DEL PROYECTO CON `Get-Content`/`Set-Content` DE
   > POWERSHELL.** Cerrando esto se hizo para una prueba de mutacion y
   > destrozo `encargos.service.ts` entero: PowerShell 5.1 lee sin BOM como
   > ANSI y `Set-Content -Encoding utf8` escribe CON BOM, asi que cada tilde,
   > cada comilla angular y cada raya larga salio recodificada —incluido un
   > mensaje que ve el usuario—. `tsc`, `eslint` y las 2384 pruebas pasaron
   > igual: **esto no lo caza ninguna herramienta**, solo `git diff`. Se
   > recupero con `git checkout --` y rehaciendo las ediciones.

2. **Rotar la contrasena del FTP de produccion.** Hasta el 12 de agosto viajo
   en cada despliegue contra un extremo sin verificar. La verificacion ya
   esta puesta; la credencial sigue sin cambiar.

3. **Los umbrales de `lib/capacidad.ts` siguen sin contrastar con datos.** El
   20 de agosto la sobrecarga se movio de 1,3 a 1,4 por criterio, no por
   medicion. `storage/contrastar-umbrales.ts` responde cuando haya suficientes
   semanas cerradas.

4. ~~**GCM no calcula ruta critica ni holgura.**~~ **HECHO el 21 de agosto
   de 2026, en dos pasadas.** `src/lib/ruta-critica.ts` (nuevo): CPM
   completo —pasada hacia adelante y hacia atras, los cuatro tipos de
   enlace FC/CC/FF/CF, deteccion de ciclos— mas `avanzarDiasLaborables` en
   `lib/calendario.ts` (la pieza de fechas que faltaba).

   **Primera pasada, el importador de Excel**: si el archivo trae la
   columna "Depende de" llena, `esCritico`/`holguraDias` salen calculados
   de verdad en vez del relleno fijo de siempre; sin dependencias, el
   comportamiento no cambia. Corre con un calendario sintetico (todos los
   dias laborables) porque las cifras que devuelve son medidas RELATIVAS
   —no cambian con el calendario real mientras se use el mismo en toda la
   cuenta—, lo que evito tener que enhebrar la sesion/obraId por las tres
   acciones de servidor que llaman al analizador. Con esto, la regla de
   convergencia de los hitos predictivos (`porConvergencia`) ya puede
   dispararse sola para un Excel con la columna llena, sin haberla tocado:
   solo necesitaba que `DependenciaTarea` tuviera filas, no `esCritico`.

   **Segunda pasada, el editor de dependencias para tareas tecleadas a
   mano** (`cronograma-manual.service.ts`,
   `TareasAMano.tsx`): el formulario de "Escribir una tarea a mano" ya deja
   marcar de que tareas depende (siempre fin-comienzo, sin desfase — la
   relacion mas comun con diferencia; quien necesite comienzo-comienzo,
   fin-fin o un desfase sigue teniendo el Excel o MS Project). Cada alta,
   edicion o borrado recalcula `esCritico`/`holguraDias` de todo el
   cronograma, esta vez con el calendario y la fecha de inicio REALES de la
   obra (aqui si hay sesion/obraId a mano). Solo se escriben filas
   `origen: MANUAL`: una tarea manual puede depender de una importada para
   situarse contra el plan real, pero lo que trajo un archivo nunca se pisa
   con un calculo propio. La tabla ya muestra la bandera de "en la ruta
   critica" y los dias de holgura cuando se conocen (mismo icono que
   `TablaCronograma.tsx`).

   **Tercera pasada, la EDT generada desde presupuesto**
   (`generarEdtDesdePresupuesto`, `edt.service.ts`): al generarla no hay
   ruta critica que calcular —la estructura del presupuesto es jerarquia
   (capitulo/partida/subpartida), no precedencia, y eso sigue sin
   inventarse—, pero se confirmo investigando que sus tareas nacen con
   `origen: "MANUAL"`, EXACTAMENTE el mismo valor que las tecleadas a mano
   (`edt.service.ts:378,449`). El editor de dependencias de la segunda
   pasada ya filtra y escribe por ese campo, no por como nacio la fila:
   basta con editar una tarea de la EDT desde `TareasAMano` (el lapiz de la
   tabla; el propio servicio ya avisaba de esto de antes, en el comentario
   de "sinProgramar: false" de `editarTareaManual`) y marcar de que depende
   para que la ruta critica se calcule para toda la red, sin haber
   escrito ninguna linea nueva de backend. Lo unico que hacia falta era
   que la lista de "Depende de" siguiera siendo usable con cientos de
   filas (una EDT real, ver "368 tareas" en `plantilla-cronograma`): se le
   anadio un buscador por codigo o nombre (mismo patron que
   `MapeoTareas.tsx`), visible solo cuando hay mas de 8 candidatas.

5. ~~**Lo que quedo abierto de la auditoria del 10 de agosto**~~ (seccion 6c)
   **CERRADO el 21 de agosto de 2026**: los puntos 3, 4, 5, 6, 10, 11 y 12
   se resolvieron esa tarde (el 10, "reabrir+reguardar borra cierre",
   arreglado; el 4, "eliminar semana deja huerfanos", arreglado; el 5, base
   vs vigente, aclarado en pantalla; el 6, hitos en el PPC, arreglado; el
   10 se reclasifico como no-bug; el 11, subtotales, arreglado; el 12,
   vocabulario, corregido en los tres sitios encontrados). Ver la seccion
   6c mas abajo para el detalle completo.

6. ~~**El enlace del correo sigue aterrizando en el login y no vuelve a la
   obra.**~~ **HECHO el 21 de agosto de 2026.** `proxy.ts` ahora manda a
   `/login?siguiente=<ruta>` en vez de a `/login` a secas, y ese destino cruza
   el formulario (campo oculto, porque el envio es un Server Action) y el
   paso de 2FA si lo hay, hasta terminar en `redirect(siguiente ?? "/panel")`.

   La validacion vive en `src/lib/siguiente.ts` (`rutaSiguienteSegura`) y es
   la unica frontera de seguridad del mecanismo: `siguiente` viaja en una URL
   de correo y vuelve como dato de formulario, asi que lo escribe quien
   visita el enlace, no la aplicacion. Sin exigir que empiece por una UNICA
   barra —rechazando `//host` y `/\host`, que el navegador lee como
   protocolo-relativos— seria una redireccion abierta: cualquiera podria
   mandar `.../login?siguiente=https://otro-sitio` y usar el dominio de
   confianza de GCM como trampolin de phishing.

   **Lo que queda fuera, a proposito:** el cambio de clave obligatorio
   (`mustChangePassword`) sigue sin cargar `siguiente` —cae siempre a
   `/panel`—. Es la rama de quien recien se dio de alta, que raramente es
   quien recibe un aviso de obra por correo; ampliarla exigia tocar tambien
   `cambiar-clave` y no parecio que pagara su complejidad para ese cruce.

7. ~~**Notas y Recordatorios (seccion 5) no se empezo.**~~ **Notas E1
   entregada el 21 de agosto de 2026**: modelo, migracion, permisos
   `nota:leer/crear/gestionar`, servicio, pestana en la obra y widget de
   "Proximos recordatorios" en el tablero.

   **Notas E2 (adjuntos y notificaciones) entregada el 22 de agosto de
   2026**, sobre lo que E1 ya dejo listo:
   - **Adjuntos**: modelo `AdjuntoNota` (id, notaId, projectId, ruta,
     nombreOriginal, mimeType, tamano, subidaPor) — mismo patron que
     `FotoEvidencia`, pero `onDelete: Cascade` en vez de `SetNull`: un
     adjunto de Nota es contenido de autor, no evidencia de auditoria
     inmutable, y vive y muere con la nota. Imagenes (JPG/PNG/WebP) o PDF,
     hasta 10 MB. El archivo vive en `STORAGE_ROOT/notas/<obra>/<id><ext>`,
     fuera del arbol de la app. Se sirve por `GET /api/notas/[id]`, con
     sesion + `nota:leer` + empresa comprobados, igual que
     `api/evidencia/[id]`. Subir y borrar exigen `nota:gestionar` —la misma
     puerta que editar el texto—.
   - **Notificaciones**: nuevo evento `NOTA_VENCIDA` en `EventoAviso`.
     `avisos-notas.ts` (nuevo, mismo molde que `avisos-valorizacion.ts`:
     solo campanita, sin correo ni SMS) escribe un aviso por cada nota
     vencida y sin atender, una vez al dia mientras siga asi, a los
     residentes asignados (o a los ADMIN_OBRA si no hay ninguno). Se llama
     desde `pasadaDeObra` en `avisos-reloj.ts`, ANTES de mirar hitos y
     restricciones abiertas —a diferencia de `avisarValorizacionesPendientes`,
     que queda colgada de esa comprobacion y no suena en una obra sin
     ninguno de los dos—: una obra puede usar solo la bitacora libre, y
     colgar el aviso de notas del mismo sitio la habria dejado muda.

   Sin test de disco (subir/borrar el archivo de verdad): mismo alcance
   que tiene hoy `evidencia.service.ts`, que tampoco prueba su propio
   camino de escritura. Si cubre las guardas (permiso, obra cerrada,
   nota/adjunto inexistente, tipo y tamano) y el aviso completo
   (`avisos-notas.test.ts`, 8 pruebas). No se pudo verificar en navegador
   real esta sesion.

8. ~~**Skills propias de GCM**: sigue sin plan escrito.~~ **HECHO el 21 de
   agosto de 2026**: plan en [`skills-gcm.md`](skills-gcm.md) y las tres
   skills ya escritas en `.claude/skills/` —`gcm-limites-de-capas`
   (Decimal, permisos en dos capas, filtro de empresa desde la sesion),
   `gcm-despliegue` (el runbook FTP+cron, `/api/health`, el criterio G6) y
   `gcm-nuevo-servicio-y-pantalla` (el recorrido de tres capas, idioma,
   comentarios, pruebas que muerden)—.

---

## Lo ultimo: el pase de obra ya se puede usar (11 de agosto)

Se cerraron **las pantallas del pase** (seccion 6e), que era lo siguiente en
el orden acordado. El recorrido entero esta verificado en el navegador contra
CRIOCORD; lo unico que no se pudo probar desde aqui es adjuntar un archivo de
verdad, que hay que hacer a mano desde un telefono.

La **cola de SMS con la linea propia ya funciona y esta probada de punta a
punta** (11 de agosto, mensaje recibido en un telefono real). Lo que costo
hacerla llegar no fue la cola sino una instancia vieja: ver el aviso de mas
abajo.

**LO SIGUIENTE, ACORDADO EL 11 DE AGOSTO, EN ESTE ORDEN:**

1. ~~**Segundo factor por SMS.**~~ **HECHO el 12 de agosto**, ver 6f. La
   **recuperacion de clave se dejo fuera a proposito**: por SMS no puede ser
   el enlace de ahora —una URL larga, y las operadoras marcan como spam los
   SMS con enlaces—, asi que hay que rehacerla con codigo y pantalla nueva.
   Es otro trabajo, no un cambio de canal.
2. ~~**Tablero de configuracion de la empresa.**~~ **HECHO el 12 de agosto**,
   ver 6g. Con la cola de SMS ya separada por empresa, que era el bloqueo real
   para vender a una segunda constructora.
3. ~~**Cablear `scripts/desplegar.sh`.**~~ **HECHO el 12 de agosto**, ver la
   seccion 1. `app.js` ya no descomprime: lo hace el cron con el script, que
   es quien sabe hacerlo sin cronometro. Lo que hay que vigilar ahora es que
   el cron exista, y eso se ve con un `curl` a `/api/health`.
4. ~~**Las restricciones del Lookahead se eligen, no se siembran.**~~ **HECHO
   el 11 de agosto**, puntos 1 a 4 de lo que pidio el usuario final. Ver la
   seccion 6h.
5. ~~**Avisar de las restricciones a los implicados**~~ **HECHO el 12 de agosto
   de 2026**, y verificado en produccion. Configurable en las tres formas
   —persona, rol de la obra, gente de FUERA de GCM— y en los cuatro momentos,
   por los tres canales. Piezas: `@/lib/avisos` (61 tests), `avisos.service`
   (configuracion), `avisos-envio` (reparto y reserva anti-duplicado),
   `avisos-reloj` + `POST /api/reloj` (lo unico de GCM que corre solo, con su
   cron en cPanel), y `avisos-bandeja` (la campanita).
   - **Lo que se ve desde fuera**: `/api/health` publica `reloj`, y distingue
     `nunca` (falta la linea del cron) de `parado` (existe y lleva media hora
     sin correr). Un cron de avisos que no existe **no lo echa de menos
     nadie**, porque lo que falla es justo lo que avisaba.
   - **Dos fallos reales que solo aparecieron al probar en produccion**:
     `/api/reloj` faltaba en `RUTAS_PUBLICAS` de `proxy.ts` y devolvia 307 al
     login —cron en verde y cero avisos, para siempre—; y la campanita no se
     actualizaba porque su cuenta vive en el LAYOUT y `revalidatePath` sin tipo
     solo refresca la pagina.
6. ~~**Los tres de la seccion 6i**~~ **HECHOS el 12 de agosto de 2026**, en el
   orden que fijo el usuario y todos despues de los avisos:
   - ~~Aviso de numeracion de semanas~~ → avisa al crear, con «Crearla igual» /
     «Cambiar la fecha». No renumera nunca: romperia las actas.
   - ~~El arrastre de lo incumplido~~ → `arrastreDeIncumplidos` en
     `@/lib/plan-semanal`, bloque «Viene de semanas anteriores» al planificar,
     y regla `incumplidos-sin-retomar` en «Que falta».
   - ~~El texto del PPC bajo~~ → `lecturaDelPpc`, tres tramos por umbral.
7. **El analisis de restricciones ya es un compromiso con fecha.** HECHO el 12
   de agosto de 2026. `Restriccion` gana responsable —usuario o alguien de
   fuera— y `fechaCompromiso`, mas `comprometidoAt`/`comprometidoPor`: en obra
   la promesa llega por telefono y la escribe el residente, y quien PROMETE no
   es quien ANOTA. Con eso aparece `cumplimientoDeLiberacion`, el PPC de la
   fase de preparacion. Reglas puras en `@/lib/lookahead-compromiso` (22 tests).
   - **Con cero prometidas el porcentaje es `null`, no 0.** "Nadie prometio" no
     es "todos fallaron": la misma confusion que tenia la confiabilidad antes
     de `analizadaAt`.
   - Lo que SIGUE ABIERTO de esto esta en el punto 8.

8. **Los hilos que quedaron abiertos el 12 de agosto**, en orden de lo que mas
   rinde primero:
   - ~~**El panel de auditoria de avisos**~~ **HECHO el 12 de agosto de 2026**:
     `avisos-auditoria.ts` + `RegistroAvisos.tsx`, en la pantalla de Personal
     debajo de la configuracion. Dice cuando, a quien, por donde, con que
     motivo y si salio, con el destino a la vista —que es lo que responde a
     "¿pero a que correo fue?"—.
     - **De "abierto" solo se dice la verdad donde se sabe**: en la campanita,
       que es una columna real. En correo y SMS **no se puede** sin un pixel
       que rastrea a quien recibe, y que ademas medio mundo bloquea: el dato
       mentiria por defecto y por exceso. La tabla dice "salio" de los tres y
       la lectura va aparte, solo de GCM. **No convertir esto en un porcentaje
       de apertura de correo por mucho que se pida.**
     - La lectura se cuenta por PERSONA y no por envio: `EnvioAviso` no apunta
       al `Aviso` que creo, y emparejarlos por fecha fallaria justo cuando dos
       caen en el mismo segundo.
   - ~~**El aviso al RESPONSABLE de cada restriccion**~~ **HECHO el 12 de
     agosto de 2026.** `repartirAvisos` acepta un cuarto argumento,
     `EncargoDirecto[]`: personas con SUS motivos ya acotados, que no pasan por
     `cubreFlujo` ni por `quiereEvento` —a quien se hizo cargo no se le
     pregunta si le interesa ese flujo—.
     - **La clave esta en DONDE se funden**: los encargos se acumulan en el
       mismo mapa por persona que las suscripciones, ANTES de armar los lotes.
       Asi quien llega por las dos vias recibe UN aviso con la union. Si cada
       via produjera su lote, serian dos correos con claves de `EnvioAviso`
       distintas y ni la reserva podria evitarlo. Hay test.
     - Los encargos van en el RECORDATORIO y no en el resumen del dia: el
       responsable ya recibio lo suyo por la manana, y repetirselo por la tarde
       es como se ensena a la gente a no leer los avisos.
     - **Sin SMS por defecto**, igual que `SuscripcionAviso.porSms`: detras hay
       una SIM que se paga y nadie pidio gastarla en su nombre.
   - **La campanita que no se encendio en la prueba del 12 de agosto**: sin
     diagnosticar, pero ya no hace falta SQL. El registro de la pantalla de
     Personal lo dice de una mirada: si hay una fila `correo` y ninguna `GCM`,
     el suscrito es un contacto externo y el comportamiento era correcto —los
     de fuera no tienen bandeja donde ensenarselo—.
   - ~~**El enlace del correo aterriza en el login y no vuelve a la obra.**~~
     **HECHO el 21 de agosto de 2026** — ver el punto 6 de la seccion de
     arriba, con el detalle completo (`?siguiente=`, `rutaSiguienteSegura`
     en `src/lib/siguiente.ts`, propagado por el paso de 2FA). Esta entrada
     habia quedado como "sigue igual" por no actualizarse el mismo dia que
     se arreglo — misma tarde, dos entradas del mismo hallazgo
     desincronizadas entre si.
   - ~~**Fase B: que el proveedor responda desde el correo.**~~ **HECHO el 19
     de agosto de 2026, y por otro camino.** No hizo falta enlace de un solo
     uso: `correo-entrante.service` LEE el buzon de la empresa por IMAP y ata
     la respuesta a su conversacion por el `Message-ID` que GCM puso al
     enviar. Se descarto la direccion marcada (`obras+TOKEN@`) porque depende
     de que el proveedor de correo acepte subdirecciones, y el que no las
     acepte rebota en silencio. **Si el token no aparece, la respuesta se
     guarda en la ficha del contratista SIN obra**: meterla en la obra
     equivocada es peor que no meterla.
     - Sigue en pie lo del PDF: `MIMES_PERMITIDOS` en `evidencia.service`
       sigue CERRADO a imagenes. Los PDF entran solo como constancia de pago,
       que tiene tabla y almacen propios.

9. **Skills propias de GCM** con `/batch`: una por dominio, cada una en su
   worktree. Investigacion hecha el 11 de agosto, plan sin escribir.
   **El plan se escribio el 21 de agosto**, ver el punto 8 de arriba y
   [`skills-gcm.md`](skills-gcm.md). Sigue sin escribirse ningun `SKILL.md`;
   `.claude/skills` solo tiene las de Prisma.

~~Y sigue sin existir el **parte diario**~~ **HECHO el 11 de agosto de 2026**
y muy crecido desde entonces: todas las partidas en un envio agrupadas por
capitulo (`lib/parte-diario.ts`), la regla de que una casilla vacia no escribe
nada, `+10` para sumar frente a `80` para dejar al 80%, aviso de avance fuera
del plan y fotos por partida y dia. Ver el anexo del 21 de agosto en
`ESTADO.md`.

> **DESPLEGAR CON LA APP ABIERTA ROMPE LA PESTANA** (visto el 11 de agosto).
> Sintoma: «This page couldn't load» al pulsar cualquier boton —le paso al
> usuario con «Salir» en `/panel`—. Causa: el navegador ejecuta una server
> action con el JavaScript de la compilacion vieja contra un servidor que ya
> tiene otra, y ese identificador ya no existe. NO es que produccion este
> caida: desde fuera responde 200 a todo. **Arreglo: `Ctrl+Shift+R`.**
> Conviene mirarlo ANTES de suponer que el render pesado corto el stream, que
> da el mismo texto en pantalla y se diagnostica muy distinto. Y no desplegar
> mientras alguien esta usando la aplicacion si se puede evitar.

> **EL CANDADO NO ESTA ARREGLADO. Se dio por arreglado y volvio a pasar la
> noche del 11 de agosto, con produccion caida.** Prueba, sacada del propio
> servidor: `tmp/candado-despliegue` y `gcm.tar.gz.desplegando` (22 MB) con la
> MISMA marca de tiempo, las 20:33. O sea el ciclo exacto de siempre: un
> arranque cogio el candado, empezo a descomprimir, LiteSpeed lo mato a los
> pocos segundos y quedaron el candado abandonado y el paquete a medias.
>
> **Consecuencia nueva y peor de lo que se creia**: el arbol `.next` quedo
> MEZCLANDO dos compilaciones, y eso rompio el LOGIN de toda la aplicacion —
> `POST /login` devolvia **404** porque el manifiesto de acciones era de una
> compilacion y el JavaScript de otra—. Desde fuera todo parecia sano: `GET
> /login` 200, `/api/health` 200 y los chunks en 200. Solo se ve enviando el
> formulario.
>
> **Recuperacion que funciono** (descomprimir a mano, que es lo unico sin
> cronometro):
> ```
> cd ~/gcm && tar -tzf gcm.tar.gz.desplegando > /dev/null && echo INTEGRO
> cd ~/gcm && rm -rf tmp/candado-despliegue .next \
>   && tar -xzf gcm.tar.gz.desplegando && rm -f gcm.tar.gz.desplegando \
>   && touch tmp/restart.txt
> ```
>
> **Lo primero que hay que hacer, ya sin discusion, es cablear
> `scripts/desplegar.sh`**: descomprime aparte, comprueba que el paquete trae
> `server.js` y `.next`, y solo entonces intercambia. Mientras no este, esto
> se repite en cualquier despliegue.
>
> Y el otro dato comprobado: el workflow reescribe `app.js` en CADA
> despliegue, asi que cualquier arreglo hecho a mano en el servidor sobre ese
> archivo dura hasta el siguiente push.

> **UNA INSTANCIA VIEJA PUEDE SOBREVIVIR DIAS SIRVIENDO CODIGO DE OTRA
> COMPILACION** (encontrado el 11 de agosto persiguiendo un SMS que no
> llegaba). Habia DOS `next-server` a la vez: uno de 4 minutos y otro de
> **26 horas**, los dos con `cwd` en `/home/drcacere/gcm`. Cada peticion caia
> en uno o en otro segun la suerte.
>
> **Es un problema DISTINTO del candado, y no estaba visto.** El candado
> impide que dos instancias descompriman a la vez; no impide que una
> instancia arrancada ayer siga viva con el arbol de ayer en memoria. Explica
> el 404 del login de anoche mejor que ninguna otra cosa, y explica que un
> SMS saliera unas veces si y otras no.
>
> **`touch tmp/restart.txt` NO se la llevo**: Passenger no la estaba
> gestionando. Hubo que `kill <pid>` a secas (sin `-9`); Passenger levanta
> una nueva con la siguiente peticion y el corte son un par de segundos.
>
> Como mirarlo, y conviene hacerlo despues de cada despliegue:
> ```
> ps -u "$USER" -o pid,etime,cmd | grep next-server | grep -v grep
> ls -l /proc/<pid>/cwd     # confirmar que es GCM y no la otra app
> ```
> Mas de un proceso, o uno con horas encima justo despues de desplegar, es el
> sintoma. **Ojo**: la cuenta tiene otra aplicacion (`preanestesia_venv`,
> Python), asi que no todo proceso ajeno es de GCM —por eso el `cwd`—.

## Lo que dejo la sesion de la noche del 10 de agosto

Empezo por la evidencia fotografica y acabo siendo, sobre todo, una
**auditoria del sistema entero**. Cinco commits, todos verificados con `tsc`,
`eslint`, `vitest` y `next build` antes de empujar:

| Commit | Que |
|---|---|
| `5fb2971` | Evidencia: el clip adosado al dato (Lookahead, cierre del PTS y semana cerrada) |
| `04ca086` | UN solo QR por obra + menu para el telefono de campo, y visor emergente de fotos |
| `694cbe6` | **El cierre de semana ya no da la tarea entera por terminada** |
| `002f8bd` | **Una sola definicion de presupuesto**, y el BAC cuenta los adicionales |
| `93b1ee0` | Panel «Que falta» en el tablero |
| `a8092a8` | Pase de obra con OTP (backend; faltan pantallas) |

**El hallazgo de la noche**, y la frase que resume las tres auditorias:

> Las formulas estan bien y centralizadas. Lo que falla son las COSTURAS:
> que valor se escribe por defecto, que sobrevive a reabrir o eliminar, y que
> conjunto de tareas alimenta cada numero.

De ahi salio el peor defecto que ha tenido el sistema: cerrar una semana
escribia **100 % de avance fisico** cuando el campo iba vacio, con lo que un
PPC honesto producia una curva S falsificada al alza. Comprobado en
produccion antes de tocar: cero avances afectados. Detalle en 6c.

Se comprobo tambien, ANTES de cambiar nada, que el doble conteo del
presupuesto **no afecta a los datos actuales** (la consulta de grupos con
importe propio e hijas costeadas devolvio cero filas). Las correcciones son
red de seguridad para el proximo presupuesto y para la primera constructora
cliente.

**Lo que sigue, en el orden acordado con el usuario**: (1) terminar las
pantallas del pase con correo + codigo en pantalla —ver 6e—; (2) la cola de
SMS con la linea propia; (3) el **parte diario**, que no existe y es el
Bloque 1 entero de la matriz de control que el usuario describio —mano de
obra, equipos, metrado del dia—, y lo que le falta a GCM frente a Foco en
Obra.

**Sin conectar todavia**: `subtotalesPorRama` (`jerarquia-partidas.ts`), que
resulta ser el «costo por frente de obra» del esquema del usuario. Ver 6c,
punto 11.

**Lo que esta sesion dejo EN PRODUCCION, verificado**: candados de obra
CERRADA en todos los servicios de escritura; requisitos para pasar a
EN_EJECUCION; curva EVM con cursor arrastrable y lectura en soles; la RUTA DE
LA OBRA (riel de ubicacion, `RutaObra` + `hitosDeObra`); tablero corregido
(Lookahead en neutro, PPC/Causas reconciliados, jerga fuera, ordenes
compacta) + tarjeta nueva de VALOR GANADO (SPI/CPI); portada del login con
carrusel de frases; frase rotativa en la cabecera (color de paleta, sombra);
ortografia tandas 1-2 (109 archivos); plantilla de Excel descargable con
test de ida y vuelta (`/plantilla-presupuesto`); y el cimiento de la
evidencia fotografica (ver seccion 4). Decisiones tomadas: sin LLM local
(6b), plan de Notas (5), plan de evidencia con QR (4).

> **RECETA PARA EL PROXIMO CAMBIO DE ESQUEMA** (se uso el 10 de agosto para
> `fotos_evidencia` y funciono sin un minuto de caida).
>
> **No sirve correr `migrate deploy` antes del push**: las migraciones
> viajan DENTRO del paquete desplegado, asi que hasta que el deploy entre no
> hay ningun archivo que aplicar en el servidor —se intento y respondio
> `Could not find Prisma Schema`—. Y no se puede empujar primero: si el
> codigo nuevo consulta una tabla que aun no existe, se cae la app ENTERA,
> no solo la pantalla nueva.
>
> La salida, como dice `infraestructura.md`, es romper el empate a mano:
>
> 1. Crear la tabla en phpMyAdmin con el SQL de `prisma/migrations/<la
>    migracion>/migration.sql`, **antes** del push. El codigo viejo no la
>    mira, asi que no rompe nada.
> 2. Empujar y esperar el deploy.
> 3. Cuadrar el registro de Prisma para que no intente recrearla:
>    `npx --yes prisma@7 migrate resolve --applied <nombre_de_la_migracion>`
>    (antes: `source ~/nodevenv/gcm/22/bin/activate && cd ~/gcm`).
> 4. Comprobar en prod que el CSS y los chunks de JS responden 200, no solo
>    que la pagina carga: el deploy tiene el vicio de dejar caer archivos.

**Sigue pendiente del usuario**: fotos para `public/portada/` (1.jpg-12.jpg),
las frases de "Frases sobre el deber.docx" (pasar a .txt o pegar en el chat),
y probar en prod el ciclo de la plantilla (descargar - llenar - importar).

> **Antes de tocar el despliegue, lee el incidente del 10 de agosto en
> `ESTADO.md`.** Dos horas de caida por dos causas que no eran las que
> parecian.

---

## 0. El candado de despliegue — RESUELTO el 12 de agosto

> **Ya no hay candado en el arranque, porque el arranque ya no descomprime.**
> `app.js` se quedo solo con arrancar el servidor; el paquete lo aplica
> `scripts/desplegar.sh` desde un cron cada minuto. Un cron no tiene
> cronometro, que era el problema de fondo: descomprimir son 16 segundos y
> LiteSpeed corta el arranque mucho antes.
>
> Con eso desaparecen de golpe los tres sintomas de estos dias: despliegues en
> verde que no se aplicaban, el arbol mezclando dos compilaciones, y el
> candado abandonado que bloqueaba los siguientes.
>
> **Lo que hay que vigilar ahora es otra cosa: que el cron exista.** Si no
> corre, no se aplica nada. Se ve desde fuera, sin entrar al servidor:
> `curl -s https://gcm.drcaceresruiz.com/api/health` responde
> `"despliegue":"pendiente"` cuando hay un paquete sin aplicar, y trae ademas
> el SHA de la compilacion viva.
>
> Dos cosas del cambio que no son evidentes y conviene no deshacer: el paquete
> se sube como `gcm.tar.gz.subiendo` y se renombra al final —durante la subida
> de 20 MB el archivo existe y esta a medias, y el cron lo cogeria roto—, y el
> workflow ya NO sube `tmp/restart.txt`, porque el reinicio tiene que pedirse
> DESPUES del intercambio y lo hace el script.

<!-- Lo de abajo es el diagnostico original del 10 de agosto. Se conserva
     porque explica por que el arreglo es el que es. -->

### Como era antes: el candado que no caducaba

La noche del 10 de agosto, **seis despliegues seguidos salieron VERDES en
GitHub Actions y ninguno se aplico**. La causa: `tmp/candado-despliegue`
—que `app.js` crea como DIRECTORIO, porque `mkdir` es atomico y sirve de
candado— quedo abandonado a las 16:43 y seguia ahi mas de media hora despues.
Cada despliegue llegaba, veia el candado y se retiraba sin descomprimir.

`app.js` dice que un candado de mas de tres minutos (`CADUCA_MS`) lo puede
quitar cualquiera. **Eso no ocurrio.** O la comprobacion de caducidad esta
mal, o el proceso que deberia ejecutarla —el cron cada minuto— no esta
corriendo. Hay que averiguar cual de las dos.

Se desbloqueo a mano: `rm -rf ~/gcm/tmp/candado-despliegue` y relanzar el
workflow.

**Segunda trampa aprendida esa misma noche**: al relanzar en Actions una
ejecucion que NO es la ultima, se sube el `gcm.tar.gz` de ESE commit —todos
los despliegues sobrescriben el mismo archivo—. Se descomprimio un paquete
intermedio: cambio el CSS (parecia que habia entrado lo nuevo) pero sin la
migracion del pase. **Para desplegar lo ultimo hay que relanzar la ejecucion
de ARRIBA, o empujar un commit nuevo.**

Mientras esto no se entienda, cualquier despliegue puede volver a quedarse
colgado saliendo verde: es el mismo patron que costo dos horas de caida.

## 1. Deuda del incidente del 10 de agosto

### ~~Devolver los esqueletos de carga~~ HECHO

Volvieron el 10 de agosto de 2026 con `RescateRevelado` en el layout raiz, que
drena la cola `$RB` con `setInterval` y `visibilitychange` cuando
`requestAnimationFrame` no puede. Verificado en produccion con la pestana en
SEGUNDO PLANO —la condicion exacta que lo rompia—: cola de revelado presente y
cero esqueletos visibles.

El mecanismo y sus cuatro reglas estan en `REVELADO-REACT.md`. **Leelo antes
de anadir otro `loading.tsx` o `<Suspense>`**, y sobre todo si algun dia se
actualiza React: `$RB` y `$RV` son internos, no API publica.

### ~~El despliegue no borra nada~~ RESUELTO el 12 de agosto

`scripts/desplegar.sh` (10 de agosto) descomprime a un directorio de
preparacion y hace un intercambio atomico con `mv`, con lo que los restos de
compilaciones viejas desaparecen. **Ya esta cableado** (12 de agosto): el
workflow lo sube por FTP junto a `app.js` —fuera del comprimido, o el
intercambio lo moveria mientras se ejecuta— y lo lanza un cron cada minuto.
El arbol viejo se va entero y con el su sedimento, asi que lo de abajo deja
de aplicar.

**Probado de punta a punta el 12 de agosto**: un commit paso de `push` a estar
sirviendo en produccion sin que nadie tocara el servidor —ni abrir la web, ni
`touch restart.txt`, ni descomprimir a mano—, y dejo su
`OK: aplicado (23 entradas)` en `tmp/despliegue.log`.

> Una rareza que se queda sin explicar, por si reaparece: la primera ejecucion
> MANUAL del script aplico el paquete pero no escribio nada en el log. No es
> reproducible y por el cron registra bien, asi que no se persiguio mas. Si
> alguna vez falta un despliegue sin linea en el log, empezar por ahi.

### Como era antes: el despliegue no borraba nada

`tar -xzf` descomprime ENCIMA del arbol anterior. Los ficheros de
compilaciones viejas se quedan para siempre. Comprobado en produccion: en
`.next/server/app/` conviven `(dashboard)` y ademas carpetas sueltas `obras`,
`empresa` y `operador`, que en el codigo actual solo existen DENTRO del grupo
`(dashboard)`. Son restos de cuando esas rutas no estaban agrupadas.

### Tres copias de `_next/static` con cache de un ano

El workflow las publica en `deploy/.next/static`, `deploy/_next/static` y
`deploy/public/_next/static`, con un `.htaccess` que pone
`Cache-Control: public, max-age=31536000, immutable`. Nunca se purgan. Es la
via por la que un navegador podria ejecutar JavaScript de una compilacion y
recibir HTML de otra —sintoma ya visto en el log:
`Failed to find Server Action ... from an older or newer deployment`—.

### Dos mecanismos de descompresion a la vez

Ahora descomprime el **cron** (cada minuto, sin limite de tiempo) y `app.js`
conserva su logica con candado como respaldo. Funciona, pero hay que decidir
quien manda y quitar la duplicidad. **Regla que no se puede romper: nada
lento en el arranque.** Descomprimir tarda 16 segundos y LiteSpeed corta el
proceso mucho antes; por eso ningun despliegue del dia llego a aplicarse.

---

## 2. Cierre y arranque de obra (empezado el 10 de agosto)

Lo hecho: una obra `CERRADA` ya no admite NINGUNA escritura. El guard
compartido es `motivoSiObraCerrada` (`src/services/obra-abierta.ts`) —devuelve
el texto del motivo, no un booleano, para que todos los servicios den el mismo
mensaje—. Cubre mapeo, revisiones, movimientos, importacion, ordenes,
plan semanal, encargos, calendario, lookahead y cronograma; partidas, obras y
la importacion del cronograma usan `obraAdmiteCambios` directo porque ya
cargaban el estado. Ademas `requisitosParaEjecutar` bloquea pasar a
EN_EJECUCION sin presupuesto (cronograma y linea base solo avisan).

Lo que falta:

- ~~**Requisitos de cierre**~~ **HECHO (parcial) el 21 de agosto de
  2026.** `requisitosParaCerrar` en `lib/obras.ts`, simetrico a
  `requisitosParaEjecutar`: BLOQUEA cerrar (desde PLANIFICACION,
  EN_EJECUCION o PARALIZADA) si queda algun encargo VIGENTE con saldo por
  pagar, o algun movimiento presupuestal en BORRADOR — los dos quedarian
  irresolubles para siempre en cuanto la obra sea historia. Las tareas
  pendientes del tablero quedan como tercer requisito de la funcion pura
  (aviso, no bloqueante, misma doctrina que `lib/pendientes.ts`), pero
  **todavia no esta enganchado** en `cambiarEstadoObra`: reusar
  `pendientesDeLaObra` desde `obras.service.ts` crearia un ciclo de
  imports (`tablero.service.ts` ya importa `obtenerObra` de ese mismo
  archivo). Falta decidir como resolverlo —exportar una version del conteo
  que no dependa de `obras.service`, o calcularlo en la accion de servidor
  y pasarlo como parametro— antes de que el aviso se muestre de verdad.
- **Acta de cierre** con lecciones aprendidas (auditoria y aprendizaje).
- **Repositorio de obras cerradas**: sigue sin existir como pantalla. Lo que
  SI hay desde el 16 de agosto es la **restauracion**: un respaldo se vuelve a
  cargar y la obra entra como COPIA DE AUDITORIA (`archivadaEn` puesto), que
  no admite un solo cambio. Falta listar, buscar y comparar.
- ~~**¿Reabrir?**~~ **HECHO el 21 de agosto de 2026.** `TRANSICIONES_OBRA.CERRADA`
  admite volver a EN_EJECUCION (nunca a PLANIFICACION ni PARALIZADA: la
  obra ya tuvo gasto real). Permiso propio innegociable `obra:reabrir`
  (solo ADMIN, mismo criterio que `obra:eliminar_cerrada`/`obra:restaurar`),
  mas confirmacion escribiendo el nombre de la obra (mismo patron que el
  borrado de obra cerrada, sin la contrasena porque esto es reversible). En
  pantalla, "Reabrir" revela un formulario que avisa de dos efectos que se
  disparan solos y que ESTA ENTREGA NO CORRIGE: `avisos-reloj.ts` vuelve a
  procesar la obra de inmediato (rafaga posible de recordatorios sobre
  restricciones/valorizaciones viejas), y una semana de Plan Semanal que
  quedara ABIERTA al cerrar reaparece en el tablero de la empresa. Quedan
  como comportamiento conocido y avisado, no arreglado — cada uno merece su
  propia revision.
- ~~**Eliminar obra**~~ **HECHO el 12 de agosto de 2026, y se decidio al
  reves de lo anotado aqui**: si existe el borrado en la app, con cinco
  puertas —permiso innegociable, obra CERRADA, nombre tecleado, contrasena de
  quien borra, y un respaldo de las ultimas 24 horas que incluya los
  archivos—. Se borra por `ORDEN_BORRADO`, el inverso exacto del orden del
  respaldo, con prueba que lo fija. Sobreviven `audit_logs` y
  `respaldos_obra`, que son la constancia de que la obra existio.

## 3. Cronograma: opcion B (decidida el 10 de agosto) — CASI CERRADA

> **Al 21 de agosto por la noche, la ruta critica y la holgura se calculan
> de verdad para los cronogramas importados por Excel, para las tareas
> tecleadas a mano y para la EDT generada desde presupuesto** (ver el
> punto 4 de la seccion de arriba, con el editor de dependencias): la EDT
> nace sin red de precedencias —eso no se inventa—, pero sus tareas
> comparten `origen: MANUAL` con las tecleadas a mano, asi que el mismo
> editor y el mismo calculo ya aplican en cuanto alguien marca de que
> depende una de ellas. Todo lo demas se hizo entre el 15 y el 20 de agosto, y ademas por
> una via que este apartado no preveia: **la EDT se genera desde el
> presupuesto** y se sincroniza sola detras de las cinco operaciones que lo
> cambian. Hay tres puertas de entrada (MS Project/ProjectLibre, Excel y
> teclado), motor de fechas contra el calendario laboral de la obra, duracion
> en dias de trabajo, y la EDT sale en XML para planificarla en ProjectLibre y
> volver. Ver el anexo del 21 de agosto en `ESTADO.md`.

Project **solo siembra** el plan una vez; despues se edita y se corta siempre
desde la app. Para que eso sea posible GCM tiene que calcular por si mismo lo
que hoy lee del archivo:

- ~~`porcentajePlaneado` por tarea a una fecha dada.~~ HECHO:
  `planeadoEnFecha`, y lo usan la curva, el panel y el informe, para que no
  puedan discrepar.
- ~~Camino critico (`esCritico`) y holgura.~~ **HECHO el 21 de agosto de
  2026, para Excel, para lo tecleado a mano y para la EDT generada desde
  presupuesto** — ver el punto 4 de la seccion de arriba para el detalle
  completo (algoritmo, editor de dependencias, y por que la EDT no
  necesito backend nuevo: comparte `origen: MANUAL`).
- ~~Motor de fechas que respete el calendario laboral de la obra.~~ HECHO: la
  duracion se calcula desde las fechas en dias de TRABAJO con el calendario de
  la obra, y la cifra la calcula el SERVIDOR para no depender del reloj del
  navegador.
- ~~Editor manual con dependencias y recalculo automatico.~~ **HECHO el 21
  de agosto de 2026.** `cronograma-manual.service` deja crear, editar y
  borrar tareas con niveles y con recalculo de resumenes, con uid del
  contador monotono de la obra — y desde esa misma tarde, tambien deja
  marcar de que otras tareas depende cada una (siempre fin-comienzo), con
  recalculo automatico de ruta critica/holgura en cada cambio (ver el
  punto 4 de arriba). Sigue sin haber arrastrar y soltar, que era lo
  ultimo de esta lista y es una mejora de comodidad, no una pieza que
  faltara para poder calcular nada.

## 4. Evidencia fotografica con QR (plan aprobado el 10 de agosto)

Decision de enfoque: NO una galeria suelta —la foto se ADOSA al dato donde se
decide (la restriccion que se libera, la causa de no cumplimiento)— y la
galeria es una VISTA sobre esa evidencia. Orden acordado con el usuario:
primero ortografia tanda 2 y plantilla Excel, luego esto.

- **Fase A — cimiento (commit 1) y UI (commit 2): HECHOS y subidos.**
  - *Commit 1*: modelo `FotoEvidencia` (migracion
    `20260810195703_evidencia_fotografica`, YA aplicada en la base LOCAL),
    `evidencia.service.ts` (subir con hash SHA-256, permisos por destino,
    candado CERRADA, 5 MB, JPG/PNG/WebP, auditLog; listar agrupado; servir
    validando empresa) y la ruta `/api/evidencia/[id]` (401/404/410). Los
    archivos van a `STORAGE_ROOT/evidencia/<obra>/` —fuera del arbol—.
  - *Commit 2 (10 de agosto, tarde)*: la UI.
    `components/evidencia/PanelEvidencia.tsx` (clip con contador +
    panel en linea, compresion en el navegador a 1600 px / JPEG 0.8) y
    `GaleriaEvidencia.tsx` (miniaturas, sin estado, sirve en servidor y en
    cliente). La accion es UNA sola para los dos destinos:
    `obras/[id]/evidencia/acciones.ts`, y viaja por `FormData` porque un
    `File` no se serializa de otra forma. Los servicios de Lookahead y Plan
    Semanal traen las fotos **en una sola consulta por pantalla** (son 7
    restricciones por tarea: una consulta por celda mataria la pagina). Se
    ve en tres sitios: celda de restriccion del Lookahead (escritorio y
    movil), cierre del Plan Semanal, y la semana ya cerrada en solo lectura
    —que es donde la evidencia de verdad se usa—.
    Verificado con `tsc --noEmit`, `eslint`, `vitest` (495 pruebas) y
    `next build`, los cuatro limpios. **Falta la prueba visual con sesion
    real: subir una foto de punta a punta.**
  - Dos decisiones de la UI que no se deben deshacer sin pensarlo: el clip
    del movil va FUERA del `<label>` (dentro, tocarlo marcaria tambien la
    restriccion), y en el cierre va en la fila de arriba y NO junto a la
    causa (colgado de la causa, marcar «cumplido» esconderia fotos ya
    subidas).
  - **Produccion, al cierre del 10 de agosto: DESPLEGADO Y EN PIE.** La
    tabla se creo a mano en phpMyAdmin ANTES del push (el codigo viejo no la
    miraba) y despues del deploy se cuadro el registro con
    `migrate resolve --applied 20260810195703_evidencia_fotografica`.
    Comprobado tras el despliegue: `/login` 200, el CSS y los once chunks de
    JS en 200 —esta vez el deploy no dejo caer ningun archivo—. El unico 404
    es `portada/1.jpg`, que es el pendiente de las fotos del carrusel.
  - `STORAGE_ROOT` **ya estaba definida** en cPanel desde antes, con valor
    `/home/drcacere/gcm-storage`, y es correcta: la app vive en `~/gcm`, asi
    que esa carpeta queda FUERA del arbol y el deploy no la toca. **No
    anadir una segunda variable con otro nombre de carpeta**: duplicar la
    clave deja en el aire cual gana. La carpeta no se crea a mano; el
    servicio la crea con `mkdir` recursivo en la primera subida.
  - *Commit 3 (10 de agosto, noche)*: **visor emergente y codigos QR.**
    - La foto ya no abre una pestana aparte, que sacaba a la gente de la
      obra: se superpone un visor (`GaleriaEvidencia`) con Escape, toque
      fuera, flechas entre fotos y el pie —quien y cuando— SIEMPRE a la
      vista, que antes estaba escondido en un `title`.
    - **Un solo codigo QR por obra**, decidido con el usuario al ver la
      cuenta: 20 tareas x 7 flujos son 140 stickers que nadie pega ni
      mantiene. El codigo se pega en la caseta y lleva a
      `/obras/[id]/evidencia`, un MENU pensado para el telefono a pie de
      obra (buscador, objetivos de 56 px, tarea -> restriccion -> subir).
      Ese menu NO es la matriz con otra ropa: siete columnas no se tocan
      con el dedo.
    - La hoja (`/obras/[id]/lookahead/codigos`) mantiene los otros dos
      granos —por tarea y por restriccion— para casos puntuales, y dice
      CUANTOS codigos va a imprimir antes de gastar papel, con aviso a
      partir de 30. `src/lib/evidencia-qr.ts` tiene la aritmetica probada
      (14 pruebas), incluida la que fija que el enlace va a la app normal y
      nunca a `/api/evidencia`: un QR pegado en una columna no puede ser una
      puerta trasera a las fotos.
    - Los QR se dibujan como SVG EN EL SERVIDOR: en papel un PNG escalado se
      emborrona y el telefono deja de leerlo.
    - Dependencia nueva: `qrcode` (+ `@types/qrcode`).
    - Verificado: `tsc`, `eslint`, `vitest` (509) y `next build`, limpios.
  - **AL RETOMAR**: probar en obra el ciclo del QR —imprimir el codigo de la
    obra, escanearlo con el telefono y subir una foto desde el menu—. Es lo
    unico que no se puede verificar desde aqui.
- **Fase B**: pestana Evidencia de la obra, vista agregada con filtros.
  **Sigue abierta**, y conviene no confundirla con la **galeria** que si entro
  el 15 de agosto: son mundos aparte por decision del dueno —la evidencia es
  registro probatorio inmutable; la galeria es el escaparate, se describe, se
  publica foto a foto y se borra si salio mal, y tiene un enlace publico que
  ve el CLIENTE—. Curar el escaparate no puede tocar el archivo probatorio, y
  por eso **no existe camino de una a otra**.
- **Fase C**: estandares visuales (quality gates), dentro de Fase 2 documental.
- **Fase D**: rol cliente solo lectura + reconocimiento de cuadrillas.

Restricciones tecnicas que NO se pueden olvidar:
1. Las fotos viven FUERA del arbol de la app (/home/drcacere/gcm-archivos):
   el deploy extrae un tar encima y el futuro desplegar.sh hace swap atomico
   que BORRA el arbol. Servidas por route handler que valida sesion, permiso
   y EMPRESA —nunca publicas por URL adivinable—.
2. Cuota de disco cPanel: limite por archivo y contador por obra visible.
3. Respaldo: las fotos no estan en repo ni tar; sumarlas a las copias del
   servidor junto al volcado de la base.

## 5. Notas y Recordatorios — HECHA el 22 de agosto de 2026 (E1 + E2)

Bitacora libre de obra con recordatorios. Adaptaciones a GCM ya decididas:
permisos en la matriz (nota:leer/crear/gestionar), NO tabla de auditoria
propia (se usa auditLog), estado "vencido" DERIVADO (pendiente + fecha
pasada), categorias fijas al inicio (financiero/logistica/operativo/legal).
Una nota que describe una restriccion de tarea debe marcarse en el Lookahead
—la UI lo dira—.

> **El plan original de aqui abajo (hash SHA-256 + purga para los adjuntos;
> campana por sondeo + resumen por correo + preferencias en Perfil para las
> notificaciones) se escribio ANTES de investigar a fondo, y E2 se aparto de
> el a proposito en los dos puntos.** Investigado el 22/08: `Nota` no es
> evidencia de auditoria inmutable como `FotoEvidencia` —es contenido de
> autor, vive y muere con la nota (`onDelete: Cascade`)—, asi que un hash
> que sobreviva a la purga y una purga que conserve el registro sin el
> archivo no aportaban nada que este caso necesitara: son garantias del
> mundo de la evidencia fotografica, no del de un adjunto de nota. Y las
> notificaciones ya tenian un patron probado y mas barato en el sistema
> —`avisos-valorizacion.ts`, campanita sola, sin correo ni SMS, sin
> preferencias por persona— para exactamente esta clase de aviso: uno que
> nadie configuro y que no debe gastar el presupuesto de correo/SMS de la
> obra en nombre de quien escribio la nota. Se replico ESE patron en vez de
> construir el mas caro que nadie habia pedido todavia.

Orden de entregas: plantilla Excel → infraestructura de archivos (hash+purga)
+ Evidencia Fase A con QR → ~~Notas E1 (CRUD + pestana + widget de proximos
recordatorios)~~ **HECHA el 21/08** → ~~Notas E2 (adjuntos + notificaciones)~~
**HECHA el 22/08**.

**Lo entregado en Notas E1** (21 de agosto): modelo `Nota` + `CategoriaNota`
(`prisma/schema.prisma`), migracion `20260821192925_notas_y_recordatorios`,
permisos en `rbac.ts` (RESIDENTE: leer+crear; ADMIN_OBRA: los tres;
CONSULTOR y ALMACENERO sin `nota:leer`, mismo motivo que `galeria:leer`),
`src/services/notas.service.ts` + `src/lib/notas.ts` (`esVencida`, nunca
guardada), pestana `/obras/[id]/notas` entre "Parte del día" y "Kanban",
widget "Proximos recordatorios" en el tablero (`src/lib/tablero.ts`,
`tablero.service.ts`, `modulos.tsx`), capitulo nuevo del manual
(`src/components/manual/capitulos.tsx`, slug `notas`). Tres guardas de
consistencia que ya existian atraparon huecos reales: `Nota` no estaba
clasificada ni en `respaldo-esquema.ts` (respaldo de obra) ni en el catalogo
de migracion de empresa, y la pestana no tenia capitulo en el manual —los
tres quedaron resueltos en el mismo commit.

**Lo entregado en Notas E2** (22 de agosto): modelo `AdjuntoNota` (migraciones
`20260822051510_notas_adjuntos_y_aviso_vencido` y
`20260822051726_adjuntos_nota_relacion_project`), imagenes o PDF hasta 10 MB,
guardados en `STORAGE_ROOT/notas/<obra>/<id><ext>` y servidos por
`GET /api/notas/[id]` (sesion + `nota:leer` + empresa, sin flujo de pase de
obra —a diferencia de evidencia, adjuntar a una Nota es siempre una accion de
sesion—). Subir y borrar exigen `nota:gestionar`. Nuevo evento
`NOTA_VENCIDA` en `EventoAviso`; `src/services/avisos-notas.ts`
(`avisarNotasVencidas`) escribe la campanita una vez al dia mientras la nota
siga vencida y sin atender, a los residentes asignados o, sin ninguno, a los
ADMIN_OBRA. Llamada desde `pasadaDeObra` en `avisos-reloj.ts` ANTES del `if`
que exige hitos o restricciones abiertas —a diferencia de
`avisarValorizacionesPendientes`, que queda colgada de esa comprobacion y no
sonaria en una obra que solo usa la bitacora libre—. Misma guarda maestra que
el resto: si `AjustesAvisosObra.activo` esta apagado, no suena nada.

Otras dos guardas de consistencia atraparon huecos reales, mismo mecanismo
que en E1: `adjuntos_nota` no estaba clasificada en ninguno de los dos
catalogos de respaldo/migracion, y `NOTA_VENCIDA` faltaba en los tres mapas
exhaustivos de `BandejaAvisos.tsx`/`RegistroAvisos.tsx` que el propio
`tsc` rechazo hasta completarlos.

## 6. Importacion de presupuesto (Excel) — SUPERADA el 20 de agosto

> **Este apartado describe un flujo retirado.** Desde el 20 de agosto el
> presupuesto contractual **no se importa**: se carga el REAL con su plantilla
> en `/obras/[id]/meta` y el contractual se GENERA desde el, recargando cada
> capitulo. `/obras/[id]/importar`, `ImportadorPresupuesto` y `VistaPrevia`
> estan borrados. Lo que sigue vivo es `analizarExcel`, que es quien lee el
> Excel del real, y su plantilla, que ahora trae formulas con su resultado, 60
> filas preparadas y las celdas calculadas bloqueadas.

- ~~Plantilla ideal descargable~~ HECHA el 10 de agosto: se genera desde
  codigo (`src/lib/plantilla-presupuesto.ts`), con test de ida y vuelta
  contra `analizarExcel` para que plantilla e importador no diverjan.
  Descarga en `/plantilla-presupuesto` y boton en la pagina de importar.
  **Falta que el usuario pruebe el ciclo completo en prod** (descargar →
  llenar → importar → vista previa → confirmar).
- Verificar de punta a punta que importa TODO correctamente.
- Permitir corregir, editar, eliminar y crear partidas tras importar (la
  edicion existe; falta revisarla contra la importacion).

## 6b. Ayuda en la app (decidido el 10 de agosto: sin LLM local)

Se evaluo integrar un chatbot de IA local/gratuito (WebLLM, Gemini Nano,
Ollama en backend) y se DESCARTO con el usuario de acuerdo:

- Ollama en backend: inviable —cPanel/LiteSpeed mata procesos pesados—.
- WebLLM: descarga de 0.5–2 GB y GPU en maquinas de obra que no la tienen;
  y los modelos que caben (0.5–1.5B) alucinan cifras, justo lo que la
  filosofia de GCM prohibe (ninguna cifra sin respaldo).
- Gemini Nano: solo Chrome, disponibilidad variable; no se vende algo que
  funciona "a veces".

Lo que SI se hara, en este orden:
1. Seguir extendiendo la asistencia determinista (componente `Explicacion`,
   riel de ubicacion, textos tipo `textoSinCosto`) a cada concepto delicado.
2. ~~**El manual dentro de la app**~~ **HECHO el 18 de agosto de 2026**:
   `/manual`, 23 capitulos, sin puerta de permisos —quien menos permisos tiene
   es quien mas lo necesita—, y una prueba que exige que cada seccion del menu
   diga en que capitulo se explica. **Falta la BUSQUEDA**: hoy se navega por
   el indice, y no hay panel que busque sobre el texto.
3. IA conversacional solo si algun dia es requisito de venta, y entonces
   via API de pago (p. ej. Claude Haiku) anclada a los datos de la obra
   —decision de producto para ese momento—.

   **Arquitectura pre-conversada el 22 de agosto de 2026**, sin compromiso
   de negocio todavia (el usuario exploraba la idea, no hay venta que la
   exija) — para no volver a empezar de cero cuando llegue el momento:
   Retomado, tambien el 22 de agosto, con un giro del usuario: cada
   empresa trae su PROPIO proveedor de IA y su propia clave —GCM no paga
   ni opera ningun servicio de IA compartido, lo mismo que ya rige para el
   buzon de correo propio, y hace falta ademas para la version instalable,
   donde no hay ningun servicio de GCM detras—.

   ~~**Fase 1: proveedores de IA configurables por empresa.**~~ **HECHA el
   22 de agosto de 2026.** Solo la infraestructura de credenciales, sin el
   agente conversacional en si (eso sigue en la lista de abajo, sin
   empezar). `AgenteIaProveedor` (`prisma/schema.prisma`) deja guardar
   VARIOS proveedores por empresa —no uno, como `RemitenteCorreo`—, cada
   uno con su clave cifrada (`src/lib/secreto.ts`, mismo cifrado, misma
   llave, sin una segunda para esto) que nunca vuelve a la pantalla. Cual
   esta ACTIVO es un puntero en `Company.proveedorIaActivoId`, no un
   booleano por fila: por construccion nunca puede haber dos a la vez, sin
   depender de una transaccion que lo garantice (el servicio de todas
   formas limpia el puntero el mismo al borrar el activo, sin confiar solo
   en el `onDelete: SetNull` del esquema). Dos adaptadores para arrancar
   (`src/services/agente-ia.service.ts`) — Claude (Anthropic Messages API)
   y OpenAI-compatible (Chat Completions contra una URL propia, formato
   que hablan muchos otros proveedores) —, registrados por un `tipo` que
   es TEXTO LIBRE en el esquema (mismo criterio que
   `CompanyPermission.permiso`): sumar un tercer proveedor es una entrada
   mas en el registro, sin migracion. `activarProveedorIa` exige
   `verificadoAt`: no se puede activar una clave sin probarla de verdad
   primero —mismo criterio que `probarRemitente`, que manda un correo real
   en vez de solo `verify()`—. Pantalla en `/empresa/configuracion/ia`,
   subpagina propia (no una tarjeta mas en la principal) porque es una
   LISTA que puede crecer. Verificado: 2557 pruebas en verde (23 nuevas),
   typecheck, lint, build y `scripts/humo.ts` en verde —que de hecho cazo
   un fallo real durante la verificacion: el servidor de desarrollo que ya
   estaba corriendo tenia el cliente de Prisma de ANTES de la migracion,
   asi que `listarProveedoresIa` reventaba con «Cannot read properties of
   undefined (reading 'findMany')» aunque el codigo fuera correcto —hubo
   que reiniciar el servidor tras `prisma generate`, ya anotado antes como
   escollo conocido—. Tambien cazo, aparte, que `AgenteIaProveedor` faltaba
   en `EXCLUIDAS_MIGRACION` (`lib/respaldo-empresa-esquema.ts`): la prueba
   que lee el esquema como texto lo marco en rojo antes de llegar a
   produccion, exactamente para lo que existe.

   **Verificado en navegador real el 22 de agosto de 2026** (con Claude in
   Chrome, ya conectado esta sesion): guardar un proveedor, probarlo
   —llamada de verdad a la API de Anthropic con una clave falsa, 401
   real, mensaje saneado sin la clave—, confirmar que "Activar" se
   bloquea sin `verificadoAt`, y eliminar. Los cuatro funcionaron a la
   primera. Anecdota de metodo: el primer intento de escribir en el
   formulario de soporte (mas abajo) parecio fallar en silencio con
   `form_input` programatico seguido de un clic en lote; con clic y
   tecleo REALES funciono a la primera —misma leccion que
   `clic-dentro-de-menu-desplegable` de la memoria: un envio de
   formulario se prueba con una interaccion real, no solo programatica.

   ~~**Fase 2a: el motor de conversacion, solo lectura.**~~ **HECHA el 22
   de agosto de 2026.** Diseno primero (`EnterPlanMode`, plan aprobado
   antes de escribir codigo), justo por como se decidio partir esta
   entrega: el motor de lectura ya es grande por si solo (esquema, cola
   asincrona, registro de herramientas, integracion real con un
   proveedor, pantalla de chat) y verificarlo SIN ningun riesgo de que el
   agente cambie un dato es la base sobre la que se construye la
   escritura despues, no algo a mezclar con ella.
   - **Esquema**: `ConversacionAgente` (una por usuario+empresa) y
     `MensajeAgente` (`rol` USUARIO/ASISTENTE, `contenido`,
     `herramientas` Json opcional, `terminadoAt` nulo mientras piensa),
     mismo patron de estado-por-fecha que `MensajeSms` —no un enum de
     estados—.
   - **Herramientas, deliberadamente pocas y ya pagadas**: `listar_obras`
     y `resumen_empresa` (`obras.service.ts`) mas `semaforo_cartera`,
     `sobregiro_cartera` y `confiabilidad_cartera`
     (`gerencia.service.ts`) —las tres de cartera son resumenes ya
     acotados por la regla de coste del archivo (tope de obras, sin
     cronogramas de mas), exactamente lo que alguien le preguntaria a un
     asistente—. Cada herramienta es un envoltorio delgado sobre una
     funcion de servicio que YA hace `puede(sesion, ...)`: la `sesion`
     que recibe `ejecutar()` es la sesion REAL de quien pregunta, nunca
     una fabricada, y si la funcion de abajo deniega o devuelve vacio eso
     es lo que el modelo ve como resultado, sin una segunda autorizacion
     paralela. **Nada de escritura** —`crear_movimiento`,
     `registrar_avance`— queda para la Fase 2b.
   - **Patron asincrono**: mismo de `ProbarSms.tsx` —el Server Action crea
     la fila USUARIO completa y la fila ASISTENTE vacia, dispara
     `after()` de Next.js para seguir trabajando tras responder, y
     devuelve el id de inmediato; el cliente sondea otra Server Action
     cada 2s con tope de espera propio—. Barrido de turnos muertos nuevo
     en `pasadaDelReloj` (mismo `try/catch` aislado que ya protege
     `pasadaDeCorreoEntrante`): marca con error cualquier fila
     `terminadoAt: null` de mas de 3 minutos, por si el proceso se
     reinicio a mitad de un turno.
   - **Adaptador**: solo `claude` implementa `conversar()` por ahora
     (Anthropic Messages API, `tools` + bloques `tool_use` reales, tope
     de 6 vueltas antes de cortar con error explicado en vez de colgarse
     en silencio); `openai_compatible` se queda solo con `probar()` de la
     Fase 1 —su formato de function-calling es su propio trabajo, no una
     copia apurada—.
   - **Permiso**: `agente_ia:usar`, nuevo en `rbac.ts`, NO innegociable
     (a diferencia de `soporte:usar`) —es de la misma familia que
     cualquier otro `:leer`, delegable por la empresa si quiere—. Se
     sumo a mano a la lista de GERENTE porque termina en `:usar`, no en
     `:leer`, asi que `TODO_LO_QUE_SE_LEE` no lo arrastra solo.
   - **Pantalla**: `/asistente`, entrada propia en la navegacion (no
     dentro del desplegable de Empresa: es herramienta de trabajo diario,
     no un ajuste), chat en burbujas con indicador de "Pensando…".
   - Igual que con `agente_ia_proveedores`, `conversaciones_agente` y
     `mensajes_agente` faltaban en `EXCLUIDAS_MIGRACION`
     (`lib/respaldo-empresa-esquema.ts`) —mismo motivo: dependen de una
     clave cifrada con la llave de ESTE servidor, que el destino de una
     migracion no tiene—; la prueba que lee el esquema lo caza de nuevo,
     tercera vez en el dia. Verificado con 13 pruebas nuevas, typecheck,
     lint y build en verde.

     **Verificado en navegador real el 22 de agosto de 2026** y caza un
     bug de verdad: al mandar un mensaje aparecieron ~30 burbujas
     duplicadas del mismo error ("Configura y activa un proveedor de IA
     …"), y seguian creciendo. Una consulta directa a la base de datos
     confirmo apenas 2 filas reales de `MensajeAgente` —era puramente de
     RENDERIZADO en el cliente, no duplicacion de datos—. Causa: el
     `useEffect` que agrega las burbujas comparaba
     `estado.mensajeAsistenteId` contra `pendienteId` para no repetirse,
     pero `pendienteId` vuelve a `null` en cuanto el sondeo detecta que
     el turno termino; al volver a `null` el efecto se disparaba de
     nuevo (`pendienteId` estaba en sus dependencias), la comparacion ya
     no coincidia, y agregaba OTRO par de burbujas para el mismo turno ya
     completo —lo que a su vez reactivaba el sondeo, que volvia a
     encontrar el turno terminado y ponia `pendienteId` en `null` otra
     vez—: un bucle sin fin. Arreglado con un `useRef` aparte
     (`idAgregadoRef`) que se fija UNA vez por turno y nunca se resetea,
     sacando `pendienteId` de las dependencias de ese efecto. Reverificado
     con una segunda ronda completa —mensaje real, recarga de pagina,
     segundo mensaje real— confirmando en la base de datos exactamente 2
     filas por turno, sin duplicados, en el orden correcto.

   **Sigue sin empezar**:
   - **Fase 2b (escritura)**:
     separar "proponer" de "ejecutar", mismo patron de friccion que ya usa
     el resto de GCM (confirmacion escrita para cerrar obra, motivo
     obligatorio para paralizar) — el agente PROPONE la accion en texto
     claro y el usuario confirma antes de que se ejecute la llamada real.
     Y el agente deberia poder crear movimientos en BORRADOR pero NUNCA
     aprobarlos: la aprobacion de dinero se queda como clic humano
     deliberado, igual que hoy.
   - **Pedido el 22 de agosto de 2026: que el agente tenga cara — un
     avatar 3D animado en el navegador, llamado "Mike".** Confirmado con
     el usuario que "Mike" no existe hoy en ningun lado (ni en GCM ni en
     otro sistema): es una idea nueva, sin modelo 3D, sin diseno visual
     todavia. Y que se quiere 3D DE VERDAD, animado en el navegador —no
     una ilustracion fija ni un icono—, la opcion mas grande de las que se
     plantearon.

     Esto es una pieza de ingenieria NUEVA para GCM, separada del agente
     conversacional en si y de tamano comparable o mayor: hoy CERO
     pantallas usan WebGL o una libreria de graficos —hasta las curvas S y
     los graficos de gerencia son SVG a mano, a proposito, para no sumar
     dependencias—. Antes de disenarla en serio hace falta decidir, con el
     usuario, al menos:
     - **De donde sale el modelo 3D de "Mike"**: no se puede generar
       codigo sin un asset —un personaje 3D rigged y animado hay que
       modelarlo, encargarlo, o generarlo con un servicio (p. ej. Ready
       Player Me u otro), no se escribe a mano—.
     - **Que libreria de render en el navegador** (candidato obvio:
       Three.js/`react-three-fiber`, pero es una decision a tomar, no un
       hecho) y que impacto tiene en el peso de la pagina y el rendimiento
       en equipos de obra modestos —el mismo criterio de "cuidado con el
       cliente que no tiene GPU" que ya descarto WebLLM en la seccion 6b
       de aqui arriba aplica tambien a un avatar 3D pesado—.
     - **Que anima al avatar**: si habla con voz de verdad (texto a voz,
       otro servicio externo mas, otra clave de API mas) con sincronizado
       de labios, o solo gestos genericos mientras el texto aparece
       aparte.
     - ~~Depende de que exista primero la Fase 2 (el motor de
       conversacion, turnos, herramientas)~~: **la Fase 2a ya existe**
       (arriba), asi que este punto ya tiene con que hablar. Sigue sin
       empezar por las tres preguntas de arriba (asset, libreria,
       animacion), no por esta dependencia.

     Sin empezar. Cuando se retome, merece su propia sesion de diseno
     (posiblemente con `EnterPlanMode` e investigacion dedicada de
     librerias 3D para React/Next, que hoy no se ha hecho).

---

## 6c. Auditoria del 10 de agosto: las costuras, no las formulas

Tres auditorias cruzadas (vocabulario del dominio, cadena Last Planner y
puente dinero-tiempo) sobre si el codigo respeta el modelo conceptual
(capitulo/partida = dinero; tarea/hito = tiempo; el mapeo como unico puente).

**El diagnostico de fondo, que es lo que mas sirve**: las formulas estan bien
y centralizadas —PPC, Pareto, ponderacion y estado LISTO tienen UNA sola
implementacion y se reutilizan, no pueden divergir—. Lo que falla son las
COSTURAS: que valor se escribe por defecto, que sobrevive a reabrir o
eliminar, y QUE CONJUNTO de tareas alimenta cada numero.

### ~~Cerrar una semana escribia 100% de avance~~ ARREGLADO

El mas grave de todo el sistema, corregido el 10 de agosto. La regla era
«cumplido y sin porcentaje -> escribir 100», y los compromisos venidos del
Lookahead nacen SIN meta (`comprometerAlPts` no la setea) con la pantalla
prellenando vacio. O sea: el residente cumplia el tramo semanal de una tarea
de tres semanas, marcaba cumplido —que es verdad— y la tarea entera quedaba
al 100%. Como `AvanceTarea` es la fuente unica del real de la curva S, del
EV, del SPI, del Gantt y de las alertas, **un PPC honesto producia una obra
que se veia al dia**.

Ahora la regla vive en `porcentajeARegistrar` (`src/lib/plan-semanal.ts`),
probada con 6 casos: lo tecleado manda siempre (tambien si NO se cumplio,
que es informacion buena); cumplir sin teclear registra la META pactada; y
sin porcentaje ni meta **no se registra nada**, con aviso en pantalla.
Comprobado en produccion antes de tocar: **0 avances sospechosos**, el fallo
estaba armado pero no se habia disparado.

### Lo que la auditoria dejo PENDIENTE, por dano

1. ~~**Doble conteo del presupuesto**~~ **ARREGLADO el 10 de agosto.** Los
   cuatro sitios usan ya `@/services/presupuesto-obra`, que resuelve el costo
   directo con la regla de hojas. Hay UNA sola definicion de "presupuesto
   total" en el sistema, asi que no pueden volver a discrepar. Comprobado en
   produccion ANTES de tocar: la consulta que busca grupos con importe propio
   y ademas hijas costeadas devolvio **cero filas**, o sea que ninguna cifra
   actual cambia; esto es red de seguridad para el proximo presupuesto que
   entre con ese patron —y para la primera constructora cliente—.
   *El defecto era*: cuatro sitios sumaban
   `SUM(parcial) WHERE tipo="PARTIDA"` sin la regla de hojas: `evm.service`
   (el **BAC**), `tablero.service`, `obras.service` (cartera y por obra) y
   `encargos.service` (cobertura). No protege filtrar por `tipo`, porque
   `clasificarCodigo` (`excel-presupuesto.ts`) marca como PARTIDA cualquier
   fila con importe propio, incluidas las cabeceras de grupo con hijas
   costeadas. Efecto: BAC inflado -> `EV = BAC x %` sube -> **el CPI parece
   ahorro**; el saldo del tablero ensena dinero que no existe. El SPI y el %
   de avance NO se afectan (son ratios sobre el mismo BAC), por eso no da
   sintoma. La regla correcta ya existe: `sumarHojas`/`aportantes`.
2. ~~**El BAC ignora el VIGENTE**~~ **ARREGLADO el 10 de agosto.** `bacDeObra`
   suma la base (arbol vivo, regla de hojas) mas los ajustes APROBADOS de la
   linea base vigente. Los deductivos restan solos porque los importes ya
   traen signo, y una reconversion suma cero. `DatosEvm` devuelve ademas
   `baseBac` y `ajustesBac` para poder explicar en pantalla de que se compone.
   No se reuso `obtenerPresupuestoVigente` porque exige `movimiento:leer` y
   lanza sin linea base, y el EVM lo mira gente con solo `cronograma:leer`.
   *El defecto era*: las partidas de adicional nacen con `parcial: null` a
   proposito, pero el AC si contaba sus ordenes, asi que **el CPI se degradaba
   solo** conforme se aprobaban adicionales legitimos.
3. ~~**Reabrir + reguardar borra cumplido/causa/notaCierre**~~ **ARREGLADO
   el 21 de agosto de 2026.** `CamposPreservables` (`lib/plan-semanal.ts`)
   solo rescataba `cantidadEjec` de los campos que se anotan al CERRAR;
   `cumplido`, `causa` y `notaCierre` se perdian al reabrir una semana y
   volver a guardar la planificacion, dejando el PPC en 0 y el Pareto sin
   causas mientras el avance fisico sobrevivia intacto. De paso se encontro
   un cuarto campo con el mismo problema, no anotado en el hallazgo
   original: `enEjecucionAt` (cuando el trabajo empezo en obra, del
   Kanban) tampoco se preservaba. Los cuatro se anaden a
   `CamposPreservables`/`mapaPreservablePorUid` y a los `select`/`createMany`
   de `guardarCompromisos` (`plan-semanal.service.ts`).
4. ~~**Eliminar una semana deja avances huerfanos**~~ **ARREGLADO el 21 de
   agosto de 2026.** `AvanceTarea.planSemanalId` tiene `onDelete: SetNull`:
   al borrar un `PlanSemanal` ya CERRADO (nada lo impedia), sus avances
   quedaban con `planSemanalId: null`, indistinguibles de un reporte manual
   y sin que nada los volviera a encontrar para reemplazarlos.
   `eliminarPlanSemanal` ahora borra tambien esos avances, DENTRO de la
   misma transaccion y ANTES de borrar la cabecera —el mismo `deleteMany`
   que ya usaba `cerrarPlanSemanal` al reabrir/re-cerrar—, y el conteo
   queda en la auditoria. "Rehacerla" ahora borra TODO lo que el plan
   habia escrito, no solo la cabecera.
5. ~~**Curva S / EVM leen otro conjunto de tareas que la pantalla de
   avance**~~ **ARREGLADO el 21 de agosto de 2026.** Confirmado: una vez
   fijada la linea base, `datosCurvaS` calcula el PLAN de la curva contra
   ella (`fuentePlan: "base"`), mientras la tabla editable del cronograma
   (`obtenerCronograma`) siempre muestra el corte VIGENTE — a proposito, es
   lo que impide que reprogramar mueva los postes del EVM. `PanelEvm.tsx`
   ya explicaba esta distincion ("PV y SPI medidos contra la línea base
   v...") pero la tarjeta "Curva de avance" (`CurvaS.tsx`), que usa la
   MISMA fuente de datos y esta justo encima en la misma pantalla, no decia
   nada. Se le anadio la misma aclaracion, usando `datos.lineaBase` que ya
   viajaba sin usarse ahi.
6. ~~**Los hitos entran al Lookahead y al PPC**~~ **ARREGLADO el 21 de
   agosto de 2026.** `TareaProgramada` (`lib/plan-semanal.ts`) gano
   `esHito: boolean` y `tareasDeLaSemana` ahora lo excluye junto con
   `esResumen` — mismo criterio ya escrito en `mapeo.service.ts` y
   `control-avance.ts` ("dura cero dias... no es trabajo que alguien
   ejecute"). Se propago a los tres sitios que construian
   `TareaProgramada` sin `esHito` (`lookahead.service.ts` ×2,
   `plan-semanal.service.ts` ×1); `tablero.service.ts` no necesito cambios
   porque ya reusa `TareaDelPlan`, que si trae el campo. Con esto un hito
   deja de poder comprometerse en el Plan Semanal, de aparecer en la
   ventana del Lookahead, y de contar en el denominador del PPC.
7. ~~**Celda de importe editable en filas ALCANCE**~~ **ARREGLADO el 15 de
   agosto de 2026** (`ac717e6`), y en el SERVICIO, no en la pantalla: se
   rechazan importe, metrado y precio en filas de alcance, y al convertir a
   ALCANCE se limpian las tres cifras y no solo el importe —antes bastaba
   volver a precios unitarios para que el recalculo resucitara un importe que
   la fila no debe tener—. Un capitulo tampoco acepta ya modalidad. El efecto
   era peor de lo anotado aqui: no sumaba de mas, **borraba** del costo
   directo el precio cerrado de su partida padre, porque `aportantes` hace que
   cualquier importe positivo cubra a sus ancestros.
8. ~~**El avance puede retroceder** sin aviso~~ **ARREGLADO el 18 de agosto
   de 2026.** En el parte del dia, si alguna partida va a quedar POR DEBAJO de
   donde estaba se listan una a una con su antes y su despues, y el boton no
   se activa hasta marcar «es una correccion». Y el cierre de la semana
   **nunca propone un valor por debajo del que ya tiene la tarea**: un
   retroceso arrastraria la curva S hacia atras y eso lo decide una persona.
   Se avisa y no se impide, como el resto de GCM.
9. ~~**`cantidadEjec` no alimenta nada**~~ **ARREGLADO el 12 y el 18 de
   agosto de 2026.** Primero, **la cantidad manda sobre la casilla** al
   cerrar, con corte EXACTO —119 de 120 no esta cumplido, la misma dureza que
   ya rige el PPC—, y la deduccion vive en el SERVICIO para que ninguna otra
   via de cierre pueda volver a escribir la contradiccion. Despues, de la
   cantidad se deduce el **% alcanzado**, pero SOLO cuando hay META pactada,
   que ya viene en porcentaje: convertir metrados en porcentajes parecia
   exacto y habria escrito un 100 en la curva S en cuanto el compromiso fuera
   de otra tarea o cubriera dos partidas.
10. ~~**`MapeoTareaPartida` no tiene `fraccion`**~~ **RECLASIFICADO el 21 de
    agosto de 2026: no es un bug de hoy.** Se investigo `importePorTarea`
    (`lib/mapeo-partidas.ts`) a fondo: cuenta, a proposito y documentado,
    el importe COMPLETO de una partida en cada tarea que la mapea —el
    propio comentario dice por que: "repartir ese importe exigiria saber en
    que proporcion, y eso no lo sabe ningun algoritmo"—. La cifra que
    realmente decide si se puede ponderar por dinero (`cobertura`, la misma
    funcion) cuenta cada partida UNA sola vez, con su propio conjunto
    independiente (`Set` de codigos cubiertos), asi que no hereda el doble
    conteo. `fraccion` solo haria falta el dia que alguien sume
    `importePorTarea` en un TOTAL unico para pesar la curva por dinero —y
    esa funcionalidad sigue sin existir (confirmado de nuevo en la auditoria
    de EVM del mismo dia, ver el punto 3 de la seccion "Lo que dejo la
    tarde del 21 de agosto")—. Nada que arreglar hoy; el pendiente real es
    "si algun dia se construye la ponderacion por dinero, hay que resolver
    el reparto ahi, no antes".
11. ~~**`subtotalesPorRama` no lo usa `listarPartidas`**~~ **ARREGLADO el 21
    de agosto de 2026.** `listarPartidas` (`obras.service.ts`) mantenia su
    propio rollup a mano por `parentId`, sumando cualquier hija `PARTIDA`
    con parcial sin aplicar la regla de `aportantes` —la misma funcion que
    SI aplica dos lineas mas abajo, en `montoTotal`, via `sumarHojas`—: dos
    algoritmos distintos para dos numeros del mismo arbol, que podian
    divergir en el caso exacto que `aportantes` existe para resolver (un
    capitulo a suma alzada con una hija que tambien tiene cifra propia,
    p.ej. un descuento). Se sustituyo por `subtotalesPorRama`, que trae
    probado el invariante "la suma de los subtotales raiz == el total" —el
    mismo que ya garantizaba `montoTotal`—, asi que ahora las dos cifras de
    la pantalla nunca pueden descuadrar entre si.
12. ~~**Vocabulario**~~ **ARREGLADO (parcialmente) el 21 de agosto de
    2026.** «partida» sigue significando `WbsItem` en presupuesto y
    `TareaCronograma` en cronograma, a veces en la misma pantalla — eso no
    se toco, es un cambio de fondo del vocabulario del sistema, no de un
    texto suelto. Lo que si se corrigio: las TRES apariciones encontradas
    de "sus partidas hijas" para describir los hijos de una TAREA resumen
    del cronograma (`mapeo.service.ts`, `mapeo/page.tsx`,
    `lib/control-avance.ts`), que decian justamente lo que la pantalla de
    mapeo existe para ensenar a no confundir. Ahora dicen "sus tareas
    hijas" en los tres sitios. «Frente de trabajo» (tarea en evidencia,
    paquete de partidas en encargos) sigue sin unificar — no es un texto
    suelto, es un nombre usado con dos significados de producto distintos
    en dos modulos, y cambiar cualquiera de los dos es una decision de
    alcance, no una correccion.

**Orden acordado**: 1 y 2 (el dinero) —HECHOS—, luego 7, luego el resto. Con
el BAC ya sano, la **pagina de control economico** deja de estar bloqueada:
era lo que faltaba para no darle autoridad visual a cifras infladas.

**La lista de "lo que quedo PENDIENTE, por dano" queda cerrada el 21 de
agosto de 2026.** De los doce puntos originales, los 3, 4, 5, 6, 10, 11 y 12
se resolvieron esa tarde (7, 8 y 9 ya estaban hechos de antes; 1 y 2, el
dinero, tambien). El 10 se reclasifico: no era un bug, era un prerrequisito
para una funcionalidad (ponderar por dinero) que sigue sin construirse. No
queda ningun punto abierto de esta auditoria.

**Al retomar el dinero, lo siguiente es** el 7 (rendija del ALCANCE) y
despues decidir si se construye la pagina de control economico o se ataca
primero lo que NO existe: pagos, anticipos, recepciones y deuda —media cadena
contable—. Recordar el aviso ya escrito: **lo pagado lleva IGV y el resto no**,
asi que esas columnas no son homogeneas y hay que normalizar ANTES de
construir los pagos, no despues.

## 6e. Pase de obra con OTP — COMPLETO Y VERIFICADO (11 de agosto)

**Las pantallas ya estan y el recorrido entero funciona.** Verificado en el
navegador contra CRIOCORD, de punta a punta: identificarse con el celular
escrito CON ESPACIOS (`987 654 321`), recibir el codigo, teclear uno
equivocado —sale «Te quedan 4 intento(s)»—, teclear el bueno y aterrizar en
el menu con las 30 tareas sincronizadas y el panel de subida abierto.

Lo que se construyo, mas alla de los seis puntos que estaban apuntados:

- Grupo `(pase)` con layout propio, deliberadamente pobre (sin cabecera, riel
  ni pestanas: estorban en un movil a pie de obra).
- `/pase/[obraId]` con sus tres caminos: con sesion de GCM redirige a la
  pantalla de siempre; con el telefono ya reconocido, directo a cargar; el
  resto se identifica.
- `/pase/[obraId]/cargar` reusando `MenuEvidencia`, y `menuDePase` en
  `lookahead.service` —que HABIA QUE ESCRIBIR: `obtenerLookahead` exige
  `SesionActiva` de punta a punta, cosa que el plan anterior no habia visto—.
- Pantalla **Personal** en la obra (pestana en EJECUCION, permiso
  `lookahead:gestionar`): alta, revocar, reactivar y «generar codigo» para
  dictarlo, con el contador de fotos aportadas por persona.
- `/api/evidencia/[id]` acepta ya las DOS puertas, sesion y pase.
- `enlaceEvidencia({obra:true})` apunta a `/pase/[obraId]`.

**Tres decisiones que no se deben deshacer sin pensarlo:**

1. **`PanelEvidencia` recibe la accion de subida por PROPIEDAD, no por
   import.** Hay dos puertas con modelos de autorizacion distintos y el panel
   sirve a las dos; un valor por defecto haria que la pantalla del pase
   llamara a la de sesion, y un descuido futuro que llamara a la que NO
   comprueba lo que toca.
2. **`MenuEvidencia` ya no recibe `LookaheadDatos`** sino una interfaz
   acotada. Ensancharla para «aprovechar» un dato que ya venia es como se le
   acaban colando al pase cosas de usuario.
3. **El paso al segundo formulario lo decide el CLIENTE, no el servidor.** Se
   avanza siempre que la peticion salga bien, exista el contacto o no. Si
   avanzara solo con contacto real, avanzar o no seria la respuesta que el
   servicio se cuida de no dar, y cualquiera con el QR de la caseta podria
   averiguar quien trabaja en la obra probando numeros. Por lo mismo NO se
   resuelve redirigiendo para que mande `hayCodigoPendiente`: eso delata.

**Trampa que costo encontrarla**: `/api/evidencia/<id>` no lleva punto, asi
que el proxy lo intercepta; sin anadirlo a `RUTAS_PUBLICAS` un telefono con
pase habria recibido una redireccion al login por cada miniatura y la
pantalla habria salido con todos los huecos en blanco. Comprobado: ahora
responde **401**, no una redireccion.

Comprobado tambien el aislamiento: una cookie de pase valida de CRIOCORD **no**
abre la obra PRUEBA (cerrada), que responde «Este codigo ya no sirve» —el
mismo texto para obra inexistente, cerrada o empresa suspendida—.

**LO UNICO QUE FALTA**: subir una foto de verdad con un pase. El navegador
automatizado no puede adjuntar archivos, asi que hay que hacerlo a mano desde
un telefono. El camino de guardado es el MISMO `guardarFoto` que ya esta en
produccion.

**Y ANTES DE USARLO EN PROD**: aplicar la migracion `20260810214500_pase_de_obra`
(`migrate deploy`). Sin ella, la pestana Personal y `/pase/...` dan error; el
resto de la app aguanta, porque nada mas consulta esas tablas.

<!-- Lo de abajo es el estado ANTERIOR, se conserva por el porque de cada
     decision del backend. -->

## 6e-bis. Pase de obra con OTP (10 de agosto) — el backend, y por que asi

El personal de campo documenta SIN ser usuario de GCM: se identifica con su
celular o correo, recibe un codigo de un solo uso y entra. Decidido con el
usuario: dura **mientras dure la obra**, **ve todas las fotos** de la obra, y
solo puede **adjuntar**.

**Por que un modelo aparte y no un `User` reducido**: `User.passwordHash` es
obligatorio y `email` es unico GLOBAL. Ademas, separado, un pase no puede
hacer nada de usuario aunque alguien se equivoque: `PaseActivo` **no tiene
`permisos` ni `role`**, asi que no encaja en `puede()` ni por accidente.

Hecho y verificado (migracion `20260810214500_pase_de_obra`, aplicada en
LOCAL):

- `PaseObra`, `CodigoPase`, `SesionPase` + `FotoEvidencia.paseId`.
- `src/lib/pase.ts` (16 pruebas): normaliza el celular peruano como lo
  escribe la gente (+51, guiones, espacios) y exige AL MENOS un contacto.
- `pase.service.ts`: alta, revocar (que tira sus sesiones en el acto),
  pedir codigo con **silencio deliberado** y limite de 3 por 15 min, generar
  codigo para dictar, verificar con `timingSafeEqual`, y `obtenerPase`, que
  revalida TODO en cada peticion porque la cookie dura un ano.
- `sms.service.ts` para json.pe. **OJO: no es un proveedor en la nube**, el
  SMS sale de un movil Android con su app instalada y vinculada; si ese
  telefono se apaga o se queda sin saldo, no sale ningun codigo. Por eso el
  codigo se manda por SMS **y** correo a la vez, y el residente puede
  generarlo en pantalla para dictarlo. `SMS_TOKEN` es opcional como el SMTP.
- `evidencia.service`: `subirEvidenciaConPase`, `fotosPorDestinoDePase` y
  `archivoEvidenciaDePase`, puertas APARTE de las de sesion —mezclar dos
  modelos de autorizacion en el mismo `if` es como se cuelan los agujeros—.

~~**FALTA, y sin esto no se puede usar**~~ **LOS SEIS, HECHOS el 11 de
agosto.** Se conservan por lo que cada uno explica:

1. ~~Grupo de rutas `(pase)` con layout minimo~~ (el de `(dashboard)` arrastra
   cabecera, riel y pestanas, que en un movil en obra sobran).
2. ~~`/pase/[obraId]`: identificarse + codigo.~~ **Anadir `/pase` a
   `RUTAS_PUBLICAS` en `proxy.ts`**, y que si trae `gcm_sesion` redirija a
   `/obras/[id]/evidencia`. *Hubo que anadir tambien `/api/evidencia`, que no
   estaba previsto: ver la trampa arriba.*
3. ~~`/pase/[obraId]/cargar`: el menu~~ (reutilizar `MenuEvidencia` con una
   interfaz mas estrecha que `LookaheadDatos`). *Ademas hizo falta `menuDePase`
   en el servicio: el lector que habia exige sesion.*
4. ~~`/api/evidencia/[id]` que acepte pase.~~
5. ~~Pantalla **Personal** de la obra: alta, lista, revocar y «generar codigo».~~
6. ~~`enlaceEvidencia({obra:true})` debe apuntar a `/pase/[obraId]`~~, no a
   `/obras/[id]/evidencia`.

**Del usuario**: decidir QUE telefono hace de emisor si se activa el SMS.

### SMS con la linea propia, SIN json.pe (decision del usuario)

El usuario quiere prescindir de json.pe y usar los SMS de su propia linea.
Se le explico que json.pe no es un proveedor en la nube sino una app Android
que manda desde su telefono, y que construir esa app es OTRO producto (Kotlin,
Play restringe el permiso SEND_SMS, y lo dificil no es enviar sino mantener
la app viva contra el gestor de bateria de cada fabricante).

**La via que si se puede construir aqui, y que hace lo mismo**: invertir el
sentido. En vez de que GCM llame al telefono, el telefono pregunta a GCM.

1. GCM guarda los SMS pendientes en una cola y los expone en una ruta
   protegida por un token largo (variable de entorno, nunca en el repo).
2. En el celular emisor se configura **MacroDroid o Tasker** —apps que ya
   existen en Play— para consultar esa ruta cada ~20 s, enviar lo que haya
   con su SIM y avisar a GCM de que salio. **Cero desarrollo movil**: es
   configuracion.
3. `sms.service.ts` ya aisla el canal: cambiar json.pe por la cola es
   sustituir `enviarSms`, nada mas.

**Riesgos que hay que decir en voz alta, no esconder**:

- **La cola lleva los codigos OTP en claro.** Quien obtenga el token lee los
  codigos del personal antes que ellos. Mitigacion: secreto largo, HTTPS,
  borrar el mensaje en cuanto se marca enviado, y la caducidad de 10 min que
  ya tiene el codigo. Aun asi, es el punto debil del diseno.
- El telefono sigue siendo punto unico de fallo (bateria, saldo, cobertura,
  el gestor de bateria de Android).
- La operadora puede cortar por antispam el envio repetitivo desde una SIM
  personal. Eso no lo arregla ningun software.

**Orden acordado**: primero las pantallas con correo + codigo en pantalla
—que no cuestan nada y dejan el pase usable—, y la cola de SMS despues.

### La cola: CONSTRUIDA el 11 de agosto, DORMIDA hasta que se configure

Esta todo escrito y probado, y **no hace nada hasta que exista
`SMS_COLA_TOKEN`**. Sin esa variable la ruta responde 404, `enviarSms` cae al
canal de antes y nadie consulta la tabla nueva.

Piezas:

- `MensajeSms` (migracion `20260811010133_cola_de_sms`).
- `lib/sms-cola.ts` (13 pruebas): leer la credencial de la cabecera,
  compararla en tiempo constante y decidir si un prestamo caduco.
- `sms-cola.service.ts`: encolar, entregar con prestamo, confirmar y purgar.
- `GET`/`POST` en `/api/sms/cola`, con `Authorization: Bearer`.
- `sms.service.ts` elige canal: la cola manda sobre json.pe.

**Como se activa** (lo hace el usuario, no se puede desde aqui):

1. Generar un secreto largo (`openssl rand -base64 48`) y ponerlo como
   `SMS_COLA_TOKEN` en Setup Node.js App de cPanel. Minimo 32 caracteres.
   **Un token mas corto ya NO tumba la aplicacion** (lo hacia hasta el 11 de
   agosto, con `.min(32)` en `env.ts`): ahora deja la cola apagada y lo dice
   en el log. Lo opcional degrada, como el SMTP.
2. En el telefono emisor, MacroDroid o Tasker con dos pasos que se repitan
   cada ~20 s:
   - `GET https://gcm.drcaceresruiz.com/api/sms/cola` con la cabecera
     `Authorization: Bearer <token>`. Devuelve `{"mensajes":[{id,numero,texto}]}`.
   - por cada uno, enviar el SMS con la SIM y despues
     `POST` al mismo sitio con `{"enviados":["<id>"]}`.

**Decisiones que no son evidentes:**

- **Es un PRESTAMO, no una entrega.** Si el telefono recoge y no confirma en
  90 segundos, el mensaje se vuelve a ofrecer. Mandar dos veces el mismo
  codigo es inofensivo —es el mismo—; no mandarlo, no. Con un tope de 5
  entregas para no reintentar en bucle contra un telefono sin saldo.
- **El texto se borra al confirmar.** La fila queda para saber que salio, no
  que decia.
- **La credencial va en la cabecera, nunca en la URL**: los servidores
  escriben las URL en su log de accesos y ahi el secreto quedaria en claro.
- **Sin cola configurada responde 404 y no 401**: un 401 invitaria a seguir
  probando credenciales contra algo que no existe.

**EL RIESGO, dicho otra vez**: por esa cola viajan los codigos del pase EN
CLARO, porque hay que poder mandarlos. Quien obtenga el token los lee antes
que su destinatario. Lo acotan el borrado al enviar, la caducidad de diez
minutos y que el codigo en si dura eso y admite tres intentos. Es el punto
debil del diseno y se acepto a sabiendas.

**FALTA**: probarla con un telefono de verdad. Desde aqui solo se puede
verificar que la ruta responde 404 sin token y 401 con uno equivocado.

### Si un SMS no llega: el orden en que hay que mirarlo (11 de agosto)

Sacado de un caso real. **La primera comprobacion no necesita entrar al
servidor**: pedir `GET https://gcm.drcaceresruiz.com/api/sms/cola` sin
cabecera y leer el codigo de respuesta.

| Respuesta | Que significa | Que hacer |
|---|---|---|
| **404** «No disponible» | No hay `SMS_COLA_TOKEN` en cPanel, o mide menos de 32 | Ponerlo y reiniciar |
| **401** «No autorizado» | El token esta puesto y la cola esta encendida | Seguir por la tabla |
| Otra cosa | El despliegue no entro, o la app esta caida | Mirar el despliegue |

Con 401, el siguiente sospechoso es **la tabla `mensajes_sms`**: la migracion
`20260811010133_cola_de_sms` es un paso MANUAL y el workflow no la aplica. Si
no esta, `encolarSms` revienta, el error se traga en el log y no sale ningun
SMS. Se comprueba en phpMyAdmin, y se arregla con el SQL de la migracion mas
`migrate resolve --applied`.

Y si la tabla existe, lo dice el telefono: la notificacion permanente de la
app. `Sin mensajes · 14:32` **con la hora avanzando** significa que pregunta
bien y que GCM no tiene nada que darle; la hora parada significa que Android
la durmio (falta quitar el ahorro de bateria, y en Xiaomi/Huawei/Oppo/Samsung
ademas la lista del fabricante); un 401 ahi significa que el token del
telefono no coincide con el de cPanel.

**COMO ACABO el caso del 11 de agosto, que es lo que hay que leer**: no era
la tabla. Era **una instancia vieja de 26 horas** (ver el aviso del principio)
que servia parte de las peticiones con codigo anterior a la cola: alli
`enviarSms` solo conocia json.pe, y sin `SMS_TOKEN` no mandaba nada y se
callaba. Matando ese proceso, el SMS llego. Camino recorrido, por si vuelve:
404/401 en la ruta -> migraciones -> tabla -> **procesos vivos** -> telefono.
**Empezar por los procesos la proxima vez**, que cuesta un `ps`.

Dos cosas mas que salieron por el camino y hay que corregir en
`infraestructura.md`, porque su procedimiento de migraciones las da por
supuestas:

1. **`source ...activate` ya NO deja `DATABASE_URL` en el shell.** Se
   comprobo el 11 de agosto: con el entorno activo, `$DATABASE_URL` viene
   vacia y `prisma` no arranca. La receta escrita da por hecho lo contrario.
   Lo que si funciona es tomarsela prestada al proceso vivo:
   ```
   PID=$(ps -u "$USER" -o pid,cmd | grep next-server | grep -v grep | awk '{print $1}' | head -1)
   export DATABASE_URL="$(tr '\0' '\n' < /proc/$PID/environ | sed -n 's/^DATABASE_URL=//p')"
   ```
   O copiarla de cPanel -> Setup Node.js App -> Environment variables.
2. **No hay `.env` en `~/gcm`, y es a proposito**: el workflow lo borra del
   paquete (`rm -f deploy/.env`) para no pisar la configuracion del servidor
   con la de desarrollo. Que nadie lo busque ahi.

**Y un aviso sobre `migrate status`**: dijo «Database schema is up to date!»
teniendo **28** migraciones cuando el repositorio tiene **29**. No miente
—esta al dia con las que ve— pero **no detecta una migracion que no llego al
servidor**. Para eso hay que contar carpetas:
`ls ~/gcm/prisma/migrations | grep -c '^2026'` contra las del repositorio.

> **CORRECCION DEL 12 DE AGOSTO: la causa NO era que el deploy tirara
> archivos.** Ese dia se dijo aqui que el FTP habia dejado caer
> `20260811010133_cola_de_sms`, y era falso. El paquete SIEMPRE las llevo: el
> workflow hacia `cp -r prisma deploy/prisma` y, como el build de Next ya
> habia creado `deploy/prisma`, `cp -r` metia el directorio DENTRO. Las
> migraciones viajaban a `prisma/prisma/migrations` y las de
> `prisma/migrations` eran restos de un despliegue antiguo.
>
> Se vio al mirar `ls ~/gcm/prisma/prisma/migrations`, que las tenia TODAS.
> Ayer se «recreo a mano» una carpeta que ya estaba, un nivel mas abajo.
>
> **Arreglado en el workflow** (`mkdir -p deploy/prisma` + `cp -r prisma/.`),
> con una comprobacion que compara cuantas migraciones tiene el repositorio y
> cuantas el paquete, y **falla en rojo** si no coinciden. La leccion vale mas
> que el arreglo: el sintoma —«falta un archivo»— apuntaba al FTP, que ya
> tenia fama de perder cosas, y esa fama hizo de coartada durante dos dias.

**Lo que ese caso destapo, y ya esta arreglado**: la cola encendida ANULABA el
respaldo de json.pe —`enviarSms` no lo probaba ni cuando el encolado
fallaba—, y la pantalla de Personal afirmaba «tambien se le envio por SMS y
correo» pasara lo que pasara. Ahora los canales se recorren en orden
(`canalesAProbar`, en `lib/sms.ts`, probado) y la pantalla avisa de que no
salio y de que hay que dictar el codigo. El aviso NO se da en la pantalla
publica del pase: alli decir que el SMS fallo confirmaria que ese numero esta
dado de alta, que es justo lo que el silencio protege.

### Que mas puede hacer el canal de SMS (ideas del 11 de agosto)

**El hallazgo de fondo, que vale mas que cualquier mensaje concreto**: el
telefono pregunta cada ~20 segundos, y `recogerPendientes` ya aprovecha ese
golpe para purgar la cola. Este hosting **no tiene cron para la logica de la
aplicacion** —esta anotado como limitacion— y de repente hay algo que late
solo. Es la pieza que faltaba para que GCM avise de cosas sin que nadie abra
una pantalla. **Con una advertencia**: si el telefono se duerme, ese reloj se
para, asi que nada critico puede colgar SOLO de ahi.

Por orden de lo que aporta:

1. **2FA y recuperacion de clave por SMS.** Elegida para empezar; ver arriba.
2. **Los avisos del panel «Que falta», empujados.** `lib/pendientes.ts` ya
   calcula las ocho reglas, incluida la mejor —tareas que arrancan en 14 dias
   sin nadie contratado—. Hoy solo existen si alguien abre el tablero; por SMS
   llegan la manana en que todavia se puede hacer algo.
3. **Recordatorio del dia de corte** para cerrar el plan semanal. El PPC
   honesto depende de que alguien cierre a tiempo y hoy no lo recuerda nadie.
4. **«Tienes 3 ordenes esperando tu aprobacion»**, para quien tiene
   `orden:aprobar` o `movimiento:aprobar`.
5. **Los recordatorios de las Notas** (seccion 5), para los que no esperan.

**Lo que NO da de si, y conviene no prometerlo:**

- **Es solo de SALIDA.** La app Android manda, no recibe. Un parte diario por
  SMS entrante —que seria justo lo que falta— no se puede sin tocar la app y
  anadir lectura de SMS, que es otro producto.
- **Un telefono y una SIM.** Punto unico de fallo, y la operadora corta por
  antispam el trafico repetitivo. Eso condiciona el diseno entero: **avisos
  escasos y valiosos, no notificaciones de todo.**

**Regla a poner desde el primer dia**: preferencias por usuario y un tope
diario por numero. Si el primer mes la gente recibe seis SMS al dia, silencia
el numero y ya no lee un aviso nunca mas —el mismo motivo por el que en el
tablero se decidio que nada parpadee—.

## 6f. Segundo factor por SMS — HECHO (12 de agosto)

El codigo de acceso ya puede llegar por SMS. **Lo elige cada persona en su
perfil, y es UNO de los dos, no los dos a la vez**: eso lo distingue del pase
de obra, que manda por correo y SMS a la vez a proposito porque alli lo que
importa es que el codigo llegue como sea.

Piezas:

- Migracion `20260811160014_segundo_factor_por_sms`: `User.canal2FA`,
  `User.celularVerificadoAt`, y en `CodigoAcceso` los campos `proposito` y
  `destino` (con `tokenHash` ya nulable).
- `lib/contacto.ts` **nuevo**: `normalizarCelular` y compania se mudaron ahi
  desde `lib/pase.ts`, que las reexporta. Autenticacion no puede importar del
  pase de obra: son dominios distintos y el que manda no es el pase.
- `lib/dosFactores.ts`: `canalEfectivo` y `enmascararDestino`, con pruebas.

**Cuatro decisiones que no se deben deshacer sin pensarlo:**

1. **El celular hay que VERIFICARLO** antes de poder elegirlo. Se guardaba
   texto libre —«+51 987 654 321»— que nadie leia y que `enviarSms` no sabe
   marcar; ahora se normaliza a nueve cifras y se comprueba con un codigo. Sin
   esto, un digito mal tecleado deja a esa persona fuera de su cuenta **sin un
   solo aviso**, porque el envio de SMS se traga los errores a proposito.
2. **Cambiar el numero borra la verificacion y baja el canal a correo.** Ese
   campo se edita sin aprobacion y sin pedir la clave, asi que sin esto, quien
   pillara una sesion abierta pondria su numero y se auto-enviaria los codigos
   de acceso de esa cuenta.
3. **Si el SMS falla, el codigo sale por correo.** No es mandarlo por los dos:
   es que un SMS fallido no puede dejar a nadie fuera de su propia cuenta.
4. **El limite de reenvios NO deja a nadie sin codigo**, a diferencia del
   pase: baja al correo, que es gratis. Aqui quien pide ya acerto su clave, no
   es un desconocido bombardeando; lo que se protege es el gasto de la linea.

> **EL RIESGO, dicho en voz alta:** por la cola de SMS los codigos viajan EN
> CLARO, y desde hoy por ahi pasan tambien los del segundo factor. Eso sube el
> valor de `SMS_COLA_TOKEN` de «puede subir fotos a una obra» a «puede leer el
> codigo de acceso de cualquiera que haya elegido SMS». Se acepto a sabiendas.
> La alternativa era mandar el 2FA solo por json.pe, que devuelve la
> dependencia de un tercero —justo lo que se quiso quitar—.

**ANTES DE USARLO EN PROD**: aplicar la migracion, que es paso MANUAL, y
contar despues las carpetas de `prisma/migrations` (el deploy pierde archivos;
ver el aviso de la seccion 6e). Sin ella la aplicacion **no arranca**: el
codigo consulta columnas que no existirian.

**PROBADO DE PUNTA A PUNTA EN PRODUCCION** el 12 de agosto: guardar el
celular, pedir el codigo, verificarlo, elegir SMS, salir, entrar, recibir el
codigo por SMS y pasar. Funciona.

> **Las dos cosas que fallaron eran de pantalla, no de logica, y las dos son
> el mismo error mio**: dejar un control apagado sin decir por que.
>
> 1. La tarjeta de SMS salia en gris y se leyo como «no me deja elegir SMS» en
>    vez de «me falta verificar el celular». El motivo estaba escrito, pero en
>    otra caja mas abajo, y nadie relaciona las dos.
> 2. Peor: se puede elegir canal y verificar un telefono **con la verificacion
>    en dos pasos apagada**, y entonces no llega ningun codigo porque no se
>    pide ninguno. La pantalla aparentaba funcionar entera.
>
> Las dos arregladas: el motivo va ahora EN la tarjeta, y la seccion del canal
> avisa en cabecera cuando el segundo factor esta desactivado. **La regla, que
> ya estaba escrita para el panel «Que falta» y aqui se olvido: un control
> apagado y mudo se lee como una aplicacion rota.**

## 6g. Tablero de configuracion de la empresa (pedido el 12 de agosto)

El usuario quiere que el administrador de la empresa tenga un panel modular de
configuracion, ampliable, y que una de las opciones sea **elegir el telefono
que manda los SMS de la plataforma**.

**El matiz tecnico que hay que fijar antes de construir nada**: GCM hoy NO
sabe que telefono manda. El emisor se configura en el propio telefono
(direccion + token) y el tira de la cola; no existe ningun numero que cambiar.
Asi que «cambiar el emisor» solo puede ser una de dos cosas:

- **Dejarlo anotado**, para saber cual es el telefono de guardia. Cosmetico.
- **Registrar VARIOS emisores**, cada uno con su token, y elegir cual sirve la
  cola. Eso si es real: da telefono de respaldo y saca el secreto del entorno
  a la base.

**Y lo que de verdad lo hace urgente**: `SMS_COLA_TOKEN` es UNA variable de
entorno para toda la plataforma. Mientras GCM sea de una sola constructora da
igual, pero con la segunda **todas compartirian el mismo telefono emisor, y
los codigos de acceso de una empresa saldrian por el movil de otra**. La
configuracion por empresa no es un adorno: es lo que le falta a la cola de SMS
para poder venderse. Ver [vender GCM a otras constructoras].

Condicion de diseno acordada: que no sea un saco de ajustes sueltos. Que cada
opcion diga **a que afecta y que se rompe si se apaga**, como hace el panel
«Que falta».

### Como reparte el APK una constructora que no es la nuestra

Pregunta del usuario, y es la parte que hoy NO existe. El APK sale de
**Actions -> artefacto**, que caduca a los 90 dias y exige cuenta de GitHub:
ningun administrador ajeno puede llegar ahi. Tres cosas a resolver, y la
obvia es la menos importante:

1. **Donde vive el APK.** GitHub **Releases** en vez de artefactos: enlace
   publico, permanente y sin login. O servirlo desde el propio GCM.
2. **La firma.** Hoy se compila en modo debug y la clave se regenera en cada
   ejecucion, asi que **cada version tiene firma distinta y Android no deja
   actualizar encima**: habria que desinstalar y reinstalar, perdiendo la
   configuracion. Hace falta una clave de firma estable como secreto del
   repositorio. Es lo que romperia una actualizacion dentro de seis meses sin
   que nadie entienda por que.
3. **Como se configura sin pegar un secreto.** Pedirle a alguien que copie un
   token de 48 caracteres en un movil es garantia de error, y obliga a mandar
   el secreto por correo o WhatsApp.

**La propuesta para el punto 3, que es la que cambia el diseno**: un **codigo
de emparejamiento**. El administrador pulsa «Vincular telefono», GCM ensena
seis cifras, el APK las pide UNA vez y a cambio recibe el token de verdad y lo
guarda. El secreto no pasa nunca por manos humanas ni por un chat, y el
emparejamiento caduca en minutos. Es el mismo mecanismo del pase de obra, que
ya esta construido y probado —`CodigoPase`, `timingSafeEqual`, tope de
intentos—.

**Y lo que hay que decirle al cliente ANTES de vender, no despues**: cada
constructora necesita **su propio telefono con su propia SIM**, encendido y
con el ahorro de bateria quitado. Eso es un coste operativo suyo, no un boton.
Para quien no lo quiera, la salida honesta es correo solamente.

### Lo construido el 12 de agosto

Migracion `20260811173658_emisor_sms_por_empresa`: modelo **`EmisorSms`** (con
`tokenHash`, nunca el token) y **`MensajeSms.companyId`**. Pantalla en
`/empresa/configuracion`, UNA sola entrada de menu con secciones dentro -el
desplegable de empresa ya llego a tener siete entradas planas y hubo que
agruparlo-.

**Cinco cosas que no se deben deshacer sin pensarlo:**

1. **`confirmarEnviados` filtra por el MISMO alcance que `recogerPendientes`.**
   Sin eso, el telefono de una constructora podria marcar como enviados los
   mensajes de otra con solo acertar sus identificadores, y esos codigos
   desapareceran de la cola sin haberse mandado: una denegacion de servicio
   silenciosa entre clientes. Era el fallo mas facil de dejar pasar.
2. **`purgar` NO filtra por empresa**, y lleva comentario. Cuelga del latido
   de cualquier emisor porque este hosting no tiene cron para la logica de la
   aplicacion; si filtrara, la basura de una empresa con el telefono apagado
   no se limpiaria nunca, que es cuando mas se acumula.
3. **En el pase publico el `companyId` sale de la OBRA, jamas de la peticion.**
   Alli no hay sesion y el `obraId` viene de un QR pegado en una caseta.
4. **`configuracion:editar` es INNEGOCIABLE.** No por ser "ajustes": quien
   vincula un emisor puede leer los codigos de acceso de toda su empresa. Es
   de la misma familia que `permiso:editar`.
5. **`SMS_COLA_TOKEN` YA NO EXISTE — borrado el 12 de agosto de 2026.** Era la
   transicion para que nadie se quedara sin SMS el dia del cambio, y estaba
   pensada para borrarse: mientras existiera, un solo secreto alcanzaba la cola
   de cualquier empresa sin emisor propio —varias a la vez—, y por esa cola
   viajan los codigos del pase y del segundo factor EN CLARO. Se comprobo en
   produccion que la unica empresa ya tenia su emisor activo, asi que quitarlo
   no dejo a nadie sin SMS. Una empresa sin emisor propio no tiene cola y sus
   codigos salen por correo.

**La ruta `/api/sms/cola` ya no responde 404** cuando no hay cola configurada:
ahora existe siempre y quien decide es la credencial, asi que todo lo que no
case es un 401.

**FALTA**: vincular el telefono real desde la pantalla y comprobar que los SMS
siguen saliendo con el token nuevo. Y queda pendiente el **emparejamiento por
codigo**, que evitaria copiar el token a mano pero obliga a tocar el APK.

## 6h. Las restricciones se eligen, no se siembran — HECHO (11 de agosto)

Lo pidio el usuario final con estas palabras: «en el lookahead actual todas las
tareas nacen con restricciones (...) que mejor que todas nazcan sin
restricciones, que si las hay debe ser posible decir o seleccionar cuales».
Cinco puntos; se hicieron **los cuatro primeros** y el quinto (avisos a los
implicados) quedo aplazado a proposito: ver la lista del principio.

**El obstaculo no era la siembra, era la ambiguedad.** Con las 7 sembradas,
«cero restricciones» y «nadie la ha mirado» eran la MISMA fila, y sobre esa
equivalencia se apoyaba medio sistema: `estadoDeTarea([])` daba PENDIENTE, el
panel «Que falta» contaba «tareas sin analizar» como «sin sincronizar», y el
pase de obra solo ofrecia tareas sincronizadas porque eran las que tenian donde
colgar una foto. Dejar de sembrar sin mas habria clavado la confiabilidad en
0%, convertido el aviso de «comprometes sin liberar» en ruido permanente y
hecho que «Que falta» acusara de tener restricciones sin liberar a tareas que
no tienen ninguna.

La pieza que lo desbloquea es **`analizadaAt`/`analizadaPor`**: la decision, con
quien y cuando. Con ella, analizada + cero restricciones = **LISTA**, que es el
caso que antes no se podia expresar.

Migracion `20260811180000_lookahead_analisis`. En CRIOCORD retiro 203 de las 210
restricciones sembradas (29 tareas que nadie habia tocado vuelven a «sin
analizar») y conservo entera la unica con trabajo encima, marcandola analizada.
Cero fotos huerfanas, cero estados divergentes, cero flujos duplicados.

**Lo que no se debe deshacer sin pensarlo:**

1. **`planificarFlujos` vive en `@/lib/lookahead`, no en el servicio.** Es la
   regla que decide que se borra al reelegir flujos, y en este proyecto **no
   hay tests de servicio**: si vive en `lookahead.service` no la prueba nadie.
   Nunca borra una restriccion resuelta, con fotos o con nota:
   `FotoEvidencia.restriccionId` es `SET NULL`, asi que borrarla dejaria la foto
   sin ninguno de sus dos anclajes e invisible para siempre en toda pantalla.
   Se conserva y **se informa en la propia pantalla**, que es la linea de
   «informa, no bloquea» del panel «Que falta».
2. **`recalcularEstados` es el UNICO escritor de `LookaheadTask.estado`.** Antes
   lo era `alternarRestriccion` por accidente —era la unica funcion que tocaba
   restricciones—. Con cuatro escritores eso deja de ser una propiedad. Si
   aparece un segundo `lookaheadTask.update({ data: { estado } })`, la columna y
   `estadoDeTarea` divergen y el aviso de `comprometerAlPts` miente sin que
   nada falle. De paso arreglo que `alternarRestriccion` pisara el `BLOQUEADO`
   manual, que hacia ese valor del enum inalcanzable en la practica.
3. **`@@unique([lookaheadTaskId, tipo])`.** Solo habia un INDEX. Con la siembra
   fija no dolia; ahora los flujos se anaden de uno en uno y un duplicado seria
   INVISIBLE: la matriz indexa por tipo, ensenaria uno y el otro contaria para
   el estado.
4. **«Sin analizar» y «sin liberar» son avisos DISTINTOS**, en `pendientes.ts`,
   en el tablero y en el dialogo del PTS. Juntarlos era acusar dos veces del
   mismo hueco, y encima con gravedad critica sobre tareas sin restricciones.
   Un aviso falso ensena a saltarse el dialogo entero.
5. **La casilla de seleccion cuelga de `lookahead:gestionar` O
   `plan_semanal:gestionar`.** Colgaba solo del segundo, de cuando la seleccion
   servia unicamente para comprometer.

**Sin restriccion no hay evidencia, y es coherente**: la foto existe para probar
que una restriccion quedo levantada. Una tarea analizada sin ninguna sale en el
menu del pase pero deshabilitada, con el motivo escrito —si desapareciera, el de
campo veria faltar una tarea que sabe que existe y concluiria que la aplicacion
esta rota—. Anclar la foto a la tarea entera se valoro y se descarto: obliga a
una tercera rama en `DestinoEvidencia` y toca subida, consulta, QR y pase. Queda
anotado por si el uso lo pide.

## 6i. Lo incumplido no se arrastra a ninguna parte (visto el 11 de agosto)

Encontrado mirando CRIOCORD con el usuario, despues del rework del Lookahead.
**Los tres de esta seccion se construyen DESPUES de los avisos a los
implicados**, en el orden de la lista del principio: primero el aviso de
numeracion, luego el arrastre, luego el texto del PPC (decision suya).

### Lo que hace hoy

Al cerrar una semana, un compromiso incumplido se queda ahi: alimenta el PPC y
el Pareto —que es su trabajo— y no se propaga a nada mas. No se registra avance
fisico (`porcentajeARegistrar` se abstiene sin porcentaje ni meta, y eso esta
bien: antes escribia un 100 falso). Y **no existe ninguna lista de «lo que
quedo pendiente de la semana pasada»**.

Para recuperarlo hay que ir al Lookahead, reconocer la tarea por la marca «En
S-2» y volver a comprometerla, aceptando el aviso de «ya comprometida en otra
semana». Funciona, pero exige que alguien se acuerde.

### El agujero

El Lookahead solo muestra tareas cuyo rango solapa **[hoy, hoy + N semanas]**.
Una tarea incumplida **cuya fecha programada ya paso desaparece de las dos
pantallas** y queda solo dentro de una semana cerrada que nadie reabre.

Red de seguridad parcial que YA existe: el panel «Que falta» avisa de «N tareas
empezaron y nadie ha reportado avance», que las pescaria por otro camino. Pero
no dice lo que importa: **«esto lo prometiste, fallo, y sigue sin hacerse»**.

### Por que pesa mas de lo que parece en esta obra

El Pareto de CRIOCORD al 11 de agosto: **5 de 5 incumplimientos con la MISMA
causa, «Prerrequisito / tarea previa»**. Ni una sola barra mas. A esta obra no
le falta material ni cuadrilla: le falta secuencia, se promete trabajo cuya
tarea previa no esta terminada. Y el PPC cayo de 100% a 62% cuando eso empezo a
acumularse.

Con ese diagnostico, lo que hay que vigilar es justo lo que quedo a medias, que
es lo que hoy se pierde de vista. Ademas da el argumento contra descartar el
flujo REQUISITOS a la ligera en esta obra: es el unico que le esta rompiendo la
semana.

### Forma probable

Una regla mas en `pendientes.ts` —compromiso incumplido en semana CERRADA, sin
avance posterior— y una forma de traerlos a la semana nueva sin buscarlos a
mano. Ojo con el ruido: si arrastra todo lo que fallo alguna vez, en dos meses
es una lista que nadie lee. Probablemente haya que acotar por antiguedad o por
que la tarea siga sin terminarse.

### Dos defectos pequenos vistos el mismo dia

1. **La numeracion de semanas no sigue a la fecha.** En CRIOCORD la Semana 3
   cierra el 14/08 y la Semana 2 el 15/08. El correlativo es `max(numero) + 1`
   y no mira `fechaCorte`, asi que crear una semana con corte anterior deja el
   numero a contramano. Lo demas es coherente —tarjetas y tendencia se ordenan
   por fecha, y el tablero toma como «ultima» la de fecha mayor—: el que
   confunde es el rotulo. **Arreglo recomendado: avisar al crear** una semana
   con fecha anterior a otra existente. Renumerar NO: cambiaria numeros de
   semanas cerradas que pueden estar citados en actas.
2. **El texto del PPC bajo miente entre 50% y 70%.** `pendientes.ts` dice
   «Menos de la mitad de lo prometido se cumple con regularidad» con un PPC de
   62%, y el umbral de critica es 70. La frase es fija y no mira el valor. Son
   dos lineas y un test.

## 6d. Panel «Que falta» (10 de agosto)

La ayuda visual permanente que pidio el usuario: un modulo del tablero que
dice que hay que completar y QUE SE ROMPE si no. Decidido con el: panel
resumen (no avisos dispersos) e **informa, no bloquea**.

GCM sabia muchas cosas que no decia. Ocho reglas, en
`src/lib/pendientes.ts` (puro, 18 pruebas) + `pendientesDeLaObra` en
`tablero.service`:

- Tareas empezadas sin avance reportado -> la curva las cuenta al 0%.
- Semanas cerradas sin % alcanzado -> contaron para el PPC y no movieron la
  curva (el defecto que se arreglo hoy dejaba de escribir el 100 falso, pero
  el hueco hay que verlo).
- Tareas que arrancan en 14 dias sin nadie contratado -> **la idea del
  usuario**: cruza el mapeo con los encargos vigentes. Es el aviso que
  ninguna hoja de calculo puede dar.
- Tareas que arrancan con restricciones sin liberar (solo las ANALIZADAS: ver
  6h, antes acusaba tambien a las que nadie habia mirado).
- Tareas que arrancan en 14 dias y nadie ha analizado -> critica, anadida el
  11 de agosto: ahi ya no queda margen para conseguir lo que falte.
- Tareas de la ventana sin analizar -> la confiabilidad miente.
- Partidas sobregiradas, PPC bajo o cayendo, cobertura de mapeo baja.

Decisiones de forma: **nada parpadea** (lo que parpadea se ignora a los tres
dias); color + icono + texto, nunca color solo; cada linea con enlace a donde
se arregla; y con la obra al dia el modulo se pinta en VERDE en vez de
desaparecer —si desapareciera, nadie sabria si esta al dia o roto—.

Casi todo sale de lo que el tablero YA tiene en memoria (`medirAvance` deja
en cada tarea si hay avance reportado). Solo se consulta de mas lo que cruza
dinero con tiempo. **Ojo al ampliarlo**: el peso de `datosTablero` tumbo
produccion el 10 de agosto.

**Pendiente**: probarlo con datos reales en pantalla; los textos de las ocho
reglas solo se han visto en pruebas.

## 7. Defectos conocidos, sin arreglar

- **Ortografía: el sitio entero se escribió sin tildes** (convención heredada
  por miedo a la codificación, que ya no aplica: UTF-8 de punta a punta y
  prod lo sirve bien). El usuario lo señaló el 10 de agosto. **Tandas 1 y 2
  hechas y verificadas en prod** (portada, login, tablero, riel, pestañas, y
  las 109 páginas/componentes: ~440 cadenas). Las tandas **3** (servicios y
  `src/lib` + tests) y **4** (docs) quedaron DETENIDAS el mismo día por
  decisión del usuario ("es suficiente lo de ortografía"): lo que el usuario
  ve en pantalla ya está correcto; los mensajes de error y los docs pueden
  esperar. Si algún día se retoman: los textos de lib están fijados por
  tests (cambiarlos JUNTOS), incluye el "Sin capitulo" de
  `control-avance.ts:361` duplicado en dos páginas, y la regla es solo texto
  visible —no tocar claves, rutas, enums de Prisma ni cookies—.

- **`moduloConDatos` duplica las guardas de `ModuloContenido`**
  (`components/tablero/modulos.tsx`). Estan pegadas y comentadas a proposito,
  pero si algun dia se separan vuelve la caja vacia. Lo correcto es que cada
  modulo declare de que datos depende, en un solo sitio.
- **El modulo de PPC y el de Causas se contradicen a la vista.** Uno dice
  «2 semanas abiertas sin cerrar todavia» y el de al lado «5 incumplimientos
  con causa». No es un error de calculo —el Pareto cuenta TODAS las semanas a
  proposito, incluidas las abiertas— pero leidos juntos no se entienden. Se
  arregla con una palabra en el subtitulo del modulo de causas.
- ~~Sin migas de pan en las subpaginas profundas~~ Resuelto el 10 de agosto
  con la **ruta de la obra** (`RutaObra` + `hitosDeObra`): el ciclo
  Presupuesto → Cronograma → Linea base → Lookahead → Plan semanal como riel
  fijo a la izquierda, con hecho / estas aqui por paso. Pedido por el usuario
  como "diagrama de ubicacion siempre visible".
- **`EnlaceBoton` solo esta en el tablero y en «Editar datos de la obra».**
  Falta decidir los casos raros: pestanas de navegacion, tarjetas enteras que
  son enlace, y enlaces dentro de un parrafo. Convertirlo TODO en boton hace
  que nada destaque.
- **La cookie vieja `gcm-tablero`** sigue en los navegadores, ignorada desde
  que se paso a `gcm-tablero-off`. Inofensiva; caduca sola dentro de un ano.

- ~~**`src/lib/calendario.ts` cuenta los dias en hora LOCAL.**~~ **HECHO el
  22 de agosto de 2026.** `diaIso` usaba `getDay()` y `diasLaborablesEntre`
  usaba `setHours()`/`setDate()`, pero las fechas de obra vienen de
  columnas `@db.Date`, que Prisma devuelve a **medianoche UTC** —y buena
  parte del resto del sistema tambien ancla en UTC (`Date.UTC`,
  `avanzarDiasLaborables`, que ya era UTC desde la entrega de ruta
  critica). Mezclar las dos convenciones en el mismo archivo solo era
  correcto si la zona horaria del proceso de Node coincidia con UTC, algo
  que este repositorio no fija en ningun sitio (`process.env.TZ`) y que
  por tanto dependia de como estuviera configurado el servidor de
  despliegue —investigado a fondo antes de tocar nada: ningun archivo del
  repositorio confirma la zona horaria real de produccion—.

  Se opto por unificar TODO a UTC —la convencion que ya usan las fechas
  `@db.Date` y la mayoria de los llamadores— en vez de arriesgar a
  adivinar cual de las dos convenciones corria en produccion: asi el
  resultado es correcto sin importar la zona horaria del servidor ni la
  del navegador de quien usa la app, en vez de serlo solo "si el servidor
  resulta estar en UTC" o "si resulta estar al oeste de UTC".

  `diaIso`/`esLaborable`/`diasLaborablesEntre` pasan a `getUTCDay()`/
  `setUTCHours()`/`setUTCDate()`, y `avanzarDiasLaborables` ya no necesita
  su copia privada `esLaborableUTC` -llama directo al `esLaborable` ya
  arreglado-. Los tres llamadores que construian fechas en hora LOCAL A
  PROPOSITO para calzar con el `calendario.ts` de antes
  (`TareasAMano.tsx`, `cronograma-manual.service.ts`,
  `edt.service.ts`) pasan a anclar con `Date.UTC(...)`. Los que ya
  anclaban en UTC (`tablero.service.ts`, `lib/ruta-critica.ts` via
  `fechaInicioObra`, `plantilla-cronograma.service.ts`,
  `lib/hitos-predictivos.ts`) no necesitaron ningun cambio: empiezan a
  ser correctos solos, como efecto del arreglo.

  **`parte-diario.ts` ya no arrastra sus ayudantes privados**
  (`diaIsoUtc`/`esLaborableUtc`/`diasLaborablesUtc`, escritos el 12/08
  para no heredar este mismo defecto): se retiraron y el modulo usa
  directamente `diaIso`/`esLaborable`/`diasLaborablesEntre` de
  `@/lib/calendario`, exactamente como preveia esta misma nota.

  Verificado con los 2481 pruebas existentes en verde sin cambiar ningun
  valor esperado -incluidas las que ejercitan estos llamadores a traves
  de `cronograma-manual.service.test.ts`, `edt.service.test.ts`,
  `ruta-critica.test.ts`, `hitos-predictivos` y `tablero.service`-, mas
  `typecheck`/`lint`/`build` limpios. No se pudo verificar en un
  navegador real -sin Claude in Chrome conectado esta sesion-.

---

## 8. Documentacion

- **`docs/MANUAL.md` esta desfasado y ahora ademas compite con otro manual.**
  Desde el 18 de agosto el manual de verdad vive DENTRO de la app (`/manual`,
  23 capitulos) y tiene una prueba que lo ata al menu. El `MANUAL.md` de
  `docs/` describe un panel y unas pestanas que ya no existen. **Hay que
  decidir si se retira o se convierte en otra cosa**; dos manuales que se
  contradicen es exactamente la grieta que el proyecto se ha pasado el mes
  cerrando en otros sitios.
- **Faltan capturas y videos.** Se pidio que el manual fuera «el super
  tutorial para dummies»; hoy es solo texto.

---

## 9. Seguridad

Anotado antes del 10 de agosto, sin tocar:

- ~~**Limite de intentos por IP en el login.**~~ **HECHO el 12 de agosto de
  2026**, contado sobre los `LOGIN_FAILED` que la auditoria ya guardaba, asi
  que no hizo falta migracion. **Y arreglado el 17**: leia la PRIMERA entrada
  de `x-forwarded-for`, que es justo la que escribe quien llama, asi que el
  limite estaba puesto y no protegia de nada. Se lee la ULTIMA, y se arreglo
  en los tres sitios (acceso, recuperacion y pase de obra). De paso se cerro
  algo peor que no estaba anotado: el bloqueo por cuenta **no caducaba**, asi
  que una cuenta con cinco fallos quedaba a merced de cualquiera para siempre.
- ~~**Limite de peticiones a SUNAT.**~~ **HECHO el 19 de agosto de 2026**
  (`lib/limitador.ts`): las consultas de RUC ya no pueden tumbar la IP de
  todos.
- ~~**Cinco consultas sin filtro por empresa**~~ **CERRADO el 12 de agosto de
  2026** con el barrido de `aislamiento.test.ts`, que dobla Prisma con un
  `Proxy` y comprueba la propiedad de verdad —toda consulta lleva el
  `companyId` DE LA SESION— sobre las diez familias de servicios. Encontro una
  fuga que no estaba en esta lista (`obtenerLookahead`).
  - **Pero el 19 de agosto aparecio otra que SI estaba, y en produccion**:
    `actividad.service` resolvia los NOMBRES de usuario sin filtrar, y el
    panel de una constructora recien dada de alta ensenaba el nombre de
    alguien de otra. Las pruebas no lo vieron porque el doble tenia una sola
    empresa dentro. **La prueba nueva tiene DOS y afirma sobre el `where`, no
    sobre lo que devuelve.**
- ~~**Fuga por el texto del error de correo duplicado**~~ **HECHO el 20 de
  agosto de 2026**: un correo que ya es de otra constructora lo dice sin
  revelar de quien, en vez de parecer una fuga. Ojo al contexto: desde el
  20/08 el correo es unico POR EMPRESA, no en toda la instalacion, asi que la
  misma persona puede tener cuenta en dos constructoras.

Nuevo, y sigue abierto:

- **Rotar la contrasena del FTP de produccion.** Hasta el 12 de agosto viajo
  en cada despliegue contra un extremo sin verificar. La verificacion ya esta
  puesta; la credencial no se ha cambiado.
- **`x-forwarded-for` sigue siendo un supuesto.** Que el proxy la escriba en
  vez de dejar pasar la del cliente no lo puede garantizar la aplicacion.

---

## 10. Funcionalidad pendiente

| | Que es | Migracion |
|---|---|---|
| — | Ventana del Lookahead **por obra** (hoy solo en la URL) | Si, una columna |
| — | Empresa de demostracion para el tutorial | No: identificarla por variable de entorno |
| — | Sombrear el area entre plan y real en la curva S | No |
| — | Exportar tablas a Excel (presupuesto y órdenes) —pedido del 10 de agosto—. **Parcial al 21 de agosto**: la propuesta al cliente sale en Excel y el informe semanal en CSV; el presupuesto y las órdenes siguen sin exportarse | No |
| **Fase 2** | Documental: planos, protocolos y guias, con validacion automatica de restricciones | Si |
| **Fase 3** | Sectores de color en el PTS y aviso cuando dos cuadrillas coinciden en el mismo sitio | Si |
| ~~**Fase 4**~~ | ~~«Cumplio» calculado desde la cantidad ejecutada, linea de meta, causa raiz~~ **HECHA el 12 y el 18 de agosto** | No |
| **Fase 5** | Motor de reglas | Por definir |

---

## 11. Limitaciones del asistente

Para que ninguna sesion futura pierda tiempo redescubriendolas:

- ~~**No hay acceso de escritura fuera de la carpeta del proyecto.**~~
  **Falso desde el 21 de agosto de 2026**: los archivos de memoria del perfil
  (`~/.claude/projects/.../memory/`) si se pueden escribir. Aun asi **la
  continuidad sigue viviendo en `docs/`**, y a proposito: la memoria del
  perfil se perdio entera al reinstalar Claude el 20 de agosto, y `docs/` no.
  La memoria sirve para lo que no se deduce del repositorio; el estado del
  proyecto va aqui.
- ~~No se pueden ejecutar `tsc`, `vitest` ni `lint`.~~ **RESUELTO el 10 de
  agosto: SI se pueden.** La causa nunca fue que faltaran las herramientas,
  sino la directiva de ejecucion de PowerShell, que bloquea los envoltorios
  `.ps1` (`npx.ps1`, `npm.ps1`) con `UnauthorizedAccess`. Se esquiva
  llamando a Node directamente, sin pasar por el `.ps1`:

  ```
  node node_modules/typescript/bin/tsc --noEmit
  node node_modules/vitest/vitest.mjs run
  node node_modules/eslint/bin/eslint.js .
  node node_modules/next/dist/bin/next build
  ```

  El `build` es el mas valioso de los cuatro y conviene correrlo antes de
  empujar: es el UNICO que detecta que un modulo `server-only` se filtro al
  paquete del navegador, cosa que `tsc` no ve. **Sigue en pie no empujar
  nada sin verificar**; lo que cambia es que ya no hace falta pedirselo al
  usuario.

  Lo que sigue sin poderse: **entrar a la app en local**, porque la clave se
  genera al sembrar la base y el asistente no la tiene. Todo lo que exija
  sesion (subir una foto, ver una pantalla por dentro) hay que pedirselo al
  usuario o que comparta credenciales de prueba.
- **Cuidado con el navegador automatizado.** Comprobar `document.hidden`
  antes de creerse lo que se ve: una pestana en segundo plano estrangula los
  temporizadores y no ejecuta `requestAnimationFrame`. El 10 de agosto eso
  hizo parecer que produccion estaba rota mas tiempo del que lo estuvo.
- **Y mirar la pantalla antes de teorizar.** Ese dia se midio si una pagina
  tenia contenido contando caracteres de texto, y el problema era justamente
  un esqueleto de carga, que no tiene texto. Una captura lo habria resuelto en
  un minuto en vez de en una hora.
