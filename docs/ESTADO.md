# Estado del proyecto GCM

Documento de traspaso. Léelo antes de tocar nada: recoge lo construido y por
qué está construido así.

**Lo que FALTA vive en [`PENDIENTES.md`](PENDIENTES.md)**, aparte, para poder
tacharlo sin reescribir esto.

Última actualización: 25 de agosto de 2026.

> **Este documento se escribió por capas y las más nuevas van arriba.** Las
> secciones numeradas del final son del 8 de agosto; los anexos recogen lo
> ocurrido después. **Ante una contradicción, manda siempre el anexo más
> reciente**, que es el del 25 de agosto.
>
> Entre el 12 y el 21 de agosto entraron 297 commits y el sistema cambió de
> forma en cosas de fondo —el contractual ahora se genera desde el presupuesto
> real, y los gastos generales dejaron de ser de la obra—. Si algo de más
> abajo te suena raro, comprueba primero si el anexo lo desmiente.

---

## Anexo — 25 de agosto de 2026

El día del **recorrido con los ojos de un residente**, que era el último hueco
de verificación abierto. Cuatro fallos reales, y el hilo vuelve a ser el mismo
del día anterior: *la batería estaba verde y aun así estaban ahí.*

- **La pantalla de usuarios ofrecía todos los botones de gestión** a quien solo
  tenía `usuario:leer`. Un residente veía «Resetear clave» sobre el
  administrador principal. Cada control lleva ya su permiso.
- **La pregunta al asistente desaparecía** de la conversación: se leía del
  campo después de que la acción respondiera, y React 19 ya lo había limpiado.
- **El error del asistente salía en inglés**, crudo del runtime.
- **El asistente estaba caído**, y no por GCM: el modelo `gemini-3.7-flash`
  estaba saturado. Se cambió a `gemini-3.6-flash`.

**Lo que se comprobó que funciona**, y era la mitad que se rompe al apretar de
más: un residente puede trabajar en su obra —se reportó un parte del día de
verdad—, y no alcanza nada de las demás, verificado por pantalla, por servicio,
por el agente de IA y pidiendo un archivo por su id con el fichero puesto en
disco.

**Lo que hay que llevarse del día**: cuatro veces estuve a punto de reportar un
fallo que no existía, y siempre por medir mal —un contador animado, un permiso
que me inventé, un ayudante que restaba dos veces, y una prueba que pasaba con
el fallo dentro—. Antes de decir «esto falla», comprobar que el instrumento
sabría distinguir el caso contrario. Está en `PENDIENTES.md` y en las memorias.

### Más tarde ese mismo día — el asistente y su pantalla

Se abrió el día para arreglar el modelo de IA en producción y **la premisa ya
no era cierta**: la saturación de `gemini-3.7-flash` había pasado —responde 200
en 4,9 s— y producción estaba viva y con el código del día (`/api/health`,
commit `aea7891`). El modelo es dato por empresa, no código, así que ningún
despliegue lo toca y desde fuera no se puede leer: hay que entrar a mirarlo.

**Y al mirar apareció el fallo real, que era peor**: la pantalla donde se
arregla un asistente caído no decía que estaba caído. El error de cada
conversación fallida se guardaba —`marcarErrorProveedorInterno`, y a propósito
sin retirar el `verificadoAt`— pero `EstadoPrueba` preguntaba por `verificadoAt`
primero y salía, así que seguía anunciando «Probado hace X y funcionó» con el
503 guardado debajo. Ahora hay un estado más, `fallo_tras_funcionar`, y la
decisión vive en `situacionDeProveedorIa` (`lib/proveedor-ia.ts`) con pruebas
propias —en este repositorio no hay ni una prueba de componente, así que lo que
se queda dentro de un `.tsx` no lo comprueba nadie—. De paso, esa pantalla
todavía decía en voz alta que el asistente «todavía no existe».

**Y la contraseña del FTP de producción ya está rotada**, que era lo último que
seguía abierto en la sección de seguridad.

### Y buscando el fallo `81572617` apareció otro que sí era real

El fallo del cronograma del día 24 sigue sin reproducirse, pero la búsqueda
cerró el hueco de método que quedaba: aquel día se ejecutaron los servicios y
las funciones puras, y **nunca se dibujó la pantalla**. Ahora hay
`scripts/sonda-cronograma.ts`, que crea obras degeneradas —cronograma vacío,
tarea que acaba antes de empezar, fechas de 1900 a 9999, corte fuera del
plan…—, pide sus pantallas con una sesión real y las borra. Ninguna revienta.

Lo que sí apareció: **el plazo mandaba sobre el coste**. Con una tarea de 1900
a 9999 —un año mal tecleado— el Gantt tardaba 10,4 s y el PDF del informe
semanal 39,3 s, con dos tareas dentro; el eje pedía noventa y siete mil bandas
y cuatrocientas mil rayitas. Ahora el paso se ensancha en vez de multiplicarse
las marcas: 1,6 s y 1,9 s. Un plazo normal no lo nota.

---

## Anexo — 24 de agosto de 2026

El día que se recorrió la aplicación entera con los ojos, no solo con la
batería. **Once fallos reales**, y el hilo conductor de casi todos es el mismo:
*el código estaba bien probado y aun así estaba mal, y solo se vio mirando.*

**Lo que se arregló, por familias:**

- **Seis fugas de alcance por obra.** Lecturas alcanzables sin pasar por el
  layout —el agente de IA, la propuesta comercial con su margen, las tres rutas
  que sirven archivos por id, el equipo y el árbol de partidas—. Después se
  midió la clase entera y se puso la guarda en las **60 lecturas**, con la misma
  respuesta que ya daban al negar el permiso.
- **Dos agujeros en los pases de obra.** No se podía revocar el pase de una
  obra parada mientras el titular seguía entrando; y se podía dar un pase nuevo
  en una obra cerrada.
- **Tres defectos de dinero.** La proporción estaba escrita cinco veces, cuatro
  en coma flotante: ahora es `porcentajeDe` en `lib/decimal`. Más una comparación
  de importes con `!==` en la propuesta impresa y una suma acumulada en float.
- **La regla de «obra cerrada» bajada a las 22 pantallas**, distinguiendo abrir
  trabajo de cerrar lo ya abierto.
- **Un N+1** en la importación de proveedores, y los rótulos `UND.`/`METRADO`
  que se pisaban en los tres presupuestos en PDF.
- **`src/instrumentation.ts`**: un fallo de pantalla ya no es indiagnosticable.
  El hash que ve la persona y el mensaje del servidor se escriben juntos en
  `stderr.log`.

**La lección, y es la que conviene heredar:** cinco veces seguidas, un cambio
que consistía en NO enseñar algo pasó typecheck, lint, 3.000 pruebas y build
estando mal. Las pruebas comprueban lo que se dibuja; no lo que ya no se
dibuja, ni que lo de alrededor se sostenga sin ello.

El detalle de cada cosa —incluida la receta para repetir el barrido de alcance
y las trampas de medición que casi cuelan— está en `PENDIENTES.md`.

---

## Anexo — 22 de agosto de 2026

Sesion centrada en cerrar el resto de `PENDIENTES.md`: hallazgos de auditoria,
sueltos, el pipeline de despliegue (un fallo real en produccion, resuelto
aparte, ver el commit correspondiente), el vacio del panel sin obras, adjuntos
en Notas con aviso de vencimiento, y por ultimo la entrega mas grande del dia:

**PARALIZADA deja de ser todo-o-nada.** Hasta hoy una obra paralizada admitia
CUALQUIER escritura —crear una orden, un encargo, un compromiso nuevo— igual
que una en ejecucion; solo lo decia el chip. Ahora:

- `motivoNoAdmiteCambios`/`motivoSiObraCerrada` (`lib/obras.ts`,
  `services/obra-abierta.ts`) ganan `{ permiteEnParalizada?: boolean }`,
  default `false`. Las ~76 escrituras que pasan por la guarda quedan
  protegidas sin tocarlas; solo siete piden la excepcion porque CIERRAN algo
  que ya estaba en curso en vez de abrir trabajo nuevo: `aprobarMovimiento`,
  `cerrarPlanSemanal`, `levantarRestricciones`, `levantarTodasDeTareas`,
  `comprometerRestricciones`, `subirEvidencia`, `subirEvidenciaConPase`.
- `Project` gana `motivoParalizacion`, `fechaEstimadaReanudacion` (opcional
  a proposito) y `paralizadaEn`. `cambiarEstadoObra` exige el motivo al
  paralizar y limpia los tres al salir. `EstadoObra.tsx` gano
  `FormularioParalizar`, mismo patron reveal-en-vez-de-clic que
  `FormularioReabrir` (de la entrega anterior, ese mismo dia).
- **Decision deliberada, no descuido**: `avisos-reloj.ts` y
  `gerencia.service.ts` siguen tratando PARALIZADA como "obra viva" para
  avisos y alertas de atraso — exactamente el comportamiento que ya tenian.
  El default restrictivo nuevo de `obraAdmiteCambios` los habria excluido
  sin querer; los dos llaman ahora con `{ permiteEnParalizada: true }`
  explicitamente para que nada cambiara ahi.
- `fijarFlujos`/`marcarSinRestricciones` (comparten codigo en
  `lookahead.service.ts`) se dejaron BLOQUEADOS a proposito: pueden crear
  restricciones nuevas, no solo cerrarlas, y separar los dos casos dentro de
  esa funcion compartida era mas regla de la que esta entrega necesitaba.
- Verificado con `scripts/humo.ts` (83 rutas contra la base de desarrollo
  real, todas responden) ademas de 2511 pruebas, typecheck, lint y build.
  Sin navegador real disponible en esta sesion para el click-through
  interactivo del formulario nuevo — pendiente si el usuario quiere
  confirmarlo el mismo en pantalla.

**Unificar "obra viva" entre paneles**, la MISMA tarde. El parrafo de
arriba dejaba anotado que `obras.service.ts` (cifras de dinero del panel)
seguia sin coincidir con `gerencia.service.ts`/`avisos-reloj.ts` sobre que
es una obra "viva". Se cerro aparte: `ESTADOS_OBRA_CON_EXPOSICION`
(`lib/obras.ts`) unifica el criterio en las tres cifras de dinero del
panel, el conteo de plazo vencido, y el aviso por tarjeta —los tres
seguian mirando solo `EN_EJECUCION` y dejaban de contar una obra paralizada
con deuda real pendiente—.

**Rediseno de `/gerencia`, primera entrega.** La pantalla llevaba desde
que se creo con solo dos bloques (semaforo de partidas criticas,
adicionales sin aprobar) — "insuficiente para lo que un gerente de una
constructora esperaria", segun el propio usuario. Investigado que
consolidados de cartera no existen hoy en NINGUN sitio de la app (ni de
obra individual), clasificados por costo real de consulta (la regla de
coste de `gerencia.service.ts` es innegociable: cargar un cronograma
completo en esta pantalla ya tumbo produccion dos veces), y elegidas tres
secciones nuevas, las tres baratas de pagar: **sobregiro proyectado**
(compara %comprometido contra %avance fisico por obra — avisa ANTES de que
el sobregiro sea real, la unica de las tres que no existia ni a nivel de
obra individual), **compras/encargos sin aprobar**, y **restricciones de
Lookahead vencidas o por vencer**. Detalle tecnico que vale la pena
recordar: `semaforoDeCartera` y la nueva `sobregiroProyectadoDeCartera`
comparten el mismo lote de cronograma vigente via un helper
`loteConAvanceMedido` envuelto en `cache()` de React —mismo patron que
`datosAlertasEmpresa` en `obras.service.ts`—, para que pedir las cinco
secciones juntas no duplique la consulta mas cara de la pantalla. EVM
consolidado, valorizaciones consolidadas y PPC consolidado quedaron fuera
a proposito (ver el detalle de por que en `PENDIENTES.md`); el rediseno
mas a fondo (graficos, filtros) sigue sin empezar.

Detalle completo de las tres entregas, con cada archivo y cada linea
tocada, en el punto 4 y el punto 7 de [`PENDIENTES.md`](PENDIENTES.md).

---

## Incidente del 10 de agosto de 2026 — leer antes de tocar el despliegue

Produccion estuvo unas dos horas sirviendo pantallas inservibles. Dos causas
independientes, y ninguna era la que parecia.

### 1. Ningun despliegue del dia llegaba a aplicarse

`app.js` descomprimia el `gcm.tar.gz` **dentro del proceso que atiende la
peticion**, y eso tarda **16 segundos** (medidos: 0,5 s de CPU, el resto
esperando al disco). LiteSpeed mata el arranque mucho antes. Resultado: el
paquete quedaba renombrado a `.desplegando` y a medio extraer, con lo que el
arbol mezclaba ficheros de dos compilaciones. De ahi los sintomas del log que
nos tuvieron horas persiguiendo fantasmas:

- `Failed to load external module ...wasm-base64.mjs: SyntaxError` — un fichero
  leido a medio escribir.
- `Failed to find Server Action ... from an older or newer deployment`.
- `PrismaClientValidationError` sobre consultas que en el codigo actual son
  correctas: eran de un build anterior mezclado.

**Arreglado con un cron cada minuto** que descomprime desde fuera y toca
`tmp/restart.txt`. El arranque ya no hace trabajo pesado. `app.js` conserva
ademas un candado atomico por si dos instancias coinciden.

**No vuelvas a poner trabajo lento en el arranque.** Este hosting lo corta.

### 2. Las pantallas se quedaban en el esqueleto de carga, para siempre

El servidor respondia **200 con el HTML completo** (145 KB en 590 ms). El
contenido llegaba al navegador dentro de un `<div hidden id="S:1">` y no se
colocaba nunca.

La causa, en el codigo de React 19.2: **`$RC` ya no revela nada**. Marca el
hueco como `$~`, mete el par en una cola `$RB`, y programa el revelado real
—`$RV`— con **`requestAnimationFrame`**. Y `requestAnimationFrame` no corre en
una pestana en segundo plano. Todo el revelado de la pagina cuelga de esa
unica llamada, sin segunda oportunidad.

Fallaban **exactamente** las rutas con `loading.tsx` y funcionaban
**exactamente** las que no lo tienen —el grupo `(auth)` no tiene ninguno—.
Correlacion perfecta; no tenia nada que ver con la sesion ni con la base.

**Arreglado apagando los dos `loading.tsx`** (movidos a `_esqueletos/`, que Next
excluye del enrutado por el guion bajo). Sin ellos la respuesta no se parte en
dos: el servidor manda la pagina entera y el navegador la pinta aunque la
hidratacion falle. Verificado con `document.hidden === true`: renderiza igual.

Para reactivarlos hace falta una red de seguridad que drene `$RB` si `$RV` no
se ha ejecutado. Ver `src/app/(dashboard)/_esqueletos/LEEME.md`.

### 3. Y una leccion de metodo

Buena parte del tiempo se perdio midiendo mal: se comprobaba si la pagina
tenia contenido contando **caracteres de texto**, y un esqueleto de carga son
rectangulos grises **sin texto**. La pantalla parecia vacia cuando estaba
cargando. Ademas se inspeccionaba desde una pestana en segundo plano, que es
justo la condicion que disparaba el fallo. Se dieron por buenas cuatro
hipotesis falsas antes de la correcta: pool de conexiones, bloqueo de tabla,
cuota de disco y un bug de Prisma inexistente.

Para la proxima: **mirar la pantalla** (captura o `.animate-pulse`) antes de
teorizar, y comprobar `document.hidden` antes de creerse nada de lo que diga
un navegador automatizado.

---

## Anexo — del 11 al 21 de agosto de 2026

**Este anexo manda sobre todo lo que sigue.** Entre el 11 y el 21 de agosto
entraron **297 commits**, 403 archivos nuevos y 35 migraciones. Las secciones
3 y 6 de abajo describen el sistema del 8 de agosto y se conservan porque
cuentan por que se decidio lo que se decidio, no lo que hay hoy.

Lo mas importante que hay que saber antes de tocar nada:

1. **El presupuesto cambio de sentido.** Ya no se importa el contractual: se
   carga el REAL y el contractual se GENERA desde el, recargando cada capitulo.
2. **Los gastos generales dejaron de ser de la obra** (21 de agosto). La obra
   gestiona UNA bolsa y nada mas.
3. **Una constructora entera se puede sacar en un archivo y meter en otra
   instalacion.** Es el puente hacia la version instalable.
4. **Cada empresa tiene su correo, su logo y su marca.** GCM se queda en el pie.
5. **Cada quien ve solo sus obras.** `ProjectMembership` dejo de ser una tabla
   vacia.

---

### 1. El dinero: el contractual sale del real, no al reves

Hasta el 20 de agosto se importaba un Excel con el presupuesto que ve el
cliente y la meta se cargaba aparte. Ahora el orden es el del trabajo real:

    presupuesto REAL (lo que cuesta)  ->  % de recargo por capitulo
                                      ->  presupuesto CONTRACTUAL (lo que paga
                                          el cliente)  ->  linea base aprobada

- `src/lib/contractual-desde-meta.ts` hace la conversion, puro y sin base.
  **Tres reglas que se sostienen entre si**: el recargo se aplica a las
  PARTIDAS y nunca al capitulo (un capitulo es un titulo, su importe es la suma
  de lo que cuelga; recargarlo aparte contaria el dinero dos veces); cada
  partida hereda el recargo del ancestro MAS CERCANO que tenga uno; y lo que no
  se puede recargar se pasa tal cual y **se avisa** — una partida que entra al
  contrato a precio de costo es una decision, no un accidente.
- `PresupuestoMetaItem.porcentajeRecargo` guarda el recargo por capitulo
  (migracion `20260820190000_recargo_del_capitulo`).
- `contractual.service.ts` y `/obras/[id]/contractual` generan con vista previa.
- **Se borro `/obras/[id]/importar`** con su importador y su vista previa (848
  lineas menos). Ojo: el aviso de siguiente paso siguio apuntando ahi y dejo en
  produccion un boton principal que abria un «Aqui no hay nada». Desde entonces
  hay un guardian que lee el fuente y comprueba que **cada camino sugerido
  tenga su `page.tsx`**.
- `baselineVersion` de la meta pasa a OPCIONAL: el real ya puede existir sin
  contractual (`20260820200000_meta_puede_nacer_sin_contractual`).

### 2. La cascada comercial y la propuesta al cliente

`calcularCascadaComercial` (`src/lib/presupuesto.ts`) **convive** con
`calcularCascada` en vez de sustituirla, para que una revision anterior al
20/08 siga imprimiendo la misma cifra. Hay una prueba que fija que con
descuento cero y sin retencion las dos dan lo mismo al centimo.

El orden es el que pide SUNAT: costo directo + gastos generales + utilidad =
subtotal, menos descuento = **valor de venta**, mas IGV = **precio de venta**.
La revision guarda ahora **como tributa** —IGV, retencion de renta y
descuento— (`20260820210000_cascada_comercial`).

**`/obras/[id]/propuesta`**: el contractual como documento corporativo, con el
logo de la empresa, el membrete con RUC, los datos del cliente y la cascada.
Sale de la LINEA BASE, no del arbol vivo: el papel que se le mando al cliente
no puede cambiar cuando la obra avanza.

- Se elige **como se presenta**, nunca cuanto cuesta: forma de facturar (IGV,
  recibo por honorarios con retencion descontada o asumida, o sin impuesto),
  nivel de detalle, moneda y dos textos libres.
- El nivel de detalle es la parte delicada: **cada aportante se reparte a su
  ancestro VISIBLE mas profundo**, asi el total es el mismo a cualquier
  profundidad. La primera version decia «lleva cifra quien no tiene ninguna
  fila visible debajo» y **escondia 9.711,05 soles** en el presupuesto real de
  347 partidas, sin dar ningun error.
- Tambien sale en Excel, por POST (las observaciones no caben en una URL).
- Dolares es una opcion de PRESENTACION: no hay campo de moneda en la base y
  sin `tipoCambio` en la revision la opcion sale bloqueada. Inventar una
  cotizacion seria poner un precio que nadie pacto.

### 3. El presupuesto meta y la bolsa — y su rectificacion del 21 de agosto

El 15 de agosto entro el presupuesto meta con cuatro tablas propias
(`20260815070851_presupuesto_meta`) y `lib/bolsa.ts`. Decisiones que siguen
vigentes:

- **La utilidad NUNCA entra en la bolsa.** Viaja y se ensena, pero aparte: no
  es un ahorro gastable, es el resultado. Hay prueba dedicada.
- **Lo que la meta no cubre NO es margen**: una partida del contrato sin linea
  en la meta es gasto que nadie presupuesto, y se marca `sin_meta` linea a
  linea en vez de contarse como ahorro.
- `mesesPlazo` se guarda congelado y no se deriva del cronograma: si se
  derivara, atrasar la obra reescribiria la meta hacia atras y la desviacion de
  plazo desapareceria de la pantalla.
- `meta:aprobar` esta en INNEGOCIABLES por **separacion de funciones** —quien
  ejecuta contra la meta no puede fijarla—, motivo distinto del de los otros
  dos `*:aprobar`, que son actos contractuales.

**El 21 de agosto se retiro la mitad del modulo.** Los gastos generales SALEN
del presupuesto meta: la obra gestiona una sola bolsa y punto (`3f203a2`,
`eef29a1`, `34c883c`). Con ello desaparecen la pantalla `/obras/[id]/criterio`,
`criterio-obra.service`, `bolsa-gastos-generales`, `deficit-estructura` y la
hoja de gastos generales de la plantilla — unas 1.300 lineas. Un Excel viejo
que todavia los traiga **lo dice al cargarlo**.

> Todo lo que este documento o el manual digan sobre «el criterio de gastos
> generales de la obra», el «resultado de estructura» o la «bolsa de plazo»
> describe el sistema del 18 al 20 de agosto y **ya no existe**.

### 4. EDT y cronograma: tres puertas, y el presupuesto manda

El cronograma tiene ahora **tres entradas** —MS Project/ProjectLibre, Excel y
teclado— y encima una cuarta que no es entrada sino derivacion: **la EDT se
genera desde el presupuesto**.

- **El presupuesto YA es la EDT**: capitulo -> rama, partida -> paquete de
  trabajo, subpartidas -> tareas. Lo unico que se anade encima son las FECHAS,
  y solo en las hojas.
- **Quien lleva el dinero lo decide `aportantes`, no la forma del arbol.** Una
  revision adversaria tumbo la primera version: decidia por «tiene hijas
  colgando», y en el presupuesto real eso enlazaba las filas vacias de un
  capitulo a suma alzada y dejaba el importe sin ninguna tarea que lo cubriera;
  con un descuento comercial colgando, la rama pesaba -100 en vez de +679 y el
  avance de la obra BAJABA al ejecutar trabajo. La invariante que lo cierra
  vive en `edt-dinero.test.ts`: **la suma de lo enlazado ES el costo directo**.
- **La sincronizacion corre sola** detras de las cinco operaciones que cambian
  el presupuesto (crear, editar, borrar, renumerar y agrupar). No borra nada
  —avance, lookahead, fotos y compromisos cuelgan del `uid` sin clave ajena—,
  no toca fechas y no toca lo tecleado a mano; lo que sobra se lleva al final y
  se nombra en pantalla. Tres guardas antes de escribir: linea base, partidas
  en ejecucion que ya no estan en el presupuesto, y la invariante del dinero.
- **Nada de esto se puede borrar si esta en ejecucion.** Correccion expresa del
  dueno del producto: si se esta ejecutando hay que pagarle al contratista, y
  ese pago sale del presupuesto. `partidas-en-ejecucion.ts` lo comprueba en dos
  saltos (el avance se ancla al uid; lo que lo une a la partida es el mapeo POR
  CODIGO) y lo llaman las tres puertas.
- `Project.ultimoUidManual`: contador **monotono** por obra. Reciclar un uid
  hacia que la tarea nueva heredara el avance de una borrada Y apagaba la
  alarma de huerfanos a la vez.
- `TareaCronograma.sinProgramar`: las columnas de fecha no admiten nulo, asi
  que una EDT recien generada nacia «programada para el primer dia y ya pasada»
  y publicaba una alerta roja por partida en el tablero y en el informe al
  cliente.
- **Reimportar el mismo corte ya no se pierde en silencio**: se compara una
  HUELLA del plan leido (`cronograma-huella.ts`), no la fecha a secas, y el
  reemplazo reescribe la version EN SU SITIO para no poner dos puntos en el
  mismo dia de la curva.
- **El Gantt dibuja dependencias** y la barra de linea base. Al dibujarlas
  aparecio que **el lector de MS Project tenia cambiados dos tipos de enlace**
  (`2->CF` y `3->CC`, al reves) y que **habia una prueba que fijaba el error**.
  Los cronogramas ya importados conservan el tipo cambiado; se corrige
  reimportando.
- **ProjectLibre entra sin pasar por MS Project**, y la EDT sale en XML para
  planificarla alli y volver (`msproject-xml-escribir.ts`).
- La duracion se calcula desde las fechas en dias de TRABAJO, con el calendario
  laboral de la obra.

**Lo que sigue sin existir**: GCM no calcula ruta critica ni holgura. Las
tareas que entran por Excel o por teclado nacen con `esCritico: false` y
`holguraInferida: true`, igual que se niega a deducirla el lector de Project.

### 5. Hitos de obra

`HitoObra` (`20260817065131_hitos_de_obra`) es tabla propia y no columnas en la
tarea: las versiones del cronograma se sustituyen enteras al importar, y un
responsable escrito dentro de la tarea se perderia el jueves siguiente. Se
ancla en `(projectId, uid)` sin clave ajena, y a la partida por CODIGO.

- **Un hito se ANADE como fila nueva, nunca se convierte una partida en hito**:
  `esHito` saca la fila de la valorizacion en nueve sitios y su importe se
  quedaria sin ninguna tarea que lo cubra. Ese mismo agujero entro dos veces
  mas por otras puertas —el importador de Excel deduce hito de una duracion
  cero, y la casilla «Es un hito» del alta manual— y las dos avisan ahora en
  rojo cuando la fila lleva codigo de partida.
- La sincronizacion **intercala** el hito detras de TODA la rama de su partida
  y AL MISMO NIVEL: mas adentro convertiria en resumen a la fila de delante.
- Avisos propios (`HITO_CERCA` suena una sola vez, `HITO_VENCIDO` insiste con
  el dia dentro de la clave). Para que llegaran hubo que abrir dos puertas del
  motor de avisos que daban por hecho que todo aviso pertenece a un flujo de
  restricciones.
- **Hitos predictivos** (`hitos-predictivos.service.ts`): seis reglas que
  PROPONEN, ninguna inserta. Tres estan mudas hoy y **eso es la mitad del
  valor**: el CPI calla porque la cobertura del mapeo real es del 1,4% y la
  compuerta pide 60%; la convergencia, porque el cronograma vigente tiene 0
  enlaces; y los recursos, porque GCM no guarda dotacion ni rendimiento. Cada
  regla muda explica su hueco **con el numero real**.

### 6. Last Planner, completo

- **Tablero semanal** (`/plan-semanal/[planId]/tablero`): una fila por
  contratista, una columna por dia habil. `CompromisoSemanal` gana `diaInicio`
  y `diaFin` (ISO 1-7, no fechas). Sin arrastrar y soltar a proposito: tiene
  que funcionar en el movil del residente, con guantes y a pleno sol.
- **Kanban** (`/obras/[id]/kanban`), SEIS columnas: sin analizar -> con
  restricciones -> lista -> comprometida -> en ejecucion -> cerrada. Es otra
  DISPOSICION de lo que ya pintan el Lookahead y el tablero, no una fuente
  nueva. De lectura, con una sola excepcion: «empezo en obra»
  (`enEjecucionAt`), que es el unico paso del flujo que no tenia otra pantalla.
- **Capacidad** (`lib/capacidad.ts`): avisa si se promete mas de lo que la obra
  viene cumpliendo. Se OBSERVA en el historial, no se calcula con rendimientos
  que no se guardan. **Los umbrales no estan contrastados con datos** y eso
  esta escrito donde se lee; el 20 de agosto la sobrecarga se movio de 1,3 a
  1,4. Una semana cerrada VACIA ya no ensucia el denominador —hundia la media y
  pintaba de rojo a un equipo que no habia cambiado—, pero una semana donde SI
  se prometio y no se cumplio nada sigue contando: es la peor evidencia que hay
  y borrarla seria mentir.
- **Analisis de causa raiz** (`causa-raiz.service.ts`): se pide cuando la causa
  demuestra ser un PATRON —dos semanas distintas de las ultimas cuatro y al
  menos tres incumplimientos—, no en cada fallo. Un formulario rellenado por
  tramite es peor que ninguno. `OTRA` no se analiza nunca: no es una causa, es
  la ausencia de una.
- **La cantidad manda sobre la casilla** al cerrar, con corte EXACTO: 119 de
  120 no esta cumplido. Y el «% alcanzado» se deduce **solo cuando hay META
  pactada**, que ya viene en porcentaje. La meta en % es obligatoria al
  comprometer una tarea del cronograma, y solo se exige a los compromisos
  NUEVOS —decidido por uid contra la base, no por una bandera del formulario—.
- **SWI, tasa de liberacion y demora por flujo**: los tres salieron del dato
  que ya estaba. Ninguno mide productividad; miden si el sistema de
  planificacion funciona. Sin casos devuelven `null`, nunca cero.
- **La primera semana puede empezar el dia que arranca la obra**
  (`20260821030000_semana_con_fecha_de_inicio`), y ninguna semana pisa a otra.
- El Lookahead admite ventanas de **1 y 2 semanas**: una obra corta no tiene
  tres que mirar.

### 7. El parte del dia

Reportar avance costaba una peticion por tarea; con ~107 tareas, **no es que
fuera lento: es que no se hacia**, y lo que no se reporta sale en la curva S
como una obra mas atrasada de lo que esta.

- Todas las partidas en un envio, agrupadas por capitulo
  (`lib/parte-diario.ts`).
- **Una casilla vacia no escribe nada.** El peor defecto que ha tenido este
  sistema fue escribir 100% donde nadie escribio nada.
- `+10` suma diez puntos; `80` deja la partida al 80%. Antes escribir 10 sobre
  una partida al 70% la dejaba EN 10, y esa cifra alimenta la curva S, el EV y
  el SPI: la obra retrocedia en silencio. Si algo va a quedar por debajo, se
  lista una a una y hay que marcar «es una correccion».
- Avisa cuando la obra avanza **fuera del plan** («sin comprometer», «N
  restricciones»), para que el PPC de esa semana se lea sabiendo lo que no
  cubre.
- **Fotos por partida y por dia**: `FotoEvidencia` gana un tercer ancla
  `(uid, fecha)` (`20260818173445_fotos_por_tarea`). Salen en la pantalla del
  informe y en su impresion; **no** en el PDF, ni en el CSV, ni en el correo.

### 8. El informe semanal

- **Se emite a cualquier fecha**, no solo a un corte, y mide la obra A ESA
  FECHA: cruza los reportes de fecha menor o igual, asi que el informe de una
  semana pasada ensena lo que se sabia ESA semana.
- **Dice que paso en el periodo**, no solo acumulados: puntos ganados, de donde
  a donde fue la obra y que partidas se movieron. Si ninguna se movio lo dice
  en ambar — es la noticia mas importante que puede dar un informe semanal.
- Lleva el bloque de **Last Planner** (PPC, media, Pareto y lo prometido con su
  visto o su cruz). Va al final: el cliente busca primero el avance.
- Sale en **PDF** (`pdf-lib`, JavaScript puro: lo imposible en este hosting es
  Chromium sin ventana, no un PDF), en **CSV**, por **correo** con los dos
  adjuntos, por **WhatsApp** (enlace `wa.me`, lo manda la persona) y por
  **SMS**. El eje vertical de la curva va SIEMPRE de 0 a 100: reescalarla a su
  propio rango convierte dos puntos de diferencia en un abismo, y este
  documento se le manda al cliente.
- En SMS la trampa no es la longitud sino el ALFABETO: una sola tilde pasa el
  mensaje a UCS-2 y el limite cae de 160 a 70. Se transcribe a ASCII antes de
  medir (`lib/texto-sms`). Cuando no cabe todo se sacrifican partidas, luego el
  PPC, y lo ultimo el nombre de la obra. **Nunca una cifra**: un «45.2»
  recortado de «45.20» se sigue leyendo como un numero, y seria falso.
- **Los nombres de tarea se escapan en los siete correos**: un `<a>` dentro de
  un nombre se convertia en un enlace de verdad dentro de un correo con el
  membrete de la empresa.

### 9. Contratistas: del catalogo al pago

- **Catalogo**: rol (proveedor / contratista / ambos), cuenta de **detraccion**
  aparte de la corriente, busqueda, semaforo de contrato contra UNA obra —GCM
  no tiene «obra activa»— y **carga por Excel** que rellena huecos y **nunca
  pisa** lo que ya tiene valor.
- **Encargos**: el encargo es el contrato marco y las ordenes se emiten CONTRA
  el. **Comprometido = encargos vigentes + ordenes sueltas aprobadas**; una
  orden contra un encargo no suma, solo formaliza. El AC del EVM se queda en
  ordenes aprobadas a proposito: el monto de un encargo es promesa de costo, y
  meterlo hundiria el CPI el dia de la firma. El encargo propone sus fechas
  desde el cronograma y el contratista se da de alta sin salir de la pantalla.
- **Valorizaciones y pagos** (`20260818210348_valorizaciones_y_pagos`):
  cadencia en dos niveles con herencia (fechas pactadas > `cadenciaDias` del
  encargo > corte semanal de la obra), pago colgando del encargo con la
  valorizacion como enlace opcional, y **comprobante en tabla propia** — la
  evidencia de obra se ensena en la galeria y la galeria tiene un enlace que ve
  el CLIENTE. Un encargo con avance reconocido ya no se anula: se cierra.
- **Cada valorizacion lleva DOS numeros** (21 de agosto,
  `20260821040000_dos_correlativos_de_valorizacion`): el de la OBRA, que es EL
  numero del papel porque el documento lo emite la obra, y el del ENCARGO —«la
  3.ª de este contratista»—, que es por encargo y no por proveedor, porque el
  mismo contratista puede llevar dos frentes en la misma obra. Los dos se
  asignan dentro de la transaccion sobre el maximo de SU alcance, y las dos
  unicidades del esquema son lo que impide que dos personas valorizando a la
  vez se lleven el mismo numero: a la segunda se le pide repetir, diciendo que
  el corte no se ha perdido. La migracion **rellena** las que ya existian
  ordenando por `fecha`, `createdAt` e `id` —sin un criterio total, `ROW_NUMBER`
  podria dar dos ordenes distintos en dos ejecuciones—. Se ven en la tabla del
  historial y en la tarjeta del encargo: un numero que no se puede leer no
  sirve para reclamar nada.
- **Mensajeria**: correo (con `replyTo`, y por eso su pie ya no dice «no
  respondas a este mensaje»), SMS y WhatsApp, con historial por contratista.
  Los adjuntos no se guardan, solo su nombre y tamano; la lista de tipos es
  CERRADA. Plantillas de mensaje reutilizables por empresa.
- **Y el contratista puede responder**: `correo-entrante.service.ts` lee el
  buzon por IMAP y ata la respuesta a su conversacion por el `Message-ID` que
  GCM puso al enviar. Solo eso; el resto del buzon se ignora y no llega nunca a
  la base. **Si el token no aparece, la respuesta se guarda sin obra**: meterla
  en la obra equivocada es peor que no meterla. Un buzon que no se puede leer
  lo dice la pantalla, no la consola.

### 10. Gerencia y avance contra gasto

- **`/gerencia`**: la cartera de una mirada. La puerta es el ALCANCE
  (`obrasAsignadas === null`), no un permiso nuevo. Ensena los **adicionales en
  borrador** —dinero pedido que no cuenta en ningun presupuesto— y el semaforo
  de partidas criticas. **Dos consultas, sean dos obras o cuarenta**, con
  prueba que falla si alguien anade una por obra.
- **Avance contra gasto por capitulo** (`fisico-economico.service.ts`): la
  pregunta «voy al 40% de obra, por que llevo gastado el 60%». Una partida SIN
  tarea enlazada no cuenta como 0%: queda fuera de la base y se declara en
  pantalla. La cobertura del mapeo se dice siempre debajo de la tabla.
- **Ritmo de avance** (`ritmo.service.ts`): cuanto se gano cada semana y que
  capitulo lo puso. Distingue `ganado` (cuanto se movio EL capitulo) de
  `aporte` (cuanto de la OBRA se debe a el).
- El indice de gerencia se rotula **siempre «SPI por duracion»**, nunca «SPI» a
  secas.

### 11. El ciclo de vida del dato: respaldo, borrado, restauracion, migracion

Cuatro piezas que se sostienen sobre **un solo catalogo**
(`lib/respaldo-esquema.ts`), con una prueba que lo compara contra
`schema.prisma` y exige que **toda tabla del esquema o viaje o este excluida
CON SU MOTIVO**. Esa prueba ya cazo un fallo que estaba en produccion: el
respaldo **no llevaba los pagos ni sus constancias**, asi que borrar una obra
cerrada se llevaba por delante lo que se le pago a cada contratista.

- **Respaldo de obra**: zip con NDJSON por tabla, fotos, LEEME y resumen CSV.
  Los importes viajan como CADENA con su escala —nunca como numero de JSON, que
  es un float y aqui es dinero— y las columnas de dia como `YYYY-MM-DD`.
  Manifiesto firmado con HMAC derivado del `APP_SECRET` con el `companyId` como
  sal. Solo obras CERRADAS: se lee SIN transaccion y lo unico que impide que
  salga desgarrado es que nadie pueda escribir.
- **Borrado de obra**: cuatro puertas —permiso innegociable, obra CERRADA,
  nombre tecleado y contrasena— mas la quinta, que es un respaldo de las
  ultimas 24 horas que incluya los archivos. Se borra hoja a raiz por
  `ORDEN_BORRADO`, el inverso EXACTO del orden del respaldo, con prueba.
  Sobreviven `audit_logs`, `respaldos_obra` y los SMS anulados: la fila es lo
  que la empresa gasto y eso se paga.
- **Restauracion**: la obra vuelve como COPIA DE AUDITORIA (`archivadaEn`
  puesto) y no admite un solo cambio. Los usuarios **nunca se recrean**
  —fabricaria un acceso para alguien dado de baja—, los avisos se fuerzan a
  apagados, y `audit_logs` no se restaura: un libro al que un archivo puede
  inyectarle filas deja de ser prueba.
- **Migracion de empresa entera** (`20260819143413_empresa_en_migracion`): la
  constructora completa en un archivo que **cruza de instalacion**. Se CONGELA
  primero —no se suspende, porque una empresa suspendida no deja entrar ni a su
  propio ADMIN— y la guarda entra en las trece escrituras de empresa, con una
  prueba que lee el codigo como texto y se pone en rojo si alguien anade la
  catorceava sin ella. La firma es una **FRASE** que elige quien exporta y
  teclea quien importa, con scrypt y sal por archivo: es lo unico verificable
  en una maquina que no comparte nada con el origen y **sin que GCM opere un
  servicio de firma**, que es la condicion para el dia que el producto sea un
  programa instalado. El **tipo entra dentro de lo firmado**, o una migracion
  podria presentarse como respaldo «de la casa».
  - El destino tiene que estar VACIO. Es lo unico que impide mezclar dos
    constructoras en una.
  - Los correos: si el correo ya es de OTRA empresa se rechaza la importacion
    entera. Renombrarlo en silencio fabricaria un acceso que su dueno no sabe
    que tiene.
  - Tres fallos que solo aparecieron probando: rutas con barras de Windows
    dentro del zip, `wbs_items.parentId` autorreferente insertado antes que su
    padre —**el mismo agujero estaba en la restauracion de UNA obra**, donde
    funcionaba por suerte— y un `deshacer` que habria fallado en silencio.
- **Y una constructora se puede eliminar del todo**: congelada, exportada,
  frase y clave (`empresa-borrado.service.ts`).

### 12. La marca es de la constructora, no de GCM

- **Logo por empresa** (`20260818010707_logo_de_empresa`). Solo PNG y JPG,
  porque el informe lo dibuja `pdf-lib` y aceptar SVG daria un logo que se ve
  en la web y no en el papel del cliente. Se lee de los BYTES, no de
  `archivo.type`. En el correo viaja como adjunto incrustado (`cid:`).
- **Buzon propio por empresa** (`RemitenteCorreo`,
  `20260819130159_remitente_correo_por_empresa`). La contrasena se **cifra**
  (`lib/secreto.ts`, AES-256-GCM con la llave en el entorno): es el unico
  secreto de GCM que no se hashea, y no por descuido — al SMTP hay que
  PRESENTARSELA. Sin llave de cifrado no se guarda NADA, en vez de guardar en
  claro. **Configurado no es funciona**: hay `verificadoAt` y un envio de
  prueba de verdad.
- **En los correos manda la constructora** y GCM baja a un «Con tecnologia de
  GCM» al pie. Los correos que no son de una empresa concreta —codigo de
  acceso, recuperacion— siguen firmando GCM.
- **Ningun texto puede dar por hecho que hay alguien operando detras.** En la
  version instalable no habra buzon compartido, y decir «sale por el buzon
  compartido de GCM» prometeria un servicio que no existe. `docs/instalable.md`
  inventaria lo que se rompe, clasificado por LA RAZON: lo que bloquea de
  verdad no es el SMS, son las tres cosas que suponen que GCM es alcanzable
  DESDE fuera (cola de SMS, galeria del cliente y pase de obra).

### 13. Aislamiento entre empresas y alcance por obra

- **`aislamiento.test.ts`**: un doble de Prisma hecho con `Proxy` que apunta con
  que argumentos se llama a la base, y comprueba la propiedad de verdad —toda
  consulta lleva el `companyId` DE LA SESION—. Cubre las diez familias de
  servicios. Encontro una fuga real en `obtenerLookahead` y, mas tarde, **una
  que ya estaba en produccion**: `actividad.service` resolvia nombres de
  usuario sin filtrar y el panel de un cliente ensenaba el nombre de alguien de
  otra constructora.
- **Cada quien ve solo sus obras.** `ProjectMembership` estaba en el esquema
  desde el principio, sin una sola fila y sin codigo que la leyera. El alcance
  viaja en la SESION (`obrasAsignadas`: `null` = todas, lista vacia = ninguna),
  asi que preguntarlo es sincrono; se pone en los dos embudos que cubren la
  aplicacion —`obtenerObra` y `motivoSiObraCerrada`— y a mano en los servicios
  que resuelven la obra por su cuenta. Solo el ADMIN ve la cartera completa.
  Pantalla **Equipo** por obra y un guion que congela el acceso actual ANTES de
  cerrar.
- **El correo es unico POR EMPRESA, no en toda la instalacion** (20/08,
  `20260820180000_correo_unico_por_empresa`). La misma persona puede trabajar
  para dos constructoras. El login ya no puede resolver a quien pertenece un
  correo mirando la tabla: prueba la clave contra las cuentas que lo compartan
  y, si casan varias, pregunta en cual entrar.

### 14. La puerta de acceso

- **El bloqueo por cuenta se cumple y se acaba.** `failedLoginCount` solo
  volvia a cero al ACERTAR, asi que una cuenta que llegara a cinco fallos
  quedaba a merced de cualquiera para siempre: un fallo cada quince minutos la
  dejaba bloqueada indefinidamente. Contra un cliente de pago eso no es una
  molestia, es un incidente.
- **Limite por conexion** contra el rociado, contado sobre los `LOGIN_FAILED`
  que la auditoria ya guardaba: cero esquema nuevo. Y se lee la **ULTIMA**
  entrada de `x-forwarded-for`, no la primera —la primera la escribe quien
  llama, asi que el limite estaba puesto y no protegia de nada—.
- **`SMS_COLA_TOKEN` retirado.** Servia a TODA empresa sin emisor propio a la
  vez, y por esa cola viajan los codigos del pase y del segundo factor EN
  CLARO.
- **Las consultas de RUC ya no pueden tumbar la IP de todos**
  (`lib/limitador.ts`).

### 15. El manual dentro de la app, y el anclaje de continuidad

- **`/manual`, 23 capitulos.** Vive DENTRO de GCM y sin puerta de permisos:
  quien menos permisos tiene es quien mas lo necesita. La plantilla de cada
  capitulo es doctrina —la PREGUNTA que contesta con las palabras del menu,
  para quien es, la IDEA antes que los pasos, el RECORRIDO de la primera vez y
  LO QUE SALE MAL—.
- **Una prueba vigila que el manual siga contando el sistema que hay.** Lee el
  fuente del layout y exige que cada seccion del menu diga en que capitulo se
  explica; un `null` significa «no lleva capitulo a proposito» y va con su
  razon. Nacio porque la propuesta al cliente existio como pantalla del menu
  sin capitulo y dos recorridos siguieron mandando a una pantalla borrada
  mientras 2.373 pruebas pasaban en verde. **No cubre la prosa.**
- **Anclaje de continuidad** (`lib/siguiente-paso.ts`): UN paso, nunca una
  lista. No auto-navega —aprobar una revision es irreversible y encadenar
  ensena a pulsar sin leer—, no propone lo que quien mira no puede hacer, se
  esconde en la pantalla del paso, y las sugerencias se aplazan pero la
  decision bloqueante no. **No lee `lib/pendientes`**: esa lista carga el
  cronograma entero y esto corre en CADA navegacion.
- **Guia de puesta en marcha** (`/empresa/puesta-en-marcha`): los cinco pasos
  del primer dia. No es una pantalla de bienvenida, no se autoabre y no se
  puede «terminar».

### 16. Navegacion

- **Un solo mapa de la obra.** Habia DOS navegaciones a la vez —el riel del
  ciclo Last Planner y unas pestanas— agrupando las mismas secciones de forma
  distinta, y ninguna conocia media aplicacion. Ahora hay tres niveles (fase ->
  seccion -> rama) y las ramas solo se despliegan en la seccion abierta. Las
  insignias cuentan **solo lo que se puede contar barato**: dos `count` con
  indice, porque esto corre en cada navegacion y cargar el cronograma en una
  pantalla ya tumbo produccion dos veces.
- **Migas de pan** con tabla EXPLICITA: `plan-semanal` no se lee «Plan semanal»
  al capitalizarlo, y un id no se lee de ninguna manera.
- **El tablero de supervision se mudo dentro de la obra**; la pagina de inicio
  gano el mismo mapa, con el de empresa.
- **PLAN queda: Meta -> Presupuesto -> Revisiones -> Propuesta -> Cronograma**,
  que es el orden real del trabajo desde que el contractual sale del real.
- **Cuatro fronteras de error** (`error.tsx` de obra, de dashboard, de app y
  `global-error`) mas `not-found`. No habia ninguna en 52 pantallas.

### 17. Despliegue: lo que fallo y como se cerro

- **Las migraciones se aplican solas**, con el paquete desempacado y ANTES del
  intercambio. Hubo que arreglarlo dos veces: el workflow **sobrescribia
  `desplegar.sh` en el sitio mientras un cron lo ejecuta** —bash lee por
  posicion, asi que el proceso siguio leyendo desplazado y se salto el bloque
  entero— y el `activate` de CloudLinux **moria bajo `set -u`**.
- **FTPS verificado**, y falla cerrado. Dos causas encadenadas: ProFTPD no
  manda su intermedio (se aporta como ancla en `FTP_CA_PEM`) y el certificado
  esta a nombre de `server0808.cloudhostservers.com`, no de
  `ftp.drcaceresruiz.com`. **La respuesta nunca es volver a apagar la
  comprobacion.** Queda pendiente ROTAR la contrasena del FTP.
- **`/api/health` dice tres cosas**: `version` (el SHA del PAQUETE, que viaja
  DENTRO del `gcm.tar.gz`), `arranque` y `coherencia` — mas `reloj`,
  `operadores` y si hay llave de cifrado. «Desconocida» existe a proposito: no
  saberlo y estar al dia no son lo mismo.
- **El pie dice la version de verdad**: sale de `package.json` inyectado al
  compilar mas el SHA del paquete. Antes decia `v0.1.0`, el valor por defecto
  del andamio, con la aplicacion meses en produccion. **Un dato que hay que
  acordarse de actualizar es un recordatorio disfrazado de hecho.** El producto
  declara **0.9.0**: el 1.0 queda reservado para el lanzamiento comercial.
- **Subir dejo de ser lo mismo que desplegar**, y el gancho G6 corre tambien
  lint — el cuarto gate que faltaba y que tumbo varios despliegues.
- El paso de FTP tiene tope propio y `apt` reintenta en vez de tirar el
  despliegue.

> **EL 21 DE AGOSTO EL DESPLIEGUE ESTUVO DOS HORAS SIN PODER APLICARSE, Y LA
> CULPA ERA DE LA PALABRA `localhost`. LA BASE NUNCA SE CAYO.**
>
> Ventana: **05:40 a ~07:33**. Dentro de ella, los runs **#471** (`cc57486`) y
> **#472** (`31479b2`) subieron bien y ninguno llego a servirse; el paso
> «Comprobar que la version nueva esta viva» agoto sus 28 intentos en los dos.
> `tmp/despliegue.log` daba P1001 continuo:
>
> ```
> Error: P1001: Can't reach database server at localhost:3306
> ```
>
> Al cerrarse la ventana el paquete entro y produccion quedo en `31479b2` con
> `coherencia: ok`.
>
> **HALLAZGO 1: `localhost` resuelve SOLO a `::1`. ARREGLADO.**
>
> ```
> $ getent hosts localhost
> ::1     localhost ip6-localhost ip6-loopback
> ```
>
> **Sin `127.0.0.1`.** MariaDB no atiende por IPv6, asi que Prisma resuelve
> `localhost` a `::1` y da `P1001`. **La base nunca se cayo**: estaba ahi, y el
> cliente de linea de ordenes conectaba sin problema —por eso no se cazo antes:
> `mysql -h localhost` se va por el **socket Unix** y ni pasa por la resolucion
> de nombres—.
>
> **Y LA APLICACION LO SUFRIA TAMBIEN, sin que nadie lo viera**: pagaba el
> intento IPv6 fallido en CADA conexion. Se ve en el numero, que es lo que
> convierte esto en un hallazgo y no en una teoria: la latencia de
> `/api/health` **paso de 273 ms a 1 ms** al cambiar a `127.0.0.1`. Meses de
> lentitud que todo el mundo daba por el hosting.
>
> **ARREGLADO**: el `DATABASE_URL` de la app, en *cPanel > Setup Node.js App*,
> usa ya `127.0.0.1:3306`.
>
> > **REGLA DE LA CASA: NUNCA `localhost` en una URL de base en este hosting.**
> > Siempre `127.0.0.1`.
>
> **HALLAZGO 2: el selector de Node de CloudLinux PISA el entorno.**
>
> Inyecta las variables de la aplicacion en **todo** proceso `node`, por encima
> de lo que traiga el shell. Se comprueba en dos lineas:
>
> ```
> $ export DATABASE_URL=MARCADOR
> $ node -e 'console.log(process.env.DATABASE_URL)'
> mysql://...   # la de cPanel, no MARCADOR
> ```
>
> **Consecuencia: el `DATABASE_URL` de `~/.gcm-despliegue.env` NUNCA llega a
> Prisma. Es decorativo.** El comentario largo de `desplegar.sh` afirmaba lo
> contrario y costo horas —se busco el fallo en el archivo equivocado—, asi que
> **se corrigio en el script mismo**, no solo aqui. `NODEVENV_ACTIVATE` de ese
> archivo si sirve: aporta `npx` al PATH.
>
> El unico sitio que gobierna la URL es cPanel.
>
> **HALLAZGO 3: lanzar `desplegar.sh` a mano agota el cupo de procesos.**
>
> Cada intento fallido deja zombis —`bash`, `npm exec`, `node` y el
> **schema-engine** de Prisma—. Con varios acumulados, `node` ya no puede crear
> hilos:
>
> ```
> pthread_create: Resource temporarily unavailable
> Aborted (core dumped)        # codigo 134, a los 0,4 s
> ```
>
> **No es memoria: habia 86 GB libres.** Es el limite **`nproc` de LVE**, y
> engana porque el sintoma parece un fallo del programa. Ademas el script
> **muere con la sesion si se lanza sin `nohup`** (SIGHUP), lo que deja aun mas
> restos.
>
> Reglas, todas aprendidas hoy:
>
> - **No encadenar intentos manuales.**
> - Lanzarlo con **`nohup`**.
> - Limpiar con **`pkill -f prisma`** antes de reintentar. **NUNCA `pkill node`
>   a secas: ahi vive la aplicacion.**
> - Ante la duda, **dejar que lo haga el cron solo**.
>
> **EL CRON NO TIENE NADA QUE VER.** Existe, corre y habia aplicado `835d988` a
> las 04:42 de ese mismo dia. Desde fuera el sintoma es identico al del cron
> ausente —`version` vieja, `despliegue: pendiente`, `coherencia: desfasado`— y
> la lectura que el workflow imprime al fallar (**«el paquete llego pero el CRON
> no lo aplico»**) lleva derecho a la conclusion equivocada. Conviene arreglar
> ese texto: nombra una causa como si fuera la unica.
>
> **TRES CAUSAS FALSAS SE DIERON POR BUENAS ANTES DE LA CORRECTA**, y la lista
> vale mas que el arreglo porque cada una fallo distinto:
>
> 1. **«Se rompio el cron»** — afirmado **sin abrir el log**, solo mirando
>    `/api/health`. El cron iba: habia aplicado `835d988` a las 04:42.
> 2. **«Parpadeo transitorio de MariaDB»** — con UNA linea del log delante. El
>    arreglo que se propuso era REINTENTAR; se relanzo el despliegue y volvio a
>    fallar igual. **Este era el mas falso de los tres: la base nunca se cayo.**
> 3. **«El cron y la app apuntan a bases distintas»** — con DOS lineas y la
>    distancia entre ellas. Descartaba bien el parpadeo y erraba el mecanismo:
>    leen el MISMO entorno, y las dos sufrian el mismo `localhost`.
>
> **Lo que las descarto fue MEDIR, no razonar.** Las tres eran explicaciones
> plausibles construidas sobre lo que ya se sabia; ninguna cayo por pensarla
> mejor. Cayeron con tres comprobaciones en el servidor, y cada una tumbo una:
>
> | Medida | Que tumbo |
> |---|---|
> | `getent hosts localhost` | que la base estuviera caida |
> | el `MARCADOR` en `node -e` | que `~/.gcm-despliegue.env` pintara algo |
> | `ps -u` con `etime` | que los intentos manuales fueran inocuos |
>
> Las tres contradijeron lo que el codigo y sus propios comentarios daban por
> sentado. **Cuando un sintoma sobrevive a dos diagnosticos, deja de tocar el
> razonamiento y ve a medir en la maquina.**
>
> Detalle util para leer `/api/health` mientras algo asi pasa: **`arranque` SI
> se actualiza** —el `app.js` viaja por FTP, fuera del comprimido—. Ver
> `arranque` nuevo con `version` vieja no es un FTP a medias; es exactamente
> esto: subio todo y el paquete no se aplico.
>
> **CIERRE, 21 de agosto:** los dos puntos que quedaron abiertos de este
> incidente ya estan hechos. `desplegar.sh` ahora **devuelve el paquete a
> `gcm.tar.gz` solo** cuando `migrate deploy` falla —antes se quedaba como
> `gcm.tar.gz.desplegando` esperando a que alguien entrara al servidor—,
> reintenta hasta 30 veces (una por minuto de cron) y si se agotan lo deja
> quieto y lo dice en la bitacora, para no encadenar arranques de Prisma sin
> fin. Y el mensaje de fallo del workflow, que antes decia «el paquete llego
> pero el CRON no lo aplico» como lectura unica, ahora manda primero a
> `tail -40 tmp/despliegue.log` y distingue las causas que esa bitacora puede
> decir de lo que solo dice `/api/health`.

### 18. Notas y Recordatorios (Notas E1)

Bitacora libre por obra, con recordatorio opcional. Sin adjuntos ni
notificaciones a proposito —quedan para una entrega posterior—. `Nota`
guarda `categoria` (catalogo `CategoriaNota` por empresa), `texto`,
`recordarEl` opcional y quien la escribio; `vencida` **se deriva, nunca se
guarda** (se calcula contra `recordarEl` en cada lectura), siguiendo la
misma disciplina que el resto de GCM para no arrastrar una columna que
pueda mentir. Vive como pestana propia de la obra
(`obras/[id]/notas/page.tsx`), aparece en los avisos de seccion de
`obras.service.ts` y tiene su propio modulo en el tablero. Tres huecos de
integracion los cazaron las pruebas de consistencia ya existentes del
repo (`respaldo-esquema.test.ts` y las de `capitulos.tsx`), no la revision
manual: la tabla nueva faltaba en el catalogo de respaldo, y el manual
dentro de la app no tenia su capitulo. Primer capitulo del manual
(`src/components/manual/capitulos.tsx`, slug `notas`).

### 19. Rol GERENTE y vista previa de rol

`GERENTE` es un rol propio del enum `Role`, pedido por el usuario para ver
la cartera entera sin administrar ni aprobar nada. Sus permisos no se
enumeran a mano: `MATRIZ.GERENTE` es `TODO_LO_QUE_SE_LEE` en `rbac.ts`,
derivado en tiempo de definicion como todo permiso que termina en `:leer`
salvo el innegociable `permiso:leer` — un permiso de lectura nuevo entra
solo, sin tocar esta lista. Se sumo a `VE_TODAS_LAS_OBRAS` en
`alcance-obras.ts`, junto a ADMIN.

Junto al rol, un interruptor de "ver como" para que la MISMA cuenta ADMIN
pueda navegar la app como la veria otro rol —pensado para equipos chicos
que aun no tienen una cuenta por persona, y para que el propio usuario
pruebe cada rol sin crear cuentas de prueba—. El diseno de seguridad esta
en una funcion pura y probada aparte, `src/lib/vista-rol.ts`
(`vistaEfectiva`): los permisos efectivos son la **INTERSECCION** entre
los del rol simulado y los REALES de la cuenta, nunca una sustitucion, asi
que manipular la cookie a mano no puede ganar privilegio —verificado con
un caso de prueba dedicado, no solo afirmado—. Solo una cuenta cuyo rol
REAL es ADMIN puede activarlo, y solo si la empresa lo enciende en
`/empresa/configuracion` (`Company.permitirVistaPreviaRoles`, apagado por
defecto): eso no es la frontera de seguridad —la interseccion ya lo es—,
es una decision de producto sobre quien deberia ver el control.

**Bug real, encontrado probandolo en vivo, no en las pruebas
automatizadas**: los formularios de "Ver como" vivian dentro de un menu
desplegable que se cierra al primer clic dentro de si mismo. El clic
burbujeaba, cerraba el menu y desmontaba el formulario antes de que el
envio (una Server Action) llegara a ejecutarse — el boton no hacia nada,
en silencio, sin error en consola ni en servidor, con typecheck, lint y
2450 pruebas en verde todo el tiempo. El propio codigo ya documentaba este
exacto problema junto al boton de "Salir" (`BotonSalir`, mismo archivo),
con el arreglo (`onClick={(e) => e.stopPropagation()}`) escrito al lado;
se aplico el mismo arreglo al componente nuevo. Ver
`docs/memoria/clic-dentro-de-menu-desplegable.md`.

Fuera de alcance a proposito: `/gerencia` sigue con el mismo contenido
delgado de siempre (ver `PENDIENTES.md`).

### 20. La red de pruebas: lo que TypeScript no ve

De ~500 pruebas se paso a **mas de 2.400**. Lo importante no es el numero sino
que cubren lo que ninguna otra cosa ve:

- **`npm run humo`** abre las ~76 pantallas contra la base local, descubriendo
  las rutas del arbol de `src/app`. Y **no basta con el codigo de estado**: una
  pantalla rota devuelve HTTP 200 con el error viajando dentro del stream, asi
  que se busca la fila de error del payload de React.
- **`select-contra-esquema.test.ts`**: Prisma no valida los `select` ni los
  `where` en tipos. `Project.nombre` en vez de `nombreObra`,
  `Cronograma.vigente` que no existe, `lineaBaseVersion` que es un derivado y
  `planSemanal` en vez de `plan` llegaron a produccion compilando limpio. Uno
  de ellos dejo **un dia entero sin poder crear un encargo**.
- **`dinero-desde-la-base.test.ts`**: vigila que todo `_sum` pase por
  `lib/decimal`.
- **Los cuatro servicios donde vive el dinero** —movimientos, ordenes, encargos
  y valorizaciones, mas los dos puntos de no retorno (aprobar movimiento y
  aprobar orden)— tienen pruebas propias con Prisma doblado. Ninguno tenia
  ninguna. Las que importan son las que protegen del fallo que **no da error**:
  un capitulo con importe propio que borra el costo directo, un reparto con IGV
  que infla el comprometido un 18%, un deductivo que cruza a positivo y pasa a
  CUBRIR a su capitulo.
- **`terceros.ts`** convierte las licencias de codigo ajeno en algo comprobable
  y la prueba exige que no devuelva nada: asi no entra codigo AGPL ni se copia
  sin acreditar sin que la suite se ponga en rojo.
- Y la leccion que se repite: **`vitest` no comprueba tipos y `tsc` no ve las
  consultas de Prisma**. Hay que pasar `npm test`, `npm run typecheck` **y**
  `npm run build`. Verde no significa sano hasta que se ha visto rojo por el
  motivo correcto.

### 21. Fechas opcionales en la plantilla del presupuesto, hasta la EDT

Cuando se genera la EDT desde el presupuesto, cada tarea nacia SIN
PROGRAMAR: `WbsItem` no tenia ningun campo de fecha, asi que
`generarEdtDesdePresupuesto` rellenaba con el inicio de obra y marcaba
`sinProgramar: true` siempre, sin excepcion (ver punto 9 de mas arriba, que
oculta las tarjetas analiticas mientras eso dure). El usuario pidio que la
plantilla ya permitiera poner las fechas, para que "todo cuadrara casi
automaticamente" — confirmando de entrada que debia ser OPCIONAL: sin
fecha en el archivo, el camino de hoy (editar en la tabla del cronograma)
sigue igual.

La plantilla de la meta (`/plantilla-meta`, hoja "Costo Directo" — el
UNICO camino vivo hoy hacia `WbsItem`, desde que el 20 de agosto el
contractual dejo de importarse directo y paso a generarse desde el real)
gano dos columnas opcionales, "Fecha Inicio" y "Fecha Fin", **al final**
de las ocho que ya tenia: `formulaContractual` referencia columnas por
letra fija, e insertar en medio las habria roto. La fecha viaja intacta
por el pipeline existente sin que ninguna capa la transforme —
`analizarExcel` (el mismo parser que ya compartian el presupuesto y la
meta) → `PresupuestoMetaItem` → `generarContractual` (logica pura,
`contractual-desde-meta.ts`) → `WbsItem.fechaInicioPlan/fechaFinPlan`, dos
migraciones aditivas, mismos nombres en los dos modelos—.

Dos piezas ya existian en el codigo, escritas para esto y sin conectar:

- `TareaCronograma.sinProgramar` ya seguia el patron "valor por defecto +
  bandera dedicada" que usa `msproject-xml.ts` para la holgura — se repitio
  aqui, no se invento uno nuevo.
- `subirFechas()` en `edt-desde-presupuesto.ts` ya subia fechas de hojas a
  resumenes, tolerando hojas sin fecha, pero `edtDesdePresupuesto` nunca la
  llamaba porque nunca habia fechas que subir. Su propio docstring ya
  decia "lo unico que se anade encima del presupuesto son las fechas, y
  solo en las hojas" — la funcion estaba escrita para esto. Ahora
  `edtDesdePresupuesto` la llama por dentro antes de devolver, asi que un
  resumen toma la fecha de sus hojas programadas aunque solo alguna la
  traiga: el mismo criterio que la pantalla del cronograma (punto 9) usa
  para decidir cuando destapar las tarjetas analiticas. Las dos entregas de
  la tarde encajaron solas, sin coordinarlas a proposito.

Riesgo verificado, no asumido: ExcelJS decodifica la fecha serial de Excel
en UTC, asi que `leerFecha` en `excel-presupuesto.ts` usa getters UTC
(`getUTCFullYear` etc.), no locales —los locales habrian corrido el dia en
Peru (UTC-5), el mismo defecto que ya tiene su propio nombre en el
proyecto, `diaLocal`—. Un test de ida y vuelta en `plantilla-meta.test.ts`
(escribe la fecha con ExcelJS, la relee con `analizarExcel`, compara el
"YYYY-MM-DD" exacto) lo certifica.

Se dejo fuera a proposito la idea que el usuario menciono junto a esta —
declarar el contratista de cada partida por su RUC en la misma plantilla—:
crea o vincula una entidad de negocio nueva (con su propia validacion de
RUC, alta de contratista, permisos) en vez de repartir un dato que ya vive
en el cronograma, y mezclar las dos habria hecho mas dificil entregar la
mas simple. Ver `PENDIENTES.md`.

---

## Anexo — estado al 10 de agosto de 2026

### Multiempresa real: ya se puede vender a otras constructoras

Hasta ahora crear una empresa exigía entrar a la base a mano. Ya hay pantalla:
`/operador` lista las constructoras (solo contadores de usuarios y obras, nunca
su contenido) y `/operador/nueva` crea la empresa y su primer ADMIN en una
sola transacción, con clave temporal y correo de bienvenida.

**Quién opera GCM vive en la variable de entorno `GCM_OPERADORES`** (lista de
correos separados por coma), no en la base. Un valor nuevo en el enum `Role`
habría exigido migración y una fila en la MATRIZ de permisos —que describe lo
que se puede hacer DENTRO de una empresa—, y una columna booleana habría sido
concedible desde la propia aplicación. Así solo se concede con acceso al
servidor. Ausente = nadie es operador, que es el fallo seguro.

Ser operador **no concede ni un permiso del dominio** y **no permite entrar en
los datos de un cliente**: no existe esa pantalla, y `listarConstructoras` es
la única consulta del sistema sin filtro por empresa —lleva `select` explícito
de contadores y un comentario advirtiéndolo—.

`Company.activa` estaba muerto y ahora suspende clientes. Se comprueba en el
login **y** en `obtenerSesion`, porque con solo lo primero quien ya estuviera
dentro seguiría trabajando hasta que caducara su cookie. En el login va
DESPUÉS de validar la clave: antes, el formulario sería un detector de qué
constructoras están suspendidas para cualquiera que supiera un correo.

### Last Planner: el ciclo está cerrado

- **Lookahead** (`/obras/[id]/lookahead`): matriz de tareas × los 7 flujos de
  restricción. El enum ya deletrea SIEMPRE (Seguridad, Información, Espacio,
  Materiales, Mano de obra, Requisitos, Equipos). Las tareas se DERIVAN del
  cronograma vigente por `uid`.
- **Las restricciones se ELIGEN, no se siembran** (11 de agosto de 2026). Antes
  toda tarea nacía con las siete puestas, y de ahí venía que «cero
  restricciones» y «nadie la ha mirado» fueran la misma fila —con la
  confiabilidad midiendo la falta de análisis en vez de la obra—. Ahora
  `LookaheadTask.analizadaAt`/`analizadaPor` registran la decisión, y la fase
  tiene TRES valores (`FaseAnalisis`: SIN_ANALIZAR / CON_PENDIENTES / LISTA).
  Analizada sin ninguna restricción **es LISTA**: es el caso que antes no se
  podía expresar. La columna `estado` sigue siendo el semáforo «¿se puede
  comprometer?» y se deriva de la fase, con un único escritor
  (`recalcularEstados`) para que no puedan divergir.
- **Qué flujos aplican y qué se puede retirar** lo decide `planificarFlujos`,
  puro y con tests: una restricción resuelta, con fotos o con nota **nunca** se
  borra. `FotoEvidencia.restriccionId` es `SET NULL`, así que borrarla dejaría
  la foto sin anclaje e invisible para siempre. Se conserva y se informa.
- **En lote**: selección múltiple de tareas (incluida la casilla maestra) para
  analizar, marcar «no les aplica ninguna» o levantar todas sus pendientes. La
  casilla de fila cuelga de `lookahead:gestionar` **o** `plan_semanal:gestionar`:
  antes solo del segundo, y quien gestionaba el Lookahead se quedaba sin
  seleccionar.
- **Ventana configurable de 1 a 12 semanas**, 3 por defecto, en la URL
  (`?semanas=6`). «Traer al Lookahead» usa las mismas semanas que se están
  viendo. Ya no es un paso obligatorio: analizar crea la fila que falte.
- **Del Lookahead al PTS**: selección múltiple y «Comprometer al PTS», con
  cantidad y unidad tomadas de la partida mapeada. Si algo no está LISTO, no se
  ha analizado, o ya está en otra semana, **el servidor no escribe** y devuelve
  los avisos —en tres cubos distintos, porque «nadie la ha mirado» y «le falta
  levantar algo» no se arreglan igual—; hace falta confirmar de forma
  explícita. La decisión no queda en el cliente.
- **Cierre por cantidad**: la semana pregunta cuánto se EJECUTÓ, y la semana
  cerrada muestra «90 / 120 m2».

### El tablero ya habla de Last Planner

> Se apagaron durante el incidente del 10 de agosto y se reencendieron el
> mismo dia, con las dos condiciones cumplidas:
>
> 1. **`datosTablero` recibe los modulos encendidos** y carga solo lo suyo. El
>    diseno anterior traia los datos de los once siempre, para que encender
>    uno no costara una vuelta al servidor. Ahora la paga quien enciende —una
>    recarga, una vez— en vez de cobrarsela a todos en cada carga.
> 2. **La confiabilidad ya no relee el cronograma.**
>    `confiabilidadDeVentana` recibe las tareas que el tablero acaba de leer y
>    hace UNA consulta, frente a las cuatro de `obtenerLookahead` —la primera
>    de las cuales era el cronograma entero—.
>
> El numero sigue siendo el mismo que el de la pantalla del Lookahead: ambos
> derivan el estado con `estadoDeTarea` y agregan con `confiabilidad`.


Enseñaba avance, plazo y dinero —las tres cifras del control clasico— y ni una
del sistema que la obra usa para decidir la semana. Tres modulos nuevos:
**PPC** (ultima semana cerrada, variacion contra la anterior, tendencia en
barras con la linea del 80%), **Lookahead** (% de tareas LISTAS, avisando de
las que faltan por sincronizar porque cuentan como no listas) y **Causa que
mas frena** (primer puesto del Pareto, sobre todas las semanas). Y `Plazo`
añade los dias laborables via `diasLaborablesEntre`, que estaba escrito y sin
consumir; sin calendario sembrado se calla en vez de suponer lunes-a-viernes.

Los datos salen de `listarPlanesSemanales` y `obtenerLookahead`, las mismas
funciones que pintan sus pantallas. `obtenerLookahead` relee el cronograma que
el tablero ya leyo: es una consulta de mas y se acepta a sabiendas —que el
tablero diga una confiabilidad distinta de la de su propia pantalla seria
mucho peor—.

**La cookie del tablero cambio de significado y hay que saberlo.** Guardaba los
modulos ENCENDIDOS, asi que todo modulo nuevo nacia invisible para cualquiera
que hubiera tocado el configurador: su cookie no lo nombraba y quedaba fuera
del filtro. Se descubrio justo con estos tres. Ahora guarda los APAGADOS
(`gcm-tablero-off`), y lo nuevo entra encendido para siempre. Costo reiniciar
una vez la seleccion de quien la tuviera. `src/lib/tablero.test.ts` —que no
existia— fija la regla.

### Indicadores: no prometer lo que el dato no sostiene

Dos arreglos del mismo mal, ambos vistos en pantalla con datos de CRIOCORD.

**El valor ganado anunciaba un ahorro de S/ 633,873.12** —el 82% del
presupuesto, en verde—. El EAC es `BAC × AC/EV`, y el AC de GCM es *lo
comprometido en órdenes aprobadas*: con una sola orden de 11 mil frente a 62
mil ya ganados, el CPI salía 5,6. El comentario del módulo predecía el sesgo
contrario («el CPI puede salir más bajo al principio») porque se supuso que se
ordena antes de ejecutar; en esta obra se ejecuta y se ordena después.

Ahora `hayBaseParaProyectar()` (en `src/lib/evm.ts`) decide si hay con qué
proyectar, con **dos umbrales con nombre**: `AVANCE_MINIMO_PROYECCION = 15`
(por debajo, cada orden mueve el índice entero) y `RESPALDO_MINIMO_COSTO = 0.5`
(el costo registrado debe cubrir al menos la mitad de lo ganado). Sin base,
`cpi`, `eac` y `vac` son `null` y viaja **`motivoSinCosto`** —`sin_permiso`,
`sin_gasto`, `avance_insuficiente`, `costo_rezagado`—, que el panel escribe en
el hueco con `textoSinCosto()`.

Se quedan **SPI, SV, %avance y la curva**: no dependen del AC. Y **CV
también**: ganado menos gastado es un hecho de hoy, no una proyección. Si algún
día el AC pasa a ser devengado real, revisar `RESPALDO_MINIMO_COSTO`, que
existe solo por el desfase de las órdenes.

**Y la palabra contradecia a la cifra de al lado.** En prod: «se ha ganado
S/ 79,775.23 de un plan de S/ 79,859.05 — ATRASADO (SPI 1.00)». El SPI era
0.99895, asi que `spi >= 1` daba falso; pero el numero, ya redondeado para
enseñarlo, decia 1.00. Igual en el tablero: un desfase de -0.04 puntos se
escribia «-0.0 pts» en ambar.

La regla vive en `src/lib/redondeo.ts`: **la palabra, el color y el signo se
deciden sobre el valor redondeado a los decimales que se ven**. Aparece un
tercer estado que faltaba —«justo en el plan»—; antes el empate se resolvia
arbitrariamente hacia un lado. `textoRitmo` se queda como esta: ahi no hay
palabra que contradiga nada, y un 99,6% informa mas que un «al dia». La regla
es para veredictos, no para magnitudes.

**La curva S decía «no se llega» a quien va al 96% del ritmo.** `proyectar()`
solo daba fecha de término si la curva alcanzaba el 100% dentro del plazo; si
no, devolvía nulo, que la pantalla leía como *nunca*. Ahora se estira el plazo
restante por `1/factor`: a mitad de ritmo, el doble de lo que queda. Con factor
cero sí es nunca, porque a ese paso no se llega. Y `textoRitmo()` deja de
redondear 99,6% a «100%», que era decir «vas al día» a quien no va.

### Dos defectos reparados que conviene no reintroducir

1. **Fuga de datos en el plan semanal.** Guardar la semana REEMPLAZA sus
   compromisos. Escribía solo descripción y meta, así que en cuanto hubo
   cantidad y trazabilidad, la siguiente edición las borraba en silencio. Ahora
   el formulario reenvía lo que edita y el servicio conserva por uid lo que no
   (`zona`, `proveedorId`, `color`, `protocoloCalidad`, `cantidadEjec`),
   absteniéndose cuando el uid está repetido y no se sabe de qué fila era.
2. **Permiso de los importadores.** `accionAnalizar` del presupuesto y
   `accionImportar` del cronograma no comprobaban permiso antes de tocar el
   archivo —y convertir un `.mpp` lanza un proceso Java—. Las cuatro acciones
   lo exigen ya antes de leer nada.

### Deuda conocida, por orden de lo que muerde

- **Cinco consultas sin filtro por empresa**: `obras.service` (196, 233, 402),
  `tablero.service` (427) y `actividad.service` (76). Correctas hoy porque los
  identificadores vienen de consultas ya filtradas; con clientes reales, un
  reordenamiento del código filtraría datos entre constructoras.
- **Sin límite de frecuencia** en el login por IP (el bloqueo es por cuenta) ni
  en la API de SUNAT: un cliente puede agotar la cuota de todos.
- **`WorkCalendar` se escribe y nadie lo lee.** Se siembra al crear la obra
  (L-V 8h, sábado 5h, domingo libre, ISO 1-7) y ningún cálculo lo consulta.
- La ventana del Lookahead **no se guarda por obra**: al recargar sin
  parámetro vuelve a 3.
- El mismo mensaje delator del correo repetido sigue en el alta de usuarios
  normal: dice «ya existe», lo que confirma que esa persona es cliente.

### Plan acordado — las 8 capas, en 5 fases

| Fase | Contenido | Migración |
|---|---|---|
| 1 | Matriz del Lookahead en móvil · calendario laboral editable y leído · PWA instalable | No |
| 2 | Control documental: subida de archivos, repositorio por categorías, metadatos, validador | Sí |
| 3 | PTS avanzado: sectores reales, bloques de color, jerarquía subcontratista→sector→tarea, interferencias | Sí |
| 4 | Cierre por cantidad automático (regla del 100%), meta configurable, causa raíz y plan de recuperación | No |
| 5 | Motor de reglas CNC→acción y borradores de alerta temprana | No |

Descartado: **un LLM local en cPanel compartido no es viable** (memoria y CPU).
Un motor de reglas da la mayor parte del valor sin depender de nada.

No se añade librería de gráficos: los de PPC y Pareto son SVG a mano y pesan
cero. **No existe `tailwind.config.ts`** — Tailwind 4 configura por CSS, con
cinco paletas y modo claro/oscuro en `globals.css`; meter hexadecimales fijos
rompería el tema.

### Operativa del despliegue (esto ha fallado ya)

1. `git push` a `main` lanza la Action (~1 min 20 s).
2. **Espera a que termine** y solo entonces reinicia en cPanel → Setup Node.js
   App. Reiniciar mientras suben los archivos deja a Passenger con el build
   viejo: la ruta nueva da 404 aunque Actions salga verde.
3. Si además hay migración, córrela **el mismo día** o el panel entero cae.
4. Si tras el reinicio faltan estilos o hay 500, es la caída de archivos por
   FTP: relanzar el despliegue con *Re-run all jobs*.

---

## 1. Qué es

**GCM — Gestor de Construcción y Mantenimiento.** Sistema web y de escritorio
para control de obras de construcción en Perú. Se desplegará en
`gcm.drcaceresruiz.com`.

El cliente es **LARQUITECTURA STUDIO SAC** (RUC 20601689988). La obra piloto
es **CRIOCORD** — Laboratorio Instituto de Criopreservación y Terapia Celular,
en Lurín, Lima. Del 01/08/2026 al 22/10/2026.

Hoy el cliente controla la obra con MS Project y un informe semanal armado a
mano en PDF. Su control es **100 % físico**: porcentajes de avance, sin capa
económica. GCM debe sustituir ese proceso y añadir el control de costos.

## 2. Cómo arrancar

```bash
npm install
npm run db:migrate     # MariaDB local en 127.0.0.1:3306
npm run db:seed
npm run dev            # http://localhost:3000
```

Entorno local ya montado: **MariaDB 12.3.2** como servicio de Windows, base
`gcm_dev`.

> Las credenciales de la base y las del usuario administrador **no se
> documentan aquí**: este repositorio es público. Viven en `.env`, que no
> está versionado; la plantilla con todas las variables necesarias es
> `.env.example`.

Hay una variable **opcional**, `DECOLECTA_TOKEN`, para consultar el RUC en
SUNAT al dar de alta un proveedor. Sin ella el alta funciona igual: solo se
pierde el autorrelleno de la razón social. No se hizo obligatoria a propósito
— atar el arranque de toda la aplicación a un servicio de terceros no
compensa por una comodidad.

> **`apis.net.pe` migró a `decolecta`.** El token se genera en
> `decolecta.com/profile` y la documentación está en
> `decolecta.gitbook.io/docs`. El dominio antiguo sigue en pie pero responde
> **401 aunque el token sea bueno**, y eso se lee como «token caducado» y
> manda a buscar donde no es. El endpoint válido es
> `api.decolecta.com/v1/sunat/ruc` y el campo se llama `razon_social`.

El primer usuario lo crea `npm run db:seed`: toma el correo de
`SEED_ADMIN_EMAIL`, genera una clave temporal aleatoria, la imprime **una
sola vez** por consola y obliga a cambiarla en el primer ingreso.

**Repositorio: `github.com/drcaceresruiz-glitch/gcm` — es PÚBLICO.** Nunca
subir documentos de cliente, credenciales ni datos del servidor.
`docs/referencias/` está en `.gitignore` por ese motivo.

> ⚠️ **Credenciales expuestas.** Este apartado contuvo en claro la clave de
> la base, la de root y la del usuario administrador, desde el commit
> `c19d002` y en un repositorio público. Quitarlas de aquí **no las borra
> del historial**: siguen accesibles por el SHA de ese commit. Las de
> MariaDB ya se rotaron; **la del usuario administrador sigue pendiente**.
> Estado y pasos en §8.

### Comandos

| Comando | Para qué |
|---|---|
| `npm run typecheck` | Tipos |
| `npm run lint` | Estilo y reglas de arquitectura |
| `npx vitest run` | 102 pruebas |
| `npm run build` | Build de producción |
| `npm run db:studio` | Explorador de la base |

### Utilidades de diagnóstico

En `scripts/`, todas reciben la ruta de un Excel:

- `analizar-archivo.ts` — qué detecta el importador
- `inspeccionar-filas.ts` — celdas crudas de un rango
- `ver-combinadas.ts` — celdas combinadas
- `ver-ocultas.ts` — filas ocultas y su importe
- `cuadrar-con-excel.ts` — comparación capítulo a capítulo
- `auditar-*.ts` — totales por capítulo y subcapítulo

---

## 3. Qué funciona hoy

**Módulo 0 — Acceso.** Login, cambio forzado de clave en el primer ingreso,
bloqueo tras 5 intentos, cierre de todas las sesiones al cambiar la clave,
auditoría de cada ingreso. Verificado de extremo a extremo en navegador.

**Módulo 1 — Obras y presupuesto.**
- Panel con las obras de la empresa.
- Página de obra con el árbol de partidas: capítulos colapsables (recuerda
  cuáles dejaste abiertos), subtotales por capítulo, orden del documento.
- **Importador de Excel** completo: vista previa con avisos, confirmación,
  reemplazo. Probado con el presupuesto real de 360 partidas.
- **Edición en línea**: descripción, unidad, metrado, precio, importe y
  modalidad. Bloqueada si la revisión está congelada. Todo auditado.
- **Las dos vías de carga no se cruzan.** Duplicar códigos ya lo impedía la
  clave única, pero reemplazar sí destruía trabajo en silencio: el aviso decía
  «se borrarán 360 partidas» y dentro podían ir doce creadas a mano y varias
  correcciones de precio que no están en ningún Excel. Ahora cada partida
  guarda su `origen` y si alguien la editó, y antes de reemplazar la pantalla
  **enumera lo que no viene en ningún archivo**, separando las creadas a mano
  de las corregidas a mano: se pierden de formas distintas.
- **Revisiones**: servicio (`revisiones.service.ts`) y pantalla completos en
  `/obras/[id]/revisiones`. Formulario de alta con **vista previa en vivo** de
  la cascada, panel de resumen con el cuadro del Excel, comparador entre las
  dos últimas revisiones en soles y dólares, cláusulas e historial. Verificado
  en navegador contra CRIOCORD.
- **Aprobar una revisión**: `aprobarRevision` sella `aprobadaAt` y
  `aprobadaPor`, audita con `APPROVE`, y solo deja aprobar la última versión
  y una sola vez (la carrera se cierra con un `updateMany` condicionado a
  `aprobadaAt: null`). Botón solo para ADMIN, con confirmación en dos pasos
  que muestra versión, fecha e importe. Al aprobar, la obra congela el
  presupuesto: se bloquea la edición de partidas y desaparece el importador.

**Módulo 2 — Movimientos presupuestales.** Los cambios que van ENCIMA de la
línea base, que nunca se toca. El cliente mueve presupuesto entre partidas
cuando una se queda corta y otra sobra, o pide un adicional si no hay de
dónde sacar.

| Tipo | Qué hace | Regla |
|---|---|---|
| Reconversión | Saca de una partida y mete en otra | **La suma debe dar cero** |
| Adicional | Aumenta el presupuesto aprobado | Solo entradas |
| Deductivo | Lo reduce | Solo salidas |

- **Servicio** (`movimientos.service.ts`): alta en borrador, aprobación y
  cálculo del vigente. Cada partida tiene **base**, **ajustes** y
  **vigente**, y los indicadores de costo se miden contra el vigente; si no,
  cada reconversión aprobada aparecería como desviación. Probado contra la
  base real y con las migraciones aplicadas en producción.
- **Pantallas**: `/obras/[id]/movimientos` (estado del vigente e historial) y
  `/obras/[id]/movimientos/nuevo` (alta). Son dos rutas porque con 360
  partidas el formulario debajo de la tabla queda a media pantalla. El
  desplegable de partidas va agrupado por capítulo y en orden de documento, y
  cada opción muestra su **vigente** y si está a **suma alzada**: son las dos
  cosas que hay que saber antes de elegir de dónde sacar el dinero.
- **El formulario no pide importes con signo.** Cada línea dice si el dinero
  *sale de* o *entra en* una partida y la cantidad va siempre en positivo; el
  signo se compone en la frontera. Un menos olvidado convertiría una
  reconversión en un adicional encubierto, y uno de más la descuadraría. La
  unión vive en `lib/movimientos.ts`, compartida con la acción de servidor
  para que la vista previa y lo que se guarda no puedan discrepar.
- **El cuadre se recalcula mientras se escribe** y dice de qué lado falta
  («sale 500,00 más de lo que entra»), no solo que no cuadra.
- **Aprobar es de ADMIN y no se deshace**: un movimiento equivocado se
  corrige registrando otro de signo contrario. Las partidas de un adicional
  nacen al aprobar, no al guardar, para que un borrador descartado no deje
  partidas fantasma.
- La cláusula 1 del contrato define cuándo procede un adicional: *«trabajo
  adicional por vicios ocultos o cambios en el diseño original»*.
- **Verificado en navegador contra CRIOCORD** el 08/08/2026: reconversión
  que cuadra y que no cuadra, aprobación, avisos de suma alzada y de saldo
  insuficiente, adicional con partida nueva, deductivo, borrado de borrador
  y permisos por rol. Las dos comprobaciones que importaban salieron bien:
  una reconversión aprobada **no mueve** el presupuesto, y un adicional de
  S/ 2,500 lo sube exactamente S/ 3,125 (el 25 % de gastos generales y
  utilidad de la línea base). Si el ajuste se hubiera repartido por el signo
  del apunte en vez de por la partida que ajusta, el total habría cuadrado
  igual y el error no se habría visto.

**Módulo 3 — Permisos por empresa.** La matriz de `src/lib/rbac.ts` deja de ser
la última palabra y pasa a ser la **plantilla**: cada empresa concede o revoca
permisos sueltos encima de ella, desde `/empresa/permisos`.

- **Se guardan excepciones, no la matriz.** La ausencia de fila significa «lo
  que diga la plantilla». Por eso desplegarlo no cambió el permiso de nadie, y
  devolver una casilla a su valor por defecto **borra** la fila en vez de
  guardar otra que repita la plantilla.
- **Se resuelven al abrir la sesión**, una vez por petición, y viven en
  `SesionActiva.permisos`. De ahí que `puede()` reciba un sujeto con sus
  permisos ya resueltos y no un rol: desde que son configurables, el rol solo
  dice de dónde se parte. Efecto secundario útil: un cambio surte efecto en la
  siguiente petición, **sin cerrar sesiones**.
- La rejilla se edita entera y se guarda de una vez, enumerando antes qué va a
  cambiar. Solo viajan las casillas tocadas: si dos administradores editan a la
  vez, cada uno aplica lo suyo en lugar de pisarse.
- Cada cambio queda auditado con su antes y su después, incluyendo si el valor
  venía de la plantilla o era ya una excepción.

> **Límite que no se negocia.** `linea_base:aprobar` y `movimiento:aprobar` son
> actos contractuales irreversibles que mueven la cifra contra la que se mide
> la obra. Y `permiso:leer` y `permiso:editar` reparten todos los demás: si se
> pudieran conceder, un ADMIN se los daría a un CONSULTOR y ese se repartiría
> el resto a sí mismo. Los cuatro quedan **fuera de la matriz editable**.
>
> Se cierra por dos vías independientes: el servicio rechaza guardarlos, y
> `resolverPermisos` los ignora aunque la fila llegue a existir. La primera
> puede fallar por un descuido al añadir una ruta nueva; la segunda protege
> incluso frente a una fila insertada a mano en la base. Es lo que prueba
> `rbac.test.ts`, y no debe quitarse.

**Módulo 4 — Proveedores y órdenes.** De aquí sale el **comprometido**, la
primera de las cuatro columnas del control (§7), que hasta ahora no existía en
ninguna parte.

- **Catálogo de proveedores** en `/empresa/proveedores`, de la empresa y no de
  cada obra: el mismo proveedor trabaja en varias. El RUC lo identifica y es
  único. Al teclear los 11 dígitos se consulta SUNAT y se rellena la razón
  social; si el servicio falla o no hay token, se escribe a mano y ya.
- Un proveedor **no se borra, se desactiva**: sus órdenes son historia de la
  obra y tienen que seguir diciendo a quién se le compró.
- **Órdenes** en `/obras/[id]/ordenes`, con su alta en `/nueva`. Cada orden
  guarda su cascada —subtotal, descuento comercial, **neto**, IGV y total— y
  se **reparte entre las partidas** a las que carga.
- **El comprometido se mide contra el NETO.** El IGV que factura el proveedor
  es crédito fiscal: repartir el total inflaría la obra con dinero que se
  recupera. Hay un error dedicado a ese caso porque es el más fácil de
  cometer, dado que el total es la cifra que sale del banco.
- La pantalla cruza el comprometido con el **vigente** de cada partida y
  enseña el **saldo**, que es la columna que se mira. En negativo significa
  que ya se pidió de más, y eso se corrige con una reconversión o un
  adicional, no tocando la orden.
- **Anular no es borrar**, al revés que en los movimientos: cancelar un pedido
  a un proveedor es corriente. La orden se conserva con su motivo, que es
  obligatorio, y deja de contar.
- **El formulario siempre está disponible.** La carga por archivo, cuando
  llegue, será un acelerador encima, no la única vía. Que las dos no se pisen
  **no se confía a la interfaz**: se cierra en la base con el número de orden
  y el RUC como claves únicas por empresa. El importador topará con la misma
  restricción y por eso tendrá que enseñar lo que ya existe en vez de
  insertarlo otra vez. Cada registro guarda además su `origen` (MANUAL o
  IMPORTADO), que es lo que responde a «esta cifra, ¿la tecleó alguien o la
  leyó un importador?» cuando un total no cuadre.
- **Formas de pago reutilizables**, en `/empresa/formas-pago`. Las de las
  órdenes reales se repiten con pocas variantes, y volver a teclearlas invita
  a que cada orden acabe diciendo algo distinto de lo pactado. Se guardan con
  un nombre corto para el desplegable y su texto completo; al elegir una, el
  texto se **copia** en la orden y allí sigue siendo editable, porque lo
  acordado con un proveedor concreto casi siempre tiene un matiz que la
  plantilla no recoge. Desactivar no borra: las órdenes que la usaron guardan
  su propia copia, así que borrarla no las cambiaría, pero sí perdería el
  rastro de por qué media obra dice lo mismo. **No tienen permiso propio**:
  las gobiernan `orden:leer` y `orden:crear`, porque quien redacta órdenes es
  quien las necesita.
- **Partidas habituales por proveedor y obra.** Al elegir el proveedor, el
  reparto se carga con las partidas de las que suele hacerse cargo en esa
  obra: con 314 partidas, buscar las mismas cinco cada vez es trabajo que se
  puede ahorrar. Es **por obra y no por empresa** porque una partida no es una
  idea abstracta —`11.02.04` es una fila del presupuesto de CRIOCORD y en la
  siguiente obra será otra—, y además un mismo proveedor puede hacer vidrios
  en una obra y mamparas en otra. No limita nada: se sigue pudiendo imputar a
  cualquier partida. Tres decisiones evitan que estorbe: **solo carga si el
  reparto está vacío** (cambiar de proveedor a media orden no puede barrer lo
  ya escrito), **los importes se dejan en blanco** (la partida se repite de
  una orden a otra; la cifra nunca) y al guardar **se añaden** a las que ya
  tenga en vez de sustituirlas (una orden pequeña no debe reducir su lista a
  la única partida que trajo esta vez). Se configuran usándolas, con una
  casilla al guardar la orden: una pantalla de ajustes aparte sería una que
  nadie visitaría.

- **Verificado en navegador contra CRIOCORD** el 08/08/2026 con la orden real
  de CABREJO (`2026-07-00118`). Reprodujo el papel al céntimo —subtotal
  11,564.05, descuento 564.05, neto 11,000.00, IGV 1,980.00, total
  12,980.00— y el comprometido subió **11,000 y no 12,980**, que es la
  comprobación que valida el módulo. Se probó también el aviso de exceso:
  imputando toda la línea de ventanas a una sola de las tres partidas de
  mamparas, el saldo salió en negativo y la pantalla lo señaló.

> **Las dos reglas que se comprueban al aprobar**, y contra lo guardado, no
> contra lo que dijo el formulario:
>
> 1. **El reparto suma el neto.** Es el equivalente a que una reconversión
>    sume cero. Sin esto, el comprometido por partida no cuadra con lo que se
>    pidió de verdad.
> 2. **Las líneas que no son agrupadoras suman el subtotal.** Ver más abajo.

**Módulo 5 — El documento de la orden.** Hasta aquí la orden existía en la
base pero no había papel que mandarle al proveedor.

- **Se imprime desde el navegador**, en `/obras/[id]/ordenes/[ordenId]/imprimir`.
  El PDF lo compone el propio navegador con «Guardar como PDF»; no hay
  librería ni archivo generado en el servidor. El motivo es el mismo que
  obligó al adaptador puro de Prisma: en CloudLinux no corren los módulos
  nativos, así que Chromium queda descartado, y con 20 Entry Processes
  componer PDF en Node se paga en cada documento.
- **El documento no usa las variables del tema.** Lleva blanco y negro fijos y
  `print-color-adjust: exact`. Con `var(--fondo)` saldría gris sobre negro
  para quien tuviera el modo oscuro puesto, y esto sale a un tercero.
- **Se imprime en cualquier estado**, y el papel lo dice: un borrador lleva
  impreso que todavía no compromete presupuesto, y una anulada que quedó sin
  efecto. Hace falta poder revisar antes de aprobar y guardar copia de lo
  anulado, y el aviso viaja en el propio documento porque es ahí donde importa
  —cuando alguien reenvía el PDF por correo.
- **Las líneas agrupadoras se dibujan como subtotales**, con fondo gris y sin
  cantidad ni precio unitario. En el papel del cliente van con el mismo
  aspecto que las demás, y eso invita a sumar la columna y contar ese dinero
  dos veces: el mismo tropiezo que el Excel del presupuesto (§5).
- **La tasa del IGV no se guarda**, se deduce dividiendo el IGV entre el neto.
  Si la división no da una tasa reconociblemente entera, la etiqueta dice
  «IGV» a secas: es preferible un documento que dice menos a uno que le
  declara al proveedor una tasa que no es la que se le cobra. Está en
  `lib/ordenes.ts` y probado, porque una etiqueta equivocada sale impresa.

**Datos de la empresa**, en `/empresa/datos`. Existían en la base desde el
primer día pero no había dónde tocarlos. Se abren ahora porque son los que
encabezan y firman ese documento: sin representante legal, la orden sale sin
firmante.

- **El RUC no se edita desde ahí.** Identifica a la empresa y ya figura
  impreso en las órdenes emitidas; cambiarlo desde una pantalla de ajustes
  reescribiría en silencio documentos ya enviados.
- Las **observaciones al pie** —de quién es el riesgo del traslado y demás—
  viven en la empresa y no escritas en el código: son una condición
  contractual suya, no del sistema. Cada orden puede añadir las suyas encima.
- **Todavía no hay logotipo.** `public/` está vacío y no existe infraestructura
  de subida de archivos; `STORAGE_ROOT` está declarado en el entorno y no lo
  usa nadie. La cabecera sale con la razón social en texto.

**Módulo 6 — Retención de renta: no todo impuesto es IGV.** Leyendo las
órdenes reales para cargarlas apareció que tres de ellas no llevan IGV sino
**retención de cuarta categoría del 8 %**, porque el proveedor emite recibo
por honorarios. Y eso da la vuelta a la regla del módulo 4.

- **El IGV se recupera; la retención no.** El IGV es crédito fiscal, así que
  el costo de obra es el **neto**. La retención sale del banco y no vuelve,
  así que el costo es el **total**. Tratarla como IGV dejaba fuera del costo
  un 8 % que sí se paga —2,521.74 solo en la orden de RUBEN DARIO.
- **Tampoco se calcula igual.** El IGV se aplica SOBRE el neto y se suma. La
  retención se calcula sobre el **total**, porque lo pactado es lo que el
  proveedor cobra limpio: `29,000 / 0.92 = 31,521.74`. Calcularla como el IGV
  daría 2,320 y al proveedor le faltarían 201.74. Hizo falta añadir **división
  exacta** a `lib/decimal.ts`: multiplicar por el recíproco de 0.92 pierde
  precisión.
- **El tipo de impuesto va en el PROVEEDOR, no en cada orden.** Quien factura
  factura siempre, y quien emite recibo por honorarios también. Se pregunta
  una vez en su ficha y cada orden lo hereda con su tasa ya puesta; sigue
  siendo editable por excepción.
- **La columna `igv` pasa a llamarse `impuesto`.** Un campo llamado `igv` que
  a veces guarda una retención es justo la mentira que causó el error. Por lo
  mismo, la pantalla etiqueta la cifra según lo que sea y dice en cada orden
  contra qué se mide el comprometido.
- **La migración se escribió a mano con `RENAME COLUMN`.** Prisma la traducía
  como `DROP` + `ADD`, y eso habría borrado los importes de las órdenes ya
  cargadas. Vale como regla: al renombrar una columna con datos dentro, leer
  el SQL que genera Prisma antes de aplicarlo.
- **Está en el esquema pero todavía no en producción.** Es la migración
  pendiente de §6, y hasta aplicarla las órdenes no funcionan allí.
- Verificado con **102 pruebas**, con las cifras reales de PEDRO MENDOZA y
  RUBEN DARIO.

**Arquitectura de navegación.** Con seis módulos, la navegación del primer
día se quedó corta. Se rehízo entera.

- **Layout de obra con pestañas** (`obras/[id]/layout.tsx`): Presupuesto ·
  Revisiones · Movimientos · Órdenes, puestas en todas las subrutas. Antes
  eran botones que solo existían en la portada de la obra, así que ir de las
  órdenes a los movimientos obligaba a volver primero. El nombre de la obra y
  «Volver al panel» van una sola vez, en el layout. Todo el marco lleva
  `print:hidden`: **la vista del documento de la orden cuelga de esta ruta** y
  el papel que recibe el proveedor no puede salir con pestañas encima.
- **La cabecera lleva al panel.** El logotipo era un `div`; ahora es un
  enlace, y eso solo ya resuelve «volver al panel desde cualquier pantalla»,
  que dependía de que cada página se escribiera su «Volver». Los seis botones
  se agrupan en un desplegable de empresa y otro de usuario; por debajo de
  `sm`, un cajón con las etiquetas visibles. El «Volver» repetido en nueve
  pantallas es ahora `components/ui/Volver.tsx`.
- **Paginación en el servidor** (`lib/paginacion.ts`) para órdenes,
  movimientos y proveedores, de 20 en 20, con la página en `?p=`.
  `normalizarPagina` acota lo que venga: `?p=999` y `?p=abc` caen en una
  página válida en vez de en una lista vacía. El comprometido y el vigente se
  calculan **aparte y sobre todo**, no sobre la página.
  > **`listarProveedores` no se pagina, y es a propósito.** Alimenta el
  > desplegable del formulario de órdenes; recortarla escondería proveedores
  > sin que fallara nada. El catálogo usa una función aparte,
  > `listarProveedoresPagina`, con el `select` compartido para que no se
  > separen. Es la regresión más fácil de colar al paginar.
- **Las partidas no se paginan**: son un árbol con subtotales por capítulo y
  cortarlo por filas los descuadraría. En su lugar, **columnas colapsables**
  (se recuerdan en `localStorage`, y el ancho mínimo solo se aplica si queda
  alguna columna ancha, para que en móvil no haya scroll horizontal) y un
  **filtro** que arrastra los ancestros de cada coincidencia —`11.02.04` sale
  con su capítulo—, en `lib/partidas-filtro.ts` con pruebas.
- `obtenerSesion` y `obtenerObra` van en `cache()` de React: el layout y la
  página las piden por separado y sin esto serían dos consultas. Sigue
  verificando la sesión en cada petición.
- **Verificado en navegador contra CRIOCORD** el 08/08/2026: salto entre
  pestañas sin pasar por la obra, columnas que se recuerdan al recargar,
  filtro con ancestros, `?p=` acotado, y la vista de impresión sin cabecera
  ni pestañas.

**Alta de obras, y limpieza del historial de órdenes.**

- **Crear obra** en `/obras/nueva`, con botón en el panel. Hasta ahora las
  obras **solo nacían del script de seed**: `obra:crear` estaba en la matriz
  de permisos pero ningún servicio lo usaba, así que una empresa con la base
  recién creada no tenía por dónde empezar —el panel invitaba a crear la
  primera obra y no había con qué—. Nace en **planificación** por defecto; el
  código es opcional y, si se repite, el error dice **con qué obra** choca en
  vez de soltar el `Unique constraint failed` de Prisma. Las reglas están en
  `lib/obras.ts`, probadas.
- **Franja de dos barras en cada tarjeta del panel**: calendario (tiempo
  transcurrido) y comprometido sobre presupuesto, con un icono que abre las
  alertas reales —partidas sobregiradas, plazo vencido—.
  > **Solo se dibuja lo que se puede afirmar.** El avance físico y la ruta
  > crítica no existen todavía en el sistema, así que su barra va **vacía y
  > rotulada como pendiente**, y el globo lo dice. Pintarlas con un número
  > inventado sería peor que no pintarlas: las dos de arriba se leen juntas y
  > una tercera falsa contaminaría la lectura.
- **Las órdenes anuladas nacen plegadas** en el historial: ya no cuentan para
  nada y ocupaban lo mismo que una viva. La cabecera deja ver el motivo sin
  abrirla.
- **Borrar órdenes**, solo BORRADOR y ANULADA. Ninguna de las dos cuenta en el
  comprometido —`obtenerComprometido` solo suma las aprobadas—, así que
  borrarlas **no revierte ninguna cifra**: ya valían cero, y lo único que se
  pierde es el registro. Por eso el `AuditLog` se escribe **antes** de borrar,
  con número, proveedor e importes dentro. **Una aprobada no se borra nunca**:
  para eso está anular, que revierte igual y la conserva con su motivo. El
  permiso depende del estado —`orden:crear` para el borrador, `orden:anular`
  para purgar una anulada—, y la regla vive en `lib/ordenes.ts` con prueba.
- **Buscar y filtrar órdenes** por texto, proveedor, rango de fechas y estado,
  con la página bajada a **5**. Todo viaja en la URL, así que sobrevive al
  cambio de página y el enlace se puede compartir.
  > **Los filtros no tocan el comprometido.** Se descubrió probándolo: al
  > pasarle el total *filtrado* al panel, buscar algo que no coincidía lo
  > dejaba en cero y **el panel desaparecía**, como si el comprometido se
  > hubiera esfumado por escribir en un buscador. Por eso existe
  > `contarOrdenesDeObra`, que cuenta sin filtrar.
- Las tarjetas del panel se estiran a la altura de la fila (`h-full` y la
  franja al pie con `mt-auto`): si no, cada una mide lo que mide su texto y
  las barras arrancan a alturas distintas.
- **El panel se busca, se filtra y se pagina.** `listarObras` traía TODAS las
  obras y encima hacía dos agregados sobre todas ellas. Ahora acepta buscador
  por nombre y código, filtro por estado y páginas de 12. **No hay borrado de
  obras a propósito**: una obra es el registro contra el que se midió todo, y
  para apartarla está el estado Cerrada.
  > **El orden pone las activas primero y las cerradas al final, y sale
  > gratis de la base.** `estado` es un `ENUM` de MariaDB, y `ORDER BY` sobre
  > un ENUM ordena por el **índice de declaración**, no alfabéticamente. El
  > esquema lo declara `PLANIFICACION, EN_EJECUCION, PARALIZADA, CERRADA`,
  > que es justo el orden en que interesa verlas, así que no hizo falta ni
  > migración ni SQL a mano. Si algún día se reordena ese enum, **este orden
  > cambia con él**.

**Lenguaje visual.** La aplicación pasa a **tema claro por defecto** con
paleta **teal + coral**, siguiendo las referencias del cliente y lo que hacen
Procore, Autodesk Build o Linear.

- **El cambio salió barato porque la paleta ya estaba centralizada**: 62
  componentes, **362 usos de `var(--)` y un solo color fijo** en todo `src/`
  —el `themeColor` del navegador—. Cambiar los tokens de `globals.css`
  repinta la aplicación entera sin tocar los 52 ficheros con estilos en línea.
- **El oscuro deja de seguir al sistema.** Antes mandaba
  `prefers-color-scheme`, así que quien tuviera el sistema en oscuro veía la
  aplicación oscura sin haberlo pedido. Ahora es explícito:
  `:root[data-tema="oscuro"]`.
- **El fondo NO es blanco** (`oklch(0.955)`) y las tarjetas sí. Esa diferencia
  es la que da profundidad; con los dos en blanco todo se veía plano. Encima,
  tres capas de sombra (`--sombra-1/2/3`) y una textura de puntos en el fondo
  hecha con un gradiente, sin imagen ni petición.
- **Nada de 3D**, y es deliberado: las propias referencias son planas. En una
  pantalla de importes el 3D resta legibilidad. La sensación de solidez viene
  de la elevación, no del relieve.
- Los tres semáforos se separan en **tono y además en luminosidad**, para que
  se distingan también con daltonismo rojo-verde.
- **`ui/Chip.tsx`** unifica las etiquetas de estado, que estaban escritas tres
  veces —órdenes, obras y movimientos— y ya habían divergido en redondeo,
  tamaño y criterio de color. El color de cada estado de obra vive junto a su
  etiqueta en `lib/obras.ts`, no en la pantalla.

> **La impresión no se toca, y se comprobó.** El documento de la orden sigue
> en blanco y negro fijos; además el bloque `@media print` apaga ahora la
> textura del fondo y las sombras, que en papel saldrían como una trama de
> puntos grises y manchas.

> **Deuda asumida a conciencia.** Los textos secundarios se escribieron con
> `opacity-60/70`: son **204 usos en 51 componentes**. Sobre el fondo oscuro
> se leían; sobre el claro caen a ~4.5:1, al límite. Se subió el suelo de esas
> dos utilidades en `globals.css` (~7:1) en vez de hacer 204 ediciones a mano.
> Lo correcto a futuro es usar el token `--texto-suave`, que ya existe.

**Motores verificados con 102 pruebas.** (131 en total con las de paginación,
filtro, obras y borrado de órdenes.)
- `lib/decimal.ts` — aritmética exacta con enteros grandes, **división
  incluida**. Nunca coma flotante para dinero.
- `lib/paginacion.ts` — acotado de la página y cuenta de páginas.
- `lib/partidas-filtro.ts` — filtrado que conserva los ancestros de cada
  coincidencia.
- `lib/obras.ts` — validación del alta: nombre, estado y un plazo que no vaya
  hacia atrás. Rechaza los días que no existen, porque `new Date("2026-02-31")`
  no falla: rueda al 3 de marzo.
- `lib/excel-presupuesto.ts` — lectura de presupuestos.
- `lib/jerarquia-partidas.ts` — jerarquía de códigos y suma por hojas.
- `lib/presupuesto.ts` — cascada, comparación de revisiones y conversión
  exacta entre porcentaje y fracción.
- `lib/rbac.ts` — permisos efectivos por empresa, y que los cuatro
  innegociables no se puedan reconfigurar por ninguna vía.
- `lib/ordenes.ts` — cascada de la orden, la regla del agrupador, el cuadre
  del reparto y las dos formas de calcular el impuesto (IGV sobre el neto,
  retención sobre el total). Sus pruebas usan las cifras **reales** de cinco
  órdenes del cliente; si alguna deja de cuadrar, lo que está mal es el
  código.

## 4. Decisiones de arquitectura, y por qué

Ninguna es cosmética. Cambiarlas rompe algo.

**Aritmética con enteros grandes, no coma flotante.** `4.25 × 95` en JS da
`403.74999999999994`. En un presupuesto eso son céntimos que no cuadran. Los
importes viajan siempre como texto, nunca pasan por un `number`.

**Contraseñas con `scrypt` de Node, no argon2 ni bcrypt.** Estos son módulos
compilados: el binario que se construye en el servidor de integración no
ejecuta en CloudLinux. `scrypt` viene dentro de Node.

**Adaptador `@prisma/adapter-mariadb`, no el motor Rust de Prisma.** Mismo
motivo: el cliente queda en JavaScript puro.

**Sesiones con tokens opacos en base de datos, no JWT.** Permite revocar el
acceso al instante al desactivar un usuario. En la base solo vive el hash.

**La línea base es inmutable.** Si se pudiera editar, los indicadores se
recalcularían hacia atrás y el sistema mentiría. Los cambios posteriores van
como adicionales o reconversiones ENCIMA de ella.

**Los porcentajes viven en la revisión, no en la obra.** Si vivieran en la
obra, recalcular una revisión antigua daría otro número y comparar dos
revisiones perdería sentido.

**Control SIN IGV.** El IGV que facturan los proveedores es crédito fiscal,
no costo. Incluirlo inflaría el costo con dinero que se recupera. El propio
Excel del cliente dice «RESUMEN FINAL (SIN IGV)». Se guardan las tres cifras:
neto (costo), impuesto (crédito) y total (lo que sale del banco).

**Pero «sin IGV» no es «sin impuestos».** La retención de renta que se aplica
a quien emite recibo por honorarios **no se recupera**, así que ahí el costo
es el total y no el neto (§3, módulo 6). La regla de arriba vale para el IGV
porque el IGV vuelve; generalizarla a todo impuesto es el error que costó
dejar fuera del costo un 8 % en tres órdenes reales.

**Los componentes no importan Prisma.** Todo acceso a datos pasa por
`src/services/`, donde se verifican permisos y se filtra por empresa. La
regla la impone ESLint, no la convención.

**El `companyId` sale siempre de la sesión, nunca de la petición.** Es lo
único que impide que un cliente vea obras de otro manipulando la URL.

---

## 5. El caso CRIOCORD: cómo se cuadró el presupuesto

Esto es conocimiento ganado a pulso. **No lo deshagas.**

El importador leía inicialmente **S/ 1,817,055.47** de un presupuesto que
vale **S/ 735,255.55**. Cuatro causas, todas reales:

**1. Celdas combinadas.** El Excel tiene bloques donde varias filas comparten
un único importe: `D315:H323` son nueve líneas de drywall con un solo precio
de 79,727.33. Eso es la definición de una partida a suma alzada cuyo alcance
se detalla en varias líneas. `exceljs` devuelve el valor de la celda maestra
al leer cualquier celda del bloque, así que el importador lo contaba nueve
veces. **Ahora se leen las combinaciones que declara el archivo.**

> Antes intenté deducirlo comparando importes iguales en filas seguidas. Era
> frágil: en el Capítulo III marcaba como repetidas dos partidas que valen
> 1,050 cada una y son realmente distintas. El archivo lo declara; adivinarlo
> sobraba.

**2. Filas ocultas.** Hay **57 filas ocultas con S/ 159,283.68**: el Capítulo
XII completo y los subcapítulos 11.11 a 11.14. Ocultar una fila es la forma
habitual de dejar una partida fuera de alcance sin borrarla. **No se
importan**, pero se informa cuántas eran y cuánto sumaban.

**3. El importe del archivo manda sobre metrado × precio.** Hay partidas
contratadas en bloque cuya fórmula es literalmente `=F225`, sin multiplicar
por la cantidad. Recalcularlas sobrescribía la cifra pactada.

**4. Un descuento no sustituye a su partida padre.** La regla «el costo de una
rama es la suma de sus hojas» descartaba a un padre en cuanto una hija tenía
importe. Pero `7.09.00 GASTOS VARIOS` lleva 779.10 a suma alzada y su única
hija con cifra es un descuento comercial. **Solo un importe positivo cubre a
su ancestro.**

Resultado: **S/ 735,255.61** contra los S/ 735,255.55 del Excel. Seis
céntimos, atribuibles a que el Excel arrastra más decimales de los que
muestra.

### Las tres verificaciones estructurales

Todo importador de presupuestos debe hacerlas siempre:

1. **Celdas combinadas** → un importe compartido cuenta una vez
2. **Filas ocultas** → fuera de alcance, no se importan
3. **Jerarquía real de códigos** → `7.02.00` es padre de `7.02.01`, aunque
   ambos tengan tres segmentos

### Convenciones de código que conviven

- `4.0` capítulo, hijas `4.1`, `4.2`
- `01.02` subcapítulo S10, hijas `01.02.01`
- `7.02.00` cabecera de grupo, hijas `7.02.01` — **misma profundidad**

Y hay huecos: `11.11.02` a `11.11.19` existen pero su cabecera `11.11` no.
Por eso `codigoPadre` sube por la jerarquía hasta encontrar un ancestro real.

### La cascada del presupuesto

```
costo directo         762,077.15    suma de partidas positivas
+ descuentos          -26,821.60    partidas con importe negativo
= subtotal            735,255.55
+ gastos generales     88,230.67    12 %
+ utilidad             95,583.22    13 %
= PRESUPUESTO         919,069.43    <- la cifra de control, SIN IGV
+ IGV                 165,432.50    18 %
= total general     1,084,501.93
```

Revisiones del cliente: 19/05/2026 = S/ 952,596.43 · 03/06/2026 =
S/ 919,069.43 · diferencia S/ 33,527.00 = US$ 9,689.88 (tipo de cambio 3.46).

**Los pasos intermedios se calculan con seis decimales y solo se redondea al
final.** Redondear en cada paso desplaza el total varios céntimos.

---

## 6. Pendiente, en el orden acordado con el cliente

Nota de cuadre: con 12 % y 13 % la cascada de CRIOCORD sale en
**S/ 919,069.51**, ocho céntimos por encima de los 919,069.43 del cliente.
Son los seis céntimos conocidos del costo directo (762,077.21 frente a
762,077.15) amplificados por el 25 % de gastos generales y utilidad. No es
un error nuevo.

Las reconversiones y los adicionales, que encabezaban esta lista, **ya están
hechos**: servicio, pantallas y migraciones en producción. Lo que queda de
ellos es comprobarlos en navegador contra CRIOCORD (§3).

La gestión de permisos por empresa, que la encabezaba después, **también está
hecha**: está en §3. Lo siguiente en el orden acordado son las fases de abajo.

La **arquitectura de navegación** —menús responsive, volver al panel en cada
pantalla, paginación de las listas y columnas colapsables en el presupuesto—
**está hecha y verificada en navegador**: el detalle está en §3.

### Lo siguiente, acordado con el cliente

El **panel con muchas obras** —buscador, filtro por estado y paginación— ya
está hecho: el detalle está en §3.

1. **Página de perfil del usuario.** Casi todo existe ya en el modelo `User`
   —`tipoDoc`, `numDoc`, `celular`, `email`, `cargo`—, así que es sobre todo
   mostrarlo y editarlo, sin migración. Ojo: **el RUC no es de la persona**,
   es de la empresa; ahí iría en solo lectura.
2. **Biblioteca de archivos** con categorías, subcategorías, subida de
   documentos y envío con trazabilidad. Es un subsistema, no una pantalla:
   necesita **migración propia**, infraestructura de subida —`STORAGE_ROOT`
   está declarado en el entorno y **no lo usa nadie**— y un mailer, porque las
   variables `SMTP_*` existen pero no hay código que las use. Acordado:
   **correo con adjunto de verdad, y para WhatsApp un enlace `wa.me`** con el
   texto ya escrito. Sin la API de WhatsApp Business **no se puede adjuntar un
   archivo**; como mucho viaja un enlace. Eso es un límite del canal.

> ### ⚠️ Migración pendiente en producción — `20260808120000_impuesto_de_la_orden`
>
> **Lo primero que hay que hacer.** La última migración aplicada en
> `drcacere_gcm` es `20260808113630_datos_de_la_empresa`; la del módulo 6
> **no está aplicada**, y el código que la necesita **sí está desplegado**
> (llegó en `130a4f4`, ya en `main`, y el despliegue es automático en cada
> push). Producción corre por tanto con un código que busca `impuesto` y
> `tipoImpuesto` en una base que todavía tiene `igv` y ninguna de las dos
> columnas nuevas: **las pantallas de órdenes fallan allí hasta que se
> aplique**.
>
> Se arregla desde el Terminal de cPanel. **Las tres líneas, en este orden**:
>
> ```bash
> source /home/<usuario>/nodevenv/<app>/22/bin/activate
> cd ~/gcm
> npx --yes prisma@7 migrate deploy
> ```
>
> Sin el `source`, el jailshell responde `npx: command not found` —Node no
> está en el PATH hasta activar el entorno del panel— y con `npx prisma` a
> secas tampoco lo encuentra: Next empaqueta Prisma dentro del código
> compilado y no queda como módulo suelto. Está en `docs/infraestructura.md`,
> y aun así se tropezó con ello.
>
> La migración renombra `ordenes_compra.igv` a `impuesto` y añade
> `tipoImpuesto` a `ordenes_compra` y a `proveedores`, con `IGV` por defecto
> para que las órdenes ya cargadas queden correctas sin tocarlas. **Está
> escrita a mano con `RENAME COLUMN` precisamente para conservar los
> importes**: no la sustituyas por una regenerada con Prisma, que la traduce
> como `DROP` + `ADD`.
>
> Esta es exactamente la segunda trampa del procedimiento —que el orden
> importa cuando el esquema cambia: el código llegó antes que la migración—.
> Esa y la otra (el despliegue no entra hasta la primera petición) están en
> `docs/infraestructura.md`.

> **La base de producción no se llena sola.** Los datos de la empresa
> —representante legal, cargo, observaciones al pie— se escriben en cada
> entorno por separado. Rellenarlos en local no los pone en producción, y una
> orden impresa allí saldría firmada con la razón social en lugar del nombre.

### Brecha conocida — el rol por obra no se aplica

`ProjectMembership` existe en el esquema con un `role` por obra, y el
comentario de `User.role` dice que «tiene prioridad» sobre el rol de empresa.
**No es cierto hoy**: ningún archivo de `src/` lo consulta, y las
comprobaciones de permiso resuelven todas con el rol de empresa.

Cerrarlo obliga a que el permiso deje de depender solo de la sesión y pase a
depender de la obra que se esté mirando, es decir, a llevar el `obraId` hasta
cada comprobación y hasta pantallas que hoy no lo tienen. Se dejó fuera de la
gestión de permisos a propósito, porque el cliente pidió permisos por empresa
y no roles por obra. Mientras siga así, **el comentario del esquema promete
algo que no ocurre**: o se implementa o se retira.

### Fases posteriores

| Fase | Contenido |
|---|---|
| Despliegue | **HECHO.** `gcm.drcaceresruiz.com` en línea. GitHub Actions compila y sube un `gcm.tar.gz` por FTPS; `app.js` lo descomprime al arrancar. Automático en cada push a `main`. **Las migraciones siguen siendo manuales** (`npx prisma migrate deploy` desde el Terminal de cPanel). Ver `docs/infraestructura.md` |
| Cronograma | Importar desde XML de MS Project (el `.mpp` es binario propietario y no se puede leer). Planificación semanal, ruta crítica |
| Avance físico | Metrados ejecutados, Curva S, evidencia fotográfica |
| Proveedores | **Órdenes HECHAS** (§3). Faltan **anticipos**, recepciones y abonos, que son las otras tres columnas del control |
| Indicadores | Tablero en vivo, cortes de control, EVM. **Antes de dibujarlo, resolver que las cuatro columnas del control no son homogéneas: lo pagado lleva IGV y el resto no** (§7) |
| Reportes | Informe semanal en PDF y Excel. El PDF sigue el camino ya abierto por el documento de la orden (§3): vista de impresión y `window.print()`, sin librería en el servidor |
| Resto | Caja chica, almacén, actas, gestión documental, WhatsApp |
| Escritorio | Tauri v2 como contenedor + PWA |

Las 16 órdenes reales del cliente están en `docs/referencias/`
(`OC 2026-07-00113` a `OC 2026-08-00126`). Se analizaron tres —FCM, SIV AIRE
y CABREJO, la más simple, la más grande y una con descuento— y de ahí salió
el diseño del módulo; lo aprendido está en §7. **Quedan por cargar al
sistema**: se meten solo las cabeceras, sin el detalle de líneas, porque para
el comprometido hacen falta los importes y no las especificaciones de cada
difusor.

## 7. Cosas que conviene saber

**El control es Comprometido / Devengado / Pagado / Saldo.** Decidido con el
cliente. El indicador de rentabilidad se calcula sobre el **devengado**, no
sobre lo pagado: la cláusula 5 del contrato fija un adelanto del 35 % más un
20 % al día 15, así que más de la mitad se paga antes de ejecutar. Contarlo
como costo mostraría medio presupuesto consumido con la obra empezando.

> **Las cuatro columnas NO son homogéneas, y eso hay que resolverlo antes de
> construir el tablero.** Comprometido y devengado son costo y van **sin
> IGV**; lo pagado sale del banco **con IGV**. Puestas en la misma fila tal
> cual, «pagado» aparecería siempre por encima de «devengado» aunque se
> hubiera pagado exactamente lo devengado, y esa diferencia —el 18 %— se
> leería como un sobrecosto que no existe.
>
> La salida es separar dos cosas que hoy caben en la misma palabra: **lo
> pagado imputable a costo**, sin IGV y comparable con el resto, y **la salida
> de caja**, con IGV, que es lo que cuadra con el extracto bancario. Son dos
> columnas, no una.
>
> No hace falta decidirlo hasta que se construya el módulo de abonos, pero sí
> antes: si el tablero nace con cuatro columnas, el problema se descubre
> enseñándoselo al cliente.

**Se guardan siempre las tres cifras: neto, impuesto y total.** Lo hacen la
revisión y también cada orden, y cada una responde a una pregunta distinta:
el **impuesto** lo necesita contabilidad y el **total** es lo que sale del
banco y lo necesita tesorería. Tirar cualquiera obliga a recalcularla
después, y recalcular un impuesto hacia atrás es donde aparecen los céntimos
que no cuadran.

**Cuál de ellas es el costo depende del impuesto** (§3, módulo 6): con IGV
es el **neto**, porque el IGV se recupera; con retención de renta es el
**total**, porque no se recupera. Por eso el campo se llama `impuesto` y no
`igv`, y por eso no se puede escribir «el comprometido es el neto» sin mirar
antes qué clase de impuesto lleva la orden.

**Los porcentajes se guardan como fracción y se muestran como porcentaje.**
La base tiene `Decimal(6,4)` y la cascada multiplica por `0.12`, pero nadie
dicta «cero coma doce» por teléfono. La traducción vive en la frontera, en
`porcentajeAFraccion` y `fraccionAPorcentaje` (`lib/presupuesto.ts`), y se
hace con aritmética exacta, nunca dividiendo entre cien: `12.1 / 100` da
`0.12100000000000001`. Si añades otro porcentaje al sistema, pásalo por ahí.

**Borrar una obra no funciona, y viene de antes.** `WbsItem.parent` es
`onDelete: Restrict`, así que la cascada de `Project` choca en cuanto la obra
tiene capítulos con partidas dentro. El permiso `obra:eliminar` existe en la
matriz pero no hay servicio que lo use, así que nadie se ha topado con ello.
Cuando se implemente habrá que borrar a mano en orden: movimientos, partidas
hijas, partidas raíz, líneas base y por último la obra.

**El servidor de producción usa `latin1` por defecto.** La base de producción
debe crearse explícitamente en `utf8mb4` o los acentos y la eñe se rompen.

**Producción tiene MariaDB 10.11 y desarrollo 12.3.** Validar las migraciones
contra el servidor real pronto, no al final.

**Al cambiar el esquema de Prisma hay que borrar `.next`.** El servidor de
desarrollo cachea el cliente antiguo y da errores de campo desconocido que
parecen otra cosa.

**Quedan tres avisos de importes repetidos** que son legítimos (partidas
distintas con el mismo precio). Son informativos y no alteran ningún total.

**El Excel del cliente tiene un total en caché desconcertante.** El del
Capítulo XI guarda 166,942.42, pero sus fórmulas recalculadas darían otra
cosa. Merece la pena avisarle de que revise el archivo.

**Las órdenes del cliente repiten la trampa del presupuesto.** Cada bloque
abre con una línea que **repite la suma de sus hijas**: en la de FCM,
«TOTAL ESTRUCTURAS 34,800.00» va seguida de siete líneas que suman
exactamente 34,800, y la de SIV AIRE llega a **tres** niveles. Sumar las
líneas en plano da 69,600 en vez de 34,800 —el doble— sin que nada falle. Es
el mismo fallo de las celdas combinadas de §5, y por eso cada línea guarda
`esAgrupador`. Hay una prueba que verifica ese 69,600 para que se vea el
tamaño del error si alguien quita la marca.

**El correlativo de las órdenes no es cronológico.** Hay una de mayo con el
número 00121, posterior a una de julio con el 00113. Nunca ordenar por
número: para eso está la fecha.

**Las órdenes se titulan todas «orden de servicio»**, incluso las que
suministran equipos (SIV AIRE son 159 mil de aire acondicionado). El título
del papel no distingue nada; el tipo se guarda aparte.

**El proveedor puede ser persona natural.** CABREJO tiene RUC 10061662257: los
de empresa empiezan por 20 y los de persona natural por 10.

**Las formas de pago varían demasiado para modelarlas todavía.** Cinco
adelantos con condiciones en FCM, «60 % adelanto y saldo contra entrega» en
SIV AIRE, 50/40/10 en CABREJO. Se guardan como TEXTO a propósito: modelar un
calendario de anticipos sin haber visto cómo se pagan de verdad sería
inventárselo. Llegará con el módulo de abonos. Lo que sí hay es un catálogo
de **plantillas de texto** reutilizables (§3, módulo 4): ahorra teclearlas,
pero sigue sin ser un calendario.

**Las migraciones se siguen aplicando a mano.** Lo dice la fila de Despliegue
de la sección 6 y sigue siendo cierto: el despliegue del código es automático
en cada push a `main`, pero el esquema no viaja con él. Hay que entrar al
Terminal de cPanel y ejecutar `npx prisma migrate deploy`. El detalle está en
`docs/infraestructura.md`. **Ahora mismo hay una pendiente** y producción
está rota por eso: ver el aviso al principio de §6.

---

## 8. Rotación de las credenciales expuestas

Estuvieron en claro en este documento desde el commit `c19d002`, en un
repositorio público. Se retiraron el 07/08/2026, pero **siguen en el
historial de Git**: quien tenga el SHA de ese commit puede leerlas.
Reescribir la rama no ayuda —GitHub conserva los objetos y las copias ya
clonadas no se recuperan—, así que lo único que las invalida es cambiarlas.

### Hecho el 07/08/2026 — MariaDB

- Usuario `gcm`, en todos sus hosts (`localhost` y `127.0.0.1`).
- `root` en `localhost`, `127.0.0.1`, `::1` y **`asus-caceres`**.
- Comprobado: la clave publicada `gcm_dev_2026` ya no abre ninguna cuenta.
- `DATABASE_URL` de `.env` actualizada. La clave nueva de root se escribió
  en `mariadb-root.key` (ignorado por la regla `*.key`) para moverla a un
  gestor de contraseñas y borrar el archivo.

Las claves se generaron dentro del script de rotación y nunca se
imprimieron por consola: una clave que pasa por la terminal acaba en su
registro, que es el problema que se estaba cerrando.

> **La cuenta por nombre de equipo casi se escapa.** MariaDB crea en la
> instalación un `root@<nombre-del-equipo>` además de los de loopback. Un
> primer intento rotó solo `localhost`, `127.0.0.1` y `::1`, y
> `root@asus-caceres` se quedó con la clave publicada. Al rotar claves de
> MariaDB hay que listar siempre `SELECT User, Host FROM mysql.user` y
> cubrir todas las filas, no las que uno da por supuestas.

### La clave de root de MariaDB se perdió

Al rotarla el 07/08/2026 se guardó en `mariadb-root.key`, y ese archivo se
sobrescribió por accidente antes de copiarla a un gestor. Era aleatoria y no
estaba en ningún otro sitio, así que **nadie conoce la clave de root del
MariaDB de desarrollo**.

**No bloquea nada.** La aplicación se conecta con el usuario `gcm`, que tiene
todos los privilegios sobre `gcm_dev` y sobre las bases sombra que necesita
Prisma para migrar. Root solo hace falta para crear bases o usuarios nuevos.

Si algún día se necesita, se reinicia con el procedimiento estándar de
MariaDB en Windows, desde un símbolo del sistema **como administrador**:
parar el servicio, arrancar `mysqld` con `--skip-grant-tables`, fijar la
clave nueva y volver a arrancar el servicio.

Lección: una clave de un solo uso no debe quedarse en un archivo de texto
esperando a que alguien se acuerde de moverla. O va directa al gestor de
contraseñas, o no se genera.

### Hecho — clave del usuario administrador

Cambiada el 07/08/2026 desde la propia aplicación. Sustituye a la que quedó
publicada en el commit `c19d002`.

De paso se descubrió que *Cambiar contraseña* **existía desde el módulo 0
pero no estaba enlazada en ninguna pantalla**: la única forma de llegar era
escribir la dirección de memoria. Ya hay un botón en la cabecera.

Sigue en pie el aviso general: si esa contraseña se reutilizaba en algún otro
servicio (correo, hosting, banca), hay que cambiarla también allí.

### Pendiente — restringir a quién escucha MariaDB

Durante la rotación se vio que `bind_address` está **vacío** y
`skip_networking` en `OFF`: el servidor escucha en todas las interfaces, no
solo en loopback. Con una clave de root publicada en GitHub, cualquier
equipo de la red local podía entrar como root. Ya no, pero un MariaDB de
desarrollo no tiene por qué ser alcanzable desde fuera. En `my.ini`:

```ini
[mysqld]
bind-address = 127.0.0.1
```

### Qué NO hace falta

- **No hay que reescribir el historial.** Con las credenciales rotadas, las
  del historial no abren nada. Un `filter-repo` obligaría a reclonar a
  cualquiera con copia y no borra los objetos que GitHub ya guardó.
- **`APP_SECRET` no estuvo expuesto:** nunca se documentó, solo aparece
  como marcador en `.env.example`.
- **Producción no está afectada:** `docs/infraestructura.md` censura nombre
  de servidor, usuario y claves desde el principio.

### Para que no vuelva a pasar

La regla que ya sigue `docs/infraestructura.md`: en un archivo versionado se
escribe `<usuario>`, `<clave>`, `CLAVE`, nunca el valor. Las credenciales
viven en `.env` y en los secretos del repositorio, y el documento solo dice
dónde buscarlas.