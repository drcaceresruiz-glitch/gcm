import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Download } from "lucide-react";

import { obtenerSesion } from "@/services/sesion.service";
import { obtenerObra } from "@/services/obras.service";
import {
  analisisDelEstudio,
  resumenDelEstudio,
} from "@/services/investigacion.service";
import { fechaCorta } from "@/utils/fechas";
import {
  AnalisisDelEstudio,
  PanelDelEstudio,
} from "@/components/investigacion/PanelDelEstudio";

export const metadata: Metadata = { title: "Datos para investigación" };

/**
 * La obra como instrumento de recoleccion de datos.
 *
 * SOLO PARA QUIEN OPERA GCM. No es una pantalla de gestion: no ayuda a
 * construir nada. Sirve para preparar y descargar los datos crudos de la obra
 * con destino a un analisis estadistico externo, y por eso sale de aqui la
 * radiografia completa de como trabaja una constructora —cada compromiso,
 * quien lo incumplio y por que, semana a semana—. Esa condicion no es un rol
 * que se pueda conceder desde dentro: sale de una lista del servidor.
 *
 * La pantalla explica el metodo ademas de ofrecer los botones, a proposito.
 * Quien descargue estos archivos va a tener que defender delante de un jurado
 * como se clasifico cada dato, y esa explicacion tiene que estar donde se
 * descarga, no en la cabeza de quien programo la exportacion.
 */
export default async function InvestigacionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  // Antes que nada y sin explicar por que: quien no opera GCM no tiene que
  // enterarse de que esta pantalla existe.
  if (!sesion.esOperador) redirect("/panel");

  const { id } = await params;
  const obra = await obtenerObra(sesion, id);
  if (!obra) notFound();

  const [resumen, analisis] = await Promise.all([
    resumenDelEstudio(sesion, id),
    analisisDelEstudio(sesion, id),
  ]);
  if (!resumen) notFound();

  const descargas = [
    {
      tabla: "consolidado",
      titulo: "Serie semanal consolidada",
      detalle:
        "Una fila por semana: PPC, tasa de liberación oportuna, y la media y la desviación estándar del retraso. Es el archivo de la serie temporal.",
    },
    {
      tabla: "compromisos",
      titulo: "Compromisos",
      detalle:
        "Una fila por compromiso semanal, con su cumplimiento y su causa de no cumplimiento codificada del 1 al 9.",
    },
    {
      tabla: "restricciones",
      titulo: "Restricciones",
      detalle:
        "Una fila por restricción, con el retraso de liberación en días. Es la variable continua para el análisis de capacidad.",
    },
    {
      tabla: "tareas",
      titulo: "Tareas del cronograma",
      detalle:
        "Una fila por tarea, con la desviación en días entre lo planificado y lo ejecutado. Es la variable continua más rica para medir variabilidad temporal.",
    },
    {
      tabla: "aprendizaje",
      titulo: "Aprendizaje organizacional",
      detalle:
        "Una fila por análisis de causa raíz, con la tasa de recurrencia (TRC), la latencia de reacción (LRO) y el cierre de su acción correctiva.",
    },
    {
      tabla: "diccionario",
      titulo: "Diccionario de variables",
      detalle:
        "Qué significa cada columna, su tipo de medición y su unidad. Se genera con los datos, así que no puede quedarse desfasado.",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/investigacion"
          className="text-sm underline underline-offset-2 opacity-70"
        >
          Volver a Investigación
        </Link>
        <h2 className="mt-2 text-xl font-semibold tracking-tight">
          Datos para investigación
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-pretty opacity-70">
          Exporta los datos crudos de esta obra para analizarlos en SPSS, JASP o
          Minitab. Una fila por observación, sin resumir ni agrupar: los
          promedios se calculan allí, no aquí.
        </p>
      </div>

      <PanelDelEstudio
        obraId={id}
        interrupcion={
          resumen.interrupcion
            ? resumen.interrupcion.toISOString().slice(0, 10)
            : ""
        }
        semanas={resumen.semanas.map((s) => ({
          id: s.id,
          numero: s.numero,
          indice: s.indice,
          fechaCorte: fechaCorta(s.fechaCorte),
          fase: s.fase,
          origenDatos: s.origenDatos,
          compromisos: s.compromisos,
          ppc: s.ppc,
        }))}
        pre={resumen.pre}
        post={resumen.post}
        reconstruidas={resumen.reconstruidas}
        restricciones={resumen.restricciones}
        restriccionesMedibles={resumen.restriccionesMedibles}
      />

      <AnalisisDelEstudio
        obraId={id}
        analisis={analisis.map((a) => ({
          id: a.id,
          causa: a.causa,
          registrado: fechaCorta(a.registrado),
          aperturaDeclarada: a.aperturaDeclarada
            ? a.aperturaDeclarada.toISOString().slice(0, 10)
            : "",
          cerrado: a.cerradoAt ? fechaCorta(a.cerradoAt) : "",
        }))}
      />

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Descargar</h3>
          <p className="mt-1 max-w-3xl text-sm text-pretty opacity-70">
            Archivos CSV en UTF-8 sin BOM, con punto decimal y fechas en formato
            ISO. El separador es la coma, que es lo que esperan SPSS y JASP;
            añade <code>?sep=;</code> a la dirección si vas a abrirlo antes en
            un Excel en español. Con <code>?les=2</code> se declara el límite de
            especificación en días, que viaja como columna en el archivo de
            restricciones.
          </p>
        </div>

        <ul className="grid gap-3 sm:grid-cols-2">
          {descargas.map((d) => (
            <li
              key={d.tabla}
              className="rounded-xl border p-4"
              style={{ borderColor: "var(--borde)" }}
            >
              <a
                href={`/obras/${id}/investigacion/${d.tabla}`}
                className="inline-flex items-center gap-2 text-sm font-medium underline underline-offset-2"
              >
                <Download className="size-4" aria-hidden="true" />
                {d.titulo}
              </a>
              <p className="mt-1 text-sm text-pretty opacity-70">{d.detalle}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
