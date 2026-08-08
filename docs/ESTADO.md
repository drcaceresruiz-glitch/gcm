# Estado del proyecto GCM

Documento de traspaso. Léelo antes de tocar nada: recoge lo construido, por
qué está construido así, y qué falta.

Última actualización: 8 de agosto de 2026.

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
| `npx vitest run` | 93 pruebas |
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

**Motores verificados con 93 pruebas.**
- `lib/decimal.ts` — aritmética exacta con enteros grandes. Nunca coma
  flotante para dinero.
- `lib/excel-presupuesto.ts` — lectura de presupuestos.
- `lib/jerarquia-partidas.ts` — jerarquía de códigos y suma por hojas.
- `lib/presupuesto.ts` — cascada, comparación de revisiones y conversión
  exacta entre porcentaje y fracción.
- `lib/rbac.ts` — permisos efectivos por empresa, y que los cuatro
  innegociables no se puedan reconfigurar por ninguna vía.
- `lib/ordenes.ts` — cascada de la orden, la regla del agrupador y el cuadre
  del reparto. Sus pruebas usan las cifras **reales** de tres órdenes del
  cliente; si alguna deja de cuadrar, lo que está mal es el código.

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
neto (costo), IGV (crédito) y total (lo que sale del banco).

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

**Producción está al día con el esquema** a 08/08/2026: la última migración
aplicada en `drcacere_gcm` es `20260808113630_datos_de_la_empresa`. El
procedimiento y sus dos trampas —el despliegue no entra hasta la primera
petición, y el orden importa cuando el esquema cambia— están en
`docs/infraestructura.md`.

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

**Se guardan siempre las tres cifras: neto, IGV y total.** Lo hacen la
revisión y ahora también cada orden, y cada una responde a una pregunta
distinta: el **neto** es lo que cuesta la obra y consume presupuesto, el
**IGV** es lo que se recupera y lo necesita contabilidad, y el **total** es lo
que sale del banco y lo necesita tesorería. Tirar cualquiera obliga a
recalcularla después, y recalcular un impuesto hacia atrás es donde aparecen
los céntimos que no cuadran.

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
inventárselo. Llegará con el módulo de abonos.

**Las migraciones se siguen aplicando a mano.** Lo dice la fila de Despliegue
de la sección 6 y sigue siendo cierto: el despliegue del código es automático
en cada push a `main`, pero el esquema no viaja con él. Hay que entrar al
Terminal de cPanel y ejecutar `npx prisma migrate deploy`. El detalle está en
`docs/infraestructura.md`.

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