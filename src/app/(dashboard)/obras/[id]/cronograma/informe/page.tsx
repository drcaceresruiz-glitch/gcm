import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import { obtenerObra } from "@/services/obras.service";
import { obtenerEmpresa } from "@/services/empresa.service";
import { obtenerCronograma, datosCurvaS } from "@/services/cronograma.service";
import {
  agruparPorCapitulo,
  alertasDeAtraso,
  partidasActivas,
} from "@/lib/control-avance";
import { puede } from "@/lib/rbac";
import { Volver } from "@/components/ui/Volver";
import { BotonImprimir } from "@/components/cronograma/BotonImprimir";
import { InformeSemanal } from "@/components/cronograma/InformeSemanal";

export const metadata: Metadata = { title: "Informe semanal" };

/**
 * El informe semanal de obra, listo para imprimir o guardar como PDF.
 *
 * Todo se calcula en el servidor: la pagina no manda ni un byte de JavaScript
 * salvo el boton de imprimir, que ademas desaparece en el papel. Asi el
 * documento sale igual se imprima desde donde se imprima.
 */
export default async function InformePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const { id } = await params;
  const obra = await obtenerObra(sesion, id);
  if (!obra) notFound();

  if (!puede(sesion, "cronograma:leer")) redirect(`/obras/${id}`);

  const [cronograma, curva, empresa] = await Promise.all([
    obtenerCronograma(sesion, id),
    datosCurvaS(sesion, id),
    obtenerEmpresa(sesion),
  ]);

  // Sin cronograma no hay informe que dar: se devuelve a la pantalla que
  // explica como cargarlo, en vez de imprimir una hoja vacia.
  if (!cronograma) redirect(`/obras/${id}/cronograma`);

  // Lo que el propio archivo totaliza para el proyecto entero: la fila de
  // nivel 1, que es la que Project usa en su informe. Se ensena junto a la
  // cifra de GCM para poder contrastarlas.
  const resumenProyecto = cronograma.tareas.find((t) => t.nivel === 1);

  return (
    <div className="space-y-4">
      {/* Todo este bloque desaparece al imprimir: el papel que recibe el
          cliente no puede salir con botones de navegacion encima. */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Volver href={`/obras/${id}/cronograma`}>Volver al cronograma</Volver>
        <BotonImprimir />
      </div>

      <InformeSemanal
        datos={{
          empresa: empresa?.razonSocial ?? "",
          obra: obra.nombreObra,
          ubicacion: obra.ubicacion,
          fechaCorte: cronograma.fechaCorte,
          version: cronograma.version,
          importadoPor: cronograma.importadoPor,
          planeadoProject: resumenProyecto?.porcentajePlaneado ?? null,
          realProject: resumenProyecto?.porcentajeArchivo ?? null,
          curva,
          capitulos: agruparPorCapitulo(cronograma.tareas),
          alertas: alertasDeAtraso(cronograma.tareas, cronograma.fechaCorte),
          activas: partidasActivas(cronograma.tareas, cronograma.fechaCorte),
          generadoPor: `${sesion.nombres} ${sesion.apellidos}`.trim(),
        }}
      />
    </div>
  );
}
