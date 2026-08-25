import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FileDown, ListTree } from "lucide-react";
import { obtenerSesion } from "@/services/sesion.service";
import { obtenerObra, listarPartidas } from "@/services/obras.service";
import { historialCronogramas } from "@/services/cronograma.service";
import { puedeConvertirProject } from "@/services/mpp.service";
import { puede } from "@/lib/rbac";
import { Volver } from "@/components/ui/Volver";
import { ImportadorCronograma } from "@/components/cronograma/ImportadorCronograma";
import { AvisoSinEscritura } from "@/components/obras/EscrituraDeLaObra";

export const metadata: Metadata = { title: "Cargar cronograma" };

export default async function ImportarCronogramaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const { id } = await params;
  const obra = await obtenerObra(sesion, id);
  if (!obra) notFound();

  if (!puede(sesion, "cronograma:importar")) {
    redirect(`/obras/${id}/cronograma`);
  }

  const historial = await historialCronogramas(sesion, id);

  /**
   * Si la obra YA tiene presupuesto, hay un camino mas corto que esta pantalla
   * y hasta hoy no se decia aqui.
   *
   * El flujo empuja a «Cargar cronograma» y aqui solo habia una plantilla con
   * ejemplos inventados, asi que quien acababa de cargar su presupuesto se
   * ponia a teclear otra vez la misma estructura. El generador vive en la
   * pantalla anterior y ademas hace algo que ningun viaje por Excel puede
   * hacer: deja cada tarea ENLAZADA con su partida.
   */
  const { totalPartidas } = await listarPartidas(sesion, id);
  const puedeGenerar = totalPartidas > 0 && puede(sesion, "cronograma:editar");

  return (
    <div className="space-y-6">
      <div>
        <Volver href={`/obras/${id}/cronograma`}>Volver al cronograma</Volver>

        <h2 className="mt-3 text-xl font-semibold tracking-tight">
          Cargar cronograma
        </h2>
        <p className="mt-1 text-sm opacity-70">
          MS Project manda sobre el plan; GCM, sobre el avance real. Cargar un
          corte nuevo actualiza fechas, duraciones y porcentaje planeado sin
          tocar nada de lo que se haya reportado desde obra.
        </p>
      </div>

      <AvisoSinEscritura />

      {/* EL CAMINO CORTO, delante de todo lo demas. Quien tiene presupuesto
          cargado no deberia teclear su estructura por segunda vez. */}
      {puedeGenerar && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
          style={{
            borderColor: "var(--color-marca)",
            backgroundColor:
              "color-mix(in oklab, var(--color-marca) 8%, transparent)",
          }}
        >
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">
              Esta obra ya tiene presupuesto: el cronograma puede salir de él
            </h3>
            <p className="mt-0.5 text-sm opacity-80">
              El presupuesto ya es la EDT. Generarlo desde ahí crea las{" "}
              {totalPartidas} partidas como capítulos, paquetes y tareas, y{" "}
              <strong>deja cada tarea enlazada con su partida</strong> —el
              trabajo que si no hay que casar a mano en «Enlazar con partidas»—.
              Solo tendrás que poner las fechas.
            </p>
          </div>
          <Link
            href={`/obras/${id}/cronograma`}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold text-white"
            style={{ backgroundColor: "var(--color-marca)" }}
          >
            <ListTree className="size-4" aria-hidden="true" />
            Generar desde el presupuesto
          </Link>
        </div>
      )}

      {/* La plantilla, antes del importador: quien llega sin MS Project
          necesita saber que existe ANTES de pelearse con su Excel. Es un <a>
          normal y no un Link: es una descarga, no una navegacion, y el
          prefetch de Link no pinta nada aqui. */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
        style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
      >
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">¿Sin MS Project? Descarga la plantilla</h3>
          <p className="mt-0.5 text-sm opacity-70">
            {totalPartidas > 0 ? (
              <>
                Viene con <strong>las {totalPartidas} partidas de tu
                presupuesto ya escritas</strong> como capítulos y tareas. Las
                fechas salen puestas al plazo de la obra, todas iguales: eso es
                un marcador, no un plan, y es justo lo que tienes que ajustar.
                Llénala, guarda y súbela aquí mismo. No trae ruta crítica: para
                eso hace falta el archivo de MS Project.
              </>
            ) : (
              <>
                Un Excel con la obra, sus capítulos y sus partidas de ejemplo, y
                las instrucciones en la segunda hoja. Llénala, guarda y súbela
                aquí mismo. No trae ruta crítica: para eso hace falta el archivo
                de MS Project.
              </>
            )}
          </p>
        </div>
        <a
          // Con presupuesto, la de ESTA obra; sin el, la generica con
          // ejemplos. Son la misma funcion con o sin argumento.
          href={
            totalPartidas > 0
              ? `/obras/${id}/cronograma/plantilla`
              : "/plantilla-cronograma"
          }
          className="inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold text-white"
          style={{ backgroundColor: "var(--color-marca-600)" }}
        >
          <FileDown className="size-4" aria-hidden="true" />
          Descargar plantilla
        </a>
      </div>

      {/* EL CAMINO DE PROJECTLIBRE. Va aparte del Excel y no como una segunda
          opcion del mismo bloque porque no es el mismo publico: aqui esta
          quien planifica con precedencias y ruta critica, y ProjectLibre no
          abre el Excel de al lado. */}
      {totalPartidas > 0 && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
          style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
        >
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">
              ¿Planificas en ProjectLibre o MS Project?
            </h3>
            <p className="mt-0.5 text-sm opacity-70">
              Descarga tu EDT en <strong>XML de MS Project</strong>: ProjectLibre
              lo abre —es gratis— y ahí pones fechas, precedencias y ruta
              crítica. Cuando termines, sube aquí mismo el resultado: se admite
              el <strong>.pod</strong> de ProjectLibre, el .mpp y el .xml.
            </p>
          </div>
          <a
            href={`/obras/${id}/cronograma/exportar-xml`}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-semibold"
            style={{ borderColor: "var(--borde)" }}
          >
            <FileDown className="size-4" aria-hidden="true" />
            Descargar XML
          </a>
        </div>
      )}

      <ImportadorCronograma
        obraId={obra.id}
        admiteProject={puedeConvertirProject()}
        // Las fechas de corte se guardan como fecha de calendario a
        // medianoche UTC, asi que el trozo ISO es el dia correcto sin pasar
        // por la zona horaria del navegador.
        cortesCargados={historial.map((c) => c.fechaCorte.toISOString().slice(0, 10))}
      />
    </div>
  );
}
