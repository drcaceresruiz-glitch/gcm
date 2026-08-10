import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import { puede } from "@/lib/rbac";
import { hoy } from "@/utils/fechas";
import { Volver } from "@/components/ui/Volver";
import { PanelAyuda } from "@/components/ui/PanelAyuda";
import { IlustracionPlano } from "@/components/ui/IlustracionPlano";
import { FormularioObra } from "@/components/obras/FormularioObra";
import { accionCrearObra } from "@/app/(dashboard)/obras/nueva/acciones";

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
          Se crea vacía. Después se le carga el presupuesto, desde un Excel o
          partida a partida.
        </p>
      </div>

      {/* El formulario maneja su propio layout de dos columnas —campos a la
          izquierda, semaforo de requisitos y ayuda a la derecha—, porque el
          semaforo tiene que reaccionar en vivo a lo que se escribe. */}
      <FormularioObra
        accion={accionCrearObra}
        modo="crear"
        fechaHoy={hoy().toISOString().slice(0, 10)}
        ayuda={
          <PanelAyuda
            ilustracion={<IlustracionPlano />}
            puntos={[
              {
                titulo: "La obra nace vacía",
                texto:
                  "Al crearla no tiene partidas. El paso siguiente es cargarle el presupuesto, desde un Excel o partida a partida.",
              },
              {
                titulo: "El código es opcional, pero no se repite",
                texto:
                  "Sirve para nombrar la obra en corto. Además, el sistema le pone un correlativo propio (OB-000001).",
              },
              {
                titulo: "Empieza en planificación",
                texto:
                  "Es lo normal: se pasa a ejecución cuando la obra arranca de verdad. El estado ordena el panel y deja filtrar.",
              },
              {
                titulo: "Las fechas dan el avance de calendario",
                texto:
                  "De ellas sale la barra del panel, que mide tiempo transcurrido y no avance ejecutado.",
              },
            ]}
          />
        }
      />
    </div>
  );
}
