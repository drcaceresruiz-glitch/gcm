import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import { puede } from "@/lib/rbac";
import { hoy } from "@/utils/fechas";
import { Volver } from "@/components/ui/Volver";
import { FormularioObra } from "@/components/obras/FormularioObra";

export const metadata: Metadata = { title: "Nueva obra" };

/**
 * Alta de obras.
 *
 * Hasta ahora las obras solo nacian del script de seed, asi que una empresa
 * con la base recien creada no tenia por donde empezar: el panel invitaba a
 * crear la primera obra y no habia con que.
 */
export default async function NuevaObraPage() {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  if (!puede(sesion, "obra:crear")) redirect("/panel");

  return (
    <div className="space-y-6">
      <div>
        <Volver href="/panel">Volver al panel</Volver>

        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          Nueva obra
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-pretty opacity-70">
          Se crea vacia. Despues se le carga el presupuesto, desde un Excel o
          partida a partida.
        </p>
      </div>

      <FormularioObra fechaHoy={hoy().toISOString().slice(0, 10)} />
    </div>
  );
}
