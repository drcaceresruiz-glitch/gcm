# Infraestructura de producción — verificada

Datos confirmados directamente en el panel del hosting el 7 de agosto de 2026.
Este documento es la fuente de verdad para las decisiones de despliegue.

## Servidor

> El nombre del servidor, el usuario de la cuenta y las credenciales **no se
> documentan aquí**: este repositorio es público. Viven en las variables de
> entorno del servidor y en los secretos del repositorio.

| Dato | Valor |
|---|---|
| Tipo | Hosting compartido con cPanel sobre CloudLinux |
| cPanel | 136.0.32 (cpsrvd 11.136.0.32) |
| Directorio base | `/home/<usuario>/` |
| Aplicación | `gcm.drcaceresruiz.com` |

## Capacidad (LVE)

| Recurso | Consumo | Límite | Margen |
|---|---|---|---|
| Memoria física | 95.77 MB | **4 GB** | Muy holgado |
| Entry Processes | 1 | 20 | Correcto |
| NPROC | 4 | 100 | Holgado |
| I/O | 458 KB/s | 4 MB/s | Holgado |
| IOPS | 16 | 1024 | Holgado |
| SPEED | 3 % | 100 % | Holgado |

**Fallos acumulados: 0 en todas las categorías.** No hay historial de
estrangulamiento por límites.

**Conclusión:** con 4 GB de memoria, el riesgo de errores 508 por agotamiento
—principal amenaza del plan original— queda muy reducido. No se requiere VPS.

## Plataforma

| Componente | Versión | Nota |
|---|---|---|
| Node.js | 22.23.0 (recomendada por el panel) | Cubre el requisito de la app (≥ 20) |
| MariaDB | 10.11.18 | LTS |
| PHP | 8.4.23 | No lo usamos; conviven otras aplicaciones |
| Terminal / SSH | Disponible | Habilita el despliegue automático |

En la cuenta conviven otras aplicaciones con sus propias bases de datos, así
que los recursos se comparten dentro de la misma cuenta.

## Advertencias operativas

### 1. El servidor usa `latin1` por defecto

phpMyAdmin reporta: *«Conjunto de caracteres del servidor: cp1252 West
European (latin1)»*.

La base de datos de producción **debe crearse explícitamente en `utf8mb4`**.
De lo contrario los acentos y la eñe se corrompen: "CAPÍTULO", "DESAGÜE" o
"Demolición" quedarían ilegibles.

```sql
ALTER DATABASE `<cuenta>_gcm`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

Además, la cadena de conexión debe fijar el juego de caracteres:

```
DATABASE_URL="mysql://<usuario>:<clave>@localhost:3306/<cuenta>_gcm?charset=utf8mb4"
```

### 2. Diferencia de versión de MariaDB entre entornos

Desarrollo usa MariaDB 12.3.2 y producción 10.11.18. El esquema no emplea
nada exclusivo de versiones recientes, pero la divergencia debe validarse
pronto aplicando las migraciones contra el servidor real, no al final.

### 3. Modo de aplicación

El panel crea las aplicaciones Node en modo *Development* por defecto. Hay
que cambiarlo a **Production**, o la app arrancará sin optimizar y filtrará
trazas de error a los usuarios.

### 4. Servir estáticos por Apache

Con 20 Entry Processes, cada archivo servido por Node consume un proceso.
Los archivos estáticos deben servirse directamente por Apache mediante
reglas en `.htaccess`, no a través de la aplicación.

## Despliegue automático — GitHub Actions + FTPS

La vía elegida es `.github/workflows/desplegar.yml`: **compilar en GitHub
Actions y subir por FTPS solo el resultado**. Sustituye a Git Version Control
de cPanel, que se había considerado antes.

GCM no es un sitio de archivos: es una aplicación Next.js que hay que compilar
y cuyo proceso Node hay que reiniciar. Copiar el código fuente por FTP no la
deja funcionando.

### Comprobado el 07/08/2026

- Puerto **21 abierto** desde fuera, en `drcaceresruiz.com` y en
  `ftp.drcaceresruiz.com` (IP `213.239.205.92`).
- **990 cerrado**, así que no hay FTPS implícito.
- El servidor es **ProFTPD y anuncia `AUTH TLS`, `PBSZ` y `PROT`**: admite
  FTPS explícito sobre el 21. Por eso el workflow usa `protocol: ftps`. Con
  `ftp` a secas la contraseña viajaría en claro.

### Qué se sube: UN archivo, no 1452

`output: "standalone"` genera un servidor autocontenido. El workflow lo empaqueta
junto con `.next/static` y `public` en **un único `gcm.tar.gz` de ~20 MB**, y
**borra explícitamente cualquier `.env`** (el build de Next lo arrastra dentro de
standalone).

> **Por qué un solo archivo.** Subir el árbol suelto por FTP resultó inviable y
> costó varios intentos. FTP manda los archivos de uno en uno y sin
> transacciones: cualquier corte deja la carpeta a medias. Y `mirror` compara
> por tamaño y fecha, así que **da por buenos los archivos truncados y los
> salta**. Eso produjo un despliegue «en verde» sobre una instalación rota, con
> `SyntaxError: Unexpected end of input` al arrancar. Intentar limpiarla con
> `rm -rf` por FTP se colgó **cinco horas** borrando archivo por archivo.
> Un `.tar.gz` o llega entero o no llega.

### Arranque y reinicio

El archivo de inicio en cPanel debe ser **`app.js`**, no `server.js`. `app.js` es
un arranque propio que se sube aparte del comprimido —no puede sobrescribirse a
sí mismo mientras se ejecuta— y hace dos cosas: descomprime `gcm.tar.gz` si hay
uno pendiente, y después cede el control a `server.js`.

Descomprimir en el arranque, y no por FTP, es lo que permite que el despliegue
sea automático sin entrar a cPanel.

Passenger reinicia al detectar que cambió `tmp/restart.txt`. El workflow lo sube
**el último**, para que el reinicio nunca se dispare antes de que el paquete esté
completo.

> ⚠️ **Una instancia vieja puede sobrevivir días, y `restart.txt` no siempre se
> la lleva.** El 11/08/2026 había **dos** `next-server` a la vez: uno recién
> arrancado y otro de **26 horas**, los dos con `cwd` en `~/gcm`. Cada
> petición caía en uno o en otro, así que la aplicación respondía con dos
> compilaciones distintas según la suerte —y de ahí salen tanto el 404 en
> `POST /login` como que un SMS se enviara unas veces sí y otras no—.
>
> No lo cubre el candado de `app.js`: ese impide que dos instancias
> descompriman a la vez, no que una instancia de ayer siga en pie con el árbol
> de ayer ya cargado en memoria. Son dos problemas distintos.
>
> **Comprobar después de cada despliegue**, una vez abierto el sitio:
>
> ```bash
> ps -u "$USER" -o pid,etime,cmd | grep next-server | grep -v grep
> ```
>
> Debe salir **uno solo** y con pocos minutos. Si hay más, confirma que es GCM
> con `ls -l /proc/<pid>/cwd` —en la cuenta conviven otras aplicaciones— y
> retira el viejo con `kill <pid>`, sin `-9`: Passenger levanta uno nuevo con
> la siguiente petición y el corte son un par de segundos. En ese caso
> `touch tmp/restart.txt` **no** bastó.

### Secretos del repositorio

`FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD` y **`FTP_SERVER_DIR`** (la ruta
de la aplicación en cPanel, con barra final). La ruta va en un secreto y no
escrita en el workflow porque revela el usuario de la cuenta y **el
repositorio es público**.

### La configuración NO viaja

`DATABASE_URL`, `APP_SECRET` y el resto viven en cPanel, en las variables de
entorno de la aplicación Node. El workflow usa valores de relleno solo para
compilar, porque `src/lib/env.ts` valida el entorno al importarse y sin ellos
el build ni arranca.

> ⚠️ **No pongas un espejo con borrado sobre esta carpeta.** cPanel administra
> ahí sus propios archivos (`stderr.log`, su configuración de Passenger). Un
> `mirror --delete` los borró y dejó la web en 503. El workflow actual solo
> sube tres archivos y no borra nada.

### Puesta en marcha de una base vacía

Se hizo el 07/08/2026 y quedó apuntado porque no es evidente: la aplicación
puede estar desplegada y en pie **con la base de datos vacía**. La pantalla de
acceso no consulta nada, y `/api/health` solo hace `SELECT 1`, que responde
«conectada» aunque no exista una sola tabla. El fallo aparece al iniciar
sesión, como error de servidor.

Desde el Terminal de cPanel, activando primero el entorno de Node
(`source /home/<usuario>/nodevenv/<app>/22/bin/activate`):

```bash
cd ~/gcm && export DATABASE_URL="mysql://usuario:clave@localhost:3306/base?charset=utf8mb4"
npx --yes prisma@7 migrate deploy
node scripts/crear-admin.js correo@ejemplo.com
```

`crear-admin.js` crea la empresa y un administrador con una clave temporal de
un solo uso. **Ni el driver `mariadb` ni `@prisma/client` existen como módulos
sueltos en el paquete** —Next los empaqueta dentro del código compilado—, así
que el script detecta su ausencia e imprime el SQL para pegarlo en phpMyAdmin.

### Migraciones — paso MANUAL

**El workflow no aplica migraciones.** `prisma migrate deploy` necesita
alcanzar MariaDB, y en hosting compartido la base no acepta conexiones
externas. Tras un despliegue que cambie el esquema, desde cPanel → *Terminal*:

```bash
source /home/<usuario>/nodevenv/<app>/22/bin/activate
cd ~/gcm
npx --yes prisma@7 migrate deploy
```

Las dos primeras líneas hacen falta, y saltárselas da errores que no explican
lo que pasa:

- **Sin `source`**, el jailshell responde `npx: command not found`. Node no
  está en el PATH hasta activar el entorno del panel.
- **`--yes prisma@7`** y no `npx prisma`: Next empaqueta Prisma dentro del
  código compilado y no queda como módulo suelto que `npx` pueda encontrar.

**SÍ hace falta conseguir `DATABASE_URL`, y no la trae el `source`.**

> Este párrafo decía lo contrario hasta el 11/08/2026, apoyándose en una
> comprobación del 08/08. **Ya no se cumple**: con el entorno activado,
> `$DATABASE_URL` viene vacía y Prisma no arranca. Se perdió un buen rato
> siguiendo esta receta antes de darse cuenta, así que queda escrito el
> desmentido en vez de borrarlo sin más.

Y **no la busques en un `.env`**: no existe en el servidor, a propósito. El
workflow lo borra del paquete (`rm -f deploy/.env`) para que la configuración
de desarrollo no pise la del servidor.

La vía que funciona es tomársela prestada al proceso vivo, que sí la tiene
porque se la inyectó cPanel al arrancar. **Sin que la contraseña aparezca en
pantalla:**

```bash
PID=$(ps -u "$USER" -o pid,cmd | grep next-server | grep -v grep | awk '{print $1}' | head -1)
export DATABASE_URL="$(tr '\0' '\n' < /proc/$PID/environ | sed -n 's/^DATABASE_URL=//p')"
[ -n "$DATABASE_URL" ] && echo cargada || echo no
```

Si `PID` sale vacío es que Passenger no ha levantado la aplicación todavía:
abre el sitio (o `curl` a `/api/health`) y repítelo. La alternativa manual es
copiarla de cPanel → *Setup Node.js App* → *Environment variables* y pegarla
entre **comillas simples**, que la contraseña suele traer `$` o `!`.

> **El despliegue no se aplica hasta la primera petición.** El workflow sube
> `gcm.tar.gz` y toca `tmp/restart.txt`, pero quien descomprime el paquete es
> `app.js` al arrancar, y Passenger no arranca hasta que alguien pide una
> página. Con el workflow en verde y sin haber abierto el sitio, el servidor
> **sigue ejecutando el código anterior**: `prisma/migrations/` no tiene la
> migración nueva y `migrate resolve` responde `P3017`.
>
> Antes de tocar el Terminal, **abre `gcm.drcaceresruiz.com`**. Para
> comprobar en qué estado está:
>
> ```bash
> ls ~/gcm/gcm.tar.gz ~/gcm/gcm.tar.gz.desplegando 2>&1
> ```
>
> Si existe `gcm.tar.gz`, está subido y pendiente de descomprimir. Si existe
> `.desplegando`, la descompresión murió a medias y hay que mirar el log. Si
> no existe ninguno, ya se aplicó.

> **El orden importa cuando el esquema cambia.** `migrate deploy` lee los
> archivos de migración *del paquete desplegado*, así que no se puede migrar
> antes de subir: hasta el push no hay nada que aplicar. Y si el código nuevo
> consulta una tabla que aún no existe, la aplicación se cae ENTERA en cuanto
> despliega, no solo la pantalla nueva.
>
> Para cambios así, la vía sin caída es crear la tabla a mano en phpMyAdmin
> con el SQL de la migración **antes** del push, y después cuadrar el registro
> de Prisma para que no intente recrearla:
>
> ```bash
> npx --yes prisma@7 migrate resolve --applied <nombre_de_la_migracion>
> ```

> **`migrate status` no detecta una migración que el despliegue perdió.**
> Visto el 11/08/2026: respondió *«Database schema is up to date!»* con **28**
> migraciones cuando el repositorio tenía **29**. No miente —está al día con
> las que ve—, pero el archivo de `20260811010133_cola_de_sms` no había
> llegado, y una carpeta que no está no puede figurar como pendiente.
>
> Es el «vicio de dejar caer archivos» del FTP aplicado a algo que importa.
> Se comprueba contando, no preguntando:
>
> ```bash
> ls ~/gcm/prisma/migrations | grep -c '^2026'
> ```
>
> Ese número tiene que coincidir con el del repositorio. Si falta alguna, se
> recrea la carpeta con su `migration.sql` (cópialo del repositorio) y se
> lanza `migrate deploy`. **`migrate resolve` no sirve aquí**: necesita que el
> archivo exista.
>
> Conviene hacer esta cuenta después de cada despliegue que traiga migración,
> porque el paquete vuelve a extraer `prisma/` encima cada vez.

Validar pronto las migraciones contra MariaDB 10.11: en desarrollo corre 12.3.

## Pendiente de confirmar

- Cuota de disco e inodos disponibles.
- Política de copias de seguridad del proveedor.
