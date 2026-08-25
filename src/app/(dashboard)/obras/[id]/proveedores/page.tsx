import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Plus, Handshake } from "lucide-react";
import { obtenerSesion } from "@/services/sesion.service";
import { obtenerObra } from "@/services/obras.service";
import { listarEncargos } from "@/services/encargos.service";
import { respuestasPorContratista } from "@/services/mensajes-contratista.service";
import { puede } from "@/lib/rbac";
import { soles } from "@/utils/formato";
import { Mascota } from "@/components/ui/Mascota";
import { TarjetaEncargo } from "@/components/proveedores/TarjetaEncargo";
import {
  AvisoSinEscritura,
  SiSePuedeEscribir,
} from "@/components/obras/EscrituraDeLaObra";

export const metadata: Metadata = { title: "Proveedores" };

export default async function ProveedoresPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const { id } = await params;
  const obra = await obtenerObra(sesion, id);
  if (!obra) notFound();

  if (!puede(sesion, "encargo:leer")) {
    return (
      <p className="text-sm opacity-70">
        No tienes permiso para ver los proveedores de esta obra.
      </p>
    );
  }

  // Las dos a la vez: el contador de respuestas es una consulta agrupada y no
  // depende de los encargos, asi que esperarla en serie seria un viaje de mas.
  const [{ encargos, cobertura }, respuestas] = await Promise.all([
    listarEncargos(sesion, id),
    respuestasPorContratista(sesion, id),
  ]);
  const puedeGestionar = puede(sesion, "encargo:gestionar");
  const puedeValorizar = puede(sesion, "encargo:valorizar");

  const sinAsignarPositivo = Number(cobertura.sinAsignar) > 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Proveedores por frente</h2>
          <p className="mt-0.5 text-sm opacity-70">
            Reparte la obra en encargos: quién hace qué, por cuánto y cómo va.
          </p>
        </div>
        {/* En una obra cerrada no se abre un encargo nuevo: el servicio lo
            rechaza, y ofrecer el boton solo invita a intentarlo. El motivo se
            explica una vez, en el aviso de aqui debajo. */}
        {puedeGestionar && (
          <SiSePuedeEscribir>
            <Link
              href={`/obras/${id}/proveedores/nuevo`}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
              style={{ backgroundColor: "var(--color-marca-600)" }}
            >
              <Plus className="size-4" aria-hidden="true" />
              Nuevo encargo
            </Link>
          </SiSePuedeEscribir>
        )}
      </div>

      <AvisoSinEscritura />

      {/* Cobertura: cuanto del presupuesto tiene ya un proveedor detras. La
          lectura de arriba antes de mirar encargo por encargo. */}
      {encargos.length > 0 && (
        <div
          className="elevacion-1 rounded-xl border p-4"
          style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm font-medium">Cobertura del presupuesto</span>
            <span className="text-sm tabular-nums">
              {soles(cobertura.asignado)} de {soles(cobertura.total)} ·{" "}
              <strong>{cobertura.porcentaje.toFixed(1)}%</strong>
            </span>
          </div>
          <div
            className="mt-2 h-2.5 overflow-hidden rounded-full"
            style={{ backgroundColor: "var(--borde)" }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(cobertura.porcentaje, 100)}%`,
                backgroundColor:
                  cobertura.porcentaje > 100
                    ? "var(--color-peligro)"
                    : "var(--color-marca-500)",
              }}
            />
          </div>
          {sinAsignarPositivo && (
            <p className="mt-1.5 text-xs opacity-70">
              Quedan {soles(cobertura.sinAsignar)} sin repartir entre
              proveedores.
            </p>
          )}
          {cobertura.porcentaje > 100 && (
            <p className="mt-1.5 text-xs" style={{ color: "var(--color-peligro)" }}>
              Se ha asignado más del 100 %: revisa las fracciones, alguna
              partida está contada de más.
            </p>
          )}
        </div>
      )}

      {encargos.length === 0 ? (
        <div
          className="rounded-xl border border-dashed p-10 text-center"
          style={{ borderColor: "var(--borde)" }}
        >
          <div className="flex justify-center">
            <Mascota pose="trabajando" alto={150} />
          </div>
          <p className="mt-3 text-sm opacity-70">
            Aún no hay proveedores asignados a frentes de esta obra.
          </p>
          {puedeGestionar ? (
            <SiSePuedeEscribir>
              <Link
                href={`/obras/${id}/proveedores/nuevo`}
                className="mt-4 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
                style={{ backgroundColor: "var(--color-marca-600)" }}
              >
                <Handshake className="size-4" aria-hidden="true" />
                Asignar el primer encargo
              </Link>
            </SiSePuedeEscribir>
          ) : null}
        </div>
      ) : (
        <ul className="space-y-3">
          {encargos.map((e) => (
            <TarjetaEncargo
              key={e.id}
              obraId={id}
              encargo={e}
              puedeGestionar={puedeGestionar}
              puedeValorizar={puedeValorizar}
              puedeContactar={puede(sesion, "proveedor:contactar")}
              respuestas={respuestas.get(e.proveedor.id) ?? 0}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
