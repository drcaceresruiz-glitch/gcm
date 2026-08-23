import { obtenerSesion } from "@/services/sesion.service";
import { puede } from "@/lib/rbac";
import { generarPlantillaCronograma } from "@/lib/plantilla-cronograma";
import { nombreDeArchivo } from "@/lib/nombre-archivo";
import { obtenerEmpresa } from "@/services/empresa.service";

/**
 * Descarga de la plantilla del cronograma.
 *
 * Se genera al vuelo, como las otras dos: sale SIEMPRE del mismo codigo que
 * el test de ida y vuelta valida contra el importador, y no hay una copia
 * estatica en `public/` que pueda quedarse vieja.
 *
 * Pide `cronograma:importar` y no solo sesion. El archivo no lleva ni un dato
 * de la empresa —los ejemplos son inventados— pero su hoja de instrucciones
 * explica que el avance de obra se ancla al ID y que renumerarlo lo pega a
 * otra partida. Es la mecanica que solo necesita quien va a cargar un plan.
 */
export async function GET() {
  const sesion = await obtenerSesion();
  if (!sesion) return new Response("No autorizado", { status: 401 });
  if (!puede(sesion, "cronograma:importar")) {
    return new Response("No autorizado", { status: 403 });
  }

  const buffer = await generarPlantillaCronograma();

  // Esta es la plantilla EN BLANCO, no la de una obra concreta -esa sale de
  // `/obras/[id]/cronograma/plantilla`, ya con su EDT dentro-. Se nombra por
  // la empresa porque no pertenece a ninguna obra.
  const empresa = await obtenerEmpresa(sesion);
  const nombre = nombreDeArchivo({
    ambito: empresa?.razonSocial ?? "plantilla",
    documento: "cronograma-en-blanco",
    extension: "xlsx",
  });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "no-store",
    },
  });
}
