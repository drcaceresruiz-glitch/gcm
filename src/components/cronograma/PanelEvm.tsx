import { Info, Lock, TriangleAlert } from "lucide-react";
import type { DatosEvm } from "@/services/evm.service";
import { textoSinCosto } from "@/lib/evm";
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

  return (
    <div className="space-y-5">
      {/* Las agujas. CPI solo con permiso de costo. */}
      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        <GaugeIndice
          indice={m.spi}
          etiqueta="SPI"
          descripcion="Indice de plazo (EV/PV). Sobre 1, adelantado."
        />
        {verCosto && m.cpi !== null ? (
          <GaugeIndice
            indice={m.cpi}
            etiqueta="CPI"
            descripcion="Indice de costo (EV/AC). Sobre 1, por debajo de lo previsto."
          />
        ) : verCosto && m.motivoSinCosto !== null ? (
          <div
            className="elevacion-1 flex flex-col items-center justify-center rounded-xl border p-4 text-center"
            style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
          >
            <TriangleAlert className="size-6 opacity-40" aria-hidden="true" />
            <p className="mt-2 text-xs font-medium opacity-80">
              CPI todavia no disponible
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
              El indice de costo (CPI) necesita permiso para ver ordenes de
              compra.
            </p>
          </div>
        )}
      </div>

      {/* Contra que se mide el EVM: la linea base congelada, o el corte vigente. */}
      {datos.lineaBase ? (
        <p className="text-xs opacity-70">
          PV y SPI medidos contra la{" "}
          <strong>linea base v{datos.lineaBase.version}</strong>
          {datos.lineaBase.fijadaEn
            ? ` (fijada el ${fechaLarga(datos.lineaBase.fijadaEn)})`
            : ""}
          .
        </p>
      ) : (
        <p className="text-xs opacity-60">
          Sin linea base fijada: el PV sale del corte vigente. Fija una en
          «Cortes y linea base» para congelar la referencia.
        </p>
      )}

      {/* La lectura en palabras. */}
      <p className="text-sm">
        Al corte del <strong>{fechaLarga(datos.fechaCorte)}</strong> se ha ganado{" "}
        <strong>{soles(m.ev)}</strong> de un plan de <strong>{soles(m.pv)}</strong>{" "}
        —{" "}
        {m.spi === null ? (
          <>aun no toca nada del plan</>
        ) : m.spi >= 1 ? (
          <span style={{ color: "var(--color-exito)" }}>
            al dia o adelantado (SPI {m.spi.toFixed(2)})
          </span>
        ) : (
          <span style={{ color: "var(--color-peligro)" }}>
            atrasado (SPI {m.spi.toFixed(2)})
          </span>
        )}
        {verCosto && m.ac !== null && (
          <>
            {" "}y ha costado <strong>{soles(m.ac)}</strong>
            {m.cpi !== null && (
              <>
                {" "}—{" "}
                {m.cpi >= 1 ? (
                  <span style={{ color: "var(--color-exito)" }}>
                    por debajo de lo ganado (CPI {m.cpi.toFixed(2)})
                  </span>
                ) : (
                  <span style={{ color: "var(--color-peligro)" }}>
                    mas de lo ganado (CPI {m.cpi.toFixed(2)})
                  </span>
                )}
              </>
            )}
          </>
        )}
        .{" "}
        {m.eac !== null && (
          <>
            A este ritmo la obra terminaria costando{" "}
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
          etiqueta="Variacion de plazo (SV)"
          valor={conSigno(m.sv)}
          color={colorImporte(m.sv)}
        />
        {verCosto ? (
          <>
            <Dato etiqueta="Costo real (AC)" valor={soles(m.ac)} />
            <Dato
              etiqueta="Variacion de costo (CV)"
              valor={conSigno(m.cv)}
              color={colorImporte(m.cv)}
            />
            {/* EAC y VAC solo con base: son proyecciones, no hechos. */}
            {m.eac !== null && (
              <>
                <Dato etiqueta="Costo estimado al final (EAC)" valor={soles(m.eac)} />
                <Dato
                  etiqueta="Variacion al final (VAC)"
                  valor={conSigno(m.vac)}
                  color={colorImporte(m.vac)}
                />
              </>
            )}
          </>
        ) : null}
      </dl>

      {/* La curva de las tres lineas. */}
      <div>
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
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs">
          <Leyenda color="var(--color-marca-600)">Ganado (EV)</Leyenda>
          <Leyenda color="var(--texto)" punteada>Planeado (PV)</Leyenda>
          {verCosto && <Leyenda color="var(--color-peligro)">Costo (AC)</Leyenda>}
        </div>
      </div>

      {/* Los avisos: lo que hay que saber para no leer mal las cifras. */}
      {verCosto && (
        <p className="flex items-start gap-2 text-xs opacity-70">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            El costo real es el <strong>comprometido en ordenes aprobadas</strong>,
            no lo devengado. Al principio de la obra suele ir{" "}
            <strong>por detras</strong> de lo ejecutado —se trabaja y la orden se
            aprueba despues—, y dividir por el daria un CPI y un ahorro
            enganosamente buenos; por eso esas cifras no aparecen hasta que el
            costo registrado respalde lo ganado.
          </span>
        </p>
      )}

      {verCosto && m.motivoSinCosto !== null && (
        <p className="flex items-start gap-2 text-xs opacity-70">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            <strong>Sin proyeccion de resultado (EAC, VAC, CPI).</strong>{" "}
            {textoSinCosto(m.motivoSinCosto)} La mitad de plazo —SPI, SV y la
            curva— no depende del costo y es valida hoy.
          </span>
        </p>
      )}

      {datos.coberturaMapeo < 60 && (
        <p className="flex items-start gap-2 text-xs opacity-70">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            El avance se pondera por <strong>duracion</strong>, que es lo unico
            que trae el archivo. El mapeo tarea-partida cubre el{" "}
            {datos.coberturaMapeo.toFixed(0)}% del presupuesto; al pasar del 60%
            se podra ponderar por <strong>dinero</strong> y estas cifras
            afinaran.
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

function Leyenda({
  color,
  punteada,
  children,
}: {
  color: string;
  punteada?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className="inline-block w-7 shrink-0 rounded-full"
        style={{
          height: 4,
          ...(punteada
            ? {
                backgroundImage: `repeating-linear-gradient(to right, ${color} 0 7px, transparent 7px 12px)`,
              }
            : { backgroundColor: color }),
        }}
        aria-hidden="true"
      />
      <span className="opacity-70">{children}</span>
    </span>
  );
}
