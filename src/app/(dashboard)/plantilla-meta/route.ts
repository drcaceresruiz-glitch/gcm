import { obtenerSesion } from "@/services/sesion.service";
import { puede } from "@/lib/rbac";
import { generarPlantillaMeta } from "@/lib/plantilla-meta";

/**
 * Descarga de la plantilla del presupuesto meta.
 *
 * Se genera al vuelo, como la del presupuesto: asi sale SIEMPRE del mismo
 * codigo que el test de ida y vuelta valida contra los dos importadores, y no
 * hay una copia estatica en `public/` que pueda quedarse vieja.
 *
 * Pide `meta:leer` y no solo sesion, al contrario que la del presupuesto. El
 * archivo no lleva ni un dato de la empresa —son ejemplos inventados— pero su
 * hoja de instrucciones explica como se calcula la bolsa y que la utilidad se
 * deja fuera. A quien no puede ver el margen no se le entrega el manual de
 * como se construye.
 */
export async function GET(peticion: Request) {
  const sesion = await obtenerSesion();
  if (!sesion) return new Response("No autorizado", { status: 401 });
  if (!puede(sesion, "meta:leer")) {
    return new Response("No autorizado", { status: 403 });
  }

  /**
   * El plazo de la obra viaja por la URL. La ruta es generica —no cuelga de
   * una obra— porque la plantilla no lleva ni un dato de la empresa; lo unico
   * que necesita es cuantos meses dura, para que los ejemplos no propongan
   * ocho meses en una obra de trece dias.
   */
  const pedido = new URL(peticion.url).searchParams.get("meses");
  const meses = pedido === null ? null : Number(pedido);
  const buffer = await generarPlantillaMeta(
    meses !== null && Number.isFinite(meses) && meses > 0 ? meses : null,
  );

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        'attachment; filename="plantilla-presupuesto-meta-gcm.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
