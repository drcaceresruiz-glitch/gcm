/**
 * El registro de codigo ajeno: de quien es, que licencia tiene y que hicimos
 * con el.
 *
 * Existe por una razon practica: citar a los autores NO es cortesia, es la
 * condicion que impone su licencia. Si se incumple se pierde el derecho de
 * uso y quedamos en infraccion de copyright. Y como GCM se vende a otras
 * constructoras, un descuido aqui no es un detalle: es el tipo de cosa que
 * aparece en una auditoria del cliente.
 *
 * La distincion que lo gobierna todo esta en `Uso`:
 *
 *   - Leer codigo ajeno, entenderlo y ESCRIBIR EL NUESTRO desde cero no
 *     genera ninguna obligacion. Las ideas, los algoritmos y los modelos de
 *     datos no tienen copyright; la expresion concreta si. Esta es la via
 *     limpia, y la unica posible con lo que es GPL o AGPL.
 *   - Partir de su archivo y cambiarlo, o copiarlo tal cual, SI obliga.
 *     Aunque sean veinte lineas.
 *
 * Este archivo es la fuente unica: la pantalla de creditos se pinta desde
 * `tercerosACitar()`, y `terceros.test.ts` falla si alguien anade una entrada
 * que copia codigo sin el aviso de copyright, o que copia codigo con una
 * licencia que nos impide vender. El registro no se puede quedar obsoleto sin
 * que el equipo se entere.
 *
 * Los ZIP originales viven fuera del repositorio, en `docs/COMUNIDADGIT/`
 * (ignorada: son 1,8 GB). El procedimiento para dar de alta uno nuevo esta en
 * `docs/TERCEROS.md`.
 */

/**
 * Licencias que nos hemos encontrado.
 *
 * Los dos ultimos valores no son licencias de verdad, son los dos agujeros
 * con los que hay que tener mas cuidado:
 *
 *   - `declarada-sin-texto`: el `package.json` dice "MIT" pero el repositorio
 *     no trae archivo LICENSE ni nombre de titular. La licencia esta anunciada
 *     pero incompleta, y no hay aviso de copyright que reproducir. Sirve para
 *     leer; para vender, hay que pedirle al autor que lo complete.
 *   - `sin-licencia`: no dice nada. Por defecto el autor se reserva TODOS los
 *     derechos. Que este publico en GitHub no lo hace reutilizable.
 */
export type Licencia =
  | "MIT"
  | "Apache-2.0"
  | "EPL-2.0"
  | "CC-BY-NC-SA-4.0"
  | "GPL-2.0"
  | "GPL-3.0"
  | "AGPL-3.0"
  | "propia-restrictiva"
  | "declarada-sin-texto"
  | "sin-licencia";

/** Lo que cada licencia nos exige o nos prohibe. */
export interface ReglaLicencia {
  /** Si podemos usarlo en un producto que se cobra. */
  permiteUsoComercial: boolean;
  /**
   * Copyleft: obliga a publicar GCM entero bajo la misma licencia. Si es
   * `true`, copiar codigo es incompatible con venderlo.
   */
  contagia: boolean;
  /** Si obliga a reproducir el aviso de copyright y el texto de la licencia. */
  exigeCita: boolean;
  /** Si ademas obliga a declarar que modificamos el original. */
  exigeDeclararCambios: boolean;
  /** Frase para la pantalla de creditos y para los avisos del test. */
  resumen: string;
}

export const LICENCIAS: Record<Licencia, ReglaLicencia> = {
  MIT: {
    permiteUsoComercial: true,
    contagia: false,
    exigeCita: true,
    exigeDeclararCambios: false,
    resumen:
      "Permite usar, modificar y vender. A cambio hay que conservar el aviso " +
      "de copyright y el texto completo de la licencia.",
  },
  "Apache-2.0": {
    permiteUsoComercial: true,
    contagia: false,
    exigeCita: true,
    exigeDeclararCambios: true,
    resumen:
      "Como la MIT, y ademas obliga a dejar constancia de los cambios que " +
      "hicimos sobre el original.",
  },
  "EPL-2.0": {
    permiteUsoComercial: true,
    contagia: true,
    exigeCita: true,
    exigeDeclararCambios: false,
    resumen:
      "Deja vender, pero los archivos que vengan de ahi hay que publicarlos " +
      "con la misma licencia. Contagia por archivo, no por proyecto entero.",
  },
  "CC-BY-NC-SA-4.0": {
    permiteUsoComercial: false,
    contagia: true,
    exigeCita: true,
    exigeDeclararCambios: false,
    resumen:
      "El NC prohibe el uso comercial y el SA obliga a licenciar el derivado " +
      "igual. Sirve para inspirarse; el formato y las ideas son libres, sus " +
      "archivos no.",
  },
  "GPL-2.0": {
    permiteUsoComercial: true,
    contagia: true,
    exigeCita: true,
    exigeDeclararCambios: true,
    resumen:
      "Si distribuimos algo que incluya su codigo, hay que publicar el fuente " +
      "de GCM entero bajo GPL.",
  },
  "GPL-3.0": {
    permiteUsoComercial: true,
    contagia: true,
    exigeCita: true,
    exigeDeclararCambios: true,
    resumen:
      "Si distribuimos algo que incluya su codigo, hay que publicar el fuente " +
      "de GCM entero bajo GPL.",
  },
  "AGPL-3.0": {
    permiteUsoComercial: true,
    contagia: true,
    exigeCita: true,
    exigeDeclararCambios: true,
    resumen:
      "La mas exigente para nosotros: basta con SERVIR la aplicacion por web " +
      "para tener que entregar el fuente completo a cualquiera que la use. " +
      "Incompatible con vender GCM si copiamos su codigo.",
  },
  "propia-restrictiva": {
    permiteUsoComercial: false,
    contagia: true,
    exigeCita: true,
    exigeDeclararCambios: false,
    resumen:
      "Licencia escrita por el proyecto, con cesion de derechos de los " +
      "colaboradores. Hay que leerla entera antes de tocar nada.",
  },
  "declarada-sin-texto": {
    permiteUsoComercial: false,
    contagia: false,
    exigeCita: true,
    exigeDeclararCambios: false,
    resumen:
      "Anuncia una licencia permisiva pero no incluye el archivo ni el " +
      "titular. No hay aviso de copyright que reproducir, asi que no se puede " +
      "cumplir la condicion. Solo lectura hasta que el autor lo complete.",
  },
  "sin-licencia": {
    permiteUsoComercial: false,
    contagia: false,
    exigeCita: true,
    exigeDeclararCambios: false,
    resumen:
      "No declara licencia: el autor se reserva todos los derechos. Estar " +
      "publico en GitHub no lo hace reutilizable.",
  },
};

/**
 * Que hicimos con el codigo. Es lo que decide si hay obligacion de citar.
 *
 * `referencia` es la via limpia y la que hay que preferir siempre: leimos su
 * modelo de datos o su flujo, y escribimos el nuestro. No arrastra licencia.
 */
export type Uso =
  /** Solo lo leimos. Nuestro codigo esta escrito desde cero. */
  | "referencia"
  /** Partimos de su codigo y lo cambiamos. Obliga a citar. */
  | "adaptado"
  /** Esta tal cual, o casi. Obliga a citar. */
  | "copiado";

/** En que punto de la decision esta cada proyecto. */
export type Estado =
  /** Su codigo esta hoy dentro de GCM. */
  | "en-uso"
  /** Nos interesa y lo estamos estudiando. Todavia no hay codigo suyo dentro. */
  | "candidato"
  /** Lo consultamos, pero su licencia impide copiar nada. Solo mirar. */
  | "solo-lectura"
  /** Revisado y descartado. Se queda anotado para no volver a evaluarlo. */
  | "descartado";

export interface Tercero {
  /** Identificador estable, en minusculas y con guiones. */
  id: string;
  nombre: string;
  /**
   * El titular del copyright, tal y como aparece en su archivo de licencia.
   * `null` cuando el repositorio no lo dice, que es justo el caso peligroso.
   */
  autor: string | null;
  url: string;
  licencia: Licencia;
  estado: Estado;
  uso: Uso;
  /** Que nos aporta, en una frase. Se muestra en la pantalla de creditos. */
  queUsamos: string;
  /** Rutas de NUESTRO repositorio que contienen codigo suyo. */
  ubicaciones: string[];
  /**
   * El aviso literal a reproducir, copiado de su archivo LICENSE. Obligatorio
   * en cuanto el uso deja de ser `referencia`.
   */
  avisoCopyright: string | null;
  /** Lo que hay que recordar de este en concreto. */
  nota?: string;
}

/**
 * El registro.
 *
 * Hoy no hay ninguno `en-uso`: estan evaluados y extraidos para estudio, pero
 * dentro de GCM no hay una sola linea ajena. En cuanto se adapte codigo de
 * alguno, esa entrada pasa a `adaptado`, se rellenan `avisoCopyright` y
 * `ubicaciones`, y aparece sola en la pantalla de creditos.
 */
export const TERCEROS: Tercero[] = [
  {
    id: "last-planner-tool",
    nombre: "LastPlannerTool",
    autor: null,
    url: "https://github.com/effectus-ai/LastPlannerTool",
    licencia: "declarada-sin-texto",
    estado: "candidato",
    uso: "referencia",
    queUsamos:
      "El modelo de datos del Last Planner (restricciones, lookahead, " +
      "compromisos, PPC y razones de varianza) y su lector de archivos XER de " +
      "Primavera P6.",
    ubicaciones: [],
    avisoCopyright: null,
    nota:
      "Su package.json declara MIT pero el repositorio NO trae archivo LICENSE " +
      "ni nombre de titular, asi que no hay aviso que reproducir. Para leer y " +
      "reescribir vale; antes de adaptar codigo suyo hay que abrir una issue " +
      "pidiendole al autor que anada el LICENSE. Copia extraida en " +
      "docs/COMUNIDADGIT/_ref/LastPlannerTool-main/.",
  },
  {
    id: "lps-laravel",
    nombre: "LPS (Last Planner System en Laravel)",
    autor: null,
    url: "https://github.com/topics/last-planner-system",
    licencia: "sin-licencia",
    estado: "solo-lectura",
    uso: "referencia",
    queUsamos:
      "El segundo mapa del Last Planner, para contrastar nuestro dominio: " +
      "separa plan maestro, plan de fase, lookahead y plan semanal.",
    ubicaciones: [],
    avisoCopyright: null,
    nota:
      "No declara licencia, asi que no se puede copiar nada. Ademas es PHP y " +
      "no encaja con nuestro stack. Solo sirve para comparar el modelo.",
  },
  {
    id: "kaneo",
    nombre: "Kaneo",
    autor: "Copyright (c) 2024 Andrej Acevski",
    url: "https://github.com/usekaneo/kaneo",
    licencia: "MIT",
    estado: "candidato",
    uso: "referencia",
    queUsamos:
      "Gestion de proyectos en TypeScript moderno. Es lo mas cercano a " +
      "nuestro stack despues de LastPlannerTool.",
    ubicaciones: [],
    avisoCopyright: "Copyright (c) 2024 Andrej Acevski",
  },
  {
    id: "taskcafe",
    nombre: "Taskcafe",
    autor: null,
    url: "https://github.com/JordanKnott/taskcafe",
    licencia: "declarada-sin-texto",
    estado: "candidato",
    uso: "referencia",
    queUsamos:
      "Sus 88 migraciones SQL, como ejemplo de versionado de esquema en un " +
      "producto con tableros.",
    ubicaciones: [],
    avisoCopyright: null,
    nota:
      "El archivo LICENSE es la plantilla MIT SIN RELLENAR: dice literalmente " +
      "'Copyright (c) [year] [fullname]'. Mismo agujero que LastPlannerTool.",
  },
  {
    id: "markwhen",
    nombre: "Markwhen",
    autor: "Copyright 2022 Rob Koch",
    url: "https://github.com/mark-when/markwhen",
    licencia: "MIT",
    estado: "candidato",
    uso: "referencia",
    queUsamos: "La idea de generar una linea de tiempo desde texto plano.",
    ubicaciones: [],
    avisoCopyright: "Copyright 2022 Rob Koch",
  },
  {
    id: "adr-joel-parker-henderson",
    nombre: "Architecture Decision Record",
    autor: "Joel Parker Henderson",
    url: "https://github.com/joelparkerhenderson/architecture-decision-record",
    licencia: "CC-BY-NC-SA-4.0",
    estado: "solo-lectura",
    uso: "referencia",
    queUsamos:
      "La forma de un ADR: contexto, decision y consecuencias. La estructura " +
      "es una idea y se puede seguir; sus archivos no se copian.",
    ubicaciones: [],
    avisoCopyright: null,
    nota:
      "El NC prohibe el uso comercial. Escribimos plantilla propia siguiendo " +
      "el formato en lugar de copiar la suya.",
  },
  {
    id: "planka",
    nombre: "Planka",
    autor: "PLANKA Software GmbH",
    url: "https://github.com/plankanban/planka",
    licencia: "propia-restrictiva",
    estado: "solo-lectura",
    uso: "referencia",
    queUsamos: "Referencia de interaccion para el tablero semanal.",
    ubicaciones: [],
    avisoCopyright: null,
    nota: "Licencia propia con cesion de derechos. Mirar, no copiar.",
  },
  {
    id: "erpnext",
    nombre: "ERPNext",
    autor: "Frappe Technologies Pvt. Ltd.",
    url: "https://github.com/frappe/erpnext",
    licencia: "GPL-3.0",
    estado: "solo-lectura",
    uso: "referencia",
    queUsamos: "Su modelo contable, que es el estandar del sector.",
    ubicaciones: [],
    avisoCopyright: null,
    nota: "GPL: leer y reescribir. Copiar obligaria a publicar GCM entero.",
  },
  {
    id: "openproject",
    nombre: "OpenProject",
    autor: "OpenProject GmbH",
    url: "https://github.com/opf/openproject",
    licencia: "GPL-3.0",
    estado: "solo-lectura",
    uso: "referencia",
    queUsamos: "Su Gantt maduro, como referencia de comportamiento.",
    ubicaciones: [],
    avisoCopyright: null,
    nota: "GPL: leer y reescribir.",
  },
  {
    id: "leantime",
    nombre: "Leantime",
    autor: "Leantime",
    url: "https://github.com/Leantime/leantime",
    licencia: "AGPL-3.0",
    estado: "solo-lectura",
    uso: "referencia",
    queUsamos: "Referencia de producto para gestion de proyectos.",
    ubicaciones: [],
    avisoCopyright: null,
    nota: "AGPL: incompatible con vender GCM si copiamos codigo.",
  },
  {
    id: "vikunja",
    nombre: "Vikunja",
    autor: "Vikunja",
    url: "https://github.com/go-vikunja/vikunja",
    licencia: "AGPL-3.0",
    estado: "solo-lectura",
    uso: "referencia",
    queUsamos: "Referencia de producto para tareas.",
    ubicaciones: [],
    avisoCopyright: null,
    nota: "AGPL: incompatible con vender GCM si copiamos codigo.",
  },
  {
    id: "ever-gauzy",
    nombre: "Ever Gauzy",
    autor: "Ever Co. LTD",
    url: "https://github.com/ever-co/ever-gauzy",
    licencia: "AGPL-3.0",
    estado: "solo-lectura",
    uso: "referencia",
    queUsamos: "Referencia de alcance de un ERP/CRM completo.",
    ubicaciones: [],
    avisoCopyright: null,
    nota: "AGPL y ademas Angular. Poco aprovechable.",
  },
  {
    id: "huly-platform",
    nombre: "Huly Platform",
    autor: "Hardcore Engineering Inc.",
    url: "https://github.com/hcengineering/platform",
    licencia: "EPL-2.0",
    estado: "solo-lectura",
    uso: "referencia",
    queUsamos: "Referencia de alternativa a Jira.",
    ubicaciones: [],
    avisoCopyright: null,
    nota: "Svelte, y su servicio alojado esta cerrando.",
  },
  {
    id: "freeplane",
    nombre: "Freeplane",
    autor: "Freeplane contributors",
    url: "https://github.com/freeplane/freeplane",
    licencia: "GPL-2.0",
    estado: "descartado",
    uso: "referencia",
    queUsamos: "Nada: es escritorio en Java, no encaja.",
    ubicaciones: [],
    avisoCopyright: null,
  },
  {
    id: "snazzy-gallery",
    nombre: "Snazzy Gallery",
    autor: null,
    url: "https://github.com/dmpop/snazzy-gallery",
    licencia: "CC-BY-NC-SA-4.0",
    estado: "descartado",
    uso: "referencia",
    queUsamos: "Nada: ya tenemos galeria propia.",
    ubicaciones: [],
    avisoCopyright: null,
    nota: "NC prohibe uso comercial. Solo se miro el CSS del masonry.",
  },
  {
    id: "epp-guard",
    nombre: "EPP-Guard",
    autor: null,
    url: "https://github.com/topics/epp-guard",
    licencia: "sin-licencia",
    estado: "solo-lectura",
    uso: "referencia",
    queUsamos:
      "Sus plantillas de documentacion de producto (problem statement, " +
      "canvas, scorecard de riesgo, pruebas de usuario, OKR).",
    ubicaciones: [],
    avisoCopyright: null,
    nota:
      "Trabajo universitario sin licencia. Las plantillas se rehacen con " +
      "nuestras palabras, no se copian.",
  },
];

/**
 * Si esta entrada tiene que aparecer en la pantalla de creditos.
 *
 * Solo lo que esta DENTRO del producto y no fue reescrito por nosotros. Un
 * proyecto que solo leimos no se cita: citar de mas tampoco es gratis, porque
 * diluye la lista y da a entender que llevamos codigo que no llevamos.
 */
export function requiereCita(tercero: Tercero): boolean {
  return (
    tercero.estado === "en-uso" &&
    tercero.uso !== "referencia" &&
    LICENCIAS[tercero.licencia].exigeCita
  );
}

/**
 * Lo que se pinta en la pantalla de creditos, ordenado por nombre.
 *
 * Hoy devuelve una lista vacia, y eso es correcto: no hay codigo ajeno dentro.
 */
export function tercerosACitar(terceros: Tercero[] = TERCEROS): Tercero[] {
  return terceros
    .filter(requiereCita)
    .slice()
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/** Los que estamos estudiando, para saber que hay sobre la mesa. */
export function tercerosPorEstado(
  estado: Estado,
  terceros: Tercero[] = TERCEROS,
): Tercero[] {
  return terceros.filter((t) => t.estado === estado);
}

/**
 * Los problemas legales de una entrada, en frases que se puedan leer.
 *
 * Es el corazon del registro: convierte las reglas de las licencias en algo
 * que una prueba puede comprobar sola, en vez de depender de que alguien se
 * acuerde en el momento de hacer el commit.
 */
export function problemasDeLicencia(tercero: Tercero): string[] {
  const regla = LICENCIAS[tercero.licencia];
  const problemas: string[] = [];

  // Mientras solo lo leamos no hay obligacion ninguna. Lo unico que hay que
  // vigilar es que esa declaracion sea cierta: si dice ser referencia pero
  // apunta a archivos nuestros, alguien copio y no actualizo el registro.
  if (tercero.uso === "referencia") {
    if (tercero.ubicaciones.length > 0) {
      problemas.push(
        `${tercero.nombre}: dice ser solo referencia pero declara ubicaciones ` +
          `en nuestro codigo. Si hay codigo suyo dentro, el uso es 'adaptado'.`,
      );
    }
    return problemas;
  }

  if (!regla.permiteUsoComercial) {
    problemas.push(
      `${tercero.nombre}: su licencia (${tercero.licencia}) NO permite uso ` +
        `comercial, y GCM se vende. ${regla.resumen}`,
    );
  }

  if (regla.contagia) {
    problemas.push(
      `${tercero.nombre}: su licencia (${tercero.licencia}) es copyleft y ` +
        `contagia. ${regla.resumen} Hay que reescribir desde cero.`,
    );
  }

  if (regla.exigeCita && !tercero.avisoCopyright) {
    problemas.push(
      `${tercero.nombre}: falta el aviso de copyright literal, y su licencia ` +
        `obliga a reproducirlo.`,
    );
  }

  if (tercero.estado === "en-uso" && tercero.ubicaciones.length === 0) {
    problemas.push(
      `${tercero.nombre}: esta marcado como en uso pero no dice en que ` +
        `archivos nuestros vive. Sin eso no se puede auditar ni retirar.`,
    );
  }

  return problemas;
}

/**
 * Revisa el registro entero. La prueba exige que devuelva una lista vacia.
 *
 * Asi es imposible meter codigo AGPL en GCM, o copiar algo sin acreditar al
 * autor, sin que la suite se ponga en rojo y obligue a mirarlo.
 */
export function auditarTerceros(terceros: Tercero[] = TERCEROS): string[] {
  return terceros.flatMap(problemasDeLicencia);
}
