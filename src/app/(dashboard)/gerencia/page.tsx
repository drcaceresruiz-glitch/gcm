import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, FileWarning } from "lucide-react";
import { obtenerSesion } from "@/services/sesion.service";
import {
  adicionalesEnBorrador,
  semaforoDeCartera,
} from "@/services/gerencia.service";
import { COLOR_SEMAFORO } from "@/lib/tablero";
import { Tarjeta, SeccionTarjeta } from "@/components/ui/Tarjeta";
import { soles } from "@/utils/formato";

export const metadata: Metadata = { title: "Gerencia" };

/**
 * La cartera entera, para quien responde de todas las obras.
 *
 * Se llama «Gerencia» y NO «Tablero»: ya hay dos pantallas con ese nombre —el
 * tablero de supervision de la obra y, por poco, el Kanban— y una tercera
 * convertiria el nombre en ruido. Esta se distingue por su ambito: es de
 * EMPRESA, no de obra.
 *
 * Contesta las dos preguntas que no se ven mirando las obras de una en una:
 * que partidas criticas van tarde en la cartera —con el SPI por duracion de
 * cada obra— y cuanto hay pedido en adicionales que todavia no cuenta en
 * ningun presupuesto. Cada bloque sale de su servicio con consultas
 * acotadas: aqui no se carga un cronograma entero ni se llama nada en bucle
 * sin tope.
 */
export default async function GerenciaPage() {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  // La puerta es el ALCANCE: quien no ve toda la cartera no tiene nada que
  // hacer en una pantalla que la resume. Lo deciden los servicios; solo si
  // ambos dicen que no, esta pantalla no existe para esta sesion.
  const [semaforo, adicionales] = await Promise.all([
    semaforoDeCartera(sesion),
    adicionalesEnBorrador(sesion),
  ]);
  if (!semaforo && !adicionales) redirect("/panel");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Gerencia</h1>
        <p className="mt-1 text-sm opacity-70">
          Lo que solo se ve mirando todas las obras a la vez.
        </p>
      </div>

      {semaforo && (
        <Tarjeta>
          <SeccionTarjeta
            primera
            titulo="Semáforo de partidas críticas"
            nota="Partidas de la ruta crítica que van por detrás del plan: su atraso corre la fecha de fin de toda la obra. El SPI por duración divide el avance real entre el planeado, ponderados por la duración de cada partida; no mira el dinero ni la línea base."
          >
            {semaforo.obras.length === 0 ? (
              <p className="text-sm opacity-70">
                No hay ninguna obra viva que examinar. Las cerradas y las
                restauradas de un respaldo se quedan fuera: su historia ya no
                se corrige.
              </p>
            ) : (
              <>
                <div
                  className="rounded-lg border p-4"
                  style={{ borderColor: "var(--borde)" }}
                >
                  <p className="flex items-center gap-2 text-xs opacity-60">
                    <AlertTriangle className="size-4" aria-hidden="true" />
                    Partidas críticas por detrás del plan
                  </p>
                  <p className="mt-1 text-3xl font-semibold">
                    {semaforo.criticasAtrasadas}
                  </p>
                  <p className="mt-1 text-xs opacity-60">
                    {semaforo.obras.length === 1
                      ? "en 1 obra examinada"
                      : `en ${semaforo.obras.length} obras examinadas`}
                    {" · "}
                    {semaforo.obrasEnRojo === 1
                      ? "1 obra con el semáforo en rojo"
                      : `${semaforo.obrasEnRojo} obras con el semáforo en rojo`}
                  </p>
                </div>

                {/* Peor primero, como las ordena el servicio: la obra con mas
                    criticas atrasadas arriba y, a igualdad, la de peor indice. */}
                <ul className="divide-y" style={{ borderColor: "var(--borde)" }}>
                  {semaforo.obras.map((o) => (
                    <li key={o.obraId} className="py-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span
                            aria-hidden="true"
                            className="size-2.5 shrink-0 rounded-full"
                            style={{
                              backgroundColor: o.semaforo
                                ? COLOR_SEMAFORO[o.semaforo]
                                : "var(--borde)",
                            }}
                          />
                          <div className="min-w-0">
                            <Link
                              href={`/obras/${o.obraId}/cronograma`}
                              className="truncate text-sm font-medium underline-offset-2 hover:underline"
                            >
                              {o.obraNombre}
                            </Link>
                            <p className="text-xs opacity-60">
                              {o.sinCronograma
                                ? "Sin cronograma que medir"
                                : o.criticasAtrasadas === 0
                                  ? "Ninguna partida crítica atrasada"
                                  : o.criticasAtrasadas === 1
                                    ? "1 partida crítica atrasada"
                                    : `${o.criticasAtrasadas} partidas críticas atrasadas`}
                            </p>
                          </div>
                        </div>
                        {/* SIEMPRE «SPI por duración», nunca «SPI» a secas:
                            llamar igual a dos cuentas distintas es como se
                            pierde la confianza en las cifras. */}
                        <p className="text-sm tabular-nums">
                          {o.spiPorDuracion === null ? (
                            <span className="opacity-50">SPI por duración —</span>
                          ) : (
                            <>
                              <span className="opacity-60">SPI por duración </span>
                              <span className="font-medium">
                                {o.spiPorDuracion.toFixed(2)}
                              </span>
                            </>
                          )}
                        </p>
                      </div>

                      {o.partidas.length > 0 && (
                        <ul className="mt-2 space-y-1 pl-5">
                          {o.partidas.map((p) => (
                            <li key={p.uid} className="text-xs opacity-70">
                              <span className="font-medium">
                                {p.codigo ? `${p.codigo} ` : ""}
                                {p.nombre}
                              </span>
                              {" — "}
                              {p.diasAtraso} días de atraso
                              {p.motivo ? `. ${p.motivo}` : ""}
                            </li>
                          ))}
                          {o.criticasAtrasadas > o.partidas.length && (
                            <li className="text-xs opacity-50">
                              y{" "}
                              {o.criticasAtrasadas - o.partidas.length === 1
                                ? "1 más, que se ve"
                                : `${o.criticasAtrasadas - o.partidas.length} más, que se ven`}{" "}
                              dentro de la obra
                            </li>
                          )}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>

                {/* El recorte se DICE: un panel que oculta obras en silencio
                    se lee como «no hay nada», que es lo contrario de la
                    verdad. */}
                {semaforo.obrasVivas > semaforo.obras.length && (
                  <p className="text-xs" style={{ color: "var(--color-alerta)" }}>
                    Para no cargar el servidor se examinan {semaforo.tope} obras
                    por carga: aquí se ven {semaforo.obras.length} de las{" "}
                    {semaforo.obrasVivas} vivas. Las demás no están evaluadas,
                    que no es lo mismo que estar bien.
                  </p>
                )}

                <p className="text-xs opacity-60">
                  Cada obra enlaza a su cronograma, donde están todas sus
                  alertas —también las que aquí no salen— y el detalle de la
                  ruta crítica.
                </p>
              </>
            )}
          </SeccionTarjeta>
        </Tarjeta>
      )}

      {adicionales && (
        <Tarjeta>
          <SeccionTarjeta
            primera
            titulo="Adicionales pedidos y sin aprobar"
            nota="Dinero que ya se pidió y que todavía no cuenta en ningún presupuesto: el BAC solo suma los adicionales aprobados."
          >
            {adicionales.cuantos === 0 ? (
              <p className="text-sm opacity-70">
                No hay ningún adicional en borrador. Cuando alguien redacte
                uno, aparecerá aquí con su impacto antes de que se apruebe.
              </p>
            ) : (
              <>
                <div
                  className="rounded-lg border p-4"
                  style={{ borderColor: "var(--borde)" }}
                >
                  <p className="flex items-center gap-2 text-xs opacity-60">
                    <FileWarning className="size-4" aria-hidden="true" />
                    Impacto de la cartera si se aprobaran todos
                  </p>
                  <p className="mt-1 text-3xl font-semibold">
                    {soles(adicionales.importe)}
                  </p>
                  <p className="mt-1 text-xs opacity-60">
                    {adicionales.cuantos === 1
                      ? "1 adicional en borrador"
                      : `${adicionales.cuantos} adicionales en borrador`}
                    {" · "}
                    {adicionales.porObra.length === 1
                      ? "en 1 obra"
                      : `en ${adicionales.porObra.length} obras`}
                  </p>
                </div>

                {/* Ordenadas por impacto: lo que hay que mirar primero es lo
                    que mas dinero mueve, no la obra mas antigua. */}
                <ul className="divide-y" style={{ borderColor: "var(--borde)" }}>
                  {adicionales.porObra.map((o) => (
                    <li
                      key={o.obraId}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                    >
                      <div className="min-w-0">
                        <Link
                          href={`/obras/${o.obraId}/movimientos`}
                          className="truncate text-sm font-medium underline-offset-2 hover:underline"
                        >
                          {o.obraNombre}
                        </Link>
                        <p className="text-xs opacity-60">
                          {o.cuantos === 1
                            ? "1 adicional en borrador"
                            : `${o.cuantos} adicionales en borrador`}
                        </p>
                      </div>
                      <p className="text-sm font-medium">{soles(o.importe)}</p>
                    </li>
                  ))}
                </ul>

                <p className="text-xs opacity-60">
                  Cada obra enlaza a sus Movimientos, que es donde el adicional
                  se revisa y se aprueba. Aprobarlo es lo que lo mete en el
                  presupuesto: hasta entonces esta cifra es una intención.
                </p>
              </>
            )}
          </SeccionTarjeta>
        </Tarjeta>
      )}
    </div>
  );
}
