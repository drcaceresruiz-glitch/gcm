import { textoSobre, type Tablero } from "@/lib/tablero-semanal";

/**
 * La rejilla del tablero: una fila por contratista, una columna por dia.
 *
 * UNA REJILLA POR FILA, no una sola rejilla gigante. Con una sola habria que
 * calcular tambien la fila de cada tarjeta, y dos compromisos del mismo
 * contratista el mismo dia se pisarian. Con una rejilla por contratista, basta
 * con decir QUE COLUMNAS ocupa cada tarjeta: las que coinciden en dia se
 * apilan solas hacia abajo, igual que dos post-it pegados uno debajo del otro.
 *
 * Pensada para leerse de lejos, proyectada en la pantalla de la sala: poco
 * texto por tarjeta, contraste ya calculado, y el dia de hoy marcado para no
 * perder el sitio a mitad de reunion.
 */

const NOMBRE_DIA = ["", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/// La primera columna es la del contratista; los dias empiezan en la 2.
const COLUMNA_DIAS = 2;

function plantilla(cuantosDias: number): string {
  return `minmax(9rem, 1.4fr) repeat(${cuantosDias}, minmax(5.5rem, 1fr))`;
}

function Tarjeta({
  t,
  columnaDesde,
  columnaHasta,
}: {
  t: Tablero["filas"][number]["tarjetas"][number];
  columnaDesde: number;
  columnaHasta: number;
}) {
  const claro = textoSobre(t.color) === "claro";
  const fondo = t.color ?? "var(--superficie-2, var(--superficie))";

  return (
    <div
      className="min-w-0 rounded-md px-2 py-1.5 text-xs leading-snug"
      style={{
        gridColumn: `${columnaDesde} / ${columnaHasta + 1}`,
        backgroundColor: fondo,
        color: claro ? "#fff" : "var(--texto)",
        border: t.color ? "none" : "1px solid var(--borde)",
        // Lo no cumplido de una semana cerrada se tacha: en la pizarra se
        // marca con una raya, y el tablero no tiene por que ser mas timido.
        textDecoration: t.cumplido === false ? "line-through" : undefined,
        opacity: t.cumplido === false ? 0.75 : 1,
      }}
      title={t.descripcion}
    >
      <span className="line-clamp-2 font-medium">{t.descripcion}</span>
      {(t.zona || t.cantidadPlan) && (
        <span className="mt-0.5 block truncate opacity-85">
          {t.zona}
          {t.zona && t.cantidadPlan ? " · " : ""}
          {t.cantidadPlan}
          {t.cantidadPlan && t.unidad ? ` ${t.unidad}` : ""}
        </span>
      )}
    </div>
  );
}

export function Rejilla({
  tablero,
  hoyIso,
}: {
  tablero: Tablero;
  hoyIso: number | null;
}) {
  const dias = tablero.dias.filter((d) => d.visible);

  // Los indices `desde`/`hasta` de la tarjeta van sobre los SIETE dias. Al
  // ocultar los no laborables vacios hay que reproyectarlos, o una tarjeta del
  // miercoles acabaria pintada en la columna del martes.
  const columnaDeIso = new Map(dias.map((d, i) => [d.iso, i + COLUMNA_DIAS]));
  const isoDeIndice = new Map(tablero.dias.map((d, i) => [i, d.iso]));

  const columnaDe = (indice: number): number | null =>
    columnaDeIso.get(isoDeIndice.get(indice) ?? -1) ?? null;

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[46rem] space-y-1">
        <div
          className="grid gap-x-1"
          style={{ gridTemplateColumns: plantilla(dias.length) }}
        >
          <div className="px-2 py-1.5 text-xs font-semibold uppercase opacity-60">
            Contratista
          </div>
          {dias.map((d) => (
            <div
              key={d.iso}
              className="px-1 py-1.5 text-center text-xs font-semibold"
              style={{
                opacity: d.laborable ? 1 : 0.55,
                borderBottom:
                  d.iso === hoyIso ? "2px solid var(--color-marca)" : undefined,
              }}
            >
              {NOMBRE_DIA[d.iso]}
              <span className="ml-1 font-normal opacity-60">
                {d.fecha.getUTCDate()}
              </span>
              {!d.laborable && (
                <span className="block text-[10px] leading-tight opacity-70">
                  no laborable
                </span>
              )}
            </div>
          ))}
        </div>

        {tablero.filas.map((fila) => {
          const sinDueno = fila.proveedorId === null;

          return (
            <div
              key={fila.proveedorId ?? "sin-contratista"}
              className="grid items-stretch gap-x-1 gap-y-1 rounded-lg py-1"
              style={{
                gridTemplateColumns: plantilla(dias.length),
                backgroundColor: "var(--superficie)",
                borderLeft: `4px solid ${sinDueno ? "var(--color-alerta)" : "var(--color-marca)"}`,
              }}
            >
              <div className="px-2 py-1 text-sm font-medium" style={{ gridColumn: 1 }}>
                {fila.nombre}
                <span className="block text-xs font-normal opacity-60">
                  {fila.tarjetas.length + fila.sinDia.length} en la semana
                  {fila.sinDia.length > 0 && ` · ${fila.sinDia.length} sin día`}
                </span>
              </div>

              {fila.tarjetas.map((t) => {
                const desde = columnaDe(t.desde);
                const hasta = columnaDe(t.hasta);
                if (desde === null || hasta === null) return null;

                return (
                  <Tarjeta
                    key={t.id}
                    t={t}
                    columnaDesde={desde}
                    columnaHasta={Math.max(desde, hasta)}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
