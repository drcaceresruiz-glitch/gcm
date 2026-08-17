import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  FileText,
  GanttChartSquare,
  Info,
} from "lucide-react";
import { obtenerSesion } from "@/services/sesion.service";
import { obtenerObra } from "@/services/obras.service";
import {
  obtenerCronograma,
  historialCronogramas,
  datosCurvaS,
  lineaBaseCronograma,
} from "@/services/cronograma.service";
import { datosEvm } from "@/services/evm.service";
import { filasHitos } from "@/lib/hitos";
import { CurvaS } from "@/components/cronograma/CurvaS";
import { PanelEvm } from "@/components/cronograma/PanelEvm";
import { Hitos } from "@/components/cronograma/Hitos";
import { BotonLineaBase } from "@/components/cronograma/BotonLineaBase";
import { DiaCorteSemanal } from "@/components/cronograma/DiaCorteSemanal";
import { ControlCapitulos } from "@/components/cronograma/ControlCapitulos";
import { AlertasAtraso } from "@/components/cronograma/AlertasAtraso";
import { CadenaCritica } from "@/components/cronograma/CadenaCritica";
import {
  agruparPorCapitulo,
  alertasDeAtraso,
  cadenaCritica,
} from "@/lib/control-avance";
import { puede } from "@/lib/rbac";
import { fechaCorta, fechaCronograma, fechaLarga, haceCuanto } from "@/utils/fechas";
import { decimal } from "@/utils/formato";
import { Mascota } from "@/components/ui/Mascota";
import { Chip } from "@/components/ui/Chip";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { TablaCronograma } from "@/components/cronograma/TablaCronograma";
import { TareasAMano } from "@/components/cronograma/TareasAMano";
import { GenerarEdt } from "@/components/cronograma/GenerarEdt";
import { listarTareasManuales } from "@/services/cronograma-manual.service";

export const metadata: Metadata = { title: "Cronograma" };

/**
 * Nombre del dia de corte por indice ISO (1=lunes … 7=domingo), EN PLURAL.
 *
 * En plural porque la frase que lo usa es «Corte semanal los ___». De lunes a
 * viernes el plural es invariable y por eso el fallo no se veia; el dia que se
 * configuro sabado salio «Corte semanal los sábado».
 */
const DIAS_SEMANA: Record<number, string> = {
  1: "lunes", 2: "martes", 3: "miércoles", 4: "jueves",
  5: "viernes", 6: "sábados", 7: "domingos",
};

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

  const [cronograma, historial, curva, evm, baseCron] = await Promise.all([
    obtenerCronograma(sesion, id),
    historialCronogramas(sesion, id),
    datosCurvaS(sesion, id),
    datosEvm(sesion, id),
    lineaBaseCronograma(sesion, id),
  ]);

  const puedeImportar = puede(sesion, "cronograma:importar");
  const puedeEditarTareas = puede(sesion, "cronograma:editar");
  const puedeEliminarTareas = puede(sesion, "cronograma:eliminar");
  // Las escritas a mano se leen aparte: solo esta pantalla las distingue.
  const tareasAMano = await listarTareasManuales(sesion, id);
  // El regimen laboral de la obra: con el, el formulario calcula la duracion
  // de una tarea en dias de TRABAJO en cuanto se teclean sus dos fechas.
  const calendarioObra = (
    await prisma.workCalendar.findMany({
      where: { projectId: id },
      select: { diaSemana: true, laborable: true, horas: true },
    })
  ).map((d) => ({ ...d, horas: d.horas.toString() }));
  const puedeLineaBase = puede(sesion, "cronograma:linea_base");

  // La fecha por defecto del reporte se alinea al ultimo dia de corte semanal.
  const fechaReporteDefecto = curva.cadencia.ultimoCorteEsperado
    ? curva.cadencia.ultimoCorteEsperado.toISOString().slice(0, 10)
    : undefined;

  // Los hitos vigentes cruzados con los de la base, para la tabla de hitos.
  const filasDeHitos = cronograma
    ? filasHitos(
        cronograma.tareas
          .filter((t) => t.esHito)
          .map((t) => ({
            uid: t.uid,
            nombre: t.nombre,
            fin: t.fin,
            avance: Number(t.porcentajeReal) || 0,
          })),
        (baseCron?.tareas ?? [])
          .filter((t) => t.esHito)
          .map((t) => ({ uid: t.uid, fin: t.fin })),
        cronograma.fechaCorte,
      )
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Cronograma</h2>
          <p className="mt-0.5 text-sm opacity-70">
            El plan lo manda MS Project; el avance real, GCM.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {cronograma && (
            <Link
              href={`/obras/${id}/cronograma/gantt`}
              className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium"
              style={{ borderColor: "var(--borde)" }}
            >
              <GanttChartSquare className="size-4" aria-hidden="true" />
              Diagrama de Gantt
            </Link>
          )}

          {cronograma && (
            <Link
              href={`/obras/${id}/cronograma/informe`}
              className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium"
              style={{ borderColor: "var(--borde)" }}
            >
              <FileText className="size-4" aria-hidden="true" />
              Informe semanal
            </Link>
          )}

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
      </div>

      {cargado && (
        <Mensaje tono="exito" icono={<CheckCircle2 className="size-4 shrink-0" />}>
          Cronograma cargado como versión {cargado}.
        </Mensaje>
      )}

      {repetido && (
        <Mensaje tono="alerta" icono={<Info className="size-4 shrink-0" />}>
          Ese corte ya estaba cargado (versión {repetido}), así que no se ha
          creado ninguna versión nueva. Para registrar un corte nuevo, fija otra
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
            Esta obra aún no tiene cronograma.
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm opacity-60">
            Al cargarlo se verán las tareas con sus fechas, la ruta crítica y
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

          {/* El camino corto, y el que mejor cuadra: el presupuesto YA es la
              EDT. Va el primero porque teclear las tareas a mano teniendo el
              presupuesto es escribir dos veces la misma estructura. */}
          {puedeEditarTareas && (
            <div className="mt-6 flex flex-col items-center gap-2">
              <GenerarEdt obraId={id} />
              <p className="max-w-md text-xs text-pretty opacity-60">
                El capítulo es la rama, la partida es el paquete de trabajo y
                sus subpartidas son las tareas. Solo tendrás que poner las
                fechas en las tareas: los paquetes las heredan.
              </p>
            </div>
          )}

          {/* La otra via: teclearlo. Una obra pequena no tiene planificador
              ni licencia de Project, y sin cronograma no hay curva S, ni valor
              ganado, ni informe semanal. La primera tarea crea la version. */}
          <div className="mt-6 flex flex-col items-center gap-3">
            <TareasAMano
              obraId={id}
              tareas={tareasAMano}
              puedeEditar={puedeEditarTareas}
              puedeEliminar={puedeEliminarTareas}
              calendario={calendarioObra}
            />
          </div>
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
              etiqueta="Ruta crítica"
              valor={`${cronograma.tareas.filter((t) => t.esCritico).length} tareas`}
            />
            <Dato etiqueta="Versión" valor={`v${cronograma.version}`} />
          </dl>

          <p className="text-xs opacity-60">
            {/* Sin archivo el cronograma se tecleo aqui: decirlo es mas util
                que dejar el hueco, que ademas colgaria un « · » suelto. */}
            {cronograma.archivo ?? "Escrito en GCM"} · cargado por{" "}
            {cronograma.importadoPor} {haceCuanto(cronograma.importadoAt)}
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
                que ya no están en el cronograma. No se han borrado: si la tarea
                vuelve a aparecer en Project, su avance sigue ahí.
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
              La línea de puntos es el plan repartido día a día; la continua, lo
              medido en cada corte. Cada tarea pesa según su duración, no todas
              por igual: terminar una partida de un día no es lo mismo que
              terminar una de veinte.
            </p>

            <div
              className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
              style={{ borderColor: "var(--borde)" }}
            >
              <p className="text-sm">
                Corte semanal los{" "}
                <strong>{DIAS_SEMANA[obra.diaCorteSemanal] ?? "viernes"}</strong>.
                {curva.cadencia.ultimoCorteEsperado &&
                  (curva.cadencia.semanaPendiente ? (
                    <span style={{ color: "var(--color-peligro)" }}>
                      {" "}Falta el reporte del corte del{" "}
                      {fechaCorta(curva.cadencia.ultimoCorteEsperado)}.
                    </span>
                  ) : (
                    <span style={{ color: "var(--color-exito)" }}>
                      {" "}Al día (último corte{" "}
                      {fechaCorta(curva.cadencia.ultimoCorteEsperado)}).
                    </span>
                  ))}
              </p>
              {puedeImportar && (
                <DiaCorteSemanal obraId={id} diaActual={obra.diaCorteSemanal} />
              )}
            </div>

            <CurvaS
              datos={curva}
              obraId={id}
              nombreObra={obra.nombreObra}
              totalTareas={cronograma.tareas.length}
              totalCriticas={cronograma.tareas.filter((t) => t.esCritico).length}
            />

            {curva.cortes.length === 1 && (
              <p className="mt-3 text-xs opacity-60">
                Con un solo corte la línea real es todavía un punto. Carga los
                cortes siguientes y se irá dibujando sola.
              </p>
            )}

            <p className="mt-3 text-xs opacity-60">
              La ponderación es por duración porque es el único peso que trae el
              archivo —no lleva costes ni horas de trabajo—.{" "}
              <Link
                href={`/obras/${id}/cronograma/mapeo`}
                className="font-medium underline"
              >
                Enlaza las tareas con las partidas del presupuesto
              </Link>{" "}
              y pasará a ponderarse por dinero, que es lo que hace comparable el
              avance con lo comprometido.
            </p>
          </Tarjeta>

          {evm && (
            <Tarjeta>
              <h3 className="text-base font-semibold">Valor ganado (EVM)</h3>
              <p className="mt-0.5 mb-4 text-sm opacity-70">
                El avance y el gasto en la misma escala de dinero: el control
                integrado de plazo y costo. El SPI dice cómo se va de plazo; el
                CPI, de costo.
              </p>

              <PanelEvm datos={evm} />
            </Tarjeta>
          )}

          <Tarjeta>
            <h3 className="text-base font-semibold">Hitos</h3>
            <p className="mt-0.5 mb-4 text-sm opacity-70">
              Las fechas clave del cronograma.{" "}
              {baseCron
                ? "El desvío se mide contra la línea base."
                : "Fija una línea base para medir su desvío."}
            </p>

            <Hitos filas={filasDeHitos} hayBase={baseCron !== null} />
          </Tarjeta>

          <Tarjeta>
            <h3 className="text-base font-semibold">Qué está frenando la obra</h3>
            <p className="mt-0.5 mb-4 text-sm opacity-70">
              Solo partidas de trabajo. Un capítulo atrasado no se lista aparte:
              lo está porque lo están sus partidas.
            </p>

            <AlertasAtraso
              alertas={alertasDeAtraso(cronograma.tareas, cronograma.fechaCorte)}
            />
          </Tarjeta>

          <Tarjeta>
            <h3 className="text-base font-semibold">Ruta crítica</h3>
            <p className="mt-0.5 mb-4 text-sm opacity-70">
              La cadena de tareas cuyo atraso corre la fecha de entrega de toda
              la obra. No aparecen ni los capítulos ni los hitos que Project
              también marca como críticos: no son trabajo sobre el que se pueda
              actuar.
            </p>

            <CadenaCritica
              cadena={cadenaCritica(cronograma.tareas, cronograma.fechaCorte)}
            />
          </Tarjeta>

          <Tarjeta>
            <h3 className="text-base font-semibold">Avance por capítulo</h3>
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
            fechaReporteDefecto={fechaReporteDefecto}
          />

          {/* Solo las escritas aqui. Las que vinieron de un archivo no se
              editan: el siguiente corte las devolveria como estaban. */}
          <TareasAMano
            obraId={id}
            tareas={tareasAMano}
            puedeEditar={puedeEditarTareas}
            puedeEliminar={puedeEliminarTareas}
            calendario={calendarioObra}
          />

          <p className="text-xs opacity-60">
            La marca vertical de cada barra es el % planeado que trae el
            archivo. El porcentaje en gris es el que dice MS Project, porque
            todavía nadie lo ha reportado desde obra.
          </p>

          {historial.length >= 1 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold">Cortes y línea base</h3>
              <ul className="space-y-2 text-sm">
                {historial.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-2">
                    <Chip tono={c.version === cronograma.version ? "curso" : "neutro"}>
                      v{c.version}
                    </Chip>
                    <span>{fechaLarga(c.fechaCorte)}</span>
                    <span className="opacity-60">
                      {c.tareas} tareas · {c.archivo ?? "Escrito en GCM"} ·{" "}
                      {c.importadoPor}
                    </span>
                    <BotonLineaBase
                      obraId={id}
                      cronogramaId={c.id}
                      version={c.version}
                      fecha={fechaCorta(c.fechaCorte)}
                      esActual={c.id === baseCron?.id}
                      puedeFijar={puedeLineaBase}
                    />
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
        reprogramación es firme, conviene actualizar la ficha.
      </span>
    </p>
  );
}
