"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import {
  cambiarEstadoFormaPago,
  guardarFormaPago,
} from "@/services/formas-pago.service";

/**
 * Alta, edicion y baja logica de las formas de pago reutilizables.
 *
 * Se invalida tambien la ruta de alta de ordenes: es donde se usan, y una
 * plantilla nueva que no aparece en el desplegable hasta recargar a mano
 * parece que no se guardo.
 */

export interface EstadoFormaPago {
  error?: string;
}

export async function accionGuardarFormaPago(
  _previo: EstadoFormaPago,
  datos: FormData,
): Promise<EstadoFormaPago> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const formaPagoId = String(datos.get("formaPagoId") ?? "").trim();

  const resultado = await guardarFormaPago(
    sesion,
    {
      nombre: String(datos.get("nombre") ?? ""),
      texto: String(datos.get("texto") ?? ""),
    },
    formaPagoId || undefined,
  );

  if (!resultado.ok) return { error: resultado.error };

  revalidatePath("/empresa/formas-pago");
  revalidatePath("/obras", "layout");
  redirect("/empresa/formas-pago?guardada=1");
}

export async function accionCambiarEstadoFormaPago(
  _previo: EstadoFormaPago,
  datos: FormData,
): Promise<EstadoFormaPago> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const formaPagoId = String(datos.get("formaPagoId") ?? "").trim();
  const activa = String(datos.get("activa") ?? "") === "true";
  if (!formaPagoId) return { error: "Falta la forma de pago." };

  const resultado = await cambiarEstadoFormaPago(sesion, formaPagoId, activa);
  if (!resultado.ok) return { error: resultado.error };

  revalidatePath("/empresa/formas-pago");
  revalidatePath("/obras", "layout");
  redirect(`/empresa/formas-pago?estado=${activa ? "activada" : "desactivada"}`);
}
