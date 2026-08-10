import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import { obtenerObra } from "@/services/obras.service";
import { obtenerMapeo } from "@/services/mapeo.service";
import { puede } from "@/lib/rbac";
import { soles } from "@/utils/formato";
import { Volver } from "@/components/ui/Volver";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { MapeoTareas } from "@/components/cronograma/MapeoTareas";

export const metadata: Metadata = { title: "Tareas y partidas" };

export default async function MapeoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const { id } = await params;
  const obra = await obtenerObra(sesion, id);
  if (!obra) notFound();

  const mapeo = await obtenerMapeo(sesion, id);
  if (!mapeo) redirect(`/obras/${id}/cronograma`);

  const { cobertura } = mapeo;
  const suficiente = cobertura.porcentaje >= 60;

  return (
    <div className="space-y-6">
      <div>
        <Volver href={`/obras/${id}/cronograma`}>Volver al cronograma</Volver>

        <h2 className="mt-3 text-xl font-semibold tracking-tight">
          Qué partidas cubre cada tarea
        </h2>
        <p className="mt-1 max-w-3xl text-sm opacity-70">
          Hoy el avance de la obra se pondera por la duración de cada tarea,
          que es el único peso que trae el archivo de MS Project. Al enlazar
          tareas con partidas, el avance pasa a pesarse por{" "}
          <strong>dinero</strong>: terminar una partida de S/ 500 deja de valer
          lo mismo que terminar una de S/ 200.000.
        </p>
      </div>

      <Tarjeta>
        <h3 className="text-base font-semibold">Cobertura del presupuesto</h3>

        <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-2">
          <span className="text-3xl font-bold tabular-nums">
            {cobertura.porcentaje.toFixed(1)}%
          </span>
          <span className="text-sm opacity-70">
            {soles(cobertura.mapeado)} de {soles(cobertura.total)} enlazados
          </span>
          <span className="text-sm opacity-70">
            {cobertura.partidasSinTarea} partida(s) sin tarea que las cubra
          </span>
        </div>

        <div
          className="mt-3 h-2.5 overflow-hidden rounded-full"
          style={{ backgroundColor: "var(--borde)" }}
          role="progressbar"
          aria-valuenow={Math.round(cobertura.porcentaje)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Cobertura del presupuesto"
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.min(100, cobertura.porcentaje)}%`,
              backgroundColor: suficiente
                ? "var(--color-exito)"
                : "var(--color-alerta)",
            }}
          />
        </div>

        {/* Por que hay un umbral, dicho donde se decide. */}
        <p className="mt-3 text-sm opacity-70">
          {suficiente
            ? "Con esta cobertura, el avance ya se puede pesar por dinero de forma representativa."
            : "Mientras la cobertura sea baja, el avance se sigue pesando por duración. Pesar por dinero un mapeo que cubre una parte pequeña del presupuesto sería peor: la cifra parece más seria y describe solo ese trozo."}
        </p>

        {/* Por que este total no es el mismo que el del presupuesto. */}
        <p className="mt-2 text-xs opacity-60">
          El total de referencia solo cuenta partidas con importe positivo. Los
          descuentos comerciales quedan fuera porque no son trabajo que nadie
          ejecute, y un peso negativo en una media ponderada restaría avance en
          vez de sumarlo. Por eso esta cifra puede no coincidir con el subtotal
          de partidas de la obra.
        </p>
      </Tarjeta>

      <Tarjeta>
        <h3 className="text-base font-semibold">Tareas del cronograma</h3>
        <p className="mt-0.5 mb-4 text-sm opacity-70">
          GCM propone por parecido de la descripción; tú decides. No aparecen
          ni las tareas resumen —su dinero es el de sus partidas hijas, y
          enlazarlas contaría el mismo importe dos veces— ni los hitos, que
          marcan un acontecimiento y no trabajo que ejecutar.
        </p>

        <MapeoTareas
          obraId={id}
          tareas={mapeo.tareas}
          partidas={mapeo.partidas}
          puedeEditar={puede(sesion, "cronograma:importar")}
        />
      </Tarjeta>
    </div>
  );
}
