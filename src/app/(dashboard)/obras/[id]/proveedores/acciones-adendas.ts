"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { obtenerSesion } from "@/services/sesion.service";
import {
  crearAdenda,
  resolverAdenda,
  type DatosAdenda,
} from "@/services/adendas.service";

/**
 * Las dos firmas de una adenda de contratista, como acciones.
 *
 * Van APARTE de `acciones.ts` a proposito: las de encargos reciben objetos
 * tipados porque manejan una lista de partidas, y estas vienen de un
 * formulario normal. Mezclarlas obligaria a que un archivo tuviera las dos
 * convenciones.
 *
 * Los permisos NO se comprueban aqui: los comprueba el servicio, que es la
 * frontera de verdad. Una accion nueva que se olvidara de mirar seguiria
 * estando protegida.
 */

export interface EstadoAdenda {
  error?: string;
  ok?: boolean;
  /// El numero que le toco, para poder decir «Adenda 2 registrada».
  numero?: number;
}

function texto(datos: FormData, campo: string): string {
  return String(datos.get(campo) ?? "").trim();
}

/** Ambas rutas: la lista de proveedores y la ficha del encargo. */
function repintar(obraId: string, encargoId: string): void {
  revalidatePath(`/obras/${obraId}/proveedores`);
  revalidatePath(`/obras/${obraId}/proveedores/${encargoId}`);
  // La bolsa comprometida vive en la pantalla de la meta y cambia con cada
  // adenda aprobada: sin esto seguiria enseñando la cifra de antes.
  revalidatePath(`/obras/${obraId}/meta`);
}

export async function accionRegistrarAdenda(
  _previo: EstadoAdenda,
  datos: FormData,
): Promise<EstadoAdenda> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const obraId = texto(datos, "obraId");
  const encargoId = texto(datos, "encargoId");
  if (!obraId || !encargoId) return { error: "Falta el encargo." };

  /*
   * El SIGNO se arma aqui, no lo teclea el usuario.
   *
   * El formulario pregunta «adicional o deductivo» con dos botones y pide el
   * importe siempre en positivo. Pedir un menos delante es como alguien
   * registra un adicional de -8.000 sin darse cuenta, y esa cifra va directa
   * al comprometido de la obra.
   */
  const clase = texto(datos, "clase");
  const crudo = texto(datos, "importe").replace(/^[+-]/, "");
  const importe = clase === "DEDUCTIVO" ? `-${crudo}` : crudo;

  const entrada: DatosAdenda = {
    fecha: texto(datos, "fecha"),
    importe,
    concepto: texto(datos, "concepto"),
    motivo: texto(datos, "motivo"),
    referencia: texto(datos, "referencia") || null,
  };

  const r = await crearAdenda(sesion, obraId, encargoId, entrada);
  if (!r.ok) return { error: r.error };

  repintar(obraId, encargoId);
  return { ok: true, numero: r.numero };
}

export async function accionResolverAdenda(
  _previo: EstadoAdenda,
  datos: FormData,
): Promise<EstadoAdenda> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const obraId = texto(datos, "obraId");
  const encargoId = texto(datos, "encargoId");
  const adendaId = texto(datos, "adendaId");
  if (!obraId || !encargoId || !adendaId) return { error: "Falta la adenda." };

  const r = await resolverAdenda(sesion, obraId, adendaId, {
    aprobar: texto(datos, "decision") === "APROBAR",
    motivoRechazo: texto(datos, "motivoRechazo") || null,
  });
  if (!r.ok) return { error: r.error };

  repintar(obraId, encargoId);
  return { ok: true };
}
