import Link from "next/link";
import { AlertTriangle, TrendingDown, TrendingUp } from "lucide-react";
import type { PresupuestoVigente } from "@/services/movimientos.service";
import { esCero, esNegativo, restar } from "@/lib/decimal";
import { soles } from "@/utils/formato";
import { CuadroCascada } from "@/components/revisiones/CuadroCascada";

/**
 * El presupuesto vigente: lo que dice la linea base, lo que le han sumado
 * los movimientos aprobados, y el resultado.
 *
 * Las dos cascadas se muestran enteras y una al lado de la otra, con el
 * mismo cuadro que la pantalla de revisiones, porque quien las revisa tiene
 * el Excel al lado y compara linea por linea. Ensenar solo la diferencia
 * obligaria a abrir otra pantalla para saber sobre que se aplica.
 */

interface Props {
  presupuesto: PresupuestoVigente;
  obraId: string;
  /// Por defecto solo se listan las partidas movidas: en CRIOCORD son 360 y
  /// casi todas tienen el ajuste en cero.
  mostrarTodas: boolean;
}

export function PanelVigente({ presupuesto, obraId, mostrarTodas }: Props) {
  const {
    version,
    cascadaBase,
    cascadaVigente,
    partidas,
    totalEntradas,
    totalSalidas,
    descuadreBase,
    codigosSinPartida,
  } = presupuesto;

  // Con el `restar` de decimal. Este componente traia su propia resta porque
  // el modulo no tenia ninguna; habia tres copias distintas repartidas por la
  // aplicacion, que es como acaban divergiendo.
  const diferencia =
    restar(cascadaVigente.presupuesto, cascadaBase.presupuesto) ?? "0.00";

  const movidas = partidas.filter((p) => !esCero(p.ajustes) || p.esAdicional);
  const visibles = mostrarTodas ? partidas : movidas;

  return (
    <div className="space-y-6">
      {!esCero(descuadreBase) && <AvisoDescuadre importe={descuadreBase} />}

      {codigosSinPartida.length > 0 && (
        <AvisoSinPartida codigos={codigosSinPartida} />
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <Cuadro titulo={`Línea base v${version}`} nota="El presupuesto contratado, congelado.">
          <CuadroCascada cascada={cascadaBase} />
        </Cuadro>

        <Cuadro
          titulo="Presupuesto vigente"
          nota="La base más los movimientos aprobados."
          destacado
        >
          <CuadroCascada cascada={cascadaVigente} />
        </Cuadro>
      </section>

      <section
        className="grid gap-px overflow-hidden rounded-xl border sm:grid-cols-3"
        style={{ borderColor: "var(--borde)", backgroundColor: "var(--borde)" }}
      >
        {/* Entradas y salidas se muestran por separado a proposito: un
            adicional y un deductivo del mismo importe no son «cero», son
            dos hechos distintos que hay que poder citar en un acta. */}
        <Dato etiqueta="Entradas aprobadas" valor={soles(totalEntradas)} />
        <Dato etiqueta="Salidas aprobadas" valor={soles(totalSalidas)} />
        <Dato
          etiqueta="Efecto en el presupuesto"
          valor={soles(diferencia)}
          tendencia={esCero(diferencia) ? null : !esNegativo(diferencia)}
        />
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold">
            {mostrarTodas ? "Todas las partidas" : "Partidas movidas"}
          </h2>

          {partidas.length > movidas.length && (
            <Link
              href={
                mostrarTodas
                  ? `/obras/${obraId}/movimientos`
                  : `/obras/${obraId}/movimientos?todas=1`
              }
              className="text-sm font-medium underline opacity-70 hover:opacity-100"
            >
              {mostrarTodas
                ? `Ver solo las ${movidas.length} movidas`
                : `Ver las ${partidas.length} partidas`}
            </Link>
          )}
        </div>

        {visibles.length === 0 ? (
          <p
            className="rounded-xl border border-dashed p-8 text-center text-sm opacity-70"
            style={{ borderColor: "var(--borde)" }}
          >
            Ningún movimiento aprobado ha tocado todavía una partida. El
            vigente es idéntico a la línea base.
          </p>
        ) : (
          <TablaVigente partidas={visibles} />
        )}
      </section>
    </div>
  );
}

/**
 * La suma de las bases no cuadra con lo que guarda la linea base.
 *
 * Es el aviso mas grave de la pantalla: significa que la copia congelada y
 * su desglose dejaron de coincidir, y entonces NINGUNA cifra de aqui es
 * fiable. Se dice sin rodeos en lugar de dejarlo en una nota al pie.
 */
function AvisoDescuadre({ importe }: { importe: string }) {
  return (
    <div
      className="flex items-start gap-3 rounded-xl border p-4"
      style={{
        borderColor: "var(--color-peligro)",
        backgroundColor:
          "color-mix(in oklab, var(--color-peligro) 12%, transparent)",
      }}
    >
      <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <div>
        <h2 className="text-sm font-semibold">
          La línea base no cuadra consigo misma
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-pretty">
          El desglose de partidas congelado difiere en {soles(importe)} del
          costo directo y los descuentos que guarda la propia línea base. No
          te fíes de ninguna cifra de esta pantalla hasta revisarlo: todo el
          vigente se apoya en esa base.
        </p>
      </div>
    </div>
  );
}

/**
 * Dinero de la linea base cuya partida ya no existe en el arbol vivo.
 *
 * Cuenta en el total pero nadie puede reconvertirlo, asi que se informa en
 * vez de esconderlo: si alguien busca esos codigos para mover dinero y no
 * los encuentra, tiene que saber por que.
 */
function AvisoSinPartida({ codigos }: { codigos: string[] }) {
  return (
    <div
      className="flex items-start gap-3 rounded-xl border p-4"
      style={{
        borderColor: "var(--color-alerta)",
        backgroundColor:
          "color-mix(in oklab, var(--color-alerta) 12%, transparent)",
      }}
    >
      <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <div>
        <h2 className="text-sm font-semibold">
          {codigos.length === 1
            ? "Una partida de la línea base ya no existe"
            : `${codigos.length} partidas de la línea base ya no existen`}
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-pretty">
          Su importe sigue contando en la base, pero no se les puede aplicar
          ningún movimiento porque no hay partida a la que apuntar:{" "}
          <span className="font-medium">{codigos.join(", ")}</span>.
        </p>
      </div>
    </div>
  );
}

function Cuadro({
  titulo,
  nota,
  destacado,
  children,
}: {
  titulo: string;
  nota: string;
  destacado?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-xl border"
      style={{
        borderColor: destacado ? "var(--color-marca-600)" : "var(--borde)",
        backgroundColor: "var(--superficie)",
      }}
    >
      <header
        className="border-b px-4 py-3"
        style={{ borderColor: "var(--borde)" }}
      >
        <h2 className="text-sm font-semibold">{titulo}</h2>
        <p className="mt-0.5 text-xs opacity-60">{nota}</p>
      </header>
      <div className="p-1.5">{children}</div>
    </section>
  );
}

function Dato({
  etiqueta,
  valor,
  tendencia,
}: {
  etiqueta: string;
  valor: string;
  /// true sube, false baja, null sin movimiento. Solo colorea el efecto en
  /// el presupuesto: entradas y salidas ya se explican por su nombre.
  tendencia?: boolean | null;
}) {
  const color =
    tendencia === null || tendencia === undefined
      ? undefined
      : tendencia
        ? "var(--color-alerta)"
        : "var(--color-exito)";

  const Icono = tendencia ? TrendingUp : TrendingDown;

  return (
    <div className="p-4" style={{ backgroundColor: "var(--superficie)" }}>
      <p className="text-xs opacity-60">{etiqueta}</p>
      <p
        className="mt-1 inline-flex items-center gap-1.5 text-lg font-semibold tabular-nums"
        style={{ color }}
      >
        {color && <Icono className="size-4" aria-hidden="true" />}
        {valor}
      </p>
    </div>
  );
}

/**
 * Base, ajustes y vigente de cada partida.
 *
 * Las tres columnas juntas son la auditoria: se ve de donde salio el dinero
 * y donde entro sin abrir ningun movimiento.
 */
function TablaVigente({ partidas }: { partidas: PresupuestoVigente["partidas"] }) {
  return (
    <div
      className="overflow-x-auto rounded-xl border"
      style={{ borderColor: "var(--borde)" }}
    >
      <table className="w-full min-w-[44rem] text-sm">
        <caption className="sr-only">
          Presupuesto por partida: importe de la línea base, ajustes de los
          movimientos aprobados e importe vigente
        </caption>
        <thead>
          <tr
            className="text-left text-xs uppercase"
            style={{
              backgroundColor:
                "color-mix(in oklab, var(--borde) 40%, transparent)",
            }}
          >
            <th scope="col" className="px-3 py-2 font-medium">Código</th>
            <th scope="col" className="px-3 py-2 font-medium">Descripción</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Base</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Ajustes</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Vigente</th>
          </tr>
        </thead>
        <tbody>
          {partidas.map((p) => (
            <tr
              key={p.wbsItemId}
              className="border-t"
              style={{ borderColor: "var(--borde)" }}
            >
              <th
                scope="row"
                className="px-3 py-2 text-left font-medium whitespace-nowrap"
              >
                {p.codigoPartida}
                {p.esAdicional && (
                  <span
                    className="ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                    style={{
                      backgroundColor:
                        "color-mix(in oklab, var(--color-marca-500) 18%, transparent)",
                    }}
                  >
                    nueva
                  </span>
                )}
              </th>
              <td className="px-3 py-2">{p.descripcion}</td>
              <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap opacity-70">
                {soles(p.base)}
              </td>
              <td
                className="px-3 py-2 text-right font-medium tabular-nums whitespace-nowrap"
                style={{
                  color: esCero(p.ajustes)
                    ? undefined
                    : esNegativo(p.ajustes)
                      ? "var(--color-alerta)"
                      : "var(--color-exito)",
                }}
              >
                {esCero(p.ajustes) ? "—" : soles(p.ajustes)}
              </td>
              <td className="px-3 py-2 text-right font-medium tabular-nums whitespace-nowrap">
                {soles(p.vigente)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
