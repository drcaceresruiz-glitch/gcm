import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { obtenerSesion } from "@/services/sesion.service";
import { obtenerEmpresa } from "@/services/empresa.service";
import { puede } from "@/lib/rbac";
import { FormularioEmpresa } from "@/components/empresa/FormularioEmpresa";

export const metadata: Metadata = { title: "Datos de la empresa" };

/**
 * Los datos propios de la empresa.
 *
 * Existian en la base desde el primer dia pero no habia donde tocarlos. Se
 * abren ahora porque son los que encabezan y firman las ordenes: sin ellos el
 * documento que recibe el proveedor sale sin remitente y sin firmante.
 */

export default async function DatosEmpresaPage({
  searchParams,
}: {
  searchParams: Promise<{ guardada?: string }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const empresa = await obtenerEmpresa(sesion);
  if (!empresa) notFound();

  const { guardada } = await searchParams;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Datos de la empresa
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-pretty opacity-70">
          Lo que sale impreso en las ordenes que reciben los proveedores.
        </p>
      </div>

      {guardada && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg px-4 py-3 text-sm"
          style={{
            backgroundColor:
              "color-mix(in oklab, var(--color-exito) 15%, transparent)",
          }}
        >
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>Datos guardados. Las ordenes ya salen con ellos.</span>
        </p>
      )}

      <FormularioEmpresa
        empresa={empresa}
        soloLectura={!puede(sesion, "empresa:editar")}
      />
    </div>
  );
}
