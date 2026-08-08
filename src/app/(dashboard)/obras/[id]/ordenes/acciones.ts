"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { obtenerSesion } from "@/services/sesion.service";
import {
  anularOrden,
  aprobarOrden,
  crearOrden,
  eliminarOrden,
} from "@/services/ordenes.service";
import { porcentajeAFraccion } from "@/lib/presupuesto";

/**
 * Acciones de las ordenes.
 *
 * Como en revisiones y movimientos, aqui se traduce entre el vocabulario del
 * formulario y el del dominio: el IGV se escribe como porcentaje ("18") y se
 * guarda como fraccion ("0.1800"), con aritmetica exacta y nunca dividiendo
 * entre cien.
 *
 * Las reglas de fondo —que el reparto sume el neto, que las lineas cuadren
 * con el subtotal, que el numero no se repita— son del servicio. Aqui solo se
 * comprueba la FORMA, porque las lineas viajan como JSON.
 */

export interface EstadoOrden {
  error?: string;
}

const esquemaLineas = z.array(
  z.object({
    esAgrupador: z.boolean(),
    nivel: z.number().int().min(0).max(9).optional(),
    cantidad: z.string().optional(),
    unidad: z.string().optional(),
    descripcion: z.string().min(1),
    precioUnitario: z.string().optional(),
    importe: z.string(),
  }),
);

const esquemaImputaciones = z
  .array(z.object({ wbsItemId: z.string().min(1), importe: z.string() }))
  .min(1);

export async function accionCrearOrden(
  _previo: EstadoOrden,
  datos: FormData,
): Promise<EstadoOrden> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const obraId = String(datos.get("obraId") ?? "");
  if (!obraId) return { error: "Falta la obra." };

  const texto = (campo: string) => String(datos.get(campo) ?? "").trim();

  const tipo = z.enum(["COMPRA", "SERVICIO"]).safeParse(texto("tipo"));
  if (!tipo.success) return { error: "Elige si es orden de compra o de servicio." };

  // El impuesto llega heredado del proveedor y se puede cambiar por
  // excepcion. Si viniera manipulado, se queda en IGV, que es el caso
  // corriente: el servidor no confia en lo que dice el formulario.
  const impuesto = z
    .enum(["IGV", "RENTA", "NINGUNO"])
    .safeParse(texto("tipoImpuesto"));

  // La tasa se escribe en el formulario porque las ordenes antiguas pueden
  // llevar otra y porque puede cambiar.
  const igv = porcentajeAFraccion(texto("porcentajeIgv"));
  if (igv === null) return { error: "El porcentaje del impuesto no es valido." };

  let lineasCrudas: unknown;
  let imputacionesCrudas: unknown;
  try {
    lineasCrudas = JSON.parse(String(datos.get("lineas") ?? "[]"));
    imputacionesCrudas = JSON.parse(String(datos.get("imputaciones") ?? "[]"));
  } catch {
    return { error: "No se pudieron leer las lineas de la orden." };
  }

  const lineas = esquemaLineas.safeParse(lineasCrudas);
  if (!lineas.success) {
    return { error: "Hay alguna linea incompleta. Revisa descripciones e importes." };
  }

  const imputaciones = esquemaImputaciones.safeParse(imputacionesCrudas);
  if (!imputaciones.success) {
    return { error: "Indica contra que partidas se imputa la orden y con que importe." };
  }

  const resultado = await crearOrden(sesion, obraId, {
    proveedorId: texto("proveedorId"),
    numero: texto("numero"),
    tipo: tipo.data,
    fecha: texto("fecha"),
    descripcion: texto("descripcion"),
    referencia: texto("referencia") || undefined,
    formaPago: texto("formaPago") || undefined,
    observaciones: texto("observaciones") || undefined,
    subtotal: texto("subtotal") || undefined,
    descuentoComercial: texto("descuentoComercial") || undefined,
    tipoImpuesto: impuesto.success ? impuesto.data : undefined,
    porcentajeIgv: igv,
    lineas: lineas.data,
    imputaciones: imputaciones.data,
    recordarPartidas: datos.get("recordarPartidas") === "on",
  });

  if (!resultado.ok) return { error: resultado.error };

  revalidatePath(`/obras/${obraId}/ordenes`);
  redirect(`/obras/${obraId}/ordenes?creada=${encodeURIComponent(resultado.numero)}`);
}

/**
 * Aprobar incorpora la orden al comprometido. La accion no acepta nada que se
 * pueda escribir: las dos reglas se comprueban en el servicio contra lo que
 * hay guardado.
 */
export async function accionAprobarOrden(
  _previo: EstadoOrden,
  datos: FormData,
): Promise<EstadoOrden> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const obraId = String(datos.get("obraId") ?? "");
  const ordenId = String(datos.get("ordenId") ?? "");
  if (!obraId || !ordenId) return { error: "Falta la orden a aprobar." };

  const resultado = await aprobarOrden(sesion, ordenId);
  if (!resultado.ok) return { error: resultado.error };

  // El comprometido cambia, y con el lo que muestra la obra.
  revalidatePath(`/obras/${obraId}`);
  revalidatePath(`/obras/${obraId}/ordenes`);
  redirect(`/obras/${obraId}/ordenes?aprobada=${encodeURIComponent(resultado.numero)}`);
}

export async function accionAnularOrden(
  _previo: EstadoOrden,
  datos: FormData,
): Promise<EstadoOrden> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const obraId = String(datos.get("obraId") ?? "");
  const ordenId = String(datos.get("ordenId") ?? "");
  const motivo = String(datos.get("motivo") ?? "");
  if (!obraId || !ordenId) return { error: "Falta la orden a anular." };

  const resultado = await anularOrden(sesion, ordenId, motivo);
  if (!resultado.ok) return { error: resultado.error };

  revalidatePath(`/obras/${obraId}`);
  revalidatePath(`/obras/${obraId}/ordenes`);
  redirect(`/obras/${obraId}/ordenes?anulada=${encodeURIComponent(resultado.numero)}`);
}

/**
 * Borra una orden. Solo borradores y anuladas; el servicio rechaza las
 * aprobadas y decide el permiso segun el estado.
 *
 * Se revalida tambien la obra porque el panel cuenta ordenes por partida,
 * aunque el comprometido no cambie: ni un borrador ni una anulada contaban.
 */
export async function accionEliminarOrden(
  _previo: EstadoOrden,
  datos: FormData,
): Promise<EstadoOrden> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const obraId = String(datos.get("obraId") ?? "");
  const ordenId = String(datos.get("ordenId") ?? "");
  if (!obraId || !ordenId) return { error: "Falta la orden a eliminar." };

  const resultado = await eliminarOrden(sesion, ordenId);
  if (!resultado.ok) return { error: resultado.error };

  revalidatePath(`/obras/${obraId}`);
  revalidatePath(`/obras/${obraId}/ordenes`);
  redirect(
    `/obras/${obraId}/ordenes?eliminada=${encodeURIComponent(resultado.numero)}`,
  );
}
