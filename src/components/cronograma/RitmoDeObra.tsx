import { fechaCorta } from "@/utils/fechas";
import type { RitmoDeObra as Datos } from "@/services/ritmo.service";

/**
 * A que ritmo avanza la obra, semana a semana, y quien la mueve.
 *
 * La curva S dice DONDE esta la obra; esto dice a que velocidad va. Son
 * preguntas distintas: una obra al 45% y parada tres semanas se ve en la curva
 * como una meseta que hay que interpretar, y aqui como tres barras vacias.
 *
 * Va en tabla y no en un SVG a proposito. Con una barra por semana y el
 * capitulo que mas aporto escrito al lado se lee de un vistazo, aguanta veinte
 * capitulos sin convertirse en un arcoiris ilegible, y se puede copiar a un
 * correo.
 */
export function RitmoDeObra({ datos }: { datos: Datos }) {
  const { tramos, techo } = datos;

  // Sin tramos se explica POR QUE, en vez de esconder la seccion. Una
  // pantalla que desaparece se lee como una averia, y el usuario acaba
  // preguntandose si el dato se perdio.
  if (datos.motivo !== null) {
    return (
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Ritmo de avance</h2>
        <p className="max-w-3xl text-sm text-pretty opacity-70">
          {datos.motivo === "sin-partes" ? (
            <>
              Aquí se verá cuántos puntos de obra se ganan cada semana y qué
              capítulo los pone. Todavía no hay ningún parte del día, así que no
              hay nada que medir — no es que la obra esté parada, es que aún no
              se ha reportado.
            </>
          ) : (
            <>
              Aquí se verá cuántos puntos de obra se ganan cada semana y qué
              capítulo los pone. Hace falta que <strong>cierre una semana</strong>{" "}
              para tener dos medidas que restar; con todos los partes dentro del
              mismo corte no hay ritmo que calcular todavía.
            </>
          )}
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Ritmo de avance</h2>
        <p className="mt-0.5 max-w-3xl text-sm text-pretty opacity-70">
          Cuántos puntos de obra se ganaron cada semana, según los partes del día,
          y qué capítulo los puso. La curva S dice dónde estás; esto, a qué
          velocidad vas.
        </p>
      </div>

      <div
        className="overflow-x-auto rounded-lg border"
        style={{ borderColor: "var(--borde)" }}
      >
        <table className="w-full text-sm">
          <thead style={{ backgroundColor: "var(--superficie)" }}>
            <tr className="text-left text-xs opacity-70">
              <th className="px-3 py-2 font-medium">Semana</th>
              <th className="px-3 py-2 font-medium">Ganado</th>
              <th className="px-3 py-2 text-right font-medium">Puntos</th>
              <th className="px-3 py-2 font-medium">Quién lo puso</th>
              <th className="px-3 py-2 text-right font-medium">Acumulado</th>
            </tr>
          </thead>
          <tbody>
            {tramos.map((t) => {
              // Los que de verdad aportaron. Un capitulo que no se movio no se
              // nombra: llenar la fila de ceros esconde al que si tiro.
              const motores = t.capitulos.filter((c) => c.aporte > 0).slice(0, 2);
              return (
                <tr
                  key={t.hasta.toISOString()}
                  className="border-t"
                  style={{ borderColor: "var(--borde)" }}
                >
                  <td className="px-3 py-1.5 whitespace-nowrap tabular-nums opacity-80">
                    {fechaCorta(t.desde)} – {fechaCorta(t.hasta)}
                  </td>
                  <td className="px-3 py-1.5">
                    {/* Contra el maximo de la serie, no contra 100: si la mejor
                        semana gano tres puntos, todas las barras serian
                        invisibles y la tabla no diria nada. */}
                    <div
                      className="h-2 rounded"
                      style={{
                        width:
                          techo > 0
                            ? `${Math.max(2, (t.ganado / techo) * 100)}%`
                            : "2%",
                        minWidth: "2px",
                        backgroundColor:
                          t.ganado > 0
                            ? "var(--color-marca-600)"
                            : "var(--borde)",
                      }}
                    />
                  </td>
                  <td className="px-3 py-1.5 text-right font-medium tabular-nums">
                    {t.ganado > 0 ? `+${t.ganado.toFixed(2)}` : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-xs opacity-70">
                    {motores.length === 0 ? (
                      <span style={{ color: "var(--color-alerta)" }}>
                        Nadie: semana sin avance reportado
                      </span>
                    ) : (
                      motores
                        .map((c) => `${c.capitulo} (+${c.aporte.toFixed(2)})`)
                        .join(" · ")
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums opacity-80">
                    {t.acumulado.toFixed(1)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs opacity-60">
        Los puntos son de la obra entera, ponderados por duración, igual que la
        curva S. Un capítulo pequeño que se termina entero mueve pocos puntos de
        obra aunque haya avanzado el 100 % de lo suyo.
      </p>
    </section>
  );
}
