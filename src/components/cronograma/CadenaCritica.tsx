import { CheckCircle2, Circle, Flag } from "lucide-react";
import type { CadenaCritica as Cadena } from "@/lib/control-avance";
import { fechaCronograma } from "@/utils/fechas";
import { decimal } from "@/utils/formato";

/**
 * La ruta critica en secuencia.
 *
 * «25 tareas criticas» no permite decidir nada. Esto si: cuales son, en que
 * orden, cuales ya van tarde y cuantos dias de la fecha de entrega esta
 * costando cada una. Un dia perdido aqui es un dia perdido de obra; en las
 * demas tareas no es nada, y ese es justamente el error mas comun —meter
 * cuadrilla donde se ve el atraso y no donde manda—.
 */
export function CadenaCritica({ cadena }: { cadena: Cadena }) {
  if (cadena.eslabones.length === 0) {
    return (
      <p className="text-sm opacity-70">
        El archivo no marca ninguna tarea de trabajo como crítica. Puede que el
        cronograma no tenga aún la red de predecesoras completa.
      </p>
    );
  }

  const atrasoTotal = Number(cadena.atrasoAcumulado) || 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <span>
          <strong>{cadena.eslabones.length}</strong> tareas de trabajo
        </span>
        <span className="opacity-70">
          {decimal(cadena.duracionTotal)} días de cadena
        </span>
        {cadena.atrasados > 0 ? (
          <span style={{ color: "var(--color-peligro)" }}>
            <strong>{cadena.atrasados}</strong> por detrás del plan, costando ya{" "}
            <strong>{cadena.atrasoAcumulado} día(s)</strong> de la fecha de entrega
          </span>
        ) : (
          <span style={{ color: "var(--color-exito)" }}>
            Ninguna va por detrás del plan
          </span>
        )}
      </div>

      {cadena.concentracion.length > 0 && (
        <p className="text-sm opacity-70">
          Donde se concentra:{" "}
          {cadena.concentracion.slice(0, 3).map((c, i) => (
            <span key={c.capitulo}>
              {i > 0 && " · "}
              <strong>{c.capitulo}</strong> ({c.tareas})
            </span>
          ))}
          . Ahí es donde un día perdido es un día de obra perdido.
        </p>
      )}

      <ol className="space-y-2">
        {cadena.eslabones.map((e, i) => {
          const desfase = Number(e.desfase) || 0;
          const atrasado = desfase < 0;

          return (
            <li
              key={e.uid}
              className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border px-3 py-2 text-sm"
              style={{
                borderColor: atrasado ? "var(--color-peligro)" : "var(--borde)",
                backgroundColor: atrasado
                  ? "color-mix(in oklab, var(--color-peligro) 7%, transparent)"
                  : undefined,
              }}
            >
              <span className="w-6 shrink-0 text-xs tabular-nums opacity-50">
                {i + 1}
              </span>

              {e.terminado ? (
                <CheckCircle2
                  className="size-4 shrink-0"
                  style={{ color: "var(--color-exito)" }}
                  aria-label="Terminada"
                />
              ) : e.arrancado ? (
                <Flag
                  className="size-4 shrink-0"
                  style={{ color: "var(--color-peligro)" }}
                  aria-label="En curso"
                />
              ) : (
                <Circle className="size-4 shrink-0 opacity-40" aria-label="Sin arrancar" />
              )}

              <span className="min-w-0 flex-1">
                {e.codigo && (
                  <span className="mr-2 font-mono text-xs opacity-60">{e.codigo}</span>
                )}
                {e.nombre}
                {e.capitulo && (
                  <span className="block text-xs opacity-50">{e.capitulo}</span>
                )}
              </span>

              <span className="whitespace-nowrap opacity-70">
                {fechaCronograma(e.inicio)} &rarr; {fechaCronograma(e.fin)}
              </span>

              <span className="tabular-nums whitespace-nowrap opacity-70">
                {decimal(e.duracionDias)} d
              </span>

              <span className="tabular-nums whitespace-nowrap">
                <strong>{decimal(e.porcentajeReal, "")}%</strong>
                <span className="opacity-60"> de {decimal(e.porcentajePlaneado, "")}%</span>
              </span>

              {atrasado && (
                <span
                  className="font-semibold tabular-nums whitespace-nowrap"
                  style={{ color: "var(--color-peligro)" }}
                  title="Días de la fecha de entrega que está costando este eslabón"
                >
                  &minus;{e.diasAtraso} d
                </span>
              )}

              <span className="w-20 shrink-0 text-right text-xs tabular-nums opacity-50">
                día {decimal(e.acumuladoDias, "")}
              </span>
            </li>
          );
        })}
      </ol>

      {atrasoTotal > 0 && (
        <p className="text-xs opacity-60">
          Los {cadena.atrasoAcumulado} días son la suma de todos los eslabones
          atrasados, y por tanto el TECHO del retraso: los que van en ramas
          paralelas no se suman entre sí, solo cuenta la peor. La cifra sirve
          para saber cuánto hay en juego, no para fijar una fecha nueva.
        </p>
      )}
    </div>
  );
}
