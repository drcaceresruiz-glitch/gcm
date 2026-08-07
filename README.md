# GCM — Gestor de Construcción y Mantenimiento

Sistema multiproyecto de control de obra: presupuesto por partidas, avance
físico y resultado económico. Se despliega en `gcm.drcaceresruiz.com`.

## Estado actual

**Fase 1 — Cimientos, en curso.** Acceso con roles, importador de
presupuestos desde Excel, árbol de partidas editable y motor de cálculo del
presupuesto. Pendiente la pantalla de revisiones.

> **Antes de continuar el desarrollo, lee [docs/ESTADO.md](docs/ESTADO.md).**
> Recoge lo construido, las decisiones de arquitectura y por qué son como
> son, cómo se cuadró el presupuesto real del cliente, y qué falta.

## Stack

| Capa | Tecnología |
|---|---|
| Interfaz | Next.js 16 (App Router), React 19, Tailwind 4 |
| Datos | Prisma 7 con adaptador MariaDB (sin motor nativo) |
| Base de datos | MariaDB / MySQL en desarrollo y producción |
| Lenguaje | TypeScript en modo estricto |

## Puesta en marcha

```bash
npm install
cp .env.example .env      # y completar DATABASE_URL y APP_SECRET
npm run db:migrate        # crea las tablas
npm run db:seed           # datos iniciales
npm run dev
```

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción (salida `standalone`) |
| `npm run typecheck` | Verificación de tipos |
| `npm run lint` | Análisis estático |
| `npm run db:migrate` | Aplica migraciones en desarrollo |
| `npm run db:studio` | Explorador visual de la base de datos |

## Decisiones de arquitectura

Las decisiones no obvias están documentadas en el propio código, junto a la
línea que explican. Las tres de mayor impacto:

- **`src/lib/password.ts`** — Las contraseñas se cifran con `scrypt`, incluido
  en Node, en lugar de `argon2` o `bcrypt`. Estos últimos son módulos
  compilados cuyo binario no ejecutaría en el servidor de producción.
- **`src/lib/prisma.ts`** — Se usa el adaptador de MariaDB en lugar del motor
  compilado en Rust, por el mismo motivo. El cliente queda en JavaScript puro.
- **`prisma/schema.prisma`** — La línea base del presupuesto (`Baseline`) vive
  separada de las partidas vivas (`WbsItem`) y es inmutable una vez aprobada.
  Si se pudiera editar, los indicadores se recalcularían hacia atrás y el
  sistema mentiría.

## Reglas del proyecto

1. **Todo importe es `Decimal`, nunca `Float`.** Un céntimo perdido por
   redondeo en un presupuesto de obra es un error contable.
2. **Los componentes no importan Prisma.** Todo acceso a datos pasa por
   `src/services/`, que es donde se verifican permisos y se filtra por
   empresa. La regla está impuesta por ESLint, no solo por convención.
3. **Denegación por defecto.** Un permiso que no figura explícitamente en
   `src/lib/rbac.ts` no se concede.
4. **El filtro por empresa sale siempre de la sesión**, jamás de un parámetro
   de la petición. Es lo que impide que un cliente vea obras de otro.

## Estructura

```
src/
  app/          Rutas y páginas (App Router)
  components/   Componentes de interfaz
  services/     Lógica de negocio. Único punto que accede a Prisma.
  lib/          Núcleo: entorno, sesión, permisos, criptografía
  hooks/        Hooks de React
  utils/        Formato de moneda, fechas y utilidades puras
prisma/         Esquema y migraciones
infra/          Arranque y configuración del servidor de producción
docs/           Documentación y referencias de negocio
```
