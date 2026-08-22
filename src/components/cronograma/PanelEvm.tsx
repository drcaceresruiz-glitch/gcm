import { Info, Lock, TriangleAlert } from "lucide-react";
import type { DatosEvm } from "@/services/evm.service";
import { textoSinCosto } from "@/lib/evm";
import { comparadoCon } from "@/lib/redondeo";
import { GaugeIndice } from "@/components/cronograma/GaugeIndice";
import { CurvaEvm } from "@/components/cronograma/CurvaEvm";
import { soles } from "@/utils/formato";
import { fechaLarga } from "@/utils/fechas";

/**
 * El panel de valor ganado (EVM): plazo y costo en la misma pantalla.
 *
 * Dos agujas —SPI y CPI— para leer de un vistazo si la obra va adelantada o
 * atrasada y si gasta por encima o por debajo de lo ganado; debajo, las mismas
 * cuentas en dinero (SV, CV, EAC, VAC) para el que quiera la cifra exacta; y al
 * final la curva de las tres lineas.
 *
 * Se parte en dos mitades segun el permiso: sin ver ordenes solo hay PLAZO
 * (SPI, SV). El costo (CPI, CV, EAC, AC) exige `orden:leer`, y en su lugar se
 * explica por que no esta. Ensenar medio EVM es correcto; inventar la otra
 * mitad, no.
 *
 * Y por la misma razon, las PROYECCIONES de costo (CPI, EAC, VAC) desaparecen
 * cuando el costo registrado no da para sostenerlas —`motivoSinCosto`—, con el
 * motivo escrito en su sitio. Aqui llego a anunciarse un ahorro de 634 mil
 * soles porque habia una sola orden aprobada.
 */
export function PanelEvm({ datos }: { datos: DatosEvm }) {
  const { metricas: m, verCosto } = datos;

  // Los indices se muestran con dos decimales, asi que la palabra tiene que
  // salir de esos dos decimales. Un SPI de 0.99895 se ensena como 1.00: decir
  // "atrasado" al lado de un 1.00 es contradecirse en la misma linea.
  const plazo = m.spi === null ? null : comparadoCon(m.spi, 1, 2);
  const costo = m.cpi === null ? null : comparadoCon(m.cpi, 1, 2);

  return (
    <div className="space-y-5">
      {/* Las agujas. CPI solo con permiso de costo. */}
      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        <GaugeIndice
          indice={m.spi}
          etiqueta="SPI"
          // "Por duracion" y no "SPI" a secas: EV/PV con las dos ponderadas
          // por duracion es un ratio distinto del que ponderaria por dinero
          // (que GCM no calcula), y llamarlas igual es como se pierde la
          // confianza en las cifras (mismo criterio que gerencia.service.ts).
          descripcion="Índice de plazo por duración (EV/PV). Sobre 1, adelantado."
        />
        {verCosto && m.cpi !== null ? (
          <GaugeIndice
            indice={m.cpi}
            etiqueta="CPI"
            descripcion="Índice de costo (EV/AC). Sobre 1, por debajo de lo previsto."
          />
        ) : verCosto && m.motivoSinCosto !== null ? (
          <div
            className="elevacion-1 flex flex-col items-center justify-center rounded-xl border p-4 text-center"
            style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
          >
            <TriangleAlert className="size-6 opacity-40" aria-hidden="true" />
            <p className="mt-2 text-xs font-medium opacity-80">
              CPI todavía no disponible
            </p>
            <p className="mt-1 text-xs opacity-60">
              {textoSinCosto(m.motivoSinCosto)}
            </p>
          </div>
        ) : (
          <div
            className="elevacion-1 flex flex-col items-center justify-center rounded-xl border p-4 text-center"
            style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
          >
            <Lock className="size-6 opacity-40" aria-hidden="true" />
            <p className="mt-2 text-xs opacity-60">
              El índice de costo (CPI) necesita permiso para ver órdenes de
              compra.
            </p>
          </div>
        )}
      </div>

      {/* Contra que se mide el EVM: la linea base congelada, o el corte vigente. */}
      {datos.lineaBase ? (
        <p className="text-xs opacity-70">
          PV y SPI medidos contra la{" "}
          <strong>línea base v{datos.lineaBase.version}</strong>
          {datos.lineaBase.fijadaEn
            ? ` (fijada el ${fechaLarga(datos.lineaBase.fijadaEn)})`
            : ""}
          .
        </p>
      ) : (
        <p className="text-xs opacity-60">
          Sin línea base fijada: el PV sale del corte vigente. Fija una en
          «Cortes y línea base» para congelar la referencia.
        </p>
      )}

      {/* La lectura en palabras. */}
      <p className="text-sm">
        Al corte del <strong>{fechaLarga(datos.fechaCorte)}</strong> se ha ganado{" "}
        <strong>{soles(m.ev)}</strong> de un plan de <strong>{soles(m.pv)}</strong>{" "}
        —{" "}
        {m.spi === null || plazo === null ? (
          <>aún no toca nada del plan</>
        ) : plazo === 0 ? (
          <span>justo en el plan (SPI {m.spi.toFixed(2)})</span>
        ) : plazo > 0 ? (
          <span style={{ color: "var(--color-exito)" }}>
            adelantado (SPI {m.spi.toFixed(2)})
          </span>
        ) : (
          <span style={{ color: "var(--color-peligro)" }}>
            atrasado (SPI {m.spi.toFixed(2)})
          </span>
        )}
        {verCosto && m.ac !== null && (
          <>
            {" "}y ha costado <strong>{soles(m.ac)}</strong>
            {m.cpi !== null && costo !== null && (
              <>
                {" "}—{" "}
                {costo === 0 ? (
                  <span>lo mismo que lo ganado (CPI {m.cpi.toFixed(2)})</span>
                ) : costo > 0 ? (
                  <span style={{ color: "var(--color-exito)" }}>
                    por debajo de lo ganado (CPI {m.cpi.toFixed(2)})
                  </span>
                ) : (
                  <span style={{ color: "var(--color-peligro)" }}>
                    más de lo ganado (CPI {m.cpi.toFixed(2)})
                  </span>
                )}
              </>
            )}
          </>
        )}
        .{" "}
        {m.eac !== null && (
          <>
            A este ritmo la obra terminaría costando{" "}
            <strong>{soles(m.eac)}</strong> sobre un presupuesto de{" "}
            <strong>{soles(m.bac)}</strong>.
          </>
        )}
      </p>

      {/* Las cuentas en dinero. */}
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        <Dato etiqueta="Presupuesto (BAC)" valor={soles(m.bac)} destacado />
        <Dato etiqueta="Valor planeado (PV)" valor={soles(m.pv)} />
        <Dato etiqueta="Valor ganado (EV)" valor={soles(m.ev)} destacado />
        <Dato etiqueta="% ganado del presupuesto" valor={`${m.avance.toFixed(1)}%`} />

        <Dato
          etiqueta="Variación de plazo (SV)"
          valor={conSigno(m.sv)}
          color={colorImporte(m.sv)}
        />
        {verCosto ? (
          <>
            <Dato etiqueta="Costo real (AC, órdenes aprobadas)" valor={soles(m.ac)} />
            <Dato
              etiqueta="Variación de costo (CV)"
              valor={conSigno(m.cv)}
              color={colorImporte(m.cv)}
            />
            {/* EAC y VAC solo con base: son proyecciones, no hechos. */}
            {m.eac !== null && (
              <>
                <Dato etiqueta="Costo estimado al final (EAC)" valor={soles(m.eac)} />
                <Dato
                  etiqueta="Variación al final (VAC)"
                  valor={conSigno(m.vac)}
                  color={colorImporte(m.vac)}
                />
              </>
            )}
          </>
        ) : null}
      </dl>

      {/* La curva de las tres lineas. La leyenda vive en la franja del
          cursor, dentro de la propia curva: alli cada serie sale con su color
          Y su cifra en la fecha elegida, asi que repetirla aqui seria tener
          los mismos rotulos dos veces. */}
      <CurvaEvm
        planPv={datos.planPv}
        cortesEv={datos.cortesEv}
        costoAc={datos.costoAc}
        bac={Number(m.bac) || 0}
        inicio={datos.inicio}
        fin={datos.fin}
        fechaCorte={datos.fechaCorte}
        verCosto={verCosto}
      />

      {/* Los avisos: lo que hay que saber para no leer mal las cifras. */}
      {verCosto && (
        <p className="flex items-start gap-2 text-xs opacity-70">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            El costo real es el <strong>comprometido en órdenes aprobadas</strong>,
            no lo devengado. Al principio de la obra suele ir{" "}
            <strong>por detrás</strong> de lo ejecutado —se trabaja y la orden se
            aprueba después—, y dividir por él daría un CPI y un ahorro
            engañosamente buenos; por eso esas cifras no aparecen hasta que el
            costo registrado respalde lo ganado.
          </span>
        </p>
      )}

      {verCosto && m.motivoSinCosto !== null && (
        <p className="flex items-start gap-2 text-xs opacity-70">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            <strong>Sin proyección de resultado (EAC, VAC, CPI).</strong>{" "}
            {textoSinCosto(m.motivoSinCosto)} Las cifras de plazo —SPI, SV y la
            curva— no dependen del costo y sí son válidas hoy.
          </span>
        </p>
      )}

      {datos.coberturaMapeo < 60 && (
        <p className="flex items-start gap-2 text-xs opacity-70">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            El avance se pondera por <strong>duración</strong>: una partida
            cara pesa igual que una barata, con cualquier cobertura. El mapeo
            tarea-partida cubre el {datos.coberturaMapeo.toFixed(0)}% del
            presupuesto —por debajo del 60% las cifras de costo (CPI, EAC,
            VAC) además son menos fiables, aunque el peso siga siendo el
            mismo—.
          </span>
        </p>
      )}
    </div>
  );
}

/**
 * Como se colorea un importe de variacion: verde si suma a favor, rojo si
 * resta. Cero y "sin dato" quedan sin color, que es lo neutro.
 */
function colorImporte(valor: string | null): string | undefined {
  if (valor === null) return undefined;
  const n = Number(valor);
  if (!Number.isFinite(n) || n === 0) return undefined;
  return n > 0 ? "var(--color-exito)" : "var(--color-peligro)";
}

/** "+S/ 1,234.56" / "-S/ 500.00" — el signo explicito para las variaciones. */
function conSigno(valor: string | null): string {
  if (valor === null) return "—";
  const n = Number(valor);
  const signo = Number.isFinite(n) && n > 0 ? "+" : "";
  return `${signo}${soles(valor)}`;
}

function Dato({
  etiqueta,
  valor,
  destacado,
  color,
}: {
  etiqueta: string;
  valor: string;
  destacado?: boolean;
  color?: string;
}) {
  return (
    <div
      className="rounded-lg border p-3"
      style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
    >
      <dt className="text-xs opacity-60">{etiqueta}</dt>
      <dd
        className={`mt-0.5 tabular-nums ${destacado ? "text-base font-semibold" : "text-base font-medium"}`}
        style={color ? { color } : undefined}
      >
        {valor}
      </dd>
    </div>
  );
}

