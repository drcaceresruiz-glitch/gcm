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

## Pendiente de confirmar

- **Claves SSH para el despliegue automático.** El Terminal del navegador
  funciona, pero la automatización necesita autenticación por clave
  (cPanel → *SSH Access* → *Manage SSH Keys*) y el puerto SSH.
- Cuota de disco e inodos disponibles.
- Política de copias de seguridad del proveedor.
