import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import { obtenerObra } from "@/services/obras.service";
import { listarProveedores } from "@/services/proveedores.service";
import {
  obtenerEncargo,
  partidasAsignables,
  capitulosConPartidas,
} from "@/services/encargos.service";
import { puede } from "@/lib/rbac";
import { fechaCorta } from "@/utils/fechas";
import { Volver } from "@/components/ui/Volver";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { FormularioEncargo } from "@/components/proveedores/FormularioEncargo";

export const metadata: Metadata = { title: "Editar encargo" };

/** "YYYY-MM-DD" de una fecha `@db.Date` (medianoche UTC). */
function fechaISO(fecha: Date | null): string {
  return fecha ? fecha.toISOString().slice(0, 10) : "";
}

export default async function EditarEncargoPage({
  params,
}: {
  params: Promise<{ id: string; encargoId: string }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const { id, encargoId } = await params;
  const obra = await obtenerObra(sesion, id);
  if (!obra) notFound();

  if (!puede(sesion, "encargo:gestionar")) {
    return (
      <p className="text-sm opacity-70">
        No tienes permiso para editar encargos en esta obra.
      </p>
    );
  }

  const [encargo, proveedores, partidas, capitulos] = await Promise.all([
    obtenerEncargo(sesion, id, encargoId),
    listarProveedores(sesion),
    partidasAsignables(sesion, id),
    capitulosConPartidas(sesion, id),
  ]);

  if (!encargo) notFound();

  return (
    <div className="space-y-4">
      <Volver href={`/obras/${id}/proveedores`}>Volver a proveedores</Volver>

      <div>
        <h2 className="text-lg font-semibold">
          Editar encargo E-{String(encargo.numero).padStart(3, "0")}
        </h2>
        <p className="mt-0.5 text-sm opacity-70">{encargo.descripcion}</p>
      </div>

      <Tarjeta>
        <FormularioEncargo
          obraId={id}
          encargoId={encargoId}
          proveedores={proveedores.map((p) => ({
            id: p.id,
            razonSocial: p.razonSocial,
            ruc: p.ruc,
          }))}
          partidas={partidas}
          capitulos={capitulos}
          inicial={{
            proveedorId: encargo.proveedor.id,
            descripcion: encargo.descripcion,
            montoContratado: encargo.montoContratado,
            fechaInicio: fechaISO(encargo.fechaInicio),
            fechaFin: fechaISO(encargo.fechaFin),
            notas: encargo.notas ?? "",
            partidas: encargo.partidas.map((p) => ({
              wbsItemId: p.wbsItemId,
              fraccion: p.fraccion,
            })),
          }}
        />
      </Tarjeta>

      {/* El historial de valorizaciones: la serie del avance del proveedor,
          que es append-only. Aqui se lee; se registra desde la lista. */}
      {encargo.valorizaciones.length > 0 && (
        <Tarjeta>
          <h3 className="text-sm font-semibold">Historial de valorizaciones</h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="border-b text-left"
                  style={{ borderColor: "var(--borde)" }}
                >
                  <th className="pb-1.5 font-normal opacity-60">Corte</th>
                  <th className="pb-1.5 text-right font-normal opacity-60">
                    % acumulado
                  </th>
                  <th className="pb-1.5 font-normal opacity-60">Registrado por</th>
                  <th className="pb-1.5 font-normal opacity-60">Nota</th>
                </tr>
              </thead>
              <tbody>
                {encargo.valorizaciones.map((v) => (
                  <tr
                    key={v.id}
                    className="border-b last:border-b-0"
                    style={{ borderColor: "var(--borde)" }}
                  >
                    <td className="py-1.5 tabular-nums">{fechaCorta(v.fecha)}</td>
                    <td className="py-1.5 text-right font-medium tabular-nums">
                      {Number(v.porcentaje).toFixed(1)}%
                    </td>
                    <td className="py-1.5 opacity-70">{v.registradoPor}</td>
                    <td className="py-1.5 opacity-70">{v.nota ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tarjeta>
      )}
    </div>
  );
}
