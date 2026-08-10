import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { MapPin, CalendarDays, Plus } from "lucide-react";
import { obtenerSesion } from "@/services/sesion.service";
import {
  listarObras,
  listarAlertasEmpresa,
  obtenerResumenEmpresa,
} from "@/services/obras.service";
import { listarActividad } from "@/services/actividad.service";
import { avanceFisicoPorObra } from "@/services/cronograma.service";
import {
  listarObrasParaTablero,
  datosTablero,
} from "@/services/tablero.service";
import {
  COOKIE_TABLERO,
  COOKIE_TABLERO_OBRA,
  modulosValidos,
} from "@/lib/tablero";
import { Tablero } from "@/components/tablero/Tablero";
import { puede } from "@/lib/rbac";
import {
  ETIQUETA_ESTADO_OBRA,
  TONO_ESTADO_OBRA,
  type EstadoObra,
} from "@/lib/obras";
import { soles } from "@/utils/formato";
import { fechaCorta, avanceCalendario, diasEntre, hoy } from "@/utils/fechas";
import { Chip } from "@/components/ui/Chip";
import { Mascota } from "@/components/ui/Mascota";
import { Paginacion } from "@/components/ui/Paginacion";
import { AcentoTitulo, Regla } from "@/components/ui/Regla";
import { FiltrosObras } from "@/components/obras/FiltrosObras";
import { FranjaObra, type AlertaObra } from "@/components/obras/FranjaObra";
import { ResumenEmpresaPanel } from "@/components/obras/ResumenEmpresaPanel";
import { ActividadReciente } from "@/components/obras/ActividadReciente";

export const metadata: Metadata = { title: "Panel" };

export default async function PanelPage({
  searchParams,
}: {
  searchParams: Promise<{
    p?: string;
    q?: string;
    estado?: string;
    obra?: string;
  }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const consulta = await searchParams;
  const filtros = { q: consulta.q, estado: consulta.estado };
  const hayFiltro = Object.values(filtros).some(Boolean);

  const [obras, resumen, alertasEmpresa, actividad] = await Promise.all([
    listarObras(sesion, {
      pagina: consulta.p,
      // Doce por pagina: con la rejilla de tres columnas son cuatro filas
      // completas, sin dejar huecos al final.
      porPagina: 12,
      q: consulta.q,
      estado: consulta.estado,
    }),
    // Las cifras, las alertas y la actividad son de la empresa entera: no
    // dependen del filtro ni de la pagina, y por eso van en sus propias
    // consultas.
    obtenerResumenEmpresa(sesion),
    listarAlertasEmpresa(sesion),
    listarActividad(sesion),
  ]);

  // El avance fisico se pide DESPUES y solo para las obras de esta pagina:
  // depende de cuales sean, asi que no puede ir en el bloque paralelo de
  // arriba. Son tres consultas para todas ellas, no una por tarjeta.
  const avanceFisico = await avanceFisicoPorObra(
    sesion,
    obras.filas.map((o) => o.id),
  );

  const puedeCrear = puede(sesion, "obra:crear");

  // Sin filtros, «no hay obras» significa que la empresa esta vacia; con
  // filtros solo significa que ninguna coincide. Son dos pantallas distintas.
  const vacioDeVerdad = obras.total === 0 && !hayFiltro;

  // El tablero: obras para el selector, la seleccion guardada y los modulos
  // encendidos. La obra elegida sale de la URL, si no de la cookie, y si no de
  // la primera obra que haya. Se resuelve aparte de la lista de arriba porque
  // esa esta paginada y filtrada, y la obra supervisada puede no estar en la
  // pagina visible.
  const almacen = await cookies();
  const modulosTablero = modulosValidos(almacen.get(COOKIE_TABLERO)?.value);
  const obrasTablero = vacioDeVerdad
    ? []
    : await listarObrasParaTablero(sesion);

  const obraElegida =
    consulta.obra ??
    almacen.get(COOKIE_TABLERO_OBRA)?.value ??
    obrasTablero[0]?.id;

  // Si la cookie apunta a una obra que ya no existe —borrada, o de otra
  // empresa tras cambiar de contexto—, se cae a la primera disponible en vez
  // de dejar el tablero en blanco.
  const obraValida = obrasTablero.some((o) => o.id === obraElegida)
    ? obraElegida
    : obrasTablero[0]?.id;

  // Se le pasan los modulos encendidos: el tablero carga SOLO lo que se ve.
  // Antes traia los datos de todos, y con once modulos eso tumbo produccion.
  const datosDelTablero = obraValida
    ? await datosTablero(sesion, obraValida, modulosTablero)
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <AcentoTitulo>
          <h1 className="text-2xl font-semibold tracking-tight">Obras</h1>
          <p className="mt-1 text-sm opacity-70">
            {vacioDeVerdad
              ? "Aun no hay obras registradas."
              : `${obras.total} obra(s)${hayFiltro ? " coinciden" : " en tu empresa"}.`}
          </p>
        </AcentoTitulo>

        {puedeCrear && !vacioDeVerdad && (
          <Link
            href="/obras/nueva"
            className="inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
            style={{ backgroundColor: "var(--color-marca-600)" }}
          >
            <Plus className="size-4" aria-hidden="true" />
            Nueva obra
          </Link>
        )}
      </div>

      {/* El tablero encabeza todo: es la obra que se supervisa, con sus
          indicadores juntos. Debajo van las cifras de la empresa entera y la
          lista. Con la empresa vacia no se pinta: no hay obra que supervisar. */}
      {!vacioDeVerdad && (
        <Tablero
          obras={obrasTablero}
          datos={datosDelTablero}
          modulosIniciales={modulosTablero}
          alertas={alertasEmpresa}
        />
      )}

      {/* Las cifras de empresa: lectura de gerencia de un vistazo, por debajo
          del tablero de la obra. Con la empresa vacia no se pintan: cuatro
          ceros no informan de nada. */}
      {!vacioDeVerdad && (
        <ResumenEmpresaPanel resumen={resumen} alertas={alertasEmpresa} />
      )}

      {/* El buscador no se pinta con la empresa vacia: no hay nada que
          filtrar y solo estorbaria al unico paso que toca, crear la obra. */}
      {!vacioDeVerdad && <FiltrosObras />}

      {vacioDeVerdad ? (
        <div
          className="rounded-xl border border-dashed p-10 text-center"
          style={{ borderColor: "var(--borde)" }}
        >
          <div className="flex justify-center">
            <Mascota pose="saludando" alto={180} flotar />
          </div>
          <p className="mt-3 text-sm opacity-70">
            Crea tu primera obra para empezar a cargar el presupuesto.
          </p>
          {puedeCrear && (
            <Link
              href="/obras/nueva"
              className="mt-4 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
              style={{ backgroundColor: "var(--color-marca-600)" }}
            >
              <Plus className="size-4" aria-hidden="true" />
              Nueva obra
            </Link>
          )}
        </div>
      ) : obras.filas.length === 0 ? (
        <div
          className="rounded-xl border border-dashed p-10 text-center"
          style={{ borderColor: "var(--borde)" }}
        >
          <div className="flex justify-center">
            <Mascota pose="pensando" alto={150} />
          </div>
          <p className="mt-3 text-sm opacity-70">
            Ninguna obra coincide con la busqueda.
          </p>
        </div>
      ) : (
        <>
        {/* Las reglas enmarcan la rejilla: le dan un principio y un final
            claros en vez de dejarla flotando sobre el fondo. */}
        <Regla />

        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {obras.filas.map((obra) => {
            const avance = avanceCalendario(
              obra.fechaInicio,
              obra.fechaFinProgramada,
            );

            // Comprometido sobre presupuesto. Sin presupuesto cargado no hay
            // proporcion posible, y se deja en 0 en vez de dividir entre cero.
            const presupuesto = Number(obra.presupuestoTotal);
            const comprometido = Number(obra.comprometido);
            const porcentajeComprometido =
              presupuesto > 0 ? (comprometido / presupuesto) * 100 : 0;

            /**
             * Solo alertas con dato real. Las obras sin cronograma cargado no
             * generan aviso de avance: el globo dice que falta el dato en vez
             * de callar, para que la ausencia de avisos no se lea como que
             * todo va bien.
             */
            const alertas: AlertaObra[] = [];

            // El avance fisico del ultimo corte del cronograma, si la obra
            // tiene uno cargado.
            const fisico = avanceFisico.get(obra.id);

            if (fisico) {
              const desfase = Number(fisico.desfase);

              // Solo se avisa a partir de cinco puntos: por debajo es ruido de
              // redondeo del reparto diario, no un atraso que nadie deba
              // corregir.
              if (desfase <= -5) {
                alertas.push({
                  clave: "avance",
                  texto: `La obra va ${Math.abs(desfase).toFixed(1)} puntos por detras del plan`,
                  detalle: `Avance real ${Number(fisico.real).toFixed(1)}% frente al ${Number(fisico.planeado).toFixed(1)}% previsto en el corte del ${fechaCorta(fisico.fechaCorte)}.`,
                });
              }

              /**
               * La ficha de la obra y el cronograma no cuentan el mismo plazo.
               *
               * Son dos registros distintos: la fecha de la ficha la teclea
               * alguien al dar de alta la obra, y la del cronograma la calcula
               * Project. Cuando el planificador reprograma, la ficha se queda
               * vieja y nadie se entera —y de esa fecha salen la barra de
               * calendario y el aviso de plazo vencido, asi que arrastra el
               * error a todo lo demas—.
               */
              const desvio = diasEntre(obra.fechaFinProgramada, fisico.finPlan);

              if (Math.abs(desvio) > 2) {
                alertas.push({
                  clave: "plazo-cronograma",
                  texto:
                    desvio < 0
                      ? `El cronograma termina ${Math.abs(desvio)} dia(s) antes que la ficha`
                      : `El cronograma termina ${desvio} dia(s) despues que la ficha`,
                  detalle: `Cronograma: ${fechaCorta(fisico.finPlan)}. Ficha de la obra: ${fechaCorta(obra.fechaFinProgramada)}. De la ficha salen la barra de calendario y el aviso de plazo vencido.`,
                });
              }
            }

            if (obra.partidasSobregiradas > 0) {
              alertas.push({
                clave: "sobregiro",
                texto:
                  obra.partidasSobregiradas === 1
                    ? "1 partida comprometida por encima de su presupuesto"
                    : `${obra.partidasSobregiradas} partidas comprometidas por encima de su presupuesto`,
                detalle:
                  "Se corrige con una reconversion que traiga presupuesto de otra partida, o con un adicional.",
              });
            }

            const diasDeRetraso = diasEntre(obra.fechaFinProgramada, hoy());

            if (diasDeRetraso > 0 && obra.estado === "EN_EJECUCION") {
              alertas.push({
                clave: "plazo",
                texto: `El plazo vencio hace ${diasDeRetraso} dia(s)`,
                detalle:
                  "La obra sigue en ejecucion despues de la fecha de fin programada.",
              });
            }

            if (presupuesto > 0 && comprometido > presupuesto) {
              alertas.push({
                clave: "presupuesto",
                texto: "El comprometido supera el presupuesto de la obra",
                // Sin el «sin IGV» que ponia antes: el comprometido es el
                // importe imputable de cada orden, y en las de retencion ese
                // importe es el total, no el neto.
                detalle: `${soles(obra.comprometido)} sobre ${soles(obra.presupuestoTotal)}.`,
              });
            }

            return (
              // `h-full` en el `li` y en el enlace, con la franja empujada al
              // pie: sin esto cada tarjeta mide lo que mide su contenido —un
              // titulo de dos lineas, una obra sin ubicacion— y la fila queda
              // desalineada. Asi todas ocupan el alto de la mas alta y las
              // barras arrancan a la misma altura.
              <li key={obra.id} className="h-full">
                <Link
                  href={`/obras/${obra.id}`}
                  className="tarjeta-interactiva flex h-full flex-col rounded-xl border p-4"
                  style={{
                    borderColor: "var(--borde)",
                    backgroundColor: "var(--superficie)",
                  }}
                >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-medium opacity-60">
                    {/* El correlativo del sistema encabeza; el codigo de la
                        persona, si lo hay, va detras. */}
                    {obra.correlativo ?? "Sin correlativo"}
                    {obra.codigoObra && ` · ${obra.codigoObra}`}
                  </span>
                  <Chip tono={TONO_ESTADO_OBRA[obra.estado as EstadoObra]}>
                    {ETIQUETA_ESTADO_OBRA[obra.estado as EstadoObra] ??
                      obra.estado}
                  </Chip>
                </div>

                <h2 className="mt-2 text-sm font-semibold text-balance">
                  {obra.nombreObra}
                </h2>

                {obra.ubicacion && (
                  <p className="mt-2 flex items-start gap-1.5 text-xs opacity-70">
                    <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                    <span>{obra.ubicacion}</span>
                  </p>
                )}

                <p className="mt-1.5 flex items-center gap-1.5 text-xs opacity-70">
                  <CalendarDays className="size-3.5 shrink-0" aria-hidden="true" />
                  {fechaCorta(obra.fechaInicio)} &ndash;{" "}
                  {fechaCorta(obra.fechaFinProgramada)}
                </p>

                {/* `mt-auto` empuja las cifras y la franja al pie de la
                    tarjeta, para que las barras de todas arranquen a la misma
                    altura por muy distinto que sea el texto de arriba. */}
                <dl
                  className="mt-auto grid grid-cols-2 gap-3 border-t pt-3"
                  style={{ borderColor: "var(--borde)" }}
                >
                  <div>
                    <dt className="text-xs opacity-60">Presupuesto</dt>
                    <dd className="mt-0.5 text-sm font-semibold tabular-nums">
                      {soles(obra.presupuestoTotal)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs opacity-60">Partidas</dt>
                    <dd className="mt-0.5 text-sm font-semibold tabular-nums">
                      {obra.totalPartidas}
                    </dd>
                  </div>
                </dl>

                <FranjaObra
                  calendario={avance}
                  comprometido={porcentajeComprometido}
                  etiquetaComprometido={
                    presupuesto > 0
                      ? `${soles(obra.comprometido)} de ${soles(obra.presupuestoTotal)}`
                      : "sin presupuesto cargado"
                  }
                  avanceFisico={
                    fisico
                      ? {
                          real: Number(fisico.real),
                          planeado: Number(fisico.planeado),
                          corte: fechaCorta(fisico.fechaCorte),
                        }
                      : undefined
                  }
                  alertas={alertas}
                />
                </Link>
              </li>
            );
          })}
        </ul>

        <Regla intensidad="suave" />
        </>
      )}

      <Paginacion
        pagina={obras.pagina}
        totalPaginas={obras.totalPaginas}
        total={obras.total}
        porPagina={12}
        etiqueta="obras"
        // Los filtros viajan con la pagina; perderlos al avanzar reiniciaria
        // la busqueda que el usuario acaba de hacer.
        params={filtros}
      />

      {/* Debajo de las obras y no encima: contesta a «que ha pasado» cuando
          ya se ha visto «como va», que es el orden en que se mira un panel. */}
      <ActividadReciente entradas={actividad} />
    </div>
  );
}
