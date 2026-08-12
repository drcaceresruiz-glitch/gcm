import { obtenerSesion } from "@/services/sesion.service";
import { obtenerObra } from "@/services/obras.service";
import { obtenerEmpresa } from "@/services/empresa.service";
import { datosCurvaS, informeAlCorte } from "@/services/cronograma.service";
import { lastPlannerAlCorte } from "@/services/plan-semanal.service";
import {
  agruparPorCapitulo,
  alertasDeAtraso,
  partidasActivas,
} from "@/lib/control-avance";
import { generarCsv } from "@/lib/csv";
import { filasDelInformeCsv, nombreArchivoInformeCsv } from "@/lib/informe-csv";
import { puede } from "@/lib/rbac";

/**
 * El informe al corte, en hoja de calculo.
 *
 * Misma fecha, mismos datos y mismo permiso que la pagina que lo imprime: el
 * `?corte=` de la URL es el de la pantalla, asi que el archivo descargado dice
 * exactamente lo que se estaba mirando. Es la razon de que aqui se repita la
 * composicion de la pagina en vez de resumirla: si el archivo se armara con
 * menos datos, contrastar el papel con la hoja dejaria de ser posible, que es
 * justo para lo que se descarga.
 *
 * Se genera al vuelo, sin guardar nada. Un informe no es un documento que se
 * archive aqui: es una foto de la obra a una fecha, y esa foto se puede volver
 * a tomar igual siempre que se pida la misma fecha.
 */
export async function GET(
  peticion: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const sesion = await obtenerSesion();
  if (!sesion) return new Response("No autorizado", { status: 401 });

  const { id } = await params;

  // `obtenerObra` es la puerta de la empresa: sin esto, un id de otra compania
  // pasaria a los servicios de abajo.
  const obra = await obtenerObra(sesion, id);
  if (!obra) return new Response("No encontrada", { status: 404 });

  if (!puede(sesion, "cronograma:leer")) {
    return new Response("Sin permiso", { status: 403 });
  }

  const corte = new URL(peticion.url).searchParams.get("corte") ?? undefined;

  const [informe, curva, empresa] = await Promise.all([
    informeAlCorte(sesion, id, corte),
    datosCurvaS(sesion, id),
    obtenerEmpresa(sesion),
  ]);

  if (!informe) {
    return new Response("La obra no tiene cronograma", { status: 404 });
  }

  // La fecha la decide el servicio —una `?corte=` invalida o futura cae al
  // ultimo corte real—, asi que el Last Planner se pide DESPUES, con la fecha
  // que gano. Igual que en la pagina.
  const lastPlanner = await lastPlannerAlCorte(sesion, id, informe.fechaCorte);

  const csv = generarCsv(
    filasDelInformeCsv(
      {
        empresa: empresa?.razonSocial ?? "",
        obra: obra.nombreObra,
        ubicacion: obra.ubicacion,
        fechaCorte: informe.fechaCorte,
        version: informe.version,
        importadoPor: informe.importadoPor,
        planeadoProject: informe.planeadoProject,
        realProject: informe.realProject,
        real: informe.real,
        planeado: informe.planeado,
        desviacion: informe.desviacion,
        periodo: informe.periodo,
        curva,
        capitulos: agruparPorCapitulo(informe.tareas),
        alertas: alertasDeAtraso(informe.tareas, informe.fechaCorte),
        activas: partidasActivas(informe.tareas, informe.fechaCorte),
        lastPlanner,
        generadoPor: `${sesion.nombres} ${sesion.apellidos}`.trim(),
      },
      new Date(),
    ),
  );

  const nombre = nombreArchivoInformeCsv(obra.nombreObra, informe.fechaCorte);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "no-store",
    },
  });
}
