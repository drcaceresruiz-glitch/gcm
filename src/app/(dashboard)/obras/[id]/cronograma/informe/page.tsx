import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import { obtenerObra } from "@/services/obras.service";
import { obtenerEmpresa } from "@/services/empresa.service";
import Link from "next/link";
import {
  datosCurvaS,
  informeAlCorte,
  type CorteDisponible,
} from "@/services/cronograma.service";
import { lastPlannerAlCorte } from "@/services/plan-semanal.service";
import { fechaCorta, hoy } from "@/utils/fechas";
import {
  agruparPorCapitulo,
  alertasDeAtraso,
  partidasActivas,
} from "@/lib/control-avance";
import { puede } from "@/lib/rbac";
import { Volver } from "@/components/ui/Volver";
import { BotonImprimir } from "@/components/cronograma/BotonImprimir";
import { InformeSemanal } from "@/components/cronograma/InformeSemanal";

export const metadata: Metadata = { title: "Informe semanal" };

/**
 * El informe semanal de obra, listo para imprimir o guardar como PDF.
 *
 * Todo se calcula en el servidor: la pagina no manda ni un byte de JavaScript
 * salvo el boton de imprimir, que ademas desaparece en el papel. Asi el
 * documento sale igual se imprima desde donde se imprima.
 */
export default async function InformePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ corte?: string }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const { id } = await params;
  const obra = await obtenerObra(sesion, id);
  if (!obra) notFound();

  if (!puede(sesion, "cronograma:leer")) redirect(`/obras/${id}`);

  const { corte } = await searchParams;

  const [informe, curva, empresa] = await Promise.all([
    informeAlCorte(sesion, id, corte),
    datosCurvaS(sesion, id),
    obtenerEmpresa(sesion),
  ]);

  // Sin cronograma no hay informe que dar: se devuelve a la pantalla que
  // explica como cargarlo, en vez de imprimir una hoja vacia.
  if (!informe) redirect(`/obras/${id}/cronograma`);

  // TODO el contenido se mide a la fecha elegida, no a la del ultimo XML
  // importado: las alertas, las partidas en marcha y los capitulos hablan de
  // ESA semana. Antes salian siempre del corte de la importacion, y por eso el
  // informe del 12 de agosto encabezaba «08 de agosto» y decia que no habia
  // ninguna partida en marcha.
  const capitulos = agruparPorCapitulo(informe.tareas);
  const alertas = alertasDeAtraso(informe.tareas, informe.fechaCorte);
  const activas = partidasActivas(informe.tareas, informe.fechaCorte);

  // El Last Planner de esa misma fecha. Va despues y no en el `Promise.all` de
  // arriba porque necesita la fecha que decide `informeAlCorte`: pedirlo antes
  // obligaria a resolver dos veces cual es el corte elegido.
  const lastPlanner = await lastPlannerAlCorte(sesion, id, informe.fechaCorte);

  return (
    <div className="space-y-4">
      {/* Todo este bloque desaparece al imprimir: el papel que recibe el
          cliente no puede salir con botones de navegacion encima. */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Volver href={`/obras/${id}/cronograma`}>Volver al cronograma</Volver>
        <BotonImprimir />
      </div>

      {/* El selector de semana. Enlaces y no un desplegable con JavaScript:
          esta pagina no manda ni un byte al cliente salvo el boton de
          imprimir, y no va a empezar ahora. */}
      <SelectorDeCorte
        obraId={id}
        cortes={informe.cortes}
        elegido={informe.fechaCorte}
        hoyIso={hoy().toISOString().slice(0, 10)}
      />

      <InformeSemanal
        datos={{
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
          capitulos,
          alertas,
          activas,
          lastPlanner,
          generadoPor: `${sesion.nombres} ${sesion.apellidos}`.trim(),
        }}
      />
    </div>
  );
}

/**
 * Elegir de que semana es el informe.
 *
 * Se ofrecen los dias de cierre que ya pasaron, rotulados con el numero de
 * semana del PTS cuando coinciden. Hasta ahora el informe solo sabia emitir
 * uno —el del ultimo XML—, asi que revisar lo que se entrego hace tres semanas
 * era imposible.
 */
function SelectorDeCorte({
  obraId,
  cortes,
  elegido,
  hoyIso,
}: {
  obraId: string;
  cortes: CorteDisponible[];
  elegido: Date;
  hoyIso: string;
}) {
  const elegidoIso = elegido.toISOString().slice(0, 10);
  if (cortes.length <= 1) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm print:hidden"
      style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
    >
      <span className="opacity-70">Informe al corte de:</span>

      {/* Cualquier dia, no solo los cortes. El informe se pide por motivos que
          no siguen el calendario del PTS —una visita del cliente, una
          valorizacion, un martes cualquiera— y con solo tres botones «informe
          al corte» era en realidad «informe de la semana».
          
          Es un formulario GET y no un desplegable con JavaScript: esta pagina
          no manda un solo byte al cliente salvo el boton de imprimir. */}
      <form method="get" className="flex items-center gap-1.5">
        <input
          type="date"
          name="corte"
          defaultValue={elegidoIso}
          max={hoyIso}
          className="rounded-lg border px-2 py-1 text-xs"
          style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
          aria-label="Fecha del informe"
        />
        <button
          type="submit"
          className="rounded-lg border px-2 py-1 text-xs font-medium"
          style={{ borderColor: "var(--borde)" }}
        >
          Ver
        </button>
      </form>

      {cortes.slice(0, 8).map((c) => {
        const activo = c.fecha.getTime() === elegido.getTime();
        return (
          <Link
            key={c.iso}
            href={`/obras/${obraId}/cronograma/informe?corte=${c.iso}`}
            className="rounded-lg border px-2.5 py-1 text-xs font-medium"
            style={{
              borderColor: activo ? "var(--color-marca-600)" : "var(--borde)",
              color: activo ? "var(--color-marca-600)" : undefined,
            }}
          >
            {c.semana !== null ? `Semana ${c.semana} · ` : ""}
            {fechaCorta(c.fecha)}
            {c.esUltimo ? " (hoy)" : ""}
          </Link>
        );
      })}
    </div>
  );
}
