import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { obtenerSesion } from "@/services/sesion.service";
import { listarProveedores } from "@/services/proveedores.service";
import { puede } from "@/lib/rbac";
import { ListaProveedores } from "@/components/proveedores/ListaProveedores";

export const metadata: Metadata = { title: "Proveedores" };

/**
 * Catalogo de proveedores de la empresa.
 *
 * Vive fuera de la obra a proposito: un mismo proveedor trabaja en varias, y
 * duplicarlo por obra romperia el RUC como identidad.
 */
export default async function ProveedoresPage({
  searchParams,
}: {
  searchParams: Promise<{ guardado?: string; estado?: string; todos?: string }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  if (!puede(sesion, "proveedor:leer")) redirect("/panel");

  const { guardado, estado, todos } = await searchParams;
  const verTodos = todos === "1";

  const proveedores = await listarProveedores(sesion, verTodos);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/panel"
          className="inline-flex items-center gap-1.5 text-sm opacity-70 hover:opacity-100"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Volver al panel
        </Link>

        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          Proveedores
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-pretty opacity-70">
          El catalogo es de la empresa, no de cada obra: el mismo proveedor
          trabaja en varias. El RUC lo identifica y no puede repetirse, entre
          por donde entre.
        </p>
      </div>

      {(guardado || estado) && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm"
          style={{
            backgroundColor:
              "color-mix(in oklab, var(--color-exito) 15%, transparent)",
          }}
        >
          <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
          {guardado ? `${guardado} guardado.` : `Proveedor ${estado}.`}
        </p>
      )}

      <ListaProveedores
        proveedores={proveedores}
        verTodos={verTodos}
        puedeCrear={puede(sesion, "proveedor:crear")}
        puedeEditar={puede(sesion, "proveedor:editar")}
      />
    </div>
  );
}
