import { obtenerSesion } from "@/services/sesion.service";
import { generarOrdenesExcel } from "@/services/ordenes-excel.service";

/**
 * Las ordenes de la obra en hoja de calculo.
 *
 * Los filtros llegan por la URL, los MISMOS nombres que usa la pantalla, para
 * que el boton de descargar solo tenga que copiar la consulta que ya esta en
 * la barra de direcciones: lo que se baja es lo que se esta mirando.
 *
 * `p` (la pagina) NO se lee a proposito: una exportacion paginada no le sirve
 * a nadie.
 */

export async function GET(
  peticion: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const sesion = await obtenerSesion();
  if (!sesion) return new Response("No autorizado", { status: 401 });

  const { id } = await params;
  const q = new URL(peticion.url).searchParams;

  const r = await generarOrdenesExcel(sesion, id, {
    q: q.get("q") ?? undefined,
    proveedorId: q.get("proveedor") ?? undefined,
    desde: q.get("desde") ?? undefined,
    hasta: q.get("hasta") ?? undefined,
    estado: q.get("estado") ?? undefined,
  });

  if (!r.ok) return new Response(r.error, { status: r.estado });

  return new Response(new Uint8Array(r.bytes), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${r.nombre}"`,
      "Cache-Control": "no-store",
    },
  });
}
