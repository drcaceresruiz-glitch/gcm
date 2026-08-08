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

### Migraciones — paso MANUAL

**El workflow no aplica migraciones.** `prisma migrate deploy` necesita
alcanzar MariaDB, y en hosting compartido la base no acepta conexiones
externas. Tras un despliegue que cambie el esquema, desde cPanel → *Terminal*,
dentro del application root:

```bash
npx prisma migrate deploy
```

Validar pronto las migraciones contra MariaDB 10.11: en desarrollo corre 12.3.

## Pendiente de confirmar

- Cuota de disco e inodos disponibles.
- Política de copias de seguridad del proveedor.
