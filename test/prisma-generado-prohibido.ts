/**
 * El cliente de Prisma GENERADO, tal como lo ven las pruebas: inalcanzable.
 *
 * NACE DE DOS DESPLIEGUES ROJOS, el 23 de agosto de 2026. Una prueba nueva
 * importaba un SERVICIO para probar dos funciones puras; el servicio arrastra
 * `lib/prisma`, que importa `@/generated/prisma/client`. En local paso en
 * verde y en el CI reventó con «Cannot find package».
 *
 * NO ES QUE EL CI SEA MAS ESTRICTO: es que el cliente de Prisma lo GENERA el
 * build, y el CI corre las pruebas ANTES del build. En un puesto de trabajo el
 * cliente ya esta generado de la vez anterior, asi que el gancho de pre-push
 * NO PUEDE cazarlo por mucho que se mire. Es un fallo que solo existe en la
 * maquina limpia, y esos son los que llegan a produccion.
 *
 * Con este alias, una prueba que llegue al cliente generado falla AQUI, en
 * local, diciendo que hacer. Las que doblan `@/lib/prisma` -que son casi
 * todas- nunca pasan por aqui: al doblar el modulo, sus imports no se
 * ejecutan.
 *
 * Se comprobo que ninguna prueba lo necesitaba de verdad: escondiendo
 * `src/generated/prisma` pasaban las 186 igual.
 */

const AYUDA = [
  "Una prueba llego al cliente GENERADO de Prisma, y en el CI eso no existe:",
  "las pruebas corren antes del build, que es quien lo genera. En local pasaria",
  "en verde y el despliegue saldria rojo.",
  "",
  "Dos salidas, segun lo que estes probando:",
  "",
  "  1. Si es logica PURA -cuentas, validaciones, formatos-, sacala a `src/lib/`",
  "     y prueba eso. Es ademas la regla de la casa.",
  "  2. Si de verdad pruebas un servicio, dobla la base al principio del",
  '     archivo:  vi.mock("@/lib/prisma", () => ({ prisma: { ... } }))',
].join("\n");

throw new Error(AYUDA);
