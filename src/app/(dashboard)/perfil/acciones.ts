"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import {
  guardarCelular,
  guardarFotoPerfil,
  solicitarCambio,
  cancelarSolicitud,
  cambiarDosFactores,
  cambiarCanal2FA,
  verificarCelularPedirCodigo,
  verificarCelularConfirmar,
} from "@/services/perfil.service";
import { CAMPOS_CONTROLADOS } from "@/lib/perfil";

export interface EstadoPerfil {
  error?: string;
  ok?: string;
}

/** El unico campo libre: se guarda al instante, sin aprobacion. */
export async function accionGuardarCelular(
  _previo: EstadoPerfil,
  datos: FormData,
): Promise<EstadoPerfil> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const resultado = await guardarCelular(sesion, String(datos.get("celular") ?? ""));
  if (!resultado.ok) return { error: resultado.error };

  revalidatePath("/perfil");
  return { ok: "Teléfono guardado." };
}

/**
 * Pide el codigo que comprueba que el celular guardado es suyo.
 *
 * Sin parametros: el numero sale de la sesion, no del formulario, y el estado
 * previo no hace falta. `useActionState` la llama igual con dos argumentos y
 * JavaScript los descarta.
 */
export async function accionVerificarCelularPedir(): Promise<EstadoPerfil> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const resultado = await verificarCelularPedirCodigo(sesion);
  if (!resultado.ok) return { error: resultado.error };

  revalidatePath("/perfil");
  return { ok: "Te mandamos un código por SMS. Escríbelo aquí abajo." };
}

/** Comprueba el codigo y da el celular por verificado. */
export async function accionVerificarCelularConfirmar(
  _previo: EstadoPerfil,
  datos: FormData,
): Promise<EstadoPerfil> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const resultado = await verificarCelularConfirmar(
    sesion,
    String(datos.get("codigo") ?? ""),
  );
  if (!resultado.ok) return { error: resultado.error };

  revalidatePath("/perfil");
  return { ok: "Celular verificado. Ya puedes recibir los códigos por SMS." };
}

/** Elige por donde llega el codigo de acceso: correo o SMS. */
export async function accionCambiarCanal2FA(
  _previo: EstadoPerfil,
  datos: FormData,
): Promise<EstadoPerfil> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const canal = datos.get("canal") === "SMS" ? "SMS" : "CORREO";

  const resultado = await cambiarCanal2FA(sesion, canal);
  if (!resultado.ok) return { error: resultado.error };

  revalidatePath("/perfil");
  return {
    ok:
      canal === "SMS"
        ? "Desde ahora tu código llegará por SMS."
        : "Desde ahora tu código llegará por correo.",
  };
}

/** Guarda o quita la foto de perfil. Libre, sin aprobacion. */
export async function accionGuardarFoto(
  _previo: EstadoPerfil,
  datos: FormData,
): Promise<EstadoPerfil> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  // Cadena vacia = quitar la foto.
  const foto = String(datos.get("foto") ?? "");
  const resultado = await guardarFotoPerfil(sesion, foto === "" ? null : foto);
  if (!resultado.ok) return { error: resultado.error };

  revalidatePath("/perfil");
  return { ok: foto === "" ? "Foto quitada." : "Foto actualizada." };
}

/** Enciende o apaga la verificacion en dos pasos. Libre, sin aprobacion. */
export async function accionCambiarDosFactores(
  _previo: EstadoPerfil,
  datos: FormData,
): Promise<EstadoPerfil> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const activo = datos.get("activo") === "si";

  const resultado = await cambiarDosFactores(sesion, activo);
  if (!resultado.ok) return { error: resultado.error };

  revalidatePath("/perfil");
  return {
    ok: activo
      ? "Verificacion en dos pasos activada. La proxima vez que entres te pediremos un codigo."
      : "Verificacion en dos pasos desactivada.",
  };
}

/** Pide cambiar los datos controlados. Queda pendiente de aprobacion. */
export async function accionSolicitarCambio(
  _previo: EstadoPerfil,
  datos: FormData,
): Promise<EstadoPerfil> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const texto = (campo: string) => String(datos.get(campo) ?? "");

  // La propuesta lleva los cinco campos controlados; el servicio se queda
  // solo con los que de verdad cambian.
  const propuesta = Object.fromEntries(
    CAMPOS_CONTROLADOS.map((c) => [c, texto(c)]),
  ) as Record<(typeof CAMPOS_CONTROLADOS)[number], string>;

  const resultado = await solicitarCambio(sesion, propuesta, texto("motivo"));
  if (!resultado.ok) return { error: resultado.error };

  revalidatePath("/perfil");
  return { ok: "Solicitud enviada. Un administrador la revisara." };
}

/** Retira la solicitud pendiente propia. */
export async function accionCancelarSolicitud(
  _previo: EstadoPerfil,
  datos: FormData,
): Promise<EstadoPerfil> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const resultado = await cancelarSolicitud(sesion, String(datos.get("id") ?? ""));
  if (!resultado.ok) return { error: resultado.error };

  revalidatePath("/perfil");
  return { ok: "Solicitud retirada." };
}
