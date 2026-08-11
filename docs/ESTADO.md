# Estado del proyecto GCM

Documento de traspaso. Léelo antes de tocar nada: recoge lo construido y por
qué está construido así.

**Lo que FALTA vive en [`PENDIENTES.md`](PENDIENTES.md)**, aparte, para poder
tacharlo sin reescribir esto.

Última actualización: 10 de agosto de 2026.

> **Las secciones 3 y 6 de abajo se escribieron el 8 de agosto.** Lo ocurrido
> desde entonces está en el anexo que sigue; ante una contradicción, manda el
> anexo.

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