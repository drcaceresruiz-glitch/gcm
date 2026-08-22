import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import { listarNotas } from "@/services/notas.service";
import { puede } from "@/lib/rbac";
import { AcentoTitulo } from "@/components/ui/Regla";
import { Mascota } from "@/components/ui/Mascota";
import { ListaNotas } from "@/components/notas/ListaNotas";
import {
  accionAlternarAtendidaNota,
  accionCrearNota,
  accionEditarNota,
  accionEliminarNota,
  accionSubirAdjuntoNota,
  accionEliminarAdjuntoNota,
} from "./acciones";

export const metadata: Metadata = { title: "Notas" };

/**
 * La bitacora libre de la obra: lo que no encaja en ningun formulario
 * reglado.
 *
 * `nota:leer` ve todo; `nota:crear` ademas anota y marca atendido/reabre;
 * `nota:gestionar` ademas corrige o borra lo que ya escribio cualquiera.
 */
export default async function NotasPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const { id } = await params;
  const notas = await listarNotas(sesion, id);
  if (notas === null) notFound();

  const puedeCrear = puede(sesion, "nota:crear");
  const puedeGestionar = puede(sesion, "nota:gestionar");

  return (
    <div className="space-y-5">
      <AcentoTitulo>
        <h2 className="text-xl font-semibold tracking-tight">Notas</h2>
        <p className="mt-1 text-sm opacity-70">
          {notas.length === 0
            ? "Lo que no tiene otro sitio: un pago pendiente, un tema legal, un recordatorio suelto."
            : `${notas.length} nota${notas.length === 1 ? "" : "s"}.`}
        </p>
      </AcentoTitulo>

      {notas.length === 0 && !puedeCrear && (
        <div
          className="rounded-xl border border-dashed p-10 text-center"
          style={{ borderColor: "var(--borde)" }}
        >
          <div className="flex justify-center">
            <Mascota pose="trabajando" alto={150} />
          </div>
          <p className="mt-3 text-sm opacity-70">Todavía no hay notas.</p>
        </div>
      )}

      {(notas.length > 0 || puedeCrear) && (
        <ListaNotas
          obraId={id}
          notas={notas}
          puedeCrear={puedeCrear}
          puedeGestionar={puedeGestionar}
          acciones={{
            crear: accionCrearNota,
            editar: accionEditarNota,
            alternarAtendida: accionAlternarAtendidaNota,
            eliminar: accionEliminarNota,
            subirAdjunto: accionSubirAdjuntoNota,
            eliminarAdjunto: accionEliminarAdjuntoNota,
          }}
        />
      )}
    </div>
  );
}
