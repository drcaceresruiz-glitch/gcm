/**
 * La miga de pan: de donde vienes y donde estas.
 *
 * GCM no tenia ninguna. La orientacion se sostenia sobre el riel de secciones
 * de la obra —que dice QUE seccion esta abierta, no la cadena que lleva hasta
 * ella— y sobre un «Volver» por pantalla. En una ruta de cuatro niveles como
 * `/obras/x/plan-semanal/abc/tablero` eso deja al usuario con dos flechas de
 * vuelta que apuntan a sitios distintos y ninguna cadena que leer.
 *
 * Logica pura y con tabla explicita, sin base de datos. Que la tabla sea
 * EXPLICITA y no derivada del segmento es deliberado: `plan-semanal` no se
 * lee «Plan semanal» al capitalizarlo, `[id]` no se lee de ninguna manera, y
 * una miga que dice «obras / cmsu8thog / plan-semanal» es peor que no tenerla.
 */

export interface Miga {
  texto: string;
  /**
   * A donde lleva. `null` = es la pagina actual (no se enlaza) o es un tramo
   * que no tiene pantalla propia, como `/empresa`.
   */
  href: string | null;
}

interface Entrada {
  /// Segmentos, con `:nombre` para los dinamicos.
  patron: string;
  /**
   * Texto fijo, o `:nombre` para tomarlo de las etiquetas que pasa quien
   * llama. Sin etiqueta, se usa `respaldo`.
   */
  texto: string;
  respaldo?: string;
  /// No hay pantalla en esa ruta: se pinta como texto, no como enlace.
  sinPagina?: boolean;
}

/**
 * La tabla, en orden de aparicion en la app.
 *
 * `:algo` en el patron es un segmento dinamico; `:algo` en el texto significa
 * «buscalo en las etiquetas». Un tramo sin pantalla propia —`/empresa`— lleva
 * `sinPagina` y se pinta como texto: un enlace que lleva a un 404 orienta peor
 * que no tener enlace.
 */
const TABLA: readonly Entrada[] = [
  { patron: "/panel", texto: "Panel" },
  { patron: "/avisos", texto: "Avisos" },
  { patron: "/perfil", texto: "Mi perfil" },

  { patron: "/operador", texto: "Constructoras" },
  { patron: "/operador/nueva", texto: "Nueva constructora" },

  { patron: "/empresa", texto: "Empresa", sinPagina: true },
  { patron: "/empresa/datos", texto: "Datos de la empresa" },
  { patron: "/empresa/usuarios", texto: "Usuarios" },
  { patron: "/empresa/permisos", texto: "Permisos" },
  { patron: "/empresa/solicitudes", texto: "Solicitudes" },
  { patron: "/empresa/proveedores", texto: "Proveedores" },
  { patron: "/empresa/formas-pago", texto: "Formas de pago" },
  { patron: "/empresa/configuracion", texto: "Configuración" },

  { patron: "/obras", texto: "Obras" },
  { patron: "/obras/nueva", texto: "Nueva obra" },
  { patron: "/obras/:obra", texto: ":obra", respaldo: "Obra" },
  { patron: "/obras/:obra/editar", texto: "Editar datos" },
  { patron: "/obras/:obra/importar", texto: "Importar presupuesto" },
  { patron: "/obras/:obra/revisiones", texto: "Revisiones" },
  { patron: "/obras/:obra/meta", texto: "Presupuesto meta" },
  { patron: "/obras/:obra/movimientos", texto: "Movimientos" },
  { patron: "/obras/:obra/movimientos/nuevo", texto: "Nuevo movimiento" },
];

const TABLA_OBRA: readonly Entrada[] = [
  { patron: "/obras/:obra/cronograma", texto: "Cronograma" },
  { patron: "/obras/:obra/cronograma/gantt", texto: "Diagrama de Gantt" },
  { patron: "/obras/:obra/cronograma/importar", texto: "Importar cronograma" },
  { patron: "/obras/:obra/cronograma/informe", texto: "Informe semanal" },
  { patron: "/obras/:obra/cronograma/mapeo", texto: "Enlazar con partidas" },

  { patron: "/obras/:obra/tablero", texto: "Tablero" },

  { patron: "/obras/:obra/lookahead", texto: "Lookahead" },
  { patron: "/obras/:obra/kanban", texto: "Kanban" },
  { patron: "/obras/:obra/lookahead/codigos", texto: "Códigos QR" },

  { patron: "/obras/:obra/plan-semanal", texto: "Plan semanal" },
  { patron: "/obras/:obra/plan-semanal/:plan", texto: ":plan", respaldo: "Semana" },
  { patron: "/obras/:obra/plan-semanal/:plan/tablero", texto: "Tablero" },

  { patron: "/obras/:obra/avance", texto: "Parte del día" },
  { patron: "/obras/:obra/evidencia", texto: "Evidencia" },
  { patron: "/obras/:obra/galeria", texto: "Galería" },
  { patron: "/obras/:obra/personal", texto: "Personal y avisos" },
  { patron: "/obras/:obra/respaldo", texto: "Respaldo" },

  { patron: "/obras/:obra/ordenes", texto: "Órdenes" },
  { patron: "/obras/:obra/ordenes/nueva", texto: "Nueva orden" },
  { patron: "/obras/:obra/ordenes/:orden/imprimir", texto: "Imprimir" },

  { patron: "/obras/:obra/proveedores", texto: "Proveedores" },
  { patron: "/obras/:obra/proveedores/nuevo", texto: "Nuevo encargo" },
  { patron: "/obras/:obra/proveedores/:encargo", texto: "Encargo", respaldo: "Encargo" },
];

const TODAS: readonly Entrada[] = [...TABLA, ...TABLA_OBRA];

/** Un patron casa si tiene los mismos segmentos y los fijos coinciden. */
function casa(patron: readonly string[], ruta: readonly string[]): boolean {
  return (
    patron.length === ruta.length &&
    patron.every((p, i) => p.startsWith(":") || p === ruta[i])
  );
}

function trocear(camino: string): string[] {
  return camino.split("/").filter(Boolean);
}

/**
 * La cadena de migas de una ruta.
 *
 * Se recorre el camino acumulando segmentos y se busca una entrada para cada
 * prefijo. Los prefijos SIN entrada se saltan en vez de inventarles nombre:
 * `/obras/x/ordenes/y` no tiene pantalla en `.../y`, y una miga que dijera
 * «cmsu8thog» orienta menos que no estar.
 *
 * La ultima miga nunca lleva `href`: es donde estas, y un enlace a la pagina
 * en la que ya estas es ruido que ademas confunde a un lector de pantalla.
 */
export function migasDeRuta(
  camino: string,
  etiquetas: Readonly<Record<string, string>> = {},
): Miga[] {
  const ruta = trocear(camino.split("?")[0] ?? "");
  const migas: Miga[] = [];

  for (let n = 1; n <= ruta.length; n++) {
    const prefijo = ruta.slice(0, n);
    const entrada = TODAS.find((e) => casa(trocear(e.patron), prefijo));
    if (!entrada) continue;

    const texto = entrada.texto.startsWith(":")
      ? (etiquetas[entrada.texto.slice(1)] ?? entrada.respaldo ?? entrada.texto.slice(1))
      : entrada.texto;

    migas.push({
      texto,
      href: entrada.sinPagina ? null : `/${prefijo.join("/")}`,
    });
  }

  const ultima = migas[migas.length - 1];
  if (ultima) ultima.href = null;

  return migas;
}
