import { notFound, redirect } from "next/navigation";
import { CalendarDays, MapPin, Pencil } from "lucide-react";
import { obtenerSesion } from "@/services/sesion.service";
import { obtenerObra, hitosDeObra, avisosDeSeccion } from "@/services/obras.service";
import { puede } from "@/lib/rbac";
import { fechaCorta } from "@/utils/fechas";
import { Volver } from "@/components/ui/Volver";
import { EnlaceBoton } from "@/components/ui/EnlaceBoton";
import { EliminarObra } from "@/components/obras/EliminarObra";
import { MenuObra, type FaseMenu } from "@/components/obras/MenuObra";
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

  const raiz = `/obras/${id}`;
  const [hitos, avisos] = await Promise.all([
    hitosDeObra(sesion, id),
    avisosDeSeccion(sesion, id),
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
        </div>
      </div>

      {children}
      </div>
    </div>
  );
}
