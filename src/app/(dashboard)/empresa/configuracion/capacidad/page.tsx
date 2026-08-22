import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import { historialDeCapacidad } from "@/services/capacidad-diagnostico.service";
import {
  ambicionDelPlan,
  UMBRAL_AMBICIOSO,
  UMBRAL_SOBRECARGA,
  SEMANAS_MINIMAS,
  type SemanaCerrada,
  type NivelAmbicion,
} from "@/lib/capacidad";
import { COLOR_SEMAFORO, type Semaforo } from "@/lib/tablero";
import { Volver } from "@/components/ui/Volver";
import { Tarjeta, SeccionTarjeta } from "@/components/ui/Tarjeta";
import { fechaCorta } from "@/utils/fechas";

export const metadata: Metadata = { title: "Historial de capacidad" };

const SEMAFORO_DE_NIVEL: Record<NivelAmbicion, Semaforo> = {
  cabe: "verde",
  ambicioso: "ambar",
  sobrecarga: "rojo",
};

/**
 * Herramienta de DIAGNOSTICO, temporal — no una pantalla de negocio.
 *
 * Sin entrada en el menu ni en las migas a proposito: se llega por enlace
 * directo desde `/empresa/configuracion`. Existe para una sola pregunta:
 * los umbrales de `lib/capacidad.ts` (1.0 "cabe", 1.4 "sobrecarga") se
 * fijaron sin datos reales que los respaldaran -confirmado dos veces en
 * las auditorias del 21 y 22 de agosto de 2026-. Aqui se reconstruye, para
 * cada semana YA cerrada, la ambicion que el sistema habria mostrado en
 * ese momento (con las hasta seis semanas anteriores como historial), para
 * poder mirarla junto al PPC real de esa misma semana y juzgar a ojo si el
 * corte esta donde debe.
 *
 * Cuando la pregunta se conteste (se ajustan los umbrales, o se decide que
 * hace falta mas tiempo), esta pantalla y su servicio se pueden borrar sin
 * que nada mas dependa de ellos.
 */
export default async function CapacidadHistorialPage() {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const obras = await historialDeCapacidad(sesion);
  if (obras.length === 0) redirect("/empresa/configuracion");

  return (
    <div className="space-y-6">
      <Volver href="/empresa/configuracion">Volver a Configuración</Volver>

      <div>
        <h2 className="text-xl font-semibold tracking-tight">
          Historial de capacidad
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-pretty opacity-70">
          Herramienta de diagnóstico, no una pantalla de negocio. Por cada
          semana ya cerrada, se reconstruye la ambición que el sistema
          habría mostrado con el historial de ese momento —umbrales{" "}
          {UMBRAL_AMBICIOSO.toFixed(1)} «ambicioso» y{" "}
          {UMBRAL_SOBRECARGA.toFixed(1)} «sobrecarga»—, junto al cumplimiento
          real de esa semana. Hacen falta {SEMANAS_MINIMAS} semanas cerradas
          antes de que una obra diga algo: las primeras de cada una salen sin
          índice.
        </p>
      </div>

      {obras.map((obra) => (
        <Tarjeta key={obra.obraId}>
          <SeccionTarjeta
            primera
            titulo={obra.obraNombre}
            nota={
              obra.semanas.length === 1
                ? "1 semana cerrada"
                : `${obra.semanas.length} semanas cerradas`
            }
          >
            <div
              className="overflow-x-auto rounded-lg border"
              style={{ borderColor: "var(--borde)" }}
            >
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <thead>
                  <tr style={{ backgroundColor: "var(--superficie)" }}>
                    <th className="px-3 py-2 text-left font-medium">Semana</th>
                    <th className="px-3 py-2 text-left font-medium">Corte</th>
                    <th className="px-3 py-2 text-right font-medium">
                      Prometidos
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      Cumplidos
                    </th>
                    <th className="px-3 py-2 text-right font-medium">PPC</th>
                    <th className="px-3 py-2 text-right font-medium">
                      Índice (retroactivo)
                    </th>
                    <th className="px-3 py-2 text-center font-medium">Nivel</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Cronologico, la mas antigua primero: asi se lee la
                      historia de la obra en el mismo orden en que paso. */}
                  {[...obra.semanas]
                    .sort((a, b) => a.numero - b.numero)
                    .map((s) => {
                      const anteriores: SemanaCerrada[] = obra.semanas
                        .filter((o) => o.numero < s.numero)
                        .map((o) => ({
                          numero: o.numero,
                          comprometidos: o.comprometidos,
                          cumplidos: o.cumplidos,
                        }));
                      const ambicion = ambicionDelPlan(
                        anteriores,
                        s.comprometidos,
                      );
                      const ppc =
                        s.comprometidos === 0
                          ? null
                          : (s.cumplidos / s.comprometidos) * 100;

                      return (
                        <tr
                          key={s.numero}
                          className="border-t"
                          style={{ borderColor: "var(--borde)" }}
                        >
                          <td className="px-3 py-2 tabular-nums">{s.numero}</td>
                          <td className="px-3 py-2 opacity-80">
                            {fechaCorta(s.fechaCorte)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {s.comprometidos}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {s.cumplidos}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums opacity-80">
                            {ppc === null ? "—" : `${ppc.toFixed(0)}%`}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {ambicion === null
                              ? "—"
                              : `${ambicion.indice.toFixed(2)} (media ${ambicion.rendimiento.toFixed(1)} de ${ambicion.semanas})`}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {ambicion === null ? (
                              <span className="text-xs opacity-50">
                                sin historial
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center gap-1.5 text-xs font-medium"
                                style={{
                                  color:
                                    COLOR_SEMAFORO[
                                      SEMAFORO_DE_NIVEL[ambicion.nivel]
                                    ],
                                }}
                              >
                                <span
                                  aria-hidden="true"
                                  className="size-2 rounded-full"
                                  style={{
                                    backgroundColor:
                                      COLOR_SEMAFORO[
                                        SEMAFORO_DE_NIVEL[ambicion.nivel]
                                      ],
                                  }}
                                />
                                {ambicion.nivel}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </SeccionTarjeta>
        </Tarjeta>
      ))}
    </div>
  );
}
