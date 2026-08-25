---
name: gcm-limites-de-capas
description: Las cuatro reglas de arquitectura de GCM que, si se rompen, producen los dos bugs mas caros del dominio -una constructora viendo datos de otra, o un importe que no cuadra-. Se dispara al crear o tocar una pantalla, una Server Action, un servicio, cualquier consulta a Prisma, o al anadir un permiso nuevo.
---

# Limites de capas de GCM

GCM (Gestor de Construccion y Mantenimiento) es una app Next.js 16 + Prisma 7
multi-empresa: varias constructoras comparten la misma base de datos. Las
cuatro reglas de abajo son las que sostienen esa promesa. Tres de ellas NO
las impone ninguna herramienta automatica -solo ESLint impone que los
componentes no importen Prisma-; el resto depende de que quien escribe el
codigo se acuerde, funcion tras funcion.

## 1. El dinero nunca pasa por un `number`

Todo importe (soles, porcentajes, cantidades) viaja como `Decimal` de
Prisma en la base y como **texto** por el resto del sistema, nunca como
`number` de JavaScript. La aritmetica vive en `src/lib/decimal.ts`
(`sumar`, `restar`, `multiplicar`, `dividir`, `esPositivo`, `esCero`,
`normalizarDecimal`), implementada con `BigInt` escalado para no arrastrar
el error de redondeo binario de los `Decimal.js`/`number` normales.

- Al leer un campo `Decimal` de Prisma: `campo.toString()`, nunca
  `Number(campo)`.
- Al comparar dos importes por igualdad: `esCero(restar(a, b))`, nunca
  `Number(a) !== Number(b)` (un `Number()` en medio de una comparacion de
  dinero es en si mismo un hallazgo de auditoria recurrente en este
  proyecto).
- Al sumar una lista: `sumar(lista)`, nunca `.reduce((a, b) => a + b)`.
- Un numero de dinero que miente es peor que no tener el numero: si un
  calculo no se puede hacer con datos reales, se devuelve `null` y la UI
  explica por que falta, no se inventa un cero.

## 2. Los componentes no importan Prisma

Todo acceso a la base pasa por `src/services/*.service.ts`. Un componente
(cliente o servidor) nunca escribe `prisma.algo.findMany` directamente:
llama a una funcion de servicio, que ya viene filtrada por permiso y por
empresa. ESLint es la unica de las cuatro reglas que esto impone
automaticamente -si el import se cuela, el lint lo revienta-, pero la
frontera real sigue siendo el servicio, no el linter: `src/proxy.ts` (ver
la regla 4) tampoco la sostiene.

## 3. Denegacion por defecto, y en DOS capas

`src/lib/rbac.ts` es la PLANTILLA de permisos por rol (`MATRIZ`), no la
decision final. Cada empresa puede conceder o revocar permisos sueltos
encima de su plantilla (`company_permissions`), y quien resuelve el
permiso real de una sesion es `resolverPermisos`, que corre una vez por
peticion y deja el resultado en `sesion.permisos`.

Consecuencias practicas:

- Anadir un permiso nuevo a la lista `PERMISOS` **no concede nada** hasta
  que se asigna a un rol en `MATRIZ` a proposito. Un permiso que existe en
  la lista pero en ningun rol es letra muerta, y eso es intencional para
  permisos que se introducen antes de decidir quien los tiene.
- `INNEGOCIABLES` es la lista de permisos que NINGUNA empresa puede
  conceder por su cuenta, reservados a ADMIN sin excepcion (aprobar una
  linea base, aprobar un movimiento, reabrir una obra cerrada, repartir
  permisos...). Si el permiso nuevo mueve dinero contractual o deshace una
  garantia del ciclo de vida de la obra, casi seguro pertenece aqui.
- El patron real de una funcion de servicio, tal como esta en
  `src/services/encargos.service.ts` y el resto de `src/services/`:
  primera linea `if (!puede(sesion, "recurso:accion")) return <vacio o
  error>`, y cada consulta con `companyId: sesion.companyId` -directo si
  el modelo lo tiene de primera mano, o via `project: { companyId:
  sesion.companyId }` cuando el modelo solo tiene `projectId`-.

## 4. El filtro de empresa sale SIEMPRE de la sesion, nunca de la peticion

`companyId` nunca se lee de un parametro de la URL, del body, ni de
ningun dato que el cliente pueda manipular. Sale unicamente de
`sesion.companyId`, resuelta en el servidor a partir de la cookie de
sesion.

- Cada consulta de lectura o escritura debe filtrar por `companyId` (o
  `project: { companyId }`) donde SE LEE, no confiar en que quien llama ya
  filtro bien mas arriba. Repetir el filtro en cada capa no es
  redundancia perezosa: es la unica defensa cuando una funcion se
  reutiliza desde un sitio nuevo que se olvida de comprobarlo antes.
  Varios hallazgos de auditoria de este proyecto han sido exactamente
  esto -una consulta que dependia solo de un `projectId` ya validado
  aguas arriba, en vez de comprobar tambien la empresa donde se lee-.
- `src/proxy.ts` (el antiguo `middleware.ts`) **no es la frontera de
  seguridad**. Corre en el Edge runtime, sin acceso a base de datos, y
  solo comprueba que la cookie de sesion EXISTA -no que sea valida, ni de
  que empresa es-. La frontera real esta en cada servicio.

### El aislamiento son DOS capas, y la segunda es la que se olvida

`companyId` para en la puerta de la EMPRESA. Dentro de una misma
constructora hay una segunda capa: `alcanzaObra(sesion, obraId)`, de
`@/lib/alcance-obras`. Solo ADMIN y GERENTE ven toda la cartera; el
residente, el administrador de obra, el almacenero y el consultor ven
**solo las obras que se les asignan**. El consultor es el que mas importa:
es el perfil del cliente, y sin esa capa veia el presupuesto de las obras
de los demas clientes de la constructora.

**Donde se olvida SIEMPRE: en las acciones de servidor.** Una pagina de
`/obras/[id]` esta protegida porque el layout llama a `obtenerObra`, que
comprueba el alcance y hace `notFound()`. Una accion de servidor NO pasa
por ese layout: recibe el `obraId` del cliente y va directa al servicio.
Si el servicio solo filtra por `companyId`, un residente puede tocar
cualquier obra de su empresa mandando el id.

`motivoSiObraCerrada` lleva `alcanzaObra` dentro, asi que las escrituras
que la llaman quedan cubiertas de paso. Las que no la llaman -porque no
tiene sentido comprobar si la obra esta cerrada- necesitan la linea a
mano:

```ts
if (!alcanzaObra(sesion, obraId)) return { ok: false, error: FUERA_DE_ALCANCE };
```

El 24 de agosto de 2026 faltaba en ocho escrituras alcanzables desde una
accion -reemplazar el cronograma, editar la obra, gestionar los pases de
acceso, borrar fotos-. Y no era ignorancia: `crearPase` SI la tenia, con
un comentario explicando por que. Sus cuatro hermanas del mismo archivo,
no. **Al anadir una escritura nueva, la pregunta no es «filtro por
empresa» sino «filtro por empresa Y por alcance».**
