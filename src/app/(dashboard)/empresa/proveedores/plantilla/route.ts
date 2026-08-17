import { obtenerSesion } from "@/services/sesion.service";
import { puede } from "@/lib/rbac";
import { generarPlantillaProveedores } from "@/services/proveedores-excel.service";

/**
 * La plantilla del catalogo, en blanco.
 *
 * Ruta y no accion de servidor porque es una DESCARGA: el navegador la resuelve
 * solo con un enlace, sin JavaScript.
 *
 * Sus columnas salen de `lib/proveedores-excel`, la misma lista que se usa al
 * leer el archivo. Anadir un campo alli lo pone aqui sin tocar nada.
 */
export async function GET() {
  const sesion = await obtenerSesion();
  if (!sesion) return new Response("No autorizado", { status: 401 });

  // Se pide el permiso de CREAR y no el de leer: esta plantilla existe para dar
  // de alta, y quien solo puede consultar el catalogo no la necesita.
  if (!puede(sesion, "proveedor:crear")) {
    return new Response("Sin permiso", { status: 403 });
  }

  const libro = await generarPlantillaProveedores();

  return new Response(libro, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="proveedores-gcm.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
