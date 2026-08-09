import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import { obtenerObra } from "@/services/obras.service";
import { listarProveedores } from "@/services/proveedores.service";
import { partidasAsignables } from "@/services/encargos.service";
import { puede } from "@/lib/rbac";
import { Volver } from "@/components/ui/Volver";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { FormularioEncargo } from "@/components/proveedores/FormularioEncargo";

export const metadata: Metadata = { title: "Nuevo encargo" };

export default async function NuevoEncargoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const { id } = await params;
  const obra = await obtenerObra(sesion, id);
  if (!obra) notFound();

  if (!puede(sesion, "encargo:gestionar")) {
    return (
      <p className="text-sm opacity-70">
        No tienes permiso para asignar encargos en esta obra.
      </p>
    );
  }

  const [proveedores, partidas] = await Promise.all([
    listarProveedores(sesion),
    partidasAsignables(sesion, id),
  ]);

  return (
    <div className="space-y-4">
      <Volver href={`/obras/${id}/proveedores`}>Volver a proveedores</Volver>

      <div>
        <h2 className="text-lg font-semibold">Nuevo encargo</h2>
        <p className="mt-0.5 text-sm opacity-70">
          Asigna un frente de la obra a un proveedor, con su monto y sus
          partidas.
        </p>
      </div>

      <Tarjeta>
        <FormularioEncargo
          obraId={id}
          proveedores={proveedores.map((p) => ({
            id: p.id,
            razonSocial: p.razonSocial,
            ruc: p.ruc,
          }))}
          partidas={partidas}
        />
      </Tarjeta>
    </div>
  );
}
