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

1. **Segundo factor y recuperacion de clave por SMS.** Hoy los dos van solo
   por correo (`dosFactores.service`, `recuperacion.service`) y en obra nadie
   mira el correo, pero el telefono lo tienen en la mano. Los flujos ya
   existen y `enviarSms` se reutiliza tal cual: es el cambio mas pequeno con
   mas efecto. **Es por donde se empieza.**
2. **Cablear `scripts/desplegar.sh`** (seccion 1). Sigue sin hacerse y sigue
   siendo la raiz de casi todo. **No es solo codigo**: hay que decidir quien
   manda al descomprimir —hoy `app.js` lo hace por su cuenta, y anadir el
   script deja DOS candados con caducidades distintas (3 min y 10 min) sobre
   el mismo directorio— y crear el cron en cPanel, que solo se puede hacer
   desde el panel.
3. **Skills propias de GCM** con `/batch`: una por dominio, cada una en su
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

## 0. LO PRIMERO DE MANANA: el candado de despliegue no caduca

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

### ~~El despliegue no borra nada~~ SCRIPT LISTO, FALTA CABLEARLO

`scripts/desplegar.sh` (10 de agosto) descomprime a un directorio de
preparacion y hace un intercambio atomico con `mv`, con lo que los restos de
compilaciones viejas desaparecen. **Aun no esta cableado**: ni el workflow lo
sube ni el cron lo invoca. Hasta entonces sigue vigente lo de abajo.

### El despliegue no borra nada (mientras el script no este cableado)

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
   `esResumen` pero no `esHito`, y `TareaProgramada` ni declara el campo. Se
   siembran 7 restricciones a un evento de duracion cero y entra al
   denominador del PPC. Otros modulos (`mapeo.service`, `control-avance`) SI
   lo excluyen, con el razonamiento escrito.
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
—esta al dia con las que ve— pero **no detecta un archivo de migracion que el
deploy dejo caer**. Para eso hay que contar carpetas:
`ls ~/gcm/prisma/migrations | wc -l` contra las del repositorio. En este caso
faltaba `20260811010133_cola_de_sms` aunque la tabla SI existia: se aplico
cuando el archivo estaba y un despliegue posterior lo tiro.

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
- Tareas que arrancan con restricciones sin liberar.
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
