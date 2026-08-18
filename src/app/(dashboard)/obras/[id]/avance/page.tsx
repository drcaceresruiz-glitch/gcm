import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { obtenerSesion } from "@/services/sesion.service";
import { obtenerObra } from "@/services/obras.service";
import { obtenerParteDelDia } from "@/services/cronograma.service";
import { puede } from "@/lib/rbac";
import { fechaLarga, hoy } from "@/utils/fechas";
import { ParteDelDia } from "@/components/avance/ParteDelDia";

export const metadata: Metadata = { title: "Parte del día" };

/// Cuantos dias hacia delante se ofrecen. Se puede ampliar desde la propia
/// pantalla, como el Lookahead con sus semanas.
const DIAS = [7, 14, 30] as const;

/// La opcion sin ventana. Va en la URL como `?dias=todas`.
const TODAS = "todas";

export default async function AvancePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ dias?: string }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const { id } = await params;
  const obra = await obtenerObra(sesion, id);
  if (!obra) redirect("/panel");
  if (!puede(sesion, "cronograma:leer")) redirect(`/obras/${id}`);

  const pedido = (await searchParams).dias;
  const diasVista =
    pedido === TODAS
      ? null
      : DIAS.includes(Number(pedido) as (typeof DIAS)[number])
        ? Number(pedido)
        : 7;

  const parte = await obtenerParteDelDia(sesion, id, { diasVista });
  const puedeReportar = puede(sesion, "avance:registrar");

  if (!parte) {
    return (
      <div className="space-y-3">
        <h2 className="text-xl font-semibold">Parte del día</h2>
        <p className="text-sm opacity-70">
          Esta obra todavía no tiene cronograma. El parte reporta avance sobre sus
          tareas, así que primero hay que importarlo.{" "}
          <Link href={`/obras/${id}/cronograma`} className="font-medium underline">
            Ir al cronograma
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">Parte del día</h2>
        <p className="mt-0.5 max-w-3xl text-sm opacity-70">
          El avance de todas las tareas abiertas, en un solo envío. Lo que dejes en
          blanco <strong>no se guarda</strong>: una casilla vacía significa «de esta
          tarea no sé nada hoy», y eso también es un dato.
        </p>
      </div>

      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm"
        style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
      >
        <div className="space-y-0.5">
          <p>
            Tu semana cierra el <strong>{fechaLarga(parte.cierraEl)}</strong>.
          </p>
          <p className="opacity-70">
            {parte.diasSinParte === null
              ? "Todavía no se ha reportado avance en esta obra."
              : parte.diasSinParte === 0
                ? "Hoy ya se reportó avance."
                : `Llevas ${parte.diasSinParte} día(s) laborable(s) sin reportar.`}
          </p>
        </div>

        {/* Lo que queda fuera se dice: una lista recortada que no avisa de que
            recorto se lee como la lista entera. */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="opacity-70">
            {parte.tareas} tarea(s) abiertas
            {parte.fuera > 0 && ` · ${parte.fuera} empiezan más adelante`}
          </span>
          {/* Cuando la ventana esconde MAS de lo que ensena, decirlo no basta:
              hay que sugerir el remedio. Con 4 tareas dentro y 50 fuera, la
              pantalla parece decir que la obra tiene cuatro partidas. */}
          {parte.fuera > 0 && (
            <span style={{ color: "var(--color-alerta)" }}>
              {parte.fuera > parte.tareas
                ? "La mayoría queda fuera de esta ventana."
                : "Hay partidas fuera de esta ventana."}{" "}
              <Link href={`/obras/${id}/avance?dias=${TODAS}`} className="underline">
                Ver todas
              </Link>
            </span>
          )}
          {DIAS.map((d) => (
            <Link
              key={d}
              href={`/obras/${id}/avance?dias=${d}`}
              className="rounded-lg border px-2 py-1 font-medium"
              style={{
                borderColor: d === diasVista ? "var(--color-marca-600)" : "var(--borde)",
                color: d === diasVista ? "var(--color-marca-600)" : undefined,
              }}
            >
              {d} días
            </Link>
          ))}
          {/* Sin esta opcion una partida que arranca fuera de la ventana no se
              puede reportar aunque la cuadrilla ya la este ejecutando. */}
          <Link
            href={`/obras/${id}/avance?dias=${TODAS}`}
            className="rounded-lg border px-2 py-1 font-medium"
            style={{
              borderColor:
                diasVista === null ? "var(--color-marca-600)" : "var(--borde)",
              color: diasVista === null ? "var(--color-marca-600)" : undefined,
            }}
          >
            Todas
          </Link>
        </div>
      </div>

      {parte.tareas === 0 ? (
        <p className="text-sm opacity-60">
          No hay tareas abiertas en esta ventana. Amplíala arriba si esperabas ver
          alguna.
        </p>
      ) : puedeReportar ? (
        <ParteDelDia
          obraId={id}
          grupos={parte.grupos}
          hoyIso={hoy().toISOString().slice(0, 10)}
        />
      ) : (
        <p className="text-sm opacity-60">
          No tienes permiso para reportar avance.
        </p>
      )}
    </div>
  );
}
