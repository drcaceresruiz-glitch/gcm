import type { PasoSiguiente } from "@/lib/siguiente-paso";

/**
 * La puesta en marcha de una constructora nueva: los pasos del primer dia.
 *
 * Es el hermano de `lib/siguiente-paso` un piso mas arriba. Aquel contesta
 * «que toca ahora en ESTA obra»; este, «que le falta a la CONSTRUCTORA para
 * estar en marcha». Comparten el tipo `PasoSiguiente` y el mismo componente
 * los pinta, para que el vocabulario sea uno solo en los dos niveles — el
 * error que este proyecto ya pago dentro de la obra con dos mapas del mismo
 * territorio.
 *
 * POR QUE ADEMAS DE LAS MARCAS DEL MENU. `preliminares.service` ya marca en el
 * lateral que pasos estan dados, y su cabecera decidio —con razon— que la guia
 * ES el menu y no una pantalla de bienvenida, «que se visita una vez y luego
 * estorba». Eso resuelve **cuales** faltan. Lo que no resuelve es lo que de
 * verdad atasca el primer dia: en que ORDEN van, QUE hay que tener a mano
 * antes de empezar cada uno, y DONDE esta la plantilla que hay que llenar.
 * Para eso estan la lista de aqui abajo y la pantalla que la pinta, que no es
 * de bienvenida: no se autoabre, no bloquea nada y se vuelve a ella con el
 * Excel a medio llenar.
 *
 * EL ORDEN ES EL DEL TRABAJO REAL, y cada escalon apoya en el anterior:
 * los datos y el logo salen en los documentos que generan todos los demas;
 * los contratistas heredan su impuesto a cada orden; las personas hacen falta
 * para poder asignar la obra; y sin obra no hay donde cargar un presupuesto.
 */

/** Un paso de la puesta en marcha, con lo que hace falta para darlo. */
export interface PasoPuestaEnMarcha extends PasoSiguiente {
  /**
   * Como se llama el paso, en neutro. Lo usa la GUIA.
   *
   * Existe porque `titulo` esta redactado en falta —«Falta el logo»— que es lo
   * correcto en el anclaje, donde solo aparece si esta pendiente. La guia
   * enseña TODOS los pasos, tambien los dados, y ahi «Falta el logo» sobre un
   * paso marcado con su check decia dos cosas contrarias a la vez. Se vio en
   * pantalla con la constructora ya montada: «5 de 5 pasos dados» encabezando
   * cinco titulos que decian que faltaba todo.
   */
  nombre: string;
  /// Para la pantalla-guia: que hay que tener a mano ANTES de sentarse.
  queNecesitas: string;
  /**
   * La plantilla oficial que se descarga para este paso, si la hay.
   *
   * Casi todos los fallos de los importadores nacen del archivo y no del
   * codigo, asi que la plantilla va en la guia y no escondida dentro de cada
   * importador: el primer dia es justo cuando nadie sabe que existe.
   */
  plantilla: { titulo: string; href: string } | null;
}

/** Que tiene ya cargado la constructora. Sale de `preliminaresDeEmpresa`. */
export interface EstadoPreliminares {
  logo: boolean;
  contratistas: boolean;
  equipo: boolean;
  obras: boolean;
  presupuesto: boolean;
}

/** Que puede HACER quien mira, por permiso. */
export interface PuedeEnEmpresa {
  empresa: boolean;
  contratistas: boolean;
  equipo: boolean;
  obras: boolean;
}

interface Definicion {
  clave: keyof EstadoPreliminares;
  puede: keyof PuedeEnEmpresa;
  nombre: string;
  titulo: string;
  consecuencia: string;
  queNecesitas: string;
  accion: string;
  camino: string;
  plantilla: { titulo: string; href: string } | null;
}

/**
 * Los pasos, en orden. La lista es la guia: quien la lea de arriba abajo tiene
 * la constructora en marcha.
 *
 * `consecuencia` cabe en UNA frase por el mismo motivo que en
 * `lib/siguiente-paso`: la comparte el anclaje, que se pinta encima de otra
 * pantalla y no puede robarle tres lineas.
 */
const PASOS: readonly Definicion[] = [
  {
    clave: "logo",
    puede: "empresa",
    nombre: "El logo de la constructora",
    titulo: "Falta el logo de tu constructora",
    consecuencia:
      "Sale en las órdenes que firma el contratista, en los informes que recibe el cliente y en los correos que manda GCM.",
    queNecesitas:
      "El logo en PNG o JPG. Se ajusta solo, sin deformarse; no hace falta recortarlo antes.",
    accion: "Cargar el logo",
    camino: "/empresa/datos",
    plantilla: null,
  },
  {
    clave: "contratistas",
    puede: "contratistas",
    nombre: "Los contratistas con los que trabajas",
    titulo: "Todavía no hay contratistas cargados",
    consecuencia:
      "Sin ellos no se puede firmar un encargo ni emitir una orden, y de su ficha sale el impuesto de cada documento en vez de acertarlo a mano.",
    queNecesitas:
      "La razón social y el RUC de cada uno, y qué impuesto emite. Lo demás se puede dejar para después: al reimportar la plantilla se rellenan los huecos y no se pisa nada.",
    accion: "Cargar contratistas",
    camino: "/empresa/proveedores",
    plantilla: {
      titulo: "Plantilla de contratistas",
      href: "/empresa/proveedores/plantilla",
    },
  },
  {
    clave: "equipo",
    puede: "equipo",
    nombre: "Las personas de tu equipo",
    titulo: "Eres la única persona en la constructora",
    consecuencia:
      "Cada residente necesita su propio acceso: el avance, las fotos y los cierres quedan firmados con quien los hizo, y con una cuenta compartida esa firma no vale nada.",
    queNecesitas:
      "Nombre, documento, cargo y correo de cada uno. GCM genera la clave temporal y la enseña una sola vez.",
    accion: "Añadir personas",
    camino: "/empresa/usuarios",
    plantilla: null,
  },
  {
    clave: "obras",
    puede: "obras",
    nombre: "La primera obra",
    titulo: "Todavía no hay ninguna obra",
    consecuencia:
      "La obra es donde vive todo lo demás: presupuesto, cronograma, encargos y avance cuelgan de ella.",
    queNecesitas:
      "El nombre, la ubicación, el cliente y las fechas de inicio y fin previstas. Las fechas se pueden corregir después.",
    accion: "Crear la primera obra",
    camino: "/obras/nueva",
    plantilla: null,
  },
  {
    clave: "presupuesto",
    puede: "obras",
    nombre: "El presupuesto de esa obra",
    titulo: "Ninguna obra tiene presupuesto todavía",
    consecuencia:
      "Es el paso donde GCM empieza a servir: todas las cifras —avance valorizado, comprometido, alertas— cuelgan de ese árbol.",
    queNecesitas:
      "El presupuesto REAL en la plantilla oficial: lo que de verdad cuadraste con los contratistas. El contractual se genera despues a partir de el, recargando cada capitulo. Cópialo aunque ya lo tengas en otro Excel: casi todos los fallos del importador nacen del archivo.",
    accion: "Abrir las obras",
    camino: "/obras",
    plantilla: {
      titulo: "Plantilla del presupuesto real",
      href: "/plantilla-meta",
    },
  },
];

function aPaso(d: Definicion): PasoPuestaEnMarcha {
  return {
    clave: `puesta-${d.clave}`,
    nombre: d.nombre,
    // Ninguno bloquea: una constructora a medio configurar funciona, solo
    // rinde menos. Es la misma linea de `lib/pendientes`.
    gravedad: "sugerencia",
    titulo: d.titulo,
    consecuencia: d.consecuencia,
    accion: d.accion,
    camino: d.camino,
    queNecesitas: d.queNecesitas,
    plantilla: d.plantilla,
  };
}

/** Todos los pasos con su estado, para la pantalla-guia. */
export function pasosDePuestaEnMarcha(
  estado: EstadoPreliminares,
): { paso: PasoPuestaEnMarcha; hecho: boolean }[] {
  return PASOS.map((d) => ({ paso: aPaso(d), hecho: estado[d.clave] }));
}

/**
 * El primer paso que falta, para el anclaje del panel. null = ya esta todo.
 *
 * Salta los que quien mira no puede dar: proponerle cargar contratistas a
 * quien solo tiene lectura es ruido que ni siquiera se quita haciendo la
 * tarea. Ver la misma decision en `lib/siguiente-paso`.
 */
export function siguientePasoDeEmpresa(
  estado: EstadoPreliminares,
  puede: PuedeEnEmpresa,
): PasoPuestaEnMarcha | null {
  const pendiente = PASOS.find((d) => !estado[d.clave] && puede[d.puede]);
  return pendiente ? aPaso(pendiente) : null;
}
