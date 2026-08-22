# Skills propias de GCM — plan

> **Los tres se escribieron el 21 de agosto de 2026**, en
> `.claude/skills/gcm-limites-de-capas/SKILL.md`,
> `.claude/skills/gcm-despliegue/SKILL.md` y
> `.claude/skills/gcm-nuevo-servicio-y-pantalla/SKILL.md`, siguiendo el
> plan de abajo tal cual. Este documento se conserva como el porque de
> cada uno, no como pendiente.
>
> **Respaldo:** `.claude/` Y `.agents/` estan los dos en `.gitignore` —
> ninguno de los dos se versiona con el repositorio, ni siquiera las
> skills de Prisma—. Es la misma clase de fragilidad que ya vacio la
> carpeta de memoria del perfil una vez (ver
> `docs/memoria/reinstalacion-borro-memorias-y-plugin.md`). Por eso cada
> `SKILL.md` de GCM tiene una copia identica versionada en
> [`docs/skills/`](skills/): si `.claude/skills` vuelve a aparecer vacio,
> se restaura copiando desde ahi. Si editas un skill, copia el cambio en
> los dos sitios.

`.claude/skills` solo tenia las de Prisma, instaladas por `skills-lock.json`.
Nada propio del proyecto. Este documento fue el plan de que hacia falta y en
que orden.

## Por que hace falta esto

Las reglas de arquitectura de GCM viven en tres sitios que ninguna sesion
nueva lee entera por si sola: el README (las reglas declaradas), el codigo
(el patron real, que a veces se aparta del README sin que nadie lo note) y
`docs/ESTADO.md` (por que existen, contadas como incidentes). Una sesion sin
memoria de las anteriores solo tiene el README y tiene que redescubrir el
resto leyendo. Un skill es lo que convierte eso en una consulta bajo demanda
en vez de una relectura completa cada vez.

**Regla de diseño para todos los skills de aqui abajo**: apuntan a la fuente
—un archivo, una seccion fechada de `ESTADO.md`— en vez de reproducirla. Un
skill que copia una decision de negocio que cambia (como el umbral de
`capacidad.ts`, movido de 1.3 a 1.4 sin base empirica el 20 de agosto) queda
mintiendo sobre el estado del proyecto el dia que alguien la cambie en el
codigo y se olvide del skill.

## Los skills propuestos, en el orden en que conviene construirlos

### 1. `gcm-limites-de-capas`

**Se dispara**: al crear o tocar una pantalla, una Server Action, un
servicio, cualquier consulta a Prisma, o al anadir un permiso nuevo.

**Por que va primero**: es la unica combinacion de reglas que, si se rompe,
produce los dos bugs mas caros del dominio —una constructora viendo datos de
otra, o un importe que no cuadra— y ESLint solo impone una de las cuatro (que
los componentes no importen Prisma). El resto depende de que quien escribe
el codigo se acuerde, tarea tras tarea.

**Contenido**:

- Las cuatro reglas del README: importe siempre `Decimal` vía
  `src/lib/decimal.ts` (aritmetica con BigInt escalado; el valor viaja como
  texto, nunca pasa por un `number` intermedio); los componentes no importan
  Prisma, todo acceso pasa por `src/services/`; denegacion por defecto en
  `src/lib/rbac.ts`; el filtro de empresa sale siempre de `sesion.companyId`,
  nunca de un parametro de la peticion.
- El patron real de una funcion de servicio, tal como esta en
  `encargos.service.ts` y el resto de `src/services/`: primera linea
  `if (!puede(sesion, "recurso:accion")) return <vacio>`, y cada consulta
  con `companyId: sesion.companyId` (directo o vía `project: { companyId }`
  cuando el modelo no lo tiene de primera mano).
- Los permisos son de DOS capas, no una: `rbac.ts` es la PLANTILLA por rol,
  pero cada empresa puede conceder o revocar permisos sueltos encima
  (`company_permissions`), y quien decide de verdad es `resolverPermisos`,
  que corre una vez por peticion y deja el resultado en
  `SesionActiva.permisos`. Anadir un permiso a la lista `PERMISOS` no
  concede nada hasta que se asigna a un rol a proposito.
- `src/proxy.ts` (el antiguo `middleware.ts`) NO es la frontera de
  seguridad: corre en Edge sin acceso a base de datos y solo comprueba que
  la cookie EXISTA. La frontera real esta en cada servicio.

### 2. `gcm-despliegue`

**Se dispara**: al tocar `scripts/desplegar.sh`, `.github/workflows/`, o
ante cualquier reporte de "la obra no ve mi cambio" / "el sitio esta caido".

**Por que va segundo**: es el conocimiento que costo horas dos veces este
mes —10 y 21 de agosto— por reconstruirse desde cero cada vez. Convertirlo
en runbook no evita el proximo incidente, pero evita repetir el mismo
diagnostico fallido.

**Contenido**:

- El mecanismo: FTP sube un unico `gcm.tar.gz` mas `app.js`; un cron de
  cPanel corre `desplegar.sh` cada minuto; las migraciones se aplican ANTES
  del intercambio; el cambio de version es un renombrado atomico.
- Reglas operativas que ya costaron un incidente cada una: nunca
  `localhost` en un `DATABASE_URL` de este hosting —resuelve solo a `::1` y
  MariaDB no atiende IPv6, siempre `127.0.0.1`—; no encadenar
  `desplegar.sh` a mano —agota el `nproc` de LVE y el sintoma parece un
  fallo de memoria sin serlo—; nunca `pkill node` a secas.
- Como leer `/api/health`: que dice cada estado
  (`version`/`arranque`/`coherencia`/`despliegue`/`reloj`) y a que causa
  apunta cada combinacion.
- El criterio G6 de `pre-push` (typecheck, lint, test, build, en ese orden
  porque cada uno tapa el punto ciego del anterior) y por que vive ahi y no
  en `pre-commit`.
- El metodo, no solo el dato: cuando un sintoma sobrevive a dos
  diagnosticos, la siguiente accion es MEDIR en el servidor, no seguir
  razonando sobre lo que ya se sabe.

### 3. `gcm-nuevo-servicio-y-pantalla`

**Se dispara**: al pedir una pantalla o servicio nuevo para un modulo de
negocio (obra, encargo, cronograma, etc.).

**Por que va tercero**: acelera el patron mas repetido del historial del
proyecto, pero a diferencia de los dos anteriores no previene un incidente
si se pospone —solo hace mas lento escribir codigo que de todas formas
saldria correcto si se sigue `gcm-limites-de-capas`.

**Contenido**:

- El recorrido de tres capas: Server Action co-ubicada en `acciones.ts` de
  la ruta -> servicio en `src/services/*.service.ts` -> Prisma. Cada capa
  con su `.test.ts` propio; los servicios se prueban con dobles de Prisma,
  no contra una base real.
- Convencion de idioma: codigo, comentarios y UI en español CON tildes;
  documentacion y mensajes de commit en español SIN tildes. Son registros
  distintos a proposito, no un descuido.
- El comentario explica el POR QUE —una restriccion oculta, un caso raro
  que motivo la forma actual—, nunca el QUE, que ya lo dice el nombre.
- En las pruebas, la que importa lleva un comentario que dice que rompe si
  se quita: es lo que distingue una prueba que muerde de una que solo
  ocupa espacio.

## Lo que no conviene convertir en skill

- **Narrativa de incidentes fechados de `ESTADO.md`.** Un skill que la copia
  se desincroniza el dia que el incidente se cierra —le paso al propio
  `PENDIENTES.md`, que se quedo diez dias atras el 21 de agosto—. Los
  runbooks de arriba apuntan a la seccion de `ESTADO.md`, no la reproducen.
- **Decisiones de negocio que cambian sin aviso previo**, como el umbral de
  sobrecarga de `capacidad.ts`. Esas viven mejor en el codigo, junto a su
  comentario, que es el unico sitio que no puede quedar desactualizado sin
  que el propio build lo note.
