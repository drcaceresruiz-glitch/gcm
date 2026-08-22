import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  FileWarning,
  TrendingUp,
  ShoppingCart,
  ShieldAlert,
  Gauge,
  ClipboardCheck,
  Receipt,
} from "lucide-react";
import { obtenerSesion } from "@/services/sesion.service";
import {
  adicionalesEnBorrador,
  semaforoDeCartera,
  sobregiroProyectadoDeCartera,
  comprasPendientesDeAprobar,
  restriccionesDeCartera,
  evmDeCartera,
  confiabilidadDeCartera,
  valorizacionesDeCartera,
  UMBRAL_SOBREGIRO_PROYECTADO_PUNTOS,
} from "@/services/gerencia.service";
import { textoSinCosto } from "@/lib/evm";
import { COLOR_SEMAFORO } from "@/lib/tablero";
import type { BandaPpc } from "@/lib/plan-semanal";
import { BarraSobregiro } from "@/components/gerencia/BarraSobregiro";
import { Tarjeta, SeccionTarjeta } from "@/components/ui/Tarjeta";
import { soles } from "@/utils/formato";
import { fechaCorta } from "@/utils/fechas";

/// Mismo criterio de color que `COLOR_SEMAFORO`: verde/ambar/rojo por CSS
/// var del tema, nunca una clase de Tailwind suelta que se desincronice.
const COLOR_BANDA_PPC: Record<BandaPpc, string> = {
  bueno: "var(--color-exito)",
  flojo: "var(--color-alerta)",
  malo: "var(--color-peligro)",
};

export const metadata: Metadata = { title: "Gerencia" };

/**
 * La cartera entera, para quien responde de todas las obras.
 *
 * Se llama «Gerencia» y NO «Tablero»: ya hay dos pantallas con ese nombre —el
 * tablero de supervision de la obra y, por poco, el Kanban— y una tercera
 * convertiria el nombre en ruido. Esta se distingue por su ambito: es de
 * EMPRESA, no de obra.
 *
 * Contesta lo que no se ve mirando las obras de una en una: que partidas
 * criticas van tarde en la cartera, que obras se estan comprometiendo mas
 * rapido de lo que avanzan, como va el valor ganado y la confiabilidad del
 * plan semanal de toda la cartera, cuanto hay pedido (adicionales y
 * compras) que todavia no cuenta en ningun presupuesto, cuantas
 * valorizaciones estan vencidas, y que restricciones del Lookahead ya
 * vencieron. Cada bloque sale de su servicio con consultas acotadas: aqui
 * no se carga un cronograma entero ni se llama nada en bucle sin tope —
 * `semaforoDeCartera`, `sobregiroProyectadoDeCartera`, `evmDeCartera` y
 * `confiabilidadDeCartera` comparten ademas el mismo lote de cronograma
 * vigente (`cache()` en `gerencia.service.ts`), asi que pedirlas juntas no
 * duplica esa consulta.
 */
export default async function GerenciaPage() {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  // La puerta es el ALCANCE: quien no ve toda la cartera no tiene nada que
  // hacer en una pantalla que la resume. Lo deciden los servicios; solo si
  // las ocho dicen que no, esta pantalla no existe para esta sesion.
  const [
    semaforo,
    sobregiro,
    evm,
    adicionales,
    compras,
    confiabilidad,
    valorizaciones,
    restricciones,
  ] = await Promise.all([
    semaforoDeCartera(sesion),
    sobregiroProyectadoDeCartera(sesion),
    evmDeCartera(sesion),
    adicionalesEnBorrador(sesion),
    comprasPendientesDeAprobar(sesion),
    confiabilidadDeCartera(sesion),
    valorizacionesDeCartera(sesion),
    restriccionesDeCartera(sesion),
  ]);
  if (
    !semaforo &&
    !sobregiro &&
    !evm &&
    !adicionales &&
    !compras &&
    !confiabilidad &&
    !valorizaciones &&
    !restricciones
  ) {
    redirect("/panel");
  }

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

      {sobregiro && (
        <Tarjeta>
          <SeccionTarjeta
            primera
            titulo="Sobregiro proyectado"
            nota="Obras que se están comprometiendo más rápido de lo que avanzan: el sobregiro todavía no se nota partida por partida, pero al ritmo actual se está gestando. «Avance físico» es el mismo ponderado por duración de la ruta crítica; «comprometido» es sobre el presupuesto, no sobre lo gastado."
          >
            {sobregiro.obras.length === 0 ? (
              <p className="text-sm opacity-70">
                No hay ninguna obra viva que examinar.
              </p>
            ) : (
              <>
                <div
                  className="rounded-lg border p-4"
                  style={{ borderColor: "var(--borde)" }}
                >
                  <p className="flex items-center gap-2 text-xs opacity-60">
                    <TrendingUp className="size-4" aria-hidden="true" />
                    Obras comprometiéndose por delante de su avance
                  </p>
                  <p className="mt-1 text-3xl font-semibold">
                    {sobregiro.obrasEnRiesgo}
                  </p>
                  <p className="mt-1 text-xs opacity-60">
                    {sobregiro.obras.length === 1
                      ? "en 1 obra examinada"
                      : `en ${sobregiro.obras.length} obras examinadas`}
                    {" · "}
                    umbral de {UMBRAL_SOBREGIRO_PROYECTADO_PUNTOS} puntos de
                    diferencia
                  </p>
                </div>

                <BarraSobregiro obras={sobregiro.obras} />

                <ul className="divide-y" style={{ borderColor: "var(--borde)" }}>
                  {sobregiro.obras.map((o) => (
                    <li
                      key={o.obraId}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                    >
                      <div className="min-w-0">
                        <Link
                          href={`/obras/${o.obraId}/tablero`}
                          className="truncate text-sm font-medium underline-offset-2 hover:underline"
                        >
                          {o.obraNombre}
                        </Link>
                        <p className="text-xs opacity-60">
                          {o.avanceFisicoPct === null
                            ? "Avance físico —"
                            : `Avance físico ${o.avanceFisicoPct.toFixed(0)}%`}
                          {" · "}
                          {o.comprometidoPct === null
                            ? "Comprometido —"
                            : `Comprometido ${o.comprometidoPct.toFixed(0)}%`}
                        </p>
                      </div>
                      <p
                        className="text-sm font-medium"
                        style={{
                          color: o.enRiesgo ? "var(--color-peligro)" : undefined,
                        }}
                      >
                        {o.desviacionPuntos === null
                          ? "—"
                          : `${o.desviacionPuntos > 0 ? "+" : ""}${o.desviacionPuntos.toFixed(0)} pts`}
                      </p>
                    </li>
                  ))}
                </ul>

                {sobregiro.obrasVivas > sobregiro.obras.length && (
                  <p className="text-xs" style={{ color: "var(--color-alerta)" }}>
                    Para no cargar el servidor se examinan {sobregiro.tope} obras
                    por carga: aquí se ven {sobregiro.obras.length} de las{" "}
                    {sobregiro.obrasVivas} vivas.
                  </p>
                )}

                <p className="text-xs opacity-60">
                  Cada obra enlaza a su tablero, donde está el resto de sus
                  indicadores.
                </p>
              </>
            )}
          </SeccionTarjeta>
        </Tarjeta>
      )}

      {evm && (
        <Tarjeta>
          <SeccionTarjeta
            primera
            titulo="EVM de cartera (aproximado)"
            nota="Proxy de valor ganado, no el EVM exacto de cada obra: BAC es el presupuesto por costo directo, EV es el mismo avance físico de arriba convertido a soles, AC es lo aprobado en órdenes. CPI, EAC y VAC son una proyección y solo salen cuando hay base suficiente para sostenerla; si no, se explica el motivo en vez de inventar un número."
          >
            {evm.obras.length === 0 ? (
              <p className="text-sm opacity-70">
                No hay ninguna obra viva que examinar.
              </p>
            ) : (
              <>
                {(() => {
                  const conBase = evm.obras.filter(
                    (o) => o.metricas.motivoSinCosto === null,
                  );
                  const evTotal = conBase.reduce(
                    (n, o) => n + Number(o.metricas.ev),
                    0,
                  );
                  const acTotal = conBase.reduce(
                    (n, o) => n + Number(o.metricas.ac ?? 0),
                    0,
                  );
                  const cpiCartera = acTotal > 0 ? evTotal / acTotal : null;
                  return (
                    <div
                      className="rounded-lg border p-4"
                      style={{ borderColor: "var(--borde)" }}
                    >
                      <p className="flex items-center gap-2 text-xs opacity-60">
                        <Gauge className="size-4" aria-hidden="true" />
                        CPI de cartera (aproximado)
                      </p>
                      {cpiCartera === null ? (
                        <p className="mt-1 text-sm opacity-70">
                          Sin base para proyectar costo en ninguna obra
                          todavía.
                        </p>
                      ) : (
                        <p className="mt-1 text-3xl font-semibold">
                          {cpiCartera.toFixed(2)}
                        </p>
                      )}
                      <p className="mt-1 text-xs opacity-60">
                        {conBase.length} de {evm.obras.length} obra(s) con
                        base para proyectar costo
                      </p>
                    </div>
                  );
                })()}

                <ul className="divide-y" style={{ borderColor: "var(--borde)" }}>
                  {evm.obras.map((o) => (
                    <li key={o.obraId} className="py-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <Link
                          href={`/obras/${o.obraId}/cronograma`}
                          className="truncate text-sm font-medium underline-offset-2 hover:underline"
                        >
                          {o.obraNombre}
                        </Link>
                        <p className="text-sm tabular-nums">
                          {o.metricas.cpi === null ? (
                            <span className="opacity-50">CPI —</span>
                          ) : (
                            <>
                              <span className="opacity-60">CPI </span>
                              <span className="font-medium">
                                {o.metricas.cpi.toFixed(2)}
                              </span>
                            </>
                          )}
                        </p>
                      </div>
                      <p className="text-xs opacity-60">
                        BAC {soles(o.metricas.bac)} · EV {soles(o.metricas.ev)}
                        {" · "}
                        AC{" "}
                        {o.metricas.ac === null ? "—" : soles(o.metricas.ac)}
                      </p>
                      {o.metricas.motivoSinCosto && (
                        <p className="mt-1 text-xs opacity-50">
                          {textoSinCosto(o.metricas.motivoSinCosto)}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>

                <p className="text-xs opacity-60">
                  Cada obra enlaza a su cronograma, donde está su EVM exacto
                  —con el BAC ajustado por línea base y el AC de todas sus
                  órdenes, no este proxy de cartera—.
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

      {compras && (
        <Tarjeta>
          <SeccionTarjeta
            primera
            titulo="Compras y encargos sin aprobar"
            nota="Órdenes de compra en borrador: dinero pedido que todavía no cuenta como comprometido, eso solo pasa al aprobarlas."
          >
            {compras.cuantas === 0 ? (
              <p className="text-sm opacity-70">
                No hay ninguna orden de compra en borrador.
              </p>
            ) : (
              <>
                <div
                  className="rounded-lg border p-4"
                  style={{ borderColor: "var(--borde)" }}
                >
                  <p className="flex items-center gap-2 text-xs opacity-60">
                    <ShoppingCart className="size-4" aria-hidden="true" />
                    Impacto de la cartera si se aprobaran todas
                  </p>
                  <p className="mt-1 text-3xl font-semibold">
                    {soles(compras.importe)}
                  </p>
                  <p className="mt-1 text-xs opacity-60">
                    {compras.cuantas === 1
                      ? "1 orden en borrador"
                      : `${compras.cuantas} órdenes en borrador`}
                    {" · "}
                    {compras.porObra.length === 1
                      ? "en 1 obra"
                      : `en ${compras.porObra.length} obras`}
                  </p>
                </div>

                <ul className="divide-y" style={{ borderColor: "var(--borde)" }}>
                  {compras.porObra.map((o) => (
                    <li
                      key={o.obraId}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                    >
                      <div className="min-w-0">
                        <Link
                          href={`/obras/${o.obraId}/ordenes`}
                          className="truncate text-sm font-medium underline-offset-2 hover:underline"
                        >
                          {o.obraNombre}
                        </Link>
                        <p className="text-xs opacity-60">
                          {o.cuantas === 1
                            ? "1 orden en borrador"
                            : `${o.cuantas} órdenes en borrador`}
                        </p>
                      </div>
                      <p className="text-sm font-medium">{soles(o.importe)}</p>
                    </li>
                  ))}
                </ul>

                <p className="text-xs opacity-60">
                  Cada obra enlaza a sus Órdenes, que es donde se revisan y se
                  aprueban.
                </p>
              </>
            )}
          </SeccionTarjeta>
        </Tarjeta>
      )}

      {confiabilidad && (
        <Tarjeta>
          <SeccionTarjeta
            primera
            titulo="Confiabilidad de cartera (PPC)"
            nota="El PPC de la última semana cerrada de cada obra, no un promedio histórico: es lo que dice si el plan semanal se está cumpliendo AHORA. Verde, ámbar o rojo con el mismo umbral que usa el ritual semanal de cada obra."
          >
            {confiabilidad.obras.length === 0 ? (
              <p className="text-sm opacity-70">
                No hay ninguna obra viva que examinar.
              </p>
            ) : (
              <>
                <div
                  className="rounded-lg border p-4"
                  style={{ borderColor: "var(--borde)" }}
                >
                  <p className="flex items-center gap-2 text-xs opacity-60">
                    <ClipboardCheck className="size-4" aria-hidden="true" />
                    Obras sin ninguna semana de Plan Semanal cerrada
                  </p>
                  <p className="mt-1 text-3xl font-semibold">
                    {confiabilidad.obrasSinPlanCerrado}
                  </p>
                  <p className="mt-1 text-xs opacity-60">
                    de {confiabilidad.obras.length} obra(s) examinadas
                  </p>
                </div>

                <ul className="divide-y" style={{ borderColor: "var(--borde)" }}>
                  {confiabilidad.obras.map((o) => (
                    <li
                      key={o.obraId}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                    >
                      <div className="min-w-0">
                        <Link
                          href={`/obras/${o.obraId}/plan-semanal`}
                          className="truncate text-sm font-medium underline-offset-2 hover:underline"
                        >
                          {o.obraNombre}
                        </Link>
                        <p className="text-xs opacity-60">
                          {o.ultimo === null
                            ? "Sin ninguna semana cerrada"
                            : `Semana ${o.ultimo.numero}, cerrada el ${fechaCorta(o.ultimo.fechaCorte)}`}
                        </p>
                      </div>
                      <p
                        className="text-sm font-medium tabular-nums"
                        style={{
                          color: o.banda ? COLOR_BANDA_PPC[o.banda] : undefined,
                        }}
                      >
                        {o.ultimo?.ppc === null || o.ultimo?.ppc === undefined
                          ? "—"
                          : `PPC ${Math.round(o.ultimo.ppc)}%`}
                      </p>
                    </li>
                  ))}
                </ul>

                <p className="text-xs opacity-60">
                  Cada obra enlaza a su Plan Semanal, donde se ve el detalle
                  de compromisos y causas de no cumplimiento.
                </p>
              </>
            )}
          </SeccionTarjeta>
        </Tarjeta>
      )}

      {valorizaciones && (
        <Tarjeta>
          <SeccionTarjeta
            primera
            titulo="Valorizaciones vencidas de cartera"
            nota="Encargos vigentes con saldo por pagar, según su cadencia de valorización: fechas pactadas si las tiene, si no la cadencia del encargo, y si no el corte semanal de la obra. Esto no está en /panel: ahí solo se ve lo comprometido, nunca el estado de pago real."
          >
            {valorizaciones.obras.length === 0 ? (
              <p className="text-sm opacity-70">
                No hay ningún encargo vigente con saldo por pagar.
              </p>
            ) : (
              <>
                <div
                  className="rounded-lg border p-4"
                  style={{ borderColor: "var(--borde)" }}
                >
                  <p className="flex items-center gap-2 text-xs opacity-60">
                    <Receipt className="size-4" aria-hidden="true" />
                    Valorizaciones vencidas
                  </p>
                  <p className="mt-1 text-3xl font-semibold">
                    {valorizaciones.totalVencidas}
                  </p>
                  <p className="mt-1 text-xs opacity-60">
                    {valorizaciones.obras.length === 1
                      ? "en 1 obra con saldo por pagar"
                      : `en ${valorizaciones.obras.length} obras con saldo por pagar`}
                  </p>
                </div>

                <ul className="divide-y" style={{ borderColor: "var(--borde)" }}>
                  {valorizaciones.obras.map((o) => (
                    <li
                      key={o.obraId}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                    >
                      <div className="min-w-0">
                        <Link
                          href={`/obras/${o.obraId}/valorizaciones`}
                          className="truncate text-sm font-medium underline-offset-2 hover:underline"
                        >
                          {o.obraNombre}
                        </Link>
                        <p className="text-xs opacity-60">
                          {o.vencidas === 0
                            ? "ninguna vencida"
                            : o.vencidas === 1
                              ? "1 vencida"
                              : `${o.vencidas} vencidas`}
                          {" · "}
                          {o.pendientes === 1
                            ? "1 pendiente"
                            : `${o.pendientes} pendientes`}
                        </p>
                      </div>
                      <p
                        className="text-sm font-medium"
                        style={{
                          color:
                            o.vencidas > 0 ? "var(--color-peligro)" : undefined,
                        }}
                      >
                        {soles(o.porPagarTotal)}
                      </p>
                    </li>
                  ))}
                </ul>

                <p className="text-xs opacity-60">
                  Cada obra enlaza a sus Valorizaciones, donde se ve el
                  detalle por encargo.
                </p>
              </>
            )}
          </SeccionTarjeta>
        </Tarjeta>
      )}

      {restricciones && (
        <Tarjeta>
          <SeccionTarjeta
            primera
            titulo="Restricciones de Lookahead vencidas"
            nota="Restricciones sin resolver cuya fecha de compromiso ya pasó, o está por pasar: son la razón por la que una obra no va a poder cumplir su próximo plan semanal."
          >
            {restricciones.vencidas.length === 0 &&
            restricciones.porVencer.length === 0 ? (
              <p className="text-sm opacity-70">
                No hay ninguna restricción vencida ni por vencer.
              </p>
            ) : (
              <>
                <div
                  className="rounded-lg border p-4"
                  style={{ borderColor: "var(--borde)" }}
                >
                  <p className="flex items-center gap-2 text-xs opacity-60">
                    <ShieldAlert className="size-4" aria-hidden="true" />
                    Restricciones vencidas
                  </p>
                  <p className="mt-1 text-3xl font-semibold">
                    {restricciones.totalVencidas}
                  </p>
                  <p className="mt-1 text-xs opacity-60">
                    {restricciones.porVencer.length === 0
                      ? "ninguna por vencer en los próximos días"
                      : restricciones.porVencer.length === 1
                        ? "1 más por vencer en los próximos días"
                        : `${restricciones.porVencer.length} más por vencer en los próximos días`}
                  </p>
                </div>

                {[...restricciones.vencidas, ...restricciones.porVencer].length >
                  0 && (
                  <ul className="divide-y" style={{ borderColor: "var(--borde)" }}>
                    {[...restricciones.vencidas, ...restricciones.porVencer].map(
                      (r) => (
                        <li
                          key={r.id}
                          className="flex flex-wrap items-center justify-between gap-3 py-3"
                        >
                          <div className="min-w-0">
                            <Link
                              href={`/obras/${r.obraId}/lookahead`}
                              className="truncate text-sm font-medium underline-offset-2 hover:underline"
                            >
                              {r.obraNombre}
                            </Link>
                            <p className="text-xs opacity-60">
                              {r.tipo}
                              {r.detalle ? ` — ${r.detalle}` : ""}
                            </p>
                          </div>
                          <p
                            className="text-sm font-medium"
                            style={{
                              color:
                                r.diasVencida > 0
                                  ? "var(--color-peligro)"
                                  : "var(--color-alerta)",
                            }}
                          >
                            {r.diasVencida > 0
                              ? `vencida hace ${r.diasVencida} día(s)`
                              : `vence el ${fechaCorta(r.fechaCompromiso)}`}
                          </p>
                        </li>
                      ),
                    )}
                  </ul>
                )}

                <p className="text-xs opacity-60">
                  Cada obra enlaza a su Lookahead, donde se ve la tarea
                  completa y se levanta la restricción.
                </p>
              </>
            )}
          </SeccionTarjeta>
        </Tarjeta>
      )}
    </div>
  );
}
