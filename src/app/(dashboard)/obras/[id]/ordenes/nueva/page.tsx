import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Users } from "lucide-react";
import { Volver } from "@/components/ui/Volver";
import { obtenerSesion } from "@/services/sesion.service";
import { listarPartidas, obtenerObra } from "@/services/obras.service";
import { listarProveedores } from "@/services/proveedores.service";
import { listarFormasPago } from "@/services/formas-pago.service";
import { obtenerPartidasHabituales } from "@/services/ordenes.service";
import {
  obtenerPresupuestoVigente,
  SinLineaBaseError,
} from "@/services/movimientos.service";
import { puede } from "@/lib/rbac";
import { hoy } from "@/utils/fechas";
import {
  FormularioOrden,
  type OpcionImputacion,
} from "@/components/ordenes/FormularioOrden";

export const metadata: Metadata = { title: "Nueva orden de compra" };

/**
 * Alta de una orden.
 *
 * El desplegable de partidas ensena el DISPONIBLE de cada una, que es lo que
 * se pregunta al repartir: el vigente menos lo ya comprometido. Cuando la
 * obra no tiene linea base todavia no hay vigente, y entonces se cae al
 * parcial del presupuesto: peor referencia, pero mejor que ninguna.
 */

export default async function NuevaOrdenPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const { id } = await params;
  const obra = await obtenerObra(sesion, id);
  if (!obra) notFound();

  if (!puede(sesion, "orden:crear")) redirect(`/obras/${id}/ordenes`);

  const [proveedores, { filas }, formasPago, habituales] = await Promise.all([
    listarProveedores(sesion),
    listarPartidas(sesion, id),
    listarFormasPago(sesion),
    obtenerPartidasHabituales(sesion, id),
  ]);

  // El vigente es la mejor referencia, pero solo existe con linea base
  // aprobada. Sin ella se usa el parcial del presupuesto.
  let vigentePorId = new Map<string, string>();
  if (puede(sesion, "movimiento:leer")) {
    try {
      const presupuesto = await obtenerPresupuestoVigente(sesion, id);
      vigentePorId = new Map(
        presupuesto.partidas.map((p) => [p.wbsItemId, p.vigente]),
      );
    } catch (error) {
      if (!(error instanceof SinLineaBaseError)) throw error;
    }
  }

  /**
   * Se recorre el arbol en ORDEN DE DOCUMENTO recordando el ultimo capitulo
   * raiz, igual que en el formulario de movimientos: las convenciones de
   * codigo conviven y hay huecos, asi que partirle el codigo a una partida
   * para deducir su capitulo no es fiable.
   */
  const niveles = filas.filter((f) => f.tipo === "CAPITULO").map((f) => f.nivel);
  const nivelRaiz = niveles.length > 0 ? Math.min(...niveles) : 0;

  const partidas: OpcionImputacion[] = [];
  let grupo = "Sin capitulo";

  for (const fila of filas) {
    if (fila.tipo === "CAPITULO") {
      if (fila.nivel === nivelRaiz) {
        grupo = `${fila.codigoPartida} ${fila.descripcion}`;
      }
      continue;
    }

    // ALCANCE no lleva importe propio: su dinero vive en la partida padre y
    // el servicio rechaza imputarle nada.
    if (fila.modalidad === "ALCANCE") continue;

    partidas.push({
      wbsItemId: fila.id,
      codigoPartida: fila.codigoPartida,
      descripcion: fila.descripcion,
      referencia: vigentePorId.get(fila.id) ?? fila.parcial ?? "0.00",
      capitulo: grupo,
    });
  }

  return (
    <div className="space-y-8">
      <div>
        <Volver href={`/obras/${id}/ordenes`}>Volver a las órdenes</Volver>

        <h2 className="mt-3 text-xl font-semibold tracking-tight">
          Nueva orden
        </h2>
      </div>

      {proveedores.length === 0 ? (
        <div
          className="rounded-xl border border-dashed p-10 text-center"
          style={{ borderColor: "var(--borde)" }}
        >
          <Users className="mx-auto size-8 opacity-40" aria-hidden="true" />
          <p className="mt-3 text-sm opacity-70">
            No hay proveedores activos a los que emitir la orden.
          </p>
          <Link
            href="/empresa/proveedores"
            className="mt-4 inline-flex items-center gap-2 text-sm font-medium underline"
          >
            Dar de alta un proveedor
          </Link>
        </div>
      ) : (
        <FormularioOrden
          obraId={id}
          fechaHoy={hoy().toISOString().slice(0, 10)}
          proveedores={proveedores.map((p) => ({
            id: p.id,
            razonSocial: p.razonSocial,
            ruc: p.ruc,
            tipoImpuesto: p.tipoImpuesto,
          }))}
          partidas={partidas}
          formasPago={formasPago}
          habituales={habituales}
        />
      )}
    </div>
  );
}
