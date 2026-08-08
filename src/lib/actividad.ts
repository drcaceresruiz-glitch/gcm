/**
 * Traduce una entrada de auditoria a una frase legible.
 *
 * `AuditLog` guarda desde el primer dia quien hizo que y cuando, y hasta
 * ahora no lo leia ninguna pantalla. Aqui se convierte en el registro de
 * actividad del panel.
 *
 * Es logica pura —de una fila a una frase— para poder probarla sin base de
 * datos, que es donde este proyecto pone las reglas que importan.
 */

import type { TonoChip } from "@/components/ui/Chip";

/** Lo que necesita saberse de una fila para redactarla. */
export interface EntradaAuditoria {
  entidad: string;
  accion: string;
  antes?: unknown;
  despues?: unknown;
}

export interface ActividadLegible {
  texto: string;
  tono: TonoChip;
}

/**
 * Acciones que NO son actividad de obra.
 *
 * Los ingresos y los cambios de clave se auditan —y deben seguir
 * auditandose—, pero en un panel de control son ruido: con cinco personas
 * entrando cada manana taparian cualquier orden aprobada. La auditoria
 * completa es otra pantalla, no esta.
 */
const ACCIONES_DE_SESION = new Set([
  "LOGIN",
  "LOGIN_FAILED",
  "LOGOUT",
  "PASSWORD_CHANGE",
  "PASSWORD_RESET",
]);

export function esActividadDeObra(entrada: EntradaAuditoria): boolean {
  return !ACCIONES_DE_SESION.has(entrada.accion);
}

/**
 * Saca el identificador que hace reconocible la fila: el numero de la orden,
 * el nombre de la obra, la razon social del proveedor...
 *
 * Se prueban varias claves en vez de exigir una concreta porque cada servicio
 * guarda lo suyo. Si no hay ninguna, la frase se queda sin nombre propio, que
 * es peor pero sigue siendo cierta —mejor eso que inventarse un numero—.
 */
function identificador(...fuentes: unknown[]): string | null {
  const CLAVES = [
    "numero",
    "nombreObra",
    "razonSocial",
    "nombre",
    "codigoPartida",
    "version",
  ];

  for (const fuente of fuentes) {
    if (!fuente || typeof fuente !== "object") continue;

    const obj = fuente as Record<string, unknown>;

    for (const clave of CLAVES) {
      const valor = obj[clave];
      if (typeof valor === "string" && valor.trim()) return valor;
      if (typeof valor === "number") return String(valor);
    }
  }

  return null;
}

/** Como se llama cada cosa en castellano corriente. */
const NOMBRE: Record<string, string> = {
  OrdenCompra: "Orden",
  MovimientoPresupuestal: "Movimiento",
  Project: "Obra",
  Proveedor: "Proveedor",
  Baseline: "Revision",
  WbsItem: "Presupuesto",
  FormaPagoPlantilla: "Forma de pago",
  CompanyPermission: "Permisos",
};

/**
 * La frase y su color.
 *
 * Aprobar algo va en verde y eliminar en rojo porque son los dos extremos que
 * alguien busca al repasar que ha pasado hoy; el resto queda en neutro para
 * no convertir la lista en un semaforo sin jerarquia.
 */
export function describirActividad(
  entrada: EntradaAuditoria,
): ActividadLegible {
  const cosa = NOMBRE[entidadNormalizada(entrada.entidad)] ?? entrada.entidad;
  const id = identificador(entrada.despues, entrada.antes);
  const sujeto = id ? `${cosa} ${id}` : cosa;

  // Anular se guarda como UPDATE con el estado nuevo dentro, no como una
  // accion propia: se distingue mirando el `despues`.
  const estadoNuevo = leerEstado(entrada.despues);

  if (entrada.accion === "UPDATE" && estadoNuevo === "ANULADA") {
    return { texto: `${sujeto} anulada`, tono: "peligro" };
  }

  switch (entrada.accion) {
    case "APPROVE":
      return { texto: `${sujeto} aprobada`, tono: "exito" };
    case "CREATE":
      return { texto: `${sujeto} registrada`, tono: "neutro" };
    case "DELETE":
      return { texto: `${sujeto} eliminada`, tono: "peligro" };
    case "UPDATE":
      return { texto: `${sujeto} modificada`, tono: "neutro" };
    default:
      return { texto: sujeto, tono: "neutro" };
  }
}

function entidadNormalizada(entidad: string): string {
  return entidad.trim();
}

function leerEstado(fuente: unknown): string | null {
  if (!fuente || typeof fuente !== "object") return null;
  const valor = (fuente as Record<string, unknown>).estado;
  return typeof valor === "string" ? valor : null;
}
