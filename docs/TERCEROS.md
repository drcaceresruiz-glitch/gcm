# Codigo de terceros

Este documento explica **el procedimiento**. Los datos no estan aqui: viven en
[`src/lib/terceros.ts`](../src/lib/terceros.ts), que es la fuente unica. Se hace
asi a proposito, para que no haya dos listas que se contradigan cuando una se
actualiza y la otra no.

## Por que existe

Citar a los autores no es cortesia: es la condicion que impone su licencia.
Incumplirla hace perder el derecho de uso y nos deja en infraccion de copyright.
Como GCM se vende a otras constructoras, esto es de las cosas que un cliente
puede auditar.

## La regla que lo decide todo

| Que hicimos | Obliga a citar |
|---|---|
| Leer su codigo y **escribir el nuestro** desde cero | No |
| Partir de su archivo y cambiarlo | **Si** |
| Copiarlo tal cual | **Si** |

Las ideas, los algoritmos y los modelos de datos **no** tienen copyright; la
expresion concreta si. Por eso se puede estudiar un proyecto AGPL, entender como
resuelve el lookahead, y escribir el nuestro sin arrastrar su licencia. Esa es
la via limpia y la que se prefiere siempre.

## Dar de alta uno nuevo

Los ZIP descargados van a `docs/COMUNIDADGIT/`, que **esta ignorada** por el
`.gitignore`: son casi 2 GB y no tienen que viajar en el repositorio. Cuando
descargues mas, dejalos ahi y avisa.

Pasos:

1. **Revisar que no traiga sorpresas.** Ejecutables (`.exe`, `.dll`, `.bat`),
   ganchos `postinstall` en el `package.json`, y patrones de descarga-y-ejecuta
   (`eval(atob(...))`, `curl | sh`, `FromBase64String`). Un `postinstall` con
   `patch-package` o `husky` es normal; uno que descarga algo, no.
2. **Buscar el archivo LICENSE**, no el `package.json`. Un `"license": "MIT"`
   sin archivo ni titular es un agujero, no una licencia: no hay aviso de
   copyright que reproducir, asi que la condicion no se puede cumplir. En el
   registro eso se marca como `declarada-sin-texto`.
3. **Copiar el aviso literal** del LICENSE al campo `avisoCopyright`. Literal:
   sin reescribirlo ni traducirlo.
4. **Anadir la entrada** a `TERCEROS` en `src/lib/terceros.ts`, con `estado`
   segun lo decidido y `uso: "referencia"` mientras solo se lea.
5. **Ejecutar las pruebas.** `npx vitest run src/lib/terceros.test.ts` falla si
   la entrada copia codigo sin acreditar, o copia algo cuya licencia nos impide
   vender.

## Cuando de verdad se use codigo ajeno

Cambiar en la entrada, a la vez:

- `estado` a `"en-uso"`
- `uso` a `"adaptado"` o `"copiado"`
- `ubicaciones` con las rutas nuestras que lo llevan
- `avisoCopyright` con el texto literal

Y ademas copiar el **texto completo de la licencia** a `docs/licencias/<id>.txt`.
Reproducir el aviso no basta: MIT y Apache exigen tambien el texto integro.

En cuanto una entrada cumple eso, `tercerosACitar()` la devuelve sola y aparece
en la pantalla de creditos sin tocar nada mas.

## La pantalla de creditos

Todavia **no esta construida**, a la espera de que se indique donde va. Los
datos ya estan listos: `tercerosACitar()` devuelve, ordenada por nombre, la
lista de lo que hay que mostrar. Hoy devuelve vacio, y es correcto: dentro de
GCM no hay ni una linea de codigo ajeno.

Lo habitual es una entrada "Acerca de" o "Licencias" en el pie o en la ficha de
la empresa. Legalmente basta con que sea accesible desde la aplicacion.

## Estado a hoy

Ninguno de los proyectos evaluados esta dentro del producto. Todos son
`candidato` (nos interesan), `solo-lectura` (su licencia impide copiar) o
`descartado`. Los dos casos que merecen atencion antes de tocarlos:

- **LastPlannerTool** y **Taskcafe** declaran MIT pero su LICENSE no nombra al
  titular (el de Taskcafe es la plantilla sin rellenar, `[year] [fullname]`).
  Para leer y reescribir sirve; antes de adaptar codigo suyo hay que pedir al
  autor por GitHub que lo complete.
- **Architecture Decision Record** y **Snazzy Gallery** son CC BY-NC-SA: el NC
  prohibe el uso comercial. Se sigue el formato, no se copian los archivos.
