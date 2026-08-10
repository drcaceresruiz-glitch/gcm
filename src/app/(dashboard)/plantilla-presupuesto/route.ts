import { obtenerSesion } from "@/services/sesion.service";
import { generarPlantillaPresupuesto } from "@/lib/plantilla-presupuesto";

/**
 * Descarga de la plantilla de presupuesto.
 *
 * Se genera al vuelo en cada peticion en vez de servir un archivo de
 * `public/`: asi la plantilla sale SIEMPRE del mismo codigo que el test de
 * ida y vuelta valida contra el importador, y no existe una copia estatica
 * que pueda quedarse vieja.
 *
 * Con sesion, como todo lo del area privada. La plantilla no tiene datos
 * sensibles, pero una puerta publica mas es una puerta publica mas.
 */
export async function GET() {
  const sesion = await obtenerSesion();
  if (!sesion) return new Response("No autorizado", { status: 401 });

  const buffer = await generarPlantillaPresupuesto();

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        'attachment; filename="plantilla-presupuesto-gcm.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
