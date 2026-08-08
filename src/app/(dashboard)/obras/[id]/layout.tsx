import { notFound, redirect } from "next/navigation";
import { CalendarDays, MapPin } from "lucide-react";
import { obtenerSesion } from "@/services/sesion.service";
import { obtenerObra } from "@/services/obras.service";
import { puede } from "@/lib/rbac";
import { fechaCorta } from "@/utils/fechas";
import { Volver } from "@/components/ui/Volver";
import {
  PestanasObra,
  type Pestana,
} from "@/components/obras/PestanasObra";
import { EliminarObra } from "@/components/obras/EliminarObra";
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

  const pestanas = [
    puede(sesion, "partida:leer") && {
      href: raiz,
      etiqueta: "Presupuesto",
      clave: "presupuesto",
    },
    puede(sesion, "linea_base:leer") && {
      href: `${raiz}/revisiones`,
      etiqueta: "Revisiones",
      clave: "revisiones",
    },
    // Los movimientos van encima de la linea base: sin ella aprobada, la
    // pantalla no tiene nada que ensenar.
    puede(sesion, "movimiento:leer") &&
      obra.lineaBaseVersion !== null && {
        href: `${raiz}/movimientos`,
        etiqueta: "Movimientos",
        clave: "movimientos",
      },
    // Las ordenes no dependen de la linea base: se puede pedir a un proveedor
    // antes de congelar el presupuesto.
    puede(sesion, "orden:leer") && {
      href: `${raiz}/ordenes`,
      etiqueta: "Ordenes",
      clave: "ordenes",
    },
  ].filter(Boolean) as Pestana[];

  return (
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
  );
}
