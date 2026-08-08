import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Volver } from "@/components/ui/Volver";
import { obtenerSesion } from "@/services/sesion.service";
import { listarFormasPago } from "@/services/formas-pago.service";
import { puede } from "@/lib/rbac";
import { ListaFormasPago } from "@/components/ordenes/ListaFormasPago";

export const metadata: Metadata = { title: "Formas de pago" };

/**
 * Formas de pago reutilizables.
 *
 * No tienen permiso propio: las gobiernan los de ordenes, que es quien las
 * usa. Por eso la pantalla vive en el area de empresa pero se protege con
 * `orden:leer`.
 */
export default async function FormasPagoPage({
  searchParams,
}: {
  searchParams: Promise<{ guardada?: string; estado?: string; todas?: string }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  if (!puede(sesion, "orden:leer")) redirect("/panel");

  const { guardada, estado, todas } = await searchParams;
  const verTodas = todas === "1";

  const formas = await listarFormasPago(sesion, verTodas);

  return (
    <div className="space-y-6">
      <div>
        <Volver href="/panel">Volver al panel</Volver>

        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          Formas de pago
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-pretty opacity-70">
          Las que se repiten de una orden a otra, guardadas para no volver a
          teclearlas. Al elegir una en la orden, su texto se copia y{" "}
          <strong>sigue siendo editable</strong>: lo pactado con un proveedor
          concreto casi siempre tiene un matiz que la plantilla no recoge.
        </p>
      </div>

      {(guardada || estado) && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm"
          style={{
            backgroundColor:
              "color-mix(in oklab, var(--color-exito) 15%, transparent)",
          }}
        >
          <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
          {guardada ? "Forma de pago guardada." : `Forma de pago ${estado}.`}
        </p>
      )}

      <ListaFormasPago
        formas={formas}
        verTodas={verTodas}
        puedeEditar={puede(sesion, "orden:crear")}
      />
    </div>
  );
}
