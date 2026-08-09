import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle, CalendarClock, CheckCircle2, Info } from "lucide-react";
import { obtenerSesion } from "@/services/sesion.service";
import { obtenerObra } from "@/services/obras.service";
import {
  obtenerCronograma,
  historialCronogramas,
  datosCurvaS,
} from "@/services/cronograma.service";
import { CurvaS } from "@/components/cronograma/CurvaS";
import { ControlCapitulos } from "@/components/cronograma/ControlCapitulos";
import { AlertasAtraso } from "@/components/cronograma/AlertasAtraso";
import { agruparPorCapitulo, alertasDeAtraso } from "@/lib/control-avance";
import { puede } from "@/lib/rbac";
import { fechaCorta, fechaCronograma, fechaLarga, haceCuanto } from "@/utils/fechas";
import { decimal } from "@/utils/formato";
import { Mascota } from "@/components/ui/Mascota";
import { Chip } from "@/components/ui/Chip";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { TablaCronograma } from "@/components/cronograma/TablaCronograma";

export const metadata: Metadata = { title: "Cronograma" };

export default async function CronogramaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cargado?: string; repetido?: string }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const { id } = await params;
  const { cargado, repetido } = await searchParams;

  const obra = await obtenerObra(sesion, id);
  if (!obra) notFound();

  if (!puede(sesion, "cronograma:leer")) redirect(`/obras/${id}`);

  const [cronograma, historial, curva] = await Promise.all([
    obtenerCronograma(sesion, id),
    historialCronogramas(sesion, id),
    datosCurvaS(sesion, id),
  ]);

  const puedeImportar = puede(sesion, "cronograma:importar");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Cronograma</h2>
          <p className="mt-0.5 text-sm opacity-70">
            El plan lo manda MS Project; el avance real, GCM.
          </p>
        </div>

        {puedeImportar && (
          <Link
            href={`/obras/${id}/cronograma/importar`}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
            style={{ backgroundColor: "var(--color-marca-600)" }}
          >
            <CalendarClock className="size-4" aria-hidden="true" />
            {cronograma ? "Cargar un corte nuevo" : "Cargar cronograma"}
          </Link>
        )}
      </div>

      {cargado && (
        <Mensaje tono="exito" icono={<CheckCircle2 className="size-4 shrink-0" />}>
          Cronograma cargado como version {cargado}.
        </Mensaje>
      )}

      {repetido && (
        <Mensaje tono="alerta" icono={<Info className="size-4 shrink-0" />}>
          Ese corte ya estaba cargado (version {repetido}), asi que no se ha
          creado ninguna version nueva. Para registrar un corte nuevo, fija otra
          fecha de estado en MS Project y vuelve a exportar.
        </Mensaje>
      )}

      {!cronograma ? (
        <div
          className="rounded-xl border border-dashed p-10 text-center"
          style={{ borderColor: "var(--borde)" }}
        >
          <div className="flex justify-center">
            <Mascota pose="trabajando" alto={170} flotar />
          </div>
          <p className="mt-3 text-sm opacity-70">
            Esta obra aun no tiene cronograma.
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm opacity-60">
            Al cargarlo se veran las tareas con sus fechas, la ruta critica y
            el avance planeado que trae el propio archivo.
          </p>
          {puedeImportar && (
            <Link
              href={`/obras/${id}/cronograma/importar`}
              className="mt-4 inline-flex items-center gap-2 text-sm font-medium underline"
            >
              Cargar el cronograma desde MS Project
            </Link>
          )}
        </div>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Dato
              etiqueta="Corte"
              valor={fechaLarga(cronograma.fechaCorte)}
              destacado
            />
            <Dato etiqueta="Tareas" valor={String(cronograma.tareas.length)} />
            <Dato
              etiqueta="Ruta critica"
              valor={`${cronograma.tareas.filter((t) => t.esCritico).length} tareas`}
            />
            <Dato etiqueta="Version" valor={`v${cronograma.version}`} />
          </dl>

          <p className="text-xs opacity-60">
            {cronograma.archivo} · cargado por {cronograma.importadoPor}{" "}
            {haceCuanto(cronograma.importadoAt)}
          </p>

          {/* El plazo del cronograma puede no coincidir con las fechas que
              tiene registrada la obra, y conviene que se vea: en CRIOCORD la
              obra decia 22/10 y el Project 05/10. */}
          <DesajusteDePlazo
            inicioObra={obra.fechaInicio}
            finObra={obra.fechaFinProgramada}
            tareas={cronograma.tareas}
          />

          {cronograma.huerfanos.length > 0 && (
            <Mensaje tono="alerta" icono={<AlertTriangle className="size-4 shrink-0" />}>
              <span>
                Hay {cronograma.huerfanos.length} reporte(s) de avance de tareas
                que ya no estan en el cronograma. No se han borrado: si la tarea
                vuelve a aparecer en Project, su avance sigue ahi.
                <span className="mt-1 block font-mono text-xs opacity-70">
                  {cronograma.huerfanos
                    .map((h) => `UID ${h.uid} · ${decimal(h.porcentaje, "")}% · ${fechaCorta(h.fecha)}`)
                    .join("  |  ")}
                </span>
              </span>
            </Mensaje>
          )}

          <Tarjeta>
            <h3 className="text-base font-semibold">Curva de avance</h3>
            <p className="mt-0.5 mb-4 text-sm opacity-70">
              La linea de puntos es el plan repartido dia a dia; la continua, lo
              medido en cada corte. Cada tarea pesa segun su duracion, no todas
              por igual: terminar una partida de un dia no es lo mismo que
              terminar una de veinte.
            </p>

            <CurvaS
              datos={curva}
              obraId={id}
              nombreObra={obra.nombreObra}
              totalTareas={cronograma.tareas.length}
              totalCriticas={cronograma.tareas.filter((t) => t.esCritico).length}
            />

            {curva.cortes.length === 1 && (
              <p className="mt-3 text-xs opacity-60">
                Con un solo corte la linea real es todavia un punto. Carga los
                cortes siguientes y se ira dibujando sola.
              </p>
            )}

            <p className="mt-3 text-xs opacity-60">
              La ponderacion es por duracion porque es el unico peso que trae el
              archivo —no lleva costes ni horas de trabajo—.{" "}
              <Link
                href={`/obras/${id}/cronograma/mapeo`}
                className="font-medium underline"
              >
                Enlaza las tareas con las partidas del presupuesto
              </Link>{" "}
              y pasara a ponderarse por dinero, que es lo que hace comparable el
              avance con lo comprometido.
            </p>
          </Tarjeta>

          <Tarjeta>
            <h3 className="text-base font-semibold">Que esta frenando la obra</h3>
            <p className="mt-0.5 mb-4 text-sm opacity-70">
              Solo partidas de trabajo. Un capitulo atrasado no se lista aparte:
              lo esta porque lo estan sus partidas.
            </p>

            <AlertasAtraso
              alertas={alertasDeAtraso(cronograma.tareas, cronograma.fechaCorte)}
            />
          </Tarjeta>

          <Tarjeta>
            <h3 className="text-base font-semibold">Avance por capitulo</h3>
            <p className="mt-0.5 mb-4 text-sm opacity-70">
              La lectura que falta entre la curva —una cifra para toda la obra— y
              la tabla de {cronograma.tareas.length} filas.
            </p>

            <ControlCapitulos capitulos={agruparPorCapitulo(cronograma.tareas)} />
          </Tarjeta>

          <TablaCronograma
            obraId={id}
            tareas={cronograma.tareas}
            puedeRegistrar={puede(sesion, "avance:registrar")}
          />

          <p className="text-xs opacity-60">
            La marca vertical de cada barra es el % planeado que trae el
            archivo. El porcentaje en gris es el que dice MS Project, porque
            todavia nadie lo ha reportado desde obra.
          </p>

          {historial.length > 1 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold">Cortes cargados</h3>
              <ul className="space-y-1.5 text-sm">
                {historial.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-2">
                    <Chip tono={c.version === cronograma.version ? "curso" : "neutro"}>
                      v{c.version}
                    </Chip>
                    <span>{fechaLarga(c.fechaCorte)}</span>
                    <span className="opacity-60">
                      {c.tareas} tareas · {c.archivo} · {c.importadoPor}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Dato({
  etiqueta,
  valor,
  destacado,
}: {
  etiqueta: string;
  valor: string;
  destacado?: boolean;
}) {
  return (
    <div
      className="rounded-lg border p-3"
      style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
    >
      <dt className="text-xs opacity-60">{etiqueta}</dt>
      <dd
        className={`mt-0.5 ${destacado ? "text-base font-semibold" : "text-base font-medium"}`}
      >
        {valor}
      </dd>
    </div>
  );
}

function Mensaje({
  tono,
  icono,
  children,
}: {
  tono: "exito" | "alerta";
  icono: React.ReactNode;
  children: React.ReactNode;
}) {
  const color = tono === "exito" ? "var(--color-exito)" : "var(--color-alerta)";

  return (
    <p
      role="status"
      className="flex items-start gap-2 rounded-lg px-4 py-3 text-sm"
      style={{ backgroundColor: `color-mix(in oklab, ${color} 15%, transparent)` }}
    >
      {icono}
      <span>{children}</span>
    </p>
  );
}

/**
 * Aviso de que la obra y el cronograma no cuentan el mismo plazo.
 *
 * Son dos registros distintos: las fechas de la ficha de obra las teclea
 * alguien al darla de alta, y las del cronograma las calcula Project. Cuando
 * el planificador reprograma, la ficha se queda vieja y nadie se entera. En
 * CRIOCORD la obra decia 22/10 y el Project terminaba el 05/10.
 *
 * No se corrige sola: cambiar la fecha de la obra desde aqui seria escribir
 * en un campo del que este modulo no es dueno.
 */
function DesajusteDePlazo({
  inicioObra,
  finObra,
  tareas,
}: {
  inicioObra: Date;
  finObra: Date;
  tareas: { inicio: Date; fin: Date }[];
}) {
  if (tareas.length === 0) return null;

  const inicioPlan = tareas.reduce((m, t) => (t.inicio < m ? t.inicio : m), tareas[0]!.inicio);
  const finPlan = tareas.reduce((m, t) => (t.fin > m ? t.fin : m), tareas[0]!.fin);

  const dia = (f: Date) => f.toISOString().slice(0, 10);
  if (dia(inicioPlan) === dia(inicioObra) && dia(finPlan) === dia(finObra)) return null;

  return (
    <p className="flex items-start gap-2 text-sm opacity-70">
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>
        El cronograma va de {fechaCronograma(inicioPlan)} a{" "}
        {fechaCronograma(finPlan)}, y la ficha de la obra registra{" "}
        {fechaCronograma(inicioObra)} a {fechaCronograma(finObra)}. Si la
        reprogramacion es firme, conviene actualizar la ficha.
      </span>
    </p>
  );
}
