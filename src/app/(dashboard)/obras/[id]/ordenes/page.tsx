import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2, Plus } from "lucide-react";
import { obtenerSesion } from "@/services/sesion.service";
import { obtenerObra } from "@/services/obras.service";
import {
  contarOrdenesDeObra,
  desgloseComprometidoDeObra,
  listarOrdenes,
  listarProveedoresConOrdenes,
  obtenerComprometido,
} from "@/services/ordenes.service";
import {
  obtenerPresupuestoVigente,
  SinLineaBaseError,
  type PresupuestoVigente,
} from "@/services/movimientos.service";
import { puede } from "@/lib/rbac";
import { Paginacion } from "@/components/ui/Paginacion";
import { PanelComprometido } from "@/components/ordenes/PanelComprometido";
import { FiltrosOrdenes } from "@/components/ordenes/FiltrosOrdenes";
import { HistorialOrdenes } from "@/components/ordenes/HistorialOrdenes";
import {
  AvisoSinEscritura,
  SiSePuedeEscribir,
} from "@/components/obras/EscrituraDeLaObra";

export const metadata: Metadata = { title: "Órdenes de compra" };

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
    eliminada?: string;
    p?: string;
    q?: string;
    proveedor?: string;
    desde?: string;
    hasta?: string;
    estado?: string;
  }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const { id } = await params;
  const obra = await obtenerObra(sesion, id);
  if (!obra) notFound();

  if (!puede(sesion, "orden:leer")) redirect(`/obras/${id}`);

  const consulta = await searchParams;
  const { creada, aprobada, anulada, eliminada } = consulta;

  // Los filtros vigentes, sin los avisos de un solo uso: son los que viajan
  // con la paginacion.
  const filtros = {
    q: consulta.q,
    proveedor: consulta.proveedor,
    desde: consulta.desde,
    hasta: consulta.hasta,
    estado: consulta.estado,
  };

  const hayFiltro = Object.values(filtros).some(Boolean);

  // El comprometido se calcula aparte y sobre la obra entera —encargos
  // vigentes mas ordenes sueltas aprobadas—: ni paginar ni filtrar el
  // historial pueden mover la cifra de control.
  const [ordenes, comprometido, desglose, proveedores, totalDeLaObra] =
    await Promise.all([
      listarOrdenes(sesion, id, {
        pagina: consulta.p,
        // De cinco en cinco: cada orden ocupa una tarjeta con su reparto, y
        // veinte de golpe dejan la pantalla imposible de recorrer.
        porPagina: 5,
        q: consulta.q,
        proveedorId: consulta.proveedor,
        desde: consulta.desde,
        hasta: consulta.hasta,
        estado: consulta.estado,
      }),
      obtenerComprometido(sesion, id),
      desgloseComprometidoDeObra(sesion, id),
      listarProveedoresConOrdenes(sesion, id),
      contarOrdenesDeObra(sesion, id),
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
    creada && `Orden ${creada} guardada como borrador. Todavía no cuenta en el comprometido: hay que aprobarla.`,
    aprobada && `Orden ${aprobada} aprobada. Si es suelta, ya cuenta en el comprometido; emitida contra un encargo, formaliza lo que el monto del encargo ya puso.`,
    anulada && `Orden ${anulada} anulada y conservada con su motivo. Si era suelta, deja de contar en el comprometido; contra un encargo, el compromiso del encargo sigue igual.`,
    eliminada && `Orden ${eliminada} eliminada. No contaba en el comprometido, así que ninguna cifra cambia.`,
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h2 className="text-xl font-semibold tracking-tight">
          Órdenes de compra
        </h2>

        {/* Una obra cerrada no admite ordenes nuevas: lo rechaza
            `crearOrden`. El motivo se explica una vez, aqui debajo. */}
        {puede(sesion, "orden:crear") && (
          <SiSePuedeEscribir>
            <Link
              href={`/obras/${id}/ordenes/nueva`}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
              style={{ backgroundColor: "var(--color-marca-600)" }}
            >
              <Plus className="size-4" aria-hidden="true" />
              Registrar orden
            </Link>
          </SiSePuedeEscribir>
        )}
      </div>

      <AvisoSinEscritura />

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

      {/* `id` para poder enlazar aqui desde el modulo "Presupuesto" del
          tablero: el panel ya se pinta al principio de la pantalla, pero
          sin esto el ancla no tenia donde aterrizar. */}
      <div id="comprometido" className="scroll-mt-20">
        <PanelComprometido
          comprometido={comprometido}
          desglose={desglose}
          presupuesto={presupuesto}
          // El total de la obra SIN filtrar. Con el total filtrado, buscar algo
          // que no coincide dejaba el panel en cero y desaparecia: parecia que
          // el comprometido se hubiera esfumado por escribir en un buscador.
          totalOrdenes={totalDeLaObra}
        />
      </div>

      <section className="space-y-4">
        <h3 className="text-lg font-semibold">Órdenes</h3>

        <FiltrosOrdenes proveedores={proveedores} />

        <HistorialOrdenes
          ordenes={ordenes.filas}
          obraId={id}
          puedeAprobar={puede(sesion, "orden:aprobar")}
          puedeAnular={puede(sesion, "orden:anular")}
          // El servicio decide el permiso segun el estado; aqui basta con
          // saber si esta persona puede llegar a borrar algo.
          puedeEliminar={
            puede(sesion, "orden:crear") || puede(sesion, "orden:anular")
          }
          filtrado={hayFiltro}
        />

        <Paginacion
          pagina={ordenes.pagina}
          totalPaginas={ordenes.totalPaginas}
          total={ordenes.total}
          porPagina={5}
          etiqueta="órdenes"
          // Los filtros SI viajan —perderlos al pasar de pagina reiniciaria
          // la busqueda—, los avisos de un solo uso no.
          params={filtros}
        />
      </section>
    </div>
  );
}
