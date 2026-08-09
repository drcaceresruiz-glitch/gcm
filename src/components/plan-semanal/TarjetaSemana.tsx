import Link from "next/link";
import type { SemanaResumen } from "@/services/plan-semanal.service";
import { fechaCorta } from "@/utils/fechas";

/**
 * Una semana en la lista: nº, corte, estado y su PPC, con color segun el nivel.
 * Enlaza a la pantalla de planificar/cerrar.
 */
export function TarjetaSemana({
  obraId,
  semana,
}: {
  obraId: string;
  semana: SemanaResumen;
}) {
  const cerrada = semana.estado === "CERRADO";
  const colorPpc =
    semana.ppc === null
      ? "var(--texto)"
      : semana.ppc >= 80
        ? "var(--color-exito)"
        : semana.ppc >= 50
          ? "var(--color-alerta)"
          : "var(--color-peligro)";
  const tinte = cerrada ? "var(--color-exito)" : "var(--color-marca-600)";

  return (
    <Link
      href={`/obras/${obraId}/plan-semanal/${semana.id}`}
      className="block rounded-xl border p-4 transition-shadow hover:shadow-md"
      style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Semana {semana.numero}</p>
          <p className="text-xs opacity-60">Corte {fechaCorta(semana.fechaCorte)}</p>
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-xs font-medium"
          style={{ color: tinte, backgroundColor: `color-mix(in oklab, ${tinte} 15%, transparent)` }}
        >
          {cerrada ? "Cerrada" : "Abierta"}
        </span>
      </div>
      <div className="mt-3 flex items-end justify-between">
        <span className="text-xs opacity-70">
          {semana.cumplidos}/{semana.total} cumplidos
        </span>
        <span className="text-2xl font-bold tabular-nums" style={{ color: colorPpc }}>
          {semana.ppc === null ? "—" : `${semana.ppc.toFixed(0)}%`}
        </span>
      </div>
    </Link>
  );
}
