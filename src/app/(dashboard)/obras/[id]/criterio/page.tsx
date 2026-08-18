import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

import { obtenerSesion } from "@/services/sesion.service";
import { obtenerObra } from "@/services/obras.service";
import { criterioDeObra } from "@/services/criterio-obra.service";
import { puede } from "@/lib/rbac";
import { ElegirCriterio } from "@/components/obras/ElegirCriterio";

export const metadata: Metadata = { title: "Criterio de la obra" };

/**
 * La decision que hay que tomar antes de seguir: si los gastos generales
 * cuentan en la bolsa operativa de esta obra.
 *
 * Va en pantalla propia y no en un ajuste escondido porque es lo primero que
 * se pregunta despues de cargar el presupuesto, y porque la respuesta cambia
 * como se lee TODO el dinero de la obra. Un desplegable en una pagina de
 * configuracion se contesta sin leerlo.
 */
export default async function CriterioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const { id } = await params;
  const obra = await obtenerObra(sesion, id);
  if (!obra) redirect("/panel");

  const criterio = await criterioDeObra(sesion, id);
  if (!criterio) redirect(`/obras/${id}`);

  // Antes del presupuesto la pregunta no significa nada: no hay contra que
  // comparar. Se devuelve a la obra, que es donde se carga.
  if (!criterio.hayPresupuesto) redirect(`/obras/${id}`);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold">
          ¿Los gastos generales entran en la bolsa?
        </h2>
        <p className="mt-1 text-sm opacity-70">
          Es la primera decisión de la obra, y hay que tomarla antes de seguir:
          de ella depende cómo se lee todo el margen. Se puede cambiar después
          cuando quieras.
        </p>
      </div>

      {criterio.incluyeGastosGenerales !== null && (
        <p className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm"
          style={{
            backgroundColor:
              "color-mix(in oklab, var(--color-exito) 15%, transparent)",
          }}
        >
          <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
          Ahora mismo{" "}
          {criterio.incluyeGastosGenerales ? "SÍ entran" : "NO entran"}. Puedes
          cambiarlo aquí.
        </p>
      )}

      <ElegirCriterio
        obraId={id}
        actual={criterio.incluyeGastosGenerales}
        puedeEditar={puede(sesion, "obra:editar")}
      />
    </div>
  );
}
