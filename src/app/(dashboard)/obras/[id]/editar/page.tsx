import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import { obtenerObra } from "@/services/obras.service";
import { puede } from "@/lib/rbac";
import { Volver } from "@/components/ui/Volver";
import { PanelAyuda } from "@/components/ui/PanelAyuda";
import { IlustracionPlano } from "@/components/ui/IlustracionPlano";
import { FormularioObra } from "@/components/obras/FormularioObra";
import { CalendarioLaboral } from "@/components/obras/CalendarioLaboral";
import { obtenerCalendario } from "@/services/calendario.service";
import { DIAS_ISO, type DiaLaboral } from "@/lib/calendario";
import { accionEditarObra } from "./acciones";

export const metadata: Metadata = { title: "Editar obra" };

/** "YYYY-MM-DD" de una fecha `@db.Date`, usando sus componentes UTC. */
function comoInput(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

/**
 * Edicion de una obra.
 *
 * Nace para cerrar un hueco real: no habia forma de corregir una obra ya
 * creada, asi que un dato mal tecleado al alta —tipicamente la fecha fin— se
 * quedaba fijo y arrastraba el plazo y el avance de calendario de todo el
 * panel. Reutiliza el mismo formulario que el alta.
 */
export default async function EditarObraPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const { id } = await params;
  const obra = await obtenerObra(sesion, id);
  if (!obra) redirect("/panel");
  if (!puede(sesion, "obra:editar")) redirect(`/obras/${id}`);

  // El id se liga a la accion en el servidor: no viaja como campo manipulable.
  const accion = accionEditarObra.bind(null, id);

  // Las obras creadas antes de que existiera la siembra no tienen calendario:
  // se rellena con el regimen habitual para que la pantalla no salga vacia.
  const guardado = await obtenerCalendario(sesion, id);
  const calendario: DiaLaboral[] = DIAS_ISO.map((dia) => {
    const y = guardado.find((g) => g.diaSemana === dia);
    if (y) return y;
    if (dia === 7) return { diaSemana: dia, laborable: false, horas: "0" };
    return { diaSemana: dia, laborable: true, horas: dia === 6 ? "5" : "8" };
  });

  return (
    <div className="space-y-6">
      <div>
        <Volver href={`/obras/${id}`}>Volver a la obra</Volver>

        <p className="mt-3 text-sm font-medium opacity-60">
          {obra.correlativo}
          {obra.codigoObra ? ` · ${obra.codigoObra}` : ""}
        </p>
        <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">
          Editar obra
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-pretty opacity-70">
          Corrige los datos de la obra. El estado se cambia con sus botones
          (iniciar, paralizar, cerrar), no aquí.
        </p>
      </div>

      <FormularioObra
        accion={accion}
        modo="editar"
        valores={{
          nombreObra: obra.nombreObra,
          codigoObra: obra.codigoObra ?? "",
          cliente: obra.cliente ?? "",
          ubicacion: obra.ubicacion ?? "",
          fechaInicio: comoInput(obra.fechaInicio),
          fechaFinProgramada: comoInput(obra.fechaFinProgramada),
        }}
        ayuda={
          <PanelAyuda
            ilustracion={<IlustracionPlano />}
            puntos={[
              {
                titulo: "El plazo mueve el calendario",
                texto:
                  "Las fechas de inicio y fin dan los días restantes y el avance de calendario del panel. Si la fecha fin difiere del cronograma, el panel lo avisa.",
              },
              {
                titulo: "El código no se repite",
                texto:
                  "Puedes cambiarlo, pero no puede coincidir con el de otra obra de la empresa. El correlativo (OB-000001) no cambia.",
              },
              {
                titulo: "El estado va por sus botones",
                texto:
                  "Iniciar, paralizar o cerrar la obra se hace desde la obra, para respetar el orden de estados. Por eso no está en este formulario.",
              },
            ]}
          />
        }
      />

      <section
        className="rounded-xl border p-4"
        style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
      >
        <h2 className="text-base font-semibold">Régimen laboral</h2>
        <p className="mt-0.5 mb-3 max-w-2xl text-sm opacity-70">
          Qué días se trabaja en esta obra y cuántas horas. De aquí salen los
          días laborables que quedan de plazo. Una edificación urbana suele ir
          de lunes a sábado; una obra vial de turno corrido, los siete días.
        </p>
        <CalendarioLaboral obraId={id} inicial={calendario} />
      </section>
    </div>
  );
}
