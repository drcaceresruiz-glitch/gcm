# Pendientes de GCM

Lo que falta, ordenado por lo que duele antes. Este documento y `ESTADO.md`
son la unica memoria entre sesiones: lo que no esta escrito aqui, se pierde.

Ultima revision: 11 de agosto de 2026.

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
5. **Avisar de las restricciones a los implicados** (punto 5, aplazado a
   proposito para no ensanchar el trabajo anterior). Pedido por el usuario
   final: un aviso DENTRO de GCM cuando una tarea queda lista o cuando una
   restriccion lleva demasiado sin levantarse, y ademas por **SMS y correo** a
   los implicados, que tienen que poder **configurarse**. Lo que hay que
   decidir antes de escribir codigo:
   - **Quien es un implicado**: por obra, por rol, o por flujo de restriccion
     (el de MATERIALES no es el de INFORMACION). Lo tercero es lo util y lo
     que mas trabajo cuesta.
   - **Cuando se avisa**: al analizar, al levantar la ultima, o por
     antiguedad. Un aviso por cada casilla marcada seria ruido en tres dias.
   - **Con que se manda**: la cola de SMS por empresa ya existe (6g) y el
     correo tambien. La pieza que falta es a QUIEN.
6. **El arrastre de lo incumplido** (acordado el 11 de agosto: se construye
   DESPUES de los avisos). Un compromiso que se incumple no va a ninguna parte:
   se queda dentro de su semana cerrada y nadie vuelve a abrirla. Detalle y
   razonamiento en la seccion 6i.
7. **Skills propias de GCM** con `/batch`: una por dominio, cada una en su
   worktree. Investigacion hecha el 11 de agosto, plan sin escribir.

Y sigue sin existir el **parte diario**, que es el Bloque 1 entero de la
matriz de control y lo que le falta a GCM frente a Foco en Obra.

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

- **Requisitos de cierre**: no permitir cerrar con valorizaciones, pagos o
  tareas pendientes; listar lo que falta igual que al arrancar.
- **Acta de cierre** con lecciones aprendidas (auditoria y aprendizaje).
- **Repositorio de obras cerradas**: listar, buscar y revisar en solo
  lectura, con estadisticas comparadas.
- **¿Reabrir?** Hoy una obra cerrada por error no tiene salida. Propuesta:
  permitirlo con permiso propio y quedando en la auditoria. Sin decidir.
- **Eliminar obra**: el usuario borro su obra de prueba por SQL; en la app no
  debe existir el borrado cuando este en produccion real.

## 3. Cronograma: opcion B (decidida el 10 de agosto)

Project **solo siembra** el plan una vez; despues se edita y se corta siempre
desde la app. Para que eso sea posible GCM tiene que calcular por si mismo lo
que hoy lee del archivo:

- `porcentajePlaneado` por tarea a una fecha dada.
- Camino critico (`esCritico`) y holgura.
- Motor de fechas que respete el calendario laboral de la obra
  (`calendario.service` ya guarda los dias laborables).
- Editor manual con dependencias y recalculo automatico (ya decidido:
  arrastrar y soltar llega despues, el motor es lo primero).

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
- **Fase B**: pestana Evidencia de la obra: vista agregada con filtros.
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

## 5. Notas y Recordatorios (propuesta aceptada a falta de "adelante")

Bitacora libre de obra con recordatorios. Adaptaciones a GCM ya decididas:
permisos en la matriz (nota:leer/crear/gestionar), NO tabla de auditoria
propia (se usa auditLog), estado "vencido" DERIVADO (pendiente + fecha
pasada), categorias fijas al inicio (financiero/logistica/operativo/legal).
Una nota que describe una restriccion de tarea debe marcarse en el Lookahead
—la UI lo dira—. Adjuntos sobre la MISMA infraestructura de archivos de la
evidencia (seccion 4), con hash SHA-256 al subir y purga que borra el archivo
pero deja el registro inmutable (nombre, hash, quien, cuando, tamano).
Compresion en el NAVEGADOR, nunca en el backend (LiteSpeed mata procesos
lentos). Limite 5 MB. Notificaciones: campana in-app por sondeo ligero (sin
websockets en este hosting) + resumen diario por correo via cron (el SMTP de
recuperar clave ya existe) + preferencias por usuario en Perfil.

Orden de entregas acordado: plantilla Excel → infraestructura de archivos
(hash+purga) + Evidencia Fase A con QR → Notas E1 (CRUD + pestana + widget
de proximos recordatorios) → Notas con adjuntos → Notificaciones.

## 6. Importacion de presupuesto (Excel)

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
2. **Busqueda en el manual dentro de la app**: panel de ayuda que busca
   sobre MANUAL.md. Entra despues de la evidencia con QR.
3. IA conversacional solo si algun dia es requisito de venta, y entonces
   via API de pago (p. ej. Claude Haiku) anclada a los datos de la obra
   —decision de producto para ese momento—.

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
3. **Reabrir + reguardar borra cumplido/causa/notaCierre** (ALTO):
   `mapaPreservablePorUid` rescata los campos operativos pero no los del
   cierre. PPC a 0 y Pareto sin causas, mientras el avance escrito se queda.
4. **Eliminar una semana deja avances huerfanos** (ALTO): `onDelete: SetNull`
   sobre `planSemanalId`; quedan indistinguibles de un reporte manual y
   **nadie los puede reemplazar nunca** (la limpieza filtra por plan).
5. **Curva S / EVM leen otro conjunto de tareas** que la pantalla de avance
   (base vs vigente): dos cifras con el mismo nombre en la misma pantalla.
6. **Los hitos entran al Lookahead y al PPC**: `tareasDeLaSemana` filtra
   `esResumen` pero no `esHito`, y `TareaProgramada` ni declara el campo. Entra
   al denominador del PPC. Otros modulos (`mapeo.service`, `control-avance`) SI
   lo excluyen, con el razonamiento escrito.
   > La mitad de este defecto se cerro el 11 de agosto de 2026: ya no se
   > siembran 7 restricciones a un evento de duracion cero, porque no se
   > siembra ninguna. Lo que sigue abierto es que el hito entre al denominador
   > del PPC y a la ventana del Lookahead.
7. **Celda de importe editable en filas ALCANCE** (`TablaPartidas.tsx`):
   `parcialCalculado` solo es true para PRECIOS_UNITARIOS, y
   `actualizarPartida` no comprueba `tipo` ni `modalidad`. Un ALCANCE con
   importe suma por encima del dinero de su partida padre.
8. **El avance puede retroceder** sin aviso (no hay control de monotonia).
9. **`cantidadEjec` no alimenta nada**: es la medicion mas precisa que hay
   —m2 reales contra comprometidos— y muere ahi. Se puede cerrar con 60 de
   120 y marcar cumplido.
10. **`MapeoTareaPartida` no tiene `fraccion`** (su hermano `EncargoPartida`
    si). Hoy `importePorTarea` cuenta la partida entera en cada tarea que la
    mapea y la pantalla de mapeo ya suma de mas. **Bloqueante antes de
    activar la ponderacion por dinero**, que la UI promete y `curva-s` no
    implementa (pondera siempre por duracion).
11. **`subtotalesPorRama`** (`jerarquia-partidas.ts`, nuevo y probado con el
    invariante «la suma de los subtotales raiz == costo directo») todavia NO
    lo usa `listarPartidas`, que mantiene su propio rollup por `parentId`.
12. **Vocabulario**: «partida» significa `WbsItem` en presupuesto y
    `TareaCronograma` en cronograma, a veces en la misma pantalla; «frente de
    trabajo» es una tarea en evidencia y un paquete de partidas en encargos.
    El peor: la pantalla de mapeo, cuyo proposito es ensenar la diferencia,
    dice «sus partidas hijas» donde debe decir «sus tareas hijas».

**Orden acordado**: 1 y 2 (el dinero) —HECHOS—, luego 7, luego el resto. Con
el BAC ya sano, la **pagina de control economico** deja de estar bloqueada:
era lo que faltaba para no darle autoridad visual a cifras infladas.

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
5. **`SMS_COLA_TOKEN` sigue sirviendo, pero SOLO a las empresas sin emisor
   propio.** Es la transicion, para que nadie se quedara sin SMS el dia del
   cambio, y **esta pensada para borrarse**: mientras exista, un solo secreto
   alcanza la cola de cualquier empresa que se quede sin emisor.

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
**Se construye DESPUES de los avisos a los implicados** (decision suya).

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

---

## 8. Documentacion

- **`MANUAL.md` quedo atras el 10 de agosto.** Describe el panel como si
  cargara los once modulos siempre, y no menciona las pestanas en dos niveles
  (Plan / Ejecucion / Compras) ni el menu de empresa agrupado.
- **Faltan capturas y videos.** Se pidio que el manual fuera «el super
  tutorial para dummies»; hoy es solo texto.

---

## 9. Seguridad

Anotado antes del 10 de agosto, sin tocar:

- **Limite de intentos por IP en el login.**
- **Limite de peticiones a SUNAT.**
- **Cinco consultas sin filtro por empresa**: `obras.service` (lineas 196,
  233, 402), `tablero.service` (427) y `actividad.service` (76).
- **Fuga por el texto del error de correo duplicado** en el alta NORMAL de
  usuarios. En el alta de constructoras ya esta resuelta con
  `CORREO_NO_DISPONIBLE`: el mensaje no debe permitir averiguar si una persona
  ya es usuaria de otra empresa.

---

## 10. Funcionalidad pendiente

| | Que es | Migracion |
|---|---|---|
| — | Ventana del Lookahead **por obra** (hoy solo en la URL) | Si, una columna |
| — | Empresa de demostracion para el tutorial | No: identificarla por variable de entorno |
| — | Sombrear el area entre plan y real en la curva S | No |
| — | Exportar tablas a Excel (presupuesto y órdenes) —pedido del 10 de agosto al revisar una lista de librerías de R: es lo único de esa lista que GCM no cubre aún— | No |
| **Fase 2** | Documental: planos, protocolos y guias, con validacion automatica de restricciones | Si |
| **Fase 3** | Sectores de color en el PTS y aviso cuando dos cuadrillas coinciden en el mismo sitio | Si |
| **Fase 4** | «Cumplio» calculado desde la cantidad ejecutada, linea de meta, causa raiz | No |
| **Fase 5** | Motor de reglas | Por definir |

---

## 11. Limitaciones del asistente

Para que ninguna sesion futura pierda tiempo redescubriendolas:

- **No hay acceso de escritura fuera de la carpeta del proyecto.** Los
  archivos de memoria del perfil (`~/.claude/.../memory/`) no se pueden
  actualizar desde aqui. Por eso la continuidad vive en `docs/`.
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
