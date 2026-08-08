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

### Qué se sube

`output: "standalone"` genera un servidor autocontenido. El workflow arma un
paquete con `.next/standalone` + `.next/static` + `public`, y **borra
explícitamente cualquier `.env`** (el build de Next lo arrastra dentro de
standalone). Son unos **1450 archivos y 102 MB**: el primer despliegue es
lento, los siguientes son incrementales porque la acción mantiene un estado de
sincronización y solo envía lo que cambió.

### Reinicio

Passenger reinicia la aplicación cuando cambia `tmp/restart.txt`. El workflow
lo escribe con la fecha en cada despliegue. Sin eso el servidor seguiría
sirviendo la versión anterior.

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

> ⚠️ **La acción sincroniza: borra del servidor lo que no esté en el
> paquete.** Las exclusiones (`.env`, `.env.*`, `storage/**`) son lo único que
> impide que un despliegue se lleve por delante la configuración y los
> archivos subidos por los usuarios. No las quites.

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
