import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2, Lock } from "lucide-react";
import { obtenerSesion } from "@/services/sesion.service";
import { obtenerObra } from "@/services/obras.service";
import {
  obtenerCostoDirectoActual,
  obtenerResumen,
} from "@/services/revisiones.service";
import { puede } from "@/lib/rbac";
import { fraccionAPorcentaje } from "@/lib/presupuesto";
import { tipoCambio } from "@/utils/formato";
import { hoy } from "@/utils/fechas";
import { PanelResumen } from "@/components/revisiones/PanelResumen";
import { FormularioRevision } from "@/components/revisiones/FormularioRevision";

export const metadata: Metadata = { title: "Revisiones del presupuesto" };

/**
 * Revisiones del presupuesto y resumen de la obra.
 *
 * La pantalla responde a dos preguntas distintas y por eso son dos bloques:
 * «cuanto vale hoy esta obra» (el resumen, que ve todo el mundo) y «quiero
 * congelar una version nueva» (el formulario, solo para quien puede).
 */
export default async function RevisionesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ creada?: string; aprobada?: string }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const { id } = await params;
  const obra = await obtenerObra(sesion, id);
  if (!obra) notFound();

  if (!puede(sesion.role, "linea_base:leer")) redirect(`/obras/${id}`);

  const resumen = await obtenerResumen(sesion, id);
  const { creada, aprobada } = await searchParams;
  const puedeCrear = puede(sesion.role, "linea_base:crear");

  // Con la linea base ya aprobada, el presupuesto es un contrato firmado:
  // no se crean mas revisiones, los cambios van por adicionales. Se deja de
  // cargar el costo para no dibujar un formulario que el servicio rechazaria.
  const congelado = obra.lineaBaseVersion !== null;
  const costo =
    puedeCrear && !congelado
      ? await obtenerCostoDirectoActual(sesion, id)
      : null;

  /**
   * Una revision nueva casi siempre repite las condiciones de la anterior:
   * lo que cambia son las partidas, no el porcentaje de utilidad. Cuando no
   * hay ninguna previa solo se propone el IGV, que lo fija la ley; inventar
   * unos gastos generales seria ponerle cifras al contrato del cliente.
   */
  const ultima = resumen.revisiones[0] ?? null;
  const iniciales = {
    gastosGenerales: ultima
      ? fraccionAPorcentaje(ultima.porcentajes.gastosGenerales)
      : "",
    utilidad: ultima ? fraccionAPorcentaje(ultima.porcentajes.utilidad) : "",
    igv: ultima ? fraccionAPorcentaje(ultima.porcentajes.igv) : "18",
    tipoCambio: ultima?.tipoCambio ? tipoCambio(ultima.tipoCambio, "") : "",
    clausulas: ultima?.clausulas ?? "",
  };

  return (
    <div className="space-y-8">
      <div>
        <Link
          href={`/obras/${id}`}
          className="inline-flex items-center gap-1.5 text-sm opacity-70 hover:opacity-100"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Volver a la obra
        </Link>

        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          Revisiones del presupuesto
        </h1>
        <p className="mt-1 text-sm text-pretty opacity-70">{obra.nombreObra}</p>
      </div>

      {creada && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm"
          style={{
            backgroundColor:
              "color-mix(in oklab, var(--color-exito) 15%, transparent)",
          }}
        >
          <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
          Revision v{creada} creada.
        </p>
      )}

      {aprobada && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm"
          style={{
            backgroundColor:
              "color-mix(in oklab, var(--color-exito) 15%, transparent)",
          }}
        >
          <Lock className="size-4 shrink-0" aria-hidden="true" />
          Revision v{aprobada} aprobada. El presupuesto queda congelado y la
          obra ya no permite editar partidas.
        </p>
      )}

      <PanelResumen
        resumen={resumen}
        obraId={id}
        puedeAprobar={puede(sesion.role, "linea_base:aprobar")}
      />

      {costo && (
        <section
          className="border-t pt-8"
          style={{ borderColor: "var(--borde)" }}
        >
          <h2 className="text-lg font-semibold">Nueva revision</h2>
          <p className="mt-1 mb-5 max-w-2xl text-sm text-pretty opacity-70">
            Congela el presupuesto de hoy con sus porcentajes y su tipo de
            cambio. Los porcentajes se guardan en la revision, no en la obra:
            por eso una revision antigua sigue dando la misma cifra aunque
            despues cambien.
          </p>

          <FormularioRevision
            obraId={id}
            fechaHoy={hoy().toISOString().slice(0, 10)}
            costoDirecto={costo.costoDirecto}
            descuentos={costo.descuentos}
            totalPartidas={costo.totalPartidas}
            iniciales={iniciales}
            ultimaVersion={ultima?.version ?? null}
          />
        </section>
      )}

      {/* Quien puede crear pero la obra ya esta congelada: se explica por
          que no hay formulario, en vez de dejar un vacio desconcertante. */}
      {puedeCrear && congelado && (
        <section
          className="flex items-start gap-3 rounded-xl border p-5"
          style={{ borderColor: "var(--borde)" }}
        >
          <Lock className="mt-0.5 size-5 shrink-0 opacity-70" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-semibold">
              El presupuesto esta congelado
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-pretty opacity-70">
              La linea base v{obra.lineaBaseVersion} esta aprobada, asi que ya
              no se crean revisiones nuevas. Los cambios posteriores se
              registran como adicionales o reconversiones sobre ella, en{" "}
              <Link
                href={`/obras/${id}/movimientos`}
                className="font-medium underline"
              >
                movimientos presupuestales
              </Link>
              .
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
