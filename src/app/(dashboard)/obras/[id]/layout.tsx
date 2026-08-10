import { notFound, redirect } from "next/navigation";
import { CalendarDays, MapPin, Pencil } from "lucide-react";
import { obtenerSesion } from "@/services/sesion.service";
import { obtenerObra, hitosDeObra } from "@/services/obras.service";
import { puede } from "@/lib/rbac";
import { fechaCorta } from "@/utils/fechas";
import { Volver } from "@/components/ui/Volver";
import { EnlaceBoton } from "@/components/ui/EnlaceBoton";
import {
  PestanasObra,
  type Pestana,
} from "@/components/obras/PestanasObra";
import { EliminarObra } from "@/components/obras/EliminarObra";
import { RutaObra, type PasoRuta } from "@/components/obras/RutaObra";
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
  const hitos = await hitosDeObra(sesion, id);

  // La ruta de la obra: el ciclo en orden, solo los pasos que la persona
  // puede ver. Los estados (hecho / estas aqui) los pinta el componente.
  const pasos = [
    puede(sesion, "partida:leer") && {
      clave: "presupuesto",
      titulo: "Presupuesto",
      pregunta: "cuanto cuesta",
      href: raiz,
      hecho: hitos.presupuesto,
    },
    puede(sesion, "cronograma:leer") && {
      clave: "cronograma",
      titulo: "Cronograma",
      pregunta: "cuando se hace",
      href: `${raiz}/cronograma`,
      hecho: hitos.cronograma,
    },
    puede(sesion, "linea_base:leer") && {
      clave: "lineaBase",
      titulo: "Linea base",
      pregunta: "la referencia congelada",
      href: `${raiz}/revisiones`,
      hecho: hitos.lineaBase,
    },
    puede(sesion, "lookahead:leer") && {
      clave: "lookahead",
      titulo: "Lookahead",
      pregunta: "que se prepara",
      href: `${raiz}/lookahead`,
      hecho: hitos.lookahead,
    },
    puede(sesion, "plan_semanal:leer") && {
      clave: "planSemanal",
      titulo: "Plan semanal",
      pregunta: "que se compromete",
      href: `${raiz}/plan-semanal`,
      hecho: hitos.planSemanal,
    },
  ].filter(Boolean) as PasoRuta[];

  const pestanas = [
    puede(sesion, "partida:leer") && {
      href: raiz,
      etiqueta: "Presupuesto",
      clave: "presupuesto",
      grupo: "plan",
    },
    // Va junto al presupuesto y antes que las revisiones: el cronograma es
    // la otra mitad del plan de la obra —el presupuesto dice cuanto y este
    // dice cuando—, y no depende de nada para poder cargarse.
    puede(sesion, "cronograma:leer") && {
      href: `${raiz}/cronograma`,
      etiqueta: "Cronograma",
      clave: "cronograma",
      grupo: "plan",
    },
    // El Lookahead (mediano plazo) va entre cronograma y plan semanal: prepara
    // con analisis de restricciones lo que luego se comprometera en el PTS.
    puede(sesion, "lookahead:leer") && {
      href: `${raiz}/lookahead`,
      etiqueta: "Lookahead",
      clave: "lookahead",
      grupo: "ejecucion",
    },
    // El plan semanal (Last Planner) cuelga del cronograma: es su corto plazo.
    puede(sesion, "plan_semanal:leer") && {
      href: `${raiz}/plan-semanal`,
      etiqueta: "Plan Semanal",
      clave: "planSemanal",
      grupo: "ejecucion",
    },
    puede(sesion, "linea_base:leer") && {
      href: `${raiz}/revisiones`,
      etiqueta: "Revisiones",
      clave: "revisiones",
      grupo: "plan",
    },
    // Los movimientos van encima de la linea base: sin ella aprobada, la
    // pantalla no tiene nada que ensenar.
    puede(sesion, "movimiento:leer") &&
      obra.lineaBaseVersion !== null && {
        href: `${raiz}/movimientos`,
        etiqueta: "Movimientos",
        clave: "movimientos",
        grupo: "ejecucion",
      },
    // Los proveedores van antes que las ordenes: primero repartes la obra en
    // frentes —quien hace que, por cuanto— y luego les emites los pedidos.
    puede(sesion, "encargo:leer") && {
      href: `${raiz}/proveedores`,
      etiqueta: "Proveedores",
      clave: "proveedores",
      grupo: "compras",
    },
    // Las ordenes no dependen de la linea base: se puede pedir a un proveedor
    // antes de congelar el presupuesto.
    puede(sesion, "orden:leer") && {
      href: `${raiz}/ordenes`,
      etiqueta: "Ordenes",
      clave: "ordenes",
      grupo: "compras",
    },
  ].filter(Boolean) as Pestana[];

  return (
    // El riel de ubicacion vive a la izquierda de TODO el marco de la obra
    // (cabecera incluida) y es pegajoso: siempre a la vista, que es el
    // encargo. En pantallas angostas se pliega a una fila arriba del todo.
    // `print:block` deshace la rejilla al imprimir: el riel va oculto y su
    // columna vacia correria el documento de la orden hacia la derecha.
    <div className="space-y-4 lg:grid lg:grid-cols-[190px_minmax(0,1fr)] lg:gap-8 lg:space-y-0 print:block">
      <RutaObra pasos={pasos} raiz={raiz} />

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

        <PestanasObra pestanas={pestanas} raiz={raiz} />
      </div>

      {children}
      </div>
    </div>
  );
}
