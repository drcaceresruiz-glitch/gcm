import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MapPin, CalendarDays, Plus } from "lucide-react";
import { obtenerSesion } from "@/services/sesion.service";
import {
  listarObras,
  listarAlertasEmpresa,
  obtenerResumenEmpresa,
} from "@/services/obras.service";
import { listarActividad } from "@/services/actividad.service";
import { avanceFisicoPorObra } from "@/services/cronograma.service";
import { semaforoDeCartera } from "@/services/gerencia.service";
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
import { Bienvenida } from "@/components/obras/Bienvenida";
import { FiltrosObras } from "@/components/obras/FiltrosObras";
import { FranjaObra, type AlertaObra } from "@/components/obras/FranjaObra";
import { ResumenEmpresaPanel } from "@/components/obras/ResumenEmpresaPanel";
import { SemaforoCarteraPanel } from "@/components/obras/SemaforoCarteraPanel";
import { ActividadReciente } from "@/components/obras/ActividadReciente";
import { FranjaSemana } from "@/components/obras/FranjaSemana";
// El MISMO menu que dentro de una obra, con otro mapa: un solo vocabulario
// para los dos niveles del sistema.
import { MenuObra, type FaseMenu } from "@/components/obras/MenuObra";
import { preliminaresDeEmpresa } from "@/services/preliminares.service";
import { siguientePasoDeEmpresa } from "@/lib/puesta-en-marcha";
import { semanaDeLaEmpresa } from "@/services/plan-semanal.service";
import { contarSolicitudesPendientes } from "@/services/perfil.service";

export const metadata: Metadata = { title: "Panel" };

export default async function PanelPage({
  searchParams,
}: {
  searchParams: Promise<{
    p?: string;
    q?: string;
    estado?: string;
  }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const consulta = await searchParams;
  const filtros = { q: consulta.q, estado: consulta.estado };
  const hayFiltro = Object.values(filtros).some(Boolean);

  const [
    obras,
    resumen,
    alertasEmpresa,
    actividad,
    preliminares,
    solicitudes,
    semanas,
    semaforo,
  ] = await Promise.all([
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
    preliminaresDeEmpresa(sesion),
    contarSolicitudesPendientes(sesion),
    // El estado del ritual semanal en TODAS las obras: es de empresa por la
    // misma razon que las alertas, porque la semana que se pasa es la de la
    // obra que no estas mirando.
    semanaDeLaEmpresa(sesion),
    // El mismo semaforo de `/gerencia`, en version compacta: null para quien
    // no ve toda la cartera, sin consulta extra -la puerta la pone el propio
    // servicio-.
    semaforoDeCartera(sesion),
  ]);

  // El avance fisico se pide DESPUES y solo para las obras de esta pagina:
  // depende de cuales sean, asi que no puede ir en el bloque paralelo de
  // arriba. Son tres consultas para todas ellas, no una por tarjeta.
  const avanceFisico = await avanceFisicoPorObra(
    sesion,
    obras.filas.map((o) => o.id),
  );

  const puedeCrear = puede(sesion, "obra:crear");

  /**
   * El mapa de la CONSTRUCTORA, igual que el de la obra tiene el suyo.
   *
   * Se reusa `MenuObra` a proposito, con su mismo vocabulario —titulo, la
   * pregunta que responde, y la marca de hecho—. Escribir un lateral paralelo
   * habria obligado a aprender dos mapas del mismo territorio, que es
   * exactamente el error que ya se corrigio dentro de la obra el 12/08.
   *
   * Lo que hay aqui vivia SOLO en el desplegable «Empresa» de la cabecera, que
   * su propio codigo admite que llego a siete entradas seguidas y hubo que
   * agrupar. Un desplegable esconde; un lateral enseña que existe.
   *
   * LAS MARCAS DE HECHO SE APAGAN SOLAS. Mientras la constructora esta a medio
   * cargar, el menu es ademas la guia de puesta en marcha; cuando ya esta todo,
   * `preliminares.completo` las quita y vuelve a ser navegacion a secas. Una
   * fila de checks verdes permanente es ruido.
   */
  const marca = (hecho: boolean) => (preliminares.completo ? undefined : hecho);

  /**
   * El paso que falta para tener la constructora en marcha.
   *
   * No pinta un cartel propio: se lo pasa a `Bienvenida`, que YA tiene el
   * «Siguiente paso» del panel. Dos avisos contestando la misma pregunta en
   * la misma pantalla es el error de los dos mapas del mismo territorio.
   *
   * No cuesta ni una consulta: `preliminares` ya estaba pedido arriba para
   * las marcas del lateral.
   */
  const pasoInicial = siguientePasoDeEmpresa(preliminares, {
    empresa: puede(sesion, "empresa:editar"),
    contratistas: puede(sesion, "proveedor:crear"),
    equipo: puede(sesion, "usuario:crear"),
    obras: puedeCrear,
  });

  const mapaEmpresa: FaseMenu[] = [
    {
      clave: "trabajo",
      secciones: [
        {
          clave: "obras",
          titulo: "Obras",
          pregunta: "dónde se construye",
          href: "/panel",
          soloExacto: true,
          hecho: marca(preliminares.obras),
        },
      ],
    },
    {
      clave: "empresa",
      titulo: "Mi constructora",
      // Plegado: son siete entradas de consulta ocasional —contratistas,
      // permisos, formas de pago— que, siempre abiertas, empujan hacia abajo
      // las obras, que es a lo que se entra a diario.
      plegable: true,
      secciones: [
        /// Solo para quien ve TODA la cartera: es la misma puerta que usa el
        /// servicio (`obrasAsignadas === null`), y no un permiso nuevo. A
        /// quien lleva una obra, un resumen de las demas no le dice nada que
        /// pueda usar. Va la PRIMERA porque es la lectura de arriba.
        sesion.obrasAsignadas === null && {
          clave: "gerencia",
          titulo: "Gerencia",
          pregunta: "cómo va la cartera",
          href: "/gerencia",
        },
        puede(sesion, "proveedor:leer") && {
          clave: "contratistas",
          titulo: "Contratistas",
          pregunta: "quién ejecuta",
          href: "/empresa/proveedores",
          hecho: marca(preliminares.contratistas),
        },
        puede(sesion, "usuario:leer") && {
          clave: "personas",
          titulo: "Personas",
          pregunta: "quién trabaja",
          href: "/empresa/usuarios",
          hecho: marca(preliminares.equipo),
          // Las solicitudes de cambio de perfil esperan a alguien: es trabajo
          // pendiente, no un hito, y por eso va de insignia y no de check.
          pendientes:
            solicitudes > 0 ? { cuantos: solicitudes, critico: false } : null,
        },
        puede(sesion, "permiso:leer") && {
          clave: "permisos",
          titulo: "Permisos",
          pregunta: "quién puede qué",
          href: "/empresa/permisos",
        },
        puede(sesion, "empresa:leer") && {
          clave: "datos",
          titulo: "Datos y logo",
          pregunta: "cómo te ven fuera",
          href: "/empresa/datos",
          hecho: marca(preliminares.logo),
        },
        puede(sesion, "orden:leer") && {
          clave: "formas-pago",
          titulo: "Formas de pago",
          pregunta: "cómo se paga",
          href: "/empresa/formas-pago",
        },
        puede(sesion, "configuracion:editar") && {
          clave: "configuracion",
          titulo: "Configuración",
          pregunta: "avisos y SMS",
          href: "/empresa/configuracion",
        },
        puede(sesion, "obra:restaurar") && {
          clave: "archivo",
          titulo: "Archivo",
          pregunta: "lo que ya terminó",
          href: "/empresa/archivo",
        },
        // Al lado del Archivo y no dentro de Configuracion: las dos son
        // operaciones sobre datos que salen del sistema, no ajustes.
        puede(sesion, "empresa:migrar") && {
          clave: "migracion",
          titulo: "Llevarse la empresa",
          pregunta: "sacarla a otra instalación",
          href: "/empresa/migracion",
        },
        // Sin puerta de permisos a proposito: el manual es para todos, y
        // quien menos permisos tiene es quien mas lo necesita.
        {
          clave: "manual",
          titulo: "Manual",
          pregunta: "cómo funciona GCM",
          href: "/manual",
        },
      ].filter(Boolean) as FaseMenu["secciones"],
    },
    // Quien opera GCM, no quien lo usa. Va al final y en su propio grupo
    // porque esta POR ENCIMA de la empresa, no dentro de ella.
    ...(sesion.esOperador
      ? [
          {
            clave: "gcm",
            titulo: "GCM",
            secciones: [
              {
                clave: "constructoras",
                titulo: "Constructoras",
                pregunta: "quién usa GCM",
                href: "/operador",
              },
            ],
          },
        ]
      : []),
  ].filter((f) => f.secciones.length > 0);

  // Sin filtros, «no hay obras» significa que la empresa esta vacia; con
  // filtros solo significa que ninguna coincide. Son dos pantallas distintas.
  const vacioDeVerdad = obras.total === 0 && !hayFiltro;

  return (
    // La misma rejilla que dentro de una obra —lateral fijo a la izquierda y
    // el contenido a la derecha—, para que el sistema se comporte igual en
    // los dos niveles. En pantalla estrecha se apila y el lateral queda
    // arriba: en un movil no hay dos columnas que valgan.
    <div className="space-y-4 lg:grid lg:grid-cols-[210px_minmax(0,1fr)] lg:gap-8 lg:space-y-0">
      <MenuObra fases={mapaEmpresa} />

      <div className="space-y-6">
      {/* El saludo con el «siguiente paso» encabeza el panel: contesta «qué
          tengo que mirar hoy» antes de ensenar nada mas. El titulo «Obras»
          baja a encabezar su propia lista, mas abajo. */}
      <Bienvenida
        nombres={sesion.nombres}
        resumen={resumen}
        alertas={alertasEmpresa}
        vacia={vacioDeVerdad}
        puedeCrear={puedeCrear}
        pasoInicial={pasoInicial}
      />

      {/* Las cifras de empresa: lectura de gerencia de un vistazo. Con la
          empresa vacia no se pintan: cuatro ceros no informan de nada. */}
      {!vacioDeVerdad && (
        <ResumenEmpresaPanel resumen={resumen} alertas={alertasEmpresa} />
      )}

      {/* El semaforo de plazo por obra, para quien ve toda la cartera. Es
          independiente de las cifras de dinero de arriba -que se ocultan con
          mas de una obra en ejecucion-: un semaforo por obra SI tiene sentido
          aunque haya varias, porque no mezcla ninguna escala entre ellas. */}
      {!vacioDeVerdad && semaforo && (
        <SemaforoCarteraPanel semaforo={semaforo} />
      )}

      {/* Que toca ESTA semana, obra por obra. Debajo de las cifras porque
          responde a otra pregunta: no como va la obra, sino que hay que
          hacer. Se pinta sola solo si hay algun plan abierto. */}
      {!vacioDeVerdad && <FranjaSemana semanas={semanas} />}

      {/* El titulo que antes encabezaba la pagina entera, ahora al frente de
          lo suyo: la lista. El buscador no se pinta con la empresa vacia; no
          hay nada que filtrar y solo estorbaria al unico paso que toca,
          crear la obra. */}
      {!vacioDeVerdad && (
        <>
          <AcentoTitulo>
            <h2 className="text-xl font-semibold tracking-tight">Obras</h2>
            {/* La segunda frase es la guia de lectura de las tarjetas: las
                barras y los globos no se explican en ningun otro sitio, y una
                cifra sin leyenda se ignora o se malinterpreta. */}
            <p className="mt-1 text-sm opacity-70">
              {/* «En tu empresa» solo es cierto para quien las ve todas. Con
                  el alcance por obra, a un residente con una asignada de
                  cuatro le decia que su constructora tiene una: una frase
                  falsa, y de las que nadie comprueba. */}
              {obras.total} obra(s)
              {hayFiltro
                ? " coinciden"
                : puedeCrear
                  ? " en tu empresa"
                  : " asignadas a ti"}
              .
              {" "}Cada tarjeta lleva sus barras —calendario, comprometido y
              avance físico— y sus avisos en los globos de color.
            </p>
          </AcentoTitulo>
          <FiltrosObras />
        </>
      )}

      {vacioDeVerdad ? (
        <div
          className="rounded-xl border border-dashed p-10 text-center"
          style={{ borderColor: "var(--borde)" }}
        >
          <div className="flex justify-center">
            <Mascota pose="saludando" alto={180} flotar />
          </div>
          {/* Dos vacios distintos: la empresa sin obras (lo ve quien puede
              crearlas) y la persona sin obras asignadas. Ver el comentario de
              `siguientePaso` en Bienvenida. */}
          <p className="mt-3 text-sm opacity-70">
            {puedeCrear
              ? "Crea tu primera obra para empezar a cargar el presupuesto."
              : "Todavía no tienes ninguna obra asignada. Pídele al administrador de la empresa que te asigne la tuya."}
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
            Ninguna obra coincide con la búsqueda.
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
                  texto: `La obra va ${Math.abs(desfase).toFixed(1)} puntos por detrás del plan`,
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
                      ? `El cronograma termina ${Math.abs(desvio)} día(s) antes que la ficha`
                      : `El cronograma termina ${desvio} día(s) después que la ficha`,
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
                  "Se corrige con una reconversión que traiga presupuesto de otra partida, o con un adicional.",
              });
            }

            const diasDeRetraso = diasEntre(obra.fechaFinProgramada, hoy());

            if (diasDeRetraso > 0 && obra.estado === "EN_EJECUCION") {
              alertas.push({
                clave: "plazo",
                texto: `El plazo venció hace ${diasDeRetraso} día(s)`,
                detalle:
                  "La obra sigue en ejecución después de la fecha de fin programada.",
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

                <h3 className="mt-2 text-sm font-semibold text-balance">
                  {obra.nombreObra}
                </h3>

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
    </div>
  );
}
