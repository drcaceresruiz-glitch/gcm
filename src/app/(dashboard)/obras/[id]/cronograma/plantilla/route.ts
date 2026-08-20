import { obtenerSesion } from "@/services/sesion.service";
import { plantillaCronogramaDeObra } from "@/services/plantilla-cronograma.service";

/**
 * La plantilla del cronograma CON la EDT de esta obra ya escrita.
 *
 * Hermana de `/plantilla-cronograma`, que sigue existiendo para las obras sin
 * presupuesto: aquella ensena las convenciones con ejemplos inventados y esta
 * trae la estructura de verdad, sin fechas.
 *
 * El permiso y el filtro por empresa los pone el servicio, que es la frontera.
 * Aqui solo se traduce a respuesta HTTP.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const sesion = await obtenerSesion();
  if (!sesion) return new Response("No autorizado", { status: 401 });

  const { id } = await params;
  const r = await plantillaCronogramaDeObra(sesion, id);

  // 409 y no 404: la obra existe y se alcanza; lo que falta es su presupuesto.
  // El texto va al cuerpo porque esto se abre en una pestana y es lo unico que
  // el usuario va a ver.
  if (!r.ok) return new Response(r.error, { status: 409 });

  return new Response(new Uint8Array(r.contenido), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${r.nombreArchivo}"`,
      // Lleva datos de la obra: que no se quede en ninguna cache intermedia.
      "Cache-Control": "no-store",
    },
  });
}
