import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { obtenerSesion } from "@/services/sesion.service";
import { listarProveedoresPagina } from "@/services/proveedores.service";
import { puede } from "@/lib/rbac";
import { Volver } from "@/components/ui/Volver";
import { Paginacion } from "@/components/ui/Paginacion";
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
  searchParams: Promise<{
    guardado?: string;
    estado?: string;
    todos?: string;
    p?: string;
  }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  if (!puede(sesion, "proveedor:leer")) redirect("/panel");

  const consulta = await searchParams;
  const { guardado, estado, todos } = consulta;
  const verTodos = todos === "1";

  // La version paginada. La lista completa —`listarProveedores`— sigue
  // existiendo para el desplegable del formulario de ordenes, que no puede
  // quedarse a veinte.
  const proveedores = await listarProveedoresPagina(sesion, {
    incluirInactivos: verTodos,
    pagina: consulta.p,
  });

  return (
    <div className="space-y-6">
      <div>
        <Volver href="/panel">Volver al panel</Volver>

        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          Proveedores
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-pretty opacity-70">
          El catálogo es de la empresa, no de cada obra: el mismo proveedor
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
        proveedores={proveedores.filas}
        total={proveedores.total}
        verTodos={verTodos}
        puedeCrear={puede(sesion, "proveedor:crear")}
        puedeEditar={puede(sesion, "proveedor:editar")}
      />

      <Paginacion
        pagina={proveedores.pagina}
        totalPaginas={proveedores.totalPaginas}
        total={proveedores.total}
        etiqueta="proveedores"
        // Se conserva `todos` —incluir desactivados— porque es el filtro
        // vigente: perderlo al pasar de pagina cambiaria la lista bajo los
        // pies. Los avisos de guardado no, que son de un solo uso.
        params={{ todos }}
      />
    </div>
  );
}
