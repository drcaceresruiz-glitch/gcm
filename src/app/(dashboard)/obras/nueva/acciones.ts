"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import { crearObra } from "@/services/obras.service";

/**
 * Alta de obras.
 *
 * Aqui solo se lee el formulario; las reglas —nombre obligatorio, fechas
 * coherentes, codigo no repetido dentro de la empresa— viven en el servicio,
 * que es quien tambien saca el `companyId` de la sesion.
 */

export interface EstadoObra {
  error?: string;
}

export async function accionCrearObra(
  _previo: EstadoObra,
  datos: FormData,
): Promise<EstadoObra> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const texto = (campo: string) => String(datos.get(campo) ?? "").trim();

  const resultado = await crearObra(sesion, {
    nombreObra: texto("nombreObra"),
    codigoObra: texto("codigoObra") || undefined,
    ubicacion: texto("ubicacion") || undefined,
    cliente: texto("cliente") || undefined,
    fechaInicio: texto("fechaInicio"),
    fechaFinProgramada: texto("fechaFinProgramada"),
    estado: texto("estado") || undefined,
  });

  if (!resultado.ok) return { error: resultado.error };

  revalidatePath("/panel");

  // A la obra recien creada, que esta vacia: lo siguiente es cargarle el
  // presupuesto, y es donde vive el importador.
  redirect(`/obras/${resultado.id}`);
}
