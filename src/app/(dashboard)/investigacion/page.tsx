import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FlaskConical } from "lucide-react";

import { obtenerSesion } from "@/services/sesion.service";
import {
  obraPilotoExistente,
  obrasDelEstudio,
} from "@/services/investigacion.service";
import { fechaCorta } from "@/utils/fechas";
import { ObraDeEnsayo } from "@/components/investigacion/PanelDelEstudio";

export const metadata: Metadata = { title: "Investigación" };

/**
 * La investigacion, por encima de las obras.
 *
 * EXISTE POR UN CALLEJON SIN SALIDA. La obra de ensayo se creaba desde la
 * pantalla de investigacion de una obra, asi que para generarla habia que
 * entrar en una obra... y quien todavia no tiene ninguna no podia llegar. Un
 * boton al que no se puede llegar es un boton que no existe.
 *
 * Aqui vive lo que es transversal -crear la obra de ensayo, ver que obras
 * participan en un estudio- y desde cada fila se entra a los datos de esa
 * obra. Solo para quien opera GCM, como todo lo demas del estudio.
 */
export default async function InvestigacionPage() {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");
  if (!sesion.esOperador) redirect("/panel");

  const [obras, piloto] = await Promise.all([
    obrasDelEstudio(sesion),
    obraPilotoExistente(sesion),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Investigación</h1>
        <p className="mt-1 max-w-3xl text-sm text-pretty opacity-70">
          Preparar una obra como instrumento de medición y descargar sus datos
          crudos para analizarlos en SPSS, JASP o Minitab. Una fila por
          observación, sin resumir: los promedios se calculan allí, no aquí.
        </p>
      </div>

      <ObraDeEnsayo existente={piloto?.id ?? null} />

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Obras</h2>

        {obras.length === 0 ? (
          <p
            className="rounded-xl border border-dashed p-6 text-sm text-pretty opacity-70"
            style={{ borderColor: "var(--borde)" }}
          >
            Todavía no hay ninguna obra. Puedes empezar creando la obra de
            ensayo de aquí arriba: trae veinte semanas simuladas y permite
            probar el análisis completo sin esperar a que una obra real acumule
            datos.
          </p>
        ) : (
          <ul className="space-y-2">
            {obras.map((o) => (
              <li
                key={o.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
                style={{ borderColor: "var(--borde)" }}
              >
                <div>
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {o.esPiloto && (
                      <FlaskConical className="size-4 shrink-0 opacity-60" aria-hidden="true" />
                    )}
                    {o.nombre}
                  </p>
                  <p className="mt-0.5 text-xs opacity-70">
                    {o.semanas === 0
                      ? "sin semanas planificadas"
                      : `${o.semanas} ${o.semanas === 1 ? "semana" : "semanas"}`}
                    {" · "}
                    {o.interrupcion
                      ? `interrupción el ${fechaCorta(o.interrupcion)}`
                      : "sin punto de interrupción"}
                  </p>
                </div>

                <Link
                  href={`/obras/${o.id}/investigacion`}
                  className="text-sm font-medium underline underline-offset-2"
                >
                  Datos crudos
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
