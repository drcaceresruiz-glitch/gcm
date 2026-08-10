"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import { actualizarObra } from "@/services/obras.service";
import type { EstadoObra } from "@/app/(dashboard)/obras/nueva/acciones";

/**
 * Edicion de una obra.
 *
 * El `obraId` va ligado a la accion en el servidor (`.bind`), no en un campo
 * del formulario: asi no viaja como dato manipulable y el servicio siempre
 * edita la obra que la pagina cargo. Las reglas —nombre, fechas, codigo unico—
 * viven en el servicio, que ademas saca el `companyId` de la sesion.
 */
export async function accionEditarObra(
  obraId: string,
  _previo: EstadoObra,
  datos: FormData,
): Promise<EstadoObra> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const texto = (campo: string) => String(datos.get(campo) ?? "").trim();

  const resultado = await actualizarObra(sesion, obraId, {
    nombreObra: texto("nombreObra"),
    codigoObra: texto("codigoObra") || undefined,
    ubicacion: texto("ubicacion") || undefined,
    cliente: texto("cliente") || undefined,
    fechaInicio: texto("fechaInicio"),
    fechaFinProgramada: texto("fechaFinProgramada"),
  });

  if (!resultado.ok) return { error: resultado.error };

  // El plazo y los datos de la obra alimentan el panel y la ficha: se refrescan
  // ambos para que el cambio se vea al instante (dias restantes, calendario).
  revalidatePath("/panel");
  revalidatePath(`/obras/${obraId}`);

  redirect(`/obras/${obraId}`);
}
