import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  FileClock,
  FileSpreadsheet,
  Lock,
  MapPin,
  Table2,
} from "lucide-react";
import { obtenerSesion } from "@/services/sesion.service";
import { obtenerObra, listarPartidas } from "@/services/obras.service";
import { puede } from "@/lib/rbac";
import { soles } from "@/utils/formato";
import { fechaCorta } from "@/utils/fechas";
import { TablaPartidas } from "@/components/partidas/TablaPartidas";

export const metadata: Metadata = { title: "Obra" };

export default async function ObraPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ importadas?: string }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const { id } = await params;
  const obra = await obtenerObra(sesion, id);
  if (!obra) notFound();

  const { filas, totalPartidas, montoTotal } = await listarPartidas(sesion, id);
  const { importadas } = await searchParams;
  const puedeImportar = puede(sesion.role, "partida:importar");

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/panel"
          className="inline-flex items-center gap-1.5 text-sm opacity-70 hover:opacity-100"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Volver al panel
        </Link>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium opacity-60">
              {obra.codigoObra ?? "Sin codigo"}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-balance">
              {obra.nombreObra}
            </h1>

            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm opacity-70">
              {obra.ubicacion && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                  {obra.ubicacion}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-3.5 shrink-0" aria-hidden="true" />
                {fechaCorta(obra.fechaInicio)} &ndash;{" "}
                {fechaCorta(obra.fechaFinProgramada)}
              </span>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {puede(sesion.role, "linea_base:leer") && (
              <Link
                href={`/obras/${id}/revisiones`}
                className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium"
                style={{ borderColor: "var(--borde)" }}
              >
                <FileClock className="size-4" aria-hidden="true" />
                Revisiones y resumen
              </Link>
            )}

            {puedeImportar && obra.lineaBaseVersion === null && (
              <Link
                href={`/obras/${id}/importar`}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
                style={{ backgroundColor: "var(--color-marca-600)" }}
              >
                <FileSpreadsheet className="size-4" aria-hidden="true" />
                Importar desde Excel
              </Link>
            )}
          </div>
        </div>
      </div>

      {importadas && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm"
          style={{
            backgroundColor: "color-mix(in oklab, var(--color-exito) 15%, transparent)",
          }}
        >
          <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
          Presupuesto cargado: {importadas} partidas.
        </p>
      )}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {/* No es «el presupuesto»: es la suma de las partidas, antes de
            gastos generales y utilidad. El presupuesto de control sale de
            la cascada y vive en la pantalla de revisiones. Llamar
            «Presupuesto» a las dos cifras invita a citar la que no es. */}
        <Tarjeta etiqueta="Subtotal de partidas" valor={soles(montoTotal)} destacado />
        <Tarjeta etiqueta="Partidas" valor={String(totalPartidas)} />
        <Tarjeta
          etiqueta="Linea base"
          valor={
            obra.lineaBaseVersion !== null
              ? `v${obra.lineaBaseVersion} congelada`
              : "Sin congelar"
          }
        />
      </dl>

      {obra.lineaBaseVersion !== null && (
        <p className="flex items-center gap-2 text-sm opacity-70">
          <Lock className="size-4 shrink-0" aria-hidden="true" />
          El presupuesto contractual esta congelado. Los cambios se registran
          como adicionales.
        </p>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold">Presupuesto por partidas</h2>

        {filas.length === 0 ? (
          <div
            className="rounded-xl border border-dashed p-10 text-center"
            style={{ borderColor: "var(--borde)" }}
          >
            <Table2 className="mx-auto size-8 opacity-40" aria-hidden="true" />
            <p className="mt-3 text-sm opacity-70">
              Esta obra aun no tiene partidas.
            </p>
            {puedeImportar && (
              <Link
                href={`/obras/${id}/importar`}
                className="mt-4 inline-flex items-center gap-2 text-sm font-medium underline"
              >
                Cargar el presupuesto desde Excel
              </Link>
            )}
          </div>
        ) : (
          <TablaPartidas
            obraId={id}
            filas={filas}
            // Un presupuesto congelado no se edita: los indicadores se
            // calculan contra el y cambiarlo los invalidaria hacia atras.
            editable={puede(sesion.role, "partida:editar") && obra.lineaBaseVersion === null}
          />
        )}
      </section>
    </div>
  );
}

function Tarjeta({
  etiqueta,
  valor,
  destacado,
}: {
  etiqueta: string;
  valor: string;
  destacado?: boolean;
}) {
  return (
    <div
      className="rounded-xl border p-4"
      style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
    >
      <dt className="text-xs opacity-60">{etiqueta}</dt>
      <dd
        className={`mt-1 tabular-nums ${destacado ? "text-xl font-semibold" : "text-base font-medium"}`}
      >
        {valor}
      </dd>
    </div>
  );
}
