import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpen, PenLine } from "lucide-react";
import { obtenerSesion } from "@/services/sesion.service";
import { CAPITULOS } from "@/components/manual/capitulos";

export const metadata: Metadata = { title: "Manual" };

/**
 * El indice del manual: los capitulos en el orden del trabajo real.
 *
 * Sin puerta de permisos a proposito: el manual es para TODOS los que
 * entran, y justo el que menos permisos tiene es el que mas lo necesita.
 * Cada capitulo dice para quien es; las pantallas que describe ya se
 * protegen solas.
 *
 * Los capitulos por escribir se LISTAN, marcados, en vez de esconderse:
 * el indice completo ensena el mapa del sistema aunque una parte del
 * texto aun no exista, y esconder lo que falta ensenaria a desconfiar
 * del indice.
 */
export default async function ManualPage() {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const escritos = CAPITULOS.filter((c) => c.contenido !== null).length;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight">
          <BookOpen className="size-6 opacity-70" aria-hidden="true" />
          Manual de GCM
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-pretty opacity-80">
          GCM se organiza por preguntas —cuánto cuesta, cuándo se hace, qué
          se compromete, a quién se le debe— y este manual sigue el mismo
          orden que el trabajo: el de los capítulos de abajo. Cada uno
          cuenta para quién es, la idea antes que los pasos, el recorrido de
          la primera vez y <strong>lo que sale mal</strong> — porque un
          manual que avisa dónde se tropieza vale más que uno que solo dice
          dónde pulsar.
        </p>
        <p className="mt-2 text-xs opacity-60">
          {escritos} de {CAPITULOS.length} capítulos escritos. Los demás
          están en el índice con su pregunta, para que el mapa esté completo
          desde hoy.
        </p>
      </div>

      <ol className="space-y-3">
        {CAPITULOS.map((capitulo, i) => (
          <li
            key={capitulo.slug}
            className="rounded-xl border p-4"
            style={{
              borderColor: "var(--borde)",
              backgroundColor: "var(--superficie)",
            }}
          >
            <div className="flex items-start gap-3">
              <span
                className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                style={{
                  backgroundColor:
                    "color-mix(in oklab, var(--color-marca-600) 12%, transparent)",
                  color: "var(--color-marca-600)",
                }}
                aria-hidden="true"
              >
                {i + 1}
              </span>

              <div className="min-w-0">
                {capitulo.contenido ? (
                  <Link
                    href={`/manual/${capitulo.slug}`}
                    className="text-sm font-semibold underline-offset-2 hover:underline"
                  >
                    {capitulo.titulo}
                  </Link>
                ) : (
                  <p className="inline-flex flex-wrap items-center gap-2 text-sm font-semibold">
                    <span className="opacity-70">{capitulo.titulo}</span>
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                      style={{
                        backgroundColor:
                          "color-mix(in oklab, var(--color-alerta) 15%, transparent)",
                      }}
                    >
                      <PenLine className="size-3" aria-hidden="true" />
                      Se está escribiendo
                    </span>
                  </p>
                )}

                <p className="mt-0.5 text-xs opacity-60">
                  Contesta: {capitulo.pregunta} · Para:{" "}
                  {capitulo.paraQuien}
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-pretty opacity-80">
                  {capitulo.resumen}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ol>

      <p className="text-xs leading-relaxed text-pretty opacity-60">
        Además del manual, casi todas las acciones delicadas —congelar la
        línea base, aprobar una orden, cerrar una obra— llevan su
        explicación al lado, en la propia pantalla, con lo que son y lo que
        rompen si se hacen a destiempo. El manual da el mapa; la pantalla,
        el detalle en el momento.
      </p>
    </div>
  );
}
