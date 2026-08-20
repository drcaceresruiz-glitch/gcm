import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { obtenerSesion } from "@/services/sesion.service";
import { historialDeProveedor } from "@/services/proveedores.service";
import { fechaCorta } from "@/utils/fechas";
import { soles } from "@/utils/formato";
import { Chip, type TonoChip } from "@/components/ui/Chip";
import { Volver } from "@/components/ui/Volver";

export const metadata: Metadata = { title: "Contratos del contratista" };

const TONO: Record<string, TonoChip> = {
  VIGENTE: "curso",
  CERRADO: "exito",
  ANULADO: "neutro",
};

/**
 * Todo lo que se le ha encargado a un contratista, cruzando obras.
 *
 * LA UNICA PANTALLA que mira los encargos por proveedor y no por obra.
 * Responde a «¿que le hemos dado a esta ferreteria y como fue?», que antes
 * obligaba a entrar obra por obra.
 *
 * Lo que se ve aqui esta acotado por el ALCANCE de quien mira: un residente ve
 * los contratos de sus obras y nada mas. Cruzar obras es justo la forma de
 * ensenar de rebote una obra ajena, asi que el filtro vive en la consulta.
 */
export default async function ContratosDelProveedorPage({
  params,
}: {
  params: Promise<{ proveedorId: string }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const { proveedorId } = await params;
  const h = await historialDeProveedor(sesion, proveedorId);
  if (!h) notFound();

  return (
    <div className="space-y-6">
      <Volver href="/empresa/proveedores">Volver a Contratistas</Volver>

      <div>
        <h2 className="text-xl font-semibold">{h.proveedor.razonSocial}</h2>
        <p className="mt-0.5 text-sm opacity-70">
          RUC {h.proveedor.ruc}
          {!h.proveedor.activo && " · inactivo"}
        </p>
      </div>

      <div className="flex flex-wrap gap-6 text-sm">
        <div>
          <p className="opacity-70">Contratado con él</p>
          <p className="text-lg font-semibold tabular-nums">
            {soles(h.totalContratado)}
          </p>
          {/* Se dice lo que NO cuenta: un total sin explicar invita a cuadrarlo
              a mano contra la suma de la tabla y a no conseguirlo. */}
          <p className="text-xs opacity-60">Sin contar los anulados</p>
        </div>
        <div>
          <p className="opacity-70">Obras</p>
          <p className="text-lg font-semibold tabular-nums">{h.obras}</p>
          <p className="text-xs opacity-60">de las que puedes ver</p>
        </div>
      </div>

      {h.contratos.length === 0 ? (
        <p className="text-sm opacity-70 text-pretty">
          Todavía no tiene ningún encargo en las obras que puedes ver. Los
          encargos se reparten desde cada obra, en su pestaña de proveedores.
        </p>
      ) : (
        <div
          className="overflow-x-auto rounded-lg border"
          style={{ borderColor: "var(--borde)" }}
        >
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr style={{ backgroundColor: "var(--superficie)" }}>
                <th className="px-3 py-2 text-left font-medium">Obra</th>
                <th className="px-3 py-2 text-left font-medium">Encargo</th>
                <th className="px-3 py-2 text-right font-medium">Contratado</th>
                <th className="px-3 py-2 text-right font-medium">Avance</th>
                <th className="px-3 py-2 text-left font-medium">Fechas</th>
                <th className="px-3 py-2 text-center font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {h.contratos.map((c) => (
                <tr
                  key={c.encargoId}
                  className="border-t"
                  style={{ borderColor: "var(--borde)" }}
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/obras/${c.obraId}/proveedores`}
                      className="font-medium underline decoration-transparent underline-offset-2 hover:decoration-inherit"
                    >
                      {c.obraNombre}
                    </Link>
                    {c.obraCorrelativo && (
                      <span className="ml-2 text-xs opacity-60">
                        {c.obraCorrelativo}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className="opacity-60">
                      E-{String(c.numero).padStart(3, "0")}
                    </span>{" "}
                    {c.descripcion}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {soles(c.montoContratado)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {c.avance === null ? (
                      <span className="opacity-50">sin valorizar</span>
                    ) : (
                      `${Number(c.avance).toFixed(1)}%`
                    )}
                  </td>
                  <td className="px-3 py-2 opacity-80">
                    {c.fechaInicio ? fechaCorta(c.fechaInicio) : "—"}
                    {c.fechaFin && ` → ${fechaCorta(c.fechaFin)}`}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <Chip tono={TONO[c.estado] ?? "neutro"}>
                      {c.estado.charAt(0) + c.estado.slice(1).toLowerCase()}
                    </Chip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
