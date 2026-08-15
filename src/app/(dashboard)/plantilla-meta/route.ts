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
export async function GET() {
  const sesion = await obtenerSesion();
  if (!sesion) return new Response("No autorizado", { status: 401 });
  if (!puede(sesion, "meta:leer")) {
    return new Response("No autorizado", { status: 403 });
  }

  const buffer = await generarPlantillaMeta();

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
