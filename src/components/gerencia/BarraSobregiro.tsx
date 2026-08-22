import type { ObraConSobregiroProyectado } from "@/services/gerencia.service";

/**
 * Barras divergentes de la desviacion (comprometido% - avance fisico%) por
 * obra, para leer de un vistazo quien esta peor sin tener que recorrer la
 * lista de abajo fila por fila -que se queda, con el detalle que un grafico
 * no reemplaza (avance fisico, comprometido, nombre con enlace)-.
 *
 * SVG a mano, sin libreria: mismo patron que `CurvaS.tsx`/`GraficosPpc.tsx`
 * (viewBox fijo, escalado lineal a mano, colores del tema). Cero datos
 * nuevos: `desviacionPuntos` ya sale, con signo, de
 * `sobregiroProyectadoDeCartera`.
 */
export function BarraSobregiro({
  obras,
}: {
  obras: readonly ObraConSobregiroProyectado[];
}) {
  const conDato = obras.filter((o) => o.desviacionPuntos !== null);
  if (conDato.length === 0) return null;

  const ALTO_FILA = 26;
  const MARGEN_ARRIBA = 8;
  const MARGEN_IZQ = 140;
  const MARGEN_DER = 48;
  const ANCHO = 640;
  const alto = conDato.length * ALTO_FILA + MARGEN_ARRIBA * 2;
  const anchoUtil = ANCHO - MARGEN_IZQ - MARGEN_DER;
  const centro = MARGEN_IZQ + anchoUtil / 2;

  // El maximo absoluto decide la escala; nunca menos que el propio umbral,
  // para que una cartera entera "al dia" no estire una barra minuscula
  // hasta llenar el ancho.
  const maximo = Math.max(
    10,
    ...conDato.map((o) => Math.abs(o.desviacionPuntos ?? 0)),
  );
  const escala = anchoUtil / 2 / maximo;

  const truncar = (texto: string, largo: number) =>
    texto.length > largo ? `${texto.slice(0, largo - 1)}…` : texto;

  return (
    <svg
      viewBox={`0 0 ${ANCHO} ${alto}`}
      className="w-full"
      role="img"
      aria-label={`Desviación de sobregiro proyectado por obra, de ${conDato[0]?.obraNombre} (peor) a ${conDato[conDato.length - 1]?.obraNombre}`}
    >
      <line
        x1={centro}
        y1={0}
        x2={centro}
        y2={alto}
        stroke="var(--borde)"
        strokeWidth={1}
      />
      {conDato.map((o, i) => {
        const valor = o.desviacionPuntos ?? 0;
        const y = MARGEN_ARRIBA + i * ALTO_FILA + ALTO_FILA / 2;
        const ancho = Math.min(anchoUtil / 2, Math.abs(valor) * escala);
        const x = valor >= 0 ? centro : centro - ancho;
        const color = o.enRiesgo ? "var(--color-peligro)" : "var(--color-exito)";

        return (
          <g key={o.obraId}>
            <text
              x={MARGEN_IZQ - 10}
              y={y + 4}
              textAnchor="end"
              fontSize={11}
              fill="currentColor"
              opacity={0.75}
            >
              {truncar(o.obraNombre, 20)}
            </text>
            <rect
              x={x}
              y={y - 8}
              width={Math.max(ancho, 1)}
              height={16}
              rx={2}
              fill={color}
            />
            <text
              x={valor >= 0 ? centro + ancho + 6 : centro - ancho - 6}
              y={y + 4}
              textAnchor={valor >= 0 ? "start" : "end"}
              fontSize={11}
              fill="currentColor"
              opacity={0.8}
            >
              {valor > 0 ? "+" : ""}
              {valor.toFixed(0)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
