import { notFound, redirect } from "next/navigation";
import { CalendarDays, Download, MapPin, Pencil } from "lucide-react";
import { obtenerSesion } from "@/services/sesion.service";
import { obtenerObra, hitosDeObra, avisosDeSeccion } from "@/services/obras.service";
import { planesAbiertos } from "@/services/plan-semanal.service";
import { criterioDeObra } from "@/services/criterio-obra.service";
import { AvisoCriterio } from "@/components/obras/AvisoCriterio";
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
import type { EstadoObra as EstadoObraTipo } from "@/lib/obras";

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
  const [hitos, avisos, semanasAbiertas, criterio] = await Promise.all([
    hitosDeObra(sesion, id),
    avisosDeSeccion(sesion, id),
    // Solo las ABIERTAS: es una consulta plana (id, numero, fechaCorte, sin
    // compromisos) y corre en CADA navegacion dentro de la obra. Las semanas
    // cerradas son historia, no trabajo por hacer, y ya se ven enteras desde
    // dentro de `/plan-semanal`.
    planesAbiertos(sesion, id),
    // El criterio de gastos generales. Si esta sin decidir y ya hay
    // presupuesto, la obra no deja avanzar: cualquier cifra de margen que se
    // enseñara estaria calculada con un criterio que nadie ha confirmado.
    criterioDeObra(sesion, id),
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
        puede(sesion, "partida:leer") && {
          clave: "presupuesto",
          titulo: "Presupuesto",
          pregunta: "cuánto cuesta",
          href: raiz,
          // El importador de partidas es presupuesto aunque cuelgue aparte.
          prefijos: [`${raiz}/importar`],
          hecho: hitos.presupuesto,
          // OBLIGATORIO: `href` es la raiz de la obra, y sin esto seria
          // prefijo de CUALQUIER subruta —encendia «Presupuesto» al editar la
          // ficha o al mirar las fotos del Lookahead—. Ver el comentario de
          // `soloExacto` en MenuObra.tsx.
          soloExacto: true,
        },
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
        puede(sesion, "linea_base:leer") && {
          clave: "revisiones",
          titulo: "Revisiones",
          pregunta: "presupuesto congelado",
          href: `${raiz}/revisiones`,
          hecho: hitos.lineaBase,
        },
        /// Va DESPUES de Revisiones y no antes: la meta se fija contra una
        /// linea base aprobada, asi que el orden del menu es el del trabajo.
        puede(sesion, "meta:leer") && {
          clave: "meta",
          titulo: "Meta",
          pregunta: "cuánto queremos gastar",
          href: `${raiz}/meta`,
          hecho: hitos.meta,
        },
      ].filter(Boolean),
    },
    {
      clave: "ejecucion",
      titulo: "Ejecución",
      secciones: [
        puede(sesion, "cronograma:leer") && {
          clave: "avance",
          titulo: "Parte del día",
          pregunta: "cuánto se avanzó hoy",
          href: `${raiz}/avance`,
        },
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
        puede(sesion, "orden:leer") && {
          clave: "ordenes",
          titulo: "Órdenes",
          pregunta: "qué se ha pedido",
          href: `${raiz}/ordenes`,
        },
      ].filter(Boolean),
    },
  ].filter((f) => f.secciones.length > 0) as FaseMenu[];



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
      {/* La decision pendiente va ARRIBA DEL TODO y en todas las pantallas
          de la obra: no es de una seccion, condiciona como se lee el dinero
          en todas. Con boton, porque un aviso sin salida se ignora. */}
      {criterio?.faltaDecidir && <AvisoCriterio obraId={id} />}
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
              estado={obra.estado as EstadoObraTipo}
              puedeEditar={puede(sesion, "obra:editar")}
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

      {children}
      </div>
    </div>
  );
}
