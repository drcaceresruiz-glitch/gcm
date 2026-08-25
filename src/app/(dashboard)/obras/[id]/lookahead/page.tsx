import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import { obtenerObra } from "@/services/obras.service";
import {
  obtenerLookahead,
  tasaDeLiberacionDeObra,
} from "@/services/lookahead.service";
import { inventarioEjecutable } from "@/lib/indicadores-lps";
import { PanelIndicadores } from "@/components/lookahead/PanelIndicadores";
import { puede } from "@/lib/rbac";
import { fechaCorta, hoy } from "@/utils/fechas";
import { proximoCorte, corteSiguiente } from "@/lib/plan-semanal";
import { MatrizLookahead } from "@/components/lookahead/MatrizLookahead";
import { EnlaceBoton } from "@/components/ui/EnlaceBoton";
import { QrCode } from "lucide-react";
import { AvisoSinEscritura } from "@/components/obras/EscrituraDeLaObra";

export const metadata: Metadata = { title: "Lookahead" };

/**
 * Lookahead (Last Planner): la ventana de mediano plazo (3 semanas por
 * defecto, configurable de 1 a 12) con el
 * analisis de restricciones por tarea y el semaforo de confiabilidad. Es
 * el paso entre el cronograma (largo plazo) y el Plan Semanal (corto plazo): de
 * aqui saldran las tareas LISTAS que se pueden comprometer.
 */
export default async function LookaheadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  /// La ventana vive en la URL: se comparte por enlace y se cambia al vuelo,
  /// sin necesidad de guardarla ni de migrar la base.
  ///
  /// `tarea` y `evidencia` son la otra punta de los codigos QR pegados en
  /// obra: quien escanea cae aqui con el frente ya senalado, o directamente
  /// con el panel de esa restriccion abierto.
  searchParams: Promise<{
    semanas?: string;
    tarea?: string;
    evidencia?: string;
  }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const { id } = await params;
  const { semanas, tarea, evidencia } = await searchParams;
  const obra = await obtenerObra(sesion, id);
  if (!obra) redirect("/panel");
  if (!puede(sesion, "lookahead:leer")) redirect(`/obras/${id}`);

  // En paralelo: la tasa recorre las restricciones de TODA la obra y no
  // depende de la ventana, asi que no tiene por que esperar a la matriz.
  const [datos, tasa] = await Promise.all([
    obtenerLookahead(sesion, id, semanas),
    tasaDeLiberacionDeObra(sesion, id),
  ]);

  // El inventario sale de las filas que la matriz ya trajo: ni una consulta
  // mas para saber cuanto trabajo hay listo sin comprometer.
  const inventario = datos ? inventarioEjecutable(datos.filas) : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Lookahead</h2>
        <p className="mt-0.5 max-w-2xl text-sm opacity-70">
          La ventana de mediano plazo: lo que el cronograma trae en las próximas
          semanas y su análisis de restricciones. Elige qué flujos frenan cada
          tarea —las siete preguntas se hacen siempre, las siete restricciones
          no aplican siempre—. Una tarea está <strong>lista</strong> cuando está
          analizada y no le queda ninguna sin levantar, aunque no le aplique
          ninguna; solo lo listo debería comprometerse en el Plan Semanal.
          {datos && (
            <>
              {" "}
              Ventana: {fechaCorta(datos.desde)} – {fechaCorta(datos.hasta)}.
            </>
          )}
        </p>
      </div>

      <AvisoSinEscritura />

      {/* Antes de la matriz: son las dos cifras que se miran para decidir si
          se puede comprometer, no un resumen de lo que ya se hizo. */}
      {inventario && inventario.total > 0 && (
        <PanelIndicadores inventario={inventario} tasa={tasa} />
      )}

      {datos && datos.puedeGestionar && datos.filas.length > 0 && (
        <EnlaceBoton
          href={`/obras/${id}/lookahead/codigos?semanas=${datos.semanas}`}
          icono={QrCode}
          posicionIcono="izquierda"
          tamano="sm"
        >
          Códigos QR para pegar en obra
        </EnlaceBoton>
      )}

      {datos && (
        <MatrizLookahead
          obraId={id}
          datos={datos}
          fechaProximoCorte={proximoCorte(obra.diaCorteSemanal, hoy())
            .toISOString()
            .slice(0, 10)}
          /* La de dentro de siete dias. Sin ella, un viernes con la semana ya
             cerrada no habia forma de planificar la entrante desde aqui. */
          fechaCorteSiguiente={corteSiguiente(obra.diaCorteSemanal, hoy())
            .toISOString()
            .slice(0, 10)}
          abrirEvidencia={evidencia ?? null}
          abrirTarea={tarea ? Number(tarea) : null}
        />
      )}
    </div>
  );
}
