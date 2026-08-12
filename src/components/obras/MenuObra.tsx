"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check } from "lucide-react";

/**
 * El mapa de la obra: fases, secciones y la rama abierta, en un solo sitio.
 *
 * Hasta el 12/08/2026 esto eran DOS navegaciones a la vez. Un riel lateral con
 * los cinco pasos del ciclo Last Planner y, encima del contenido, unas pestanas
 * con tres grupos. Las mismas cinco secciones aparecian en los dos, agrupadas
 * de forma distinta —el riel como ciclo lineal, las pestanas repartidas entre
 * «Plan» y «Ejecucion»—, asi que habia que aprender dos mapas del mismo
 * territorio. Y ninguno de los dos servia en media aplicacion: el riel no
 * conocia el Parte del dia, el Personal, los Movimientos, los Proveedores ni
 * las Ordenes, de modo que en esas pantallas el «diagrama de ubicacion» decia
 * donde NO estabas.
 *
 * Ahora hay un solo mapa y tiene tres niveles:
 *
 *     Fase        Plan / Ejecucion / Compras
 *       Seccion   Presupuesto, Cronograma, Parte del dia...
 *         Rama    Gantt, Informe, Semana 3...
 *
 * LA RAMA SOLO SE DESPLIEGA EN LA SECCION ABIERTA. Enseñarlas todas convertiria
 * el menu en una lista de treinta enlaces, y esconderlas siempre es lo que
 * dejaba huerfano a quien entraba en el informe o en una semana concreta: solo
 * le quedaba un «Volver».
 *
 * Cada seccion puede llevar dos marcas independientes, y no significan lo
 * mismo:
 *
 * - HECHO (check): ese paso del ciclo ya tiene algo cargado. Solo donde tiene
 *   sentido; en «Movimientos» no hay nada que dar por hecho.
 * - PENDIENTES (insignia): cuanto trabajo espera ahi. Sale de lo que GCM ya
 *   calcula para el panel «Que falta», que hasta ahora vivia en una tarjeta del
 *   tablero: el menu no sabia lo que el sistema sabia.
 */

export interface RamaMenu {
  titulo: string;
  href: string;
}

export interface SeccionMenu {
  clave: string;
  titulo: string;
  /// Que responde, en tres palabras. Se lee bajo el titulo de la seccion
  /// abierta y en el resto sirve de ayuda al pasar el raton.
  pregunta: string;
  href: string;
  /// Prefijos de ruta que pertenecen a esta seccion, ademas de `href`.
  prefijos?: string[];
  /// Solo en las secciones que son un hito del ciclo.
  hecho?: boolean;
  /// Trabajo esperando. `critico` pinta en rojo; si no, en ambar.
  pendientes?: { cuantos: number; critico: boolean } | null;
  ramas?: RamaMenu[];
}

export interface FaseMenu {
  clave: string;
  titulo: string;
  secciones: SeccionMenu[];
}

/**
 * Que seccion corresponde a la ruta abierta.
 *
 * Gana el prefijo MAS LARGO. Sin esa regla, `/obras/x/cronograma` capturaria
 * tambien `/obras/x/cronograma/informe` antes de que nadie mire si hay algo
 * mas especifico, y la raiz de la obra —que es el presupuesto— capturaria
 * todo lo demas.
 */
function seccionActiva(ruta: string, fases: FaseMenu[]): string | null {
  let ganadora: string | null = null;
  let largo = -1;

  for (const fase of fases) {
    for (const s of fase.secciones) {
      for (const p of [s.href, ...(s.prefijos ?? [])]) {
        const coincide = ruta === p || ruta.startsWith(`${p}/`);
        if (coincide && p.length > largo) {
          largo = p.length;
          ganadora = s.clave;
        }
      }
    }
  }

  return ganadora;
}

export function MenuObra({ fases }: { fases: FaseMenu[] }) {
  const ruta = usePathname();
  const actual = seccionActiva(ruta, fases);

  if (fases.length === 0) return null;

  const faseActiva =
    fases.find((f) => f.secciones.some((s) => s.clave === actual)) ?? fases[0]!;

  return (
    <nav aria-label="Secciones de la obra" className="print:hidden">
      {/* Riel vertical, de lg hacia arriba. Pegajoso: al bajar por una tabla
          de cien filas la ubicacion sigue a la vista, que es el encargo. */}
      <div className="sticky top-20 hidden lg:block">
        {fases.map((fase) => (
          <div key={fase.clave} className="mb-3 last:mb-0">
            <p className="mb-1 px-1.5 text-[11px] font-semibold tracking-wider uppercase opacity-45">
              {fase.titulo}
            </p>
            <ol>
              {fase.secciones.map((s) => (
                <li key={s.clave}>
                  <Enlace seccion={s} aqui={s.clave === actual} />
                  {/* La rama, solo aqui dentro. */}
                  {s.clave === actual && s.ramas && s.ramas.length > 0 && (
                    <ol className="mt-0.5 mb-1 ml-[19px] border-l pl-3"
                      style={{ borderColor: "var(--borde)" }}>
                      {s.ramas.map((r) => {
                        const enRama = ruta === r.href;
                        return (
                          <li key={r.href}>
                            <Link
                              href={r.href}
                              aria-current={enRama ? "page" : undefined}
                              className="block rounded py-1 text-xs"
                              style={{
                                opacity: enRama ? 1 : 0.65,
                                fontWeight: enRama ? 600 : 400,
                                color: enRama ? "var(--color-marca-600)" : undefined,
                              }}
                            >
                              {r.titulo}
                            </Link>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>

      {/* Plegado para pantallas angostas: la fase activa y sus secciones en
          una fila. Un riel lateral en un movil se come el ancho que necesita
          la tabla. */}
      <div className="lg:hidden">
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {fases.map((f) => (
            <span
              key={f.clave}
              className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium"
              style={{
                backgroundColor:
                  f.clave === faseActiva.clave
                    ? "color-mix(in oklab, var(--color-marca-500) 14%, transparent)"
                    : "transparent",
                color:
                  f.clave === faseActiva.clave ? "var(--color-marca-600)" : undefined,
                opacity: f.clave === faseActiva.clave ? 1 : 0.6,
              }}
            >
              {f.titulo}
            </span>
          ))}
        </div>
        <ol className="flex gap-1.5 overflow-x-auto pb-1">
          {faseActiva.secciones.map((s) => {
            const aqui = s.clave === actual;
            return (
              <li key={s.clave} className="shrink-0">
                <Link
                  href={s.href}
                  aria-current={aqui ? "page" : undefined}
                  className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium"
                  style={{
                    borderColor: aqui ? "var(--color-marca-600)" : "var(--borde)",
                    color: aqui ? "var(--color-marca-600)" : undefined,
                  }}
                >
                  {s.titulo}
                  <Insignia pendientes={s.pendientes} />
                </Link>
              </li>
            );
          })}
        </ol>
      </div>
    </nav>
  );
}

function Enlace({ seccion, aqui }: { seccion: SeccionMenu; aqui: boolean }) {
  return (
    <Link
      href={seccion.href}
      aria-current={aqui ? "page" : undefined}
      title={seccion.pregunta}
      className="flex items-center gap-2 rounded-lg px-1.5 py-1.5"
      style={{
        backgroundColor: aqui
          ? "color-mix(in oklab, var(--color-marca-500) 12%, transparent)"
          : undefined,
      }}
    >
      <Marca hecho={seccion.hecho} aqui={aqui} />
      <span className="min-w-0 flex-1">
        <span
          className="block truncate text-sm leading-5"
          style={{ fontWeight: aqui ? 600 : 500, opacity: aqui ? 1 : 0.8 }}
        >
          {seccion.titulo}
        </span>
        {aqui && (
          <span className="block text-xs leading-4 opacity-60">
            {seccion.pregunta}
          </span>
        )}
      </span>
      <Insignia pendientes={seccion.pendientes} />
    </Link>
  );
}

/**
 * El punto de la izquierda.
 *
 * Con check cuando la seccion es un hito del ciclo y ya esta cumplido; hueco
 * cuando es un hito que falta; y un punto pequeno y discreto cuando la seccion
 * no es un hito —Movimientos, Personal—, donde un circulo vacio se leeria como
 * «te falta esto» y no falta nada.
 */
function Marca({ hecho, aqui }: { hecho?: boolean; aqui: boolean }) {
  if (hecho === undefined) {
    return (
      <span
        aria-hidden="true"
        className="flex size-5 shrink-0 items-center justify-center"
      >
        <span
          className="size-1.5 rounded-full"
          style={{
            backgroundColor: aqui ? "var(--color-marca-600)" : "var(--borde)",
          }}
        />
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className="flex size-5 shrink-0 items-center justify-center rounded-full border-2"
      style={{
        borderColor: hecho || aqui ? "var(--color-marca-600)" : "var(--borde)",
        backgroundColor: hecho ? "var(--color-marca-600)" : "var(--superficie)",
      }}
    >
      {hecho && (
        <Check className="size-3" style={{ color: "#fff" }} strokeWidth={3} />
      )}
    </span>
  );
}

/// Cuanto trabajo espera en esa seccion. Sin nada pendiente no se pinta nada:
/// una insignia en cero es ruido que ensena a no mirar las insignias.
function Insignia({
  pendientes,
}: {
  pendientes?: { cuantos: number; critico: boolean } | null;
}) {
  if (!pendientes || pendientes.cuantos <= 0) return null;

  const color = pendientes.critico
    ? "var(--color-peligro)"
    : "var(--color-alerta)";

  return (
    <span
      className="shrink-0 rounded-full px-1.5 text-[11px] font-semibold tabular-nums"
      style={{
        color,
        backgroundColor: `color-mix(in oklab, ${color} 16%, transparent)`,
      }}
      title={`${pendientes.cuantos} pendiente(s)`}
    >
      {pendientes.cuantos}
    </span>
  );
}
