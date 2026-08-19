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
import { importarProveedores } from "@/services/proveedores-excel.service";
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
    tipoImpuesto: texto("tipoImpuesto"),
    cuentaBancaria: texto("cuentaBancaria"),
    cci: texto("cci"),
    cuentaDetraccion: texto("cuentaDetraccion"),
    rol: texto("rol"),
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

  // Con su empresa: el cupo se cuenta por constructora, ademas del techo de
  // toda la instalacion. Ver `sunat.service`.
  return consultarRuc(ruc, sesion.companyId);
}

export interface EstadoImportacion {
  error?: string;
  resumen?: {
    creados: number;
    completados: number;
    sinCambios: number;
    rechazos: { fila: number; motivo: string }[];
  };
}

/**
 * Sube el Excel del catalogo.
 *
 * La accion no decide nada: comprueba que llego un archivo y pasa el resto al
 * servicio, que es donde viven el permiso, la lectura y —lo que importa— la
 * regla de rellenar huecos sin pisar nada.
 */
export async function accionImportarProveedores(
  _previo: EstadoImportacion,
  datos: FormData,
): Promise<EstadoImportacion> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const archivo = datos.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { error: "No llegó ningún archivo." };
  }

  const r = await importarProveedores(sesion, archivo);
  if (!r.ok) return { error: r.error };

  revalidatePath("/empresa/proveedores");
  return { resumen: r.resumen };
}

/**
 * Alta de proveedor SIN salir de donde estabas.
 *
 * Existe aparte de `accionGuardarProveedor` por una razon concreta: aquella
 * termina en `redirect`, y un redirect desde el formulario de un encargo se
 * llevaria por delante el frente que se estaba armando —las partidas
 * marcadas, las fracciones, el monto—. Esta devuelve el proveedor creado para
 * que quien la llamo lo meta en su desplegable y siga.
 *
 * Pide los mismos minimos que el alta normal (razon social y RUC) y pasa por
 * el MISMO `crearProveedor`, asi que hereda su validacion, su comprobacion de
 * RUC repetido —con el nombre de quien lo tiene— y su apunte en auditoria. No
 * es una puerta trasera: es la misma puerta sin el redirect.
 */
export type AltaRapida =
  | { ok: true; proveedor: { id: string; razonSocial: string; ruc: string } }
  | { ok: false; error: string };

export async function accionCrearProveedorEnLinea(datos: {
  ruc: string;
  razonSocial: string;
  rol: string;
  contactoNombre?: string;
  contactoTelefono?: string;
  email?: string;
}): Promise<AltaRapida> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const campos: DatosProveedor = {
    razonSocial: datos.razonSocial.trim(),
    ruc: datos.ruc.trim(),
    contactoNombre: datos.contactoNombre?.trim() ?? "",
    contactoTelefono: datos.contactoTelefono?.trim() ?? "",
    email: datos.email?.trim() ?? "",
    rol: datos.rol,
  };

  const resultado = await crearProveedor(sesion, campos);
  if (!resultado.ok) return { ok: false, error: resultado.error };

  // El catalogo de empresa tambien lo tiene que ver, no solo esta pantalla.
  revalidatePath("/empresa/proveedores");

  return {
    ok: true,
    proveedor: {
      id: resultado.id,
      razonSocial: campos.razonSocial,
      ruc: campos.ruc,
    },
  };
}
