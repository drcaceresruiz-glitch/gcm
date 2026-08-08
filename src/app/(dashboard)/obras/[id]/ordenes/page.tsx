import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2, Plus } from "lucide-react";
import { obtenerSesion } from "@/services/sesion.service";
import { obtenerObra } from "@/services/obras.service";
import { listarOrdenes, obtenerComprometido } from "@/services/ordenes.service";
import {
  obtenerPresupuestoVigente,
  SinLineaBaseError,
  type PresupuestoVigente,
} from "@/services/movimientos.service";
import { puede } from "@/lib/rbac";
import { Paginacion } from "@/components/ui/Paginacion";
import { PanelComprometido } from "@/components/ordenes/PanelComprometido";
import { HistorialOrdenes } from "@/components/ordenes/HistorialOrdenes";

export const metadata: Metadata = { title: "Ordenes de compra" };

/**
 * Las ordenes de la obra y lo que llevan comprometido.
 *
 * El comprometido solo significa algo puesto al lado de lo que hay: por eso
 * se cruza con el presupuesto vigente de cada partida. Si la obra todavia no
 * tiene linea base aprobada, se ensenan las ordenes igual —pedir a un
 * proveedor no exige tener el presupuesto congelado— pero sin la comparacion,
 * porque no habria contra que comparar.
 */

export default async function OrdenesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    creada?: string;
    aprobada?: string;
    anulada?: string;
    p?: string;
  }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const { id } = await params;
  const obra = await obtenerObra(sesion, id);
  if (!obra) notFound();

  if (!puede(sesion, "orden:leer")) redirect(`/obras/${id}`);

  const consulta = await searchParams;
  const { creada, aprobada, anulada } = consulta;

  // El comprometido se calcula aparte y sobre TODAS las ordenes: paginar el
  // historial no puede cambiar la cifra de control de la obra.
  const [ordenes, comprometido] = await Promise.all([
    listarOrdenes(sesion, id, { pagina: consulta.p }),
    obtenerComprometido(sesion, id),
  ]);

  // Sin linea base no hay vigente contra el que comparar, y eso no impide
  // registrar ordenes: se muestran igual, sin la comparacion.
  let presupuesto: PresupuestoVigente | null = null;
  if (puede(sesion, "movimiento:leer")) {
    try {
      presupuesto = await obtenerPresupuestoVigente(sesion, id);
    } catch (error) {
      if (!(error instanceof SinLineaBaseError)) throw error;
    }
  }

  const avisos = [
    creada && `Orden ${creada} guardada como borrador. Todavia no cuenta en el comprometido: hay que aprobarla.`,
    aprobada && `Orden ${aprobada} aprobada. Ya cuenta en el comprometido.`,
    anulada && `Orden ${anulada} anulada. Deja de contar en el comprometido y se conserva con su motivo.`,
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h2 className="text-xl font-semibold tracking-tight">
          Ordenes de compra
        </h2>

        {puede(sesion, "orden:crear") && (
          <Link
            href={`/obras/${id}/ordenes/nueva`}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
            style={{ backgroundColor: "var(--color-marca-600)" }}
          >
            <Plus className="size-4" aria-hidden="true" />
            Registrar orden
          </Link>
        )}
      </div>

      {avisos.map((aviso) => (
        <p
          key={aviso}
          role="status"
          className="flex items-start gap-2 rounded-lg px-4 py-3 text-sm"
          style={{
            backgroundColor:
              "color-mix(in oklab, var(--color-exito) 15%, transparent)",
          }}
        >
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{aviso}</span>
        </p>
      ))}

      <PanelComprometido
        comprometido={comprometido}
        presupuesto={presupuesto}
        // El total de la obra, no el de la pagina: es la cifra que rotula el
        // panel de control y cambiaria al pasar de pagina.
        totalOrdenes={ordenes.total}
      />

      <HistorialOrdenes
        ordenes={ordenes.filas}
        obraId={id}
        puedeAprobar={puede(sesion, "orden:aprobar")}
        puedeAnular={puede(sesion, "orden:anular")}
      />

      <Paginacion
        pagina={ordenes.pagina}
        totalPaginas={ordenes.totalPaginas}
        total={ordenes.total}
        etiqueta="ordenes"
        // Sin los avisos de `?creada=` y compania: son de un solo uso, y
        // arrastrarlos haria que «Orden X guardada» reapareciera en cada
        // pagina que se visite despues.
        params={{}}
      />
    </div>
  );
}
