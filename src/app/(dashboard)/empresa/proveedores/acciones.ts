"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import {
  cambiarEstadoProveedor,
  crearProveedor,
  editarProveedor,
  type DatosProveedor,
} from "@/services/proveedores.service";
import { consultarRuc, type ConsultaRuc } from "@/services/sunat.service";
import { puede } from "@/lib/rbac";

/**
 * Alta, edicion y baja logica de proveedores.
 *
 * El formulario es la via principal y siempre esta disponible. Cuando llegue
 * la carga por archivo, entrara por el mismo servicio y topara con la misma
 * clave unica de RUC: por eso el importador tendra que ensenar lo que ya
 * existe en vez de insertarlo otra vez.
 */

export interface EstadoProveedor {
  error?: string;
}

function leerDatos(datos: FormData): DatosProveedor {
  const texto = (campo: string) => String(datos.get(campo) ?? "").trim();

  return {
    razonSocial: texto("razonSocial"),
    ruc: texto("ruc"),
    contactoNombre: texto("contactoNombre"),
    contactoTelefono: texto("contactoTelefono"),
    email: texto("email"),
    banco: texto("banco"),
    tipoCuenta: texto("tipoCuenta"),
    monedaCuenta: texto("monedaCuenta"),
    cuentaBancaria: texto("cuentaBancaria"),
    cci: texto("cci"),
  };
}

export async function accionGuardarProveedor(
  _previo: EstadoProveedor,
  datos: FormData,
): Promise<EstadoProveedor> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const proveedorId = String(datos.get("proveedorId") ?? "").trim();
  const campos = leerDatos(datos);

  const resultado = proveedorId
    ? await editarProveedor(sesion, proveedorId, campos)
    : await crearProveedor(sesion, campos);

  if (!resultado.ok) return { error: resultado.error };

  revalidatePath("/empresa/proveedores");
  redirect(
    `/empresa/proveedores?guardado=${encodeURIComponent(campos.razonSocial)}`,
  );
}

export async function accionCambiarEstadoProveedor(
  _previo: EstadoProveedor,
  datos: FormData,
): Promise<EstadoProveedor> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const proveedorId = String(datos.get("proveedorId") ?? "").trim();
  const activo = String(datos.get("activo") ?? "") === "true";
  if (!proveedorId) return { error: "Falta el proveedor." };

  const resultado = await cambiarEstadoProveedor(sesion, proveedorId, activo);
  if (!resultado.ok) return { error: resultado.error };

  revalidatePath("/empresa/proveedores");
  redirect(`/empresa/proveedores?estado=${activo ? "activado" : "desactivado"}`);
}

/**
 * Consulta el RUC en SUNAT para rellenar la razon social.
 *
 * Va detras del permiso de crear proveedores, no abierta: es una peticion a
 * un servicio externo con cuota, y sin comprobar quien la hace cualquiera con
 * sesion podria gastarla entera.
 *
 * Nunca lanza. Devuelve siempre algo que la pantalla sabe enseñar, porque
 * dar de alta un proveedor no puede depender de que SUNAT conteste.
 */
export async function accionConsultarRuc(ruc: string): Promise<ConsultaRuc> {
  const sesion = await obtenerSesion();
  if (!sesion) {
    return { ok: false, motivo: "fallo", detalle: "Sesion caducada." };
  }

  if (!puede(sesion, "proveedor:crear") && !puede(sesion, "proveedor:editar")) {
    return {
      ok: false,
      motivo: "fallo",
      detalle: "No tienes permiso para consultar el RUC.",
    };
  }

  return consultarRuc(ruc);
}
