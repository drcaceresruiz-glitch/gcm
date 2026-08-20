import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { obtenerSesion } from "@/services/sesion.service";
import {
  datosParaEscribir,
  historialDeContratista,
  MAX_HISTORIAL,
} from "@/services/mensajes-contratista.service";
import { listarPlantillas } from "@/services/plantillas-mensaje.service";
import { EscribirAlContratista } from "@/components/proveedores/EscribirAlContratista";
import { HistorialMensajes } from "@/components/proveedores/HistorialMensajes";
import { Volver } from "@/components/ui/Volver";

export const metadata: Metadata = { title: "Escribir al contratista" };

/**
 * Escribirle a un contratista, y ver lo que ya se le escribio.
 *
 * UNA SOLA PANTALLA CON DOS PUERTAS: se llega desde el catalogo de la empresa
 * y desde la pestana de proveedores de una obra, que ademas pasa `?obra=` para
 * que el mensaje quede atado a esa obra y firmado con su nombre. Tener el
 * formulario en los dos sitios habria sido duplicarlo, que es justo como
 * acaban divergiendo las cosas.
 */
export default async function MensajesContratistaPage({
  params,
  searchParams,
}: {
  params: Promise<{ proveedorId: string }>;
  searchParams: Promise<{ obra?: string }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const { proveedorId } = await params;
  const { obra } = await searchParams;

  // Devuelve null tanto sin permiso como si el contratista es de otra
  // empresa: las dos cosas se responden igual para no confirmarle la
  // existencia de un id ajeno a quien lo esta probando.
  const contratista = await datosParaEscribir(sesion, proveedorId, obra);
  if (!contratista) notFound();

  const [mensajes, plantillas] = await Promise.all([
    historialDeContratista(sesion, proveedorId),
    // Los mensajes que la empresa repite. Quien escribe los USA aunque no
    // pueda redactarlos: eso lo decide `listarPlantillas`.
    listarPlantillas(sesion),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <div>
        <Volver
          href={
            contratista.obra
              ? `/obras/${contratista.obra.id}/proveedores`
              : "/empresa/proveedores"
          }
        >
          {contratista.obra ? "Volver a la obra" : "Volver al catálogo"}
        </Volver>

        <h1 className="mt-2 text-xl font-bold">{contratista.razonSocial}</h1>
        <p className="text-sm opacity-70">
          {contratista.obra
            ? `Escribiendo desde ${contratista.obra.nombre}`
            : "Escribiendo desde el catálogo de la empresa"}
        </p>
      </div>

      <EscribirAlContratista contratista={contratista} plantillas={plantillas} />

      <section className="space-y-3">
        <h2 className="text-sm font-bold">
          Lo que se le ha escrito
          {mensajes.length >= MAX_HISTORIAL ? ` (los ${MAX_HISTORIAL} últimos)` : ""}
        </h2>
        <HistorialMensajes mensajes={mensajes} />
      </section>
    </div>
  );
}
