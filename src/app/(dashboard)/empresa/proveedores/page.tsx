import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { obtenerSesion } from "@/services/sesion.service";
import {
  listarProveedoresPagina,
  semaforoDeContratos,
} from "@/services/proveedores.service";
import { listarObras } from "@/services/obras.service";
import type { RolProveedor } from "@/generated/prisma/enums";
import { FiltroProveedores } from "@/components/proveedores/FiltroProveedores";
import { ImportarProveedores } from "@/components/proveedores/ImportarProveedores";
import { puede } from "@/lib/rbac";
import { Volver } from "@/components/ui/Volver";
import { Paginacion } from "@/components/ui/Paginacion";
import { ListaProveedores } from "@/components/proveedores/ListaProveedores";

export const metadata: Metadata = { title: "Proveedores" };

/// Lo que se acepta en `?rol=`. Cualquier otra cosa se ignora y no filtra.
const ROLES_VALIDOS: RolProveedor[] = ["PROVEEDOR", "CONTRATISTA", "AMBOS"];

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
    /// Nombre, RUC o telefono, a medias.
    q?: string;
    /// PROVEEDOR | CONTRATISTA | AMBOS.
    rol?: string;
    /// Contra que obra se mira el semaforo de contrato. Sin ella no se pinta.
    obra?: string;
  }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  if (!puede(sesion, "proveedor:leer")) redirect("/panel");

  const consulta = await searchParams;
  const { guardado, estado, todos } = consulta;
  const verTodos = todos === "1";

  // El semaforo se mira SIEMPRE contra una obra concreta, y GCM no tiene
  // «obra activa»: no existe tal concepto en la aplicacion. Asi que la obra se
  // elige aqui, y mientras no se elija la columna no se pinta. Un semaforo de
  // empresa diria «con contrato» al lado de alguien que no tiene nada que ver
  // con la obra que se esta mirando.
  const obras = await listarObras(sesion, { porPagina: 100 }).catch(() => null);
  const obraElegida = consulta.obra?.trim() || "";

  const proveedoresPagina = await listarProveedoresPagina(sesion, {
    incluirInactivos: verTodos,
    pagina: consulta.p,
    busqueda: consulta.q,
    rol: ROLES_VALIDOS.find((r) => r === consulta.rol),
  });

  const semaforo = obraElegida
    ? await semaforoDeContratos(
        sesion,
        obraElegida,
        proveedoresPagina.filas.map((p) => p.id),
      )
    : null;

  // La version paginada. La lista completa —`listarProveedores`— sigue
  // existiendo para el desplegable del formulario de ordenes, que no puede
  // quedarse a veinte.
  const proveedores = proveedoresPagina;

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

      {puede(sesion, "proveedor:crear") && <ImportarProveedores />}

      <FiltroProveedores
        obras={obras?.filas.map((o) => ({ id: o.id, nombre: o.nombreObra })) ?? []}
      />

      <ListaProveedores
        proveedores={proveedores.filas}
        total={proveedores.total}
        verTodos={verTodos}
        puedeCrear={puede(sesion, "proveedor:crear")}
        puedeEditar={puede(sesion, "proveedor:editar")}
        // Un `Map` no cruza de servidor a cliente: se manda como objeto llano.
        semaforo={semaforo ? Object.fromEntries(semaforo) : null}
      />

      <Paginacion
        pagina={proveedores.pagina}
        totalPaginas={proveedores.totalPaginas}
        total={proveedores.total}
        etiqueta="proveedores"
        // Se conserva `todos` —incluir desactivados— porque es el filtro
        // vigente: perderlo al pasar de pagina cambiaria la lista bajo los
        // pies. Los avisos de guardado no, que son de un solo uso. Y con la
        // busqueda pasa lo mismo: pasar de pagina no puede deshacerla.
        params={{ todos, q: consulta.q, rol: consulta.rol, obra: consulta.obra }}
      />
    </div>
  );
}
