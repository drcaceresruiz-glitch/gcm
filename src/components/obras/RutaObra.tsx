"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check } from "lucide-react";

/**
 * La ruta de la obra: el ciclo Last Planner como diagrama de ubicacion,
 * siempre a la vista a la izquierda del contenido.
 *
 * Las pestanas dicen A DONDE se puede ir; esto dice EN QUE PUNTO DEL CICLO
 * esta la obra y donde estas tu parado dentro de el. Son preguntas distintas:
 * la primera es navegacion, la segunda es orientacion, y hasta ahora la
 * segunda no la respondia nadie —en una subpagina profunda no habia forma de
 * saber que venia antes ni que toca despues—.
 *
 * Cada paso lleva dos estados independientes:
 * - HECHO (dado por los datos): ese paso del ciclo ya tiene algo cargado.
 * - AQUI (dado por la ruta): la pantalla abierta pertenece a ese paso.
 * Pueden coincidir o no; un check con anillo es "hecho y estas aqui".
 *
 * En pantallas anchas es un riel vertical pegajoso a la izquierda; en
 * angostas se pliega a una fila horizontal compacta arriba, porque un riel
 * lateral en un movil se come el ancho que necesita el contenido.
 *
 * Las paginas fuera del ciclo (proveedores, ordenes, editar) no marcan
 * ningun paso: el riel sigue mostrando el estado del ciclo, sin "aqui".
 */

export interface PasoRuta {
  clave: "presupuesto" | "cronograma" | "lineaBase" | "lookahead" | "planSemanal";
  titulo: string;
  /// Que responde este paso, en tres palabras ("cuanto cuesta").
  pregunta: string;
  href: string;
  hecho: boolean;
}

/** A que paso pertenece una ruta. Prefijos, del mas especifico al menos. */
function pasoDeLaRuta(ruta: string, raiz: string): PasoRuta["clave"] | null {
  if (ruta.startsWith(`${raiz}/lookahead`)) return "lookahead";
  if (ruta.startsWith(`${raiz}/plan-semanal`)) return "planSemanal";
  if (ruta.startsWith(`${raiz}/revisiones`)) return "lineaBase";
  if (ruta.startsWith(`${raiz}/cronograma`)) return "cronograma";
  // La portada de la obra ES el presupuesto; el importador tambien.
  if (ruta === raiz || ruta.startsWith(`${raiz}/importar`)) return "presupuesto";
  return null;
}

export function RutaObra({ pasos, raiz }: { pasos: PasoRuta[]; raiz: string }) {
  const ruta = usePathname();
  const actual = pasoDeLaRuta(ruta, raiz);

  if (pasos.length === 0) return null;

  return (
    <nav aria-label="Ruta de la obra" className="print:hidden">
      {/* El riel vertical, de lg hacia arriba. Pegajoso: al bajar por una
          tabla larga la ubicacion sigue a la vista, que es el encargo. */}
      <ol className="sticky top-20 hidden lg:block">
        {pasos.map((p, i) => {
          const aqui = p.clave === actual;
          const ultimo = i === pasos.length - 1;

          return (
            <li key={p.clave} className="relative pb-1 last:pb-0">
              {/* El conector con el paso siguiente, detras de los circulos. */}
              {!ultimo && (
                <span
                  aria-hidden="true"
                  className="absolute top-6 bottom-0 left-[11px] w-0.5"
                  style={{
                    backgroundColor: p.hecho
                      ? "var(--color-marca-600)"
                      : "var(--borde)",
                  }}
                />
              )}

              <Link
                href={p.href}
                aria-current={aqui ? "step" : undefined}
                className="relative flex items-start gap-2.5 rounded-lg p-1.5"
                style={{
                  backgroundColor: aqui
                    ? "color-mix(in oklab, var(--color-marca-500) 12%, transparent)"
                    : undefined,
                }}
              >
                <Circulo hecho={p.hecho} aqui={aqui} />
                <span className="min-w-0">
                  <span
                    className="block text-sm leading-5 font-semibold"
                    style={{ opacity: p.hecho || aqui ? 1 : 0.55 }}
                  >
                    {p.titulo}
                  </span>
                  <span className="block text-xs leading-4 opacity-60">
                    {aqui ? "estás aquí" : p.pregunta}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>

      {/* La version plegada para pantallas angostas: solo los circulos en
          fila, cada uno con su nombre debajo del que esta activo. */}
      <ol className="flex items-center gap-1 lg:hidden">
        {pasos.map((p, i) => {
          const aqui = p.clave === actual;
          const ultimo = i === pasos.length - 1;

          return (
            <li key={p.clave} className="flex min-w-0 items-center gap-1">
              <Link
                href={p.href}
                aria-current={aqui ? "step" : undefined}
                title={p.titulo}
                className="flex shrink-0 items-center gap-1.5 rounded-full py-1 pr-2 pl-1"
                style={{
                  backgroundColor: aqui
                    ? "color-mix(in oklab, var(--color-marca-500) 12%, transparent)"
                    : undefined,
                }}
              >
                <Circulo hecho={p.hecho} aqui={aqui} />
                {/* El nombre solo en el paso activo: los cinco titulos no
                    caben en un movil, y el activo es el que orienta. */}
                <span
                  className={`text-xs font-semibold whitespace-nowrap ${aqui ? "" : "sr-only"}`}
                >
                  {p.titulo}
                </span>
              </Link>
              {!ultimo && (
                <span
                  aria-hidden="true"
                  className="h-0.5 w-3 shrink-0 rounded-full"
                  style={{
                    backgroundColor: p.hecho
                      ? "var(--color-marca-600)"
                      : "var(--borde)",
                  }}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * El circulo de un paso: relleno con check si el paso esta hecho, hueco si
 * falta; con anillo cuando la pantalla abierta es la de ese paso. El estado
 * no vive solo en el color: el check y el anillo lo dicen en forma.
 */
function Circulo({ hecho, aqui }: { hecho: boolean; aqui: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border-2"
      style={{
        borderColor: hecho || aqui ? "var(--color-marca-600)" : "var(--borde)",
        backgroundColor: hecho ? "var(--color-marca-600)" : "var(--superficie)",
        boxShadow: aqui
          ? "0 0 0 3px color-mix(in oklab, var(--color-marca-500) 30%, transparent)"
          : undefined,
      }}
    >
      {hecho ? (
        <Check className="size-3.5" style={{ color: "#fff" }} strokeWidth={3} />
      ) : (
        <span
          className="size-1.5 rounded-full"
          style={{
            backgroundColor: aqui ? "var(--color-marca-600)" : "var(--borde)",
          }}
        />
      )}
    </span>
  );
}
