import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import { Volver } from "@/components/ui/Volver";
import { FormularioConstructora } from "@/components/operador/FormularioConstructora";

export const metadata: Metadata = { title: "Nueva constructora" };

export default async function NuevaConstructoraPage() {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");
  if (!sesion.esOperador) redirect("/panel");

  return (
    <div className="space-y-6">
      <div>
        <Volver href="/operador">Volver a las constructoras</Volver>
        <h2 className="mt-3 text-xl font-semibold">Nueva constructora</h2>
        <p className="mt-0.5 max-w-2xl text-sm opacity-70">
          Se crea la empresa y su primer administrador a la vez. Al terminar
          verás su clave temporal una sola vez.
        </p>
      </div>

      <section
        className="rounded-xl border p-4"
        style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
      >
        <FormularioConstructora />
      </section>
    </div>
  );
}
