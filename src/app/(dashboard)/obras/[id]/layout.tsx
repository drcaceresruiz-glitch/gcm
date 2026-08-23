import { notFound, redirect } from "next/navigation";
import { CalendarDays, Download, MapPin, Pencil } from "lucide-react";
import { obtenerSesion } from "@/services/sesion.service";
import { obtenerObra, hitosDeObra, avisosDeSeccion } from "@/services/obras.service";
import { planesAbiertos } from "@/services/plan-semanal.service";
import { PasoSiguiente } from "@/components/obras/PasoSiguiente";
import { siguientePaso } from "@/lib/siguiente-paso";
import { puede } from "@/lib/rbac";
import { fechaCorta } from "@/utils/fechas";
import { Volver } from "@/components/ui/Volver";
import { EnlaceBoton } from "@/components/ui/EnlaceBoton";
import { EliminarObra } from "@/components/obras/EliminarObra";
import { EliminarObraCerrada } from "@/components/obras/EliminarObraCerrada";
import { constaRespaldoReciente } from "@/services/obra-borrado.service";
import { MenuObra, type FaseMenu } from "@/components/obras/MenuObra";
import { PublicarEtiqueta } from "@/components/navegacion/PublicarEtiqueta";
import { EstadoObra } from "@/components/obras/EstadoObra";
import { requisitosParaEjecutar, type EstadoObra as EstadoObraTipo } from "@/lib/obras";

/**
 * Marco comun de una obra.
 *
 * Antes cada subpagina repetia su «Volver a la obra» y su subtitulo con el
 * nombre, y las secciones eran botones que solo existian en la portada: para
 * ir de las ordenes a los movimientos habia que pasar por ella. Todo eso
 * vive aqui una sola vez.
 *
 * `obtenerObra` va envuelta en `cache()`, asi que preguntarla aqui y otra
 * vez en la pagina no son dos consultas.
 */
export default async function ObraLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const { id } = await params;
  const obra = await obtenerObra(sesion, id);
  if (!obra) notFound();

  // El nombre de la obra sale gratis: ya se pidio para pintar el h1 de abajo.
  // Solo hace falta publicarlo para que la miga —montada arriba del todo,
  // en el layout raiz— lo pueda leer sin volver a consultar nada.
  const raiz = `/obras/${id}`;
  const [hitos, avisos, semanasAbiertas] = await Promise.all([
    hitosDeObra(sesion, id),
    avisosDeSeccion(sesion, id),
    // Solo las ABIERTAS: es una consulta plana (id, numero, fechaCorte, sin
    // compromisos) y corre en CADA navegacion dentro de la obra. Las semanas
    // cerradas son historia, no trabajo por hacer, y ya se ven enteras desde
    // dentro de `/plan-semanal`.
    planesAbiertos(sesion, id),
  ]);

  /**
   * El mapa de la obra: fases, secciones y ramas.
   *
   * UNA SOLA navegacion. Antes habia dos —este riel con los cinco pasos del
   * ciclo y unas pestanas con tres grupos— que nombraban las mismas secciones
   * agrupadas de forma distinta, y ninguna de las dos conocia la mitad de la
   * aplicacion: en el Parte del dia, en Personal o en Ordenes, el «diagrama de
   * ubicacion» no marcaba nada.
   *
   * El orden dentro de cada fase es el del trabajo real, no el alfabetico.
   * En Ejecucion manda el Parte del dia porque es lo unico que se toca todos
   * los dias.
   */
  const fases = [
    /**
     * El tablero va SUELTO arriba, sin rotulo de fase.
     *
     * No pertenece a ninguna: no es plan, ni ejecucion, ni compras, sino el
     * resumen de las tres. Vivio en el panel con un desplegable de obra hasta
     * el 17 de agosto de 2026; sus once modulos siempre describieron una sola
     * obra, asi que su sitio es este.
     */
    {
      clave: "tablero",
      secciones: [
        puede(sesion, "obra:leer") && {
          clave: "tablero",
          titulo: "Tablero",
          pregunta: "cómo va la obra",
          href: `${raiz}/tablero`,
        },
      ].filter(Boolean),
    },
    {
      clave: "plan",
      titulo: "Plan",
      secciones: [
        /**
         * VA PRIMERA, y es el orden del trabajo: desde el 20/08 el
         * presupuesto entra por aqui -el REAL- y de el se genera el
         * contractual, inflando cada capitulo por su recargo.
         *
         * Antes iba detras de Revisiones, cuando la meta se fijaba contra una
         * linea base aprobada. Eso dejo de ser cierto al hacer
         * `baselineVersion` opcional, y el menu se quedo contando el orden
         * viejo: el manual da por hecho que este riel ES su indice.
         */
        puede(sesion, "meta:leer") && {
          clave: "meta",
          titulo: "Meta",
          pregunta: "cuánto queremos gastar",
          href: `${raiz}/meta`,
          hecho: hitos.meta,
        },
        puede(sesion, "partida:leer") && {
          clave: "presupuesto",
          titulo: "Presupuesto",
          pregunta: "cuánto cuesta",
          href: raiz,
          // El importador de partidas es presupuesto aunque cuelgue aparte.
          prefijos: [`${raiz}/contractual`],
          hecho: hitos.presupuesto,
          // OBLIGATORIO: `href` es la raiz de la obra, y sin esto seria
          // prefijo de CUALQUIER subruta —encendia «Presupuesto» al editar la
          // ficha o al mirar las fotos del Lookahead—. Ver el comentario de
          // `soloExacto` en MenuObra.tsx.
          soloExacto: true,
        },
        puede(sesion, "linea_base:leer") && {
          clave: "revisiones",
          titulo: "Revisiones",
          pregunta: "presupuesto congelado",
          href: `${raiz}/revisiones`,
          hecho: hitos.lineaBase,
        },
        /**
         * La propuesta cuelga de la revision -de ahi saca sus cifras-, por
         * eso va justo detras.
         *
         * Solo aparece si hay ALGUNA revision, aprobada o no. Sin ninguna, la
         * pantalla no tiene nada que enseñar y contestaria 404: un enlace del
         * menu que lleva a "Aqui no hay nada" es peor que no tenerlo, y hoy
         * mismo ya paso una vez.
         *
         * No lleva `hecho`: no es un hito del alta. Emitir la propuesta es
         * algo que se hace, no un paso que quede pendiente.
         */
        puede(sesion, "linea_base:leer") &&
          hitos.revision && {
            clave: "propuesta",
            titulo: "Propuesta",
            pregunta: "cuánto le cobro al cliente",
            href: `${raiz}/propuesta`,
          },
        /**
         * El cronograma va AL FINAL del grupo, detras de todo el hilo del
         * dinero: su EDT sale del presupuesto, asi que antes de que exista no
         * hay nada que planificar. Estaba en medio -entre Presupuesto y
         * Revisiones- y partia en dos la secuencia real, y bastante confusion
         * hay ya con dos presupuestos.
         */
        puede(sesion, "cronograma:leer") && {
          clave: "cronograma",
          titulo: "Cronograma",
          pregunta: "cuándo se hace",
          href: `${raiz}/cronograma`,
          hecho: hitos.cronograma,
          ramas: [
            { titulo: "Diagrama de Gantt", href: `${raiz}/cronograma/gantt` },
            { titulo: "Informe semanal", href: `${raiz}/cronograma/informe` },
            { titulo: "Enlazar con partidas", href: `${raiz}/cronograma/mapeo` },
          ],
        },
      ].filter(Boolean),
    },
    {
      clave: "ejecucion",
      titulo: "Ejecución",
      secciones: [
        puede(sesion, "lookahead:leer") && {
          clave: "lookahead",
          titulo: "Lookahead",
          pregunta: "qué se prepara",
          href: `${raiz}/lookahead`,
          hecho: hitos.lookahead,
          // La galeria de fotos que demuestran una restriccion liberada.
          // Cuelga aparte (`/evidencia`, no `/lookahead/evidencia`) porque
          // es donde aterriza el QR pegado en obra, pero es del Lookahead.
          prefijos: [`${raiz}/evidencia`],
          pendientes:
            avisos.lookahead > 0
              ? { cuantos: avisos.lookahead, critico: true }
              : null,
        },
        puede(sesion, "plan_semanal:leer") && {
          clave: "planSemanal",
          titulo: "Plan semanal",
          pregunta: "qué se compromete",
          href: `${raiz}/plan-semanal`,
          hecho: hitos.planSemanal,
          pendientes:
            avisos.planSemanal > 0
              ? { cuantos: avisos.planSemanal, critico: false }
              : null,
          // Las semanas ABIERTAS, no todas: son las que se tocan hoy. El
          // historial completo (cerradas incluidas) vive en la propia
          // pantalla de Plan semanal, un clic mas alla.
          ramas: semanasAbiertas.map((s) => ({
            titulo: `Semana ${s.numero}`,
            href: `${raiz}/plan-semanal/${s.id}`,
          })),
        },
        /// El parte va DESPUES del Plan semanal, que es el orden del Last
        /// Planner: se prepara (Lookahead), se compromete (PTS) y solo
        /// entonces se reporta lo que se hizo. Estaba primero, y eso invitaba
        /// a reportar avance sobre tareas que nadie habia comprometido.
        puede(sesion, "cronograma:leer") && {
          clave: "avance",
          titulo: "Parte del día",
          pregunta: "cuánto se avanzó hoy",
          href: `${raiz}/avance`,
        },
        /// Justo detras del parte: es su companero libre. El parte reporta el
        /// % reglado de cada tarea; aqui se anota lo que ese formulario no
        /// tiene donde poner —un pago pendiente, un tema legal, un hallazgo
        /// suelto—. `critico: true` en el aviso porque una nota con
        /// recordatorio ya vencido es el mismo tipo de problema que una
        /// restriccion vencida: alguien se puso una fecha y ya paso.
        puede(sesion, "nota:leer") && {
          clave: "notas",
          titulo: "Notas",
          pregunta: "qué hay que no olvidar",
          href: `${raiz}/notas`,
          pendientes:
            avisos.notas > 0 ? { cuantos: avisos.notas, critico: true } : null,
        },
        /// El escaparate: las fotos de avance que se curan y, si gerencia
        /// quiere, se ensenan al cliente. Va tras el Plan semanal porque la
        /// foto se sube cuando el trabajo ya se hizo.
        /// El mismo trabajo del Lookahead y del PTS, ordenado por madurez.
        /// Va DESPUES de los dos porque los resume: no aporta datos nuevos,
        /// los dispone de otra forma. Se llama Kanban y no «Tablero» a
        /// proposito: ya hay dos pantallas con ese nombre.
        puede(sesion, "lookahead:leer") && {
          clave: "kanban",
          titulo: "Kanban",
          pregunta: "en qué punto está cada tarea",
          href: `${raiz}/kanban`,
        },
        puede(sesion, "galeria:leer") && {
          clave: "galeria",
          titulo: "Galería",
          pregunta: "cómo se ve la obra",
          href: `${raiz}/galeria`,
        },
        puede(sesion, "lookahead:gestionar") && {
          clave: "personal",
          titulo: "Personal",
          pregunta: "quién documenta en obra",
          href: `${raiz}/personal`,
        },
        /// El equipo va JUNTO a Personal y no en otra fase: las dos contestan
        /// «quién», y separarlas obligaria a buscar en dos sitios distintos a
        /// las mismas personas. La diferencia es que Personal son los pases
        /// de campo —gente sin cuenta— y esto son los usuarios de GCM que
        /// tienen la obra asignada, que es lo que decide quién la ve.
        puede(sesion, "obra:asignar_equipo") && {
          clave: "equipo",
          titulo: "Equipo",
          pregunta: "quién ve esta obra",
          href: `${raiz}/equipo`,
        },
        puede(sesion, "movimiento:leer") &&
          obra.lineaBaseVersion !== null && {
            clave: "movimientos",
            titulo: "Movimientos",
            pregunta: "cambios sobre la base",
            href: `${raiz}/movimientos`,
          },
      ].filter(Boolean),
    },
    {
      clave: "compras",
      titulo: "Compras",
      secciones: [
        puede(sesion, "encargo:leer") && {
          clave: "proveedores",
          titulo: "Proveedores",
          pregunta: "quién hace cada frente",
          href: `${raiz}/proveedores`,
        },
        /// Va DESPUES de Proveedores y ANTES de Órdenes: el orden del trabajo
        /// real es contratar el frente, valorizar lo avanzado y pagarlo.
        puede(sesion, "encargo:leer") && {
          clave: "valorizaciones",
          titulo: "Valorizaciones",
          pregunta: "a quién le toca y a quién se le debe",
          href: `${raiz}/valorizaciones`,
        },
        puede(sesion, "orden:leer") && {
          clave: "ordenes",
          titulo: "Órdenes",
          pregunta: "qué se ha pedido",
          href: `${raiz}/ordenes`,
        },
      ].filter(Boolean),
    },
  ].filter((f) => f.secciones.length > 0) as FaseMenu[];

  /**
   * Que toca ahora en esta obra: UNO, con su boton.
   *
   * No cuesta ni una consulta mas. Las tres cosas que mira —los hitos, el
   * criterio y los avisos— ya estaban pedidas arriba para el riel del menu y
   * para el aviso del criterio, y las tres van en `cache()`.
   *
   * En una obra CERRADA no se sugiere nada: no admite escrituras, asi que
   * cualquier paso que se propusiera seria un boton que no lleva a ninguna
   * parte. Una obra cerrada es historia, y a la historia no le falta nada.
   */
  const paso =
    obra.estado === "CERRADA"
      ? null
      : siguientePaso(
          {
            presupuesto: hitos.presupuesto,
            meta: hitos.metaCargada,
            cronograma: hitos.cronograma,
            equipo: hitos.equipo,
            equipoAsignable: hitos.equipoAsignable,
            lineaBase: hitos.lineaBase,
          },
          {
            // Para PROPONER un paso hace falta poder darlo, que no es lo
            // mismo que poder ver la seccion. Los dos ultimos si son de
            // lectura: lo que se propone ahi es mirar, no escribir.
            presupuesto: puede(sesion, "partida:importar"),
            cronograma: puede(sesion, "cronograma:importar"),
            equipo: puede(sesion, "obra:asignar_equipo"),
            lineaBase: puede(sesion, "linea_base:aprobar"),
            lookahead: puede(sesion, "lookahead:leer"),
            planSemanal: puede(sesion, "plan_semanal:leer"),
          },
          {
            restriccionesVencidas: avisos.lookahead,
            semanasSinCerrar: avisos.planSemanal,
          },
        );



  return (
    // El riel de ubicacion vive a la izquierda de TODO el marco de la obra
    // (cabecera incluida) y es pegajoso: siempre a la vista, que es el
    // encargo. En pantallas angostas se pliega a una fila arriba del todo.
    // `print:block` deshace la rejilla al imprimir: el riel va oculto y su
    // columna vacia correria el documento de la orden hacia la derecha.
    <div className="space-y-4 lg:grid lg:grid-cols-[210px_minmax(0,1fr)] lg:gap-8 lg:space-y-0 print:block">
      <PublicarEtiqueta clave="obra" valor={obra.nombreObra} />
      <MenuObra fases={fases} />

      <div className="space-y-6">
      {/* Todo el marco desaparece al imprimir: la vista del documento de la
          orden cuelga de esta ruta, y el papel que recibe el proveedor no
          puede salir con pestanas encima. */}
      <div className="space-y-4 print:hidden">
        <div>
          <Volver href="/panel">Volver al panel</Volver>

          <p className="mt-3 text-xs font-medium opacity-60">
            {obra.correlativo ?? "Sin correlativo"}
            {obra.codigoObra && ` · ${obra.codigoObra}`}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-balance">
            {obra.nombreObra}
          </h1>

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm opacity-70">
            {obra.ubicacion && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                {obra.ubicacion}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-3.5 shrink-0" aria-hidden="true" />
              {fechaCorta(obra.fechaInicio)} &ndash;{" "}
              {fechaCorta(obra.fechaFinProgramada)}
            </span>
          </div>

          {/* Estado de la obra y los pasos que puede dar. El chip muestra el
              actual; los botones, las transiciones validas. */}
          <div className="mt-3">
            <EstadoObra
              obraId={obra.id}
              nombreObra={obra.nombreObra}
              estado={obra.estado as EstadoObraTipo}
              puedeEditar={puede(sesion, "obra:editar")}
              puedeReabrir={puede(sesion, "obra:reabrir")}
              motivoParalizacion={obra.motivoParalizacion}
              fechaEstimadaReanudacion={obra.fechaEstimadaReanudacion}
              /* La MISMA regla que aplica el servidor, con los MISMOS hitos
                 que ya se pidieron para el riel: la pantalla no puede decir
                 una cosa y el servidor decidir otra. */
              faltaParaArrancar={
                obra.estado === "PLANIFICACION"
                  ? requisitosParaEjecutar({
                      partidas: hitos.presupuesto ? 1 : 0,
                      tieneCronograma: hitos.cronograma,
                      tieneLineaBase: hitos.lineaBaseCronograma,
                    })
                  : []
              }
            />
          </div>

          {/* Editar los datos de la obra (nombre, plazo, codigo...). Nace para
              poder corregir la fecha fin, que gobierna el plazo del panel. */}
          {puede(sesion, "obra:editar") && (
            <div className="mt-3">
              <EnlaceBoton
                href={`/obras/${obra.id}/editar`}
                icono={Pencil}
                posicionIcono="izquierda"
                tamano="sm"
              >
                Editar datos de la obra
              </EnlaceBoton>
            </div>
          )}

          {/* Eliminar la obra solo tiene sentido en planificacion: aun no ha
              comprometido nada. El servicio lo vuelve a comprobar. */}
          {obra.estado === "PLANIFICACION" && puede(sesion, "obra:eliminar") && (
            <EliminarObra obraId={obra.id} nombre={obra.nombreObra} />
          )}

          {/* El respaldo completo, solo con la obra ya cerrada: mientras siga
              viva sus cifras cambian y el archivo saldria con las partidas de
              un momento y las ordenes de otro.

              Un enlace y no un boton con JavaScript: la descarga la resuelve
              el navegador solo, igual que el informe en PDF. */}
          {obra.estado === "CERRADA" && puede(sesion, "obra:eliminar_cerrada") && (
            <div className="mt-4">
              <a
                href={`/obras/${obra.id}/respaldo`}
                download
                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs"
                style={{ borderColor: "var(--borde)" }}
              >
                <Download className="size-3.5" aria-hidden="true" />
                Descargar respaldo completo
              </a>
              <p className="mt-1.5 text-xs opacity-70">
                Un .zip con la obra entera —presupuesto, ordenes, cronograma,
                avances y fotos— y un resumen que se abre sin GCM. Contiene
                datos personales: guardalo como el expediente en papel.
              </p>

              {/* El borrado definitivo va DEBAJO del respaldo y no en otro
                  sitio: el orden de la pantalla es el orden correcto de hacer
                  las cosas. El servicio no deja borrar sin respaldo reciente. */}
              <EliminarObraCerrada
                obraId={obra.id}
                nombre={obra.nombreObra}
                hayRespaldo={await constaRespaldoReciente(sesion, obra.id)}
              />
            </div>
          )}
        </div>
      </div>

      {/* El anclaje de continuidad: en TODAS las pantallas de la obra —eso es
          lo que lo hace util cuando uno se desvia— pero DEBAJO de la
          cabecera, no encima. Estuvo arriba del todo y se leia el paso
          pendiente antes que el nombre de la obra; el titulo manda, y la
          sugerencia entra justo despues, pegada al contenido sobre el que
          actua.

          Solo UNO: la lista larga ya vive en el panel «Que falta» del
          tablero. Con boton, porque un aviso sin salida se ignora. Y el
          propio componente se esconde si ya estas en la pantalla del paso. */}
      {paso && <PasoSiguiente obraId={id} paso={paso} />}

      {children}
      </div>
    </div>
  );
}
